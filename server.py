#!/usr/bin/env python3
# Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
"""Lion Telescope Studio - the sky as the world's open telescopes see it.

One stdlib-only file (+ votable.py). Serves static/ and a set of CACHED, FIXED-URL upstream
endpoints. It is NOT an open proxy: every upstream URL is a hard-coded template and every
user-supplied parameter is validated (numbers clamped, names pattern-checked) before use.

Sky tiles (HiPS) are fetched by the browser straight from the CDS / ESA / NASA / ASTRON / CSIRO
HiPS servers through Aladin Lite; this server never touches them.

Upstreams (all keyless):
  CDS Sesame (name resolver)        cache 30 days per name, <= 2 new lookups/s server-wide
  CDS SIMBAD TAP                    point report, cache 7 days per cone
  ESA Gaia DR3 TAP                  point report, cache 7 days per cone
  NASA Exoplanet Archive TAP        point report, cache 7 days per cone
  STScI MAST (CAOM cone)            point report: HST, JWST, TESS, GALEX, Kepler, PS1 ... cache 1 day
  ESO archive ObsCore TAP           point report: VLT, VISTA, VST, ALMA, APEX ... cache 1 day
  NASA HEASARC TAP (master index)   point report: Chandra, XMM, Swift, NuSTAR, NICER, IXPE, XRISM ... cache 1 day
  LIGO/Virgo/KAGRA GraceDB          public superevents, cache 10 min; sky maps (multi-order FITS) cached forever
  NASA HEASARC fermigtrig           Fermi GBM triggers (GRBs, flares, TGFs), cache 15 min
  ALeRCE (ZTF broker)               recent supernova candidates, cache 30 min
  NASA SDO (latest images)          cache 15 min per channel
  NOAA SWPC JSON                    GOES X-ray flux + flares, Kp, cache 5 min
  CelesTrak GP data                 cache >= 2 h per group (CelesTrak asks for <= 1 download / 2 h)
  JPL Horizons API                  JWST / Euclid / Gaia / SOHO positions, cache 6 h
  STScI JWST observing schedules    weekly plain-text schedule, cache 6 h
  Chandra X-ray Center              short-term schedule page, cache 1 h
"""
import datetime as dt
import gzip
import hashlib
import json
import math
import os
import posixpath
import re
import socket
import ssl
import struct
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import votable  # noqa: E402

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
CACHE = os.path.abspath(os.path.expanduser(os.environ.get("SKY_CACHE_DIR", os.path.join(ROOT, "cache"))))
HOST = os.environ.get("SKY_HOST", "127.0.0.1")   # 0.0.0.0 to serve your LAN; see README "Configuration"
PORT = int(os.environ.get("SKY_PORT", "8650"))
UA = "LionTelescopeStudio/1.0 (open-data sky viewer; contact via github.com/sunnychase)"
START_TIME = time.time()
POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="up")


def log(*a):
    print(time.strftime("%Y-%m-%dT%H:%M:%S"), *a, flush=True)


def iso(t):
    if isinstance(t, (int, float)):
        t = dt.datetime.fromtimestamp(t, dt.timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def mjd_now():
    return time.time() / 86400.0 + 40587.0


def mjd_iso(m):
    try:
        return iso((float(m) - 40587.0) * 86400.0)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- status
STATUS_LOCK = threading.Lock()
STATUS = {}
UPSTREAM_HITS = {}


def set_status(name, state, **kw):
    with STATUS_LOCK:
        s = STATUS.setdefault(name, {})
        if state == "ok":
            s.pop("error", None)
        s["state"] = state
        s["updated"] = iso(time.time())
        for k, v in kw.items():
            s[k] = str(v)[:300] if isinstance(v, str) else v


def get_status():
    with STATUS_LOCK:
        return json.loads(json.dumps(STATUS))


# --------------------------------------------------------------------------- http client
class Upstream(Exception):
    pass


def http_get(url, headers=None, timeout=45, max_bytes=60 * 2**20, data=None, source="?"):
    h = {"User-Agent": UA, "Accept-Encoding": "gzip"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h, data=data)
    UPSTREAM_HITS[source] = UPSTREAM_HITS.get(source, 0) + 1
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(max_bytes + 1)
            rh = r.headers
    except urllib.error.HTTPError as e:
        body = e.read(4000) if e.fp else b""
        if e.headers.get("Content-Encoding") == "gzip":
            try:
                body = gzip.decompress(body)
            except Exception:
                pass
        raise Upstream(f"HTTP {e.code}: {body[:160].decode('utf-8', 'replace')}") from None
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, ssl.SSLError) as e:
        raise Upstream(f"network: {getattr(e, 'reason', e)}") from None
    if len(body) > max_bytes:
        raise Upstream("response too large")
    if rh.get("Content-Encoding") == "gzip":
        body = gzip.decompress(body)
    return body, rh


def tap(base, adql, source, timeout=60, maxrec=None):
    form = {"REQUEST": "doQuery", "LANG": "ADQL", "QUERY": adql}
    if maxrec:
        form["MAXREC"] = str(maxrec)
    body, _ = http_get(base.rstrip("/") + "/sync", data=urllib.parse.urlencode(form).encode(), timeout=timeout,
                       headers={"Content-Type": "application/x-www-form-urlencoded"}, source=source)
    try:
        _, rows = votable.parse(body)
    except ValueError as e:
        raise Upstream(f"{source}: {e}") from None
    except ET.ParseError:
        raise Upstream(f"{source}: unreadable VOTable") from None
    return rows


# --------------------------------------------------------------------------- disk cache
def atomic_write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp%d.%d" % (os.getpid(), threading.get_ident())
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


class Unavailable(Exception):
    def __init__(self, msg, retry=300):
        super().__init__(msg)
        self.retry = retry


class Cached:
    """A disk-cached upstream resource (stored gzip-compressed JSON or bytes).

    get() -> (gz_bytes, meta). Fresh -> cache. Stale -> cache while ONE background refresh runs.
    Missing -> one synchronous fetch (concurrent callers wait on the lock, then read the result).
    """

    def __init__(self, name, path, ttl, fetch, err_backoff=600, source=None):
        self.name, self.path, self.ttl, self.fetch = name, path, ttl, fetch
        self.err_backoff, self.source = err_backoff, source or name
        self.lock = threading.Lock()
        self.refreshing = False
        self.mem, self.mem_mtime = None, 0
        self.last_err_at, self.last_err = 0, None

    def mtime(self):
        try:
            return os.path.getmtime(self.path)
        except OSError:
            return None

    def _refresh(self):
        with self.lock:
            m = self.mtime()
            if m is not None and time.time() - m < self.ttl:
                return
            try:
                raw = self.fetch()
                if raw is None:
                    if m is not None:
                        os.utime(self.path, None)
                else:
                    atomic_write(self.path, gzip.compress(raw, 6))
                self.last_err = None
                set_status(self.source, "ok", fetched=iso(time.time()))
            except Exception as e:
                self.last_err_at = time.time()
                self.last_err = str(e)[:300]
                set_status(self.source, "error", error=self.last_err)
                log("refresh failed", self.name, self.last_err)
            finally:
                self.refreshing = False

    def get(self):
        m = self.mtime()
        hit = "hit"
        if m is None:
            if time.time() - self.last_err_at < self.err_backoff:
                raise Unavailable(self.last_err or "upstream unavailable",
                                  int(self.err_backoff - (time.time() - self.last_err_at)))
            self._refresh()
            m = self.mtime()
            hit = "miss"
            if m is None:
                raise Unavailable(self.last_err or "upstream unavailable", self.err_backoff)
        elif time.time() - m >= self.ttl and not self.refreshing and time.time() - self.last_err_at >= self.err_backoff:
            self.refreshing = True
            threading.Thread(target=self._refresh, daemon=True).start()
            hit = "stale"
        m = self.mtime()
        if self.mem is None or m != self.mem_mtime:
            with open(self.path, "rb") as f:
                self.mem = f.read()
            self.mem_mtime = m
        return self.mem, {"fetched": iso(m), "age_s": int(time.time() - m), "cache": hit}

    def json(self):
        gz, meta = self.get()
        return json.loads(gzip.decompress(gz)), meta


def jbytes(obj):
    return json.dumps(obj, separators=(",", ":")).encode()


KEYED = {}
KEYED_LOCK = threading.Lock()


def keyed(kind, key, ttl, fetch, source, err_backoff=120, cap=4000):
    """A Cached per (kind, key) - point lookups, names, sky maps. Disk files live under cache/<kind>/."""
    h = hashlib.sha1(key.encode()).hexdigest()[:24]
    k = kind + ":" + h
    with KEYED_LOCK:
        c = KEYED.get(k)
        if c is None:
            if len(KEYED) > cap:
                KEYED.clear()
            c = KEYED[k] = Cached(k, os.path.join(CACHE, kind, h + ".json.gz"), ttl, fetch,
                                  err_backoff=err_backoff, source=source)
    return c


# --------------------------------------------------------------------------- name resolver (Sesame)
NAME_RE = re.compile(r"^[A-Za-z0-9 +\-_.:'()*/\[\]]{1,80}$")
SESAME_LOCK = threading.Lock()
SESAME_LAST = [0.0]


def resolve_name(q):
    q = " ".join(q.split())
    if not NAME_RE.match(q):
        raise ValueError("unsupported characters in name")

    def fetch():
        with SESAME_LOCK:
            wait = 0.5 - (time.time() - SESAME_LAST[0])
            if wait > 0:
                time.sleep(wait)
            SESAME_LAST[0] = time.time()
        body, _ = http_get("https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?" + urllib.parse.quote(q),
                           timeout=20, source="sesame")
        root = ET.fromstring(body)
        out = {"query": q, "found": False}
        for res in root.iter("Resolver"):
            ra, de = res.findtext("jradeg"), res.findtext("jdedeg")
            if ra and de:
                out.update(found=True, ra=float(ra), dec=float(de), name=(res.findtext("oname") or q).strip(),
                           otype=(res.findtext("otype") or "").strip(), resolver=res.get("name", ""))
                break
        return jbytes(out)
    return keyed("resolve", q.lower(), 30 * 86400, fetch, "sesame").get()


# --------------------------------------------------------------------------- point report
def cone(ra, dec, r_deg):
    return "CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',%.6f,%.6f,%.6f))=1" % (ra, dec, r_deg)


def p_simbad(ra, dec, r):
    rows = tap("https://simbad.cds.unistra.fr/simbad/sim-tap",
               "SELECT TOP 40 main_id, ra, dec, basic.otype, otypedef.description, sp_type, rvz_redshift, plx_value, "
               "galdim_majaxis, DISTANCE(POINT('ICRS',ra,dec),POINT('ICRS',%.6f,%.6f)) AS d "
               "FROM basic LEFT JOIN otypedef ON basic.otype=otypedef.otype WHERE %s ORDER BY d" % (ra, dec, cone(ra, dec, r)),
               "simbad", timeout=30)
    for x in rows:
        x["d_arcsec"] = round(x.pop("d", 0) * 3600, 1) if x.get("d") is not None else None
    return {"objects": rows}


def p_gaia(ra, dec, r):
    rows = tap("https://gea.esac.esa.int/tap-server/tap",
               "SELECT TOP 40 source_id, ra, dec, phot_g_mean_mag, bp_rp, parallax, parallax_error, radial_velocity, "
               "teff_gspphot, pmra, pmdec FROM gaiadr3.gaia_source WHERE %s ORDER BY phot_g_mean_mag" % cone(ra, dec, r),
               "gaia", timeout=45)
    for x in rows:
        x["source_id"] = str(x.get("source_id"))
        p, pe = x.get("parallax"), x.get("parallax_error")
        x["dist_ly"] = round(3261.56 / p, 1) if (p and pe and p > 0 and p / pe > 5) else None
    return {"stars": rows}


def p_exo(ra, dec, r):
    rows = tap("https://exoplanetarchive.ipac.caltech.edu/TAP",
               "SELECT pl_name, hostname, ra, dec, sy_dist, pl_rade, pl_bmasse, pl_orbper, pl_eqt, disc_year, "
               "discoverymethod, disc_facility FROM pscomppars WHERE %s" % cone(ra, dec, max(r, 1 / 60.0)), "exoplanets",
               timeout=40)
    rows.sort(key=lambda x: (x.get("hostname") or "", x.get("pl_orbper") or 0))
    return {"planets": rows[:60]}


MAST_URL = "https://mast.stsci.edu/api/v0/invoke"


def mast(service, params, pagesize=5000, timeout=100):
    req = {"service": service, "params": params, "format": "json", "pagesize": pagesize, "page": 1}
    body, _ = http_get(MAST_URL, data=urllib.parse.urlencode({"request": json.dumps(req)}).encode(), timeout=timeout,
                       headers={"Content-Type": "application/x-www-form-urlencoded"}, source="mast", max_bytes=80 * 2**20)
    d = json.loads(body)
    if d.get("status") not in ("COMPLETE", None):
        raise Upstream("mast: " + str(d.get("msg") or d.get("status"))[:160])
    return d.get("data") or []


def p_mast(ra, dec, r):
    rows = mast("Mast.Caom.Cone", {"ra": ra, "dec": dec, "radius": r})
    by = {}
    previews = []
    for x in rows:
        c = x.get("obs_collection") or "?"
        b = by.setdefault(c, {"collection": c, "n": 0, "instruments": {}, "first": None, "last": None, "targets": {}})
        b["n"] += 1
        ins = x.get("instrument_name") or "?"
        b["instruments"][ins] = b["instruments"].get(ins, 0) + 1
        t = x.get("t_min")
        if isinstance(t, (int, float)):
            b["first"] = t if b["first"] is None else min(b["first"], t)
            b["last"] = t if b["last"] is None else max(b["last"], t)
        tn = x.get("target_name")
        if tn and tn.upper() not in ("UNKNOWN", "NONE", "ANY"):
            b["targets"][tn] = b["targets"].get(tn, 0) + 1
        j = x.get("jpegURL")
        if j and c in ("HST", "JWST", "HLA", "HLSP") and x.get("dataproduct_type") == "image":
            previews.append({"collection": c, "instrument": ins, "target": tn, "t": t, "filters": x.get("filters"),
                             "jpeg": ("https://mast.stsci.edu/portal/Download/file?uri=" + urllib.parse.quote(j, safe=""))
                             if j.startswith("mast:") else j, "obs_id": x.get("obs_id")})
    out = []
    for b in by.values():
        b["first_utc"], b["last_utc"] = mjd_iso(b["first"]), mjd_iso(b["last"])
        b["instruments"] = sorted(b["instruments"].items(), key=lambda kv: -kv[1])[:6]
        b["targets"] = [k for k, _ in sorted(b["targets"].items(), key=lambda kv: -kv[1])[:4]]
        out.append(b)
    out.sort(key=lambda b: -b["n"])
    previews.sort(key=lambda p: -(p["t"] or 0))
    seen, pv = set(), []
    for p in previews:
        k = (p["collection"], p["instrument"], p["filters"])
        if k in seen:
            continue
        seen.add(k)
        p["t_utc"] = mjd_iso(p["t"])
        pv.append(p)
        if len(pv) >= 8:
            break
    return {"total": len(rows), "truncated": len(rows) >= 5000, "collections": out, "previews": pv}


ESO_NAMES = {"ALMA": "ALMA (Chajnantor)", "MUSE": "VLT · MUSE", "FORS2": "VLT · FORS2", "UVES": "VLT · UVES",
             "XSHOOTER": "VLT · X-shooter", "SPHERE": "VLT · SPHERE", "KMOS": "VLT · KMOS", "HAWKI": "VLT · HAWK-I",
             "ERIS": "VLT · ERIS", "CRIRES": "VLT · CRIRES+", "ESPRESSO": "VLT · ESPRESSO", "GRAVITY": "VLTI · GRAVITY",
             "MATISSE": "VLTI · MATISSE", "PIONIER": "VLTI · PIONIER", "VIRCAM": "VISTA · VIRCAM", "OMEGACAM": "VST · OmegaCAM",
             "HARPS": "3.6m · HARPS", "FEROS": "MPG 2.2m · FEROS", "WFI": "MPG 2.2m · WFI", "APEXBOL": "APEX · bolometers",
             "APEXHET": "APEX · heterodyne", "NAOS+CONICA": "VLT · NACO", "VISIR": "VLT · VISIR", "SINFONI": "VLT · SINFONI",
             "GIRAFFE": "VLT · FLAMES/GIRAFFE", "FLAMES": "VLT · FLAMES", "EFOSC": "NTT · EFOSC2", "SOFI": "NTT · SOFI",
             "4MOST": "VISTA · 4MOST", "NIRPS": "3.6m · NIRPS", "CRIRES+": "VLT · CRIRES+"}


def p_eso(ra, dec, r):
    rows = tap("https://archive.eso.org/tap_obs",
               "SELECT instrument_name, COUNT(*) AS n, MIN(t_min) AS t0, MAX(t_min) AS t1 FROM ivoa.ObsCore WHERE "
               "CONTAINS(POINT('ICRS',s_ra,s_dec),CIRCLE('ICRS',%.6f,%.6f,%.6f))=1 GROUP BY instrument_name" % (ra, dec, r),
               "eso", timeout=45)
    out = [{"instrument": x.get("instrument_name"), "label": ESO_NAMES.get((x.get("instrument_name") or "").upper(),
                                                                           x.get("instrument_name")),
            "n": x.get("n"), "first_utc": mjd_iso(x.get("t0")), "last_utc": mjd_iso(x.get("t1"))} for x in rows]
    out.sort(key=lambda b: -(b["n"] or 0))
    return {"instruments": out}


HEA_TABLES = {"chanmaster": ("Chandra", "X-ray"), "xmmmaster": ("XMM-Newton", "X-ray"), "swiftmastr": ("Swift", "X-ray / UV"),
              "numaster": ("NuSTAR", "hard X-ray"), "nicermastr": ("NICER (on the ISS)", "X-ray"), "ixmaster": ("IXPE", "X-ray polarimetry"),
              "xrismmastr": ("XRISM", "X-ray spectroscopy"), "erassmastr": ("eROSITA all-sky", "X-ray"), "rassmaster": ("ROSAT all-sky", "X-ray"),
              "rosmaster": ("ROSAT pointed", "X-ray"), "suzamaster": ("Suzaku", "X-ray"), "xtemaster": ("RXTE", "X-ray timing"),
              "ascamaster": ("ASCA", "X-ray"), "hitomaster": ("Hitomi", "X-ray"), "spitzmastr": ("Spitzer", "infrared"),
              "iuelog": ("IUE", "ultraviolet"), "euvemaster": ("EUVE", "extreme UV"), "iram30mlog": ("IRAM 30 m", "millimetre"),
              "exomaster": ("EXOSAT", "X-ray"), "einstein2e": ("Einstein Observatory", "X-ray"), "verimaster": ("VERITAS", "gamma (TeV)")}


def p_heasarc(ra, dec, r):
    names = ",".join("'%s'" % t for t in HEA_TABLES)
    rows = tap("https://heasarc.gsfc.nasa.gov/xamin/vo/tap",
               "SELECT table_name, COUNT(*) AS n FROM MASTER_TABLE.pos_small WHERE table_name IN (%s) AND %s GROUP BY table_name"
               % (names, cone(ra, dec, r)), "heasarc", timeout=60)
    out = []
    for x in rows:
        t = x.get("table_name")
        if t in HEA_TABLES:
            out.append({"table": t, "mission": HEA_TABLES[t][0], "band": HEA_TABLES[t][1], "n": x.get("n")})
    out.sort(key=lambda b: -(b["n"] or 0))
    return {"missions": out}


POINT_KINDS = {"simbad": (p_simbad, 7 * 86400), "gaia": (p_gaia, 7 * 86400), "exo": (p_exo, 7 * 86400),
               "mast": (p_mast, 86400), "eso": (p_eso, 86400), "heasarc": (p_heasarc, 86400)}
POINT_GATE = {}
POINT_GATE_LOCK = threading.Lock()


def point_gate(client, key):
    """one NEW point per client every 1.5 s (repeat requests for the same point - the other kinds - always pass)"""
    now = time.time()
    with POINT_GATE_LOCK:
        last = POINT_GATE.get(client)
        if last and last[0] != key and now - last[1] < 1.5:
            return False
        if not last or last[0] != key:
            POINT_GATE[client] = (key, now)
        if len(POINT_GATE) > 5000:
            POINT_GATE.clear()
    return True


def point(kind, ra, dec, r):
    fn, ttl = POINT_KINDS[kind]
    key = "%s:%.4f:%.4f:%.5f" % (kind, ra, dec, r)

    def fetch():
        t0 = time.time()
        d = fn(ra, dec, r)
        d.update(ra=ra, dec=dec, r_deg=r, took_s=round(time.time() - t0, 1))
        return jbytes(d)
    return keyed("point-" + kind, key, ttl, fetch, kind, err_backoff=60).get()


# --------------------------------------------------------------------------- gravitational waves (GraceDB)
GRACEDB = "https://gracedb.ligo.org/api"
GPS_EPOCH = 315964800  # 1980-01-06T00:00:00Z
GPS_LEAP = 18          # GPS-UTC since 2017-01-01 (no leap second announced since)
SID_RE = re.compile(r"^[SMGT][0-9]{6}[a-z]{1,3}$")


def gps_iso(g):
    try:
        return iso(GPS_EPOCH + float(g) - GPS_LEAP)
    except (TypeError, ValueError):
        return None


def fetch_gw_list():
    q = urllib.parse.urlencode({"query": "category: Production", "orderby": "-t_0", "count": 60, "format": "json"})
    body, _ = http_get(GRACEDB + "/superevents/?" + q, timeout=40, source="gracedb")
    d = json.loads(body)
    out = []
    for s in d.get("superevents") or []:
        far = s.get("far")
        labels = s.get("labels") or []
        if "RETRACTED" in labels:
            continue
        out.append({"id": s.get("superevent_id"), "gw_id": s.get("gw_id"), "t0_utc": gps_iso(s.get("t_0")),
                    "far_hz": far, "per_year": (far * 3.15576e7) if far else None,
                    "significant": bool(far is not None and far < 1 / 3.15576e7 * 12),  # < 1 per month (the public 'significant' line)
                    "labels": labels[:12], "page": "https://gracedb.ligo.org/superevents/%s/view/" % s.get("superevent_id")})
    return jbytes({"events": out, "note": "LIGO-Virgo-KAGRA public alerts (O4 ended 2025-11-18; O5 is planned)."})


GW_LIST = Cached("gracedb", os.path.join(CACHE, "gw", "list.json.gz"), 600, fetch_gw_list, source="gracedb")
GW_FILE_PREF = ("Bilby.multiorder.fits", "bilby.multiorder.fits", "olib.multiorder.fits", "cwb.multiorder.fits",
                "bayestar.multiorder.fits")


def fits_bintable(raw):
    """first BINTABLE extension of a FITS file -> (columns{name: list}, header dict). K/D/E/J only (what the sky maps use)."""
    def header(off):
        h, cards = {}, []
        while True:
            block = raw[off:off + 2880]
            if len(block) < 2880:
                raise ValueError("truncated FITS header")
            off += 2880
            end = False
            for i in range(36):
                card = block[i * 80:(i + 1) * 80].decode("ascii", "replace")
                key = card[:8].strip()
                if key == "END":
                    end = True
                    break
                if card[8:10] == "= ":
                    v = card[10:].split("/", 1)[0].strip() if not card[10:].strip().startswith("'") else card[10:].strip().split("'")[1]
                    h[key] = v
            if end:
                return h, off

    h0, off = header(0)
    n0 = 1
    for i in range(1, int(h0.get("NAXIS", "0")) + 1):
        n0 *= int(h0.get("NAXIS%d" % i, "0"))
    if int(h0.get("NAXIS", "0")) == 0:
        n0 = 0
    off += ((n0 * abs(int(h0.get("BITPIX", "8"))) // 8 + 2879) // 2880) * 2880
    h1, off = header(off)
    if h1.get("XTENSION", "").strip() != "BINTABLE":
        raise ValueError("no BINTABLE")
    rowlen, nrows, nf = int(h1["NAXIS1"]), int(h1["NAXIS2"]), int(h1["TFIELDS"])
    fmts = {"K": ("q", 8), "D": ("d", 8), "E": ("f", 4), "J": ("i", 4), "I": ("h", 2)}
    cols, pos = [], 0
    for i in range(1, nf + 1):
        tf = h1["TFORM%d" % i].strip()
        m = re.match(r"^(\d*)([A-Z])$", tf)
        rep, code = int(m.group(1) or 1), m.group(2)
        size = fmts.get(code, (None, 1))[1] * rep if code in fmts else rep
        cols.append((h1.get("TTYPE%d" % i, "C%d" % i).strip(), code, rep, pos))
        pos += size
    data = raw[off:off + rowlen * nrows]
    out = {}
    for name, code, rep, p in cols:
        if code not in fmts or rep != 1:
            continue
        fc, sz = fmts[code]
        # strided unpack: build one struct for a full row is slower; use memoryview cast per column
        vals = [struct.unpack_from(">" + fc, data, r * rowlen + p)[0] for r in range(nrows)]
        out[name.upper()] = vals
    return out, h1


def skymap_moc(raw):
    cols, h = fits_bintable(raw)
    uniq, dens = cols.get("UNIQ"), cols.get("PROBDENSITY")
    if not uniq or not dens:
        raise ValueError("not a multi-order sky map (UNIQ/PROBDENSITY missing)")
    cells = []
    for u, d in zip(uniq, dens):
        order = (int(u).bit_length() - 3) // 2
        ipix = int(u) - 4 * (4 ** order)
        area = 4 * math.pi / (12 * 4 ** order)
        cells.append((d, order, ipix, area))
    cells.sort(key=lambda c: -c[0])
    sr2deg = (180 / math.pi) ** 2
    mocs = {"50": {}, "90": {}}
    areas = {"50": 0.0, "90": 0.0}
    cum = 0.0
    for d, order, ipix, area in cells:
        p = d * area
        for lvl, lim in (("50", 0.5), ("90", 0.9)):
            if cum < lim:
                mocs[lvl].setdefault(str(order), []).append(ipix)
                areas[lvl] += area * sr2deg
        cum += p
        if cum >= 0.9:
            break
    # peak position (centre of the densest cell) - nested HEALPix pix2ang
    d, order, ipix, _ = cells[0]
    ra, dec = healpix_nest_center(order, ipix)
    dist = h.get("DISTMEAN")
    return {"moc50": mocs["50"], "moc90": mocs["90"], "area50_deg2": round(areas["50"], 1),
            "area90_deg2": round(areas["90"], 1), "peak": [round(ra, 4), round(dec, 4)],
            "dist_mpc": float(dist) if dist else None, "dist_std": float(h["DISTSTD"]) if h.get("DISTSTD") else None,
            "cells": sum(len(v) for v in mocs["90"].values())}


def healpix_nest_center(order, ipix):
    nside = 1 << order
    npface = nside * nside
    face = ipix // npface
    pf = ipix % npface
    x = y = 0
    for b in range(order):
        x |= ((pf >> (2 * b)) & 1) << b
        y |= ((pf >> (2 * b + 1)) & 1) << b
    jrll = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]
    jpll = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7]
    jr = jrll[face] * nside - x - y - 1
    if jr < nside:
        nr, z = jr, 1 - jr * jr / (3.0 * npface)
        kshift = 0
    elif jr > 3 * nside:
        nr = 4 * nside - jr
        z = -1 + nr * nr / (3.0 * npface)
        kshift = 0
    else:
        nr = nside
        z = (2 * nside - jr) * 2.0 / (3 * nside)
        kshift = (jr - nside) & 1
    jp = (jpll[face] * nr + x - y + 1 + kshift) // 2
    if jp > 4 * nside:
        jp -= 4 * nside
    if jp < 1:
        jp += 4 * nside
    phi = (jp - (kshift + 1) * 0.5) * (math.pi / 2 / nr)
    return math.degrees(phi) % 360, math.degrees(math.asin(max(-1, min(1, z))))


def gw_skymap(sid):
    if not SID_RE.match(sid):
        raise ValueError("bad superevent id")

    def fetch():
        body, _ = http_get(GRACEDB + "/superevents/%s/files/" % sid, timeout=30, source="gracedb")
        files = json.loads(body)
        name = next((n for n in GW_FILE_PREF if n in files), None)
        if not name:
            name = next((n for n in sorted(files) if n.endswith(".multiorder.fits") and "," not in n), None)
        if not name:
            return jbytes({"id": sid, "error": "no multi-order sky map published"})
        raw, _ = http_get(files[name], timeout=90, max_bytes=120 * 2**20, source="gracedb")
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        d = skymap_moc(raw)
        d.update(id=sid, file=name)
        p = {}
        for pn in ("p_astro.json", "Bilby.p_astro.json"):
            if pn in files:
                try:
                    pb, _ = http_get(files[pn], timeout=20, source="gracedb")
                    p = json.loads(pb)
                    break
                except Exception:
                    pass
        d["p_astro"] = p
        return jbytes(d)
    return keyed("gw-map", sid, 3650 * 86400, fetch, "gracedb", err_backoff=300).get()


# --------------------------------------------------------------------------- gamma-ray bursts (Fermi GBM triggers)
def fetch_grb():
    since = mjd_now() - 45
    rows = tap("https://heasarc.gsfc.nasa.gov/xamin/vo/tap",
               "SELECT name, ra, dec, error_radius, trigger_time, trigger_type FROM fermigtrig WHERE trigger_time > %.4f "
               "ORDER BY trigger_time DESC" % since, "heasarc-gbm", timeout=60)
    out = []
    for x in rows:
        out.append({"name": x.get("name"), "type": x.get("trigger_type"), "ra": x.get("ra"), "dec": x.get("dec"),
                    "err_deg": x.get("error_radius"), "t_utc": mjd_iso(x.get("trigger_time"))})
    return jbytes({"triggers": out, "source": "Fermi GBM trigger catalog (NASA HEASARC fermigtrig)"})


GRB = Cached("fermigbm", os.path.join(CACHE, "grb", "gbm.json.gz"), 900, fetch_grb, source="heasarc-gbm")


# --------------------------------------------------------------------------- optical transients (ALeRCE / ZTF)
def fetch_transients():
    since = mjd_now() - 12
    q = urllib.parse.urlencode({"classifier": "stamp_classifier", "class": "SN", "probability": 0.55,
                                "firstmjd": "%.3f" % since, "order_by": "firstmjd", "order_mode": "DESC", "page_size": 200})
    body, _ = http_get("https://api.alerce.online/ztf/v1/objects/?" + q, timeout=40, source="alerce")
    d = json.loads(body)
    out = []
    for x in d.get("items") or []:
        if x.get("meanra") is None:
            continue
        out.append({"oid": x.get("oid"), "ra": x.get("meanra"), "dec": x.get("meandec"), "first_utc": mjd_iso(x.get("firstmjd")),
                    "last_utc": mjd_iso(x.get("lastmjd")), "ndet": x.get("ndet"), "p": round(x.get("probability") or 0, 2),
                    "url": "https://alerce.online/object/%s" % x.get("oid")})
    return jbytes({"transients": out, "source": "ALeRCE broker - ZTF alert stream, stamp classifier 'SN', last 12 days"})


TRANSIENTS = Cached("alerce", os.path.join(CACHE, "transients", "alerce.json.gz"), 1800, fetch_transients, source="alerce")


# --------------------------------------------------------------------------- the Sun (SDO) + space weather (NOAA SWPC)
SDO_CH = {"0193": "AIA 193 Å", "0171": "AIA 171 Å", "0304": "AIA 304 Å", "0211": "AIA 211 Å", "0131": "AIA 131 Å",
          "0094": "AIA 94 Å", "1600": "AIA 1600 Å", "HMIIC": "HMI continuum", "HMIB": "HMI magnetogram"}
SDO = {}


def sdo(ch):
    if ch not in SDO_CH:
        raise ValueError("unknown SDO channel")
    if ch not in SDO:
        def fetch(ch=ch):
            body, _ = http_get("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_%s.jpg" % ch, timeout=40,
                               max_bytes=8 * 2**20, source="sdo")
            if body[:2] != b"\xff\xd8":
                raise Upstream("sdo: not a JPEG")
            return body
        SDO[ch] = Cached("sdo-" + ch, os.path.join(CACHE, "sdo", ch + ".jpg.gz"), 900, fetch, source="sdo")
    return SDO[ch].get()


def fetch_spaceweather():
    out = {}
    try:
        b, _ = http_get("https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json", timeout=30, source="swpc")
        xs = [x for x in json.loads(b) if x.get("energy") == "0.1-0.8nm"]
        out["xray"] = [[x.get("time_tag"), x.get("flux")] for x in xs[::3]]
    except Exception as e:
        out["xray_error"] = str(e)[:120]
    try:
        b, _ = http_get("https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json", timeout=30, source="swpc")
        fl = json.loads(b)
        out["flares"] = [{"class": f.get("max_class"), "peak": f.get("max_time"), "begin": f.get("begin_time")}
                         for f in fl if f.get("max_class")][-25:]
    except Exception as e:
        out["flares_error"] = str(e)[:120]
    try:
        b, _ = http_get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", timeout=30, source="swpc")
        k = json.loads(b)
        if k and isinstance(k[0], list):
            k = k[1:]
            out["kp"] = [[r[0], float(r[1])] for r in k[-24:]]
        else:
            out["kp"] = [[r.get("time_tag"), float(r.get("Kp"))] for r in k[-24:]]
    except Exception as e:
        out["kp_error"] = str(e)[:120]
    if not any(k in out for k in ("xray", "flares", "kp")):
        raise Upstream("swpc: all feeds failed")
    return jbytes(out)


SPACEWX = Cached("swpc", os.path.join(CACHE, "sun", "swpc.json.gz"), 300, fetch_spaceweather, source="swpc")


# --------------------------------------------------------------------------- space telescopes: orbits (CelesTrak) + deep space (Horizons)
SPACE_TELESCOPES = {  # NORAD id -> (display name, band, what it does)
    20580: ("Hubble Space Telescope", "UV · optical · near-IR", "NASA/ESA, 2.4 m, since 1990"),
    25867: ("Chandra X-ray Observatory", "X-ray", "NASA, highly elliptical orbit, since 1999"),
    25989: ("XMM-Newton", "X-ray", "ESA, highly elliptical orbit, since 1999"),
    28485: ("Neil Gehrels Swift", "gamma · X-ray · UV", "NASA, GRB hunter, since 2004"),
    33053: ("Fermi Gamma-ray Space Telescope", "gamma-ray", "NASA, whole-sky every 3 h, since 2008"),
    38358: ("NuSTAR", "hard X-ray", "NASA, since 2012"),
    49954: ("IXPE", "X-ray polarimetry", "NASA/ASI, since 2021"),
    40930: ("AstroSat", "UV · X-ray", "ISRO, since 2015"),
    42758: ("Insight-HXMT", "hard X-ray", "CNSA/IHEP, since 2017"),
    41173: ("DAMPE", "cosmic rays · gamma", "CAS, since 2015"),
    36395: ("Solar Dynamics Observatory", "the Sun (EUV)", "NASA, geosynchronous, since 2010"),
    29479: ("Hinode", "the Sun (X-ray · optical)", "JAXA/NASA/ESA, since 2006"),
    39197: ("IRIS", "the Sun (UV)", "NASA, since 2013"),
    39089: ("NEOSSat", "near-Earth asteroids", "CSA, since 2013"),
    25544: ("ISS · NICER", "X-ray (NICER on the station)", "NASA, since 2017"),
    43435: ("TESS", "optical (planet transits)", "NASA, 13.7-day lunar-resonant orbit, since 2018"),
}
CT_GROUP_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={g}&FORMAT=json"
CT_CATNR_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR={n}&FORMAT=json"
# optional: the CelesTrak cache folder of a Lion Satellite Studio on the same machine (SKY_SHARED_CELESTRAK_DIR);
# read-only, so the two apps do not both download the same group. Unset = this app downloads its own.
GLOBE_CT = os.path.expanduser(os.environ.get("SKY_SHARED_CELESTRAK_DIR", ""))


def _ct_fetch(url):
    def fetch():
        body, _ = http_get(url, timeout=60, source="celestrak")
        d = json.loads(body)
        if not isinstance(d, list):
            raise Upstream("celestrak: unexpected payload")
        return jbytes(d)
    return fetch


CT_SCIENCE = Cached("celestrak-science", os.path.join(CACHE, "celestrak", "science.json.gz"), 2 * 3600 + 120,
                    _ct_fetch(CT_GROUP_URL.format(g="science")), err_backoff=1800, source="celestrak")
CT_EXTRA = {n: Cached("celestrak-%d" % n, os.path.join(CACHE, "celestrak", "%d.json.gz" % n), 6 * 3600,
                      _ct_fetch(CT_CATNR_URL.format(n=n)), err_backoff=3600, source="celestrak") for n in (25544, 43435)}


def _globe_group(g, max_age):
    """the satellite studio on this box keeps its own CelesTrak cache: read it (read-only) when it is fresh enough,
    so the two apps do not both download the same group."""
    if not GLOBE_CT:
        return None
    p = os.path.join(GLOBE_CT, g + ".json.gz")
    try:
        if time.time() - os.path.getmtime(p) < max_age:
            with open(p, "rb") as f:
                return json.loads(gzip.decompress(f.read()))
    except Exception:
        pass
    return None


def space_tles():
    sats, src = [], {}
    sci = _globe_group("science", 2 * 3600)
    if sci is not None:
        src["science"] = "satellite studio cache"
    else:
        sci, meta = CT_SCIENCE.json()
        src["science"] = meta
    pool = list(sci)
    st = _globe_group("stations", 2 * 3600)
    if st is not None:
        pool += [x for x in st if x.get("NORAD_CAT_ID") == 25544]
    for n, c in CT_EXTRA.items():
        if any(x.get("NORAD_CAT_ID") == n for x in pool):
            continue
        try:
            d, meta = c.json()
            pool += d
            src[str(n)] = meta
        except Unavailable:
            pass
    for x in pool:
        n = x.get("NORAD_CAT_ID")
        if n in SPACE_TELESCOPES and not any(s["norad"] == n for s in sats):
            nm, band, about = SPACE_TELESCOPES[n]
            sats.append({"norad": n, "name": nm, "band": band, "about": about, "omm": x})
    return {"telescopes": sats, "sources": src}


DEEP = {  # Horizons id -> (name, band, where)
    "-170": ("James Webb Space Telescope", "near/mid-infrared", "orbits Sun-Earth L2"),
    "-680": ("Euclid", "optical · near-IR (dark universe survey)", "orbits Sun-Earth L2"),
    "-139479": ("Gaia", "optical astrometry (retired 2025)", "left L2 for a heliocentric orbit"),
    "-21": ("SOHO", "the Sun", "orbits Sun-Earth L1"),
}


def fetch_deep():
    out = []
    now = dt.datetime.now(dt.timezone.utc)
    t0, t1 = now.strftime("%Y-%m-%d %H:%M"), (now + dt.timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M")
    for hid, (name, band, where) in DEEP.items():
        q = urllib.parse.urlencode({"format": "json", "COMMAND": "'%s'" % hid, "EPHEM_TYPE": "OBSERVER", "CENTER": "'500@399'",
                                    "START_TIME": "'%s'" % t0, "STOP_TIME": "'%s'" % t1, "STEP_SIZE": "'1m'",
                                    "QUANTITIES": "'1,20'", "ANG_FORMAT": "DEG", "CSV_FORMAT": "YES", "OBJ_DATA": "NO"})
        try:
            body, _ = http_get("https://ssd.jpl.nasa.gov/api/horizons.api?" + q, timeout=40, source="horizons")
            res = json.loads(body).get("result", "")
            m = re.search(r"\$\$SOE\s*(.*?)\s*\$\$EOE", res, re.S)
            line = m.group(1).splitlines()[0]
            cols = [c.strip() for c in line.split(",")]
            nums = [c for c in cols if re.match(r"^-?\d+(\.\d+)?(E[+-]?\d+)?$", c)]
            ra, dec, delta = float(nums[0]), float(nums[1]), float(nums[2])
            out.append({"id": hid, "name": name, "band": band, "where": where, "ra": ra, "dec": dec,
                        "dist_km": round(delta * 149597870.7), "dist_au": round(delta, 5)})
        except Exception as e:
            out.append({"id": hid, "name": name, "band": band, "where": where, "error": str(e)[:120]})
    if all("error" in x for x in out):
        raise Upstream("horizons: every lookup failed")
    return jbytes({"craft": out, "t_utc": iso(time.time())})


DEEP_C = Cached("horizons", os.path.join(CACHE, "deep", "deep.json.gz"), 6 * 3600, fetch_deep, source="horizons")


# --------------------------------------------------------------------------- what are the telescopes looking at?
JWST_SCHED_PAGE = "https://www.stsci.edu/jwst/science-execution/observing-schedules"


def fetch_jwst_sched():
    page, _ = http_get(JWST_SCHED_PAGE, timeout=40, source="stsci")
    links = re.findall(r'href="(/files/live/sites/www/files/home/jwst/science-execution/observing-schedules/_documents/[^"]+\.txt)"',
                       page.decode("utf-8", "replace"))
    if not links:
        raise Upstream("stsci: no schedule files listed")
    def rdate(u):
        m = re.search(r"_report_(\d{8})", u)
        return m.group(1) if m else "0"
    links = sorted(set(links), key=rdate, reverse=True)[:2]      # newest report date first (file prefixes changed format over the years)
    visits = []
    for lk in links:
        body, _ = http_get("https://www.stsci.edu" + lk, timeout=40, source="stsci")
        text = body.decode("utf-8", "replace")
        lines = text.splitlines()
        hdr = next((i for i, l in enumerate(lines) if l.startswith("VISIT ID")), None)
        if hdr is None:
            continue
        cols = lines[hdr]
        starts = [m.start() for m in re.finditer(r"(?<!\S)\S", cols)]
        # column boundaries come from the dashed rule under the header
        rule = lines[hdr + 1] if hdr + 1 < len(lines) else ""
        spans = [(m.start(), m.end()) for m in re.finditer(r"-+", rule)] or [(s, s + 20) for s in starts]
        names = [cols[a:b].strip() for a, b in spans]
        for l in lines[hdr + 2:]:
            if not l.strip():
                continue
            rec = {names[i]: l[a:(spans[i + 1][0] if i + 1 < len(spans) else len(l))].strip() for i, (a, b) in enumerate(spans)}
            st = rec.get("SCHEDULED START TIME", "")
            if not re.match(r"^\d{4}-\d\d-\d\dT", st):
                continue
            durm = re.match(r"^(\d+)/(\d+):(\d+):(\d+)$", rec.get("DURATION", ""))
            dur_s = (int(durm.group(1)) * 86400 + int(durm.group(2)) * 3600 + int(durm.group(3)) * 60 + int(durm.group(4))) if durm else 0
            vid = rec.get("VISIT ID", "")
            visits.append({"visit": vid, "program": vid.split(":")[0], "start": st, "dur_s": dur_s,
                           "type": rec.get("VISIT TYPE", ""), "instrument": rec.get("SCIENCE INSTRUMENT AND MODE", ""),
                           "target": rec.get("TARGET NAME", ""), "category": rec.get("CATEGORY", ""),
                           "keywords": rec.get("KEYWORDS", ""), "file": os.path.basename(lk)})
    seen, uniq = set(), []
    for v in sorted(visits, key=lambda v: v["start"]):
        if v["visit"] in seen:
            continue
        seen.add(v["visit"])
        uniq.append(v)
    return jbytes({"visits": uniq})


JWST_SCHED = Cached("jwst-schedule", os.path.join(CACHE, "pointing", "jwst.json.gz"), 6 * 3600, fetch_jwst_sched, source="stsci")


def program_coords(collection, program):
    """median position of a program's observations in MAST (JWST schedules carry target names, not coordinates)"""
    if not re.match(r"^\d{1,6}$", program):
        return None

    def fetch():
        rows = mast("Mast.Caom.Filtered", {"columns": "s_ra,s_dec,target_name,t_min",
                                            "filters": [{"paramName": "obs_collection", "values": [collection]},
                                                        {"paramName": "proposal_id", "values": [program]}]}, pagesize=2000)
        pts = [(x["s_ra"], x["s_dec"], x.get("target_name")) for x in rows if x.get("s_ra") is not None]
        return jbytes({"pts": pts[:2000]})
    try:
        d, _ = keyed("prog", collection + ":" + program, 86400, fetch, "mast", err_backoff=600).json()
    except Unavailable:
        return None
    return d.get("pts") or None


def nearest_target(pts, target):
    """pick the position of the named target if MAST has it, else the program's densest position"""
    if not pts:
        return None
    t = (target or "").upper().replace(" ", "")
    same = [p for p in pts if (p[2] or "").upper().replace(" ", "") == t] if t else []
    use = same or pts
    use = sorted(use, key=lambda p: p[1])
    mid = use[len(use) // 2]
    return {"ra": mid[0], "dec": mid[1], "how": "MAST position of this target" if same else "MAST median position of this program"}


def jwst_now():
    d, meta = JWST_SCHED.json()
    now = iso(time.time())
    vis = [v for v in d["visits"] if "PRIME" in v["type"] or "PARALLEL" not in v["type"]]
    cur, nxt, prev = None, [], []
    for v in vis:
        try:
            st = dt.datetime.strptime(v["start"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp()
        except ValueError:
            continue
        v["end"] = iso(st + v["dur_s"])
        if v["start"] <= now < v["end"]:
            cur = v
        elif v["start"] > now and len(nxt) < 6:
            nxt.append(v)
        elif v["end"] <= now:
            prev.append(v)
    prev = prev[-4:]
    out = []
    for v in ([cur] if cur else []) + nxt + prev[::-1]:
        v = dict(v)
        pts = program_coords("JWST", v["program"])
        pos = nearest_target(pts, v["target"])
        if pos is None and v["target"]:
            try:
                gz, _ = resolve_name(v["target"])
                r = json.loads(gzip.decompress(gz))
                if r.get("found"):
                    pos = {"ra": r["ra"], "dec": r["dec"], "how": "target name resolved by CDS Sesame"}
            except Exception:
                pass
        v["pos"] = pos
        v["state"] = "now" if v is cur or (cur and v["visit"] == cur["visit"]) else ("next" if v["start"] > now else "done")
        out.append(v)
    return {"telescope": "JWST", "schedule_file": d["visits"][-1]["file"] if d["visits"] else None,
            "fetched": meta["fetched"], "visits": out, "fov_deg": 0.0367,
            "source": "STScI weekly JWST observing schedule; positions from MAST (program) or CDS Sesame (target name)"}


CXC_URL = "https://cxc.harvard.edu/target_lists/stscheds/"
CXC_ROW = re.compile(r"^\s*(\S+)\s+(?:CCT\s+)?(\d+)\s+(\d+)\s+(.*?)\s+(\d{4}:\d{3}:\d\d:\d\d:\d\d\.\d+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+"
                    r"(-?\d+\.\d+)\s+(-?\d+\.\d+)\s")


def fetch_chandra():
    body, _ = http_get(CXC_URL, timeout=40, source="cxc")
    text = re.sub(r"<[^>]+>", "", body.decode("utf-8", "replace"))
    rows = []
    for l in text.splitlines():
        m = CXC_ROW.match(l)
        if not m:
            continue
        seq, obsid, _, target, start, ks, det, grat, _chips, ra, dec = m.groups()
        try:
            t = dt.datetime.strptime(start.split(".")[0], "%Y:%j:%H:%M:%S").replace(tzinfo=dt.timezone.utc).timestamp()
        except ValueError:
            continue
        rows.append({"seq": seq, "obsid": obsid, "target": target.strip(), "start": iso(t), "end": iso(t + float(ks) * 1000),
                     "ks": float(ks), "instrument": (det + " " + (grat if grat not in ("NONE", "--") else "")).strip(),
                     "ra": float(ra), "dec": float(dec), "cal": target.startswith("CAL-")})
    if not rows:
        raise Upstream("cxc: schedule table not found")
    seen, uniq = set(), []
    for r in sorted(rows, key=lambda r: r["start"]):
        if r["obsid"] in seen:
            continue
        seen.add(r["obsid"])
        uniq.append(r)
    return jbytes({"obs": uniq})


CHANDRA = Cached("chandra-schedule", os.path.join(CACHE, "pointing", "chandra.json.gz"), 3600, fetch_chandra, source="cxc")


def chandra_now():
    d, meta = CHANDRA.json()
    now = iso(time.time())
    obs = d["obs"]
    cur = next((o for o in obs if o["start"] <= now < o["end"]), None)
    if cur is None:   # between scheduled science (slews, calibration gaps): the most recent target
        past = [o for o in obs if o["start"] <= now]
        cur = past[-1] if past else None
    nxt = [o for o in obs if o["start"] > now][:6]
    prev = [o for o in obs if o["end"] <= now and o is not cur][-4:][::-1]
    out = []
    for o in ([cur] if cur else []) + nxt + prev:
        o = dict(o)
        o["state"] = "now" if cur and o["obsid"] == cur["obsid"] else ("next" if o["start"] > now else "done")
        out.append(o)
    return {"telescope": "Chandra", "fetched": meta["fetched"], "visits": out, "fov_deg": 0.28,
            "source": "Chandra X-ray Center short-term schedule (cxc.harvard.edu)"}


def fetch_recent(collection):
    def fetch():
        lo = mjd_now() - 3
        rows = mast("Mast.Caom.Filtered", {"columns": "obs_collection,instrument_name,target_name,s_ra,s_dec,t_min,t_exptime,proposal_id",
                                            "filters": [{"paramName": "obs_collection", "values": [collection]},
                                                        {"paramName": "t_min", "values": [{"min": lo, "max": lo + 4}]}]},
                    pagesize=3000)
        pts = {}
        for x in rows:
            if x.get("s_ra") is None:
                continue
            k = (round(x["s_ra"], 2), round(x["s_dec"], 2))
            p = pts.get(k)
            if p is None or (x.get("t_min") or 0) > p["t"]:
                pts[k] = {"ra": x["s_ra"], "dec": x["s_dec"], "target": x.get("target_name"), "instrument": x.get("instrument_name"),
                          "t": x.get("t_min") or 0, "program": x.get("proposal_id")}
        lst = sorted(pts.values(), key=lambda p: -p["t"])[:40]
        for p in lst:
            p["t_utc"] = mjd_iso(p.pop("t"))
        return jbytes({"recent": lst})
    return keyed("recent", collection, 3600, fetch, "mast", err_backoff=600).json()


def pointing():
    out, errors = [], {}
    for name, fn in (("jwst", jwst_now), ("chandra", chandra_now)):
        try:
            out.append(dict(fn(), id=name))
        except (Unavailable, Upstream) as e:
            errors[name] = str(e)[:200]
    for coll, label in (("HST", "Hubble"), ("TESS", "TESS")):
        try:
            d, meta = fetch_recent(coll)
            out.append({"id": coll.lower(), "telescope": label, "fetched": meta["fetched"], "recent": d["recent"],
                        "fov_deg": 0.056 if coll == "HST" else 24.0,
                        "source": "MAST: %s observations that began in the last ~3 days (public metadata)" % label})
        except (Unavailable, Upstream) as e:
            errors[coll.lower()] = str(e)[:200]
    return {"telescopes": out, "errors": errors, "t_utc": iso(time.time())}


# --------------------------------------------------------------------------- HTTP
CTYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".gif": "image/gif", ".webp": "image/webp", ".woff2": "font/woff2",
    ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm", ".xml": "application/xml",
    ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".ktx2": "image/ktx2",
    ".bin": "application/octet-stream", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".webmanifest": "application/manifest+json",
}
LONG_CACHE = ("/vendor/", "/fonts/")


def fnum(q, k, lo, hi, default=None):
    v = (q.get(k) or [None])[0]
    if v is None:
        if default is None:
            raise ValueError("missing " + k)
        return default
    x = float(v)
    if not math.isfinite(x) or x < lo or x > hi:
        raise ValueError(k + " out of range")
    return x


class Handler(BaseHTTPRequestHandler):
    server_version = "LionTelescopeStudio/1.0"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def gz_ok(self):
        return "gzip" in (self.headers.get("Accept-Encoding") or "")

    def send_body(self, code, body, ctype, gz=False, headers=None, cache="no-store"):
        if gz and not self.gz_ok():
            body, gz = gzip.decompress(body), False
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if gz:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (headers or {}).items():
            self.send_header(k, str(v))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, obj, code=200, headers=None, cache="no-store"):
        body = jbytes(obj)
        if len(body) > 2048 and self.gz_ok():
            self.send_body(code, gzip.compress(body, 5), "application/json", gz=True, headers=headers, cache=cache)
        else:
            self.send_body(code, body, "application/json", headers=headers, cache=cache)

    def send_err(self, code, msg, retry=None):
        self.send_json({"error": str(msg)[:300], "retry_in_s": retry}, code=code, headers={"Retry-After": retry} if retry else None)

    def cached_out(self, gz, meta, ctype="application/json", cache="no-cache"):
        self.send_body(200, gz, ctype, gz=True, cache=cache,
                       headers={"X-Cache": meta.get("cache", "hit"), "X-Fetched-At": meta.get("fetched", ""), "X-Age": meta.get("age_s", "")})

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        self.send_err(405, "method not allowed")

    do_PUT = do_DELETE = do_PATCH = do_POST

    def do_GET(self):
        try:
            if len(self.path) > 2048:
                return self.send_err(414, "uri too long")
            u = urllib.parse.urlsplit(self.path)
            q = urllib.parse.parse_qs(u.query, keep_blank_values=False)
            if u.path.startswith("/api/"):
                return self.api(u.path, q)
            return self.static(u.path)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            log("handler error", self.path[:120], str(e)[:200])
            sys.stderr.write(traceback.format_exc())
            try:
                self.send_err(500, "internal error")
            except Exception:
                pass

    def static(self, p):
        if p in ("/", ""):
            p = "/index.html"
        p = posixpath.normpath(urllib.parse.unquote(p))
        if ".." in p.split("/") or "\x00" in p:
            return self.send_err(400, "bad path")
        full = os.path.realpath(os.path.join(STATIC, p.lstrip("/")))
        if not full.startswith(os.path.realpath(STATIC) + os.sep) or not os.path.isfile(full):
            return self.send_err(404, "not found")
        ctype = CTYPES.get(os.path.splitext(full)[1].lower(), "application/octet-stream")
        st = os.stat(full)
        etag = '"%x-%x"' % (int(st.st_mtime), st.st_size)
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        cache = "public, max-age=604800" if p.startswith(LONG_CACHE) else "no-cache"
        hdr = {"Last-Modified": formatdate(st.st_mtime, usegmt=True), "ETag": etag}
        gzpath = full + ".gz"
        if self.gz_ok() and os.path.isfile(gzpath) and os.path.getmtime(gzpath) >= st.st_mtime:
            with open(gzpath, "rb") as f:
                return self.send_body(200, f.read(), ctype, gz=True, cache=cache, headers=dict(hdr, Vary="Accept-Encoding"))
        with open(full, "rb") as f:
            self.send_body(200, f.read(), ctype, cache=cache, headers=hdr)

    def api(self, p, q):
        one = lambda k, d=None: (q.get(k) or [d])[0]
        try:
            if p == "/api/status":
                return self.send_json(self.status())
            if p == "/api/resolve":
                gz, meta = resolve_name(one("q", ""))
                return self.cached_out(gz, meta, cache="public, max-age=86400")
            if p == "/api/point":
                kind = one("kind", "")
                if kind not in POINT_KINDS:
                    return self.send_err(400, "kind must be one of " + ",".join(POINT_KINDS))
                ra, dec = fnum(q, "ra", 0, 360), fnum(q, "dec", -90, 90)
                r = fnum(q, "r", 0.0005, 0.5, 0.02)
                lim = {"gaia": 0.17, "simbad": 0.5, "exo": 0.5, "mast": 0.25, "eso": 0.25, "heasarc": 0.25}[kind]
                r = min(r, lim)
                ra, dec, r = round(ra, 4), round(dec, 4), round(r, 5)
                client = self.client_address[0]
                if not point_gate(client, "%.4f:%.4f" % (ra, dec)):     # all kinds for one click share a key
                    return self.send_err(429, "one new point every 1.5 s", retry=2)
                gz, meta = point(kind, ra, dec, r)
                return self.cached_out(gz, meta)
            if p == "/api/gw":
                gz, meta = GW_LIST.get()
                return self.cached_out(gz, meta)
            if p == "/api/gw/map":
                gz, meta = gw_skymap(one("id", ""))
                return self.cached_out(gz, meta, cache="public, max-age=86400")
            if p == "/api/grb":
                gz, meta = GRB.get()
                return self.cached_out(gz, meta)
            if p == "/api/transients":
                gz, meta = TRANSIENTS.get()
                return self.cached_out(gz, meta)
            if p == "/api/sun":
                gz, meta = sdo(one("ch", "0193"))
                return self.cached_out(gz, meta, ctype="image/jpeg", cache="public, max-age=600")
            if p == "/api/spaceweather":
                gz, meta = SPACEWX.get()
                return self.cached_out(gz, meta)
            if p == "/api/space":
                return self.send_json(space_tles(), cache="no-cache")
            if p == "/api/deep":
                gz, meta = DEEP_C.get()
                return self.cached_out(gz, meta)
            if p == "/api/pointing":
                return self.send_json(pointing(), cache="no-cache")
            return self.send_err(404, "no such endpoint")
        except ValueError as e:
            return self.send_err(400, str(e))
        except Unavailable as e:
            return self.send_err(503, str(e), retry=e.retry)
        except Upstream as e:
            return self.send_err(502, str(e), retry=60)

    def status(self):
        out = {"server_time": iso(time.time()), "uptime_s": int(time.time() - START_TIME), "sources": get_status(),
               "upstream_requests": dict(UPSTREAM_HITS)}
        try:
            out["client_version"] = int(max(os.path.getmtime(os.path.join(dp, f))
                                            for dp in (STATIC, os.path.join(STATIC, "js"), os.path.join(STATIC, "css"))
                                            for f in os.listdir(dp) if f.endswith((".html", ".js", ".css"))))
        except (OSError, ValueError):
            pass
        return out


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64


def main():
    os.makedirs(CACHE, exist_ok=True)
    srv = Server((HOST, PORT), Handler)
    log("Lion Telescope Studio listening on http://%s:%d" % (HOST, PORT))
    try:
        srv.serve_forever(poll_interval=1.0)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

# Created by Sunny Chase (https://github.com/sunnychase) in collaboration with Claude (Anthropic).
"""Minimal VOTable reader (stdlib only): TABLEDATA and BINARY / BINARY2 serialisations.

parse(bytes) -> (fields, rows) where fields = [name, ...] and rows = [{name: value}, ...].
Raises ValueError on a QUERY_STATUS=ERROR document (the message is the INFO text).
"""
import base64
import math
import re
import struct
import xml.etree.ElementTree as ET

_SIZES = {"boolean": 1, "bit": 1, "unsignedByte": 1, "short": 2, "int": 4, "long": 8, "char": 1,
          "unicodeChar": 2, "float": 4, "double": 8, "floatComplex": 8, "doubleComplex": 16}
_FMT = {"unsignedByte": "B", "short": "h", "int": "i", "long": "q", "float": "f", "double": "d"}


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _conv(text, dt):
    if text is None:
        return None
    t = text.strip()
    if t == "":
        return None
    try:
        if dt in ("short", "int", "long", "unsignedByte"):
            return int(t)
        if dt in ("float", "double"):
            v = float(t)
            return None if math.isnan(v) else v
        if dt == "boolean":
            return t[:1] in ("T", "t", "1")
    except ValueError:
        return t
    return t


def _arraysize(a):
    """None = scalar, -1 = variable, n = fixed count"""
    if not a:
        return None
    a = a.strip()
    if a.endswith("*"):
        return -1
    if "x" in a:            # 2-D fixed: product (rare here)
        n = 1
        for p in a.split("x"):
            n *= int(p.rstrip("*") or 1)
        return n
    return int(a)


def parse(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    root = ET.fromstring(data)
    for el in root.iter():
        if _local(el.tag) == "INFO" and el.get("name") == "QUERY_STATUS" and el.get("value") == "ERROR":
            raise ValueError((el.text or "query error").strip()[:300])
    table = next((el for el in root.iter() if _local(el.tag) == "TABLE"), None)
    if table is None:
        return [], []
    fields = []
    for el in table:
        if _local(el.tag) == "FIELD":
            null = None
            for v in el:
                if _local(v.tag) == "VALUES" and v.get("null") is not None:
                    null = v.get("null")
            fields.append({"name": el.get("name") or el.get("ID"), "dt": el.get("datatype", "char"),
                           "as": _arraysize(el.get("arraysize")), "null": null})
    names = [f["name"] for f in fields]
    rows = []
    data_el = next((el for el in table if _local(el.tag) == "DATA"), None)
    if data_el is None:
        return names, rows
    ser = next(iter(data_el), None)
    if ser is None:
        return names, rows
    kind = _local(ser.tag)
    if kind == "TABLEDATA":
        for tr in ser:
            vals = [td.text for td in tr]
            row = {}
            for i, f in enumerate(fields):
                v = vals[i] if i < len(vals) else None
                if f["null"] is not None and v is not None and v.strip() == f["null"]:
                    v = None
                row[f["name"]] = _conv(v, f["dt"]) if (f["as"] is None or f["dt"] in ("char", "unicodeChar")) else v
            rows.append(row)
        return names, rows
    if kind in ("BINARY", "BINARY2"):
        stream = next((el for el in ser if _local(el.tag) == "STREAM"), None)
        raw = base64.b64decode(re.sub(r"\s+", "", stream.text or "")) if stream is not None else b""
        rows = _binary(raw, fields, kind == "BINARY2")
        return names, rows
    raise ValueError("unsupported VOTable serialisation " + kind)


def _binary(raw, fields, b2):
    rows, off, n = [], 0, len(raw)
    nf = len(fields)
    while off < n:
        nulls = None
        if b2:
            nb = (nf + 7) // 8
            mask = raw[off:off + nb]
            off += nb
            nulls = [(mask[i // 8] >> (7 - i % 8)) & 1 for i in range(nf)]
        row = {}
        for i, f in enumerate(fields):
            dt, a = f["dt"], f["as"]
            size = _SIZES.get(dt, 1)
            if a == -1:
                cnt = struct.unpack_from(">i", raw, off)[0]
                off += 4
            elif a is None:
                cnt = 1
            else:
                cnt = a
            nbytes = size * cnt
            chunk = raw[off:off + nbytes]
            off += nbytes
            if nulls and nulls[i]:
                row[f["name"]] = None
                continue
            if dt == "char":
                v = chunk.split(b"\x00", 1)[0].decode("latin-1").rstrip()
                v = v if v != "" else None
            elif dt == "unicodeChar":
                v = chunk.decode("utf-16-be", "replace").split("\x00", 1)[0].rstrip() or None
            elif dt == "boolean":
                vv = [c in (ord("T"), ord("t"), ord("1")) for c in chunk]
                v = vv[0] if cnt == 1 else vv
            elif dt in _FMT:
                vv = list(struct.unpack(">%d%s" % (cnt, _FMT[dt]), chunk)) if cnt else []
                if dt in ("float", "double"):
                    vv = [None if math.isnan(x) else x for x in vv]
                elif f["null"] is not None:
                    vv = [None if str(x) == f["null"] else x for x in vv]
                v = vv[0] if (a is None and vv) else vv
            else:
                v = None
            row[f["name"]] = v
        rows.append(row)
    return rows

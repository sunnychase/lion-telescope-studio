# Notes for coding agents

Guidance for AI coding agents (and people) changing this repository. Read [CONTRIBUTING.md](CONTRIBUTING.md) too.

## What this is

A sky viewer: a static page (Aladin Lite + ES modules) and one small Python server that serves it and fetches, caches and
validates every upstream archive. See [How it works](README.md#how-it-works).

## Layout

| path | what it is |
|---|---|
| `server.py` | the whole server: settings (`SKY_*`), disk cache, one section per upstream, the HTTP handler; standard library only |
| `votable.py` | VOTable reader (TABLEDATA, BINARY, BINARY2) for TAP answers |
| `static/index.html`, `static/css/app.css` | the page shell and styles |
| `static/js/app.js` | start-up, tabs, search, share links (URL hash), About; app state as `window.LTS` |
| `static/js/sky.js` | Aladin Lite wrapper: surveys, blending, overlays, catalogues, MOCs, snapshots |
| `static/js/surveys.js` | the spectrum ladder, the survey library, showpieces and the point-report strip |
| `static/js/point.js` | the click report (SIMBAD, Gaia, exoplanets, MAST, ESO, HEASARC, picture strip) |
| `static/js/live.js` | gravitational waves, Fermi GBM, ALeRCE supernovae, the Sun |
| `static/js/scopes.js` | where JWST / Chandra / Hubble / TESS are looking; orbits (satellite.js) |
| `static/js/earth.js` | the Earth view (CesiumJS, loaded on first use) |
| `static/js/tonight.js` | Tonight (astronomy-engine) |
| `static/js/util.js` | shared helpers |
| `static/data/observatories.json` | observatories and space telescopes for the Earth view |
| `static/vendor/` | Aladin Lite, astronomy-engine, CesiumJS, satellite.js, unmodified; do not edit |
| `scripts/` | `check.sh`, `precompress.py` |

## Rules

1. **Config indirection.** Ports, addresses and paths come from `SKY_*` variables. Never hard-code a machine's values.
2. **Nothing machine-specific or personal** in code, comments, docs, screenshots or commit messages.
3. **The server stays standard-library only.**
4. **No open proxy**: upstream URLs are templates; validate every browser parameter.
5. **Cache and credit every upstream**; list it in NOTICE.md with its terms.
6. **Run `bash scripts/check.sh`** before committing; add a dated CHANGELOG entry.

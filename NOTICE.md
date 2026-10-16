# Notices: credits, licences and data terms

**Lion Telescope Studio.** Created by [Sunny Chase](https://github.com/sunnychase) in collaboration with Claude (Anthropic).
Copyright (c) 2026 Sunny Chase (https://github.com/sunnychase) · Lion Telescope Studio.

## The licence of this repository: GPL-3.0-or-later

The code written for this repository (`server.py`, `votable.py`, `scripts/`, `systemd/`, and everything in `static/` except
`static/vendor/` and `static/fonts/`) is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any
later version. The full text is in [LICENSE](LICENSE). It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

**Why GPL and not MIT** (unlike the sibling projects): the page is built on, and ships a copy of, Aladin Lite, which is
GPL-3.0. A work that bundles and links it is distributed under the GPL as a whole, so the whole repository uses
GPL-3.0-or-later. Every bundled third-party component below keeps its own licence, and all of them are GPL-compatible.

## Included software and fonts (in `static/vendor/` and `static/fonts/`, unmodified)

| Component | Version | Licence | Copyright | Licence file |
|---|---|---|---|---|
| [Aladin Lite](https://aladin.cds.unistra.fr/AladinLite/) | 3.6.5 (npm `aladin-lite`) | GPL-3.0 | © CDS, Université de Strasbourg / CNRS | `static/vendor/aladin/LICENSE-GPL-3.0.txt` |
| [astronomy-engine](https://github.com/cosinekitty/astronomy) | 2.1.19 (npm) | MIT | © 2019-2025 Don Cross | `static/vendor/astronomy/LICENSE-MIT.txt` |
| [CesiumJS](https://cesium.com/platform/cesiumjs/) | 1.146.0 (npm `cesium`) | Apache-2.0 | © 2011-2026 CesiumJS Contributors | `static/vendor/cesium/LICENSE.md` (with the notices of the code it bundles) |
| [satellite.js](https://github.com/shashwatak/satellite-js) | 7.1.0 (npm) | MIT | © 2013 Shashwat Kandadai, UCSC Jack Baskin School of Engineering | `static/vendor/satellite/LICENSE.md` |
| Inter, JetBrains Mono | — | SIL Open Font License 1.1 | their authors | `static/fonts/LICENSE-*-OFL.txt` |

Each `VERSION.txt` in `static/vendor/` records where the files came from. Of CesiumJS only the browser build is included (the
unused `index.js` / `index.cjs` bundles are left out). No Cesium ion services are used; the Earth view shows the Natural Earth II
imagery that ships with CesiumJS. Aladin Lite's logo stays in the corner of the sky view, as its terms ask.

## Included data

- `static/data/observatories.json`: names, locations and descriptions of observatories and space telescopes, written for this
  project from the observatories' own public pages. Facts, not copied text.
- `static/img/icon.svg` and `docs/images/logo.png`: made for this project.
- `docs/images/*.webp`: screenshots of the app. The sky in them comes from the surveys named in each picture's caption in the
  README and keeps those surveys' terms (below); they are included only to document the software.

## Data shown at run time (not included in this repository)

Nothing below is copied into the repository. The browser loads sky tiles straight from the survey servers through Aladin Lite,
and the server fetches, caches and validates everything else. The project is not affiliated with, or endorsed by, any of these
observatories or agencies. Please keep the credits when you share pictures, and check each survey's terms before any
commercial use.

### Sky images (HiPS tiles, loaded by the browser)

HiPS tiles are served by CDS Strasbourg (most surveys, "HEALPixed by CDS", HiPS licence ODbL-1.0 where stated), ESA ESDC (Gaia,
AKARI), and the eROSITA, MeerKAT, Rubin and JWST/HST/Euclid releases. The survey list, with each survey's maker, is in
`static/js/surveys.js`; the app names the survey on screen. Notable terms:

| Survey | Rights as published in its HiPS properties |
|---|---|
| **Mellinger all-sky optical** (`CDS/P/Mellinger/color`) | "Copyright 2000-2017 Axel Mellinger. **All rights reserved.**" Viewed live from CDS's server; not redistributed by this project. Do not reuse screenshots of it without the author's permission. |
| **Gaia DR3 star-flux map** (`ESAVO/P/GAIA/DR3-RGB`) | ESA/Gaia/DPAC, **CC BY-NC** (non-commercial). |
| **Euclid Q1** (`CDS/P/Euclid/Q1/color`) | ESA/Euclid/Euclid Consortium/NASA, **CC BY-NC 3.0 IGO** (non-commercial). |
| **Planck** (CMB, HFI, LFI, CO) | ESA / Planck Collaboration; the CMB map states "European Space Agency. All rights reserved." Credit ESA and the Planck Collaboration. |
| DSS2 colour | Digitized Sky Survey, STScI/NASA; coloured and HEALPixed by CDS (ODbL-1.0). |
| 2MASS, AllWISE / unWISE, GALEX, Fermi, RASS, Haslam 408 MHz, NVSS, Finkbeiner H-alpha, Swift-BAT, AKARI, eROSITA DR1 | Their missions and archives (IPAC/Caltech, NASA, MPE, LAMBDA, NRAO/AUI, JAXA, MPE/eROSITA-DE); credit the mission. |
| JWST, Hubble, Euclid ERO, Rubin First Look, MeerKAT showpieces | NASA, ESA, CSA, STScI; ESA/Euclid; NSF–DOE Vera C. Rubin Observatory/NOIRLab/SLAC/AURA; SARAO. Credit lines as shown in the app. |

### Services the server calls (all keyless; each answer is cached)

| What | Provider | Terms / credit |
|---|---|---|
| Object names, nearby objects | CDS Sesame and SIMBAD (TAP) | "This research has made use of the SIMBAD database, operated at CDS, Strasbourg, France." |
| Stars | ESA Gaia DR3 (Gaia Archive TAP) | ESA/Gaia/DPAC; credit Gaia Collaboration. |
| Exoplanets | NASA Exoplanet Archive (Caltech/IPAC) | Acknowledge the NASA Exoplanet Archive. |
| Who has looked here | MAST at STScI; ESO Science Archive; NASA HEASARC master catalogue | Archive acknowledgements per each archive's policy. |
| Picture strip in the point report | CDS hips2fits | Images from the surveys above, same terms. |
| Gravitational waves and sky maps | LIGO / Virgo / KAGRA public alerts via GraceDB | Public alert data; credit the LIGO Scientific Collaboration, the Virgo Collaboration and the KAGRA Collaboration. |
| Gamma-ray flashes | Fermi GBM trigger catalogue (`fermigtrig`) via NASA HEASARC | NASA/Fermi GBM team. |
| Supernova candidates | ZTF alerts classified by the ALeRCE broker | Credit ZTF and ALeRCE. |
| The Sun | NASA SDO latest images; NOAA SWPC JSON (GOES X-ray flux, flares, Kp) | NASA/SDO and the AIA/HMI science teams; NOAA SWPC. US government works. |
| Telescope schedules | STScI JWST weekly observing schedules; Chandra X-ray Center short-term schedule; MAST recent observations | STScI; CXC/SAO. |
| Orbits | CelesTrak GP data (at most one download per group every 2 hours, as CelesTrak asks) | CelesTrak (T.S. Kelso). |
| Deep-space positions | JPL Horizons API | NASA/JPL-Caltech Solar System Dynamics. |
| Earth view imagery | Natural Earth II, bundled with CesiumJS | Natural Earth, public domain. |

## Project media

- `docs/media/lion-telescope-studio.mp4` and `docs/media/preview.webp`: the 33 s tour, recorded from the app itself. Its score is
  original, made with ACE-Step 1.5 (Apache-2.0) in [Lion AI Studios](https://github.com/sunnychase/lion-ai-studios). The images
  in it are the surveys and showpieces credited above, shown under the same terms.

## Trademarks

Names of observatories, missions and agencies are used only to say where data comes from. Their logos are not used. "Lion
Telescope Studio" is the name of this project.

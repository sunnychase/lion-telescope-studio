# Changelog

Updates to Lion Telescope Studio, newest first. The project has no version numbers; each entry is dated.

## 2026-10-16 — Support section

- README: a **Support the project** section with the Stripe donation link, a GitHub stars badge and a star-history chart.

## 2026-10-16 — First public release

- **The sky in every kind of light**: a twelve-step spectrum ladder from Fermi gamma rays to radio, with sharper surveys
  swapped in when you zoom in; a library of 38 more surveys; 13 showpieces from JWST, Hubble, Euclid, Rubin and MeerKAT;
  name and coordinate search; shareable view links.
- **Point report**: SIMBAD objects, the spot in nine surveys (hips2fits), Gaia DR3 stars, NASA Exoplanet Archive planets, and
  which telescopes have looked there (MAST, ESO archive, HEASARC).
- **Live**: LIGO-Virgo-KAGRA alerts with 50 % / 90 % sky regions, Fermi GBM triggers, ALeRCE supernova candidates, the Sun
  (SDO images, NOAA SWPC X-ray flux, flares and Kp).
- **Telescopes**: where JWST and Chandra are pointing now, recent Hubble and TESS pointings, an Earth view of about fifty
  observatories and the telescopes in orbit.
- **Tonight**: sunset, darkness, the Moon and the planets for any city, with the horizon drawn on the sky.
- One standard-library Python server with polite disk caching; settings as `SKY_*` variables (`telescope.env.example`);
  a systemd user unit; CI checks. Licence GPL-3.0-or-later (the page bundles Aladin Lite, GPL-3.0).

# Contributing to Lion Telescope Studio

Thanks for helping. Bug reports, fixes, new sources, documentation and focused features are all welcome.

## Before you start

- **Bugs and ideas:** open an [issue](https://github.com/sunnychase/lion-telescope-studio/issues) with the bug or feature form.
  Search first; one problem or idea per issue.
- **Security problems:** do not open a public issue; see [SECURITY.md](SECURITY.md).
- **Bigger changes** (a new archive or service, a change to caching): open an issue first so the approach can be agreed before
  you spend time on it. Say what the provider's terms and rate limits are.

## Running it locally

```bash
SKY_PORT=8651 SKY_CACHE_DIR=/tmp/lts-dev-cache python3 server.py      # a development copy with its own cache
```

The server uses only the Python standard library. Files under `static/` are read on every request, so page changes show up on
reload (if you ran `scripts/precompress.py`, re-run it or delete the stale `.gz` files: the server only uses a `.gz` that is at
least as new as its source). Python changes need a restart. `window.LTS` in the browser console is the app state.

Please be polite to the providers while you develop: keep a cache directory between runs, and do not loop requests against
MAST, ESO, HEASARC, GraceDB or CelesTrak (at most one download per group every 2 hours).

## House rules

- **Machine settings are `SKY_*` environment variables** (see `telescope.env.example`). Paths, ports and addresses never go into
  the code; a new setting gets a safe default in `server.py` and a commented line in `telescope.env.example`.
- **No personal or machine-specific data**: no home-directory paths, host names, private addresses, user names, tokens or
  e-mail addresses, in code, docs, comments, screenshots or commit messages.
- **The server stays standard-library only.**
- **Not an open proxy.** Every upstream URL is a template in the code; every parameter from the browser is clamped or checked
  against a strict pattern.
- **Respect the providers.** Cache every upstream, honour their rate rules, keep their credits, and list the source and its
  terms in NOTICE.md (say if it is non-commercial or all-rights-reserved).
- **`static/vendor/` is third-party code, unmodified.** Update it from the published package and record the version in its
  `VERSION.txt`.
- **Licence.** Contributions are under GPL-3.0-or-later, like the rest of the repository.
- **Say what changed**: a dated entry in [CHANGELOG.md](CHANGELOG.md), and README updates when behaviour, settings or
  requirements change.

## Checks

Run before every commit. CI (`.github/workflows/ci.yml`) runs the same script on every push and pull request:

```bash
bash scripts/check.sh            # or one part: py | js | hygiene
```

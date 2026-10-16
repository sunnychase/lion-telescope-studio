# Security policy

## Reporting a vulnerability

Please report security problems **privately**, through **Report a vulnerability** in this repository's **Security** tab
(GitHub private vulnerability reporting). Do not open a public issue, and do not post exploit details anywhere public.

Include what is affected, how to reproduce it, what an attacker could do with it, and the commit you tested. Remove personal
paths and addresses from logs before you send them. You will get an acknowledgement, and the fix and its disclosure will be
coordinated with you.

There are no releases or version numbers: fixes go to `main` and are listed in [CHANGELOG.md](CHANGELOG.md).

## What the app is built for

Lion Telescope Studio is a viewer for **one person or a trusted local network**. Please keep these boundaries in mind:

- **No secrets.** Every upstream is public and keyless. The app has no keys, tokens or accounts to leak.
- **No login.** The server listens on `127.0.0.1` by default and has no accounts. Anyone who can reach its port can use every
  feature. To use it from another device, put it behind an authenticating reverse proxy or tunnel; never expose it bare to a
  network you do not trust.
- **Not an open proxy.** Every upstream URL is a fixed template; numbers from the browser are clamped and names are checked
  against strict patterns before use. A way to make the server fetch an arbitrary URL is a vulnerability: please report it.
- **Bounded work.** New point lookups are rate-limited per client and name lookups server-wide; answers are cached on disk.
- **Static files** are served only from `static/`, with path normalisation and a real-path check.

Reports we especially want: reaching an upstream URL the code does not intend, reading files outside `static/` or the cache,
requests that make the server use unbounded memory, disk or upstream traffic, and script injection through upstream data
shown in the page.

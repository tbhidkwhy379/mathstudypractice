# Unblocker third-party notices

The Unblocker builds these pinned packages into public static asset folders:

- `@mercuryworkshop/scramjet@1.1.0` — Scramjet browser proxy engine; AGPL-3.0-only.
- `@mercuryworkshop/bare-mux@2.1.9` — BareMux transport multiplexer; MIT. This is the BareMux generation used by the supplied Scramjet v1 browser code.
- `@mercuryworkshop/libcurl-transport@1.5.2` — Libcurl/Wisp transport for the BareMux interface; AGPL-3.0.
- `@mercuryworkshop/epoxy-transport@2.1.28` — Epoxy/Wisp fallback for the BareMux interface; AGPL-3.0.

These versions are intentionally pinned as a compatible Scramjet v1 + BareMux 2.x set. Do not upgrade transport package major versions independently or mix them with the newer Scramjet controller / proxy-transports interface.

Run `npm install` followed by `npm run build:unblocker` to copy browser assets into `public/scram`, `public/baremux`, `public/libcurl` and `public/epoxy`.

The Wisp endpoint is hosted separately at `wss://proxy-scramjet-8xz5.onrender.com/wisp/`.

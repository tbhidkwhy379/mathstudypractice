# Unblocker third-party notices

The Unblocker builds these pinned packages into the public static asset folders:

- `@titaniumnetwork-dev/ultraviolet@3.2.10` — Ultraviolet proxy engine; AGPL-3.0.
- `@mercuryworkshop/bare-mux@2.1.9` — BareMux transport multiplexer; MIT. This release is deprecated upstream but is the BareMux generation used by Ultraviolet 3.x.
- `@mercuryworkshop/libcurl-transport@1.5.2` — Libcurl/Wisp transport for the BareMux interface; AGPL-3.0.
- `@mercuryworkshop/epoxy-transport@2.1.28` — Epoxy/Wisp fallback for the BareMux interface; AGPL-3.0.

The versions are intentionally pinned as a compatible Ultraviolet 3.x + BareMux 2.x set. Do not upgrade libcurl to 2.x or epoxy to 3.x without also migrating away from BareMux to the newer proxy-transports interface.

Run `npm install` followed by `npm run build:unblocker` to copy the package browser assets into `public/uv`, `public/baremux`, `public/libcurl`, and `public/epoxy`.

The Wisp endpoint is hosted separately at `wss://proxy-scramjet-8xz5.onrender.com/wisp/`.

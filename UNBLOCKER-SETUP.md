# Neural UBG Unblocker setup

The Unblocker is an additional page inside `app.html`. It reuses the existing Firebase email/password Chat account; it does not create a separate account system. Cloud Computer / Hyperbeam remains a separate page.

## Build

The GitHub Pages workflow runs:

```sh
npm install --no-audit --no-fund
npm run build:unblocker
```

The build script copies the pinned browser assets into:

- `public/uv/`
- `public/baremux/`
- `public/libcurl/`
- `public/epoxy/`

It validates the expected entry files and writes `public/unblocker-assets.json`. The Pages workflow then includes these assets in the deployment artifact. It also copies `app.html` to `404.html` as the GitHub Pages deep-route fallback; `_redirects` is retained for Cloudflare Pages or Netlify deployments.

## Runtime

- Ultraviolet service prefix: `/uv/service/`
- Root service worker: `/sw.js`
- Wisp WebSocket endpoint: `wss://proxy-scramjet-8xz5.onrender.com/wisp/`
- Primary transport: Libcurl through BareMux
- Fallback transport: Epoxy through BareMux

The Unblocker UI checks the same verified Firebase Chat session before it lets the user launch a URL. This is a frontend route gate. **It does not authenticate a direct connection to the public Wisp server**; enforcing account access against someone who connects to Wisp outside Neural UBG requires adding Firebase ID-token verification / per-user connection controls to the Render Wisp server itself.

## Compatibility note

The pinned versions deliberately match the Ultraviolet 3.x + BareMux transport interface:

- `@titaniumnetwork-dev/ultraviolet@3.2.10`
- `@mercuryworkshop/bare-mux@2.1.9`
- `@mercuryworkshop/libcurl-transport@1.5.2`
- `@mercuryworkshop/epoxy-transport@2.1.28`

Do not upgrade the transport package major versions independently. Ultraviolet 3.x uses BareMux; newer transport major versions target a different interface.

The requested no-iframe full-page navigation is implemented. Upstream Ultraviolet guidance warns that BareMux can occasionally lose its transport MessagePort after full-page navigation and recommends an iframe for maximum reliability. This build intentionally keeps the requested no-iframe design, so some sites may still need a transport/session adjustment.

# Neural UBG Unblocker setup

The Unblocker is built into `app.html`. It uses the existing Firebase email/password Chat account; it does not create a separate account system. Cloud Computer / Hyperbeam remains separate.

## Static build

GitHub Pages serves the frontend, Scramjet browser assets and service worker as static files. GitHub Actions runs:

```sh
npm install --no-audit --no-fund
npm run build:unblocker
```

The build copies the pinned browser assets into `public/scram/`, `public/baremux/`, `public/libcurl/` and `public/epoxy/`. The deployment mirrors the runtime folders to root paths and copies `app.html` to `404.html` for GitHub Pages fallback handling.

## Runtime

- Scramjet URL prefix: `/scramjet/`
- Root service worker: `/scramjet-sw.js` (scope `/`)
- Wisp WebSocket endpoint: `wss://proxy-scramjet-8xz5.onrender.com/wisp/`
- Primary transport: Libcurl through BareMux
- Fallback transport: Epoxy through BareMux

The page initializes Scramjet with an explicit `/scramjet/` prefix. After the controller saves its configuration to IndexedDB, it performs a worker handshake; the service worker reloads the stored configuration and confirms the prefix and WASM path before any website is opened.

GitHub Pages is static: it serves the Scramjet runtime and app files. The Wisp WebSocket service is hosted separately on Render. Static hosting cannot itself accept Wisp WebSocket connections.

The Unblocker checks the same verified Firebase Chat session before initialization. This is a frontend route gate. **It does not authenticate direct connections to the public Wisp server**; enforcing account access for direct Wisp clients requires Firebase ID-token verification and per-user connection controls on the Render Wisp server.

## Pinned compatible packages

The supplied browser code uses the Scramjet v1 controller API (`$scramjetLoadController` / `ScramjetController`) with BareMux. These exact compatible versions are pinned:

- `@mercuryworkshop/scramjet@1.1.0`
- `@mercuryworkshop/bare-mux@2.1.9`
- `@mercuryworkshop/libcurl-transport@1.5.2`
- `@mercuryworkshop/epoxy-transport@2.1.28`

Do not mix these BareMux-era transport versions with the newer Scramjet 2.x / proxy-transports packages.

The Scramjet browser appears inside Neural UBG by default. Use its Fullscreen button to expand the browser and toolbar to the full display; press Escape or use Exit fullscreen to return.

# Scramjet Wisp backend only

This service exposes the Wisp WebSocket endpoint at `/wisp/` and does not serve the Scramjet demo frontend.

## Render setup

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- The service listens on `0.0.0.0` using Render's `PORT` environment variable.

## Health check / cron job

Use the full Render service URL with **`/health` at the end**, for example:

`https://YOUR-RENDER-SERVICE.onrender.com/health`

The endpoint accepts GET and HEAD requests and returns HTTP `200` with a small JSON status response. `/health/` also works.

**Do not use the bare service URL or `/` as the cron URL.** The root path intentionally returns HTTP `404` because this is a backend-only service, not a website. The health check path is `/health`.

## Wisp connection

After deployment, configure your frontend transport to use your Render URL, for example:

`wss://YOUR-RENDER-SERVICE.onrender.com/wisp/`

Do not use the GitHub Pages host as the Wisp endpoint. GitHub Pages cannot host the Wisp server.

The backend prefers IPv4 DNS results for outbound Wisp TCP streams. This avoids selecting an IPv6 destination first on hosting environments where outbound IPv6 may not be available. Wisp network warnings are enabled in the Render logs.

## Important about MessagePort errors

This backend-only setup cannot guarantee a client-side `MessagePort` error is fixed by itself. That error can also result from a frontend/service-worker version mismatch, an incorrect Wisp URL, or the browser/network blocking the WebSocket. Confirm that the deployed endpoint is reachable and that the frontend's Scramjet/BareMux versions match the installed package versions.

This backend-only setup does not disguise traffic or bypass network restrictions.

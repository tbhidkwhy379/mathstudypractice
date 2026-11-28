# Scramjet implementation context for AI assistants

Last updated: 2026-11-28

This file explains the Scramjet-only local identifier scrambling in `app.html`. Read this before editing the Web Unblocker. The scrambled names are ordinary JavaScript identifiers; they are not encryption and do not protect source code or site content from scraping.

## Scope and safety rules

- Only the Scramjet/Web Unblocker inline script is identifier-scrambled.
- User-facing text, HTML IDs/classes, Scramjet package names, Wisp URLs, route prefixes, storage names, public browser APIs, and the rest of the site are intentionally left readable.
- Do not rename public API properties, DOM IDs, Scramjet configuration keys, Wisp protocol fields, or values persisted by the browser.
- When changing a scrambled local identifier, update this mapping in the same commit.
- Keep the Scramjet v1 generation consistent with the current BareMux/transport package generation. Do not mix Scramjet v2 examples or packages into this app without a deliberate migration.
- Identifier scrambling is only cosmetic. A scraper can still download public HTML/JS, inspect runtime behavior, and access public assets. Never put secrets or authorization decisions in frontend code.

## Scramjet local identifier map

| Scrambled identifier | Meaning |
|---|---|
| `_0x51a2` | Promise that represents the in-progress Scramjet initialization; reused to avoid duplicate setup |
| `_0x7b30` | BareMux connection instance used to select the Wisp transport |
| `_0x8f21` | ScramjetController instance |
| `_0xa14c` | Scramjet frame/controller returned by `createFrame()` |
| `_0x3e91` | Local helper that gets an element by DOM ID |
| `_0x2c80` | Element that displays Web Unblocker status text |
| `_0x9d12` | Status indicator dot element |
| `_0x6a45` | Open Website form submit button |
| `_0x4f2b` | Updates status text and ready/error styling |
| `_0x8d03` | Reads a service worker script's pathname |
| `_0x0b71` | Promise-based delay helper |
| `_0x4a6e` | Waits for a condition until it succeeds or times out |
| `_0x6c1f` | Checks/repairs the Scramjet IndexedDB object stores |
| `_0x92d0` | Loads a Scramjet JavaScript asset |
| `_0x1e5a` | Registers and waits for the Scramjet service worker |
| `_0x7c42` | Performs the page-to-service-worker Scramjet config handshake |
| `_0x3d8e` | Tries transport module paths until BareMux accepts a transport |
| `_0x8a20` | Initializes BareMux, transport, Scramjet controller and worker |
| `_0x1f67` | Normalizes a typed URL or search phrase into a destination URL |
| `_0x2e4b` | Creates and mounts the Scramjet iframe once |
| `_0x9c31` | Opens a destination in the Scramjet frame |
| `_0x6d84` | Updates the Fullscreen button label and accessibility state |
| `_0x4b09` | Enters/exits native fullscreen or the CSS fallback |
| `_0x8c12` | Updates the Scramjet Mute button label and accessibility state |
| `_0x2d73` | Applies/removes mute on HTML audio/video elements in the proxied frame |

## Readable configuration that must remain stable

- `WISP_URL`: Render-hosted Wisp WebSocket endpoint.
- `SCRAMJET_PREFIX`: proxy route prefix; currently `/scramjet/`.
- `DEFAULT_URL`: default website opened by the browser.
- Scramjet IndexedDB database: `$scramjet`.
- Required stores: `config`, `cookies`, `redirectTrackers`, `referrerPolicies`, `publicSuffixList`.
- Service worker: `/scramjet-sw.js`, root scope.
- Frame mount: `#sj-frame-mount`.
- Frame controls: `#sj-back`, `#sj-forward`, `#sj-reload`, `#sj-mute`, `#sj-fullscreen`.

## Mute behavior and limitations

The Mute control sets `.muted` on audio/video elements it can access in the proxied iframe and observes newly added media elements. It is best-effort: some sites output audio through Web Audio, worklets, cross-origin child frames, or isolated contexts that this parent-page control cannot reliably silence. Do not describe it as a universal system-wide mute.

## Turnstile behavior

The Developer Mode gate uses Cloudflare Turnstile invisible mode. The client obtains a Turnstile token and sends it with the developer-auth request to the Gatekeeper Worker. The Gatekeeper must independently validate the token server-side with Cloudflare Siteverify before issuing a developer session token. A successful client-side callback alone is not proof of verification.

The loader now checks for an already-loaded API and polls briefly while waiting, avoiding the old missed-load-event race. It also rejects expired, timed-out, and failed challenges. Live success still depends on the Cloudflare widget hostname/site-key configuration and the Gatekeeper's Siteverify secret/configuration; those cannot be verified from this public frontend repository.

## Important security note

Do not use variable scrambling as an anti-scraping or access-control mechanism. Keep authentication, Turnstile Siteverify, rate limiting, and authorization checks on the server. Public frontend code and public static assets remain retrievable.


## Automatic stale service-worker recovery

The Scramjet startup helper (`_0x1e5a`) now detects and unregisters legacy UV workers and stale same-origin root-scope workers, registers/updates `/scramjet-sw.js`, requests immediate activation, waits for `controllerchange`, and performs one guarded automatic reload if the current tab is still controlled by the old worker. The reload guard uses session storage key `neural-scramjet-worker-reload` to prevent a reload loop. The worker listens for `$neuralScramjetSkipWaiting` and calls `skipWaiting()`; its activate handler already calls `clients.claim()`. Unrelated non-root scoped workers are left alone. This is intended to remove the need to manually close every Neural UBG tab for ordinary stale-worker upgrades.

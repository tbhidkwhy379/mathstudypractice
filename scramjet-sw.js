importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const SCRAMJET_PREFIX = "/scramjet/";

// Wait for the app to confirm that the controller saved its config. Force a
// fresh IndexedDB read so this worker also runs Scramjet's setConfig() and
// WASM initialization before the first proxied navigation.
self.addEventListener("message", event => {
  if (!event.data || event.data.$neuralScramjetConfigPing !== true) return;

  const task = (async () => {
    try {
      scramjet.config = undefined;
      await scramjet.loadConfig();

      const ready = Boolean(
        scramjet.config &&
        scramjet.config.prefix === SCRAMJET_PREFIX &&
        scramjet.config.files &&
        scramjet.config.files.wasm
      );

      event.ports?.[0]?.postMessage({
        ready,
        prefix: scramjet.config?.prefix || null,
        error: ready ? null : "The Scramjet config record is missing from IndexedDB."
      });
    } catch (error) {
      event.ports?.[0]?.postMessage({
        ready: false,
        error: error && error.message ? error.message : String(error)
      });
    }
  })();

  if (typeof event.waitUntil === "function") event.waitUntil(task);
});

async function handleScramjetRequest(event) {
  await scramjet.loadConfig();

  // Avoid the old opaque "Cannot read properties of undefined (reading 'prefix')" failure.
  if (
    !scramjet.config ||
    scramjet.config.prefix !== SCRAMJET_PREFIX ||
    !scramjet.config.files ||
    !scramjet.config.files.wasm
  ) {
    throw new Error(
      "Scramjet worker configuration is missing or invalid. Reopen app.html and let Scramjet initialize before browsing."
    );
  }

  if (scramjet.route(event)) return scramjet.fetch(event);
  return fetch(event.request);
}

self.addEventListener("message", event => {
  if (event.data && event.data.$neuralScramjetSkipWaiting === true) {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const requestUrl = new URL(event.request.url);
  // Only proxy Scramjet routes; let normal app and static-asset requests pass through.
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(SCRAMJET_PREFIX)) return;

  event.respondWith(
    handleScramjetRequest(event).catch(error => {
      console.error("[Neural Scramjet] Request failed:", error);
      return new Response(
        "Scramjet could not load this website. Check the Wisp transport connection and try again.\n" +
          (error && error.message ? error.message : String(error)),
        { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    })
  );
});

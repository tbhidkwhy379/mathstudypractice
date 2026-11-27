importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

async function handleRequest(event) {
  await scramjet.loadConfig();
  if (scramjet.route(event)) return scramjet.fetch(event);
  return fetch(event.request);
}

self.addEventListener("install", (event) => {
  // Activate the updated worker promptly so existing tabs stop using
  // the older catch-all fetch handler.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Ultraviolet owns everything under /uv/. Do not respondWith() these
  // requests here: the browser must use the matching /uv/ registration.
  if (
    requestUrl.origin === self.location.origin &&
    requestUrl.pathname.startsWith("/uv/")
  ) {
    return;
  }

  event.respondWith(handleRequest(event));
});

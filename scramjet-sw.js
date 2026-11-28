importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const SCRAMJET_PREFIX = "/scramjet/";

async function handleScramjetRequest(event) {
  await scramjet.loadConfig();
  if (scramjet.route(event)) return scramjet.fetch(event);
  return fetch(event.request);
}

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

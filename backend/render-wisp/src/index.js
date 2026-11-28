import { createServer } from "node:http";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";

// Keep Wisp network warnings visible in Render logs for diagnosing failed TCP/TLS streams.
logging.set_level(logging.WARN);

Object.assign(wisp.options, {
  allow_udp_streams: false,
  dns_method: "resolve",
  // Render instances may not have working outbound IPv6. Prefer A records so
  // Wisp does not choose an unreachable AAAA address before trying IPv4.
  dns_result_order: "ipv4first",
  hostname_blacklist: [/example\.com/],
  dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const server = createServer((req, res) => {
  // Ignore query strings and tolerate an optional trailing slash.
  const pathname = (req.url || "/").split("?")[0].replace(/\/+$/, "") || "/";

  // Lightweight health check for uptime monitors and cron jobs.
  if ((req.method === "GET" || req.method === "HEAD") && pathname === "/health") {
    const body = JSON.stringify({
      status: "ok",
      service: "scramjet-wisp-backend",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });

    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(Buffer.byteLength(body)),
      "cache-control": "no-store",
    });

    if (req.method === "HEAD") {
      res.end();
    } else {
      res.end(body);
    }
    return;
  }

  // This service is intentionally backend-only: it does not serve the demo frontend.
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Wisp backend is running. WebSocket clients connect at /wisp/.");
});

server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url || "/").split("?")[0];

  if (pathname === "/wisp/") {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
  }
});

const port = Number.parseInt(process.env.PORT || "8080", 10);
server.listen(port, "0.0.0.0", () => {
  const address = server.address();
  console.log("Wisp backend listening on port " + address.port);
  console.log("WebSocket endpoint: ws(s)://<your-render-host>/wisp/");
  console.log("Health endpoint: /health");
});

function shutdown() {
  console.log("Closing Wisp backend...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

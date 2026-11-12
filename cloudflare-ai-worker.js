export default {
  async fetch(request, env) {
    const allowedOrigin = "https://neural.qzz.io";
    const origin = request.headers.get("Origin");
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "X-Request-Id, Request-Id",
      "Vary": "Origin"
    };

    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });

    if (origin && origin !== allowedOrigin) {
      return new Response("Forbidden origin", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (!env.COARENA_API_KEY) {
      return json({ error: "Worker secret COARENA_API_KEY is not configured" }, 500);
    }

    const path = new URL(request.url).pathname.replace(/\\/+$/, "") || "/";

    try {
      if (path === "/feedback") {
        const input = await request.json();
        const requestId = typeof input.request_id === "string" ? input.request_id.trim() : "";
        const rating = input.rating;

        if (!requestId || !(rating === "up" || rating === "down" || rating === null)) {
          return json({ error: "Expected request_id and rating ('up', 'down', or null)" }, 400);
        }

        const upstream = await fetch("https://coarena.ai/api/v1/feedback", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.COARENA_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ request_id: requestId, rating })
        });

        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: {
            ...corsHeaders,
            "Content-Type": upstream.headers.get("Content-Type") || "application/json",
            "Cache-Control": "no-store"
          }
        });
      }

      if (path !== "/") {
        return json({ error: "Not found" }, 404);
      }

      const input = await request.json();
      if (!Array.isArray(input.messages) || input.messages.length === 0) {
        return json({ error: "Expected a non-empty messages array" }, 400);
      }

      const upstream = await fetch("https://coarena.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.COARENA_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: input.model || "claude-haiku-5-5",
          messages: input.messages,
          stream: input.stream === true
        })
      });

      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
      headers.set("Cache-Control", "no-store");
      const requestId = upstream.headers.get("X-Request-Id") || upstream.headers.get("Request-Id");
      if (requestId) headers.set("X-Request-Id", requestId);

      // Keep the upstream stream intact; do not call upstream.json().
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers
      });
    } catch (error) {
      return json({ error: { message: error && error.message ? error.message : "Worker request failed" } }, 500);
    }
  }
};

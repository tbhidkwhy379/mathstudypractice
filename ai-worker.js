const ALLOWED_ORIGIN = "https://neural.qzz.io";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "x-ai-provider, x-request-id, request-id, retry-after",
  "Vary": "Origin",
  "Cache-Control": "no-store"
};

const TUTOR_SYSTEM_PROMPT = [
  "You are the AI tutor inside MathStudy Practice.",
  "Help students understand, practise and improve rather than merely dumping answers.",
  "For maths, show clear step-by-step working, explain why each step is valid, and check arithmetic.",
  "Adapt explanations to the student's apparent level; use simple language first and add depth when useful.",
  "When checking a student's work, identify the exact first mistake and explain how to correct it.",
  "When asked to make practice questions, include a range of difficulty and keep answers separate unless asked.",
  "Be encouraging but honest. If a question is ambiguous, ask one concise clarification.",
  "Do not invent facts, sources, formulas or capabilities. State uncertainty when needed.",
  "Use Markdown and LaTeX where they make explanations clearer."
].join(" ");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
  });
}

function hasImageInput(messages) {
  return messages.some(message => Array.isArray(message.content) &&
    message.content.some(part => part && (
      part.type === "image_url" || part.type === "image"
    )));
}

function providerRequest(provider, body, env) {
  const isGroq = provider === "Groq";
  const apiKey = isGroq ? env.GROQ_API_KEY : env.COARENA_API_KEY;
  const model = isGroq
    ? (env.GROQ_MODEL || "openai/gpt-oss-120b")
    : (env.COARENA_MODEL || "deepseek-v4-1-flash-1017");
  const url = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://coarena.ai/api/v1/chat/completions";

  return {
    provider,
    apiKey,
    model,
    url,
    body: { ...body, model }
  };
}

function shouldFallback(status) {
  return [401, 402, 403, 408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden origin", { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return jsonResponse({ error: { message: "Method not allowed." } }, 405);

    // Bind a Cloudflare Rate Limiting rule named AI_LIMITER to protect the shared API keys.
    if (env.AI_LIMITER && typeof env.AI_LIMITER.limit === "function") {
      try {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const limit = await env.AI_LIMITER.limit({ key: ip });
        if (!limit.success) {
          return jsonResponse({ error: { message: "Too many AI requests. Please wait a minute and try again." } }, 429);
        }
      } catch (error) {
        return jsonResponse({ error: { message: "AI rate limiting is temporarily unavailable." } }, 503);
      }
    }

    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > 250000) {
      return jsonResponse({ error: { message: "Request is too large. Please reduce the attachment size." } }, 413);
    }

    let incoming;
    try {
      const raw = await request.text();
      if (raw.length > 250000) return jsonResponse({ error: { message: "Request is too large. Please reduce the attachment size." } }, 413);
      incoming = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: { message: "Invalid JSON request body." } }, 400);
    }

    if (!incoming || !Array.isArray(incoming.messages) || incoming.messages.length === 0) {
      return jsonResponse({ error: { message: "A non-empty messages array is required." } }, 400);
    }

    const messages = [
      { role: "system", content: TUTOR_SYSTEM_PROMPT },
      ...incoming.messages.filter(message => message && message.role !== "system")
    ];
    const body = { ...incoming, messages, stream: incoming.stream !== false };
    delete body.provider;

    const imageRequest = hasImageInput(messages);
    const providers = imageRequest ? ["Coarena"] : ["Groq", "Coarena"];
    const errors = [];

    for (const providerName of providers) {
      const config = providerRequest(providerName, body, env);
      if (!config.apiKey) {
        errors.push(providerName + " is not configured (missing " + (providerName === "Groq" ? "GROQ_API_KEY" : "COARENA_API_KEY") + ").");
        continue;
      }

      try {
        const upstream = await fetch(config.url, {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + config.apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(config.body)
        });

        if (upstream.ok && upstream.body) {
          const headers = new Headers(CORS_HEADERS);
          headers.set("Content-Type", upstream.headers.get("Content-Type") || "text/event-stream; charset=utf-8");
          headers.set("X-AI-Provider", providerName);
          const requestId = upstream.headers.get("x-request-id") || upstream.headers.get("request-id");
          if (requestId) headers.set("X-Request-Id", requestId);
          const retryAfter = upstream.headers.get("retry-after");
          if (retryAfter) headers.set("Retry-After", retryAfter);
          return new Response(upstream.body, { status: upstream.status, headers });
        }

        const detail = await upstream.text().catch(() => "");
        errors.push(providerName + " returned HTTP " + upstream.status + (detail ? ": " + detail.slice(0, 500) : ""));
        if (!shouldFallback(upstream.status)) break;
      } catch (error) {
        errors.push(providerName + " connection failed: " + String(error && error.message || error));
      }
    }

    const message = imageRequest
      ? "The image-capable Coarena model could not answer. " + errors.join(" | ")
      : "Both AI providers were unable to answer. " + errors.join(" | ");
    return jsonResponse({ error: { message } }, 502);
  }
};

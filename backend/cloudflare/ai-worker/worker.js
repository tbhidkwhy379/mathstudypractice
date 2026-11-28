/*
 * Neural AI Worker
 * Deploy this file as its own Cloudflare Worker.
 *
 * Secrets (Cloudflare > Worker > Settings > Variables and Secrets):
 *   GROQ_API_KEY
 *
 * All editable, non-secret options are in the CONFIG block below.
 * Do not add API keys to this file.
 */
const CONFIG = Object.freeze({
  ALLOWED_ORIGIN: "https://neural.qzz.io",
  GROQ_CHAT_COMPLETIONS_URL: "https://api.groq.com/openai/v1/chat/completions",
  GROQ_MODEL: "openai/gpt-oss-20b",
  MAX_REQUEST_BYTES: 300000,
  MAX_MESSAGES: 200,
  MAX_OUTPUT_TOKENS: 65536,
  MAX_CONTINUATIONS: 2,
  REASONING_EFFORT: "low",
  TEMPERATURE: 0.6,
  TOP_P: 0.95
});

const encoder = new TextEncoder();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CONFIG.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-AI-Provider, X-Request-Id, Request-Id",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function buildSystemPrompt() {
  return `You are Neural, a helpful AI assistant powered by Groq.

Use efficient, minimal reasoning.
Avoid unnecessary overthinking and repetition.
Answer the user's actual question directly.

Keep responses concise by default.
Provide detailed explanations when requested or genuinely useful.

For coding tasks, provide complete working code.
Avoid unnecessary commentary around code.

Never reveal private chain-of-thought.
Provide brief conclusions instead.

Prioritise producing a useful, complete answer.
Do not waste the output budget on unnecessary analysis.`;
}

function normalizeMessages(inputMessages) {
  const messages = inputMessages.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new Error("Each message must be an object.");
    }
    const role = message.role;
    if (!["system", "user", "assistant"].includes(role)) {
      throw new Error("Unsupported message role.");
    }
    if (typeof message.content !== "string" && !Array.isArray(message.content)) {
      throw new Error("Each message needs string or array content.");
    }
    return { role, content: message.content };
  });

  const systemPrompt = buildSystemPrompt();
  const systemIndex = messages.findIndex((message) => message.role === "system");
  if (systemIndex >= 0) {
    const existing = messages[systemIndex].content;
    messages[systemIndex] = {
      role: "system",
      content: systemPrompt + (typeof existing === "string" && existing.trim()
        ? "\n\nAdditional instructions:\n" + existing
        : "")
    };
  } else {
    messages.unshift({ role: "system", content: systemPrompt });
  }
  return messages;
}

async function callGroq(env, messages) {
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured as a Cloudflare secret.");
  }
  return fetch(CONFIG.GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.GROQ_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: CONFIG.GROQ_MODEL,
      messages,
      stream: true,
      max_completion_tokens: CONFIG.MAX_OUTPUT_TOKENS,
      reasoning_effort: CONFIG.REASONING_EFFORT,
      include_reasoning: false,
      temperature: CONFIG.TEMPERATURE,
      top_p: CONFIG.TOP_P
    })
  });
}

async function enforceAiRateLimit(env, request) {
  const limiter = env.AI_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") {
    return jsonResponse({ error: "AI_RATE_LIMITER is not configured on this Worker." }, 503);
  }

  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return jsonResponse({ error: "Unable to verify request source." }, 403);

  const result = await limiter.limit({ key: ip });
  if (!result || result.success !== true) {
    return new Response(JSON.stringify({
      error: "Too many AI requests. Please wait a minute and try again."
    }), {
      status: 429,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "60"
      }
    });
  }
  return null;
}

function copyUpstreamError(response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...corsHeaders(),
      "Content-Type": response.headers.get("Content-Type") || "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function createMergedStream(initialResponse, env, originalMessages) {
  let activeReader = null;
  let cancelled = false;

  return new ReadableStream({
    async start(controller) {
      let completeAnswer = "";
      let continuationCount = 0;

      function sendPacket(packet) {
        if (cancelled) return;
        controller.enqueue(encoder.encode("data: " + JSON.stringify(packet) + "\n\n"));
      }

      function sendText(piece) {
        if (!piece || cancelled) return;
        completeAnswer += piece;
        sendPacket({
          choices: [{
            index: 0,
            delta: { content: piece },
            finish_reason: null
          }]
        });
      }

      async function readProviderStream(response) {
        if (!response.body) throw new Error("Groq returned an empty response stream.");
        const reader = response.body.getReader();
        activeReader = reader;
        const decoder = new TextDecoder();
        let buffer = "";
        let roundText = "";
        let finishReason = null;
        let streamError = null;

        function processLine(rawLine) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) return;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") return;

          let packet;
          try {
            packet = JSON.parse(data);
          } catch {
            return;
          }

          if (packet.error) {
            streamError = new Error(packet.error.message || "Groq streaming error.");
            return;
          }

          const choice = packet.choices && packet.choices[0];
          if (!choice) return;
          if (choice.finish_reason) finishReason = choice.finish_reason;

          const delta = choice.delta || choice.message || choice;
          let piece = delta.content !== undefined ? delta.content : delta.text;
          if (Array.isArray(piece)) {
            piece = piece.map((part) => part && part.text ? part.text : "").join("");
          }
          if (typeof piece === "string" && piece.length) {
            roundText += piece;
            sendText(piece);
          }
        }

        try {
          while (!cancelled) {
            const part = await reader.read();
            if (part.done) break;
            buffer += decoder.decode(part.value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            for (const line of lines) processLine(line);
            if (streamError) throw streamError;
          }

          buffer += decoder.decode();
          if (buffer.trim()) processLine(buffer);
          if (streamError) throw streamError;

          return { text: roundText, finishReason };
        } finally {
          if (activeReader === reader) activeReader = null;
        }
      }

      try {
        let upstream = initialResponse;
        while (!cancelled) {
          const result = await readProviderStream(upstream);
          const hitTokenLimit =
            result.finishReason === "length" ||
            result.finishReason === "max_tokens";

          if (!hitTokenLimit) break;

          if (continuationCount >= CONFIG.MAX_CONTINUATIONS) {
            sendText("\n\n[Automatic continuation limit reached. Send “continue” to request the rest.]");
            break;
          }

          continuationCount += 1;
          const continuationMessages = [
            ...originalMessages,
            {
              role: "assistant",
              content: completeAnswer || "[The previous generation reached its output limit before producing visible text.]"
            },
            {
              role: "user",
              content: completeAnswer
                ? "Your previous answer reached its output token limit. Continue directly from the exact point where you stopped. Do not repeat previous text, restart, or summarise. Preserve formatting and finish the original answer naturally."
                : "Your previous generation reached its output token limit before producing a visible answer. Answer the original request directly and finish it naturally."
            }
          ];

          upstream = await callGroq(env, continuationMessages);
          if (!upstream.ok) {
            const detail = await upstream.text();
            sendText("\n\n[Continuation request failed: " + detail.slice(0, 350) + "]");
            break;
          }
        }
      } catch (error) {
        if (!cancelled) {
          sendText("\n\n[Response continuation stopped: " + (error && error.message || "Unknown error") + "]");
        }
      } finally {
        if (!cancelled) {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {}
        }
      }
    },

    async cancel(reason) {
      cancelled = true;
      if (activeReader) {
        try {
          await activeReader.cancel(reason);
        } catch {}
      }
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (origin && origin !== CONFIG.ALLOWED_ORIGIN) {
      return new Response("Forbidden origin", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const rateLimitResponse = await enforceAiRateLimit(env, request);
    if (rateLimitResponse) return rateLimitResponse;

    try {
      const rawBody = await request.text();
      if (encoder.encode(rawBody).byteLength > CONFIG.MAX_REQUEST_BYTES) {
        return jsonResponse({ error: "Request is too large." }, 413);
      }

      let input;
      try {
        input = JSON.parse(rawBody);
      } catch {
        return jsonResponse({ error: "Invalid JSON request body." }, 400);
      }

      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return jsonResponse({ error: "Invalid request body." }, 400);
      }
      if (!Array.isArray(input.messages) || input.messages.length === 0) {
        return jsonResponse({ error: "Expected a non-empty messages array." }, 400);
      }
      if (input.messages.length > CONFIG.MAX_MESSAGES) {
        return jsonResponse({ error: "Too many messages in one request." }, 400);
      }

      const messages = normalizeMessages(input.messages);
      const upstream = await callGroq(env, messages);
      if (!upstream.ok) return copyUpstreamError(upstream);

      const headers = new Headers(corsHeaders());
      headers.set("Content-Type", "text/event-stream; charset=utf-8");
      headers.set("Cache-Control", "no-store, no-transform");
      headers.set("X-Accel-Buffering", "no");
      headers.set("X-AI-Provider", "Groq");

      const requestId = upstream.headers.get("x-request-id") || upstream.headers.get("request-id");
      if (requestId) headers.set("X-Request-Id", requestId);

      return new Response(
        createMergedStream(upstream, env, messages),
        { status: 200, headers }
      );
    } catch (error) {
      return jsonResponse({
        error: { message: error && error.message || "AI Worker request failed." }
      }, 502);
    }
  }
};

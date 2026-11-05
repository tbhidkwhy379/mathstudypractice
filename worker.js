const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    difference |= (a.charCodeAt(i % (a.length || 1)) || 0) ^
                  (b.charCodeAt(i % (b.length || 1)) || 0);
  }
  return difference === 0;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    const expected = env.PASSPHRASE || env.SECRET_CODE;
    if (!expected) return jsonResponse({ success: false, error: "Worker secret is not configured" }, 500);
    let payload;
    try { payload = await request.json(); }
    catch { return jsonResponse({ success: false, error: "Invalid JSON body" }, 400); }
    const supplied = payload && typeof payload.passcode === "string" ? payload.passcode : "";
    return constantTimeEqual(supplied, expected)
      ? jsonResponse({ success: true }, 200)
      : jsonResponse({ success: false }, 401);
  }
};
const ALLOWED_ORIGIN = "https://neural.qzz.io";
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const FIREBASE_SCOPE = "https://www.googleapis.com/auth/firebase.database";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeText(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function signToken(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const data = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return data + "." + base64UrlEncodeBytes(new Uint8Array(signature));
}

async function verifyToken(token, secret) {
  try {
    if (typeof token !== "string" || token.length > 4096) return false;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    const [data, signature] = parts;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(data)
    );
    if (!valid) return false;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(data)));
    return Number.isFinite(payload.exp) && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function pemToArrayBuffer(pem) {
  const base64 = String(pem || "")
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!base64) throw new Error("Missing Firebase service-account private key.");
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0)).buffer;
}

async function getFirebaseAccessToken(env) {
  const email = env.FIREBASE_CLIENT_EMAIL;
  const privateKeyPem = env.FIREBASE_PRIVATE_KEY;
  if (!email || !privateKeyPem) {
    throw new Error("Firebase service-account credentials are not configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncodeText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncodeText(JSON.stringify({
    iss: email,
    scope: FIREBASE_SCOPE,
    aud: GOOGLE_TOKEN_URI,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claims;

  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(unsigned)
  );
  const assertion = unsigned + "." + base64UrlEncodeBytes(new Uint8Array(signature));

  const form = new URLSearchParams();
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.set("assertion", assertion);

  const response = await fetch(GOOGLE_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error("Google did not issue a Firebase access token. Check the service-account key and IAM permissions.");
  }
  return result.access_token;
}

function isValidFirebaseMessageId(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,768}$/.test(value);
}

async function deleteGlobalMessage(messageId, env) {
  if (!env.FIREBASE_DATABASE_URL || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return jsonResponse({
      success: false,
      error: "Firebase admin credentials are not configured on Gatekeeper."
    }, 500);
  }
  if (!isValidFirebaseMessageId(messageId)) {
    return jsonResponse({ success: false, error: "Invalid message ID." }, 400);
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(env.FIREBASE_DATABASE_URL);
  } catch {
    return jsonResponse({ success: false, error: "Firebase database URL is invalid." }, 500);
  }
  if (
    databaseUrl.protocol !== "https:" ||
    !/(\.firebasedatabase\.app|\.firebaseio\.com)$/i.test(databaseUrl.hostname) ||
    databaseUrl.pathname !== "/"
  ) {
    return jsonResponse({ success: false, error: "Firebase database URL is not an allowed Realtime Database URL." }, 500);
  }

  try {
    const accessToken = await getFirebaseAccessToken(env);
    const target = new URL(
      "/classroomspot-chat/messages/" + encodeURIComponent(messageId) + ".json",
      databaseUrl.origin
    );
    target.searchParams.set("access_token", accessToken);

    const response = await fetch(target.toString(), { method: "DELETE" });
    if (!response.ok) {
      return jsonResponse({
        success: false,
        error: "Firebase rejected the delete request. Check the service-account database permissions."
      }, 502);
    }
    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error && error.message ? error.message : "Could not delete the global chat message."
    }, 502);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden origin", {
        status: 403,
        headers: { "Vary": "Origin", "Cache-Control": "no-store" }
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid request body." }, 400);
    }

    // Preserve the existing website password check.
    if (!body.action) {
      const valid = !!env.PASSPHRASE &&
        typeof body.passcode === "string" &&
        body.passcode === env.PASSPHRASE;
      return jsonResponse({ success: valid }, valid ? 200 : 401);
    }

    // Issue a four-hour Developer Mode token.
    if (body.action === "developer-auth") {
      if (!env.DEV_PASSPHRASE || !env.DEV_TOKEN_SECRET) {
        return jsonResponse({ success: false, error: "Developer authentication is not configured." }, 500);
      }
      if (body.passcode !== env.DEV_PASSPHRASE) {
        return jsonResponse({ success: false }, 401);
      }

      const token = await signToken({
        exp: Date.now() + 4 * 60 * 60 * 1000
      }, env.DEV_TOKEN_SECRET);
      return jsonResponse({ success: true, token });
    }

    // Check an existing Developer Mode session.
    if (body.action === "developer-verify") {
      const valid = !!env.DEV_TOKEN_SECRET &&
        await verifyToken(body.token || "", env.DEV_TOKEN_SECRET);
      return jsonResponse({ success: valid }, valid ? 200 : 401);
    }

    // Only a valid Developer Mode token can reach the Firebase admin delete.
    if (body.action === "developer-delete-message") {
      const valid = !!env.DEV_TOKEN_SECRET &&
        await verifyToken(body.token || "", env.DEV_TOKEN_SECRET);
      if (!valid) return jsonResponse({ success: false, error: "Developer session is invalid or expired." }, 401);
      return deleteGlobalMessage(body.messageId, env);
    }

    return jsonResponse({ success: false, error: "Unknown action." }, 400);
  }
};

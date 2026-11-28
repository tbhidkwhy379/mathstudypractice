const ALLOWED_ORIGIN = "https://neural.qzz.io";

const DEV_TOKEN_TTL_SECONDS = 4 * 60 * 60;
const MAX_DASHBOARD_USERS = 100;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* =========================================================
   RESPONSE AND CORS
========================================================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

function errorResponse(message, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
}

/* =========================================================
   GENERAL HELPERS
========================================================= */

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlEncodeText(value) {
  return base64UrlEncodeBytes(encoder.encode(value));
}

function base64UrlDecodeBytes(value) {
  let base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  base64 += "=".repeat((4 - base64.length % 4) % 4);

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function safeFirebaseKey(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,256}$/.test(value);
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a ?? ""));
  const right = encoder.encode(String(b ?? ""));

  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    difference |= (left[i] || 0) ^ (right[i] || 0);
  }

  return difference === 0;
}

/* =========================================================
   FIREBASE DATABASE CONFIGURATION
========================================================= */

function getFirebaseDatabaseUrl(env) {
  const raw = String(env.FIREBASE_DATABASE_URL || "").trim();

  if (!raw) {
    throw new Error("FIREBASE_DATABASE_URL is missing.");
  }

  const url = new URL(raw);

  const validHost =
    url.hostname.endsWith(".firebasedatabase.app") ||
    url.hostname.endsWith(".firebaseio.com");

  if (
    url.protocol !== "https:" ||
    !validHost ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "FIREBASE_DATABASE_URL is not a valid Firebase database root URL."
    );
  }

  return url.origin;
}

function getFirebaseProjectId(env) {
  if (env.FIREBASE_PROJECT_ID) {
    return String(env.FIREBASE_PROJECT_ID).trim();
  }

  const hostname = new URL(getFirebaseDatabaseUrl(env)).hostname;

  const regionalMatch = hostname.match(
    /^(.+)-default-rtdb(?:\.|$)/
  );

  if (regionalMatch) {
    return regionalMatch[1];
  }

  const legacyMatch = hostname.match(
    /^([^.]+)\.firebaseio\.com$/
  );

  if (legacyMatch) {
    return legacyMatch[1];
  }

  throw new Error(
    "Could not determine the Firebase project ID. Set FIREBASE_PROJECT_ID."
  );
}

/* =========================================================
   GOOGLE SERVICE ACCOUNT TOKEN
========================================================= */

async function getFirebaseAccessToken(env) {
  const email = String(env.FIREBASE_CLIENT_EMAIL || "").trim();

  const privateKeyPem = String(
    env.FIREBASE_PRIVATE_KEY || ""
  ).replace(/\\n/g, "\n");

  if (!email || !privateKeyPem) {
    throw new Error("Firebase service-account credentials are missing.");
  }

  const privateKeyContent = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const privateKeyBytes = base64UrlDecodeBytes(
    privateKeyContent
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);

  const jwtHeader = base64UrlEncodeText(JSON.stringify({
    alg: "RS256",
    typ: "JWT"
  }));

  const jwtClaims = base64UrlEncodeText(JSON.stringify({
    iss: email,
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/firebase.database",
      "https://www.googleapis.com/auth/identitytoolkit"
    ].join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));

  const unsignedJwt = jwtHeader + "." + jwtClaims;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(unsignedJwt)
  );

  const assertion =
    unsignedJwt + "." +
    base64UrlEncodeBytes(new Uint8Array(signature));

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    throw new Error(
      "Google authentication failed: " +
      (data.error_description || data.error || response.status)
    );
  }

  return data.access_token;
}

/* =========================================================
   FIREBASE REALTIME DATABASE REQUESTS
========================================================= */

async function firebaseRequest(
  env,
  accessToken,
  pathParts,
  method = "GET",
  body
) {
  const databaseUrl = getFirebaseDatabaseUrl(env);

  const path = pathParts
    .map(part => encodeURIComponent(String(part)))
    .join("/");

  const options = {
    method,
    headers: {
      Authorization: "Bearer " + accessToken
    }
  };

  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(
    databaseUrl + "/" + path + ".json",
    options
  );

  const raw = await response.text();
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const detail =
      typeof data === "string"
        ? data
        : data?.error || response.statusText;

    throw new Error(
      "Firebase request failed (" + response.status + "): " + detail
    );
  }

  return data;
}

/* =========================================================
   DEVELOPER MODE TOKEN SYSTEM
========================================================= */

async function getDeveloperTokenKey(env) {
  const secret = String(env.DEV_TOKEN_SECRET || "");

  if (!secret) {
    throw new Error("DEV_TOKEN_SECRET is missing.");
  }

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign", "verify"]
  );
}

async function createDeveloperToken(env) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    type: "developer",
    issuedAt: now,
    expiresAt: now + DEV_TOKEN_TTL_SECONDS
  };

  const encodedPayload = base64UrlEncodeText(
    JSON.stringify(payload)
  );

  const key = await getDeveloperTokenKey(env);

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(encodedPayload)
  );

  return encodedPayload + "." +
    base64UrlEncodeBytes(new Uint8Array(signature));
}

async function verifyDeveloperToken(env, token) {
  if (typeof token !== "string" || !token) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return false;
  }

  try {
    const key = await getDeveloperTokenKey(env);

    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecodeBytes(parts[1]),
      encoder.encode(parts[0])
    );

    if (!validSignature) {
      return false;
    }

    const payload = JSON.parse(
      decoder.decode(base64UrlDecodeBytes(parts[0]))
    );

    const now = Math.floor(Date.now() / 1000);

    return (
      payload.type === "developer" &&
      Number.isFinite(payload.expiresAt) &&
      payload.expiresAt > now &&
      Number.isFinite(payload.issuedAt) &&
      payload.issuedAt <= now + 60
    );
  } catch {
    return false;
  }
}

/* =========================================================
   DEVELOPER DASHBOARD
========================================================= */

function timestampToMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 100000000000 ? value * 1000 : value;
  }

  if (typeof value === "string") {
    const numeric = Number(value);

    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 100000000000
        ? numeric * 1000
        : numeric;
    }

    const parsed = Date.parse(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

async function getFirebaseDashboardData(env) {
  const accessToken = await getFirebaseAccessToken(env);

  const profiles = await firebaseRequest(
    env,
    accessToken,
    ["classroomspot-chat", "users"]
  );

  const entries = Object.entries(profiles || {});
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const users = entries.map(([uid, profile]) => {
    const data = profile && typeof profile === "object"
      ? profile
      : {};

    const updatedAt = timestampToMillis(data.updatedAt);

    return {
      uid,
      name: String(data.name || "Guest").slice(0, 100),
      updatedAt
    };
  });

  const activeUserCount = users.filter(user =>
    user.updatedAt !== null &&
    user.updatedAt >= sevenDaysAgo &&
    user.updatedAt <= now
  ).length;

  users.sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  );

  return {
    success: true,
    userCount: entries.length,
    activeUserCount,
    users: users.slice(0, MAX_DASHBOARD_USERS),
    checkedAt: now
  };
}

/* =========================================================
   DELETE A GLOBAL CHAT MESSAGE
========================================================= */

async function deleteGlobalMessage(env, messageId) {
  if (!safeFirebaseKey(messageId)) {
    throw new Error("Invalid message ID.");
  }

  const accessToken = await getFirebaseAccessToken(env);

  await firebaseRequest(
    env,
    accessToken,
    ["classroomspot-chat", "messages", messageId],
    "DELETE"
  );

  return {
    success: true,
    deletedMessageId: messageId
  };
}

/* =========================================================
   DELETE A FIREBASE AUTH USER
========================================================= */

async function deleteFirebaseAuthUser(
  env,
  accessToken,
  uid
) {
  const projectId = getFirebaseProjectId(env);

  const response = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:delete",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        localId: uid,
        targetProjectId: projectId
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (response.ok) {
    return {
      deleted: true,
      alreadyMissing: false
    };
  }

  const errorCode = String(
    data.error?.message || data.error?.status || ""
  );

  if (errorCode.includes("USER_NOT_FOUND")) {
    return {
      deleted: false,
      alreadyMissing: true
    };
  }

  if (response.status === 403 || response.status === 401) {
    throw new Error(
      "Firebase Auth deletion was denied. Give the service account " +
      "the firebaseauth.users.delete permission."
    );
  }

  throw new Error(
    "Firebase Auth deletion failed (" +
    response.status + "): " +
    (errorCode || "Unknown Firebase Auth error.")
  );
}

/* =========================================================
   DELETE A USER AND THEIR SHARED NEURAL DATA
========================================================= */

async function deleteNeuralUser(env, rawUid) {
  const uid = String(rawUid || "").trim();

  if (!safeFirebaseKey(uid)) {
    throw new Error("Invalid user ID.");
  }

  const accessToken = await getFirebaseAccessToken(env);

  const [
    messages,
    friends,
    friendRequests,
    directMessages,
    aiChats
  ] = await Promise.all([
    firebaseRequest(
      env, accessToken, ["classroomspot-chat", "messages"]
    ),
    firebaseRequest(
      env, accessToken, ["classroomspot-chat", "friends"]
    ),
    firebaseRequest(
      env, accessToken, ["classroomspot-chat", "friendRequests"]
    ),
    firebaseRequest(
      env, accessToken, ["classroomspot-chat", "directMessages"]
    ),
    firebaseRequest(
      env, accessToken, ["classroomspot-chat", "aiChats"]
    )
  ]);

  const deletions = new Map();

  function addDeletion(...parts) {
    if (!parts.every(safeFirebaseKey)) {
      return;
    }

    deletions.set(parts.join("/"), null);
  }

  let removedGlobalMessages = 0;

  for (const [messageId, message] of Object.entries(messages || {})) {
    if (message && message.uid === uid && safeFirebaseKey(messageId)) {
      addDeletion("messages", messageId);
      removedGlobalMessages++;
    }
  }

  addDeletion("friends", uid);

  let removedFriendLinks = 0;

  for (const [otherUid, list] of Object.entries(friends || {})) {
    if (
      otherUid !== uid &&
      safeFirebaseKey(otherUid) &&
      list &&
      Object.prototype.hasOwnProperty.call(list, uid)
    ) {
      addDeletion("friends", otherUid, uid);
      removedFriendLinks++;
    }
  }

  addDeletion("friendRequests", uid);

  let removedFriendRequests = 0;

  for (const [otherUid, requests] of Object.entries(friendRequests || {})) {
    if (
      otherUid !== uid &&
      safeFirebaseKey(otherUid) &&
      requests &&
      Object.prototype.hasOwnProperty.call(requests, uid)
    ) {
      addDeletion("friendRequests", otherUid, uid);
      removedFriendRequests++;
    }
  }

  let removedDMConversations = 0;

  for (const [firstUid, conversations] of Object.entries(directMessages || {})) {
    if (!safeFirebaseKey(firstUid) || !conversations) {
      continue;
    }

    if (firstUid === uid) {
      for (const otherUid of Object.keys(conversations)) {
        if (safeFirebaseKey(otherUid)) {
          removedDMConversations++;
        }
      }

      addDeletion("directMessages", uid);
      continue;
    }

    if (
      Object.prototype.hasOwnProperty.call(conversations, uid) &&
      safeFirebaseKey(uid)
    ) {
      addDeletion("directMessages", firstUid, uid);
      removedDMConversations++;
    }
  }

  const legacyChats = aiChats && aiChats[uid]
    ? aiChats[uid]
    : {};

  const removedLegacyAiChats = Object.keys(legacyChats).length;

  addDeletion("aiChats", uid);

  const authResult = await deleteFirebaseAuthUser(
    env,
    accessToken,
    uid
  );

  addDeletion("users", uid);

  const entries = Array.from(deletions.entries());
  const batchSize = 200;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = Object.fromEntries(
      entries.slice(i, i + batchSize)
    );

    await firebaseRequest(
      env,
      accessToken,
      ["classroomspot-chat"],
      "PATCH",
      batch
    );
  }

  return {
    success: true,
    uid,
    authAccountDeleted: authResult.deleted,
    authAccountAlreadyMissing: authResult.alreadyMissing,
    removed: {
      globalMessages: removedGlobalMessages,
      friendLinks: removedFriendLinks,
      friendRequests: removedFriendRequests,
      dmConversations: removedDMConversations,
      legacyAiChats: removedLegacyAiChats,
      databasePaths: entries.length
    }
  };
}

/* =========================================================
   HYPERBEAM PRODUCTION SESSIONS
   Available environments: Browser and Android
========================================================= */

async function createHyperbeamSession(env, options = {}) {
  const apiKey = String(env.HYPERBEAM_API_KEY || "").trim();

  if (!apiKey) {
    throw new Error("HYPERBEAM_API_KEY is missing from this Worker.");
  }

  const mode = String(options.mode || "browser").toLowerCase();

  let endpoint;
  let payload;

  /* BROWSER */

  if (mode === "browser") {
    const target =
      typeof options.start_url === "string" && options.start_url.trim()
        ? options.start_url.trim()
        : "https://www.google.com";

    if (target.length > 2048) {
      throw new Error("Website address is too long.");
    }

    let parsed;

    try {
      parsed = new URL(target);
    } catch {
      throw new Error("Invalid website address.");
    }

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("Only HTTP and HTTPS website addresses are supported.");
    }

    endpoint = "/vm";

    payload = {
      start_url: parsed.href,
      region: "AS",
      offline_timeout: 300,
      width: 1280,
      height: 720,
      fps: 30
    };

  /* ANDROID */

  } else if (mode === "android") {
    const appId = String(options.app_id || "").trim();

    if (
      appId &&
      !/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(appId)
    ) {
      throw new Error("Invalid Android application ID.");
    }

    endpoint = "/android";

    payload = {
      app_id: appId
    };

  } else {
    throw new Error(
      "Unsupported environment. Choose browser or android."
    );
  }

  // Hyperbeam PRODUCTION API
  const response = await fetch(
    "https://engine.hyperbeam.com/v0" + endpoint,
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json().catch(() => ({}));

  if (
    !response.ok ||
    !data.embed_url ||
    !data.session_id ||
    !data.admin_token
  ) {
    const detail =
      data.message ||
      data.error ||
      data.detail ||
      response.statusText;

    throw new Error(
      "Hyperbeam " + mode + " session failed (" +
      response.status + "): " + detail
    );
  }

  return {
    success: true,
    mode,
    session_id: data.session_id,
    embed_url: data.embed_url,
    admin_token: data.admin_token
  };
}

/* =========================================================
   CLOUDFLARE TURNSTILE VERIFICATION
========================================================= */

async function verifyTurnstile(env, token, remoteIp) {
  const secret = String(env.TURNSTILE_SECRET_KEY || "").trim();

  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is missing from this Worker.");
  }

  if (typeof token !== "string" || !token || token.length > 4096) {
    return { success: false, reason: "missing-token" };
  }

  const form = new URLSearchParams({
    secret,
    response: token
  });

  if (remoteIp) form.set("remoteip", remoteIp);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    }
  );

  const result = await response.json().catch(() => ({}));

  return {
    success: response.ok && result.success === true,
    hostname: result.hostname || "",
    action: result.action || "",
    reason: result["error-codes"]?.join(", ") || "verification-failed"
  };
}

/* =========================================================
   MAIN REQUEST HANDLER
========================================================= */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (request.method !== "POST") {
      return errorResponse("Method not allowed.", 405);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON request body.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse("Invalid request body.", 400);
    }

    const action = typeof body.action === "string"
      ? body.action
      : "";

    try {
      /* WEBSITE ACCESS PASSCODE */

      if (!action) {
        if (!env.PASSPHRASE) {
          return errorResponse(
            "Website access passcode is not configured.",
            500
          );
        }

        if (!constantTimeEqual(body.passcode, env.PASSPHRASE)) {
          return errorResponse("Invalid access passcode.", 401);
        }

        return jsonResponse({ success: true });
      }

      /* DEVELOPER MODE LOGIN */

      if (action === "developer-auth") {
        const captcha = await verifyTurnstile(
          env,
          body.turnstileToken,
          request.headers.get("CF-Connecting-IP")
        );

        if (
          !captcha.success ||
          captcha.hostname !== "neural.qzz.io" ||
          captcha.action !== "developer_auth"
        ) {
          return errorResponse("Cloudflare verification failed. Please try again.", 403);
        }

        if (!env.DEV_PASSPHRASE) {
          return errorResponse(
            "Developer passphrase is not configured.",
            500
          );
        }

        if (!constantTimeEqual(body.passcode, env.DEV_PASSPHRASE)) {
          return errorResponse("Developer access denied.", 401);
        }

        const token = await createDeveloperToken(env);

        return jsonResponse({
          success: true,
          token,
          expiresIn: DEV_TOKEN_TTL_SECONDS
        });
      }

      /* ALL OTHER DEVELOPER ACTIONS REQUIRE A VALID TOKEN */

      const authenticated = await verifyDeveloperToken(
        env,
        body.token
      );

      if (!authenticated) {
        return errorResponse(
          "Developer session is invalid or expired. Sign in again.",
          401
        );
      }

      /* VERIFY DEVELOPER SESSION */

      if (action === "developer-verify") {
        return jsonResponse({ success: true });
      }

      /* CREATE A HYPERBEAM SESSION */

      if (action === "hyperbeam-session") {
        const result = await createHyperbeamSession(env, body);
        return jsonResponse(result);
      }

      /* LOAD USER DASHBOARD */

      if (action === "developer-dashboard") {
        const data = await getFirebaseDashboardData(env);
        return jsonResponse(data);
      }

      /* DELETE ONE GLOBAL CHAT MESSAGE */

      if (action === "developer-delete-message") {
        const result = await deleteGlobalMessage(
          env,
          body.messageId
        );

        return jsonResponse(result);
      }

      /* DELETE A USER AND THEIR SHARED DATA */

      if (action === "developer-delete-user") {
        const result = await deleteNeuralUser(env, body.uid);
        return jsonResponse(result);
      }

      return errorResponse("Unknown action.", 400);

    } catch (error) {
      return errorResponse(
        error && error.message
          ? error.message
          : "Gatekeeper request failed.",
        500
      );
    }
  }
};
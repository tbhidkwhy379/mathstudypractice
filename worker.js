const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const FIREBASE_PROJECT_ID = "ubg1-363a4";
const FIREBASE_DATABASE_URL =
  "https://ubg1-363a4-default-rtdb.asia-southeast1.firebasedatabase.app";
const SOCIAL_ROOT = "classroomspot-chat";

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

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
}

function encodeJsonBase64Url(value) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToArrayBuffer(pem) {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getFirebaseAdminAccessToken(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON Worker secret is missing.");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }

  if (serviceAccount.project_id !== FIREBASE_PROJECT_ID ||
      !serviceAccount.client_email ||
      !serviceAccount.private_key) {
    throw new Error("Firebase service account does not match the configured project.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = encodeJsonBase64Url({ alg: "RS256", typ: "JWT" });
  const claim = encodeJsonBase64Url({
    iss: serviceAccount.client_email,
    scope: [
      "https://www.googleapis.com/auth/identitytoolkit",
      "https://www.googleapis.com/auth/firebase.database"
    ].join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  });
  const unsignedJwt = header + "." + claim;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedJwt)
  );
  const assertion = unsignedJwt + "." + base64UrlEncode(new Uint8Array(signature));

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error("Could not obtain a Firebase admin access token: " +
      (result.error_description || result.error || response.status));
  }
  return result.access_token;
}

async function firebaseApiRequest(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: "Bearer " + accessToken,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Firebase API request failed (" + response.status + "): " +
      (data.error && data.error.message || "unknown error"));
  }
  return data;
}

async function removeDeletedGuestData(users, accessToken) {
  // Firebase REST PATCH supports slash-separated multi-location updates.
  // Keep each request small and only erase records for successfully deleted UIDs.
  for (let offset = 0; offset < users.length; offset += 200) {
    const group = users.slice(offset, offset + 200);
    const updates = {};
    for (const user of group) {
      const uid = user.localId;
      if (!uid) continue;
      updates["users/" + uid] = null;
      updates["friends/" + uid] = null;
      updates["friendRequests/" + uid] = null;
      updates["aiChats/" + uid] = null;
    }
    if (!Object.keys(updates).length) continue;

    await firebaseApiRequest(
      FIREBASE_DATABASE_URL + "/" + SOCIAL_ROOT + ".json",
      accessToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      }
    );
  }
}

async function purgeAnonymousChatAccounts(env) {
  const accessToken = await getFirebaseAdminAccessToken(env);
  let nextPageToken = "";
  let scanned = 0;
  let anonymousFound = 0;
  let deleted = 0;
  let deleteFailures = 0;

  do {
    const listUrl = new URL(
      "https://identitytoolkit.googleapis.com/v1/projects/" +
      FIREBASE_PROJECT_ID + "/accounts:batchGet"
    );
    listUrl.searchParams.set("maxResults", "1000");
    if (nextPageToken) listUrl.searchParams.set("nextPageToken", nextPageToken);

    const page = await firebaseApiRequest(listUrl.toString(), accessToken);
    const users = Array.isArray(page.users) ? page.users : [];
    scanned += users.length;

    // Be conservative: only delete records positively identified as anonymous.
    // Email/password, Google, phone, and any other linked provider are preserved.
    const anonymousUsers = users.filter(user =>
      typeof user.localId === "string" &&
      user.localId.length > 0 &&
      Array.isArray(user.providerUserInfo) &&
      user.providerUserInfo.length === 0 &&
      !user.email &&
      !user.phoneNumber
    );
    anonymousFound += anonymousUsers.length;

    for (let offset = 0; offset < anonymousUsers.length; offset += 1000) {
      const batch = anonymousUsers.slice(offset, offset + 1000);
      const result = await firebaseApiRequest(
        "https://identitytoolkit.googleapis.com/v1/projects/" +
          FIREBASE_PROJECT_ID + "/accounts:batchDelete",
        accessToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            localIds: batch.map(user => user.localId),
            force: true
          })
        }
      );

      const errors = Array.isArray(result.errors) ? result.errors : [];
      const failedIndexes = new Set(errors.map(error => Number(error.index)));
      const deletedUsers = batch.filter((user, index) => !failedIndexes.has(index));
      deleted += deletedUsers.length;
      deleteFailures += errors.length;

      await removeDeletedGuestData(deletedUsers, accessToken);
    }

    nextPageToken = page.nextPageToken || "";
  } while (nextPageToken);

  console.log("Friday guest cleanup finished.", {
    scanned,
    anonymousFound,
    deleted,
    deleteFailures
  });
}

function isMelbourneFridayMidnight(scheduledTime) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(scheduledTime));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.weekday === "Fri" && values.hour === "00" && values.minute === "00";
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    }
    const expected = env.PASSPHRASE || env.SECRET_CODE;
    if (!expected) {
      return jsonResponse({ success: false, error: "Worker secret is not configured" }, 500);
    }
    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }
    const supplied = payload && typeof payload.passcode === "string" ? payload.passcode : "";
    return constantTimeEqual(supplied, expected)
      ? jsonResponse({ success: true }, 200)
      : jsonResponse({ success: false }, 401);
  },

  async scheduled(controller, env) {
    if (!isMelbourneFridayMidnight(controller.scheduledTime)) {
      console.log("Guest cleanup skipped: this UTC trigger is not Friday midnight in Melbourne.");
      return;
    }
    await purgeAnonymousChatAccounts(env);
  }
};

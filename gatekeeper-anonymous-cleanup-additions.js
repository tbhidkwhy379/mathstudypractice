/*
 * Add these functions to the Gatekeeper Worker shown in the chat.
 * They reuse its existing helpers:
 *   getFirebaseProjectId(env)
 *   getFirebaseAccessToken(env)
 *   firebaseRequest(env, accessToken, pathParts, method, body)
 *   safeFirebaseKey(value)
 *
 * Only Auth accounts with no linked provider/email/phone AND a Chat profile
 * explicitly marked isAnonymous:true are eligible for the Friday cleanup.
 */

async function firebaseAuthAdminRequest(env, accessToken, methodName, method = "GET", body, query = {}) {
  const projectId = getFirebaseProjectId(env);
  const url = new URL(
    "https://identitytoolkit.googleapis.com/v1/projects/" +
    encodeURIComponent(projectId) + "/" + methodName
  );

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const options = {
    method,
    headers: { Authorization: "Bearer " + accessToken }
  };

  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = data.error?.message || data.error?.status || response.statusText;
    throw new Error("Firebase Auth " + methodName + " failed (" +
      response.status + "): " + detail);
  }

  return data;
}

async function listFirebaseAuthUsersPage(env, accessToken, nextPageToken) {
  return firebaseAuthAdminRequest(
    env, accessToken, "accounts:batchGet", "GET", undefined,
    { maxResults: 1000, nextPageToken }
  );
}

async function batchDeleteFirebaseAuthUsers(env, accessToken, uids) {
  if (!Array.isArray(uids) || !uids.length) {
    return { deletedUids: [], failedUids: [] };
  }

  const result = await firebaseAuthAdminRequest(
    env, accessToken, "accounts:batchDelete", "POST",
    { localIds: uids, force: true }
  );

  const errors = Array.isArray(result.errors) ? result.errors : [];
  const failedIndexes = new Set(
    errors.map(error => Number(error.index))
      .filter(index => Number.isInteger(index) && index >= 0)
  );
  const failedIds = new Set(
    errors.map(error => String(error.localId || "")).filter(Boolean)
  );

  const failedUids = uids.filter((uid, index) =>
    failedIndexes.has(index) || failedIds.has(uid)
  );
  const failedSet = new Set(failedUids);
  return {
    deletedUids: uids.filter(uid => !failedSet.has(uid)),
    failedUids
  };
}

async function removeDeletedAnonymousChatData(env, accessToken, rawUids) {
  const deletedUids = [...new Set(rawUids)].filter(safeFirebaseKey);
  if (!deletedUids.length) return { databasePaths: 0 };

  const deletedSet = new Set(deletedUids);
  const [messages, friends, friendRequests, directMessages] = await Promise.all([
    firebaseRequest(env, accessToken, ["classroomspot-chat", "messages"]),
    firebaseRequest(env, accessToken, ["classroomspot-chat", "friends"]),
    firebaseRequest(env, accessToken, ["classroomspot-chat", "friendRequests"]),
    firebaseRequest(env, accessToken, ["classroomspot-chat", "directMessages"])
  ]);

  const deletions = new Map();
  const addDeletion = (...parts) => {
    if (parts.every(safeFirebaseKey)) deletions.set(parts.join("/"), null);
  };

  for (const uid of deletedUids) {
    addDeletion("users", uid);
    addDeletion("friends", uid);
    addDeletion("friendRequests", uid);
    addDeletion("directMessages", uid);
    addDeletion("aiChats", uid);
  }

  for (const [messageId, message] of Object.entries(messages || {})) {
    if (safeFirebaseKey(messageId) && message &&
        deletedSet.has(String(message.uid || ""))) {
      addDeletion("messages", messageId);
    }
  }

  for (const [ownerUid, friendList] of Object.entries(friends || {})) {
    if (!safeFirebaseKey(ownerUid) || deletedSet.has(ownerUid) || !friendList) continue;
    for (const deletedUid of deletedUids) {
      if (Object.prototype.hasOwnProperty.call(friendList, deletedUid)) {
        addDeletion("friends", ownerUid, deletedUid);
      }
    }
  }

  for (const [recipientUid, requests] of Object.entries(friendRequests || {})) {
    if (!safeFirebaseKey(recipientUid) || deletedSet.has(recipientUid) || !requests) continue;
    for (const deletedUid of deletedUids) {
      if (Object.prototype.hasOwnProperty.call(requests, deletedUid)) {
        addDeletion("friendRequests", recipientUid, deletedUid);
      }
    }
  }

  // DMs are stored at /directMessages/{lowerUid}/{higherUid}/messages.
  for (const [firstUid, conversations] of Object.entries(directMessages || {})) {
    if (!safeFirebaseKey(firstUid) || !conversations || deletedSet.has(firstUid)) continue;
    for (const deletedUid of deletedUids) {
      if (deletedUid !== firstUid &&
          Object.prototype.hasOwnProperty.call(conversations, deletedUid)) {
        addDeletion("directMessages", firstUid, deletedUid);
      }
    }
  }

  const entries = [...deletions.entries()];
  for (let offset = 0; offset < entries.length; offset += 200) {
    const batch = Object.fromEntries(entries.slice(offset, offset + 200));
    await firebaseRequest(env, accessToken, ["classroomspot-chat"], "PATCH", batch);
  }

  return { databasePaths: entries.length };
}

async function purgeAnonymousChatAccounts(env) {
  const accessToken = await getFirebaseAccessToken(env);
  const profiles = await firebaseRequest(
    env, accessToken, ["classroomspot-chat", "users"]
  ) || {};

  let nextPageToken = "";
  let scanned = 0;
  let anonymousFound = 0;
  let deleted = 0;
  let deleteFailures = 0;
  let removedDatabasePaths = 0;

  do {
    const page = await listFirebaseAuthUsersPage(env, accessToken, nextPageToken);
    const users = Array.isArray(page.users) ? page.users : [];
    scanned += users.length;

    // An explicit Chat profile marker plus Firebase Auth provider data avoids
    // deleting normal accounts, including accounts upgraded from guest mode.
    const anonymousUsers = users.filter(user => {
      const uid = String(user.localId || "");
      const profile = profiles[uid];
      return safeFirebaseKey(uid) &&
        profile &&
        profile.isAnonymous === true &&
        (!Array.isArray(user.providerUserInfo) || user.providerUserInfo.length === 0) &&
        !user.email &&
        !user.phoneNumber;
    });

    anonymousFound += anonymousUsers.length;

    for (let offset = 0; offset < anonymousUsers.length; offset += 1000) {
      const batch = anonymousUsers.slice(offset, offset + 1000);
      const result = await batchDeleteFirebaseAuthUsers(
        env, accessToken, batch.map(user => user.localId)
      );

      deleted += result.deletedUids.length;
      deleteFailures += result.failedUids.length;

      // Only remove Realtime Database data for accounts Auth confirms deleted.
      const cleanup = await removeDeletedAnonymousChatData(
        env, accessToken, result.deletedUids
      );
      removedDatabasePaths += cleanup.databasePaths;
    }

    nextPageToken = page.nextPageToken || "";
  } while (nextPageToken);

  const summary = { scanned, anonymousFound, deleted, deleteFailures, removedDatabasePaths };
  console.log("Friday anonymous Chat cleanup finished.", summary);
  return summary;
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

/*
 * Merge this method into the existing export default object, alongside fetch.
 * Do not create a second default export:
 *
 * async scheduled(controller, env, ctx) {
 *   if (!isMelbourneFridayMidnight(controller.scheduledTime)) {
 *     console.log("Guest cleanup skipped; not Melbourne Friday midnight.");
 *     return;
 *   }
 *   await purgeAnonymousChatAccounts(env);
 * },
 *
 * Add this Cloudflare Cron Trigger:
 *   0 13,14 * * THU
 */

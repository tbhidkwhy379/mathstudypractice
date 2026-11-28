const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");

const FIREBASE_DATABASE_URL =
  "https://ubg1-363a4-default-rtdb.asia-southeast1.firebasedatabase.app";
const SOCIAL_ROOT = "classroomspot-chat";

initializeApp({ databaseURL: FIREBASE_DATABASE_URL });

exports.purgeAnonymousChatAccounts = onSchedule(
  {
    // Run at the start of every Friday in the site's local timezone.
    schedule: "0 0 * * 5",
    timeZone: "Australia/Melbourne",
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1
  },
  async () => {
    const auth = getAuth();
    const database = getDatabase();
    let pageToken;
    let scanned = 0;
    let anonymousFound = 0;
    let deleted = 0;
    let deleteFailures = 0;

    do {
      const page = await auth.listUsers(1000, pageToken);
      scanned += page.users.length;

      // Firebase Admin identifies anonymous accounts by an empty providerData
      // array. Linked email, Google, or other provider accounts are not deleted.
      const anonymousUsers = page.users.filter(user =>
        Array.isArray(user.providerData) &&
        user.providerData.length === 0 &&
        !user.email &&
        !user.phoneNumber
      );
      anonymousFound += anonymousUsers.length;

      for (let offset = 0; offset < anonymousUsers.length; offset += 1000) {
        const batch = anonymousUsers.slice(offset, offset + 1000);
        const result = await auth.deleteUsers(batch.map(user => user.uid));
        deleted += result.successCount;
        deleteFailures += result.failureCount;

        // Firebase reports failed batch deletions by their index. Only remove
        // database records for accounts that were actually deleted.
        const failedIndexes = new Set((result.errors || []).map(error => error.index));
        const deletedUsers = batch.filter((user, index) => !failedIndexes.has(index));

        // Remove each deleted guest's own chat profile and private account data.
        // Shared global messages are intentionally retained in the chat history.
        const updates = {};
        for (const user of deletedUsers) {
          const uid = user.uid;
          updates[`${SOCIAL_ROOT}/users/${uid}`] = null;
          updates[`${SOCIAL_ROOT}/friends/${uid}`] = null;
          updates[`${SOCIAL_ROOT}/friendRequests/${uid}`] = null;
          updates[`${SOCIAL_ROOT}/aiChats/${uid}`] = null;
        }
        if (Object.keys(updates).length) {
          await database.ref().update(updates);
        }
      }

      pageToken = page.pageToken;
    } while (pageToken);

    logger.info("Finished Friday anonymous-chat cleanup.", {
      scanned,
      anonymousFound,
      deleted,
      deleteFailures
    });
  }
);

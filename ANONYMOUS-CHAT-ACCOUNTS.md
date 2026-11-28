# Anonymous Chat Accounts

Neural Chat keeps Firebase anonymous accounts available for Chat. Guest accounts can never use Web Unblocker; Web Unblocker requires a normal account whose email has been freshly verified by Firebase.

A guest can keep the same Firebase UID, display name, and Chat identity by choosing **Create an account** while signed in as that guest. The app links the email/password credential to the anonymous account. Once linked, the Firebase account is no longer anonymous and is not eligible for Friday cleanup.

## Add cleanup to the Gatekeeper Worker

The correct target is the Gatekeeper Worker that contains the developer-token, Firebase dashboard, user-delete, and Hyperbeam actions. It is **not** the small `worker.js` in this website repository (that file only checks the website passcode).

Use the companion patch file `gatekeeper-anonymous-cleanup-additions.js`:

1. Paste its helper functions into the Gatekeeper Worker before the existing `export default`.
2. Add the `scheduled(controller, env, ctx)` method shown at the bottom of the patch inside the existing `export default` object, alongside `fetch`. Do not add a second default export.
3. Configure the following Cron Trigger in the Cloudflare dashboard for that same Gatekeeper Worker:

   ```text
   0 13,14 * * THU
   ```

   Cloudflare Cron Triggers use UTC and support named weekdays. The handler checks the scheduled time in Australia/Melbourne and only runs at local Friday midnight. The two UTC times cover both daylight-saving (AEDT) and standard-time (AEST) weeks. <https://developers.cloudflare.com/workers/configuration/cron-triggers/>

4. The patch reuses the Gatekeeper Worker's existing secrets: `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, and `FIREBASE_DATABASE_URL`. `FIREBASE_PROJECT_ID` is optional when it can be derived from the database URL.
5. The service account needs `firebaseauth.users.get` to list accounts and `firebaseauth.users.delete` to batch-delete accounts. <https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/batchGet> <https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/batchDelete>

The cleanup only targets Auth users with no linked provider, email, or phone **and** a Chat profile marked `isAnonymous: true`. It deletes the Auth account first; it only removes associated Chat data for accounts the Auth API reports as deleted. It removes the guest profile, friends, friend requests, DMs, AI-chat data, and global messages authored by that guest. Regular email/password and other linked-provider accounts are preserved.

## Guest access

The main app writes `isAnonymous: true` to the Chat profile for guests. When a guest links an email/password account, the next authenticated Chat start updates that marker to `false`. The Auth provider check is an additional safeguard.

Guests can continue using Chat until the Friday cleanup. They cannot enter Web Unblocker, and the Gatekeeper Worker does not add any guest-facing Web Unblocker action.

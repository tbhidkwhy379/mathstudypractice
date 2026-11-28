# Anonymous Chat Accounts

Neural Chat keeps Firebase anonymous accounts available for Chat. Guest accounts cannot use Web Unblocker; Web Unblocker requires a normal account whose email has been freshly verified by Firebase.

A guest can keep the same Firebase UID, display name, and Chat identity by choosing **Create an account** while signed in as that guest. The app links the email/password credential to the anonymous account. Once linked, the Firebase account is no longer anonymous and is not eligible for Friday cleanup.

## Scheduled cleanup

The weekly anonymous-account cleanup is already integrated into `gatekeeper-worker.js`. Do not apply a separate patch file.

The Gatekeeper Worker's scheduled handler checks the scheduled time in `Australia/Melbourne` and runs only at local Friday midnight. The two UTC cron entries in `wrangler.toml` cover both daylight-saving (AEDT) and standard-time (AEST) weeks:

```toml
[triggers]
crons = ["0 13 * * THU", "0 14 * * THU"]
```

The Worker reuses these secrets:

- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID` (optional when it can be derived from the database URL)

The service account needs permission to list Firebase Auth users and delete users (including the corresponding Firebase Auth / Identity Platform permissions).

The cleanup only targets Auth users with no linked provider, email, or phone **and** a Chat profile marked `isAnonymous: true`. It deletes the Auth account first, then removes associated Chat data only for accounts the Auth API reports as deleted. It removes the guest profile, friends, friend requests, DMs, AI-chat data, and global messages authored by that guest. Regular email/password and other linked-provider accounts are preserved.

## Guest access

The main app writes `isAnonymous: true` to the Chat profile for guests. When a guest links an email/password account, the next authenticated Chat start updates that marker to `false`. The Auth provider check is an additional safeguard.

Guests can continue using Chat until the Friday cleanup. They cannot enter Web Unblocker, and the Gatekeeper Worker does not add any guest-facing Web Unblocker action.

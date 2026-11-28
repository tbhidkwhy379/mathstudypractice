# Anonymous Chat Accounts

Neural Chat supports temporary Firebase anonymous users. Guests can use Chat only; Web Unblocker still requires a non-anonymous account with a verified email.

A guest can keep the same Firebase UID, display name, and chat identity by choosing **Create an account** while still signed in as that guest. The app links the email/password credential to the guest account, sends a verification email, and keeps Chat locked until Firebase confirms the email is verified. Signing in to a different account requires that account's password and a fresh Firebase auth-state check; the app does not accept a UID or profile name as proof of identity.

## Friday cleanup in Cloudflare Worker

The scheduled handler in `worker.js` deletes Firebase accounts that are still anonymous every Friday at **12:00 AM Australia/Melbourne time**. It only selects Firebase Auth records with no linked providers, email, or phone number. Accounts that have been linked to email/password or another provider are preserved.

The worker deletes the guest's profile, friend list, incoming friend requests, and cloud AI-chat record under `classroomspot-chat`. It does not delete shared global chat messages.

### One-time setup

1. In Firebase Console, open **Authentication → Sign-in method** and enable **Anonymous**.
2. In Google Cloud IAM, create or select a service account for project `ubg1-363a4`. Grant it permission to list and delete Firebase Authentication users (`firebaseauth.users.get` and `firebaseauth.users.delete`) and write to the Realtime Database. Download a JSON private key for this service account.
3. In Cloudflare, open the Worker that runs this repository's `worker.js`. Under **Settings → Variables and Secrets**, add a secret named `FIREBASE_SERVICE_ACCOUNT_JSON` and paste the complete service-account JSON as the value. Do not put the key in GitHub or browser code. Keep your existing `PASSPHRASE` / `SECRET_CODE` variables as they are.
4. Deploy the updated `worker.js` to that same Worker.
5. Configure the Cron Trigger with this schedule:

   ```text
   0 13,14 * * 5
   ```

   - For a Worker managed in the Cloudflare dashboard, go to **Settings → Triggers → Cron Triggers** and add it there.
   - For a Worker managed with Wrangler, add this to its existing `wrangler.toml`:

     ```toml
     [triggers]
     crons = ["0 13,14 * * 5"]
     ```

   Cloudflare schedules Cron Triggers in UTC. The Worker checks the scheduled timestamp in the Melbourne timezone, so only the trigger that corresponds to local Friday midnight performs the cleanup. This handles both daylight-saving and standard time.
6. Check the Worker logs after the first Friday run for `Friday guest cleanup finished.` and its deletion counts.

The scheduled cleanup is not active until the Worker code, secret, and Cron Trigger are all deployed/configured. The first run occurs at the next Friday midnight after the trigger has propagated.

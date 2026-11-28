# Anonymous Chat Accounts

Neural Chat supports temporary Firebase anonymous accounts. Guest accounts can use Chat, but they cannot use Web Unblocker. A guest can keep the same Firebase UID, chat name, and chat identity by creating an email/password account from the same browser before the weekly cleanup.

## Friday cleanup

The scheduled Firebase Function is `purgeAnonymousChatAccounts`. It runs at **12:00 AM every Friday in Australia/Melbourne time**.

It deletes Firebase Authentication users that are still anonymous (no linked sign-in provider, email, or phone number). A guest linked to an email/password account is no longer anonymous and is not deleted. The cleanup also removes the guest's own Realtime Database profile, friends list, friend requests, and cloud AI-chat record. Shared global chat messages are kept.

## One-time Firebase setup

1. In Firebase Console, open **Authentication → Sign-in method** and enable **Anonymous**.
2. Scheduled Cloud Functions require the Firebase project to use the **Blaze** billing plan and have the required Cloud Scheduler services enabled.
3. From the repository root, install the Firebase CLI, sign in, and deploy the function:

   ```sh
   npm install -g firebase-tools
   firebase login
   firebase deploy --only functions:purgeAnonymousChatAccounts
   ```

The scheduler becomes active after the function is successfully deployed. The first cleanup happens at the next Friday midnight in Melbourne time; it does not run immediately when deployed.

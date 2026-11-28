# Neural backend setup

This folder contains the backend pieces needed to deploy Neural with your own accounts. The frontend stays on GitHub Pages. Cloudflare runs the server-side code, Firebase stores chat/auth data, and Groq generates AI replies.

## Folder map

```
backend/
├── neural-config.js
├── README.md
├── .gitignore
├── cloudflare/
│   ├── ai-worker/
│   │   ├── worker.js
│   │   ├── wrangler.toml
│   │   └── .dev.vars.example
│   └── gatekeeper-worker/
│       ├── worker.js
│       ├── wrangler.toml
│       └── .dev.vars.example
├── firebase/
│   └── database.rules.json
└── render-wisp/
    ├── src/index.js
    ├── package.json
    ├── Dockerfile
    └── README.md
```

There are **two separate Cloudflare Workers** because the existing frontend uses two endpoints. Connect the same GitHub repository to each Worker as its own Cloudflare project. Set the AI Worker root directory to `backend/cloudflare/ai-worker` and the Gatekeeper Worker root directory to `backend/cloudflare/gatekeeper-worker`. Each folder has its own Wrangler file and Worker name.

- **AI Worker**: receives chat messages and calls Groq.
- **Gatekeeper Worker**: checks website and Developer Mode passcodes, verifies Turnstile, creates Hyperbeam sessions, and handles the protected Firebase dashboard and weekly guest cleanup.

The two Workers can be deployed independently. The Scramjet Wisp WebSocket backend is included as a separate Node/Render service under `render-wisp/`.

---

## 1. Create your Firebase account and project

1. Open [Firebase Console](https://console.firebase.google.com/) and sign in with a Google account.
2. Choose **Add project** and create a Firebase project.
3. In Project settings, add a **Web app**. Firebase will show a configuration object.
4. Open `backend/neural-config.js` and replace the values under `firebase` with your Web app config.
5. In Firebase, open **Authentication → Sign-in method** and enable:
   - Email/Password
   - Anonymous
6. In **Authentication → Settings → Authorized domains**, add the domain where your frontend is hosted (for example, `neural.qzz.io`).
7. Open **Realtime Database**, create a database, and choose its region.
8. Copy the database's root URL into `firebase.databaseURL` in `backend/neural-config.js`.
9. Open **Realtime Database → Rules** and publish the full contents of `backend/firebase/database.rules.json`.

The rules keep messages tied to the signed-in UID. Direct-message reads and writes require a friendship entry, and a user cannot create an arbitrary friend entry without the matching friend-request flow. Do not replace these rules with public read/write access.

### Firebase service account for the Gatekeeper Worker

The Gatekeeper Worker needs server-side access to read/write the Realtime Database and manage Firebase Authentication users for the Developer dashboard and guest cleanup.

1. Open the Firebase project's **Project settings → Service accounts** (or its linked Google Cloud project).
2. Create or select a service account and give it the permissions required to read/write this project's Realtime Database and list/delete Firebase Authentication users.
3. Generate a private key JSON file.
4. Keep that JSON file on your computer only. **Never upload it to GitHub or put it in `neural-config.js`.**
5. In Cloudflare, copy the service-account `client_email` and `private_key` values into the Gatekeeper Worker secrets listed below. The private key may be entered with real newlines or escaped `\n` newlines.

The Firebase Web app `apiKey` in `neural-config.js` is public client configuration, not a server-admin key. The service-account private key is secret.

---

## 2. Create a Groq account and API key

1. Open [Groq Console](https://console.groq.com/).
2. Create/sign in to your account.
3. Open the API Keys area and create a key.
4. Copy it somewhere safe. Do not paste it into frontend code or this repository.

The AI Worker uses the model configured at the top of `backend/cloudflare/ai-worker/worker.js`:

```js
const CONFIG = Object.freeze({
  ALLOWED_ORIGIN: "https://neural.qzz.io",
  GROQ_CHAT_COMPLETIONS_URL: "https://api.groq.com/openai/v1/chat/completions",
  GROQ_MODEL: "openai/gpt-oss-20b",
  // ...
});
```

Change the origin, API URL, model, or token limits there. Put the actual API key into Cloudflare as the secret `GROQ_API_KEY`.

---

## 3. Connect the AI Worker to GitHub (Worker 1 of 2)

These are **two separate Cloudflare Workers**, not one Worker with two routes. Both can connect to the same GitHub repository, but each Worker must use its own root directory and its own `wrangler.toml`.

For the AI Worker:

1. In Cloudflare, open **Workers & Pages → Create application → Connect to Git**.
2. Select this GitHub repository and the `main` branch.
3. Set the **Worker name** to exactly `neural-ai` (it must match the `name` field in its Wrangler file).
4. Set **Root directory** to `backend/cloudflare/ai-worker`.
5. Leave the build command empty. Use `npx wrangler deploy` as the deploy command.
6. Save and deploy. Cloudflare should detect `wrangler.toml` and deploy `worker.js`.
7. Open this Worker → **Settings → Variables and Secrets** and add a **Secret**:
   - Name: `GROQ_API_KEY`
   - Value: your Groq API key
8. Redeploy after adding the secret.
9. Copy the Worker URL (it usually ends in `.workers.dev`).

Open `backend/neural-config.js` and set `aiApiUrl` to that URL, including the trailing slash.

The AI Worker's `wrangler.toml` also declares the `AI_RATE_LIMITER` binding. Use a unique `namespace_id` for this Worker if you change it.

---

## 4. Create the Cloudflare Turnstile widget

1. In Cloudflare, open **Turnstile** and create a widget.
2. Add the exact frontend hostname (for example, `neural.qzz.io`) to the widget.
3. Copy its **site key** into `turnstileSiteKey` in `backend/neural-config.js`.
4. Copy its **secret key**. This goes into the Gatekeeper Worker as `TURNSTILE_SECRET_KEY`, never into the frontend.
5. The site key is public. The secret key is private.

The Gatekeeper checks the hostname and the action names `website_access` and `developer_auth`. Keep the client widget action names in the frontend in sync if you change them.

---

## 5. Connect the Gatekeeper Worker to GitHub (Worker 2 of 2)

Create a **second, separate Worker**. Do not reuse the AI Worker's Cloudflare project.

1. In Cloudflare, open **Workers & Pages → Create application → Connect to Git** again.
2. Select the same GitHub repository and the `main` branch.
3. Set the **Worker name** to exactly `neural-gatekeeper`.
4. Set **Root directory** to `backend/cloudflare/gatekeeper-worker`.
5. Leave the build command empty. Use `npx wrangler deploy` as the deploy command.
6. Save and deploy.

The Gatekeeper Worker's `wrangler.toml` already includes these public Firebase project settings in its `[vars]` section:

```toml
[vars]
FIREBASE_DATABASE_URL = "https://ubg1-363a4-default-rtdb.asia-southeast1.firebasedatabase.app/"
FIREBASE_PROJECT_ID = "ubg1-363a4"
```

For a different Firebase project, edit those two values in `backend/cloudflare/gatekeeper-worker/wrangler.toml`. These are not secret credentials. Keep the service-account private key and other private values out of `[vars]`.

7. In this Worker's **Settings → Variables and Secrets**, add these as **Secrets**:

| Secret name | What to enter |
|---|---|
| `PASSPHRASE` | The passcode for the website access gate |
| `DEV_PASSPHRASE` | The separate Developer Mode passphrase |
| `DEV_TOKEN_SECRET` | A long random secret used to sign Developer Mode session tokens |
| `TURNSTILE_SECRET_KEY` | The Turnstile secret key from step 4 |
| `FIREBASE_CLIENT_EMAIL` | The service account's client email |
| `FIREBASE_PRIVATE_KEY` | The service account's private key |
| `HYPERBEAM_API_KEY` | Your Hyperbeam API key |

8. Under **Settings → Bindings**, add a **Rate Limiting** binding if Cloudflare did not create it from Wrangler:
   - Binding name: `PASSWORD_RATE_LIMITER`
   - Limit: `5`
   - Period: `60` seconds
   - The `wrangler.toml` already uses namespace ID `70261`; it must be a unique positive integer string in your Cloudflare account.

9. Under **Settings → Triggers → Cron Triggers**, confirm the `0 13,14 * * 5` trigger is present. It performs the weekly guest cleanup at Friday midnight Melbourne time.

10. Copy this Worker's URL and set `gatekeeperUrl` in `backend/neural-config.js`, including the trailing slash.

The Gatekeeper's other editable server options are in its top `CONFIG` block. Change `ALLOWED_ORIGIN` and `TURNSTILE_HOSTNAME` when deploying to another domain.

---

## 6. Deploy the Scramjet Wisp backend on Render

This is a separate Node service, not a Cloudflare Worker. Its source is copied into `backend/render-wisp/` so the backend files are collected in one place.

1. Open [Render Dashboard](https://dashboard.render.com/) and create a **New Web Service** from your GitHub repository.
2. Set the **Root Directory** to `backend/render-wisp`.
3. Choose the Docker runtime so Render uses the included `Dockerfile`. The service reads Render's `PORT` value automatically.
4. Deploy it. The root URL intentionally returns a 404 message; that is normal.
5. Check the health endpoint at `https://YOUR-RENDER-HOST/health`. It should return JSON with `"status":"ok"`.
6. Set `wispUrl` in `backend/neural-config.js` to `wss://YOUR-RENDER-HOST/wisp/`.

No API key is required for the Wisp service in this configuration. Keep its health check path as `/health` and its WebSocket path as `/wisp/`.

## 7. Change all public frontend settings in one place

For a new deployment, most frontend-specific changes belong in **`backend/neural-config.js`**:

| Setting | What it controls |
|---|---|
| `aiApiUrl` | AI Worker URL |
| `gatekeeperUrl` | Passcode, Turnstile, Developer Mode and Hyperbeam Worker URL |
| `wispUrl` | Scramjet Wisp WebSocket URL on Render |
| `scramjetPrefix` | Scramjet route prefix on the frontend |
| `turnstileSiteKey` | Public Turnstile site key |
| `firebase` | Firebase Web app configuration |
| `emailActionUrl` | Where Firebase email verification/password-reset links return the user |
| `aiName` | Name shown for the API assistant |
| `aiModel` | Model label sent by the frontend (the Worker enforces its own model) |

For the Firebase email link, change `emailActionUrl` to your own site URL, then make sure that hostname is listed in Firebase Authentication's **Authorized domains**.

The secret API keys are deliberately **not** in this file. They belong in Cloudflare Worker secrets:

- AI Worker: `GROQ_API_KEY`
- Gatekeeper Worker: the secrets in step 5

---

## 8. Optional local development

The `.dev.vars.example` files show the names expected by each Worker. Copy the relevant file to `.dev.vars` for local Wrangler development and fill in the values. The actual `.dev.vars` files are ignored by Git.

From each Worker folder you can use:

```sh
npx wrangler dev
npx wrangler deploy
```

The matching `wrangler.toml` files document the entry point, Gatekeeper rate-limit binding, and scheduled cleanup trigger. For production, configure the secrets and bindings in Cloudflare or with Wrangler.

---

## Important notes

- This repository contains the public Groq-only AI Worker. Private provider integrations should be kept in a separate local/private copy and must not be committed here.
- Do not put Groq keys, Hyperbeam keys, Turnstile secret keys, Firebase service-account private keys, passphrases, or `DEV_TOKEN_SECRET` in frontend files, public config, or GitHub.
- Firebase's web app config is public by design. Database rules and Firebase Authentication are what protect user data.
- The current frontend still points to the existing Worker URLs until you change `backend/neural-config.js`. Deploying files to GitHub does not deploy Cloudflare Workers or publish Firebase rules automatically.
- A Cloudflare rate-limit binding is an approximate per-location limit, not an exact global lock. Keep Turnstile and server-side checks enabled as well.

## Useful official setup pages

- [Firebase Console](https://console.firebase.google.com/)
- [Groq Console](https://console.groq.com/)
- [Cloudflare Dashboard](https://dash.cloudflare.com/)
- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Worker rate limiting bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

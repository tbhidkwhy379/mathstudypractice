# Neural Gatekeeper Worker

This folder is deployed as its own Cloudflare Worker, separate from the Neural AI Worker.

## Cloudflare Git connection

- Repository: `tbhidkwhy379/mathstudypractice`
- Branch: `main`
- Worker name: `neural-gatekeeper`
- Root directory: `backend/cloudflare/gatekeeper-worker`
- Build command: leave empty
- Deploy command: `npx wrangler deploy`

If Cloudflare asks for build watch paths, use:

- Include paths: `backend/cloudflare/gatekeeper-worker/**`
- Exclude paths: `node_modules/**, .git/**`

If the Root directory is already set to this folder and Cloudflare interprets watch paths relative to that directory, use `*` as the include path instead.

## Configuration

Public Firebase project settings are in `wrangler.toml` under `[vars]`:

- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID`

Set private values under **Cloudflare → Worker → Settings → Variables and Secrets → Secrets**. Required names are documented at the top of `worker.js`. Never commit secret values to GitHub.

The main editable service URLs, hostname, region, timezone, and limits are in the `CONFIG` object near the top of `worker.js`.

For the full Firebase, Turnstile, Hyperbeam, and Cloudflare setup walkthrough, see [the backend setup guide](../../README.md).

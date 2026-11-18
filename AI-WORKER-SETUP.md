# MathStudy Practice AI Worker setup

The AI chat in `app.html` sends requests to the existing Cloudflare Worker:

`https://api.sapktaayush.workers.dev/`

The replacement Worker source is `ai-worker.js`. Deploy this file to that same Worker so the website can use Groq with Coarena fallback without changing the frontend URL.

## Providers

- Primary text provider: Groq, model `openai/gpt-oss-120b`.
- Fallback provider: Coarena, model `deepseek-v4-1-flash-1017`.
- Image attachments go to Coarena because the configured Groq model is text-only.
- The Worker adds a MathStudy Practice tutoring system prompt and preserves streaming responses.

## Cloudflare secrets

In the Cloudflare dashboard, open the Worker currently serving `api.sapktaayush.workers.dev`, then add these as **secrets** (not plaintext variables):

- `GROQ_API_KEY`: create a key at https://console.groq.com/keys
- `COARENA_API_KEY`: create or reuse the key at https://coarena.ai/account/api

Never put either key in `app.html`, public GitHub files, or chat messages.

Optional model overrides can be configured as ordinary Worker variables:

- `GROQ_MODEL` (default: `openai/gpt-oss-120b`)
- `COARENA_MODEL` (default: `deepseek-v4-1-flash-1017`)

## Deploy

1. Open the existing AI Worker in Cloudflare.
2. Replace its Worker code with the complete contents of `ai-worker.js`.
3. Save and deploy.
4. Confirm both API secrets are present.
5. Test a normal text prompt, then an image attachment.

Do not replace the separate website access-code Worker (`worker.js`) or the Gatekeeper Worker (`gatekeeper-worker.js`). This AI Worker is a separate service.

## Rate limiting

The code supports a Cloudflare Rate Limiting binding named `AI_LIMITER`. Add a binding with that exact name before making the endpoint widely available. The binding is keyed by the request IP. Without it, the Worker still runs, but the shared provider keys are not protected by per-IP rate limiting. CORS restrictions alone do not stop direct API calls.

## Free-tier limits

Groq and Coarena both apply account-level limits. A fallback helps when one provider is temporarily unavailable, but it does not make either provider unlimited. Check each provider's dashboard for the account's current remaining quota.

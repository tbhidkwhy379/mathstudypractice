# Handoff Notes for the Next AI

Last updated: 2026-11-28 (Australia/Melbourne)

This file is a handoff for another assistant continuing work on this repository. Read this before changing files. The user may be in a different ChatGPT conversation, so do not assume access to the previous chat.

## Repository and project

- GitHub repository: `tbhidkwhy379/mathstudypractice`
- Main branch: `main`
- Website/domain discussed: `neural.qzz.io`
- Cloudflare Worker discussed: `gatekeeper`
- Worker source filename: `gatekeeper-worker.js`
- User deploys through Cloudflare's Git integration because they cannot use/install Git, Node.js, npm/npx, or Wrangler locally.
- User prefers changes made directly to GitHub when possible, with clear links and simple instructions.

## Immediate build issue

The user pasted this Cloudflare build failure:

```
Installing project dependencies: bun install --frozen-lockfile
warn: deprecated @mercuryworkshop/bare-mux@2.1.9
warn: deprecated @mercuryworkshop/epoxy-transport@2.1.28
error: lockfile had changes, but lockfile is frozen
dependencies in package.json changed since bun.lock was saved:
@mercuryworkshop/bare-mux was added
try re-running without --frozen-lockfile and commit the updated lockfile
```

The prior assistant reported that it pushed a regenerated `bun.lock` and upgraded `@mercuryworkshop/epoxy-transport` to `2.1.29`, with commit:
`8ed05b386fa5a96b094945bcff483760cad74830`

Claimed commit link:
https://github.com/tbhidkwhy379/mathstudypractice/commit/8ed05b386fa5a96b094945bcff483760cad74830

**Important:** Verify that this commit exists on `main`, inspect the actual diff and current `package.json`/lockfile, and check the latest Cloudflare build before claiming the build is fixed. The deprecation warnings are not necessarily fatal; the frozen-lockfile mismatch was the actual reported failure.

## Cloudflare deployment constraints

The user saw Cloudflare's “Connect to a repository” form and was told to:
- Select GitHub account and repository `tbhidkwhy379/mathstudypractice`.
- Leave Build command empty.
- Use Deploy command `npx wrangler deploy`.
- Keep Preview builds off for now.
- Cloudflare's build environment provides Node.js and Bun, so the user does not need these installed locally.

Do not assume the Cloudflare build is successful until the user supplies a successful deployment log or the deployment status can be verified.

## Worker security work discussed

The user wants preventive protection against password brute forcing, but explicitly asked for **Turnstile and rate limits only** (not a broad anti-bot system).

Prior conversation context:
- A user-uploaded Worker file named `Pasted text(3).txt` was 1,481 lines and contained Firebase admin functions, Hyperbeam session creation, weekly anonymous-account cleanup, and a scheduled handler.
- The uploaded version did not contain Turnstile verification.
- The GitHub version previously inspected differed from the uploaded file and already had Turnstile verification for Developer Mode authentication, but not the main website passcode.
- Frontend `app.html` was reported to have Turnstile JS/site key and a helper for Developer Mode token acquisition. The main website password flow was not yet fully wired to Turnstile.

The prior assistant reported adding a rate-limit helper to `gatekeeper-worker.js` using a Cloudflare Workers Rate Limiting binding named `PASSWORD_RATE_LIMITER`, keyed by scope plus `CF-Connecting-IP`, and applying it to:
- Website passcode endpoint (scope `website-passcode`)
- Developer Mode authentication (scope `developer-auth`)

Reported behaviour:
- 10 attempts per 60 seconds per IP/binding location.
- 429 when over limit.
- 503 if the binding is missing or misconfigured (fail closed).
- Existing Developer Mode Turnstile validation retained.

Prior reported commit:
`be914ff73e9ff296354888eddbe06151e12f8124`

Do not assume the above code is still present. Inspect the current Worker source before editing.

## Wrangler configuration / rate-limit binding

A `wrangler.toml` was discussed/claimed to have been added, with a `PASSWORD_RATE_LIMITER` binding. A namespace ID was suggested in earlier chat, but it was explicitly not verified as unique. **Do not blindly trust or reuse an unverified namespace ID.** Inspect the current `wrangler.toml` and Cloudflare account configuration.

Also verify the Worker's name, entrypoint, compatibility date, existing secrets/bindings, and cron triggers before changing deployment configuration. The Worker includes a scheduled cleanup handler; preserve its actual cron schedule. Do not invent cron expressions or replace existing triggers without checking.

Secrets must not be committed to GitHub or placed in `wrangler.toml`. The user needs to configure required secrets in Cloudflare (e.g. Turnstile secret and any existing Firebase/passphrase/Hyperbeam secrets) using Cloudflare's dashboard or Wrangler secret commands on the build/deploy side where supported.

## Repository cleanup previously reported

The prior assistant reported a cleanup commit:
`0106dad9e777384873942a81dbea0146b8a27d2a`

Claimed removals:
- `minecraft-game.txt` (reported 77 MB)
- `main.zip`
- `cloud.old.json`
- `63hx3rw.webp` (reported duplicate of `logo.webp`)
- `gatekeeper-anonymous-cleanup-additions.js` (reported integrated into Worker)

It also claimed `ANONYMOUS-CHAT-ACCOUNTS.md` was updated.

**Verify the commit and current tree before relying on this list.** Do not delete additional files based only on filenames. Check references/imports/routes/build usage first; the user's instruction was to remove unused files while keeping files that are used.

## Important history / caution

There was a previous mistake where a Worker version was reported as hundreds of lines shorter than the user's uploaded version. The user noticed and was concerned. Be especially careful:
1. Fetch the current GitHub file before editing.
2. Preserve all existing functionality, especially scheduled cleanup and Firebase/Hyperbeam logic.
3. Compare line counts and diffs before and after changes.
4. Avoid replacing the Worker with a partial reconstruction.
5. Do not claim a commit, deployment, or test succeeded unless the tool/result confirms it.
6. Prefer small, targeted changes and explain exactly which files changed.

## Suggested next steps

1. Inspect the latest `main` commit and confirm the three reported commits exist in history.
2. Inspect `package.json`, `bun.lock` (or whichever Bun lockfile is actually present), and Cloudflare's latest build log.
3. Confirm the frozen-lockfile error is gone. If another error appears, fix only that error and regenerate the lockfile using the project's actual Bun version.
4. Inspect `wrangler.toml` and `gatekeeper-worker.js` together. Confirm the rate-limit binding name matches exactly and that the scheduled cleanup cron is preserved.
5. Verify the Worker deployment configuration and secrets in Cloudflare. Never expose secret values.
6. Only after the deployment works, finish wiring Turnstile to the main website password flow if the user still wants that.

## User communication preferences

- User asks for direct action in GitHub when possible.
- They cannot use local Git, npx, or Wrangler commands.
- Keep instructions short, concrete, and beginner-friendly.
- Do not make the user repeat the repository name or project context.
- Be honest about what has and has not been verified.

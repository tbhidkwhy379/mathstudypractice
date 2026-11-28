# Project Context

Last updated: 2026-11-28

## Project

- GitHub repository: https://github.com/tbhidkwhy379/mathstudypractice
- Main branch: `main`
- Website: `neural.qzz.io`
- Cloudflare Worker: `gatekeeper`
- Worker source: `gatekeeper-worker.js`
- The project includes a web app/proxy setup using Scramjet and related Mercury Workshop packages.
- The user makes repository changes through GitHub and Cloudflare's Git integration. They cannot use local Git, npm/npx, or Wrangler.

## User preferences

- Make requested code and repository changes directly in GitHub when possible.
- Keep explanations straightforward and beginner-friendly.
- The user prefers concise, practical instructions.
- When editing existing code, preserve existing functionality and the overall project structure.

## Cloudflare deployment

- Cloudflare Workers & Pages is connected to the GitHub repository.
- The Cloudflare build environment detected Bun 1.4.4 and Node.js 24.22.1.
- The configured deployment command discussed was `npx wrangler deploy`.
- The user does not have Git, npx, or Wrangler available locally.

## Recent build issue

The user shared a Cloudflare build log where dependency installation ran:

```
bun install --frozen-lockfile
```

The install failed because `package.json` included `@mercuryworkshop/bare-mux`, but the Bun lockfile did not contain the matching dependency state. The log also showed deprecation notices for:
- `@mercuryworkshop/bare-mux@2.1.9`
- `@mercuryworkshop/epoxy-transport@2.1.28`

A later assistant reported pushing a regenerated `bun.lock` and changing `@mercuryworkshop/epoxy-transport` to `2.1.29`.
Reported commit: `8ed05b386fa5a96b094945bcff483760cad74830`.

## Worker and security context

The Worker handles website access/passcode checks and Developer Mode authentication, plus Firebase-related admin functions, Hyperbeam session creation, and scheduled anonymous-account cleanup.

The user asked for preventive password protection using **Cloudflare Turnstile and rate limits only**.

Previously discussed implementation:
- Turnstile verification for Developer Mode authentication.
- A Cloudflare rate-limit binding named `PASSWORD_RATE_LIMITER`.
- Separate rate-limit scopes for the website passcode and Developer Mode login.
- Intended threshold: 10 attempts per 60 seconds per IP.
- The frontend `app.html` was reported to include Turnstile client-side setup for Developer Mode.
- At that point, the main website passcode flow had not yet been connected to Turnstile.

Reported Worker rate-limit commit: `be914ff73e9ff296354888eddbe06151e12f8124`.

## Wrangler configuration

A `wrangler.toml` was discussed and reported as added to configure the Worker and the `PASSWORD_RATE_LIMITER` binding. A namespace ID was included in the earlier configuration discussion.

## Repository cleanup

A cleanup was previously reported with commit:
`0106dad9e777384873942a81dbea0146b8a27d2a`

Files reported removed:
- `minecraft-game.txt`
- `main.zip`
- `cloud.old.json`
- `63hx3rw.webp` (reported duplicate of `logo.webp`)
- `gatekeeper-anonymous-cleanup-additions.js`

The assistant also reported updating `ANONYMOUS-CHAT-ACCOUNTS.md`.

## Earlier Worker source context

The user previously supplied a Worker file named `Pasted text(3).txt`, approximately 1,481 lines long. It included Firebase admin functions, Hyperbeam session creation, weekly anonymous-account cleanup, and a scheduled handler.

The user had noticed a previous Worker update was hundreds of lines shorter than the supplied source. Maintaining the existing Worker functionality is important.

## Recent GitHub commits mentioned in the conversation

- `be914ff73e9ff296354888eddbe06151e12f8124` — reported password rate-limit changes.
- `0106dad9e777384873942a81dbea0146b8a27d2a` — reported repository cleanup.
- `8ed05b386fa5a96b094945bcff483760cad74830` — reported Bun lockfile/dependency update.
- `4bcca5070fc0b221ba1fdb86490e165f68c03890` — added this project context file.

These commit references are conversation history; they are not a summary of current deployment status.

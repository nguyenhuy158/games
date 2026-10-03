# Repository Guidelines

## Project Structure & Module Organization

Classic browser games (Pikachu, Đào Vàng, Bầu cua, Cờ caro, Nối 4, Ô ăn quan,
Bắn tàu, Cờ tướng, Cờ gánh, Dò mìn, Nokia corner) served by one Cloudflare
Worker at https://games.huyab.click. The client is plain static HTML/CSS/ES
modules in `public/` with no build step; the Worker in `worker/` routes
`/api/*`, proxies WebSockets into Durable Objects and serves `public/` through
the `ASSETS` binding (`wrangler.toml`).

The code is hexagonal (see `docs/hexagon-plan.md`):

- Domain: pure game rules in `public/<game>/logic.js`, shared by client,
  server and tests (no DOM, no Worker APIs, no I/O).
- Application: one game module per file in `worker/games/<game>.js`
  (`start` / `msg` / `tick` / `view`), contract documented in
  `worker/ports.js`; all I/O goes through `ctx` (`now`, `rand`, `wakeAt`,
  `end`, `send`).
- Adapters: `worker/adapters/game-room.js` (shared Durable Object room),
  `worker/adapters/http.js` (router, SSO, trusted headers),
  `worker/adapters/top.js` (leaderboard/history/public rooms DO, SQLite).
- `scripts/check-deps.mjs` (run by the test suite) blocks wrong-direction
  imports.

Folder structure:

```text
public/                        # Static client (served as-is, no build)
  <game>/                      #   index.html, game.js (UI), logic.js (rules), style.css
  nokia/<game>/                #   Nokia corner games + shared lcd.js, room.js, nokia.css
  room-client.js               #   Shared WebSocket room connection (auto-reconnect)
  i18n.js  toast.js  icons.js  #   vi/en strings, sonner-like toasts, lucide icons (generated)
  invite.js  panel.js  ...     #   QR invite, player panels, replay, public-room switch
  sw.js  manifest.webmanifest  #   PWA (bump CACHE when adding files to CORE)
  vendor/qrcode.mjs            #   Vendored qrcode-generator (MIT)
worker/
  index.js                     #   Wiring: exports Worker + every Durable Object class
  ports.js                     #   JSDoc contracts between games and adapters
  adapters/                    #   game-room.js, http.js, top.js
  games/                       #   One module per game (rules glue, timers, views)
  sso.js  names.js             #   SSO JWT verification, de-duplicated room names
scripts/                       # smoke.mjs (WebSocket bots), check-deps.mjs, asset generators
docs/hexagon-plan.md           # Architecture plan and dependency rules
screenshots/                   # Per-game, per-device screenshots (README generated)
*.test.mjs                     # Tests at repo root, aggregated by logic.test.mjs
reference/                     # Original game assets for study (gitignored)
```

## Build, Test, and Development Commands

- `pnpm install`: install dependencies (Wrangler, Biome, lucide).
- `pnpm dev`: run `wrangler dev` (http://localhost:8787).
- `pnpm test`: run `node logic.test.mjs`, which imports every other
  `*.test.mjs` file plus `scripts/check-deps.mjs`.
- `pnpm check` / `pnpm lint`: run `biome check .` (lint + format check).
- `pnpm format`: run `biome format --write .`.
- `pnpm icons`: regenerate `public/icons.js` from lucide (`scripts/icons.mjs`).
- `node scripts/smoke.mjs [url] [game ...]`: multiplayer smoke test with bots
  over real WebSockets (default `http://localhost:8789`, i.e.
  `wrangler dev --port 8789`).

There is no build step. Deploy happens on push to `main`: Cloudflare Workers
Builds runs `node logic.test.mjs` then `npx wrangler deploy`. `pnpm deploy`
does the same locally; prefer pushing.

Use `pnpm` for all package commands.

## Coding Style & Naming Conventions

Plain JavaScript ES modules (no TypeScript, no bundler). Follow the existing
style: two-space indentation, single quotes, semicolons, compact functions.
File names are kebab-case game slugs (`co-tuong`, `rapid-roll`). Keep rules in
`logic.js` pure so they run in the browser, the Worker and Node tests alike.
Do not leave magic strings or numbers; name them as constants near the module.
Code comments are in Vietnamese.

Biome is configured in `biome.json` (2-space, double quotes, recommended
rules) but the codebase predates it: `pnpm check` currently reports existing
findings and the repo has not been reformatted. Do not mass-reformat; keep new
or touched code lint-clean where practical.

UI: no emoji in the interface. Icons come from lucide via `public/icons.js`
(`iconEl(name)`), toasts from `public/toast.js`. All player-facing text is
bilingual: `t('vi', 'en')` in JS, `data-en*` attributes in HTML, `['vi', 'en']`
pairs from the server (see `public/i18n.js`).

## Testing Guidelines

Tests are plain Node scripts using `node:assert/strict`, one file per game at
the repo root (`<game>.test.mjs`). When adding a game, create its test file and
import it at the end of `logic.test.mjs` so `pnpm test` (and the Cloudflare
deploy gate) runs it. Cover rules in `logic.js` and server modules in
`worker/games/`. Run `scripts/smoke.mjs` before and after refactors of room or
connection code.

## Commit & Pull Request Guidelines

History uses Conventional Commits, sometimes with an emoji prefix, for example
`feat(co-ganh): ...`, `fix(rooms): ...`, `refactor(step 4a): ...`. Pull
requests should include a short summary, test results, and screenshots for
visible UI changes. CI (`.github/workflows/ci.yml`) runs the tests on every
push/PR and smoke-tests production after each deploy to `main`.

## Agent-Specific Instructions

Keep responses short and focused. If a requirement is unclear, ask before making
assumptions.
Design UI/UX to fit inside a single viewport by default. Avoid page-level
scrolling; use compact layouts, tabs, panes, or contained internal lists when
content can overflow.
Adding a game: create `public/<game>/`, add its card to `public/index.html`,
add its files to `CORE` in `public/sw.js` (and bump `CACHE`), add
`<game>.test.mjs` and import it from `logic.test.mjs`.

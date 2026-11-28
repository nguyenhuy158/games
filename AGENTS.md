# Repository Guidelines

## Project Structure & Module Organization

Classic browser games (Pikachu, Đào Vàng, Bầu cua, Cờ caro, Nối 4, Ô ăn quan,
Bắn tàu, Cờ tướng, Cờ gánh, Dò mìn, Lô tô, Sói, Nokia corner, and the client-only
solo games 2048, Xếp gạch, Sudoku) served by one Cloudflare
Worker at https://games.huyab.cfd. The client is plain HTML/CSS/ES modules in
`frontend/src/`; the Worker in `backend/src/` routes `/api/*`, proxies
WebSockets into Durable Objects and serves generated `dist/` through `ASSETS`.

The layout follows kit v0.5.0. Hexagonal boundaries are described in
`docs/hexagon-plan.md` and enforced by the AST checker `scripts/check-deps.mjs`.
Shared rules are runtime-independent, not strictly deterministic: existing
Date.now deadlines and Math.random defaults remain unchanged.

```text
index.html                     Hub page
frontend/src/                  Browser HTML/CSS/ES modules
  <game>/                      Game UI; Nokia games under nokia/<game>/
  room-client.js               WebSocket connection and reconnect
  ui/                          ui-kit DOM primitives and notifications
  sw.js                        PWA cache; bump CACHE when CORE changes
backend/src/
  index.js                     Composition root and Durable Object exports
  ports.js                     Existing GameModule/Ctx/Recorder/Identity contracts
  domain/names.js               Room-name rules
  application/games/           Game orchestration through ctx ports
  application/spy-ai.js        AI service with injected storage/provider
  adapters/                    HTTP, SSO, guest, DO, WebSocket and SQLite
shared/games/                  Runtime-independent game rules
shared/tape.js                  Replay recording
public/                        Images, audio, logos, manifest and licenses
scripts/build-assets.mjs        Assemble static output into dist/
scripts/                       Architecture checks and asset generators
docs/                          Architecture, game reference and UI integration
screenshots/                   Per-game, per-device screenshots
tests/unit/                    Node tests aggregated by logic.test.mjs
tests/e2e/                     Browser suites and orchestration
tests/support/                 Test-only loaders and instrumentation
tests/smoke.mjs                 WebSocket bot scenarios
tests/coverage.mjs              Whole-application coverage gate
reference/                     Original game assets for study (gitignored)
```

Shared imports only shared; backend domain imports domain/shared; application
imports application/domain/shared/ports. Adapters may use infrastructure but
not the composition root or frontend. Frontend imports frontend/shared only.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies (Wrangler, Biome, lucide).
- `pnpm dev`: run `wrangler dev` (http://localhost:8787).
- `pnpm test`: run `node tests/unit/logic.test.mjs`, which imports every other
  `tests/unit/*.test.mjs` file plus `scripts/check-deps.mjs`.
- `pnpm check` and `pnpm lint`: run `biome lint .` (blocking in CI).
  Formatting is explicit via `pnpm format`, not part of the lint gate.
- `pnpm format`: run `biome format --write .`.
- `pnpm icons`: regenerate `frontend/src/icons.js` from lucide (`scripts/icons.mjs`).
- `node tests/smoke.mjs [url] [game ...]`: multiplayer smoke test with bots
  over real WebSockets (default `http://localhost:8789`, i.e.
  `wrangler dev --port 8789`).
- `pnpm e2e`: start `wrangler dev` on port 8789, run the read-only browser
  smoke (`tests/e2e/readonly-smoke.mjs`) and then `tests/smoke.mjs`, then stop the
  server. Extra args filter games: `pnpm e2e caro c4`.
- `pnpm e2e:prod`: run only the read-only smoke against
  https://games.huyab.cfd (GET `/api/version`, `/api/rooms`, `/api/me`, the
  hub, every game page without `?r=`, `/phong/`; no rooms, no WebSocket).
  Needs Chromium: `pnpm exec playwright-core install chromium`, or set
  `PLAYWRIGHT_CHROMIUM_PATH` (local Google Chrome is picked up on macOS).

`pnpm build` assembles static output in `dist/`. Deploy happens on push to `main`: Cloudflare Workers
Builds runs `pnpm test` before deploying with Wrangler. `pnpm deploy`
runs the same test gate locally; prefer pushing.

Use `pnpm` for all package commands.

## Coding Style & Naming Conventions

Plain JavaScript ES modules (no TypeScript, no bundler). Follow the existing
style: two-space indentation, single quotes, semicolons, compact functions.
File names are kebab-case game slugs (`co-tuong`, `rapid-roll`). Keep rules in
`logic.js` independent of runtime I/O so they run in the browser, the Worker and Node tests alike.
Do not leave magic strings or numbers; name them as constants near the module.
Code comments are in Vietnamese.

Biome extends `@huyab/config/biome.json` (2-space, double quotes, recommended
rules) but the codebase predates it: the rules that already had violations are
set to `"warn"` in `biome.json` so `pnpm check` passes, and the repo has not
been reformatted. Do not mass-reformat; keep new or touched code lint-clean
where practical.

UI: no emoji in the interface. Icons come from lucide via `frontend/src/icons.js`
(`iconEl(name)`), toasts from `frontend/src/ui/notifications.js` via
`notifications.show(TOAST_TONE.SUCCESS, message)`. All player-facing text is
bilingual: `t('vi', 'en')` in JS, `data-en*` attributes in HTML, `['vi', 'en']`
pairs from the server (see `frontend/src/i18n.js`).

Serve webfonts from the Games origin. Copy shared fonts and their license from
a pinned UI Kit revision into `public/fonts/`. Keep Vietnamese and English
glyph coverage and use `font-display: swap` with fallback fonts.
Undercover vendors Be Vietnam Pro from UI Kit commit `b5b19f2c09d414617893e05dd277bb6f370d1fcd`.

Settings live in the sidebar menu (`frontend/src/sidebar.js`) and apply to every game: sound is one
switch for the whole site (`isSoundOn` / `setSoundOn` / `onSoundChange` in `frontend/src/sound.js`; a
game's own speaker button calls the same functions), the light theme is `html[data-theme="light"]`
(tokens in `frontend/src/ui-kit.css`, set before paint by `frontend/src/theme.js`), and SSO links
come from `frontend/src/account.js`. New pages load `/theme.js` and `/sidebar.js` in `<head>`.

## Testing Guidelines

Tests are plain Node scripts using `node:assert/strict`, one file per game in
`tests/unit/` (`<game>.test.mjs`). When adding a game, create its test file and
import it at the end of `tests/unit/logic.test.mjs` so `pnpm test` (and the Cloudflare
deploy gate) runs it. Cover rules in `logic.js` and server modules in
`backend/src/application/games/`. Run `pnpm e2e` (or `tests/smoke.mjs`) before and after
refactors of room or connection code. `tests/smoke.mjs` creates rooms, so
only CI's post-deploy job runs it against production; ad-hoc production checks
use the read-only `pnpm e2e:prod`.
Tests that load the Worker (`sso.test.mjs`, `top.test.mjs`) import
`tests/support/node-ts-hooks.mjs` first: `@huyab/sso` ships TypeScript source, which
Node will not strip under `node_modules`.

## Commit & Pull Request Guidelines

History uses Conventional Commits, sometimes with an emoji prefix, for example
`feat(co-ganh): ...`, `fix(rooms): ...`, `refactor(step 4a): ...`. Pull
requests should include a short summary, test results, and screenshots for
visible UI changes. CI (`.github/workflows/ci.yml`) calls kit's reusable
`check.yml` (`pnpm check`, `pnpm test`, and `pnpm e2e` against a local
`wrangler dev`) on every push/PR, then smoke-tests production after each
deploy to `main` (`smoke-prod`).

## Ecosystem

How this repo fits with the other `*.huyab.cfd` repos:
https://github.com/nguyenhuy158/kit/blob/main/docs/ECOSYSTEM.md

- Kit packages (`nguyenhuy158/kit@v0.5.0`): `@huyab/sso` (optional sign-in,
  `backend/src/adapters/sso.js`, cookie only), `@huyab/e2e` (`tests/e2e/run.mjs` server
  lifecycle, Chromium lookup), `@huyab/config` (`biome.json`), and CI through
  the reusable `check.yml` workflow.
- Talks to: `sso` (auth.huyab.cfd login links in `frontend/src/me.js` + JWKS).
  No D1, no mailer: data lives in Durable Object SQLite.
- Called by: nobody; `mytools` pings it for uptime.
- UI kit uses its official static DOM integration, pinned to
  `978ff7c2444e094342b5005e5a6879c2bae34c9b`: shared feedback in `frontend/src/ui/`,
  existing dark tokens in `frontend/src/ui-kit.css`. Keep the static game shells;
  React `Screen`, `PagedList` and `ConfirmProvider` are intentionally not
  adopted. See `docs/gian-diep.md#ui-kit` for the exception and adaptations.

## Agent-Specific Instructions

Keep responses short and focused. If a requirement is unclear, ask before making
assumptions.
Design UI/UX to fit inside a single viewport by default. Avoid page-level
scrolling; use compact layouts, tabs, panes, or contained internal lists when
content can overflow.
Adding a game: create `frontend/src/<game>/` and `shared/games/<game>/`, add its card to `index.html`
and its link to `GROUPS` in `frontend/src/sidebar.js`, load `/theme.js` and `<script type="module" src="/sidebar.js">`
in the page `<head>`, add its files to `CORE` in `frontend/src/sw.js` (and bump `CACHE`), add
`tests/unit/<game>.test.mjs` and import it from `tests/unit/logic.test.mjs`. Every game needs a "Cách chơi"
dialog: `mountHelp()` from `frontend/src/help.js` (nokiaApp games pass `help: { vi, en }`);
`pnpm e2e` fails if a game page has no help button / content.

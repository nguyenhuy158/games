// Chạy cả bộ E2E dev một lệnh: bật `wrangler dev` (Durable Object local) -> smoke chỉ đọc
// (e2e/readonly-smoke.mjs, Chromium) -> bot chơi thử mọi game qua WebSocket
// (scripts/smoke.mjs) -> tắt server.
//
// Biến môi trường:
// - E2E_PORT: cổng cho wrangler dev (mặc định 8789, khớp scripts/smoke.mjs)
// - PLAYWRIGHT_CHROMIUM_PATH: chỉ định Chromium cụ thể
// Tham số thêm được chuyển cho scripts/smoke.mjs (lọc game): `pnpm e2e caro c4`.
import { run, startServer } from "@huyab/e2e";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { selectGames } from "./selection.mjs";

const PORT = process.env.E2E_PORT || "8789";
const BASE = `http://127.0.0.1:${PORT}`;
const SMOKE_ENV = { E2E_BASE_URL: BASE };
const PR_EVENT = "pull_request";
const UTF8 = "utf8";
const NULL_SEPARATOR = "\0";
const GIT_TIMEOUT_MS = 60000;
const GIT_OPTIONS = { encoding: UTF8, timeout: GIT_TIMEOUT_MS };
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const manualGames = process.argv.slice(2);

function pullRequestSelection() {
  if (process.env.GITHUB_EVENT_NAME !== PR_EVENT || manualGames.length) return null;
  try {
    const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, UTF8));
    const base = pr?.base?.sha;
    const head = pr?.head?.sha;
    if (!SHA_PATTERN.test(base ?? "") || !SHA_PATTERN.test(head ?? "")) throw new Error("Missing PR commit IDs");
    execFileSync("git", ["fetch", "--no-tags", "--depth=1", "origin", base, head], GIT_OPTIONS);
    const paths = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", base, head], GIT_OPTIONS)
      .split(NULL_SEPARATOR).filter(Boolean);
    return selectGames(paths);
  } catch (error) {
    console.warn(`Cannot select PR games; running full suite: ${error.message}`);
    return null;
  }
}

const selection = pullRequestSelection();
const gameArgs = manualGames.length ? manualGames : selection?.games ?? [];
console.log(selection ? `Selected routes: ${selection.routes.join(", ")}` : "Running full page suite");

const server = await startServer({
  command: "pnpm",
  args: ["exec", "wrangler", "dev", "--ip", "127.0.0.1", "--port", PORT],
  readyUrl: `${BASE}/api/version`,
});

let failed = false;
try {
  console.log(`\nServer sẵn sàng tại ${BASE}\n`);
  await run("node", ["e2e/readonly-smoke.mjs", ...(selection?.routes ?? [])], {
    label: "read-only smoke",
    env: SMOKE_ENV,
  });
  if (!selection || gameArgs.length) {
    await run("node", ["scripts/smoke.mjs", BASE, ...gameArgs], {
      label: "game smoke",
      env: SMOKE_ENV,
    });
  }
} catch (error) {
  failed = true;
  console.error("E2E FAIL:", error.message);
} finally {
  await server.stop();
}

process.exit(failed ? 1 : 0);

// Chạy cả bộ E2E dev một lệnh: bật `wrangler dev` (Durable Object local) -> smoke chỉ đọc
// (e2e/readonly-smoke.mjs, Chromium) -> bot chơi thử mọi game qua WebSocket
// (scripts/smoke.mjs) -> tắt server.
//
// Biến môi trường:
// - E2E_PORT: cổng cho wrangler dev (mặc định 8789, khớp scripts/smoke.mjs)
// - PLAYWRIGHT_CHROMIUM_PATH: chỉ định Chromium cụ thể
// Tham số thêm được chuyển cho scripts/smoke.mjs (lọc game): `pnpm e2e caro c4`.
import { run, startServer } from "@huyab/e2e";

const PORT = process.env.E2E_PORT || "8789";
const BASE = `http://127.0.0.1:${PORT}`;
const SMOKE_ENV = { E2E_BASE_URL: BASE };

const server = await startServer({
  command: "pnpm",
  args: ["exec", "wrangler", "dev", "--ip", "127.0.0.1", "--port", PORT],
  readyUrl: `${BASE}/api/version`,
});

let failed = false;
try {
  console.log(`\nServer sẵn sàng tại ${BASE}\n`);
  await run("node", ["e2e/readonly-smoke.mjs"], {
    label: "read-only smoke",
    env: SMOKE_ENV,
  });
  await run("node", ["scripts/smoke.mjs", BASE, ...process.argv.slice(2)], {
    label: "game smoke",
    env: SMOKE_ENV,
  });
} catch (error) {
  failed = true;
  console.error("E2E FAIL:", error.message);
} finally {
  await server.stop();
}

process.exit(failed ? 1 : 0);

// Chạy cả bộ E2E dev một lệnh: bật `wrangler dev` (Durable Object local) -> smoke chỉ đọc
// (e2e/readonly-smoke.mjs, Chromium) -> bot chơi thử mọi game qua WebSocket
// (scripts/smoke.mjs) -> tắt server.
//
// Biến môi trường:
// - E2E_PORT: cổng cho wrangler dev (mặc định 8789, khớp scripts/smoke.mjs)
// - PLAYWRIGHT_CHROMIUM_PATH: chỉ định Chromium cụ thể
// Tham số thêm được chuyển cho scripts/smoke.mjs (lọc game): `pnpm e2e caro c4`.
import { spawn } from "node:child_process";

const PORT = process.env.E2E_PORT || "8789";
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;

/** Chạy một lệnh đến khi kết thúc; lỗi thì ném. */
function run(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, E2E_BASE_URL: BASE },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${label} thất bại (exit ${code})`)),
    );
  });
}

/** Đợi tới khi server trả lời /api/version, hoặc ném khi quá hạn. */
async function waitForServer(child) {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`wrangler dev tắt sớm (exit ${child.exitCode})`);
    try {
      const response = await fetch(`${BASE}/api/version`);
      if (response.ok) return;
    } catch {
      // Server chưa sẵn sàng, thử lại.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`wrangler dev không lên sau ${SERVER_TIMEOUT_MS}ms`);
}

// `detached` cho server một process group riêng: `pnpm exec` sinh thêm tầng node con,
// kill riêng PID cha sẽ bỏ mồ côi wrangler/workerd giữ cổng.
const server = spawn(
  "pnpm",
  ["exec", "wrangler", "dev", "--ip", "127.0.0.1", "--port", PORT],
  {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, CI: "1" },
    detached: true,
  },
);

/** Gửi signal tới cả process group của server (bỏ qua nếu đã tắt). */
function killServer(signal) {
  try {
    process.kill(-server.pid, signal);
  } catch {
    // Group đã tắt.
  }
}

// Group tách riêng nên Ctrl-C không tới server: tự dọn trước khi thoát.
process.once("SIGINT", () => {
  killServer("SIGKILL");
  process.exit(130);
});

let failed = false;
try {
  await waitForServer(server);
  console.log(`\nServer sẵn sàng tại ${BASE}\n`);
  await run("node", ["e2e/readonly-smoke.mjs"], "read-only smoke");
  await run(
    "node",
    ["scripts/smoke.mjs", BASE, ...process.argv.slice(2)],
    "game smoke",
  );
} catch (error) {
  failed = true;
  console.error("E2E FAIL:", error.message);
} finally {
  const exited = new Promise((resolve) =>
    server.once("exit", () => resolve(true)),
  );
  killServer("SIGTERM");
  // Chờ wrangler dọn dẹp; quá hạn thì kết liễu để process không treo.
  const stopped =
    server.exitCode !== null ||
    (await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
    ]));
  // Kết liễu cả group: wrangler có thể tắt trước khi workerd con kịp dọn.
  killServer("SIGKILL");
  if (!stopped) console.error("wrangler không tắt sau SIGTERM, đã SIGKILL");
}

process.exit(failed ? 1 : 0);

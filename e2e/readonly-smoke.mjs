// Smoke CHỈ ĐỌC: chỉ GET trang/API công khai và kiểm trang render; không vào phòng,
// không mở WebSocket, không ghi gì. An toàn để chạy vào production:
// `pnpm e2e:prod` (games.huyab.click). `pnpm e2e` chạy nó trước scripts/smoke.mjs
// để dev và prod dùng chung một bộ kiểm tra.
//
// Biến môi trường:
// - E2E_BASE_URL: mặc định http://127.0.0.1:8789
// - PLAYWRIGHT_CHROMIUM_PATH: chỉ định Chromium cụ thể (xem findChromium của @huyab/e2e)
import { findChromium } from "@huyab/e2e";
import { chromium } from "playwright-core";

const BASE = (process.env.E2E_BASE_URL || "http://127.0.0.1:8789").replace(
  /\/$/,
  "",
);
const WAIT = { timeout: 15000 };
// Số game trên trang chủ (public/index.html, mỗi game một thẻ a.game).
const MIN_GAMES = 17;

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

/** GET một đường dẫn, ném nếu status khác 200 hoặc content-type không khớp. */
async function get(path, type) {
  const response = await fetch(BASE + path, { redirect: "manual" });
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== 200 || !contentType.includes(type)) {
    throw new Error(`GET ${path}: ${response.status} ${contentType}`);
  }
  return response;
}

console.log(`Read-only smoke tại ${BASE}\n`);

const browser = await chromium.launch({ executablePath: findChromium() });
// Chặn service worker để luôn tải file mới từ server, không lấy bản cache cũ.
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) =>
  pageErrors.push(`${page.url()}: ${error.message}`),
);
// Module import hỏng (404) không ném pageerror: bắt mọi request cùng origin lỗi.
page.on("response", (response) => {
  if (response.url().startsWith(BASE) && response.status() >= 400) {
    pageErrors.push(`${response.status()} ${response.url()}`);
  }
});

try {
  const version = await (await get("/api/version", "application/json")).json();
  if (!("id" in version && "at" in version))
    throw new Error(`/api/version: ${JSON.stringify(version)}`);
  ok(`GET /api/version (${version.id ?? "local"})`);

  const rooms = await (await get("/api/rooms", "application/json")).json();
  if (!Array.isArray(rooms.rooms))
    throw new Error(`/api/rooms: ${JSON.stringify(rooms)}`);
  ok(`GET /api/rooms (${rooms.rooms.length} public rooms)`);

  const me = await (await get("/api/me", "application/json")).json();
  if (me.user !== null)
    throw new Error(
      `/api/me phải user=null khi chưa đăng nhập: ${JSON.stringify(me)}`,
    );
  ok("GET /api/me is anonymous without cookie");

  await page.goto(`${BASE}/`);
  const cards = page.locator("a.game");
  await cards.first().waitFor(WAIT);
  const links = await cards.evaluateAll((anchors) =>
    anchors.map((a) => a.getAttribute("href")),
  );
  if (links.length < MIN_GAMES)
    throw new Error(
      `trang chủ chỉ có ${links.length} game, cần >= ${MIN_GAMES}`,
    );
  ok(`hub renders ${links.length} game cards`);

  // Mở từng trang game (không có ?r= nên không vào phòng, không mở WebSocket):
  // trang phải tải được và chạy hết module mà không lỗi.
  for (const link of links) {
    const response = await page.goto(BASE + link, { waitUntil: "load" });
    if (!response?.ok()) throw new Error(`${link}: HTTP ${response?.status()}`);
    if (!(await page.title())) throw new Error(`${link}: trang thiếu <title>`);
  }
  ok(`every game page loads in the browser (${links.length})`);

  await page.goto(`${BASE}/phong/`);
  await page.waitForLoadState("networkidle", WAIT);
  ok("open-rooms page /phong/ renders");

  if (pageErrors.length > 0)
    throw new Error(`lỗi JS trên trang: ${pageErrors.join(" | ")}`);
  ok("no uncaught page errors");
} catch (error) {
  failed += 1;
  console.log("FAIL:", error.message);
  await page.screenshot({ path: "e2e-failure.png" }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

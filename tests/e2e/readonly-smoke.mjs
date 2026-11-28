// Smoke CHỈ ĐỌC: chỉ GET trang/API công khai và kiểm trang render; không vào phòng,
// không mở WebSocket, không ghi gì. An toàn để chạy vào production:
// `pnpm e2e:prod` (games.huyab.cfd). `pnpm e2e` chạy nó trước tests/smoke.mjs
// để dev và prod dùng chung một bộ kiểm tra.
//
// Biến môi trường:
// - E2E_BASE_URL: mặc định http://127.0.0.1:8789
// - PLAYWRIGHT_CHROMIUM_PATH: chỉ định Chromium cụ thể (xem findChromium của @huyab/e2e)
import { join } from "node:path";
import { findChromium } from "@huyab/e2e";
import { chromium } from "playwright-core";
import { saveCoverage } from "./coverage.mjs";

const BASE = (process.env.E2E_BASE_URL || "http://127.0.0.1:8789").replace(
  /\/$/,
  "",
);
const WAIT = { timeout: 15000 };
const MIN_GAMES = 22;
// Game chuyển từ mytools: trang phải vẽ đủ bàn chơi (selector -> số phần tử).
const BOARDS = {
  "/2048/": ["#tiles .tile", 16],
  "/tetris/": ["#cells > div", 200],
  "/sudoku/": ["#grid > div", 81],
  "/loto/": ["#home button.primary", 1],
};
const MAX_QUICK_RULE_CHARS = 150;
const CLI_ARGUMENT_OFFSET = 2;
const REQUESTED_ROUTES = [...new Set(process.argv.slice(CLI_ARGUMENT_OFFSET))];
const PAGE_CONCURRENCY_LIMIT = 3;
const MAX_CONCURRENT_GAMES = Number(process.env.E2E_PAGE_CONCURRENCY ?? PAGE_CONCURRENCY_LIMIT);
if (!Number.isInteger(MAX_CONCURRENT_GAMES) || MAX_CONCURRENT_GAMES < 1 || MAX_CONCURRENT_GAMES > PAGE_CONCURRENCY_LIMIT) {
  throw new Error("E2E_PAGE_CONCURRENCY must be an integer from 1 to 3");
}
const FAILURE_SCREENSHOT_PATH = "e2e-failure.png";
const HTTP_ERROR_STATUS = 400;
const ERROR_SEPARATOR = " | ";
const ROUTE_SEPARATOR = ", ";
const PAGE_EVENTS = { ERROR: "pageerror", RESPONSE: "response" };
const HELP_DIALOG_SELECTOR = "dialog.help-dlg";
const HELP_BUTTON_SELECTOR = "[data-help]:visible";
const QUICK_RULE_SELECTOR = ".help-quick";
const HELP_BODY_SELECTOR = ".help-body";
const HELP_DISCLOSURE_SELECTOR = "details, summary";
const ESCAPE_KEY = "Escape";
const NAVIGATION_OPTIONS = { waitUntil: "load" };
const HIDDEN_WAIT = { state: "hidden", ...WAIT };
const ROOMS_PATH = "/api/rooms";
const LOBBY_PATH = "/phong/";
const LOBBY_READY_SELECTOR = "#filter button";
const HUB_PATH = "/";
const VIDEO_SCOPE_DIRECTORY = "readonly";
const VIDEO_EXTENSION = ".webm";
const VIDEO_ROUTE_SEPARATOR = "-";
const VIDEO_ROUTE_NAMES = { [HUB_PATH]: "hub", [LOBBY_PATH]: "lobby" };
const VIDEO_ROOT = process.env.E2E_VIDEO_DIR;
const VIDEO_DIRECTORY = VIDEO_ROOT
  ? join(VIDEO_ROOT, VIDEO_SCOPE_DIRECTORY)
  : undefined;
const VIDEO_SIZE = { width: 1280, height: 720 };
const videoRecordings = new Map();
const REJECTED_PROMISE_STATUS = "rejected";

let passed = 0;
let failed = 0;
let failureScreenshot;

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

console.log(`Read-only page/help smoke (not whole-game gameplay) tại ${BASE}\n`);
if (VIDEO_DIRECTORY) console.log(`Videos: ${VIDEO_DIRECTORY}\n`);

const browser = await chromium.launch({ executablePath: findChromium() });
// Chặn service worker để luôn tải file mới từ server, không lấy bản cache cũ.
const CONTEXT_OPTIONS = {
  serviceWorkers: "block",
  ...(VIDEO_DIRECTORY
    ? { recordVideo: { dir: VIDEO_DIRECTORY, size: VIDEO_SIZE } }
    : {}),
};
let context;
let page;
let lobbyPage;

async function newSmokePage(checkedContext, route) {
  const checkedPage = await checkedContext.newPage();
  if (VIDEO_DIRECTORY) {
    const routeName =
      VIDEO_ROUTE_NAMES[route] ??
      new URL(route, BASE).pathname
        .split(HUB_PATH)
        .filter(Boolean)
        .join(VIDEO_ROUTE_SEPARATOR);
    const recordings = videoRecordings.get(checkedContext) ?? [];
    recordings.push({
      video: checkedPage.video(),
      path: join(VIDEO_DIRECTORY, `${routeName}${VIDEO_EXTENSION}`),
    });
    videoRecordings.set(checkedContext, recordings);
  }
  return checkedPage;
}

async function closeSmokeContext(checkedContext) {
  try {
    try {
      for (const checkedPage of checkedContext.pages()) await saveCoverage(checkedPage);
    } finally {
      await checkedContext.close();
    }
    if (!VIDEO_DIRECTORY) return;
    const recordings = videoRecordings.get(checkedContext) ?? [];
    const results = await Promise.allSettled(
      recordings.map(async ({ video, path }) => {
        await video.saveAs(path);
        await video.delete();
      }),
    );
    const errors = results
      .filter((result) => result.status === REJECTED_PROMISE_STATUS)
      .map((result) => result.reason);
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `Read-only smoke video export failed: ${errors.map((error) => error.message).join(ERROR_SEPARATOR)}`,
      );
    }
  } catch (error) {
    failed += 1;
    console.log("FAIL closing read-only smoke context:", error.message);
  } finally {
    videoRecordings.delete(checkedContext);
  }
}

function collectPageErrors(checkedPage) {
  const errors = [];
  checkedPage.on(PAGE_EVENTS.ERROR, (error) =>
    errors.push(`${checkedPage.url()}: ${error.message}`),
  );
  // Module import hỏng (404) không ném pageerror: bắt mọi request cùng origin lỗi.
  checkedPage.on(PAGE_EVENTS.RESPONSE, (response) => {
    if (
      response.url().startsWith(BASE) &&
      response.status() >= HTTP_ERROR_STATUS
    ) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

function assertNoPageErrors(errors) {
  if (errors.length > 0)
    throw new Error(`lỗi JS trên trang: ${errors.join(ERROR_SEPARATOR)}`);
}

async function captureFailure(failedPage) {
  failureScreenshot ??= failedPage
    .screenshot({ path: FAILURE_SCREENSHOT_PATH })
    .catch(() => {});
  await failureScreenshot;
}

async function checkGame(link) {
  const gameContext = await browser.newContext(CONTEXT_OPTIONS);
  let gamePage;
  try {
    gamePage = await newSmokePage(gameContext, link);
    const errors = collectPageErrors(gamePage);
    const response = await gamePage.goto(BASE + link, NAVIGATION_OPTIONS);
    if (!response?.ok()) throw new Error(`${link}: HTTP ${response?.status()}`);
    if (!(await gamePage.title())) throw new Error(`${link}: trang thiếu <title>`);
    const help = gamePage.locator(HELP_DIALOG_SELECTOR);
    await help.waitFor(WAIT).catch(() => {
      throw new Error(`${link}: hướng dẫn không tự mở lần đầu vào`);
    });
    await gamePage.keyboard.press(ESCAPE_KEY);
    await help.waitFor(HIDDEN_WAIT);
    const button = gamePage.locator(HELP_BUTTON_SELECTOR).first();
    await button.click(WAIT).catch(() => {
      throw new Error(`${link}: không có nút hướng dẫn (i) đang hiện`);
    });
    await help.waitFor(WAIT);
    const text = (await help.locator(QUICK_RULE_SELECTOR).innerText()).trim();
    if (!text || text.length > MAX_QUICK_RULE_CHARS)
      throw new Error(`${link}: tóm tắt hướng dẫn không hợp lệ (${text.length} ký tự)`);
    const bodyText = (await help.locator(HELP_BODY_SELECTOR).innerText()).trim();
    if (bodyText !== text || await help.locator(HELP_DISCLOSURE_SELECTOR).count())
      throw new Error(`${link}: chỉ được hiển thị tóm tắt hướng dẫn`);
    await gamePage.keyboard.press(ESCAPE_KEY);
    await help.waitFor(HIDDEN_WAIT);

    if (Object.hasOwn(BOARDS, link)) {
      const [selector, count] = BOARDS[link];
      const cells = gamePage.locator(selector);
      await cells.first().waitFor(WAIT);
      const n = await cells.count();
      if (n !== count)
        throw new Error(`${link}: ${selector} có ${n}, cần ${count}`);
    }
    assertNoPageErrors(errors);
  } catch (error) {
    if (gamePage) await captureFailure(gamePage);
    throw error;
  } finally {
    await closeSmokeContext(gameContext);
  }
}

async function checkGames(links) {
  let nextIndex = 0;
  const errors = [];
  const workerCount = Math.min(MAX_CONCURRENT_GAMES, links.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < links.length) {
        const link = links[nextIndex++];
        try {
          await checkGame(link);
        } catch (error) {
          errors.push(error);
        }
      }
    }),
  );
  if (errors.length > 0)
    throw new AggregateError(
      errors,
      errors.map((error) => error.message).join(ERROR_SEPARATOR),
    );
}

try {
  context = await browser.newContext(CONTEXT_OPTIONS);
  page = await newSmokePage(context, HUB_PATH);
  const pageErrors = collectPageErrors(page);
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

  for (const route of REQUESTED_ROUTES) {
    if (!links.includes(route))
      throw new Error(`trang chủ không có game được yêu cầu: ${route}`);
  }
  const selectedLinks = REQUESTED_ROUTES.length > 0 ? REQUESTED_ROUTES : links;
  const boardPaths =
    REQUESTED_ROUTES.length > 0
      ? selectedLinks.filter((link) => Object.hasOwn(BOARDS, link))
      : Object.keys(BOARDS);
  for (const path of boardPaths) {
    if (!links.includes(path)) throw new Error(`trang chủ thiếu thẻ ${path}`);
  }

  // Mở từng trang game (không có ?r= nên không vào phòng, không mở WebSocket):
  // trang phải tải được và chạy hết module mà không lỗi, và có hướng dẫn: lần đầu vào
  // tự mở hộp "Cách chơi", Esc đóng được, nút (i) đang hiện mở lại được, nội dung không rỗng.
  await checkGames(selectedLinks);
  ok(
    `game pages load and have a help dialog (${selectedLinks.join(ROUTE_SEPARATOR)})`,
  );
  if (boardPaths.length > 0)
    ok(`${boardPaths.join(ROUTE_SEPARATOR)} render their boards`);

  const board = await (
    await get("/api/board?game=2048", "application/json")
  ).json();
  if (!Array.isArray(board))
    throw new Error(`/api/board: ${JSON.stringify(board)}`);
  ok(`GET /api/board?game=2048 (${board.length} scores)`);

  lobbyPage = await newSmokePage(context, LOBBY_PATH);
  const lobbyErrors = collectPageErrors(lobbyPage);
  const [roomsResponse] = await Promise.all([
    lobbyPage.waitForResponse((response) => response.url() === BASE + ROOMS_PATH, WAIT),
    lobbyPage.goto(BASE + LOBBY_PATH),
  ]);
  if (!roomsResponse.ok() || !Array.isArray((await roomsResponse.json()).rooms)) {
    throw new Error("Lobby room request failed");
  }
  await lobbyPage.locator(LOBBY_READY_SELECTOR).first().waitFor(WAIT);
  assertNoPageErrors(lobbyErrors);
  ok("open-rooms page /phong/ renders");

  assertNoPageErrors(pageErrors);
  ok("no uncaught page errors");
} catch (error) {
  failed += 1;
  console.log("FAIL:", error.message);
  if (lobbyPage ?? page) await captureFailure(lobbyPage ?? page);
} finally {
  try {
    if (context) await closeSmokeContext(context);
  } finally {
    await browser.close();
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

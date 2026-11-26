import { findChromium } from "@huyab/e2e";
import { chromium } from "playwright-core";

const BASE = (process.env.E2E_BASE_URL || "http://127.0.0.1:8789").replace(/\/$/, "");
const CLI_ARGUMENT_OFFSET = 2;
const REQUESTED_ROUTES = [...new Set(process.argv.slice(CLI_ARGUMENT_OFFSET))];
const HUB = "/";
const LOBBY = "/phong/";
const VIEWPORTS = [
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: "laptop", viewport: { width: 1024, height: 768 } },
  { name: "desktop", viewport: { width: 1280, height: 800 } },
];
const LONG_NAME = "Nguyễn Thị Minh Khai Hoàng Phương Thảo (tên-rất-dài-kiểm-tra-layout@example.com)";
const RESULT_OWNER_LENGTH = 64;
const SIGNED_IN_PROFILE = {
  user: { name: LONG_NAME, picture: null },
  stats: [],
  guestPending: false,
  resultOwner: "0".repeat(RESULT_OWNER_LENGTH),
};
const PROFILE_ROUTE = "**/api/me";
const JSON_TYPE = "application/json";
const FRAMES = ["#sidebar", ".sb-panel", ".card", "dialog[open]", "a.game", ".thumb", ".fun-card", "header"];
const CLIPPERS = ["hidden", "clip"];
const SCROLLERS = ["auto", "scroll"];
const TOLERANCE_PX = 1;
const SETTLE_MS = 300;
const NAVIGATION = { waitUntil: "load", timeout: 15000 };
const SIDEBAR_SELECTOR = "#sidebar";
const SETTINGS_BUTTON = ".sb-settings-btn";
const DRAWER_OPEN_CLASS = "sb-open";
const OPEN_DIALOG = "dialog[open]";
const ESCAPE_KEY = "Escape";
const FAILURE_SCREENSHOT_PATH = "e2e-failure-layout.png";

function findOverflow({ frames, scrollers, clippers, tolerance }) {
  const issues = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > innerWidth + tolerance) issues.push(`trang cuộn ngang ${doc.scrollWidth}px > ${innerWidth}px`);
  const describe = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}${e.classList.length ? `.${[...e.classList].join(".")}` : ""} "${(e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30)}"`;
  const axes = [
    { overflow: "overflowX", start: "left", end: "right" },
    { overflow: "overflowY", start: "top", end: "bottom" },
  ];
  const visibleSpan = (e, frame, axis) => {
    const r = e.getBoundingClientRect();
    let start = r[axis.start];
    let end = r[axis.end];
    for (let p = e.parentElement; p && p !== frame; p = p.parentElement) {
      const overflow = getComputedStyle(p)[axis.overflow];
      if (scrollers.includes(overflow)) return null;
      if (clippers.includes(overflow)) {
        const c = p.getBoundingClientRect();
        start = Math.max(start, c[axis.start]);
        end = Math.min(end, c[axis.end]);
      }
    }
    return end > start ? { start, end } : null;
  };
  for (const frame of document.querySelectorAll(frames.join(","))) {
    if (!frame.checkVisibility({ visibilityProperty: true })) continue;
    const box = frame.getBoundingClientRect();
    const frameStyle = getComputedStyle(frame);
    const offender = axes.flatMap((axis) => {
      if (scrollers.includes(frameStyle[axis.overflow])) return [];
      for (const e of frame.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || !e.checkVisibility({ visibilityProperty: true })) continue;
        const span = visibleSpan(e, frame, axis);
        if (span && (span.end > box[axis.end] + tolerance || span.start < box[axis.start] - tolerance)) {
          return [`${describe(e)} tràn khỏi ${describe(frame)} theo ${axis.start}–${axis.end} (${Math.round(span.start)}–${Math.round(span.end)} ngoài ${Math.round(box[axis.start])}–${Math.round(box[axis.end])})`];
        }
      }
      return [];
    });
    issues.push(...offender);
  }
  return issues;
}

const scan = (page) => page.evaluate(findOverflow, { frames: FRAMES, scrollers: SCROLLERS, clippers: CLIPPERS, tolerance: TOLERANCE_PX });

async function openSettings(page) {
  await page.evaluate(({ drawerClass, button }) => {
    document.documentElement.classList.add(drawerClass);
    document.querySelector(button)?.click();
  }, { drawerClass: DRAWER_OPEN_CLASS, button: SETTINGS_BUTTON });
  await page.waitForTimeout(SETTLE_MS);
}

async function checkPage(page, route) {
  const found = [];
  const record = async (state) => { for (const issue of await scan(page)) found.push(`${route} [${state}] ${issue}`); };
  const response = await page.goto(BASE + route, NAVIGATION);
  if (!response?.ok()) throw new Error(`${route}: HTTP ${response?.status()}`);
  await page.locator(SIDEBAR_SELECTOR).waitFor({ state: "attached" });
  await page.waitForTimeout(SETTLE_MS);
  if (await page.locator(OPEN_DIALOG).count()) {
    await record("hộp thoại");
    await page.keyboard.press(ESCAPE_KEY);
    await page.waitForTimeout(SETTLE_MS);
  }
  await record("trang");
  await openSettings(page);
  await record("cài đặt");
  return found;
}

const browser = await chromium.launch({ executablePath: findChromium() });
const issues = [];
let screenshot;
try {
  for (const { name, ...options } of VIEWPORTS) {
    const context = await browser.newContext({ ...options, serviceWorkers: "block" });
    await context.route(PROFILE_ROUTE, (route) => route.fulfill({ contentType: JSON_TYPE, body: JSON.stringify(SIGNED_IN_PROFILE) }));
    const page = await context.newPage();
    await page.goto(BASE + HUB, NAVIGATION);
    const games = await page.locator("a.game").evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href")));
    const routes = [...new Set([HUB, LOBBY, ...(REQUESTED_ROUTES.length ? REQUESTED_ROUTES : games)])];
    for (const route of routes) {
      const found = (await checkPage(page, route)).map((issue) => `${name} ${issue}`);
      if (found.length && !screenshot) screenshot = page.screenshot({ path: FAILURE_SCREENSHOT_PATH });
      issues.push(...found);
    }
    console.log(`${name} ${options.viewport.width}px: ${routes.length} trang`);
    await context.close();
  }
  await screenshot;
} finally {
  await browser.close();
}

if (issues.length) {
  console.log(`FAIL layout: ${issues.length} lỗi\n${issues.join("\n")}`);
  process.exit(1);
}
console.log("PASS layout: không phần tử nào tràn khung");

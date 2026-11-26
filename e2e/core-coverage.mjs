import assert from "node:assert/strict";
import { findChromium } from "@huyab/e2e";
import { chromium } from "playwright-core";
import { saveCoverage, saveCoverageData } from "./coverage.mjs";

const DEFAULT_BASE_URL = "http://127.0.0.1:8789";
const BASE = new URL(process.env.E2E_BASE_URL || DEFAULT_BASE_URL);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const WAIT_MS = 15000;
const VIEWPORT = { width: 1280, height: 900 };
const JSON_TYPE = "application/json";
const API_PREFIX = "/api/";
const OK_STATUS = 200;
const ERROR_STATUS = 503;
const NOT_FOUND_STATUS = 404;
const OWNER_CHANGED_STATUS = 409;
const ROOM_POLL_MS = 10000;
const RECONNECT_MS = 1000;
const OFFLINE_RECONNECT_MS = 3000;
const PING_MS = 20000;
const PONG_MS = 10000;
const TOAST_EXPIRY_MS = 8001;
const SHARE_FEEDBACK_MS = 1501;
const REPLAY_COMPLETION_MS = 1700;
const REPLAY_SAVE_TIMEOUT_MS = 5001;
const LEGACY_SW_CACHE = "core-legacy-cache";
const SW_PROBE_PATH = "/core-service-worker-probe.txt";
const SW_METHOD_PATH = "/core-service-worker-method";
const NOW = 1795680000000;
const DEFAULT_PROFILE = { user: null, stats: [], resultOwner: "guest:core-test" };
const DEFAULT_API = {
  "/api/me": DEFAULT_PROFILE,
  "/api/me/history": [],
  "/api/fun": [],
  "/api/rooms": { rooms: [] },
};
if (!LOOPBACK_HOSTS.has(BASE.hostname) || !["http:", "https:"].includes(BASE.protocol)) {
  throw new Error("Core coverage requires a loopback HTTP origin; no remote writes are allowed");
}
const browser = await chromium.launch({ executablePath: findChromium() });
let completed = 0;

async function scenario(name, run, options = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: "block" });
  const requests = [];
  const state = { routes: {}, ...options.state };
  const navigationCoverage = [];
  await context.exposeBinding("coreSaveNavigationCoverage", (_source, coverage, url) => {
    const saving = saveCoverageData(coverage, url);
    navigationCoverage.push(saving);
    return saving;
  });
  await context.addInitScript(() => {
    addEventListener("pagehide", () => {
      if (globalThis.__coverage__) window.coreSaveNavigationCoverage(globalThis.__coverage__, location.href);
    });
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== BASE.origin) return route.abort();
    if (!url.pathname.startsWith(API_PREFIX)) return route.continue();
    requests.push({ path: url.pathname, search: url.search, method: request.method(), body: request.postDataJSON() });
    let reply = state.routes[url.pathname] ?? DEFAULT_API[url.pathname];
    if (typeof reply === "function") reply = await reply(request, url);
    if (reply?.abort) return route.abort();
    const status = reply?.status ?? (reply === undefined ? NOT_FOUND_STATUS : OK_STATUS);
    const body = reply?.body ?? reply ?? { error: "Unknown fixture endpoint" };
    return route.fulfill({ status, contentType: JSON_TYPE, body: JSON.stringify(body) });
  });
  await context.addInitScript(({ storage, blockedStorage, nativeShare }) => {
    window.coreCheck = (condition, label) => { if (!condition) throw new Error(label); };
    if (blockedStorage) {
      Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Storage blocked", "SecurityError"); } });
    } else {
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    }
    window.coreCopied = [];
    window.coreShared = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => {
      if (window.coreClipboardError) throw new DOMException("Permission denied", "NotAllowedError");
      window.coreCopied.push(text);
    } } });
    Object.defineProperty(navigator, "share", { configurable: true, value: nativeShare ? async (data) => {
      if (window.coreShareError) throw new DOMException("Share cancelled", window.coreShareError);
      window.coreShared.push(data);
    } : undefined });
  }, { storage: options.storage ?? {}, blockedStorage: options.blockedStorage ?? false, nativeShare: options.nativeShare ?? false });
  if (options.initScript) await context.addInitScript(options.initScript);
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT_MS);
  if (options.clock) {
    await page.clock.install({ time: NOW });
    await page.clock.pauseAt(NOW);
  }
  try {
    await page.goto(new URL(options.path ?? "/?lang=en", BASE).href);
    await page.waitForSelector("#account");
    await run({ page, state, requests, context });
    completed += 1;
    console.log(`PASS core: ${name}`);
  } finally {
    await saveCoverage(page);
    await Promise.all(navigationCoverage);
    await context.close();
  }
}

async function textContains(page, selector, text) {
  await page.waitForFunction(({ selector, text }) => document.querySelector(selector)?.textContent.includes(text), { selector, text });
}

async function navigate(page, path) {
  await saveCoverage(page);
  await page.goto(new URL(path, BASE).href);
}

async function serviceWorkerScenario() {
  const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: "allow" });
  let probeStatus = OK_STATUS;
  let probeText = "network version one";
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE.origin) return route.abort();
    if (url.pathname.startsWith(API_PREFIX)) {
      return route.fulfill({ status: OK_STATUS, contentType: JSON_TYPE, body: JSON.stringify(DEFAULT_API[url.pathname] ?? {}) });
    }
    if (url.pathname === SW_PROBE_PATH || url.pathname === SW_METHOD_PATH) {
      return route.fulfill({ status: probeStatus, contentType: "text/plain", body: probeText });
    }
    return route.continue();
  });
  await context.addInitScript((cacheName) => {
    window.coreLegacyCacheReady = caches.open(cacheName);
  }, LEGACY_SW_CACHE);
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT_MS);
  let worker;
  try {
    const workerReady = context.waitForEvent("serviceworker");
    await page.goto(new URL("/?lang=en", BASE).href);
    worker = await workerReady;
    await page.evaluate(async () => {
      await window.coreLegacyCacheReady;
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    });
    const cacheNames = await page.evaluate(() => caches.keys());
    assert.equal(cacheNames.includes(LEGACY_SW_CACHE), false);
    assert.equal(cacheNames.length, 1);
    assert.equal(await page.evaluate(async () => !!(await caches.match("/index.html"))), true);
    assert.equal(await page.evaluate(async (path) => (await fetch(path)).text(), SW_PROBE_PATH), probeText);
    await page.waitForFunction(async (path) => (await caches.match(path))?.status === 200, SW_PROBE_PATH);
    probeText = "network version two";
    assert.equal(await page.evaluate(async (path) => (await fetch(path)).text(), SW_PROBE_PATH), probeText);
    await page.waitForFunction(async (path) => (await (await caches.match(path))?.text()) === "network version two", SW_PROBE_PATH);
    await page.evaluate(async (path) => { await fetch(path, { method: "POST", body: "probe" }); }, SW_METHOD_PATH);
    assert.equal(await page.evaluate(async (path) => !!(await caches.match(path)), SW_METHOD_PATH), false);
    await page.evaluate(async () => { await fetch("/api/me"); });
    assert.equal(await page.evaluate(async () => !!(await caches.match("/api/me"))), false);
    probeStatus = NOT_FOUND_STATUS;
    assert.equal(await page.evaluate(async (path) => (await fetch(`${path}?missing=1`)).status, SW_PROBE_PATH), NOT_FOUND_STATUS);
    assert.equal(await page.evaluate(async (path) => !!(await caches.match(`${path}?missing=1`)), SW_PROBE_PATH), false);
    await page.evaluate(async () => { try { await fetch("https://blocked.invalid/core-probe"); } catch {} });
    assert.equal(await page.evaluate(async () => !!(await caches.match("https://blocked.invalid/core-probe"))), false);
    await context.setOffline(true);
    assert.equal(await page.evaluate(async () => (await fetch("/favicon.svg?offline=1")).text()), await page.evaluate(async () => (await caches.match("/favicon.svg")).text()));
    const fallback = await page.evaluate(async () => (await fetch("/not-cached-offline")).text());
    assert.ok(fallback.includes("Classic Games"));
    await context.setOffline(false);
    completed += 1;
    console.log("PASS core: service worker install, activation, network-first, bypasses and offline fallbacks");
  } finally {
    await context.setOffline(false);
    if (worker) await saveCoverage(worker);
    await saveCoverage(page);
    await context.close();
  }
}

async function legacyRedirectScenario() {
  const context = await browser.newContext({ serviceWorkers: "block" });
  context.setDefaultTimeout(WAIT_MS);
  context.setDefaultNavigationTimeout(WAIT_MS);
  const page = await context.newPage();
  let redirected = false;
  let resolveCapture;
  let captureDeadline;
  const coverageWrites = [];
  const captured = new Promise((resolve) => { resolveCapture = resolve; });
  await context.exposeBinding("__coverageSnapshot", (_source, coverage, sourceUrl) => {
    const source = new URL(sourceUrl);
    if (source.origin !== BASE.origin || source.pathname !== "/" || source.searchParams.get("r") !== "ABCD") return;
    const write = saveCoverageData(coverage, sourceUrl);
    coverageWrites.push(write);
    resolveCapture(sourceUrl);
    return write;
  });
  await context.addInitScript(() => {
    window.WebSocket = class extends EventTarget {
      constructor() { super(); this.readyState = 0; }
      close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
    };
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE.origin) return route.abort();
    if (url.pathname === "/pikachu/" && route.request().isNavigationRequest()) {
      assert.equal(url.searchParams.get("r"), "ABCD");
      redirected = true;
    }
    if (url.pathname.startsWith(API_PREFIX)) {
      return route.fulfill({ status: OK_STATUS, contentType: JSON_TYPE, body: JSON.stringify(DEFAULT_API[url.pathname] ?? {}) });
    }
    return route.continue();
  });
  try {
    await page.goto(new URL("/?r=ABCD", BASE).href);
    await page.waitForURL((url) => url.pathname === "/pikachu/");
    if (process.env.E2E_COVERAGE) {
      const capturedUrl = await Promise.race([
        captured,
        new Promise((_, reject) => {
          captureDeadline = setTimeout(() => reject(new Error("Legacy invitation did not deliver inline-script coverage")), WAIT_MS);
        }),
      ]);
      clearTimeout(captureDeadline);
      assert.equal(new URL(capturedUrl).pathname, "/");
      assert.equal(new URL(capturedUrl).searchParams.get("r"), "ABCD");
      await Promise.all(coverageWrites);
    }
    assert.equal(redirected, true);
    assert.equal(new URL(page.url()).searchParams.get("r"), "ABCD");
    completed += 1;
    console.log("PASS core: legacy invitation navigates to canonical game page");
  } finally {
    clearTimeout(captureDeadline);
    await saveCoverage(page);
    await context.close();
  }
}

try {
  await scenario("hub room counts, recently played, guest account and settings", async ({ page, state }) => {
    await textContains(page, "#meNotice", "Guest history");
    assert.match(await page.locator("#account a").getAttribute("href"), /\/login\?redirect_uri=/);
    assert.equal(await page.locator("#sidebar a[aria-current=page]").getAttribute("href"), "/");
    await textContains(page, "#roomsCount", "3");
    await textContains(page, 'a.game[href="/co-caro/"] .live', "2 rooms · 3 players");
    await textContains(page, 'a.game[href="/noi-4/"] .live', "1 room · 1 player");
    assert.equal(await page.locator("#recentList a").count(), 2);
    await page.locator(".sb-settings-btn").click();
    await textContains(page, ".sb-account", "Sign in with Google");
    for (const value of ["light", "dark"]) {
      await page.locator(`#sbSettings button[data-value="${value}"]`).click();
      assert.equal(await page.locator("html").getAttribute("data-theme"), value === "light" ? value : null);
      assert.equal(await page.evaluate(() => localStorage.getItem("gian-diep.theme")), value);
    }
    for (const value of ["off", "on"]) {
      await page.locator(`#sbSettings button[data-value="${value}"]`).click();
      assert.equal(await page.locator(`#sbSettings button[data-value="${value}"]`).getAttribute("aria-pressed"), "true");
      assert.equal(await page.evaluate(() => localStorage.getItem("sound")), value === "on" ? "1" : "0");
    }
    await page.locator('#sbSettings button[data-value="en"]').click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".sb-settings-btn").getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator(".sb-settings-btn").evaluate((node) => node === document.activeElement), true);
    await page.locator(".sb-settings-btn").click();
    await page.locator("h1").click();
    assert.equal(await page.locator("#sbSettings").isVisible(), false);
    await page.clock.runFor(ROOM_POLL_MS);
    await textContains(page, 'a.game[href="/co-caro/"] .live', "2 rooms · 3 players");
    state.routes["/api/rooms"] = { rooms: [{ path: "/co-caro/", players: 0 }] };
    await page.clock.runFor(ROOM_POLL_MS);
    await textContains(page, 'a.game[href="/co-caro/"] .live', "1 room · 0 players");
    state.routes["/api/rooms"] = { rooms: [] };
    await page.clock.runFor(ROOM_POLL_MS);
    await page.waitForFunction(() => !document.querySelector("a.game .live"));
    assert.equal(await page.locator("a.game .live").count(), 0);
    assert.equal(await page.locator("#roomsCount").textContent(), "");
    state.routes["/api/rooms"] = {};
    await page.clock.runFor(ROOM_POLL_MS);
    assert.equal(await page.locator("#roomsLink").isVisible(), true);
    await page.evaluate(() => {
      document.addEventListener("click", (event) => event.preventDefault(), { once: true });
      document.querySelector('a.game[href="/2048/"]').click();
    });
    const recent = await page.evaluate(() => JSON.parse(localStorage.getItem("hub.recent")));
    assert.equal(recent[0], "/2048/");
    assert.ok(recent.length <= 4);
  }, { clock: true, path: "/", storage: { lang: "en", "hub.recent": '["/co-caro/","/missing/","/2048/"]' }, state: { routes: { "/api/rooms": { rooms: [{ path: "/co-caro/", players: 2 }, { path: "/co-caro/", players: 1 }, { path: "/noi-4/", players: 1 }] } } } });

  await scenario("sidebar mobile navigation, language persistence and initial theme", async ({ page }) => {
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector("#sidebar").inert);
    await page.evaluate(() => {
      const home = document.createElement("a");
      home.id = "coreHome";
      home.href = "/";
      home.textContent = "Open game menu";
      document.body.append(home);
    });
    await page.locator("#coreHome").click();
    assert.equal(await page.locator("#sidebar").evaluate((node) => node.inert), false);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#sidebar").evaluate((node) => node.inert), true);
    await page.locator("#coreHome").click();
    await page.locator("#sidebarBackdrop").click({ position: { x: 350, y: 300 } });
    assert.equal(await page.locator("#sidebar").evaluate((node) => node.inert), true);
    await page.setViewportSize(VIEWPORT);
    await page.locator(".sb-settings-btn").click();
    await saveCoverage(page);
    await Promise.all([page.waitForURL((url) => !url.searchParams.has("lang")), page.locator('#sbSettings button[data-value="vi"]').click()]);
    await page.waitForFunction(() => document.documentElement.lang === "vi");
    assert.equal(await page.evaluate(() => localStorage.getItem("lang")), "vi");
    await textContains(page, "#meNotice", "Lịch sử khách");
  }, { storage: { theme: "light" } });

  await scenario("profile error retry and malformed history recovery", async ({ page, state, requests }) => {
    await textContains(page, "#meError", "Could not load your account");
    await page.locator(".sb-settings-btn").click();
    await textContains(page, ".sb-account", "Could not load your account");
    await page.keyboard.press("Escape");
    state.routes["/api/me"] = DEFAULT_PROFILE;
    state.routes["/api/me/history"] = { unexpected: true };
    await page.locator("#meRetry").click();
    await textContains(page, "#historyError", "Could not load recent games");
    state.routes["/api/me/history"] = [];
    await page.locator("#historyRetry").click();
    await page.waitForFunction(() => document.querySelector("#historyRetry").hidden);
    assert.equal(await page.locator("#historyError").isVisible(), false);
    assert.ok(requests.filter((request) => request.path === "/api/me/history").length >= 2);
    state.routes["/api/rooms"] = { abort: true };
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    assert.equal(await page.locator("#roomsLink").isVisible(), false);
  }, { state: { routes: { "/api/me": { status: ERROR_STATUS }, "/api/rooms": { status: ERROR_STATUS }, "/api/fun": { abort: true } } } });

  await scenario("signed-in guest claim retry, history pagination and leaderboard", async ({ page, state, requests }) => {
    await textContains(page, "#meError", "Could not save guest history");
    assert.equal(await page.locator("#account span").textContent(), "Coverage Player");
    assert.equal(await page.locator("#account img").count(), 1);
    await page.locator(".sb-settings-btn").click();
    await textContains(page, ".sb-account", "Coverage Player");
    assert.match(await page.locator(".sb-account a").getAttribute("href"), /\/logout\?/);
    await page.keyboard.press("Escape");
    state.routes["/api/me/history/claim"] = { ok: true };
    await page.locator("#meRetry").click();
    await textContains(page, "#meNotice", "Guest history is now kept");
    await page.waitForFunction(() => document.querySelectorAll("#history li").length === 30);
    assert.equal(await page.locator("#historyMore").isVisible(), true);
    assert.ok((await page.locator("#stats").textContent()).includes("Fastest win"));
    assert.ok((await page.locator("#stats").textContent()).includes("Biggest profit"));
    assert.ok((await page.locator("#history").textContent()).includes("vs Rival"));
    state.routes["/api/me/history"] = [];
    await page.locator("#historyMore").click();
    await page.waitForFunction(() => document.querySelector("#historyMore").hidden);
    assert.ok(requests.some((request) => request.search.startsWith("?before=")));
    assert.ok(requests.some((request) => request.path.endsWith("/claim") && request.method === "POST"));
    assert.equal(await page.locator("#funList .fun-card").first().locator(".rank").count(), 4);
    await textContains(page, "#funList", "7 points");
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/fun?period=all")),
      page.locator("#funPeriod button").last().click(),
    ]);
    assert.ok(requests.some((request) => request.path === "/api/fun" && request.search !== "?period=week"));
    assert.equal(await page.evaluate(() => localStorage.getItem("pk.name")), "Coverage Player");
  }, { state: { routes: {
    "/api/me": { user: { name: "Coverage Player", picture: "/favicon.svg" }, guestPending: true, stats: [
      { game: "co-caro", plays: 2, wins: 1, fastest: 9, best: 9, maxLevel: 3 },
      { game: "sudoku", plays: 1, wins: 0, fastest: null, best: 0, maxLevel: 2 },
      { game: "bau-cua", plays: 3, wins: 2, best: 20, maxLevel: 3 },
      { game: "snake", plays: 1, wins: 0, best: 20, maxLevel: 3 },
      { game: "logic", plays: 1, wins: 1, best: 4, maxLevel: 1 },
    ] },
    "/api/me/history/claim": { status: ERROR_STATUS },
    "/api/me/history": Array.from({ length: 30 }, (_, index) => {
      const games = ["dao-vang", "do-min", "bau-cua", "co-caro", "noi-4", "ban-tau", "snake", "bantumi", "rapid-roll", "bounce", "space-impact", "logic", "o-an-quan", "co-ganh", "co-tuong", "loto", "sudoku", "gian-diep", "2048", "tetris", "pairs", "unknown"];
      const details = [{ vs: "Rival", rp: "core-replay" }, { with: ["One", "Two"] }, { rank: 2, of: 4 }, { size: "9x9", opened: 12, booms: 1 }, {}];
      return { game: index === 29 ? "sudoku" : games[index % games.length], mode: index % 2 ? "solo" : "custom", score: index === 11 ? 0 : index === 24 ? -10 : index % 3 ? 65 : 0, won: index % 2, level: index === 29 ? 99 : index % 4 + 1, at: NOW - (index === 1 ? 120000 : index * 3700000), detail: index === 29 ? "malformed" : JSON.stringify(details[index % details.length]) };
    }),
    "/api/fun": [{ key: "plays", title: "Games", unit: "games", rows: Array.from({ length: 4 }, (_, index) => ({ name: `Player ${index}`, value: index + 1 })) }, { key: "gold", title: "Gold", unit: "$", rows: [{ name: "Miner", value: 20 }] }, { key: "mines", title: "Mines", unit: "giây", rows: [{ name: "Solver", value: 65 }] }, { key: "custom", title: "Custom", unit: "points", rows: [] }, { key: "custom-score", title: "Custom score", unit: "points", rows: [{ name: "Scorer", value: 7 }] }],
  } }, clock: true });

  await scenario("storage-denied guest settings and core helpers", async ({ page }) => {
    await textContains(page, "#meNotice", "Guest history");
    await page.locator(".sb-settings-btn").click();
    await page.locator('#sbSettings button[data-value="light"]').click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
    await page.keyboard.press("Escape");
    await page.evaluate(async () => {
      const check = window.coreCheck;
      const { store, el, $ } = await import("/dom.js");
      store.set("blocked", "value");
      check(store.get("blocked") === null, "Blocked storage is treated as absent");
      const node = el("output", { id: "coreOutput", textContent: "Visible fallback" });
      document.body.append(node);
      check($("#coreOutput").textContent === "Visible fallback", "DOM helpers render actual elements");
      const { deviceName, loadDeviceId, addReroll } = await import("/names.js");
      check(deviceName().length > 0, "Guest name survives storage denial");
      check(loadDeviceId().length > 0, "Guest identifier survives storage denial");
      const input = el("input");
      const row = addReroll(input);
      document.body.append(row);
      row.querySelector("button").click();
      check(input.value.length > 0, "Reroll works without persistence");
      const { createPanel } = await import("/panel.js");
      const toggle = el("button");
      const root = el("section");
      document.body.append(toggle, root);
      createPanel({ root, toggle, storeKey: "panel-denied" }).update([{ key: "guest", name: "Guest", color: "red" }]);
      toggle.click();
      check(document.body.classList.contains("panel-off"), "Panel toggles without storage");
    });
    await page.locator(".sb-settings-btn").click();
    await saveCoverage(page);
    await Promise.all([page.waitForURL((url) => !url.searchParams.has("lang")), page.locator('#sbSettings button[data-value="vi"]').click()]);
    await page.waitForFunction(() => document.documentElement.lang === "vi");
  }, { blockedStorage: true, path: "/?lang=en", storage: {} });

  await scenario("translation, names, icons, sound and browser input boundaries", async ({ page }) => {
    await page.evaluate(async () => {
      const check = window.coreCheck;
      const { el } = await import("/dom.js");
      const { t, tx, applyStatic } = await import("/i18n.js");
      check(t("vi", "en") === "en" && t("fallback") === "fallback", "Translation fallback");
      check(tx(["vi", "en"]) === "en" && tx("plain") === "plain", "Server text conversion");
      const translated = el("section");
      translated.innerHTML = '<p data-en="English">Việt</p><p data-en-html="<b>Rich</b>"></p><input data-en-title="Title" data-en-placeholder="Hint" data-en-aria-label="Label">';
      document.body.append(translated);
      applyStatic(translated);
      check(translated.querySelector("b").textContent === "Rich", "HTML translation rendered");
      check(translated.querySelector("input").getAttribute("aria-label") === "Label", "Accessible translated input");
      const { deviceName, randomName, loadDeviceId, addReroll } = await import("/names.js");
      for (const previous of ["Người chơi 123", "Pika1234", "Thợ mỏ"]) {
        localStorage.setItem("pk.name", previous);
        check(deviceName() !== previous, "Legacy names regenerated");
      }
      localStorage.setItem("pk.name", "Chosen name");
      check(deviceName() === "Chosen name", "Explicit player name retained");
      check(randomName().length <= 20, "Generated name respects maximum length");
      localStorage.removeItem("pk.id");
      const id = loadDeviceId();
      check(loadDeviceId() === id, "Device identifier persists");
      const input = el("input");
      document.body.append(input);
      const row = addReroll(input);
      row.querySelector("button").click();
      check(input.value === localStorage.getItem("pk.name"), "Reroll persists rendered name");
      const { iconEl, hydrateIcons } = await import("/icons.js");
      const iconRoot = el("section");
      iconRoot.innerHTML = '<i data-icon="trophy"></i>';
      document.body.append(iconRoot, iconEl("settings"));
      hydrateIcons(iconRoot);
      check(iconRoot.querySelector("svg[aria-hidden=true] path"), "Icon hydrated into accessible decorative SVG");
      const { isSoundOn, setSoundOn, onSoundChange } = await import("/sound.js");
      const changes = [];
      onSoundChange(() => changes.push(isSoundOn()));
      setSoundOn(false);
      setSoundOn(true);
      check(JSON.stringify(changes) === "[false,true]", "Sound listeners see persisted values");
      for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
        const event = new Event(type, { cancelable: true });
        document.dispatchEvent(event);
        check(event.defaultPrevented, "Pinch gesture suppressed");
      }
      for (const count of [1, 2]) {
        const event = new Event("touchmove", { cancelable: true });
        Object.defineProperty(event, "touches", { value: Array(count).fill({}) });
        document.dispatchEvent(event);
        check(event.defaultPrevented === (count > 1), "Only multi-touch zoom suppressed");
      }
      for (const ctrlKey of [false, true]) {
        const event = new WheelEvent("wheel", { ctrlKey, cancelable: true });
        dispatchEvent(event);
        check(event.defaultPrevented === ctrlKey, "Normal scrolling retained");
      }
      const { swipe } = await import("/swipe.js");
      const surface = el("div");
      const output = el("output");
      document.body.append(surface, output);
      swipe(surface, { onSwipe: (direction) => { output.textContent += `${direction},`; }, onTap: () => { output.textContent += "tap,"; } });
      const emit = (type, x, y, pointerType = "touch") => surface.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType }));
      for (const [x, y] of [[100, 0], [-100, 0], [0, 100], [0, -100], [0, 0], [20, 0]]) { emit("pointerdown", 0, 0); emit("pointerup", x, y); }
      emit("pointerdown", 0, 0, "mouse"); emit("pointerup", 100, 0, "mouse");
      emit("pointerdown", 0, 0); emit("pointercancel", 0, 0); emit("pointerup", 100, 0);
      check(output.textContent === "right,left,down,up,tap,", "Swipe direction, tap and cancellation outcomes");
      const optional = el("div");
      swipe(optional, {});
      optional.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch" }));
      optional.dispatchEvent(new PointerEvent("pointerup", { clientX: 100, pointerType: "touch" }));
      check(output.textContent === "right,left,down,up,tap,", "Unconfigured surface does not deliver another surface input");
    });
  });

  await scenario("help modal keyboard containment, callbacks and seen state", async ({ page }) => {
    await page.evaluate(async () => {
      const { mountHelp } = await import("/help.js");
      const { el } = await import("/dom.js");
      window.coreHelpEvents = [];
      const button = el("button", { id: "coreHelp", textContent: "Rules" });
      document.body.append(button);
      window.coreHelp = mountHelp({ game: "core-fixture", button, content: { vi: { goal: "Fallback goal", play: ["First step"], keys: ["Arrows"], touch: ["Swipe"], tips: ["Think"] } }, onOpen: () => window.coreHelpEvents.push("open"), onClose: () => window.coreHelpEvents.push("close") });
      window.coreHelp.open();
      window.coreGameKeys = [];
      document.addEventListener("keydown", (event) => window.coreGameKeys.push(event.key));
    });
    await textContains(page, ".help-body", "Fallback goal");
    assert.equal(await page.locator("#coreHelp").getAttribute("aria-haspopup"), "dialog");
    await page.keyboard.press("ArrowRight");
    assert.deepEqual(await page.evaluate(() => window.coreGameKeys), []);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !window.coreHelp.isOpen()
      && localStorage.getItem("help.seen.core-fixture") === "1"
      && window.coreHelpEvents.join(",") === "open,close");
    assert.equal(await page.evaluate(() => localStorage.getItem("help.seen.core-fixture")), "1");
    await page.locator("#coreHelp").click();
    await page.locator(".help-ok").click();
    await page.waitForFunction(() => !window.coreHelp.isOpen()
      && window.coreHelpEvents.join(",") === "open,close,open,close");
    await page.locator("#coreHelp").click();
    await page.locator(".help-x").click();
    await page.waitForFunction(() => !window.coreHelp.isOpen()
      && window.coreHelpEvents.join(",") === "open,close,open,close,open,close");
    await page.evaluate(async () => {
      const check = window.coreCheck;
      const { mountHelp } = await import("/help.js");
      const first = document.createElement("button");
      const second = document.createElement("button");
      first.className = second.className = "coreHelpExtra";
      document.body.append(first, second);
      const simple = mountHelp({ game: "core-simple", button: ".coreHelpExtra", auto: false, content: { en: { goal: "Simple goal", play: [] } } });
      check(!simple.isOpen(), "Auto false keeps game interactive");
      first.click();
      check(simple.isOpen(), "Selector activates help");
      document.querySelectorAll("dialog.help-dlg")[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      check(!simple.isOpen(), "Backdrop click closes help");
      const seen = mountHelp({ game: "core-fixture", button: [second], content: { en: { goal: "Seen", play: [] } } });
      check(!seen.isOpen(), "Seen help does not reopen automatically");
      seen.open();
      seen.close();
      check(!seen.isOpen(), "Returned close control dismisses the dialog");
      check(window.coreHelpEvents.join(",") === "open,close,open,close,open,close", "Exactly one callback per modal transition");
    });
  });

  await scenario("listbox keyboard, disabled options, selection, mutation and dismissal", async ({ page }) => {
    await page.evaluate(async () => {
      const { listbox } = await import("/ui/listbox.mjs");
      const form = document.createElement("section");
      form.id = "coreListbox";
      form.innerHTML = '<select aria-label="Difficulty"><option value="easy">Easy</option><option value="locked" disabled>Locked</option><option value="hard">Hard</option><option value="expert">Expert</option></select><output></output>';
      document.body.prepend(form);
      const select = form.querySelector("select");
      select.onchange = () => { form.querySelector("output").textContent = select.value; };
      listbox(select);
      window.coreSelect = select;
    });
    const trigger = page.locator("#coreListbox [role=combobox]");
    await trigger.press("a");
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    await trigger.press("ArrowDown");
    assert.equal(await page.locator("[role=listbox]").getAttribute("aria-label"), "Difficulty");
    await trigger.press("ArrowDown");
    await trigger.press("Enter");
    await textContains(page, "#coreListbox output", "hard");
    assert.equal(await trigger.innerText(), "Hard");
    await trigger.press("ArrowUp");
    await trigger.press("End");
    await trigger.press(" ");
    assert.equal(await page.locator("#coreListbox select").inputValue(), "expert");
    await trigger.press("Enter");
    await trigger.press("Home");
    await trigger.press("ArrowUp");
    await trigger.press("Enter");
    assert.equal(await page.locator("#coreListbox select").inputValue(), "easy");
    await trigger.click();
    await trigger.press("a");
    assert.equal(await trigger.getAttribute("aria-expanded"), "true");
    await trigger.press("Enter");
    assert.equal(await page.locator("#coreListbox select").inputValue(), "easy");
    assert.equal(await page.locator("#coreListbox output").textContent(), "easy");
    await trigger.click();
    await page.locator('[role=option]:has-text("Hard")').hover();
    await page.locator('[role=option]:has-text("Hard")').click();
    assert.equal(await trigger.innerText(), "Hard");
    for (const key of ["Escape", "Tab"]) {
      await trigger.click();
      await trigger.press(key);
      assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    }
    await trigger.click();
    await page.locator("h1").click();
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    await trigger.click();
    await page.evaluate(() => dispatchEvent(new Event("resize")));
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    await trigger.click();
    await page.evaluate(() => document.dispatchEvent(new Event("scroll")));
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    await page.evaluate(() => { window.coreSelect.value = "expert"; });
    assert.equal(await trigger.innerText(), "Expert");
    await page.evaluate(() => { window.coreSelect.selectedIndex = -1; });
    assert.equal(await trigger.innerText(), "");
    await trigger.click();
    await page.evaluate(() => { window.coreSelect.disabled = true; });
    await page.waitForFunction(() => document.querySelector("#coreListbox button").disabled);
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    await page.evaluate(async () => {
      const check = window.coreCheck;
      const { listbox } = await import("/ui/listbox.mjs");
      const dialog = document.createElement("dialog");
      document.body.append(dialog);
      const select = document.createElement("select");
      select.innerHTML = '<option disabled>Unavailable</option>';
      const initialSelection = select.selectedIndex;
      let selectionChanges = 0;
      select.addEventListener("change", () => { selectionChanges += 1; });
      dialog.append(listbox(select));
      dialog.showModal();
      const button = dialog.querySelector("button");
      button.click();
      check(dialog.querySelector("[role=listbox]"), "Popup stays in modal focus scope");
      check(!button.hasAttribute("aria-activedescendant"), "No disabled option marked active");
      for (const key of ["ArrowDown", "Enter", "Escape"]) button.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      check(select.selectedIndex === initialSelection && selectionChanges === 0, "Disabled choices preserve native selection without change events");
      dialog.close();
    });
    await page.evaluate(() => {
      window.coreSelect.disabled = false;
      const fixture = document.querySelector("#coreListbox");
      fixture.style.cssText = "position:fixed;bottom:10px;left:260px;z-index:2000;width:200px";
      window.coreSelect.options[0].textContent = "Beginner";
      window.coreSelect.value = "easy";
    });
    await textContains(page, "#coreListbox [role=combobox]", "Beginner");
    await trigger.click();
    assert.notEqual(await page.locator("[role=listbox]").evaluate((node) => node.style.bottom), "");
    await page.locator("[role=listbox]").evaluate((node) => node.dispatchEvent(new Event("scroll")));
    assert.equal(await trigger.getAttribute("aria-expanded"), "true");
    const disabledOption = page.locator('[role=option]:has-text("Locked")');
    const disabledBounds = await disabledOption.boundingBox();
    assert.ok(disabledBounds);
    const selectedBeforePointer = await page.locator("#coreListbox select").inputValue();
    const activeBeforePointer = await trigger.getAttribute("aria-activedescendant");
    await page.mouse.move(disabledBounds.x + disabledBounds.width / 2, disabledBounds.y + disabledBounds.height / 2);
    assert.equal(await page.locator("#coreListbox select").inputValue(), selectedBeforePointer);
    assert.equal(await trigger.getAttribute("aria-activedescendant"), activeBeforePointer);
    assert.equal(await disabledOption.getAttribute("aria-selected"), "false");
    await trigger.click();
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
  });

  await scenario("pending action gate, toast deduplication, limits and dismissal", async ({ page }) => {
    await page.evaluate(async () => {
      const check = window.coreCheck;
      const { createActionGate, setButtonPending, createToasts, TOAST_TONE } = await import("/ui/feedback.mjs");
      const gate = createActionGate();
      const release = gate.claim("save");
      check(gate.busy("save") && gate.claim("save") === null, "Double submission blocked");
      release(); release();
      check(!gate.busy("save"), "Release is idempotent");
      const button = document.createElement("button");
      button.innerHTML = '<b>Save</b>';
      document.body.append(button);
      const child = button.firstChild;
      const restore = setButtonPending(button);
      check(button.disabled && button.getAttribute("aria-busy") === "true", "Pending action exposes busy state");
      restore(); restore();
      check(button.firstChild === child && !button.disabled && !button.hasAttribute("aria-busy"), "Original DOM and accessibility restored");
      button.disabled = true;
      button.setAttribute("aria-busy", "false");
      setButtonPending(button, "Saving")();
      check(button.disabled && button.getAttribute("aria-busy") === "false", "Previous disabled/busy state retained");
      window.coreToasts = createToasts();
      const dismiss = window.coreToasts.show("invalid-tone", "Fallback", { description: "Details", duration: 0 });
      const duplicate = window.coreToasts.show("invalid-tone", "Fallback", { description: "Details", duration: 0 });
      check(document.querySelectorAll(".ui-toast").length === 1, "Duplicate notifications coalesced");
      check(document.querySelector(".ui-toast").dataset.tone === TOAST_TONE.INFO, "Unknown tone safely defaults to info");
      duplicate(); dismiss();
      for (const tone of Object.values(TOAST_TONE)) window.coreToasts.show(tone, tone);
      check(document.querySelectorAll(".ui-toast").length === 3, "Oldest notification evicted at limit");
      const { notifications, TOAST_ICON } = await import("/ui/notifications.js");
      window.coreToasts.destroy();
      notifications.show(TOAST_TONE.SUCCESS, "Saved", { duration: 0, icon: TOAST_ICON.TROPHY });
      check(document.querySelector(".ui-toast svg"), "Notification uses real icon renderer");
    });
    await page.locator(".ui-toast-close").click();
    assert.equal(await page.locator(".ui-toast").count(), 0);
    await page.evaluate(async () => {
      const { createToasts, TOAST_TONE } = await import("/ui/feedback.mjs");
      window.coreTimedToasts = createToasts();
      window.coreTimedToasts.show(TOAST_TONE.ERROR, "Expires");
    });
    await page.locator(".ui-toast").hover();
    await page.clock.runFor(TOAST_EXPIRY_MS);
    assert.equal(await page.locator(".ui-toast").count(), 1);
    await page.locator("h1").hover();
    await page.clock.runFor(TOAST_EXPIRY_MS);
    assert.equal(await page.locator(".ui-toast").count(), 0);
    await page.evaluate(() => window.coreTimedToasts.show("info", "Focusable"));
    await page.locator(".ui-toast-close").focus();
    await page.clock.runFor(TOAST_EXPIRY_MS);
    assert.equal(await page.locator(".ui-toast").count(), 1);
    await page.locator(".sb-settings-btn").focus();
    await page.clock.runFor(TOAST_EXPIRY_MS);
    assert.equal(await page.locator(".ui-toast").count(), 0);
  }, { clock: true });

  await scenario("invite QR, clipboard denial, native sharing and replay links", async ({ page }) => {
    await page.evaluate(async () => { const { invite } = await import("/invite.js"); await invite(`${location.origin}/co-caro/?r=ABCD`, "ABCD"); });
    assert.equal(await page.locator("#invite .code").textContent(), "ABCD");
    assert.equal(await page.locator("#invite .qr svg").count(), 1);
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await textContains(page, "#invite .ui-toast", "Invite link copied");
    assert.equal((await page.evaluate(() => window.coreCopied))[0], new URL("/co-caro/?r=ABCD", BASE).href);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    assert.equal((await page.evaluate(() => window.coreShared))[0].title, "Join room ABCD");
    await page.evaluate(() => { window.coreClipboardError = true; window.coreShareError = "AbortError"; });
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await textContains(page, "#invite .ui-toasts", "/co-caro/?r=ABCD");
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.evaluate(async () => {
      const { invite } = await import("/invite.js");
      await invite(`${location.origin}/noi-4/?r=EFGH`, "EFGH");
      document.querySelector("#invite").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const check = window.coreCheck;
      const { replayLinks, shareReplay, replayUrl, replayParam } = await import("/replay.js");
      check(replayParam() === null, "Normal page has no replay parameter");
      const empty = replayLinks(null);
      check(empty.hidden, "Legacy history without replay has no dead link");
      document.body.append(replayLinks("core-replay"));
      check(await shareReplay("cancelled") === false, "Cancelled share does not announce clipboard success");
      window.coreShareError = "NotAllowedError";
      window.coreClipboardError = false;
      check(await shareReplay("fallback") === true, "Share refusal falls back to clipboard");
      check(window.coreCopied.at(-1) === replayUrl("fallback"), "Copied URL uses local origin");
      window.coreShareError = null;
      check(await shareReplay("native") === false, "Native share does not falsely claim copy");
    });
    assert.equal(await page.locator(".rp-links a").getAttribute("rel"), "noopener");
    await page.locator(".rp-links button").click();
    assert.equal(await page.locator(".rp-links button").textContent(), "Share");
    assert.match((await page.evaluate(() => window.coreShared.at(-1))).url, /core-replay/);
  }, { nativeShare: true });

  await scenario("clipboard-only share feedback and QR output formats", async ({ page }) => {
    await page.evaluate(async () => {
      const check = window.coreCheck;
      const { invite } = await import("/invite.js");
      await invite(`${location.origin}/?r=ABCD`, "ABCD");
      check(document.querySelectorAll("#invite .row button").length === 2, "Unsupported native share is not offered");
      document.querySelector("#invite").close();
      const { replayLinks } = await import("/replay.js");
      document.body.append(replayLinks("copy-only"));
    });
    await page.locator(".rp-links button").click();
    await textContains(page, ".rp-links button", "Link copied");
    await page.clock.runFor(SHARE_FEEDBACK_MS);
    await textContains(page, ".rp-links button", "Share");
    await page.evaluate(async () => {
      const check = window.coreCheck;
      const { default: qr } = await import("/vendor/qrcode.mjs");
      const container = document.createElement("section");
      document.body.append(container);
      for (const [mode, text] of [["Numeric", "1234567890"], ["Alphanumeric", "HELLO 123 $%*+-./:"], ["Alphanumeric", "A"], ["Byte", "Room invitation"]]) {
        for (const level of ["L", "M", "Q", "H"]) {
          const code = qr(0, level);
          code.addData(text, mode);
          code.make();
          const size = code.getModuleCount();
          check(size >= 21 && (size - 17) % 4 === 0, "QR dimension matches a valid version");
          check(code.isDark(0, 0) && !code.isDark(1, 1) && code.isDark(3, 3), "Finder pattern retained across encoding modes");
          container.innerHTML = code.createSvgTag({ scalable: true, alt: "Invitation & room", title: "Code <safe>" });
          check(container.querySelector("svg path"), "SVG has rendered QR modules");
          check(container.querySelector("title").textContent === "Code <safe>", "QR accessible title escaped");
          container.innerHTML = code.createTableTag();
          check(container.querySelectorAll("tr").length === size, "Table encodes every matrix row");
          check(code.createDataURL().startsWith("data:image/gif;base64,"), "Raster output is GIF data URL");
          container.innerHTML = code.createImgTag(2, 0, 'Room "A"');
          check(container.querySelector("img").alt === 'Room "A"', "Image alt escaped safely");
          check(code.createASCII().length > size && code.createASCII(2, 0).length > size, "ASCII renderers produce matrix");
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = size * 2;
          const context = canvas.getContext("2d");
          code.renderTo2dContext(context);
          check(context.getImageData(0, 0, 1, 1).data[3] === 255, "Canvas QR paints opaque modules");
          let boundsError = false;
          try { code.isDark(-1, size); } catch { boundsError = true; }
          check(boundsError, "QR rejects out-of-range module reads");
        }
      }
      for (const version of [1, 7, 10, 27, 40]) {
        const code = qr(version, "L");
        code.addData("12", "Numeric");
        code.make();
        check(code.getModuleCount() === version * 4 + 17, "Explicit QR version determines dimension");
        check(code.createSvgTag(1, 0).includes("<svg"), "Explicit version renders");
        if (version === 40) check(code.createDataURL(1, 0).length > 1000, "Largest supported matrix has a complete raster encoding");
      }
      for (const [mode, text] of [["Numeric", "abc"], ["Alphanumeric", "lowercase"], ["Unknown", "test"]]) {
        let error = false;
        try { const code = qr(1, "L"); code.addData(text, mode); code.make(); } catch { error = true; }
        check(error, "QR rejects invalid mode/data combination");
      }
      let overflow = false;
      try { const code = qr(1, "H"); code.addData("x".repeat(100)); code.make(); } catch { overflow = true; }
      check(overflow, "QR rejects payload too large for explicit version");
      const plainEncoder = qr.stringToBytes;
      const map = btoa(String.fromCharCode(0x53, 0xcb, 0x97, 0x46, 0x6f, 0x22, 0x8a, 0xbf, 0x83, 0x17, 0xe4, 0xaa, 0x00, 0xe9, 0x00, 0xe9));
      const encoder = qr.createStringToBytes(map, 4);
      check(JSON.stringify(encoder("A友é☃")) === "[65,151,70,233,63]", "Character mapping handles ASCII, double/single bytes and unknown characters");
      qr.stringToBytes = encoder;
      try {
        const code = qr(0, "M");
        code.addData("友漢茗", "Kanji");
        code.make();
        check(code.getModuleCount() === 21 && code.isDark(3, 3), "Shift-JIS Kanji creates valid finder matrix");
        for (const version of [10, 27]) {
          for (const [mode, data] of [["Byte", "A"], ["Alphanumeric", "A"], ["Kanji", "友"]]) {
            const large = qr(version, "M");
            large.addData(data, mode);
            large.make();
            check(large.getModuleCount() === version * 4 + 17 && large.isDark(3, 3), "Mode length fields support each QR version group");
          }
        }
        for (const invalid of ["A", "AA", "é"]) {
          let rejected = false;
          try { const invalidCode = qr(1, "M"); invalidCode.addData(invalid, "Kanji"); invalidCode.make(); } catch { rejected = true; }
          check(rejected, "Kanji mode rejects non-Kanji byte sequences");
        }
      } finally {
        qr.stringToBytes = plainEncoder;
      }
      let unsupported = false;
      try { qr(1, "M").addData("友", "Kanji"); } catch { unsupported = true; }
      check(unsupported, "Default byte encoder rejects unsupported Shift-JIS mode");
      for (const [mapping, count] of [[map, 3], ["!", 0], ["A", 0], ["AA==", 1]]) {
        let rejected = false;
        try { qr.createStringToBytes(mapping, count); } catch { rejected = true; }
        check(rejected, "Invalid conversion map is rejected before encoding");
      }
      for (const [version, correction] of [[41, "L"], [1, "invalid"]]) {
        let rejected = false;
        try { const invalidCode = qr(version, correction); invalidCode.addData("A"); invalidCode.make(); } catch { rejected = true; }
        check(rejected, "Invalid QR version or correction level cannot create a code");
      }
    });
  }, { clock: true });

  await scenario("history preparation failure, retry, owner conflict and idempotent save", async ({ page, state, requests }) => {
    state.routes["/api/me"] = { resultOwner: null };
    await page.evaluate(async () => {
      const { beginHistory } = await import("/history.js");
      window.coreRetryStart = 0;
      const start = await beginHistory("2048", () => { window.coreRetryStart += 1; });
      window.coreCheck(start === null, "Missing owner cannot start a game");
    });
    await textContains(page, "#historyStatus", "game has not started");
    await page.locator("#historyStatus button").click();
    assert.equal(await page.evaluate(() => window.coreRetryStart), 1);
    state.routes["/api/me"] = DEFAULT_PROFILE;
    state.routes["/api/me/history"] = { status: OWNER_CHANGED_STATUS };
    await page.evaluate(async () => {
      const { beginHistory } = await import("/history.js");
      window.coreHistory = await beginHistory("2048", () => {});
      const details = { score: 128, won: false, mode: "solo", level: 1 };
      window.coreHistory.finish(details, Promise.resolve("recorded-replay"));
      window.coreHistory.finish({ score: 999 });
    });
    await textContains(page, "#historyStatus", "Your session changed");
    assert.equal(requests.filter((request) => request.method === "POST" && request.path === "/api/me/history").length, 1);
    const first = requests.find((request) => request.method === "POST" && request.path === "/api/me/history").body;
    assert.equal(first.rp, "recorded-replay");
    assert.equal(first.score, 128);
    assert.equal(first.resultOwner, DEFAULT_PROFILE.resultOwner);
    assert.equal(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; }), true);
    state.routes["/api/me/history"] = { status: ERROR_STATUS };
    await page.locator("#historyStatus button").click();
    await textContains(page, "#historyStatus", "Saving this game is not confirmed");
    state.routes["/api/me/history"] = { ok: true };
    await page.locator("#historyStatus button").click();
    await textContains(page, "#historyStatus", "This game is saved");
    assert.equal(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; }), false);
    assert.deepEqual(requests.filter((request) => request.method === "POST" && request.path === "/api/me/history").map((request) => request.body.eventId), [first.eventId, first.eventId, first.eventId]);
    await page.evaluate(async () => {
      const { beginHistory } = await import("/history.js");
      const game = await beginHistory("tetris", () => {});
      game.finish({ score: 12, won: false, mode: "solo", level: 1 }, Promise.reject(new Error("Replay unavailable")));
    });
    await textContains(page, "#historyStatus", "This game is saved");
    assert.equal(requests.filter((request) => request.method === "POST").at(-1).body.rp, undefined);
  });

  await scenario("slow replay storage cannot block saving game results", async ({ page, requests }) => {
    await page.evaluate(async () => {
      const { beginHistory } = await import("/history.js");
      const round = await beginHistory("2048", () => {});
      round.finish({ score: 64, won: false, mode: "solo", level: 1 }, new Promise(() => {}));
    });
    await textContains(page, "#historyStatus", "Saving this game");
    assert.equal(requests.some((request) => request.method === "POST"), false);
    await page.clock.runFor(REPLAY_SAVE_TIMEOUT_MS);
    await textContains(page, "#historyStatus", "This game is saved");
    assert.equal(requests.find((request) => request.method === "POST").body.score, 64);
    assert.equal(requests.find((request) => request.method === "POST").body.rp, undefined);
    await page.evaluate(async () => {
      const { beginHistory } = await import("/history.js");
      const round = await beginHistory("tetris", () => {});
      round.finish({ score: 12, won: false, mode: "solo", level: 1 });
    });
    await textContains(page, "#historyStatus", "This game is saved");
    assert.equal(requests.filter((request) => request.method === "POST").length, 2);
  }, { clock: true });

  await scenario("replay loading, upload failures, seeking, speed and keyboard playback", async ({ page, state, requests }) => {
    await page.evaluate(async () => {
      const { uploadReplay } = await import("/replay.js");
      window.coreCheck(await uploadReplay("2048", "/2048/", [[0, { score: 2 }]]) === "core-upload", "Replay upload returns server identity");
    });
    assert.equal(requests.find((request) => request.path === "/api/replay").body.game, "2048");
    state.routes["/api/replay"] = { status: ERROR_STATUS };
    await page.evaluate(async () => { const { uploadReplay } = await import("/replay.js"); window.coreCheck(await uploadReplay("2048", "/2048/", []) === null, "Failed upload cannot invent replay id"); });
    state.routes["/api/replay"] = { abort: true };
    await page.evaluate(async () => { const { uploadReplay } = await import("/replay.js"); window.coreCheck(await uploadReplay("2048", "/2048/", []) === null, "Network failure cannot invent replay id"); });
    await page.evaluate(async () => {
      const { playReplay } = await import("/replay.js");
      await playReplay("missing", { feed() { throw new Error("Missing replay fed a game message"); } });
    });
    await textContains(page, ".rp-tag", "Replay not found");
    await page.evaluate(async () => {
      document.querySelector(".rp-tag").remove();
      const { playReplay } = await import("/replay.js");
      const output = document.createElement("output");
      output.id = "coreReplayOutput";
      document.body.append(output);
      window.coreReplayResets = 0;
      await playReplay("valid", { feed: (message) => { output.textContent += `${message.score},`; }, reset: () => { output.textContent = ""; window.coreReplayResets += 1; } });
    });
    assert.equal(await page.locator("#coreReplayOutput").textContent(), "2,");
    assert.equal(await page.locator(".rp-bar input").getAttribute("max"), "1600");
    await page.locator(".rp-bar button").first().click();
    for (const label of ["2×", "4×", "0.5×", "1×"]) {
      await page.locator(".rp-bar button").nth(1).click();
      assert.equal(await page.locator(".rp-bar button").nth(1).textContent(), label);
    }
    await page.locator(".rp-bar input").evaluate((node) => { node.value = node.max; node.dispatchEvent(new Event("input")); });
    assert.equal(await page.locator("#coreReplayOutput").textContent(), "2,4,8,");
    await page.locator(".rp-bar button").first().click();
    assert.equal(await page.locator("#coreReplayOutput").textContent(), "2,");
    await page.clock.runFor(REPLAY_COMPLETION_MS);
    assert.equal(await page.locator("#coreReplayOutput").textContent(), "2,4,8,");
    await page.evaluate(() => { document.activeElement.blur(); document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true })); });
    assert.equal(await page.locator("#coreReplayOutput").textContent(), "2,");
    assert.ok(await page.evaluate(() => window.coreReplayResets >= 3));
    assert.equal(await page.locator(".rp-bar a").getAttribute("href"), "/2048/");
  }, { clock: true, state: { routes: { "/api/replay": { id: "core-upload" }, "/api/replay/missing": { status: NOT_FOUND_STATUS }, "/api/replay/valid": { page: "/2048/", frames: [[0, { score: 2 }], [100, { score: 4 }], [10000, { score: 8 }]] } } } });

  await scenario("unavailable, empty and one-frame replay controls", async ({ page }) => {
    await page.evaluate(async () => {
      const { playReplay, replayParam } = await import("/replay.js");
      window.coreCheck(replayParam() === "single", "Replay identifier is read from URL");
      for (const id of ["offline", "empty"]) {
        await playReplay(id, { feed() { throw new Error("Unavailable replay delivered a frame"); } });
      }
    });
    assert.equal(await page.locator(".rp-tag").count(), 2);
    for (const tag of await page.locator(".rp-tag").allTextContents()) assert.match(tag, /Replay not found/);
    await page.evaluate(async () => {
      for (const node of document.querySelectorAll(".rp-tag")) node.remove();
      const output = document.createElement("output");
      output.id = "coreSingleReplay";
      document.body.append(output);
      const { playReplay } = await import("/replay.js");
      await playReplay("single", { feed: (message) => { output.textContent = message.text; } });
    });
    assert.equal(await page.locator("#coreSingleReplay").textContent(), "Completed");
    assert.equal(await page.locator(".rp-bar input").getAttribute("max"), "1");
    await page.clock.runFor(1);
    await page.locator(".rp-bar button").first().click();
    assert.equal(await page.locator("#coreSingleReplay").textContent(), "Completed");
    await page.locator(".rp-bar input").evaluate((node) => { node.value = "1"; node.dispatchEvent(new Event("input")); });
    assert.equal(await page.locator(".rp-time").textContent(), "0:00 / 0:00");
  }, { path: "/?lang=en&replay=single", clock: true, state: { routes: {
    "/api/replay/offline": { abort: true },
    "/api/replay/empty": { frames: [] },
    "/api/replay/single": { page: "/2048/", frames: [[0, { text: "Completed" }]] },
  } } });

  await scenario("player panel rendering, caching, removal, public permission switch", async ({ page }) => {
    await page.evaluate(async () => {
      const check = window.coreCheck;
      const { createPanel, drawGrid } = await import("/panel.js");
      const { publicSwitch } = await import("/public-switch.js");
      const root = document.createElement("section");
      const toggle = document.createElement("button");
      document.body.append(toggle, root);
      const style = document.createElement("style");
      style.textContent = ".tile-board { width: 100px; height: 80px; }";
      document.head.append(style);
      const panel = createPanel({ root, toggle, storeKey: "core.panel" });
      let draws = 0;
      const draw = (context, width, height) => { draws += 1; context.fillStyle = "red"; context.fillRect(0, 0, width, height); };
      const tiles = [{ key: "first", name: " Alice ", color: "red", badge: { icon: "crown" }, me: true, off: true }, { key: "board", name: "Bob", sub: "Score 2", color: "blue", draw, version: 1 }];
      panel.update(tiles);
      panel.update(tiles);
      check(draws === 1, "Attached canvas drawn once at stable dimensions");
      const first = root.firstChild;
      check(first.querySelector(".tile-avatar").textContent === "A", "Avatar uses trimmed initial");
      check(first.classList.contains("me") && first.classList.contains("off"), "Player flags rendered");
      panel.update(tiles);
      check(draws === 1 && root.firstChild === first, "Unchanged panel keeps DOM and drawing");
      tiles[1].version += 1;
      panel.update([...tiles].reverse());
      check(draws === 2 && root.lastChild === first, "Changed version redraws and changed order moves tiles");
      panel.update([{ ...tiles[0], badge: "Winner", name: "" }]);
      check(root.children.length === 1 && first.querySelector(".tile-badge").textContent === "Winner", "Removed player evicted and text badge updated");
      check(first.querySelector(".tile-avatar").textContent === "?", "Missing display name uses fallback avatar");
      panel.update([{ ...tiles[0], badge: null }]);
      check(first.querySelector(".tile-badge").hidden, "Absent badge hidden");
      toggle.click();
      check(localStorage.getItem("core.panel") === "1", "Hide preference saved");
      toggle.click();
      panel.update([]);
      check(toggle.hidden && document.body.classList.contains("panel-empty"), "Empty panel removes unused control");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 100;
      const context = canvas.getContext("2d");
      drawGrid(context, 100, 100, null, null, {});
      const sprite = new Image();
      sprite.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>')}`;
      await sprite.decode();
      const board = [[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]];
      for (const [width, height] of [[100, 80], [40, 100]]) {
        drawGrid(context, width, height, board, sprite, { y: 0, w: 10, h: 10 });
        check(context.getImageData(0, 0, width, height).data.some((value) => value > 0), "Grid preview draws in landscape and portrait");
      }
      const messages = [];
      const control = publicSwitch((message) => messages.push(message));
      document.body.append(control.el);
      control.update(null, false);
      check(control.el.hidden, "No room hides visibility switch");
      control.update({}, true);
      check(control.el.hidden, "Unsupported room hides visibility switch");
      control.update({ pub: true }, false);
      check(control.el.querySelector("input").disabled && control.el.textContent.includes("listed"), "Guests see public state without permission to change it");
      control.update({ pub: false }, true);
      control.el.querySelector("input").click();
      check(messages.length === 1 && messages[0].on === true && messages[0].t === "public", "Host toggling emits expected public command");
      publicSwitch(() => {}).update({ pub: true }, true);
    });
  });

  await scenario("room transport reconnect, heartbeat, takeover, refusal and bfcache socket cleanup", async ({ page }) => {
    await page.evaluate(async () => {
      window.coreSockets = [];
      class TransportSocket extends EventTarget {
        constructor(url) { super(); this.url = url; this.readyState = 0; this.sent = []; window.coreSockets.push(this); }
        send(value) { this.sent.push(value); }
        close() { this.readyState = 3; this.dispatchEvent(new Event("close")); this.onclose?.({ code: 1000 }); }
        accept() { this.readyState = 1; this.onopen?.(); }
        receive(data) { this.onmessage?.({ data }); }
        disconnect(code) { this.readyState = 3; this.dispatchEvent(new Event("close")); this.onclose?.({ code }); }
      }
      window.WebSocket = TransportSocket;
      await import("/bfcache.js?core-transport");
      const { roomClient, newRoomCode } = await import("/room-client.js");
      const conn = document.createElement("span");
      conn.id = "coreConnection";
      const output = document.createElement("output");
      output.id = "coreRoomOutput";
      document.body.append(conn, output);
      window.coreRoomMessages = [];
      window.coreRoom = roomClient({ path: () => "/api/core/room/ABCD", query: () => ({ name: "Player & test", id: "device" }), conn, onMsg: (message) => { window.coreRoomMessages.push(message); output.textContent = message.text; }, onLeave: (reason) => { output.textContent = reason; } });
      window.coreRoom.send({ t: "before-open" });
      window.coreRoom.close();
      window.coreRoom.open();
      const socket = window.coreSockets.at(-1);
      window.coreCheck(new URL(socket.url).searchParams.get("name") === "Player & test", "Room query safely encoded");
      window.coreCheck(/^[A-HJ-NP-Z2-9]{4}$/.test(newRoomCode()), "New room code excludes ambiguous characters");
      socket.accept();
      socket.receive("pong");
      socket.receive(JSON.stringify({ text: "Joined room" }));
      window.coreRoom.send({ t: "ready" });
      window.coreCheck(socket.sent[0] === '{"t":"ready"}', "Connected command serialized");
    });
    await textContains(page, "#coreRoomOutput", "Joined room");
    assert.equal(await page.locator("#coreConnection").getAttribute("class"), "on");
    await page.clock.runFor(PING_MS);
    assert.equal(await page.evaluate(() => window.coreSockets.at(-1).sent.at(-1)), "ping");
    await page.evaluate(() => window.coreSockets.at(-1).receive("pong"));
    await page.clock.runFor(PONG_MS);
    assert.equal(await page.evaluate(() => window.coreSockets.length), 1);
    await page.evaluate(() => window.coreSockets.at(-1).disconnect(1006));
    await textContains(page, "#netLost", "Connection lost");
    await page.clock.runFor(RECONNECT_MS);
    assert.equal(await page.evaluate(() => window.coreSockets.length), 2);
    await page.evaluate(() => window.coreSockets.at(-1).accept());
    assert.equal(await page.locator("#netLost").isVisible(), false);
    await page.clock.runFor(PING_MS + PONG_MS + RECONNECT_MS);
    assert.equal(await page.evaluate(() => window.coreSockets.length), 3);
    await page.evaluate(() => { window.coreSockets.at(-1).accept(); window.coreSockets.at(-1).disconnect(4000); });
    await textContains(page, "#coreRoomOutput", "another tab/device");
    await page.clock.runFor(RECONNECT_MS);
    assert.equal(await page.evaluate(() => window.coreSockets.length), 3);
    await page.evaluate(() => { window.coreRoom.open(); window.coreSockets.at(-1).accept(); window.coreSockets.at(-1).disconnect(4001); });
    await page.clock.runFor(OFFLINE_RECONNECT_MS);
    assert.equal(await page.evaluate(() => window.coreSockets.length), 4);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      window.coreRoom.open(); window.coreSockets.at(-1).accept(); window.coreSockets.at(-1).disconnect(1006);
    });
    await page.clock.runFor(RECONNECT_MS);
    assert.equal(await page.evaluate(() => window.coreSockets.length), 5);
    await page.clock.runFor(OFFLINE_RECONNECT_MS - RECONNECT_MS);
    assert.equal(await page.evaluate(() => window.coreSockets.length), 6);
    await page.evaluate(() => {
      window.coreSockets.at(-1).accept();
      dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
      window.coreCheck(window.coreSockets.at(-1).readyState === 1, "Normal pagehide does not preempt browser connection handling");
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.coreCheck(window.coreSockets.at(-1).readyState === 3, "Cached page closes live sockets");
      window.coreRoom.close();
      dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      const count = window.coreSockets.length;
      window.coreRoom.send({ t: "after-close" });
      window.coreCheck(window.coreSockets.length === count, "Sending after leave never reconnects");
    });
    await page.clock.runFor(OFFLINE_RECONNECT_MS);
    assert.equal(await page.evaluate(() => window.coreSockets.length), 6);
    await saveCoverage(page);
    await Promise.all([page.waitForEvent("load"), page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })))]);
    await page.waitForSelector("#account");
  }, { clock: true });

  await scenario("Vietnamese defaults, malformed recent storage and missing avatar", async ({ page }) => {
    await textContains(page, "#meNotice", "Lịch sử và thành tích");
    assert.equal(await page.locator("html").getAttribute("lang"), "vi");
    assert.equal(await page.locator("#recent").isVisible(), false);
    await page.locator(".sb-settings-btn").click();
    await textContains(page, ".sb-account", "Người thử");
    assert.equal(await page.locator(".sb-account img").count(), 0);
    await page.evaluate(async () => {
      const { t, tx, applyStatic } = await import("/i18n.js");
      const { randomName } = await import("/names.js");
      const check = window.coreCheck;
      check(t("Việt", "English") === "Việt" && tx(["Việt", "English"]) === "Việt", "Vietnamese text is default");
      const element = document.createElement("section");
      element.innerHTML = '<span data-en="English">Việt</span>';
      applyStatic(element);
      check(element.textContent === "Việt", "Static Vietnamese text preserved");
      check(randomName().length > 0, "Vietnamese guest names generated");
    });
    await navigate(page, "/?lang=invalid");
    await page.waitForFunction(() => document.documentElement.lang === "vi");
  }, { path: "/", storage: { "hub.recent": "malformed" }, state: { routes: { "/api/me": { user: { name: "Người thử" }, stats: [], resultOwner: "user:core" } } } });

  await scenario("Vietnamese legacy history and custom leaderboard labels", async ({ page }) => {
    await textContains(page, "#stats", "custom-game");
    await textContains(page, "#history", "custom-game");
    assert.equal(await page.locator("#history .when").textContent(), new Date(NOW - 172800000).toLocaleDateString("vi-VN"));
    await textContains(page, "#funList", "7 lượt thử");
  }, { path: "/", clock: true, state: { routes: {
    "/api/me": { ...DEFAULT_PROFILE, stats: [{ game: "custom-game", plays: 1, wins: 0, best: 7, maxLevel: 2 }] },
    "/api/me/history": [{ game: "custom-game", mode: "solo", score: 7, won: false, level: 2, at: NOW - 172800000, detail: "" }],
    "/api/fun": [{ key: "custom-game", title: "Hạng thử", unit: "lượt thử", rows: [{ name: "Người thử", value: 7 }] }],
  } } });

  await scenario("hidden hub and room directory pause polling until visible", async ({ page, requests }) => {
    await textContains(page, "#meNotice", "Guest history");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hubRequests = requests.filter((request) => request.path === "/api/rooms").length;
    await page.clock.runFor(ROOM_POLL_MS);
    assert.equal(requests.filter((request) => request.path === "/api/rooms").length, hubRequests);
    await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === "/api/rooms"),
      page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        document.dispatchEvent(new Event("visibilitychange"));
      }),
    ]);
    await navigate(page, "/phong/?lang=en");
    await textContains(page, "#waiting", "No rooms waiting");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const directoryRequests = requests.filter((request) => request.path === "/api/rooms").length;
    await page.clock.runFor(ROOM_POLL_MS);
    assert.equal(requests.filter((request) => request.path === "/api/rooms").length, directoryRequests);
    await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === "/api/rooms"),
      page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        document.dispatchEvent(new Event("visibilitychange"));
      }),
    ]);
    await textContains(page, "#playing", "No games in progress");
  }, { clock: true });

  await scenario("spy theme changes survive the required page reload", async ({ page }) => {
    await navigate(page, "/gian-diep/?lang=en");
    await page.locator(".sb-settings-btn").click();
    await Promise.all([
      page.waitForEvent("load"),
      page.locator('#sbSettings button[data-value="light"]').click(),
    ]);
    assert.equal(await page.evaluate(() => localStorage.getItem("gian-diep.theme")), "light");
    await page.locator(".sb-settings-btn").click();
    assert.equal(await page.locator('#sbSettings button[data-value="light"]').getAttribute("aria-pressed"), "true");
  });

  await scenario("replaced room sockets cannot change current connection or deliver stale messages", async ({ page }) => {
    await page.evaluate(async () => {
      window.coreRaceSockets = [];
      class RaceSocket extends EventTarget {
        constructor() { super(); this.readyState = 0; this.sent = []; window.coreRaceSockets.push(this); }
        send(message) { this.sent.push(message); }
        close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
        accept() { this.readyState = 1; this.onopen?.(); }
        receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
      }
      window.WebSocket = RaceSocket;
      const { roomClient } = await import("/room-client.js");
      const connection = document.createElement("span");
      connection.id = "coreRaceConnection";
      const output = document.createElement("output");
      output.id = "coreRaceOutput";
      document.body.append(connection, output);
      window.coreRaceRoom = roomClient({
        path: () => "/api/core/room/RACE",
        query: () => ({}),
        conn: connection,
        onMsg: (message) => { output.textContent = message.text; },
        onLeave: (reason) => { output.textContent = reason; },
      });
      window.coreRaceRoom.open();
      window.coreRaceRoom.open();
      const [stale, current] = window.coreRaceSockets;
      stale.accept();
      window.coreCheck(!connection.classList.contains("on"), "Late open from replaced socket cannot mark current connection ready");
      current.accept();
      current.receive({ text: "Current room" });
      stale.receive({ text: "Stale room" });
      stale.close();
    });
    assert.equal(await page.locator("#coreRaceOutput").textContent(), "Current room");
    assert.equal(await page.locator("#coreRaceConnection").getAttribute("class"), "on");
    await page.clock.runFor(PING_MS);
    assert.deepEqual(await page.evaluate(() => window.coreRaceSockets.map((socket) => socket.sent)), [[], ["ping"]]);
    await page.evaluate(() => window.coreRaceRoom.open());
    await page.clock.runFor(PONG_MS);
    assert.equal(await page.locator("#netLost").count(), 0);
    assert.equal(await page.evaluate(() => window.coreRaceSockets.length), 3);
    await page.evaluate(() => {
      window.coreRaceSockets[1].readyState = 2;
      window.coreRaceSockets[2].accept();
      window.coreRaceSockets[2].receive({ text: "Replacement room" });
    });
    await page.clock.runFor(PING_MS);
    assert.deepEqual(await page.evaluate(() => window.coreRaceSockets[1].sent), ["ping"]);
    assert.equal(await page.locator("#coreRaceOutput").textContent(), "Replacement room");
    assert.equal(await page.locator("#coreRaceConnection").getAttribute("class"), "on");
    await page.evaluate(() => window.coreRaceRoom.close());
  }, { clock: true });

  await scenario("unsupported service workers keep the hub usable", async ({ page }) => {
    assert.equal(await page.evaluate(() => "serviceWorker" in navigator), false);
    await textContains(page, "#meNotice", "Guest history");
    await page.locator(".sb-settings-btn").click();
    assert.equal(await page.locator("#sbSettings").isVisible(), true);
  }, { initScript: () => {
    delete Navigator.prototype.serviceWorker;
  } });

  await scenario("service worker registration denial does not break navigation", async ({ page }) => {
    await page.waitForFunction(() => window.coreWorkerRegistrations.length === 1);
    assert.deepEqual(await page.evaluate(() => window.coreWorkerRegistrations), ["/sw.js"]);
    assert.deepEqual(await page.evaluate(() => window.coreUnhandledRejections), []);
    await textContains(page, "#meNotice", "Guest history");
    await page.locator(".sb-settings-btn").click();
    assert.equal(await page.locator("#sbSettings").isVisible(), true);
  }, { initScript: () => {
    window.coreWorkerRegistrations = [];
    window.coreUnhandledRejections = [];
    addEventListener("unhandledrejection", (event) => window.coreUnhandledRejections.push(String(event.reason)));
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {
      register: async (path) => {
        window.coreWorkerRegistrations.push(path);
        throw new DOMException("Service workers denied", "SecurityError");
      },
    } });
  } });

  await scenario("panel canvas uses CSS pixel dimensions without device pixel ratio support", async ({ page }) => {
    await page.evaluate(async () => {
      const { createPanel } = await import("/panel.js");
      const root = document.createElement("section");
      const toggle = document.createElement("button");
      const style = document.createElement("style");
      style.textContent = ".tile-board { width: 100px; height: 80px; }";
      document.head.append(style);
      document.body.append(toggle, root);
      const panel = createPanel({ root, toggle, storeKey: "core.panel.no-dpr" });
      const tiles = [{ key: "board", name: "Player", version: 1, draw: (context, width, height) => {
        context.fillStyle = "red";
        context.fillRect(0, 0, width, height);
      } }];
      panel.update(tiles);
      panel.update(tiles);
      const canvas = root.querySelector("canvas");
      window.coreCheck(canvas.width === 100 && canvas.height === 80, "Canvas resolution falls back to CSS dimensions");
      window.coreCheck(canvas.getContext("2d").getImageData(99, 79, 1, 1).data[3] === 255, "Fallback paints the complete visible board");
    });
  }, { initScript: () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: undefined });
  } });

  await serviceWorkerScenario();
  await legacyRedirectScenario();
  console.log(`Core source coverage: ${completed} scenarios completed`);
} finally {
  await browser.close();
}

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { findChromium } from "@huyab/e2e";
import { chromium } from "playwright-core";
import { saveCoverage } from "./coverage.mjs";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const BASE_URL = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:8789");
assert(HTTP_PROTOCOLS.has(BASE_URL.protocol) && LOOPBACK_HOSTS.has(BASE_URL.hostname), "Round evidence writes are allowed only on a loopback E2E_BASE_URL");
assert(!BASE_URL.username && !BASE_URL.password && !BASE_URL.search && !BASE_URL.hash && BASE_URL.pathname === "/", "E2E_BASE_URL must be a loopback origin without credentials, path, query or fragment");

const GAME = "co-caro";
const GAME_PATH = "/co-caro/";
const HISTORY_PATH = "/api/me/history";
const REPLAY_PATH = "/api/replay/";
const REPLAY_LINK_PATH = "/replay/";
const ATTRIBUTE = { CELL_INDEX: "data-i", HREF: "href" };
const BOT = "bot";
const BOT_NAME = "Máy";
const MODE = "bot";
const PLAYER_NAME = "E2E Caro Round";
const STATUS = { LOBBY: "lobby", PLAYING: "playing", ENDED: "ended" };
const REASON = { WIN: "five", DRAW: "full" };
const HTTP_STATUS = { OK: 200, NOT_FOUND: 404 };
const BOARD_SIZE = 3;
const BOARD_CELLS = BOARD_SIZE ** 2;
const EMPTY = 0;
const HUMAN_SEAT = 1;
const BOT_SEAT = 2;
const FIRST_CELL = 0;
const WIN_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const OUTCOME = { WIN: ["Bạn thắng!", "You win!"], DRAW: ["Hoà!", "Draw!"] };
const SELECTOR = {
  HELP: "dialog.help-dlg",
  HELP_BODY: ".help-body",
  HELP_CLOSE: ".help-ok",
  HELP_OPEN: "#btnHelpHome",
  NAME: "#name",
  CREATE: "#btnCreate",
  SIZE: "#sizePick button",
  SELECTED_SIZE: "#sizePick button.on",
  START: "#btnStart",
  CELLS: "#board .c",
  EMPTY_CELL: '#board.mine .c[data-v="0"]',
  OVERLAY: "#overlay",
  TITLE: "#ovTitle",
  RESULT_TEXT: "#ovText",
  BOT_NAME: '.side[data-seat="2"] b',
  REPLAY_LINK: ".rp-links a",
};
const SIZE_LABEL = /3×3/;
const TIMEOUT_MS = 15_000;
const POLL_MS = 250;
const WAIT = { timeout: TIMEOUT_MS };
const HIDDEN = { state: "hidden", ...WAIT };
const NAVIGATION = { waitUntil: "load" };
const VIEWPORT = { width: 1280, height: 900 };
const SERVICE_WORKERS = "block";
const PAGE_ERROR_EVENT = "pageerror";
const STATE_MESSAGE = "state";
const REPLAY_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
const VIDEO_DIRECTORY = process.env.E2E_VIDEO_DIR ? resolve(process.env.E2E_VIDEO_DIR) : null;
const ARTIFACT_DIRECTORY = VIDEO_DIRECTORY ?? resolve("e2e-artifacts");
const ARTIFACT_PREFIX = "co-caro-3x3-bot-round";
const FAILURE_SCREENSHOT = join(ARTIFACT_DIRECTORY, `${ARTIFACT_PREFIX}-failure.png`);
const FAILURE_VIDEO = join(ARTIFACT_DIRECTORY, `${ARTIFACT_PREFIX}-failure.webm`);

async function persistedRound(page, roundId) {
  const deadline = Date.now() + TIMEOUT_MS;
  do {
    const { history, replay, historyStatus, replayStatus } = await page.evaluate(async ({ historyPath, replayPath }) => {
      const historyResponse = await fetch(historyPath);
      const replayResponse = await fetch(replayPath);
      return {
        history: await historyResponse.json(),
        replay: await replayResponse.json(),
        historyStatus: historyResponse.status,
        replayStatus: replayResponse.status,
      };
    }, { historyPath: HISTORY_PATH, replayPath: `${REPLAY_PATH}${roundId}` });
    assert.equal(historyStatus, HTTP_STATUS.OK, "Guest history GET failed");
    assert(Array.isArray(history), "Guest history must be an array");
    const matches = history.filter((row) => row.game === GAME && JSON.parse(row.detail).rp === roundId);
    assert(matches.length <= 1, "A round must be persisted exactly once for the player");
    assert([HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND].includes(replayStatus), "Replay GET failed");
    if (matches.length && replayStatus === HTTP_STATUS.OK) {
      return { result: matches[0], replay };
    }
    await delay(POLL_MS);
  } while (Date.now() < deadline);
  throw new Error(`Result and replay were not persisted for round ${roundId}`);
}

function assertReplay(replay, ended) {
  assert.equal(replay.game, GAME);
  assert.equal(replay.page, GAME_PATH);
  assert(Number.isSafeInteger(replay.at) && replay.at > 0);
  assert(Array.isArray(replay.frames) && replay.frames.length > 1);
  const states = replay.frames.map(([, state]) => state).filter((state) => state.t === STATE_MESSAGE);
  assert.equal(states[0].status, STATUS.PLAYING);
  assert.equal(states[0].moves, 0);
  assert.deepEqual(states[0].board, Array(BOARD_CELLS).fill(EMPTY));
  let previous = states[0];
  for (const state of states.slice(1)) {
    const changed = state.board.flatMap((value, index) => value === previous.board[index] ? [] : [index]);
    if (state.moves === previous.moves) {
      assert.equal(changed.length, 0, "Replay cannot change the board without a move");
    } else {
      assert.equal(state.moves, previous.moves + 1, "Replay must retain every move");
      assert.equal(changed.length, 1, "Each move changes exactly one cell");
      const index = changed[0];
      assert.equal(previous.board[index], EMPTY, "Replay moves must target empty cells");
      assert.equal(state.board[index], previous.turn, "Replay moves must alternate turns");
    }
    previous = state;
  }
  const last = states.at(-1);
  assert.equal(last.status, STATUS.ENDED);
  assert.equal(last.result.rp, ended.result.rp);
  assert.equal(last.moves, ended.moves);
  assert.equal(last.winner, ended.winner);
  assert.equal(last.why, ended.why);
  assert.deepEqual(last.board, ended.board);
  assert.deepEqual(last.result, ended.result);
}

await mkdir(ARTIFACT_DIRECTORY, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium() });
let context;
let page;
let video;
let roundId;
let evidence;
const pageErrors = [];
try {
  context = await browser.newContext({
    serviceWorkers: SERVICE_WORKERS,
    viewport: VIEWPORT,
    ...(VIDEO_DIRECTORY ? { recordVideo: { dir: VIDEO_DIRECTORY, size: VIEWPORT } } : {}),
  });
  page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  page.on(PAGE_ERROR_EVENT, (error) => pageErrors.push(error.message));
  video = page.video();
  await page.goto(new URL(GAME_PATH, BASE_URL).href, NAVIGATION);
  assert.equal(new URL(page.url()).origin, BASE_URL.origin, "Refusing to create a room after an external redirect");
  const help = page.locator(SELECTOR.HELP);
  await help.waitFor(WAIT);
  assert.match(await help.locator(SELECTOR.HELP_BODY).innerText(), SIZE_LABEL);
  await help.locator(SELECTOR.HELP_CLOSE).click();
  await help.waitFor(HIDDEN);
  await page.locator(SELECTOR.HELP_OPEN).click();
  await help.waitFor(WAIT);
  await help.locator(SELECTOR.HELP_CLOSE).click();
  await help.waitFor(HIDDEN);
  await page.locator(SELECTOR.NAME).fill(PLAYER_NAME);
  await page.locator(SELECTOR.CREATE).click();
  await page.waitForFunction((status) => window.cc?.room?.status === status, STATUS.LOBBY, WAIT);
  const lobby = await page.evaluate(() => window.cc.room);
  assert.equal(lobby.players.length, 1, "The fixture must create its own empty room");
  assert.equal(lobby.players[0].name, PLAYER_NAME);
  assert.equal(lobby.host, lobby.players[0].id);
  await page.locator(SELECTOR.SIZE).filter({ hasText: SIZE_LABEL }).click();
  await page.waitForFunction(({ cells, selector }) => document.querySelectorAll(selector).length === cells, { cells: BOARD_CELLS, selector: SELECTOR.CELLS }, WAIT);
  assert.match(await page.locator(SELECTOR.SELECTED_SIZE).innerText(), SIZE_LABEL);
  await page.locator(SELECTOR.START).click();
  await page.waitForFunction((status) => window.cc?.room?.status === status, STATUS.PLAYING, WAIT);
  await page.locator(SELECTOR.OVERLAY).waitFor(HIDDEN);
  const started = await page.evaluate(() => window.cc.room);
  assert.deepEqual(started.seats, [lobby.host, BOT]);
  assert.equal(started.moves, 0);
  assert.deepEqual(started.board, Array(BOARD_CELLS).fill(EMPTY));
  let state = started;
  for (let move = 0; move < BOARD_CELLS && state.status !== STATUS.ENDED; move++) {
    await page.waitForFunction(({ ended, playing, seat }) => {
      const room = window.cc?.room;
      return room?.status === ended || (room?.status === playing && room.turn === seat);
    }, { ended: STATUS.ENDED, playing: STATUS.PLAYING, seat: HUMAN_SEAT }, WAIT);
    state = await page.evaluate(() => window.cc.room);
    if (state.status === STATUS.ENDED) break;
    const cell = page.locator(SELECTOR.EMPTY_CELL).nth(FIRST_CELL);
    const index = Number(await cell.getAttribute(ATTRIBUTE.CELL_INDEX));
    assert.equal(state.board[index], EMPTY);
    await cell.click();
    await page.waitForFunction(({ index, seat }) => window.cc?.room?.board[index] === seat, { index, seat: HUMAN_SEAT }, WAIT);
    await page.waitForFunction(({ ended, seat }) => {
      const room = window.cc?.room;
      return room?.status === ended || room?.turn === seat;
    }, { ended: STATUS.ENDED, seat: HUMAN_SEAT }, WAIT);
    state = await page.evaluate(() => window.cc.room);
  }
  assert.equal(state.status, STATUS.ENDED, "The UI round must finish through legal moves");
  assert([REASON.WIN, REASON.DRAW].includes(state.why), "A timeout is not a completed gameplay round");
  assert.equal(state.moves, state.board.filter((value) => value !== EMPTY).length);
  const winners = WIN_LINES.filter((line) => state.board[line[0]] !== EMPTY && line.every((index) => state.board[index] === state.board[line[0]]));
  if (state.winner) {
    assert.equal(state.why, REASON.WIN);
    assert(winners.length > 0 && winners.every((line) => state.board[line[0]] === state.winner));
  } else {
    assert.equal(state.why, REASON.DRAW);
    assert.equal(state.moves, BOARD_CELLS);
    assert.equal(winners.length, 0);
  }
  await page.locator(SELECTOR.OVERLAY).waitFor(WAIT);
  const botName = await page.locator(SELECTOR.BOT_NAME).innerText();
  const expectedTitles = state.winner === HUMAN_SEAT ? OUTCOME.WIN : state.winner === BOT_SEAT ? [`${botName} thắng`, `${botName} wins`] : OUTCOME.DRAW;
  const outcome = (await page.locator(SELECTOR.TITLE).innerText()).trim();
  assert(expectedTitles.includes(outcome), `Visible outcome does not match the round: ${outcome}`);
  assert.match(await page.locator(SELECTOR.RESULT_TEXT).innerText(), new RegExp(`^${state.moves} (nước|moves)\\.`));
  const visibleBoard = await page.locator(SELECTOR.CELLS).evaluateAll((cells) => cells.map((cell) => Number(cell.dataset.v)));
  assert.deepEqual(visibleBoard, state.board);
  roundId = state.result.rp;
  assert.match(roundId, REPLAY_ID_PATTERN);
  assert.equal(new URL(await page.locator(SELECTOR.REPLAY_LINK).getAttribute(ATTRIBUTE.HREF), BASE_URL).href, new URL(`${REPLAY_LINK_PATH}${roundId}`, BASE_URL).href);
  const { result, replay } = await persistedRound(page, roundId);
  assert.equal(result.game, GAME);
  assert.equal(result.mode, MODE);
  assert.equal(result.level, BOARD_SIZE);
  assert.equal(result.score, state.moves);
  assert.equal(result.won, Number(state.winner === HUMAN_SEAT));
  assert(Number.isSafeInteger(result.at) && result.at > 0);
  assert.deepEqual(JSON.parse(result.detail), { vs: BOT_NAME, block: false, why: state.why, rp: roundId });
  assert.equal(state.result.mode, MODE);
  assert.equal(state.result.level, BOARD_SIZE);
  assert.equal(state.result.ranks.length, 1);
  assert.equal(state.result.ranks[0].id, lobby.host);
  assert.equal(state.result.ranks[0].score, result.score);
  assert.equal(state.result.ranks[0].won, Boolean(result.won));
  assertReplay(replay, state);
  assert.deepEqual(pageErrors, [], "The gameplay page must have no uncaught errors");
  await saveCoverage(page);
  const screenshot = join(ARTIFACT_DIRECTORY, `${ARTIFACT_PREFIX}-${roundId}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  evidence = { roundId, game: GAME, mode: result.mode, level: result.level, moves: result.score, won: Boolean(result.won), why: state.why, outcome, replayFrames: replay.frames.length, screenshot };
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: FAILURE_SCREENSHOT, fullPage: true }).catch(() => {});
  throw error;
} finally {
  try {
    if (context) await context.close();
    if (video) {
      const videoPath = evidence ? join(VIDEO_DIRECTORY, `${ARTIFACT_PREFIX}-${roundId}.webm`) : FAILURE_VIDEO;
      await video.saveAs(videoPath);
      await video.delete();
      if (evidence) evidence.video = videoPath;
    }
  } finally {
    await browser.close();
  }
}
console.log(`PASS complete UI round + stored result/replay ${JSON.stringify(evidence)}`);

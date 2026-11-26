import assert from 'node:assert/strict';
import { findChromium } from '@huyab/e2e';
import { chromium } from 'playwright-core';
import { saveCoverage } from './coverage.mjs';
import * as chess from '../shared/games/co-tuong/logic.js';
import * as carry from '../shared/games/co-ganh/logic.js';
import * as sowing from '../shared/games/o-an-quan/logic.js';
import { createGame as snakeGame } from '../shared/games/nokia/snake/logic.js';
import { newBoard as bantumiBoard, move as bantumiMove } from '../shared/games/nokia/bantumi/logic.js';
import { createSim as createRollSim, step as stepRoll, score as scoreRoll, scrollAt as rollScroll } from '../shared/games/nokia/rapid-roll/logic.js';
import * as miningRules from '../shared/games/dao-vang/logic.js';

const BASE = new URL(process.env.E2E_BASE_URL || 'http://127.0.0.1:8789');
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
assert(LOOPBACK_HOSTS.has(BASE.hostname) && HTTP_PROTOCOLS.has(BASE.protocol), 'Board fixtures must run on a loopback HTTP origin');
const ME = 'coverage-player';
const OTHER = 'coverage-opponent';
const SPECTATOR = 'coverage-observer';
const ROOM_CODE = 'TEST';
const REPLAY_ID = 'board-fixture';
const TIME = 1_800_000_000_000;
const TURN_MS = 30_000;
const WAIT_MS = 15_000;
const SOLO_EXPIRE_MS = 65_000;
const DELAYED_ROLL_FRAME_MS = 120_000;
const VIEWPORT = { width: 1280, height: 960 };
const PORTRAIT = { width: 390, height: 844 };
const LCD_SIZE = { width: 84, height: 48 };
const LCD_PALETTE = { background: [199, 240, 216, 255], ink: [67, 82, 61, 255], dim: [143, 174, 143, 255] };
const PLAYERS = [{ id: ME, name: 'Ada', online: true }, { id: OTHER, name: 'Lin', online: true }];
const ROUTES = ['pikachu', 'dao-vang', 'do-min', 'bau-cua', 'co-caro', 'noi-4', 'ban-tau', 'co-tuong', 'co-ganh', 'o-an-quan', 'snake', 'pairs', 'logic', 'bantumi', 'bounce', 'rapid-roll', 'space-impact'];
const NOKIA_GAMES = ['snake', 'pairs', 'logic', 'bantumi', 'bounce', 'rapid-roll', 'space-impact'];
const REPLAY_RECORDS = new Map();
const HISTORY_POSTS = [];
const browser = await chromium.launch({ executablePath: findChromium() });
const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block', hasTouch: true });
const failures = [];

await context.addInitScript(({ me, routes }) => {
  localStorage.setItem('pk.id', me);
  localStorage.setItem('pk.name', 'Ada');
  localStorage.setItem('lang', 'en');
  localStorage.setItem('sound', '0');
  for (const game of routes) localStorage.setItem(`help.seen.${game}`, '1');
  const sockets = [];
  const sent = [];
  class FixtureSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) {
      super();
      this.url = String(url);
      this.readyState = FixtureSocket.CONNECTING;
      sockets.push(this);
      queueMicrotask(() => {
        if (this.readyState !== FixtureSocket.CONNECTING) return;
        this.readyState = FixtureSocket.OPEN;
        const event = new Event('open');
        this.onopen?.(event);
        this.dispatchEvent(event);
      });
    }
    send(value) {
      if (this.readyState !== FixtureSocket.OPEN) throw new Error('Send on closed fixture socket');
      if (value === 'ping') {
        queueMicrotask(() => this.onmessage?.(new MessageEvent('message', { data: 'pong' })));
        return;
      }
      sent.push(JSON.parse(value));
    }
    close(code = 1000) {
      this.readyState = FixtureSocket.CLOSED;
      const event = new CloseEvent('close', { code });
      this.onclose?.(event);
      this.dispatchEvent(event);
    }
  }
  window.WebSocket = FixtureSocket;
  window.boardFixture = {
    sockets, sent,
    feed(messages) {
      const socket = sockets.at(-1);
      if (!socket || socket.readyState !== FixtureSocket.OPEN) throw new Error('Fixture connection is not open');
      for (const message of messages) {
        const event = new MessageEvent('message', { data: JSON.stringify(message) });
        socket.onmessage?.(event);
        socket.dispatchEvent(event);
      }
    },
  };
}, { me: ME, routes: ROUTES });

await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== BASE.origin) return route.abort();
  if (url.pathname.startsWith('/api/replay/')) {
    const record = REPLAY_RECORDS.get(url.pathname.split('/').at(-1));
    return route.fulfill({ status: record ? 200 : 404, json: record ?? {} });
  }
  if (url.pathname === '/api/top') {
    if (url.searchParams.get('size') === '2') return route.abort();
    const rows = url.searchParams.get('size') === '1' ? [{ names: 'Ada', score: 500, cleared: true, level: 5 }, { names: 'Lin', score: 100, cleared: false, level: 2 }] : [];
    return route.fulfill({ json: rows });
  }
  if (url.pathname === '/api/me/history' && route.request().method() === 'POST') {
    HISTORY_POSTS.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  }
  if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { user: null, resultOwner: 'guest:board-fixture', rooms: [] } });
  return route.continue();
});

const state = (extra = {}) => ({ t: 'state', now: TIME, status: 'lobby', host: ME, players: structuredClone(PLAYERS), seats: [ME, OTHER], public: false, cfg: {}, result: null, ...extra });
const result = (extra = {}) => ({ title: ['Kết quả', 'Fixture results'], ranks: [{ id: ME, name: 'Ada', score: 12, won: true }, { id: OTHER, name: 'Lin', score: 3 }], rp: REPLAY_ID, ...extra });
const routeOf = (game) => `/${NOKIA_GAMES.includes(game) ? 'nokia/' : ''}${game}/`;

async function frames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function feed(page, ...messages) {
  await page.evaluate((values) => window.boardFixture.feed(values), messages);
  await frames(page);
}

async function outgoing(page) {
  return page.evaluate(() => window.boardFixture.sent.splice(0));
}

async function action(page, perform, expected) {
  await outgoing(page);
  await perform();
  const messages = await outgoing(page);
  assert(messages.some((message) => Object.entries(expected).every(([key, value]) => JSON.stringify(message[key]) === JSON.stringify(value))), `Missing ${JSON.stringify(expected)} in ${JSON.stringify(messages)}`);
}

async function noAction(page, perform) {
  await outgoing(page);
  await perform();
  const actions = (await outgoing(page)).filter((message) => message.t !== 'cur');
  assert.deepEqual(actions, [], 'Invalid or spectator input must not send gameplay actions');
}

async function visible(page, selector, expected = true) {
  assert.equal(await page.locator(selector).isVisible(), expected, `${selector} visibility`);
}

async function text(page, selector, expected) {
  assert.match(await page.locator(selector).innerText(), expected);
}

async function canvasPixels(page, selector = 'canvas') {
  await frames(page);
  const summary = await page.locator(selector).first().evaluate((canvas) => {
    const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let index = 0; index < bytes.length; index += 4) colors.add(`${bytes[index]},${bytes[index + 1]},${bytes[index + 2]},${bytes[index + 3]}`);
    return { width: canvas.width, height: canvas.height, colors: colors.size };
  });
  assert(summary.width > 0 && summary.height > 0 && summary.colors > 1, 'Real canvas must contain rendered pixels, not only a blank background');
  return summary;
}

async function assertGamePixels(page, game, view) {
  const { background, ink, dim } = LCD_PALETTE;
  const samples = [[0, 0, background]];
  if (game === 'snake') {
    const [x, y] = view.snakes[0].body[1];
    samples.push([0, 7, ink], [1 + x * 3, 8 + y * 3, ink]);
  } else if (game === 'pairs') samples.push([6, 7, ink], [8, 9, dim]);
  else if (game === 'logic') samples.push([41, 0, ink], [40, 0, background]);
  else if (game === 'bantumi') samples.push([0, 8, ink], [1, 9, background], [12, 23, ink]);
  else if (game === 'bounce') samples.push([1, 0, background], [2, 0, ink], [1, 1, ink]);
  else if (game === 'rapid-roll') samples.push([1, 1, ink], [1, 6, ink]);
  else if (game === 'space-impact') samples.push([4, 14, ink], [56, 20, ink]);
  const actual = await page.locator('.screen canvas').evaluate((canvas, points) => {
    const context = canvas.getContext('2d');
    return points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
  }, samples);
  assert.deepEqual(actual, samples.map(([, , color]) => color), `${game}: expected board geometry must occupy its known LCD pixels`);
}

async function tapLCD(page, x, y) {
  const bounds = await page.locator('.screen canvas').boundingBox();
  assert(bounds);
  await page.touchscreen.tap(bounds.x + x * bounds.width / LCD_SIZE.width, bounds.y + y * bounds.height / LCD_SIZE.height);
}

async function holdTouch(page, locator, expected) {
  const bounds = await locator.boundingBox();
  assert(bounds);
  const session = await context.newCDPSession(page);
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await outgoing(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForFunction((match) => window.boardFixture.sent.some((message) => Object.entries(match).every(([key, value]) => JSON.stringify(message[key]) === JSON.stringify(value))), expected);
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
  const sent = await outgoing(page);
  assert.equal(sent.filter((message) => message.t === expected.t).length, 1, 'A long touch sends once and must not also trigger the short-tap action');
}

async function scenario(game, run, query = '', options = {}) {
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT_MS);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    if (game === 'dao-vang') await page.clock.install({ time: new Date(TIME) });
    await options.prepare?.(page);
    await page.goto(new URL(`${routeOf(game)}${query}`, BASE).href, { waitUntil: 'load' });
    await run(page);
    assert.deepEqual(errors, options.errors ?? [], `${game}: unexpected browser errors`);
    console.log(`PASS board coverage ${game}${query}`);
  } catch (error) {
    failures.push(new Error(`${game}${query}: ${error.message}`, { cause: error }));
  } finally {
    try { await saveCoverage(page); } finally { await page.close(); }
  }
}

async function join(page, nokia = false, deferSound = false) {
  const input = page.locator(nokia ? '#home .code' : '#code');
  await input.fill('!');
  await input.press('ArrowLeft');
  await input.press('Enter');
  assert.equal(await page.evaluate(() => window.boardFixture.sockets.length), 0, 'Invalid room code must not connect');
  await input.fill(ROOM_CODE.toLowerCase());
  await input.press('Enter');
  await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
  await visible(page, '#room');
  assert.equal(new URL(page.url()).searchParams.get('r'), ROOM_CODE);
  if (!deferSound) await toggleSound(page, nokia);
  const invite = page.locator(nokia ? '#room header button[title="Invite: QR code / link"]' : '#btnCopy');
  await invite.click();
  await visible(page, '#invite');
  await text(page, '#invite .code', new RegExp(`^${ROOM_CODE}$`));
  assert.equal(await page.locator('#invite .link').innerText(), page.url());
  assert.equal(await page.locator('#invite .qr svg').count(), 1);
  await page.locator('#invite').getByRole('button', { name: 'Close', exact: true }).click();
  await visible(page, '#invite', false);
}

async function toggleSound(page, nokia = false) {
  const sound = page.locator(nokia ? '#room header button[title="Sound"]' : '#btnSound');
  await sound.click();
  assert.equal(await page.evaluate(() => localStorage.getItem('sound')), '1');
  await sound.click();
  assert.equal(await page.evaluate(() => localStorage.getItem('sound')), '0');
}

async function disconnect(page, leaveSelector = '#btnLeave', playingState = null) {
  await page.evaluate(() => window.boardFixture.sockets.at(-1).close(1006));
  await visible(page, '#netLost');
  await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
  await visible(page, '#netLost', false);
  await page.evaluate(() => window.boardFixture.sockets.at(-1).close(4000));
  await visible(page, '#home');
  await page.locator('#home .primary, #btnCreate').first().click();
  await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
  await feed(page, { t: 'error', msg: ['Không được vào', 'Fixture access denied'] });
  await visible(page, '#home');
  await page.locator('#home .primary, #btnCreate').first().click();
  await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
  if (playingState) {
    await feed(page, { ...playingState, status: 'lobby' });
    await action(page, () => page.locator('#btnStart').click(), { t: 'start' });
    await feed(page, playingState);
  }
  await page.locator(leaveSelector).click();
  await visible(page, '#home');
}

async function replay(game, messages, check) {
  const tapeFrames = messages.map((message, index) => [index * 100, message]);
  REPLAY_RECORDS.set(REPLAY_ID, { game, page: routeOf(game), at: TIME, frames: tapeFrames });
  await scenario(game, async (page) => {
    await page.locator('.rp-bar').waitFor();
    const slider = page.locator('.rp-bar input');
    await slider.fill(String(tapeFrames.at(-1)[0]));
    await slider.dispatchEvent('input');
    await frames(page);
    await check(page);
    assert.equal(await page.evaluate(() => window.boardFixture.sockets.length), 0, 'Replay must never open a game connection');
    await slider.fill('0');
    await slider.dispatchEvent('input');
    await page.locator('.rp-bar button').nth(1).click();
    await text(page, '.rp-bar button:nth-child(2)', /2×/);
    await slider.fill(String(tapeFrames.at(-1)[0]));
    await slider.dispatchEvent('input');
    await frames(page);
    await check(page);
    const leave = page.locator('#btnLeave, #room header > button:first-child').first();
    if (game !== 'dao-vang' && game !== 'ban-tau' && game !== 'bau-cua' && game !== 'pikachu') {
      await saveCoverage(page);
      await leave.click();
      await page.waitForURL((url) => !url.searchParams.has('replay'));
      await visible(page, '#home');
    }
    await noAction(page, () => page.keyboard.press('ArrowRight'));
  }, `?replay=${REPLAY_ID}`);
  await scenario(game, async (page) => {
    await page.waitForFunction(() => document.querySelector('.rp-tag')?.textContent.includes('not found'));
    assert.equal(await page.evaluate(() => window.boardFixture.sockets.length), 0);
    assert.equal(await page.locator('.rp-bar').count(), 0);
  }, '?replay=missing-fixture');
  await scenario(game, async (page) => {
    await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
    assert.equal(new URL(page.url()).searchParams.get('r'), ROOM_CODE);
    await feed(page, ...messages);
    await check(page);
    await page.evaluate(() => window.boardFixture.sockets.at(-1).close(4001));
    assert.equal(await page.evaluate(() => window.boardFixture.sockets.at(-1).readyState), 3);
  }, `?r=${ROOM_CODE.toLowerCase()}`);
}

async function classicBoards() {
  for (const game of ['co-caro', 'noi-4']) {
    const caro = game === 'co-caro';
    const count = caro ? 9 : 42;
    const lobby = state({ players: [PLAYERS[0]], size: 2, level: 1, block: true, board: Array(count).fill(0), names: ['Ada', 'Lin'], score: { [ME]: 2 }, turn: 1, moves: 0, last: null, line: [], deadline: TIME + TURN_MS });
    const playing = { ...lobby, players: PLAYERS, status: 'playing' };
    const board = [...playing.board];
    const last = caro ? 0 : 35;
    board[last] = 1;
    const won = { ...playing, board, status: 'ended', winner: 1, moves: 7, line: caro ? [0, 1, 2] : [35, 36, 37, 38], why: 'timeout', result: result() };
    await scenario(game, async (page) => {
      await join(page, false, true);
      await feed(page, lobby);
      assert.equal(await page.locator('#board .c').count(), count);
      await action(page, () => page.locator(caro ? '#sizePick button' : '#levelPick button').first().click(), caro ? { t: 'config', size: 2 } : { t: 'config', level: 0 });
      if (caro) {
        await feed(page, { ...lobby, size: 0, board: Array(225).fill(0) });
        await action(page, () => page.locator('#blockPick input').uncheck(), { t: 'config', block: false });
        await feed(page, lobby);
      }
      await action(page, () => page.locator('#btnStart').click(), { t: 'start' });
      await feed(page, playing);
      await visible(page, '#overlay', false);
      await toggleSound(page);
      if (caro) {
        await page.locator('#btnSkin').click();
        assert.equal(await page.locator('body').evaluate((node) => node.classList.contains('skin-stone')), true);
        await page.locator('#btnSkin').click();
      }
      await action(page, () => page.locator('#board .c').first().click(), { t: 'move', i: 0 });
      await feed(page, { ...playing, board, moves: 1, last });
      assert.equal(await page.locator(`#board .c:nth-child(${last + 1})`).getAttribute('data-v'), '1');
      if (caro) await noAction(page, () => page.locator('#board .c').first().click());
      else {
        await page.locator('#board .c').first().hover();
        assert.equal(await page.locator('#board .hl').count(), 6);
        await page.locator('#board').dispatchEvent('pointerleave');
        assert.equal(await page.locator('#board .hl').count(), 0);
        const fullColumn = Array(42).fill(0).map((value, index) => index % 7 === 0 ? 2 : value);
        await feed(page, { ...playing, board: fullColumn });
        await noAction(page, () => page.locator('#board .c').first().click());
      }
      await feed(page, { ...playing, turn: 2 });
      await noAction(page, () => page.locator('#board .c').nth(1).click());
      await feed(page, { ...playing, seats: [OTHER, SPECTATOR] });
      await noAction(page, () => page.locator('#board .c').nth(1).click());
      await action(page, () => page.locator('#emoBar button').first().click(), { t: 'emo', e: 0 });
      for (const id of [ME, OTHER, 'absent']) await feed(page, { t: 'emo', id, e: 1 });
      assert.equal(await page.locator('.emo-fly').count(), 3);
      await feed(page, { t: 'emo', id: ME, e: -1 }, { t: 'unknown' });
      await feed(page, won);
      await text(page, '#ovTitle', /win/i);
      assert.equal(await page.locator('#board .win').count(), won.line.length);
      await page.locator('#btnPeek').click();
      await visible(page, '#overlay', false);
      await page.locator('#btnResult').click();
      await visible(page, '#overlay');
      for (const winner of [0, 2]) {
        await feed(page, playing, { ...won, winner, why: '', line: [] });
        await text(page, '#ovTitle', winner ? /Lin/ : /draw/i);
      }
      await feed(page, { ...lobby, host: OTHER, players: [...PLAYERS, { id: SPECTATOR, name: 'Observer' }] });
      await visible(page, '#btnStart', false);
      assert.equal(await page.locator(caro ? '#sizePick button' : '#levelPick button').first().isDisabled(), true);
      await page.setViewportSize(PORTRAIT);
      await frames(page);
      await disconnect(page, '#btnLeave', playing);
    });
    await replay(game, [playing, won], (page) => text(page, '#ovTitle', /Ada|win/i));
  }
}

async function battleship() {
  const fleet = [[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]];
  const lobby = state({ names: ['Ada', 'Lin'], score: {}, fleets: [fleet, null], shots: [Array(100).fill(0), Array(100).fill(0)], sunk: [[], []], ready: [false, false], turn: 1, fired: [0, 0], skipped: [0, 0], deadline: TIME + TURN_MS });
  const playing = { ...lobby, status: 'playing' };
  const ended = { ...playing, status: 'ended', winner: 1, why: 'timeout', result: result(), fired: [17, 4], fleets: [fleet, fleet] };
  await scenario('ban-tau', async (page) => {
    await join(page);
    await feed(page, lobby);
    await action(page, () => page.locator('#btnStart').click(), { t: 'start' });
    await feed(page, { ...lobby, status: 'placing' });
    assert.equal(await page.locator('#seaA .ship').count(), 17);
    await page.locator('#seaA .c').first().click();
    assert.equal(await page.locator('#seaA .sel').count(), 5);
    await noAction(page, () => page.locator('#btnRotate').click());
    await noAction(page, () => page.locator('#seaA .c').nth(6).click());
    await text(page, 'body', /Can't place there/);
    await action(page, () => page.locator('#seaA .c').nth(5).click(), { t: 'place', ships: [[5, 6, 7, 8, 9], ...fleet.slice(1)] });
    await feed(page, { ...lobby, status: 'placing', fleets: [[[5, 6, 7, 8, 9], ...fleet.slice(1)], null] });
    await action(page, () => page.locator('#btnRotate').click(), { t: 'place', ships: [[5, 15, 25, 35, 45], ...fleet.slice(1)] });
    await action(page, () => page.locator('#btnReroll').click(), { t: 'reroll' });
    await action(page, () => page.locator('#btnReady').click(), { t: 'ready' });
    await feed(page, { ...lobby, status: 'placing', ready: [true, false] });
    await visible(page, '#btnReady', false);
    await feed(page, playing);
    await action(page, () => page.locator('#seaB .c').nth(7).click(), { t: 'shoot', i: 7 });
    const shots = structuredClone(playing.shots);
    shots[0][7] = 1;
    shots[1][0] = 2;
    await feed(page, { ...playing, shots, last: { by: 2, i: 0, hit: true, sunk: 0 }, sunk: [[true], []] });
    assert.equal(await page.locator('#seaA .hitme').count(), 1);
    assert.equal(await page.locator('#seaA .pip.sunk').count(), 1);
    await noAction(page, () => page.locator('#seaB .c').nth(7).click());
    await feed(page, { ...playing, seats: [OTHER, SPECTATOR] });
    await noAction(page, () => page.locator('#seaB .c').nth(8).click());
    await feed(page, ended);
    await text(page, '#ovTitle', /win/i);
    await page.locator('#btnPeek').click();
    await visible(page, '#overlay', false);
    await page.locator('#btnResult').click();
    await visible(page, '#overlay');
    await feed(page, playing, { ...ended, winner: 2, why: '' });
    await text(page, '#ovTitle', /Lin/);
    await page.setViewportSize(PORTRAIT);
    await frames(page);
    await disconnect(page);
  });
  await replay('ban-tau', [playing, ended], (page) => text(page, '#ovTitle', /Ada|win/i));
}

async function mines() {
  const unit = { opened: 0, total: 71, lives: 3, booms: 0, penalty: 0, done: null, time: 12000 };
  const players = PLAYERS.map((player) => ({ ...player, unit: 'all', opened: 0, booms: 0, spec: false }));
  const lobby = state({ mode: 'coop', size: 0, players, units: { all: unit }, startedAt: TIME - 2000 });
  const playing = { ...lobby, status: 'playing' };
  const grid = Array(81).fill(-1);
  const ended = { ...playing, status: 'ended', endedAt: TIME, winner: 'all', result: result() };
  await scenario('do-min', async (page) => {
    await join(page);
    await feed(page, lobby);
    await action(page, () => page.locator('#sizePick button').nth(1).click(), { t: 'config', size: 1 });
    await action(page, () => page.locator('#modePick button').last().click(), { t: 'config', mode: 'race' });
    await action(page, () => page.locator('#btnStart').click(), { t: 'start' });
    await feed(page, playing, { t: 'grid', grids: { all: grid } });
    assert.equal(await page.locator('#cells .m').count(), 81);
    await action(page, () => page.locator('#cells .m').first().click(), { t: 'open', i: 0 });
    await action(page, () => page.locator('#cells .m').nth(1).click({ button: 'right' }), { t: 'flag', i: 1 });
    await action(page, () => page.locator('#cells .m').nth(2).click({ modifiers: ['Shift'] }), { t: 'ping', i: 2 });
    await feed(page, { t: 'open', unit: 'all', by: ME, cells: [[0, 2], [1, -2], [2, -3]], boom: false });
    await text(page, '#cells .m:nth-child(1)', /^2$/);
    assert.equal(await page.locator('#cells .f').count(), 1);
    assert.equal(await page.locator('#cells .b').count(), 1);
    await action(page, () => page.locator('#cells .m').first().click(), { t: 'chord', i: 0 });
    await noAction(page, () => page.locator('#cells .m').nth(1).click());
    await page.locator('#btnFlag').click();
    await action(page, () => page.locator('#cells .m').nth(3).tap(), { t: 'flag', i: 3 });
    await page.locator('#btnFlag').click();
    await action(page, () => page.locator('#cells .m').nth(4).tap(), { t: 'open', i: 4 });
    await holdTouch(page, page.locator('#cells .m').nth(6), { t: 'flag', i: 6 });
    await feed(page, { t: 'open', unit: 'missing', cells: [[0, 8]] }, { t: 'open', unit: 'all', by: OTHER, cells: [[5, -3]], boom: true });
    assert.equal(await page.locator('#board').evaluate((node) => node.classList.contains('shake')), true);
    await feed(page, { t: 'cur', id: OTHER, p: [2, 3] });
    await text(page, '.cursor', /Lin/);
    await feed(page, { t: 'cur', id: OTHER, p: null }, { t: 'ping', id: OTHER, i: 6 });
    assert.equal(await page.locator('.cursor').count(), 0);
    await page.locator('#btnSkin').click();
    await page.locator('#btnSkin').click();
    await page.locator('#btnSkin').click();
    await page.locator('#btnSkin').click();
    await visible(page, '#face');
    await feed(page, { ...playing, seats: [ME] });
    await action(page, () => page.locator('#face').click(), { t: 'restart' });
    await feed(page, { ...playing, mode: 'race', players: [{ ...players[0], unit: ME }, { ...players[1], unit: OTHER }], units: { [ME]: unit, [OTHER]: { ...unit, opened: 35, booms: 2 } } }, { t: 'grid', grids: { [ME]: grid } });
    await page.locator('#btnPanel').click();
    await feed(page, ended, { t: 'reveal', mines: [2, 5, 8] });
    assert.equal(await page.locator('#cells .wf').count(), 1);
    assert.equal(await page.locator('#cells .x').count(), 1);
    await text(page, '#ovTitle', /cleared/i);
    await page.locator('#btnPeek').click();
    await visible(page, '#overlay', false);
    await page.locator('#btnResult').click();
    await action(page, () => page.locator('#face').click(), { t: 'start' });
    await feed(page, { ...ended, winner: null });
    await text(page, '#ovTitle', /lives/i);
    await page.setViewportSize(PORTRAIT);
    await frames(page);
    await disconnect(page);
  });
  await replay('do-min', [playing, { t: 'grid', grids: { all: grid } }, ended], (page) => text(page, '#ovTitle', /cleared/i));
}

async function matching() {
  const unit = { score: 0, level: 1, left: 4, total: 4, combo: 0, shuffles: 3, done: null, endAt: TIME + TURN_MS };
  const players = PLAYERS.map((player) => ({ ...player, unit: 'all', spec: false, score: 0, team: 'A' }));
  const lobby = state({ mode: 'coop', tiles: 'animal', size: 3, duration: TURN_MS, players, units: { all: unit } });
  const playing = { ...lobby, status: 'playing' };
  const board = [[0, 0, 0, 0], [0, 1, 1, 0], [0, 2, 2, 0], [0, 0, 0, 0]];
  const ended = { ...playing, status: 'ended', winner: 'all', units: { all: { ...unit, done: 'clear' } }, result: result() };
  await scenario('pikachu', async (page) => {
    await page.waitForFunction(() => document.querySelector('#topList')?.textContent.includes('No one yet'));
    await page.locator('#topSize button').nth(1).click();
    await page.waitForFunction(() => document.querySelector('#topList')?.textContent.includes('Ada'));
    await text(page, '#topList', /cleared/);
    await text(page, '#topList', /level 2/);
    await page.locator('#topSize button').nth(2).click();
    await page.waitForFunction(() => document.querySelector('#topList')?.textContent.includes("Couldn't load"));
    await page.locator('#topMode button').last().click();
    await join(page);
    await feed(page, lobby);
    await action(page, () => page.locator('#sizePick button').last().click(), { t: 'config', size: 3 });
    await action(page, () => page.locator('#tilesPick [data-tiles="poke"]').click(), { t: 'config', tiles: 'poke' });
    await action(page, () => page.locator('#modePick [data-mode="race"]').click(), { t: 'config', mode: 'race' });
    await action(page, () => page.locator('#btnStart').click(), { t: 'start' });
    await feed(page, playing, { t: 'board', unit: 'all', board, why: 'start' });
    assert.equal(await page.locator('#cells .cell').count(), 4);
    await page.locator('#btnHint').click();
    await text(page, '#hintLeft', /^2$/);
    await action(page, () => page.locator('#btnShuffle').click(), { t: 'shuffle' });
    await action(page, () => page.locator('[data-k="1-1"]').click(), { t: 'sel', a: [1, 1] });
    assert.equal(await page.locator('#cells .sel').count(), 1);
    await action(page, () => page.locator('[data-k="1-1"]').click(), { t: 'sel', a: null });
    await page.locator('[data-k="1-1"]').click();
    await action(page, () => page.locator('[data-k="1-2"]').click(), { t: 'pick', a: [1, 1], b: [1, 2] });
    assert.equal(await page.locator('#cells .cell').count(), 2);
    await feed(page, { t: 'board', unit: 'all', board, why: 'shuffle', by: OTHER });
    await action(page, () => page.locator('[data-k="2-1"]').click({ button: 'right' }), { t: 'ping', a: [2, 1] });
    await holdTouch(page, page.locator('[data-k="2-1"]'), { t: 'ping', a: [2, 1] });
    await page.locator('[data-k="1-1"]').tap();
    await page.locator('[data-k="2-1"]').tap();
    assert.equal(await page.locator('[data-k="2-1"]').evaluate((node) => node.classList.contains('sel')), true);
    await feed(page, { t: 'sel', id: OTHER, a: [1, 1] }, { t: 'cur', id: OTHER, p: [1, 2] });
    assert.equal(await page.locator('#cells .peer').count(), 1);
    await text(page, '.cursor', /Lin/);
    await feed(page, { t: 'sel', id: OTHER, a: null }, { t: 'cur', id: OTHER, p: null }, { t: 'ping', id: OTHER, a: [1, 1] });
    await action(page, () => page.locator('#emoBar button').first().click(), { t: 'emo', e: 0 });
    await feed(page, { t: 'emo', id: OTHER, e: 1 }, { t: 'emo', id: ME, e: 1 }, { t: 'emo', id: OTHER, e: 99 });
    const matched = structuredClone(board);
    matched[1][1] = matched[1][2] = 0;
    await feed(page, { t: 'match', unit: 'all', id: OTHER, a: [1, 1], b: [1, 2], path: [[1, 1], [1, 2]], pts: 20, combo: 2, board: matched });
    assert.equal(await page.locator('#cells .cell').count(), 2);
    await feed(page, { t: 'board', unit: 'ignored', board: [] });
    assert.equal(await page.locator('#cells .cell').count(), 2);
    for (const why of ['level', 'stuck']) await feed(page, { t: 'board', unit: 'all', board, why });
    const blocked = Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, column) => row === 0 || column === 0 || row === 5 || column === 5 ? 0 : 2));
    blocked[2][2] = blocked[3][3] = 1;
    await feed(page, { t: 'board', unit: 'all', board: blocked });
    await outgoing(page);
    await page.locator('[data-k="2-2"]').click();
    await page.locator('[data-k="3-3"]').click();
    assert.equal((await outgoing(page)).some((message) => message.t === 'pick'), false, 'Blocked pairs cannot be submitted');
    assert.equal(await page.locator('#board').evaluate((node) => node.classList.contains('shake')), true);
    await feed(page, { t: 'board', unit: 'all', board });
    await feed(page, { ...playing, mode: 'race', players: [{ ...players[0], spec: true, unit: null }, { ...players[1], unit: OTHER }], units: { all: unit, [OTHER]: { ...unit, score: 20 } } }, { t: 'minis', boards: { [OTHER]: board } }, { t: 'mini', unit: OTHER, board });
    await visible(page, '#specBar');
    await action(page, () => page.locator('#specBar button').last().click(), { t: 'watch', unit: OTHER });
    await noAction(page, () => page.locator('#cells .cell').first().click());
    await feed(page, ended);
    await text(page, '#ovTitle', /cleared/i);
    await feed(page, { ...ended, winner: null });
    await text(page, '#ovTitle', /Time/);
    await feed(page, { ...lobby, mode: 'team' });
    await visible(page, '#teamPick');
    await action(page, () => page.locator('#teamPick button').click(), { t: 'team', team: 'B' });
    await page.setViewportSize(PORTRAIT);
    await feed(page, playing, { t: 'board', unit: 'all', board });
    assert.equal(await page.locator('#cells .cell').count(), 4);
    await disconnect(page);
  });
  await replay('pikachu', [playing, { t: 'board', unit: 'all', board, why: 'start' }, ended], (page) => text(page, '#ovTitle', /cleared/i));
}

async function betting() {
  const betting = state({ status: 'playing', mode: 'house', phase: 'bet', phaseAt: TIME, shakeMs: 20, afkMs: TURN_MS, round: 1, dealer: null, players: PLAYERS.map((player) => ({ ...player, coins: 1000 })), bets: {}, deltas: {}, dice: [] });
  const shown = { ...betting, phase: 'show', phaseAt: TIME - 1000, dice: [0, 0, 2], bets: { [ME]: [50, 0, 0, 0, 0, 0] }, deltas: { [ME]: 100, [OTHER]: -100 }, rp: REPLAY_ID };
  await scenario('bau-cua', async (page) => {
    await join(page);
    await feed(page, betting);
    assert.equal(await page.locator('#board > *').count(), 6);
    await page.locator('#chips button').nth(1).click();
    await action(page, () => page.locator('#board > *').first().click(), { t: 'bet', s: 0, amt: 50 });
    await action(page, () => page.locator('#board > *').first().click({ button: 'right' }), { t: 'unbet', s: 0 });
    await feed(page, { ...betting, bets: shown.bets });
    await text(page, '#board .stack .me', /Ada 50/);
    await action(page, () => page.locator('#btnClear').click(), { t: 'unbet' });
    await action(page, () => page.locator('#btnRoll').click(), { t: 'roll' });
    await action(page, () => page.locator('#btnMode').click(), { t: 'mode', mode: 'rotate' });
    await feed(page, { ...betting, mode: 'rotate', dealer: ME });
    await noAction(page, () => page.locator('#board > *').first().click());
    await text(page, '#status', /you are the dealer/);
    await feed(page, { ...betting, players: [{ ...betting.players[0], coins: 0 }] });
    await noAction(page, () => page.locator('#board > *').first().click());
    await feed(page, { ...shown, phaseAt: TIME });
    await noAction(page, () => page.locator('#board > *').first().click());
    await feed(page, shown);
    assert.equal(await page.locator('#dice .die').count(), 3);
    assert.equal(await page.locator('#board .hit').count(), 2);
    await text(page, '#board > :first-child .x', /×2/);
    await text(page, '#players .up', /\+100/);
    await feed(page, { ...shown, phaseAt: TIME - 2000, deltas: { [ME]: -50 }, dice: [1, 3, 5] });
    await text(page, '#players .down', /-50/);
    await feed(page, { ...betting, host: OTHER, dealer: OTHER, phaseAt: TIME - TURN_MS - 1, bets: shown.bets });
    await visible(page, '#btnRoll');
    await disconnect(page);
  });
  await replay('bau-cua', [betting, shown], (page) => text(page, '#status', /Rolled/));
}

async function nokiaBoardGames() {
  for (const game of ['co-tuong', 'co-ganh', 'o-an-quan']) {
    const rules = game === 'co-tuong' ? chess : game === 'co-ganh' ? carry : sowing;
    const initial = rules.newGame();
    const view = { ...initial, side: [ME, OTHER], names: ['Ada', 'Lin'], deadline: TIME + TURN_MS, undo: 1, last: null };
    const lobby = state({ players: [PLAYERS[0]], cfg: { level: 1, n: 2, quanNon: true }, view: null });
    const playing = { ...lobby, players: PLAYERS, status: 'playing', view };
    const ended = { ...playing, status: 'ended', result: result() };
    await scenario(game, async (page) => {
      await join(page, true);
      await feed(page, lobby);
      await action(page, () => page.locator('.cfg button').first().click(), game === 'o-an-quan' ? { t: 'config', cfg: { n: 2 } } : { t: 'config', cfg: { level: 0 } });
      await action(page, () => page.locator('#overlay .primary').click(), { t: 'start' });
      await feed(page, playing);
      if (game === 'o-an-quan') {
        assert.equal(await page.locator('.oaq .cell').count(), 12);
        await page.locator('.oaq .cell').nth(1).click();
        await visible(page, '.dirs');
        await action(page, () => page.locator('.dirs button').first().click(), { t: 'g', k: 1, d: -1 });
        await action(page, () => page.locator('.undo').click(), { t: 'g', undo: true });
        await noAction(page, () => page.locator('.oaq .cell').nth(6).click());
        const moved = rules.clone(initial);
        const from = { b: [...moved.b], big: [...moved.big] };
        const steps = rules.move(moved, 1, 1);
        await feed(page, { ...playing, view: { ...view, ...moved, last: { from, steps } } });
        await page.waitForFunction(() => !document.querySelector('.oaq .foot').textContent.includes('Sowing'));
        for (const n of [3, 4, 5]) {
          const next = rules.newGame({ n });
          await feed(page, { ...playing, view: { ...view, ...next, moves: n * 10, side: [ME, OTHER, 'bot', 'bot4', 'bot5'].slice(0, n), names: ['Ada', 'Lin', 'Bot', 'Bot4', 'Bot5'].slice(0, n) } });
          assert.equal(await page.locator('.oaq .cell').count(), n * 6);
          assert.equal(await page.locator('.oaq .poly').count(), 1);
        }
      } else {
        const [from, to] = rules.moves(initial)[0];
        const pieces = page.locator('.board-stage .pc');
        const points = page.locator('.board-stage .pt');
        assert.equal(await pieces.count(), initial.b.length);
        assert.equal(await page.locator('.board-stage .pc:visible').count(), initial.b.filter(Boolean).length);
        await pieces.nth(from).click();
        assert.equal(await page.locator('.board-stage .pc.sel').count(), 1);
        await pieces.nth(from).click();
        assert.equal(await page.locator('.board-stage .pc.sel').count(), 0);
        await pieces.nth(from).click();
        await action(page, () => points.nth(to).click(), { t: 'g', from, to });
        const moved = rules.clone(initial);
        const captured = rules.move(moved, from, to);
        const last = game === 'co-tuong' ? { from, to, cap: captured } : { from, to, ...captured };
        await feed(page, { ...playing, view: { ...view, ...moved, last } });
        assert.equal(await pieces.nth(to).isVisible(), true);
        assert.equal(await pieces.nth(from).isVisible(), false);
        assert.equal(await pieces.nth(to).evaluate((node) => node.classList.contains('slide')), true);
        await feed(page, { ...playing, view: { ...view, side: [OTHER, SPECTATOR], moves: 100 } });
        assert.equal(await page.locator('.board-stage .pc.can').count(), 0);
      }
      await feed(page, ended);
      await text(page, '#overlay', /Fixture results/);
      assert.equal(await page.locator('.ranks li').count(), 2);
      await action(page, () => page.locator('#overlay .primary').click(), { t: 'start' });
      await feed(page, { ...lobby, host: OTHER });
      assert.equal(await page.locator('.cfg button').first().isDisabled(), true);
      await disconnect(page, '#room header > button:first-child');
    });
    await replay(game, [playing, ended], (page) => text(page, '#overlay', /Fixture results/));
  }
}

function nokiaView(game) {
  if (game === 'snake') return { ...snakeGame([ME, OTHER], { walls: true, maze: 1 }, () => 0.3), events: [] };
  if (game === 'pairs') return { cards: Array(24).fill(-1), owner: Array(24).fill(null), open: [], score: { [ME]: 0, [OTHER]: 0 }, turn: ME, moves: 0, deadline: TIME + TURN_MS };
  if (game === 'logic') return { mine: { guesses: [], solved: false }, others: { [ME]: { n: 0 }, [OTHER]: { n: 2, solved: false } }, endsAt: TIME + TURN_MS };
  if (game === 'bantumi') return { board: bantumiBoard(), side: [ME, OTHER], names: ['Ada', 'Lin'], turn: 1, moves: 0, deadline: TIME + TURN_MS, last: null };
  if (game === 'space-impact') return { ships: [{ id: ME, x: 4, y: 14, lives: 3, invul: 0 }, { id: OTHER, x: 8, y: 24, lives: 2, invul: 0 }], score: 50, level: 1, t: 1, events: [], enemies: [['a', 55, 20], ['b', 65, 30], ['c', 75, 10]], bullets: [[20, 20]], shots: [[45, 20]], items: [[32, 30]], boss: null, phase: 'wave' };
  return { seed: 42, level: 0, startAt: TIME + 1000, runners: { [ME]: { score: 0, done: false, at: [12, 36] }, [OTHER]: { score: 2, done: false, at: [24, 36] } } };
}

async function nokiaLCDGames() {
  for (const game of NOKIA_GAMES) {
    const lobby = state({ cfg: { speed: 2, walls: true, mode: 'arena', maze: 1, seeds: 4, level: 0 }, view: null });
    const playing = { ...lobby, status: 'playing', view: nokiaView(game) };
    const ended = { ...playing, status: 'ended', result: result({ mode: 'solo' }) };
    await scenario(game, async (page) => {
      await join(page, true);
      await feed(page, lobby);
      const dimensions = await canvasPixels(page, '.screen canvas');
      assert.equal(dimensions.width, LCD_SIZE.width);
      assert.equal(dimensions.height, LCD_SIZE.height);
      const cfgButtons = page.locator('.cfg button');
      for (let index = 0; index < await cfgButtons.count(); index++) {
        await outgoing(page);
        await cfgButtons.nth(index).click();
        const sent = await outgoing(page);
        assert.equal(sent.length, 1);
        assert.equal(sent[0].t, 'config');
        assert(Object.keys(sent[0].cfg).length > 0);
      }
      await action(page, () => page.locator('#overlay .primary').click(), { t: 'start' });
      await feed(page, playing);
      await canvasPixels(page, '.screen canvas');
      await assertGamePixels(page, game, playing.view);
      if (game === 'snake') {
        for (const [key, direction] of [['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['ArrowUp', 'up'], ['ArrowDown', 'down']]) await action(page, () => page.keyboard.press(key), { t: 'g', d: direction });
        await action(page, () => page.locator('.pad [data-k="up"]').tap(), { t: 'g', d: 'up' });
        await noAction(page, () => page.keyboard.press('Enter'));
        await noAction(page, () => page.keyboard.press('q'));
        await page.keyboard.down('ArrowLeft');
        await noAction(page, () => page.keyboard.down('ArrowLeft'));
        await page.keyboard.up('ArrowLeft');
        const screen = await page.locator('.screen canvas').boundingBox();
        await action(page, async () => {
          await page.mouse.move(screen.x + screen.width / 2, screen.y + screen.height / 2);
          await page.mouse.down();
          await page.mouse.move(screen.x + screen.width / 2 + 40, screen.y + screen.height / 2);
          await page.mouse.up();
        }, { t: 'g', d: 'right' });
        const view = structuredClone(playing.view);
        view.step++;
        view.snakes[0].score = 7;
        view.bug = { at: [12, 4], left: 8 };
        view.events = [{ t: 'eat', id: ME }, { t: 'eat', id: OTHER }, { t: 'bug' }, { t: 'die' }];
        await feed(page, { ...playing, view });
        assert.equal(await page.evaluate(() => localStorage.getItem('nk.best.snake')), '7');
        view.snakes[0].alive = false;
        view.solo = true;
        await feed(page, { ...playing, view });
        await canvasPixels(page, '.screen canvas');
      } else if (game === 'pairs') {
        await page.keyboard.press('ArrowRight');
        await action(page, () => page.keyboard.press('Enter'), { t: 'g', i: 1 });
        await action(page, () => tapLCD(page, 8, 9), { t: 'g', i: 0 });
        await noAction(page, () => tapLCD(page, 1, 1));
        for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowDown']) await page.keyboard.press(key);
        const view = structuredClone(playing.view);
        view.cards[0] = 0;
        view.cards[1] = 1;
        view.open = [0, 1];
        await feed(page, { ...playing, view });
        await noAction(page, () => page.keyboard.press('Enter'));
        view.owner[0] = ME;
        view.owner[1] = OTHER;
        view.open = [];
        view.turn = OTHER;
        await feed(page, { ...playing, view });
        await noAction(page, () => tapLCD(page, 32, 9));
        await canvasPixels(page, '.screen canvas');
      } else if (game === 'logic') {
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowDown');
        await action(page, () => page.keyboard.press('Enter'), { t: 'g', guess: [1, 5, 0, 0] });
        await tapLCD(page, 3, 42);
        await action(page, () => tapLCD(page, 36, 42), { t: 'g', guess: [2, 5, 0, 0] });
        await noAction(page, () => tapLCD(page, 3, 10));
        await feed(page, { ...playing, view: { ...playing.view, mine: { guesses: [{ guess: [1, 5, 0, 0], exact: 1, near: 2 }], solved: false } } });
        await canvasPixels(page, '.screen canvas');
        await feed(page, { ...playing, view: { ...playing.view, mine: { guesses: [{ guess: [1, 2, 3, 4], exact: 4, near: 0 }], solved: true }, secret: [1, 2, 3, 4] } });
        await noAction(page, () => page.keyboard.press('Enter'));
      } else if (game === 'bantumi') {
        await page.keyboard.press('ArrowRight');
        await action(page, () => page.keyboard.press('Enter'), { t: 'g', i: 1 });
        await page.keyboard.press('ArrowLeft');
        await action(page, () => tapLCD(page, 14, 25), { t: 'g', i: 0 });
        await noAction(page, () => tapLCD(page, 1, 1));
        const view = structuredClone(playing.view);
        view.board[0] = 0;
        view.moves = 1;
        view.last = { from: 0, path: [1, 2, 3, 4], captured: 2, again: false };
        await feed(page, { ...playing, view });
        await noAction(page, () => tapLCD(page, 14, 25));
        view.turn = 2;
        view.side[1] = 'bot';
        await feed(page, { ...playing, view });
        await noAction(page, () => page.keyboard.press('Enter'));
        await canvasPixels(page, '.screen canvas');
      } else if (game === 'space-impact') {
        const releasedKeys = { up: false, down: false, left: false, right: false, fire: false };
        await action(page, () => page.keyboard.down('ArrowRight'), { t: 'g', keys: { ...releasedKeys, right: true } });
        await action(page, () => page.keyboard.up('ArrowRight'), { t: 'g', keys: releasedKeys });
        await action(page, () => page.keyboard.down('Enter'), { t: 'g', keys: { ...releasedKeys, fire: true } });
        await action(page, () => page.keyboard.up('Enter'), { t: 'g', keys: releasedKeys });
        await feed(page, { ...playing, view: { ...playing.view, t: 2, phase: 'boss', boss: { x: 74, y: 16, hp: 10, max: 20 }, events: ['fire', 'kill', 'hurt', 'down', 'boss', 'bossdown', 'life'] } });
        await canvasPixels(page, '.screen canvas');
        await feed(page, { ...playing, view: { ...playing.view, ships: [{ ...playing.view.ships[0], lives: 0 }], t: 3 } });
        await canvasPixels(page, '.screen canvas');
      } else {
        await page.keyboard.down('ArrowRight');
        if (game === 'bounce') await page.keyboard.press('Enter');
        await feed(page, { ...playing, now: TIME + 1600 });
        await page.keyboard.up('ArrowRight');
        const sent = await outgoing(page);
        const position = sent.findLast((message) => Array.isArray(message.at));
        assert(position && position.at.length === 2 && position.at.every(Number.isFinite), 'Local simulation must publish its actual integrated position');
        assert(position.score >= 0);
        const initialX = game === 'bounce' ? 12 : createRollSim(playing.view.seed).x;
        assert(position.at[0] > initialX, 'Holding right must move the locally simulated ball to the right');
        await tapLCD(page, 40, 25);
        await feed(page, { ...playing, now: TIME + 2200 });
        await canvasPixels(page, '.screen canvas');
        if (game === 'rapid-roll') {
          await outgoing(page);
          await feed(page, { ...playing, now: TIME + DELAYED_ROLL_FRAME_MS });
          const completions = (await outgoing(page)).filter((message) => message.done);
          assert.equal(completions.length, 1, 'A delayed frame crossing natural death must finish and send one result');
          assert.equal(completions[0].t, 'g');
          assert(Number.isInteger(completions[0].score) && completions[0].score > 0);
          await canvasPixels(page, '.screen canvas');
          await feed(page, { ...playing, now: TIME + DELAYED_ROLL_FRAME_MS + TURN_MS });
          assert.equal((await outgoing(page)).filter((message) => message.done).length, 0, 'Dead frames must not resend the result');
        }
      }
      const spectator = structuredClone(playing);
      spectator.seats = [OTHER];
      if (game === 'snake') spectator.view.snakes = spectator.view.snakes.filter((snake) => snake.id !== ME);
      if (game === 'logic') spectator.view.mine = null;
      if (game === 'pairs') spectator.view.turn = OTHER;
      if (game === 'bantumi') spectator.view.side = [OTHER, SPECTATOR];
      if (game === 'space-impact') spectator.view.ships = spectator.view.ships.filter((ship) => ship.id !== ME);
      if (['bounce', 'rapid-roll'].includes(game)) { delete spectator.view.runners[ME]; spectator.now = TIME + 2500; }
      await feed(page, spectator);
      await canvasPixels(page, '.screen canvas');
      await feed(page, ended);
      await text(page, '#overlay', /Fixture results/);
      await action(page, () => page.locator('#overlay .primary').click(), { t: 'start' });
      await feed(page, { ...lobby, host: OTHER });
      for (const button of await page.locator('.cfg button').all()) assert.equal(await button.isDisabled(), true);
      await page.setViewportSize(PORTRAIT);
      await canvasPixels(page, '.screen canvas');
      await disconnect(page, '#room header > button:first-child');
    });
    await replay(game, [playing, ended], async (page) => {
      await text(page, '#overlay', /Fixture results/);
      await canvasPixels(page, '.screen canvas');
      await noAction(page, () => tapLCD(page, 40, 25));
    });
  }
}

async function lcdPixels() {
  await scenario('snake', async (page) => {
    const pixels = await page.evaluate(() => {
      const lcd = window.nk.lcd;
      const canvas = window.nk.canvas;
      const context = canvas.getContext('2d');
      const at = (x, y) => [...context.getImageData(x, y, 1, 1).data];
      lcd.clear();
      const background = at(0, 0);
      lcd.sprite(1, 1, ['#..'], '#ff0000', true);
      const flipped = at(3, 1);
      const empty = at(1, 1);
      lcd.frame(10, 10, 5, 5, '#0000ff');
      const border = at(10, 10);
      const center = at(12, 12);
      lcd.text(0, 20, 'đé🙂');
      lcd.banner(['A', 'OK']);
      return { background, flipped, empty, border, center };
    });
    assert.deepEqual(pixels.background, [199, 240, 216, 255]);
    assert.deepEqual(pixels.flipped, [255, 0, 0, 255]);
    assert.deepEqual(pixels.empty, pixels.background);
    assert.deepEqual(pixels.border, [0, 0, 255, 255]);
    assert.deepEqual(pixels.center, pixels.background);
  });
}

async function mining() {
  const players = PLAYERS.map((player) => ({ ...player, spec: false, money: 1000, dynamite: 1, ready: false, offer: [{ key: 'dynamite', price: 100 }], bought: {} }));
  const lobby = state({ mode: 'coop', players, team: 2000, target: 650, level: 1, versusLevels: 5 });
  const playing = { ...lobby, status: 'playing' };
  const world = { t: 'world', world: { level: 1, items: [{ id: 1, type: 'goldSmall', x: 200, y: 200 }, { id: 2, type: 'rockSmall', x: 350, y: 300 }], miners: [{ id: ME, x: 220 }, { id: OTHER, x: 420 }] } };
  const snap = { t: 'snap', wt: 1, time: 59, miners: [{ id: ME, a: 0.2, l: 20, m: 'swing', h: null, d: 1, s: false }, { id: OTHER, a: -0.2, l: 30, m: 'out', h: null, d: 0, s: true }] };
  const ended = { ...playing, status: 'ended', result: { winner: ME, win: true, level: 1, target: 650, team: 2000, ranking: players, rp: REPLAY_ID } };
  await scenario('dao-vang', async (page) => {
    await page.locator('#overlay .menu').waitFor();
    await page.locator('#overlay .code').fill('!');
    await page.locator('#overlay .code').press('Enter');
    assert.equal(await page.evaluate(() => window.boardFixture.sockets.length), 0);
    await page.locator('#overlay .code').fill(ROOM_CODE);
    await page.locator('#overlay .code').press('Enter');
    await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
    await feed(page, lobby);
    await action(page, () => page.locator('#overlay .seg button').last().click(), { t: 'config', mode: 'versus' });
    await action(page, () => page.locator('#overlay .primary').click(), { t: 'start' });
    await feed(page, playing, world, snap, { ...snap, wt: 1.1, time: 58.9 });
    await visible(page, '#overlay', false);
    await canvasPixels(page, '#game');
    await action(page, () => page.locator('#game').click(), { t: 'shoot' });
    await action(page, () => page.keyboard.press('ArrowDown'), { t: 'shoot' });
    await action(page, () => page.keyboard.press('ArrowUp'), { t: 'dyn' });
    await feed(page, { t: 'ev', evs: [{ k: 'grab', item: 1, id: ME }], money: { team: 2100, players: { [ME]: 1100, [OTHER]: 1000 } } });
    assert.equal(await page.evaluate(() => window.dv.net.world.items.length), 1);
    const pulling = { ...snap, wt: 2, time: 9, miners: [{ ...snap.miners[0], m: 'in', h: 'goldSmall', l: 100, s: true }, snap.miners[1]] };
    await feed(page, pulling);
    await action(page, () => page.locator('#btnDyn').click(), { t: 'dyn' });
    await page.waitForFunction(() => document.querySelector('#hTime')?.textContent === '9');
    await text(page, '#hTime', /^9$/);
    await feed(page, { t: 'ev', evs: [{ k: 'shoot', id: ME }, { k: 'boom', id: ME, x: 220, y: 180 }, { k: 'tnt', id: OTHER, x: 350, y: 300, removed: [2] }, { k: 'collect', id: ME, type: 'goldSmall', value: 500 }, { k: 'collect', id: OTHER, type: 'bag', dynamite: 1, value: 0 }, { k: 'collect', id: 'missing', type: 'bag', strength: true, value: 0 }] });
    assert.equal(await page.evaluate(() => window.dv.net.world.items.length), 0);
    await canvasPixels(page, '#game');
    for (let index = 0; index < 8; index++) await feed(page, { ...snap, wt: 3 + index, miners: [{ ...snap.miners[0], a: index / 10, l: 20 + index }, snap.miners[1]] });
    assert.equal(await page.evaluate(() => window.dv.net.snaps.length), 6);
    const interpolated = await page.evaluate(() => window.dv.net.view().miners[0]);
    assert(interpolated.angle >= 0.2 && interpolated.angle <= 0.7 && interpolated.len >= 22 && interpolated.len <= 27);
    await feed(page, { ...playing, status: 'shop', shopEndsAt: TIME + TURN_MS });
    await text(page, '#overlay .shopkeeper', /Team fund/);
    await action(page, () => page.locator('.shop-item').first().click(), { t: 'buy', key: 'dynamite' });
    await action(page, () => page.locator('#overlay .primary').click(), { t: 'ready' });
    await feed(page, { ...playing, status: 'shop', mode: 'versus', players: [{ ...players[0], bought: { dynamite: true }, ready: true }, players[1]], shopEndsAt: TIME + TURN_MS });
    assert.equal(await page.locator('.shop-item').first().isDisabled(), true);
    assert.equal(await page.locator('#overlay .primary').isDisabled(), true);
    await feed(page, { ...playing, players: [{ ...players[0], spec: true }, players[1]], mode: 'versus' });
    await text(page, '#scores .spec', /spectating/);
    await feed(page, ended);
    await text(page, '#overlay .result', /win/i);
    await page.getByRole('button', { name: 'Leave room', exact: true }).click();
    await page.locator('#overlay .menu').waitFor();
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await page.waitForFunction(() => window.dv.solo.screen === 'play');
    await canvasPixels(page, '#game');
    await page.locator('#btnMenu').click();
    await text(page, '#overlay', /Paused/);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    assert.equal(await page.evaluate(() => window.dv.solo.screen), 'play');
    await page.clock.runFor(SOLO_EXPIRE_MS);
    await text(page, '#overlay', /Time's up/);
    assert.equal(await page.evaluate(() => window.dv.solo.screen), 'over');
    await page.waitForFunction(() => document.querySelector('#historyStatus')?.textContent.includes('saved in your history'));
    assert.equal(HISTORY_POSTS.at(-1)?.game, 'dao-vang');
    assert.equal(HISTORY_POSTS.at(-1)?.score, 0);
    await page.getByRole('button', { name: 'Play again', exact: true }).click();
    await page.waitForFunction(() => window.dv.solo.screen === 'play');
    await page.locator('#btnMenu').click();
    await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
    await page.locator('#overlay .menu').waitFor();
  });
  await replay('dao-vang', [{ t: 'me', id: ME }, playing, world, snap, ended], (page) => text(page, '#overlay .result', /Ada|win/i));
}

async function classicEdges() {
  for (const game of ['co-caro', 'noi-4', 'ban-tau']) {
    await scenario(game, async (page) => {
      await page.locator('#name').fill('');
      await join(page);
      const fleet = [[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]];
      const lobby = state({
        players: [PLAYERS[0]], seats: [ME, 'bot'], names: ['Ada', 'Máy'], score: {}, size: 2, level: 0,
        board: Array(game === 'co-caro' ? 9 : 42).fill(0), turn: 2, moves: 0, line: [],
        fleets: [fleet, fleet], shots: [Array(100).fill(0), Array(100).fill(0)], sunk: [[], []],
        ready: [false, false], fired: [0, 0], skipped: [0, 0], deadline: TIME + TURN_MS,
      });
      await feed(page, lobby);
      await text(page, '#ovText', /bot/i);
      await feed(page, { ...lobby, status: 'playing' });
      await page.waitForFunction(() => document.querySelector('#clock').textContent === '…');
      await noAction(page, () => page.locator(game === 'ban-tau' ? '#seaB .c' : '#board .c').first().click());
      const playing = { ...lobby, status: 'playing', players: PLAYERS, seats: [ME, OTHER], names: ['Ada', 'Lin'], turn: 1 };
      if (game === 'ban-tau') {
        await feed(page, { ...playing, status: 'placing' });
        await noAction(page, () => page.locator('#seaA .c').nth(99).click());
        await page.locator('#seaA .c').first().click();
        await noAction(page, () => page.locator('#seaA .c').first().click());
        await text(page, 'body', /Can't place there/);
        const vertical = [[5, 15, 25, 35, 45], ...fleet.slice(1)];
        await feed(page, { ...playing, status: 'placing', fleets: [vertical, fleet] });
        await action(page, () => page.locator('#seaA .c').nth(5).click(), { t: 'place', ships: [[5, 6, 7, 8, 9], ...fleet.slice(1)] });
        await feed(page, { ...playing, status: 'placing', seats: [OTHER, SPECTATOR] });
        await text(page, '#placeText', /Both sides/);
        await noAction(page, () => page.locator('#seaA .c').first().click());
        await feed(page, playing);
        await action(page, () => page.locator('#emoBar button').first().click(), { t: 'emo', e: 0 });
        await feed(page, { t: 'emo', id: ME, e: 0 }, { t: 'emo', id: OTHER, e: 1 }, { t: 'emo', id: SPECTATOR, e: 2 }, { t: 'emo', id: OTHER, e: -1 }, { t: 'unknown' });
        assert.equal(await page.locator('.emo-fly').count(), 3);
        const shots = structuredClone(playing.shots);
        shots[0][10] = 1;
        await feed(page, { ...playing, fired: [1, 0], shots, last: { by: 1, i: 10, hit: false, sunk: -1 } });
        assert.equal(await page.locator('#seaB .c[data-v="1"]').count(), 1);
        shots[0][80] = 2;
        shots[0][81] = 2;
        await feed(page, { ...playing, fired: [3, 0], shots, last: { by: 1, i: 81, hit: true, sunk: 4 }, sunk: [[], [false, false, false, false, true]] });
        await text(page, 'body', /Sunk a 2-cell/);
      }
      for (const outcome of [
        { winner: 1, why: '' },
        { winner: 2, why: 'timeout' },
        { winner: 2, why: '', seats: [OTHER, SPECTATOR], host: OTHER },
      ]) {
        await feed(page, playing, { ...playing, status: 'ended', ...outcome, result: result({ rp: null }) });
        await text(page, '#ovTitle', outcome.winner === 1 ? /win/i : /Lin/);
      }
      await text(page, '#ovText', /Waiting for the host/);
      await feed(page, { ...lobby, host: OTHER, players: [...PLAYERS, { id: SPECTATOR, name: 'Observer' }] });
      await text(page, '#ovText', /1 watching/);
    });
  }
  await scenario('bau-cua', async (page) => {
    await page.locator('#name').fill('');
    await join(page);
    const betting = state({ status: 'playing', mode: 'rotate', phase: 'bet', phaseAt: TIME, shakeMs: 20, afkMs: TURN_MS, round: 2, dealer: ME, players: PLAYERS.map((player) => ({ ...player, coins: 1000 })), bets: { [OTHER]: [10, 0, 0, 0, 0, 0] }, deltas: {}, dice: [] });
    await feed(page, betting, { t: 'unknown' });
    await text(page, '#status', /reveal when everyone has bet/);
    await action(page, () => page.locator('#btnMode').click(), { t: 'mode', mode: 'house' });
    await feed(page, { ...betting, host: OTHER, dealer: OTHER });
    await text(page, '#status', /wait for Lin/);
    await feed(page, { ...betting, host: OTHER, dealer: null });
    await text(page, '#status', /wait for the host/);
    await feed(page, { ...betting, phase: 'show', phaseAt: TIME - 1000, dice: [1, 2, 3], deltas: { [OTHER]: -10 } });
    await text(page, '#status', /nobody won/);
    await page.waitForFunction(() => document.querySelectorAll('#board .pic-fb').length === 6 && document.querySelectorAll('#dice .pic-fb').length === 3);
    assert.equal(await page.locator('#board .pic-fb').count(), 6);
    assert.equal(await page.locator('#dice .pic-fb').count(), 3);
  }, '', {
    prepare: async (page) => {
      await page.addInitScript(() => localStorage.setItem('bc.chip', '999'));
      await page.route('**/bau-cua/assets/**', (route) => route.abort());
    },
  });
}

async function mineEdges() {
  await scenario('do-min', async (page) => {
    await page.locator('#name').fill('');
    await join(page);
    const unit = { opened: 20, total: 71, lives: 2, booms: 1, penalty: 10000, done: null, time: 22000 };
    const players = PLAYERS.map((player) => ({ ...player, unit: player.id, opened: 20, booms: 1, spec: false }));
    const race = state({ status: 'playing', mode: 'race', size: 0, players, units: { [ME]: unit, [OTHER]: { ...unit, opened: 35 } }, startedAt: TIME - 2000 });
    const grid = Array(81).fill(-1);
    grid[0] = 0;
    grid.fill(-2, 1, 13);
    await feed(page, { ...race, status: 'lobby', host: OTHER, startedAt: null }, { t: 'unknown' });
    await text(page, '#ovText', /Same mine layout.*Waiting for the host/);
    await feed(page, race, { t: 'grid', grids: { [ME]: grid } });
    await page.locator('#btnPanel').click();
    if (!(await page.locator('.tile-board').first().isVisible())) await page.locator('#btnPanel').click();
    await canvasPixels(page, '.tile-board');
    assert.equal(await page.locator('#ledMines').getAttribute('data-v'), '-02');
    await noAction(page, () => page.locator('#cells .m').first().click());
    await noAction(page, () => page.locator('#cells .m').nth(20).click({ modifiers: ['Shift'] }));
    await noAction(page, () => page.locator('#cells .m').nth(20).click({ button: 'middle' }));
    await noAction(page, () => page.locator('#cells').dispatchEvent('pointerdown', { pointerType: 'mouse', button: 0 }));
    await noAction(page, async () => {
      await page.locator('#cells .m').nth(20).dispatchEvent('pointerdown', { pointerType: 'touch' });
      await page.locator('#cells').dispatchEvent('pointercancel');
      await page.locator('#cells').dispatchEvent('pointerup');
    });
    await page.locator('#cells .m').nth(20).dispatchEvent('pointerdown', { pointerType: 'touch' });
    await feed(page, { ...race, status: 'ended', winner: ME, endedAt: TIME, units: { ...race.units, [ME]: { ...unit, done: 'clear', opened: 71 } }, result: result() });
    await noAction(page, () => page.locator('#cells').dispatchEvent('pointerup'));
    await page.waitForFunction(() => document.querySelector('#clock').textContent === '0:22');
    await text(page, '#ovTitle', /You win/);
    await text(page, '#ovScore', /10s penalty/);
    await feed(page, race, { ...race, status: 'ended', host: OTHER, winner: OTHER, endedAt: TIME, result: result() });
    await text(page, '#ovTitle', /Lin wins/);
    await text(page, '#ovText', /Waiting for the host/);
    await feed(page, { ...race, players: [{ ...players[0], spec: true, unit: null }, players[1], { ...players[1], id: SPECTATOR, name: 'Observer', unit: SPECTATOR }], seats: [OTHER, SPECTATOR], units: { [OTHER]: unit, [SPECTATOR]: unit } });
    await visible(page, '#overlay', false);
    await text(page, '#ovTitle', /watching/);
    await feed(page, { t: 'grid', grids: { [OTHER]: grid, [SPECTATOR]: grid } }, { t: 'open', unit: SPECTATOR, by: SPECTATOR, cells: [[30, 3]], boom: false });
    assert.equal(await page.locator('#cells .m').nth(30).innerText(), '');
    await page.setViewportSize(PORTRAIT);
    const hard = { ...race, mode: 'coop', size: 2, players: players.map((player) => ({ ...player, unit: 'all' })), units: { all: { ...unit, total: 381 } } };
    await feed(page, hard, { t: 'grid', grids: { all: Array(480).fill(-1) } });
    assert.equal(await page.locator('#cells .m').count(), 480);
    const firstRow = await page.locator('#cells .m').nth(1).evaluate((node) => node.style.gridRow);
    assert.equal(firstRow, '2');
    await action(page, () => page.locator('#cells .m').nth(31).click(), { t: 'open', i: 31 });
    await feed(page, { t: 'cur', id: OTHER, p: [1, 2] });
    await text(page, '.cursor', /Lin/);
    await feed(page, { ...hard, players: [hard.players[0], { ...hard.players[1], online: false }] }, { t: 'cur', id: 'departed', p: [3, 4] });
    assert.equal(await page.locator('.cursor').count(), 0);
    await feed(page, { t: 'open', unit: 'all', by: ME, cells: [[31, -3]], boom: true });
    assert.equal(await page.locator('#cells .b').count(), 1);
  });
}

async function matchingEdges() {
  await scenario('pikachu', async (page) => {
    await page.locator('#name').fill('');
    await join(page);
    await page.locator('#btnSound').click();
    const unit = { score: 20, level: 2, left: 4, total: 4, combo: 0, shuffles: 2, done: null, endAt: TIME + TURN_MS };
    const players = PLAYERS.map((player) => ({ ...player, unit: 'all', spec: false, score: 0, team: 'A' }));
    const playing = state({ status: 'playing', mode: 'coop', tiles: 'poke', size: 3, duration: TURN_MS, players, units: { all: unit } });
    const board = [[0, 0, 0, 0], [0, 1, 1, 0], [0, 2, 2, 0], [0, 0, 0, 0]];
    await feed(page, playing, { t: 'board', unit: 'all', board, why: 'start' }, { t: 'unknown' });
    await page.locator('[data-k="1-1"]').click();
    const matched = structuredClone(board);
    matched[1][1] = matched[1][2] = 0;
    await feed(page, { t: 'match', unit: 'all', id: OTHER, a: [1, 1], b: [1, 2], path: [[1, 1], [1, 2]], pts: 10, combo: 1, board: matched });
    assert.equal(await page.locator('#cells .sel').count(), 0);
    await text(page, '#fx .float', /\+10/);
    assert.equal(await page.locator('#fx .float.combo').count(), 0);
    await feed(page, { t: 'match', unit: OTHER, id: OTHER, a: [1, 1], b: [1, 2], board });
    assert.equal(await page.locator('#cells .cell').count(), 2);
    await feed(page, { ...playing, units: { all: { ...unit, level: 1 } } }, { t: 'board', unit: 'all', board });
    await page.locator('[data-k="1-1"]').click();
    await feed(page, { t: 'match', unit: 'all', id: ME, a: [1, 1], b: [1, 2], path: [[1, 1], [1, 2]], pts: 10, combo: 1, board: matched });
    assert.equal(await page.locator('#cells .sel').count(), 0);
    await feed(page, { t: 'emo', id: 'departed', e: 1 }, { t: 'cur', id: 'departed', p: [1, 1] });
    assert.equal(await page.locator('.cursor').count(), 0);
    await noAction(page, async () => {
      await page.locator('[data-k="2-1"]').dispatchEvent('pointerdown', { pointerType: 'touch' });
      await page.locator('#cells').dispatchEvent('pointercancel');
      await page.locator('#cells').dispatchEvent('pointerup');
    });
    await noAction(page, () => page.locator('[data-k="2-1"]').click({ button: 'middle' }));
    const noPairs = [[0, 0, 0, 0], [0, 1, 2, 0], [0, 2, 1, 0], [0, 0, 0, 0]];
    await feed(page, { t: 'board', unit: 'all', board: noPairs });
    await page.locator('#btnHint').click();
    await text(page, '#hintLeft', /^3$/);
    assert.equal(await page.locator('#cells .hint').count(), 0);
    await feed(page, { t: 'board', unit: 'all', board });
    for (let index = 0; index < 3; index++) await page.locator('#btnHint').click();
    await text(page, '#hintLeft', /^0$/);
    assert.equal(await page.locator('#btnHint').isDisabled(), true);
    for (const mode of ['race', 'team']) {
      const ids = mode === 'race' ? [ME, OTHER] : ['A', 'B'];
      const competitors = players.map((player, index) => ({ ...player, unit: ids[index], team: index ? 'B' : 'A' }));
      const race = { ...playing, mode, players: competitors, units: { [ids[0]]: unit, [ids[1]]: { ...unit, combo: 3 } } };
      await feed(page, { ...race, status: 'lobby', host: OTHER });
      await text(page, '#ovText', /Waiting for host/);
      await feed(page, race, { t: 'board', unit: ids[0], board }, { t: 'mini', unit: ids[1], board });
      if (mode === 'race') await noAction(page, () => page.locator('[data-k="1-1"]').click({ button: 'right' }));
      await feed(page, { ...race, units: { [ids[0]]: { ...unit, done: 'out' }, [ids[1]]: unit } });
      await text(page, '#ovTitle', /Time is up/);
      await feed(page, race, { ...race, status: 'ended', winner: ids[0], result: result() });
      await text(page, '#ovTitle', mode === 'race' ? /You win/ : /Team A.*wins/);
      await feed(page, race, { ...race, status: 'ended', host: OTHER, winner: ids[1], result: result() });
      await text(page, '#ovTitle', mode === 'race' ? /Lin wins/ : /Team B wins/);
      await text(page, '#ovText', /ranked by level then score.*Waiting for host/);
    }
    await feed(page, playing, { t: 'board', unit: 'all', board });
    for (const remaining of [10000, 3000]) {
      await feed(page, { ...playing, units: { all: { ...unit, endAt: TIME + remaining } } });
      await page.waitForFunction((limit) => {
        const width = parseFloat(document.querySelector('#timebar').style.width);
        return width > 0 && width <= limit;
      }, remaining / TURN_MS * 100);
      assert.match(await page.locator('#timebar').getAttribute('style'), remaining === 3000 ? /--bad/ : /--accent/);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await text(page, 'body', /Offline.*reconnect/);
  });
}

async function strategyEdges() {
  await scenario('co-tuong', async (page) => {
    await join(page, true);
    await page.locator('#room header button[title="Sound"]').click();
    const game = chess.newGame();
    const room = state({ status: 'playing', cfg: { level: 0 } });
    const viewOf = (last = null) => ({ ...structuredClone(game), side: [ME, OTHER], names: ['Ada', 'Lin'], deadline: TIME + TURN_MS, last });
    await feed(page, { ...room, view: viewOf() });
    for (const [from, to] of [[64, 67], [31, 40], [58, 49], [27, 36], [49, 40]]) {
      assert(chess.legal(game, game.turn, from, to), 'The check fixture must follow legal moves from the starting position');
      if (game.turn === 1) {
        await page.locator('.board-stage .pc').nth(from).click();
        if (game.b[to]) {
          assert.equal(await page.locator('.board-stage .pt.hit').count() > 0, true);
          await action(page, () => page.locator('.board-stage .pc').nth(to).click(), { t: 'g', from, to });
        } else await action(page, () => page.locator('.board-stage .pt').nth(to).click(), { t: 'g', from, to });
      }
      const cap = chess.move(game, from, to);
      await feed(page, { ...room, view: viewOf({ from, to, cap }) });
    }
    assert.equal(await page.locator('.board-stage .pc.check').count(), 1);
    await text(page, '.board-stage .hint', /in check/);
    const turned = viewOf();
    turned.side = [OTHER, ME];
    turned.names = ['Lin', 'Ada'];
    await feed(page, { ...room, view: turned });
    assert(Number(await page.locator('.board-stage .pc').first().evaluate((node) => parseFloat(node.style.top))) > 80);
    const [from, to] = chess.moves(game)[0];
    await page.locator('.board-stage .pc').nth(from).click();
    await action(page, () => page.locator('.board-stage .pt').nth(to).click(), { t: 'g', from, to });
    await feed(page, { ...room, view: { ...turned, side: [OTHER, 'bot'], names: ['Lin', ['Máy', 'Bot']] } });
    await text(page, '.board-stage .hint', /Bot is thinking.*in check/);
    const drawn = chess.newGame();
    const cycle = [[82, 65], [1, 18], [65, 82], [18, 1]];
    let before, last;
    for (let ply = 0; ply < chess.MAX_MOVES; ply++) {
      const [from, to] = cycle[ply % cycle.length];
      assert(chess.legal(drawn, drawn.turn, from, to));
      before = chess.clone(drawn);
      last = { from, to, cap: chess.move(drawn, from, to) };
    }
    const wrap = (position, last = null) => ({ ...position, side: [ME, OTHER], names: ['Ada', 'Lin'], deadline: TIME + TURN_MS, last });
    await feed(page, { ...room, view: wrap(before) }, { ...room, view: wrap(drawn, last) });
    await text(page, '.board-stage .hint', /Game over/);
    assert.equal(await page.locator('.board-stage .pc.can').count(), 0);
  });
  for (const name of ['co-ganh', 'o-an-quan']) {
    const rules = name === 'co-ganh' ? carry : sowing;
    const samples = new Map();
    const kinds = name === 'co-ganh' ? ['carry', 'trap', 'open', 'over'] : ['capture', 'mandarin', 'seed', 'debt', 'over'];
    for (let seed = 0; seed < 64 && !kinds.every((kind) => samples.has(kind)); seed++) {
      const game = rules.newGame();
      const random = miningRules.seeded(seed);
      for (let ply = 0; ply < 200 && !game.over; ply++) {
        const choices = rules.moves(game);
        if (!choices.length) break;
        const chosen = choices[Math.floor(random() * choices.length)];
        const before = rules.clone(game);
        const effect = rules.move(game, ...chosen);
        if (name === 'co-ganh') {
          const last = { from: chosen[0], to: chosen[1], ...effect };
          if (game.over && !samples.has('over')) samples.set('over', { before, after: rules.clone(game), last });
          for (const [kind, found] of [['carry', effect.ganh.length], ['trap', effect.vay.length], ['open', game.open >= 0]]) {
            if (found && !game.over && !samples.has(kind)) samples.set(kind, { before, after: rules.clone(game), last });
          }
        } else {
          const last = { from: { b: before.b, big: before.big }, steps: effect };
          if (game.over && !samples.has('over')) samples.set('over', { before, after: rules.clone(game), last });
          for (const [kind, found] of [
            ['capture', effect.some(([event, pit]) => event === 'cap' && !sowing.isQuan(pit))],
            ['mandarin', effect.some(([event, pit]) => event === 'cap' && before.big[pit])],
            ['seed', effect.some(([event]) => event === 'seed')],
            ['debt', game.debt.some((amount) => amount > 0)],
          ]) if (found && !game.over && !samples.has(kind)) samples.set(kind, { before, after: rules.clone(game), last });
        }
      }
    }
    await scenario(name, async (page) => {
      await join(page, true);
      await page.locator('#room header button[title="Sound"]').click();
      assert.deepEqual([...samples.keys()].sort(), [...kinds].sort(), `${name}: all fixtures must be reachable by legal play`);
      const room = state({ status: 'playing', cfg: { n: 2, level: 0, quanNon: true } });
      for (const [kind, sample] of samples) {
        const side = sample.after.turn === 1 ? [ME, OTHER] : [OTHER, ME];
        const wrap = (position, last = null) => ({ ...position, side, names: ['Ada', 'Lin'], deadline: TIME + TURN_MS, last });
        await feed(page, { ...room, status: 'lobby', view: null });
        await feed(page, { ...room, view: wrap(sample.before) }, { ...room, view: wrap(sample.after, sample.last) });
        if (kind === 'over') {
          if (name === 'o-an-quan') await page.waitForFunction(() => !document.querySelector('.oaq .foot').textContent.includes('Sowing'));
          await text(page, '.board-stage .hint', name === 'co-ganh' ? /Game over/ : /All mandarins gone/);
          assert.equal(await page.locator(name === 'co-ganh' ? '.board-stage .pc.can' : '.oaq .cell.can').count(), 0);
          continue;
        }
        if (name === 'co-ganh') {
          if (kind === 'open') {
            await text(page, '.board-stage .hint', /must carry/);
            const [from, to] = carry.moves(sample.after)[0];
            await page.locator('.board-stage .pc').nth(from).click();
            await action(page, () => page.locator('.board-stage .pt').nth(to).click(), { t: 'g', from, to });
          } else {
            assert.equal(await page.locator('.board-stage .pc.flip').count(), sample.last.ganh.length + sample.last.vay.length);
            await text(page, '.board-stage .hint', kind === 'trap' ? /trapped/ : /carried/);
          }
          await feed(page, { ...room, view: { ...wrap(sample.after, sample.last), side: side.map((id) => id === ME ? 'bot' : id) } });
          await text(page, '.board-stage .hint', /Bot is thinking/);
        } else {
          await page.waitForFunction(() => !document.querySelector('.oaq .foot').textContent.includes('Sowing'));
          if (kind === 'debt') await text(page, '.oaq', /owes/);
          if (kind === 'mandarin') assert.equal(await page.locator('.oaq .got .q').count() > 0, true);
          const [pit] = sowing.moves(sample.after)[0];
          await page.locator('.oaq .cell').nth(pit).click();
          await visible(page, '.dirs');
          await page.locator('.oaq .cell').nth(pit).click();
          await visible(page, '.dirs', false);
          await page.locator('.oaq .cell').nth(pit).click();
          await action(page, () => page.locator('.dirs button').last().click(), { t: 'g', k: pit, d: 1 });
        }
      }
      if (name === 'o-an-quan') {
        for (const players of [PLAYERS, [...PLAYERS, { id: SPECTATOR, name: 'Observer', online: true }]]) {
          await feed(page, { ...room, status: 'lobby', view: null, players, cfg: { n: players.length, level: 0, quanNon: false } });
          await text(page, '#overlay .sub', players.length === 2 ? /Ada vs Lin/ : /3-player board.*3 players/);
          await action(page, () => page.locator('.cfg .seg').nth(1).locator('button').first().click(), { t: 'config', cfg: { quanNon: true } });
        }
      }
    });
  }
}

async function nokiaEdges() {
  for (const game of NOKIA_GAMES) {
    await scenario(game, async (page) => {
      await page.locator('#home label input').fill('');
      await join(page, true);
      const lobby = state({ players: [PLAYERS[0]], seats: [ME], cfg: { speed: 1, walls: false, mode: 'solo', maze: 0, seeds: 4, level: 0 }, view: null });
      await feed(page, lobby, { t: 'unknown' });
      await text(page, '#overlay .sub', /solo|alone|one|yourself|bot/i);
      await page.locator('#room header button[title="Sound"]').click();
      const playing = { ...lobby, players: PLAYERS, seats: [ME, OTHER], status: 'playing', view: nokiaView(game) };
      await feed(page, playing);
      if (game === 'snake') {
        await feed(page, { ...lobby, status: 'lobby', players: PLAYERS, seats: [ME, OTHER] });
        await text(page, '#overlay .sub', /one field each/);
        await feed(page, { ...playing, view: { ...playing.view, walls: false } });
        const bounds = await page.locator('.screen canvas').boundingBox();
        for (const [dx, dy, direction] of [[-40, 0, 'left'], [0, 40, 'down'], [0, -40, 'up']]) {
          await action(page, async () => {
            await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            await page.mouse.down();
            await page.mouse.move(bounds.x + bounds.width / 2 + dx, bounds.y + bounds.height / 2 + dy);
            await page.mouse.up();
          }, { t: 'g', d: direction });
        }
        await noAction(page, async () => {
          await page.locator('.stage').dispatchEvent('pointerdown', { clientX: 10, clientY: 10 });
          await page.locator('.stage').dispatchEvent('pointerup', { clientX: 12, clientY: 12 });
          await page.locator('.stage').dispatchEvent('pointerdown', { clientX: 10, clientY: 10 });
          await page.locator('.stage').dispatchEvent('pointercancel');
          await page.locator('.stage').dispatchEvent('pointerup', { clientX: 60, clientY: 10 });
        });
        const menu = await page.locator('.pad button').first().evaluate((button) => button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
        assert.equal(menu, false);
      } else if (game === 'pairs') {
        await feed(page, { ...playing, players: [PLAYERS[0]], seats: [ME], view: { ...playing.view, turn: ME, deadline: 0 } });
        await action(page, () => page.keyboard.press('Enter'), { t: 'g', i: 0 });
      } else if (game === 'logic') {
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowUp');
        await action(page, () => page.keyboard.press('Enter'), { t: 'g', guess: [0, 0, 0, 1] });
        await noAction(page, () => tapLCD(page, 80, 42));
        const guesses = Array.from({ length: 10 }, () => ({ guess: [0, 0, 0, 0], exact: 0, near: 0 }));
        await feed(page, { ...playing, view: { ...playing.view, mine: { guesses, solved: false }, others: { [ME]: { n: 10, solved: false }, [OTHER]: { n: 2, solved: false } } } });
        await noAction(page, () => page.keyboard.press('Enter'));
        await feed(page, { ...playing, status: 'ended', result: result(), view: { ...playing.view, mine: { guesses, solved: false }, secret: [1, 2, 3, 4], others: { [ME]: { n: 10, solved: false }, [OTHER]: { n: 3, solved: true } } } });
        await text(page, '#players', /done 3/);
      } else if (game === 'bantumi') {
        const board = bantumiBoard();
        const first = bantumiMove(board, 1, 0);
        await feed(page, { ...playing, view: { ...playing.view, board, side: [OTHER, ME], turn: 2, moves: 1, last: { from: 0, ...first } } });
        await action(page, () => tapLCD(page, 34, 25), { t: 'g', i: 9 });
        const again = bantumiMove(board, 2, 9);
        await feed(page, { ...playing, view: { ...playing.view, board, side: [OTHER, ME], turn: 2, moves: 2, last: { from: 9, ...again } } });
      } else if (game === 'space-impact') {
        for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft']) {
          await page.keyboard.down(key);
          await frames(page);
          assert((await outgoing(page)).some((message) => message.keys?.[key.slice(5).toLowerCase()]));
          await page.keyboard.up(key);
        }
        await feed(page, { ...playing, view: { ...playing.view, t: 2, ships: playing.view.ships.map((ship) => ({ ...ship, invul: 1 })) } });
      }
      await canvasPixels(page, '.screen canvas');
      const loss = result({ title: null, mode: 'race', ranks: [{ id: OTHER, name: 'Lin', score: 10, won: true }, { id: ME, name: 'Ada', score: 0 }] });
      await feed(page, { ...playing, status: 'ended', result: loss });
      await text(page, '#overlay h2', /Lin wins/);
      await feed(page, playing, { ...playing, status: 'ended', result: result({ title: null, mode: 'solo', ranks: [{ id: ME, name: 'Ada', score: 0 }] }) });
      await text(page, '#overlay h2', /Game over/);
    });
  }
  await scenario('bounce', async (page) => {
    await join(page, true);
    await page.locator('#room header button[title="Sound"]').click();
    const view = { ...nokiaView('bounce'), level: 2 };
    const playing = state({ status: 'playing', cfg: { level: 2 }, view });
    await feed(page, playing);
    await outgoing(page);
    await page.keyboard.down('ArrowRight');
    await feed(page, { ...playing, now: TIME + 30000 });
    await page.keyboard.up('ArrowRight');
    const completions = (await outgoing(page)).filter((message) => message.done);
    assert.equal(completions.length, 1);
    assert.equal(completions[0].finished, false);
    assert(completions[0].score > 0);
    await canvasPixels(page, '.screen canvas');
    await feed(page, { ...playing, now: TIME + 40000 });
    assert.equal((await outgoing(page)).filter((message) => message.done).length, 0);
  });
  const replayId = 'bounce-finish-fixture';
  const playing = state({ status: 'playing', cfg: { level: 1 }, view: { seed: 42, level: 1, startAt: TIME - 30000, runners: { [ME]: { at: [280, 30], score: 30, done: false, finished: false }, [OTHER]: { at: null, score: 0, done: false, finished: false } } } });
  const atDoor = { ...playing, now: TIME + 15000, view: { ...playing.view, runners: { ...playing.view.runners, [ME]: { at: [480, 36], score: 45, done: false, finished: false } } } };
  const finished = { ...playing, now: TIME + 16000, view: { ...playing.view, runners: { ...playing.view.runners, [ME]: { at: [486, 36], score: 46, done: true, finished: true } } } };
  REPLAY_RECORDS.set(replayId, { game: 'bounce', page: routeOf('bounce'), at: TIME, frames: [[0, playing], [500, atDoor], [1000, finished]] });
  await scenario('bounce', async (page) => {
    await page.locator('.rp-bar').waitFor();
    const slider = page.locator('.rp-bar input');
    await slider.fill('0');
    await slider.dispatchEvent('input');
    await frames(page);
    const lifePixel = await page.locator('.screen canvas').evaluate((canvas) => Array.from(canvas.getContext('2d').getImageData(54, 19, 1, 1).data));
    assert.deepEqual(lifePixel, LCD_PALETTE.ink);
    await slider.fill('500');
    await slider.dispatchEvent('input');
    await frames(page);
    const doorPixel = () => page.locator('.screen canvas').evaluate((canvas) => Array.from(canvas.getContext('2d').getImageData(67, 31, 1, 1).data));
    assert.deepEqual(await doorPixel(), LCD_PALETTE.background);
    await slider.fill('1000');
    await slider.dispatchEvent('input');
    await frames(page);
    assert.deepEqual(await doorPixel(), LCD_PALETTE.ink);
    await text(page, '#players', /46s/);
    await noAction(page, () => tapLCD(page, 40, 25));
  }, `?replay=${replayId}`);
}

async function rapidRollEdges() {
  const samples = new Map();
  for (let seed = 0; seed < 64 && samples.size < 2; seed++) {
    const sim = createRollSim(seed);
    for (let frame = 0; frame < 3600 && !sim.dead; frame++) {
      stepRoll(sim, 1 / 60);
      const scroll = rollScroll(sim.t);
      for (const platform of sim.plats) {
        const kind = platform.heart ? 'heart' : platform.spike ? 'spike' : null;
        const y = Math.round(platform.y - scroll);
        if (!kind || samples.has(kind) || y < 15 || y > 45 || sim.dead) continue;
        const point = kind === 'heart' ? [platform.x + 6, y - 4] : [platform.x, y - 1];
        if (Math.abs(point[0] - sim.x) < 5 && Math.abs(point[1] - (sim.y - scroll)) < 5) continue;
        samples.set(kind, { seed, point, time: sim.t, at: [sim.x, sim.y], score: scoreRoll(sim) });
      }
    }
    for (const sample of samples.values()) {
      if (sample.seed === seed) sample.finished = { time: sim.t, at: [sim.x, sim.y], score: scoreRoll(sim), dead: sim.dead };
    }
  }
  for (const kind of ['heart', 'spike']) {
    await scenario('rapid-roll', async (page) => {
      const sample = samples.get(kind);
      assert(sample?.finished.dead, `A legal rolling course must expose ${kind} before natural game over`);
      await page.locator('.rp-bar').waitFor();
      const slider = page.locator('.rp-bar input');
      await slider.fill('0');
      await slider.dispatchEvent('input');
      await frames(page);
      const pixel = await page.locator('.screen canvas').evaluate((canvas, [x, y]) => Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data), sample.point);
      assert.deepEqual(pixel, LCD_PALETTE.ink);
      await slider.fill('1000');
      await slider.dispatchEvent('input');
      await frames(page);
      await canvasPixels(page, '.screen canvas');
      await text(page, '#players', new RegExp(String(sample.finished.score)));
      await slider.fill('0');
      await slider.dispatchEvent('input');
      await frames(page);
      const restored = await page.locator('.screen canvas').evaluate((canvas, [x, y]) => Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data), sample.point);
      assert.deepEqual(restored, pixel);
      await noAction(page, () => page.keyboard.press('ArrowLeft'));
    }, `?replay=roll-${kind}-fixture`, {
      prepare: async () => {
        const sample = samples.get(kind);
        if (!sample) return;
        const message = (snapshot, done) => state({
          status: 'playing', now: TIME + snapshot.time * 1000, cfg: {},
          view: { seed: sample.seed, level: 0, startAt: TIME, runners: {
            [ME]: { at: snapshot.at, score: snapshot.score, done },
            [OTHER]: { at: null, score: 0, done: false },
          } },
        });
        REPLAY_RECORDS.set(`roll-${kind}-fixture`, { game: 'rapid-roll', page: routeOf('rapid-roll'), at: TIME, frames: [[0, message(sample, false)], [1000, message(sample.finished, true)]] });
      },
    });
  }
}

async function aimMiningShot(page, preferGold = true) {
  const shot = await page.evaluate(({ items, pivot, swingMax, swingSpeed, preferGold }) => {
    const solo = window.dv.solo;
    const miner = solo.world.miners[0];
    if (solo.screen !== 'play' || miner.mode !== 'swing') return null;
    const circle = Math.PI * 2;
    const candidates = solo.world.items.flatMap((item) => {
      const def = items[item.type];
      if (def.moves || def.tnt || def.bag) return [];
      const dx = item.x - miner.x, dy = item.y - pivot[1];
      const angle = Math.atan2(dx, dy);
      if (Math.abs(angle) >= swingMax) return [];
      const distance = Math.hypot(dx, dy);
      const blocked = solo.world.items.some((other) => {
        if (other.id === item.id) return false;
        const ox = other.x - miner.x, oy = other.y - pivot[1];
        const along = ox * Math.sin(angle) + oy * Math.cos(angle);
        const across = Math.abs(ox * Math.cos(angle) - oy * Math.sin(angle));
        return along > 0 && along < distance && across < items[other.type].r * (items[other.type].scale ?? 1) + 5;
      });
      if (blocked) return [];
      const first = Math.asin(angle / swingMax);
      const phase = ((miner.phase % circle) + circle) % circle;
      const delay = Math.min(...[first, Math.PI - first].map((value) => (((value - phase) % circle) + circle) % circle)) / swingSpeed;
      const priority = preferGold ? def.value / (distance * def.weight) : Number(!!def.rock) * 1000 + def.weight;
      return [{ delay, distance, weight: def.weight, priority, type: item.type }];
    });
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0] ?? null;
  }, { items: miningRules.ITEMS, pivot: miningRules.PIVOT, swingMax: miningRules.SWING_MAX, swingSpeed: miningRules.SWING_SPEED, preferGold });
  assert(shot, 'The generated mine must contain an unobstructed item within the hook swing');
  await page.clock.runFor(Math.ceil(shot.delay * 1000));
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => window.dv.solo.world.miners[0].mode), 'out');
  return shot;
}

async function miningEdges() {
  await scenario('dao-vang', async (page) => {
    await page.locator('#overlay .menu').waitFor();
    await page.locator('#overlay label input').fill('');
    await page.locator('#overlay label input').press('ArrowDown');
    assert.equal(await page.evaluate(() => window.boardFixture.sockets.length), 0);
    await page.getByRole('button', { name: 'Create a multiplayer room', exact: true }).click();
    await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
    const players = PLAYERS.map((player) => ({ ...player, spec: false, money: 50, dynamite: 1, ready: false, offer: [{ key: 'dynamite', price: 100 }], bought: {} }));
    const lobby = state({ players, mode: 'versus', team: 100, target: 650, level: 2, versusLevels: 5 });
    await feed(page, lobby);
    await page.getByRole('button', { name: /Invite: room/ }).click();
    await visible(page, '#invite');
    assert.equal(await page.locator('#invite .link').innerText(), page.url());
    await page.locator('#invite').getByRole('button', { name: 'Close', exact: true }).click();
    await feed(page, { ...lobby, host: OTHER, players: [players[0], { ...players[1], online: false }] });
    await text(page, '#overlay', /Waiting for the host/);
    await page.locator('#btnSound').click();
    const playing = { ...lobby, status: 'playing' };
    const world = { t: 'world', world: { level: 2, miners: [{ id: ME, x: 220 }, { id: OTHER, x: 420 }], items: [{ id: 1, type: 'mouse', x: 200, x0: 200, amp: 50, ph: 0, speed: 25, y: 300 }, { id: 2, type: 'goldMed', x: 350, y: 250 }] } };
    await feed(page, playing, world);
    await canvasPixels(page, '#game');
    const snap = { t: 'snap', wt: 1, time: 59, miners: [{ id: ME, a: 0, l: 100, m: 'in', h: 'goldMed', d: 1, s: false }, { id: OTHER, a: 0.5, l: 80, m: 'out', h: null, d: 0, s: false }] };
    await feed(page, snap);
    await visible(page, '#btnDyn');
    await feed(page, { t: 'ev', evs: [{ k: 'shoot', id: ME }] });
    await canvasPixels(page, '#game');
    await page.clock.runFor(500);
    await canvasPixels(page, '#game');
    await feed(page, { t: 'ev', evs: [{ k: 'collect', id: ME, type: 'goldTiny', value: 50 }, { k: 'collect', id: ME, type: 'rockSmall', value: 11 }, { k: 'boom', id: OTHER, x: 420, y: 200 }] });
    await canvasPixels(page, '#game');
    await page.clock.runFor(1800);
    await feed(page, { ...playing, status: 'shop', shopEndsAt: TIME + TURN_MS });
    assert.equal(await page.locator('.shop-item').first().isDisabled(), true);
    await feed(page, { ...playing, status: 'shop', shopEndsAt: 0, players: [{ ...players[0], spec: true }, players[1]] });
    await text(page, '#overlay', /spectating.*next round/);
    assert.equal(await page.locator('#overlay .shop-item').count(), 0);
    await feed(page, playing, { ...playing, status: 'ended', host: OTHER, players: [players[0], { ...players[1], online: false }], result: { winner: OTHER, win: false, level: 2, ranking: [players[1], players[0]], team: 100, target: 650 } });
    await text(page, '#overlay .result', /Lin wins/);
    await feed(page, playing, { ...playing, status: 'ended', result: { winner: null, win: false, level: 2, ranking: players, team: 100, target: 650 } });
    await text(page, '#overlay .result', /Lost at level 2/);
    await feed(page, { t: 'error', msg: ['Phòng đã đóng', 'Room closed'] });
    await page.locator('#overlay .menu').waitFor();
    await text(page, 'body', /Room closed/);
    await page.getByRole('button', { name: 'Create a multiplayer room', exact: true }).click();
    await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
    await feed(page, playing);
    await page.locator('#btnMenu').click();
    await page.locator('#overlay .menu').waitFor();
  }, '', {
    prepare: async (page) => {
      await page.route('**/dao-vang/assets/atlas.json', async (route) => {
        const response = await route.fetch();
        const atlas = await response.json();
        if (Array.isArray(atlas.frames)) atlas.frames = Object.fromEntries(atlas.frames.map(({ filename, ...frame }) => [filename, frame]));
        await route.fulfill({ response, json: atlas });
      });
    },
  });
  await scenario('dao-vang', async (page) => {
    await page.locator('#overlay .menu').waitFor();
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await page.waitForFunction(() => window.dv.solo.screen === 'play');
    await page.locator('#btnSound').click();
    await page.locator('#btnHelp').click();
    await visible(page, '.help-dlg');
    assert.equal(await page.evaluate(() => window.dv.solo.screen), 'pause');
    await page.locator('.help-dlg .help-ok').click();
    await page.waitForFunction(() => window.dv.solo.screen === 'play');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => window.dv.solo.world.miners[0].dynamite), 0);
    for (let shotCount = 0; shotCount < 12; shotCount++) {
      const current = await page.evaluate(() => ({ money: window.dv.solo.money, screen: window.dv.solo.screen }));
      if (current.money >= miningRules.targetOf(1) || current.screen !== 'play') break;
      const shot = await aimMiningShot(page);
      await page.keyboard.press('ArrowDown');
      await page.clock.runFor(Math.ceil((shot.distance / miningRules.SHOOT_SPEED + shot.distance * shot.weight / miningRules.PULL) * 1000) + 750);
    }
    const earned = await page.evaluate(() => window.dv.solo.money);
    assert(earned >= miningRules.targetOf(1), 'Real hook catches must earn the first level target');
    await text(page, '#hMoney', new RegExp(`^\\$${earned}$`));
    await page.evaluate(() => { Math.random = () => 0.1; });
    await page.clock.runFor(SOLO_EXPIRE_MS);
    await text(page, '#overlay .shopkeeper', /Cleared level 1/);
    const prices = await page.locator('.shop-item em').allTextContents();
    const totalPrice = prices.reduce((sum, price) => sum + Number(price.replace('$', '')), 0);
    assert(earned >= totalPrice);
    const purchaseCount = await page.locator('.shop-item').count();
    for (let index = 0; index < purchaseCount; index++) {
      await page.locator('.shop-item').nth(index).click();
      await text(page, `.shop-item:nth-child(${index + 1}) em`, /Bought/);
      assert.equal(await page.locator('.shop-item').nth(index).isDisabled(), true);
    }
    await page.evaluate(() => { Math.random = window.miningFixtureRandom; });
    await page.getByRole('button', { name: 'Enter level 2', exact: true }).click();
    await page.waitForFunction(() => window.dv.solo.screen === 'play');
    const afterShop = await page.evaluate(() => ({ money: window.dv.solo.money, level: window.dv.solo.level, buffs: window.dv.solo.buffs, dynamite: window.dv.solo.world.miners[0].dynamite }));
    assert.equal(afterShop.money, earned - totalPrice);
    assert.equal(afterShop.level, 2);
    assert.deepEqual(afterShop.buffs, { strength: true, clover: true, rockBook: true, polish: false });
    assert.equal(afterShop.dynamite, 1);
    await frames(page);
    await text(page, '#hLevel', /^2$/);
    const shot = await aimMiningShot(page, false);
    await page.clock.runFor(Math.ceil(shot.distance / miningRules.SHOOT_SPEED * 1000) + 100);
    assert(await page.evaluate(() => window.dv.solo.world.miners[0].held), 'Dynamite must target an actually caught item');
    await page.keyboard.press('ArrowUp');
    assert.deepEqual(await page.evaluate(() => ({ dynamite: window.dv.solo.world.miners[0].dynamite, held: window.dv.solo.world.miners[0].held })), { dynamite: 0, held: null });
    await page.clock.runFor(SOLO_EXPIRE_MS);
    await text(page, '#overlay', /Time's up.*New record/s);
    const score = await page.evaluate(() => window.dv.solo.money);
    assert.equal(await page.evaluate(() => localStorage.getItem('dv.best')), String(score));
    await page.waitForFunction(() => document.querySelector('#historyStatus')?.textContent.includes('saved in your history'));
    assert.equal(HISTORY_POSTS.at(-1)?.score, score);
    await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
    await text(page, '#overlay .menu', /Solo best:/);
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await page.waitForFunction(() => window.dv.solo.screen === 'play');
    await page.locator('#btnMenu').click();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await page.waitForFunction(() => window.dv.solo.screen === 'play');
    assert.equal(await page.evaluate(() => window.dv.solo.money), 0);
    await frames(page);
    await text(page, '#hLevel', /^1$/);
  }, '', {
    prepare: (page) => page.addInitScript(() => {
      let seed = 241;
      Math.random = () => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let value = seed;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
      window.miningFixtureRandom = Math.random;
    }),
  });
  await scenario('dao-vang', async (page) => {
    await text(page, '#loading', /Could not load the game images/);
    await saveCoverage(page);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.locator('#overlay .menu').waitFor();
    assert.equal(await page.locator('#loading').count(), 0);
  }, '', {
    prepare: (page) => page.route('**/dao-vang/assets/atlas.webp', (route) => route.fulfill({ status: 503, body: '' }), { times: 1 }),
    errors: ['atlas 503'],
  });
}

try {
  await classicBoards();
  await battleship();
  await mines();
  await matching();
  await betting();
  await nokiaBoardGames();
  await nokiaLCDGames();
  await lcdPixels();
  await mining();
  await classicEdges();
  await mineEdges();
  await matchingEdges();
  await strategyEdges();
  await nokiaEdges();
  await miningEdges();
  await rapidRollEdges();
} finally {
  await context.close();
  await browser.close();
}
if (failures.length) throw new AggregateError(failures, failures.map((failure) => failure.message).join('\n'));

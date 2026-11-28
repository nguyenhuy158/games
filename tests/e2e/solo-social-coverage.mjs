import assert from 'node:assert/strict';
import { findChromium } from '@huyab/e2e';
import { chromium } from 'playwright-core';
import { saveCoverage, saveCoverageData } from './coverage.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8789';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const BASE_URL = new URL(BASE);
if (!LOOPBACK_HOSTS.has(BASE_URL.hostname) || !['http:', 'https:'].includes(BASE_URL.protocol)) {
  throw new Error('Solo/social coverage requires a loopback HTTP origin');
}
const WAIT_MS = 15000;
const SECOND_MS = 1000;
const CLOCK_START = new Date('2026-11-26T12:00:00.000Z');
const VIEWPORT = { width: 720, height: 1000 };
const PLAYER_ID = 'coverage-player';
const HARNESS_PATH = '/solo-social-coverage-harness';
const NAVIGATION_COVERAGE_KEY = 'solo-social.navigation-coverage';
const JSON_TYPE = 'application/json';
const HTTP_OK = 200;
const HTTP_DENIED = 403;
const HTTP_UNAVAILABLE = 503;
const QUICK_RULE_SELECTOR = '.help-quick';
const GAME_IDS = ['2048', 'tetris', 'sudoku', 'undercover', 'undercover-guide', 'loto', 'soi'];
const browser = await chromium.launch({ executablePath: findChromium() });
const failures = [];
let passed = 0;

async function scenario(name, route, run, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: VIEWPORT, hasTouch: true, colorScheme: options.colorScheme ?? 'light' });
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT_MS);
  const requests = [];
  await context.addInitScript(({ games, player, storage }) => {
    localStorage.setItem('pk.id', player);
    localStorage.setItem('pk.name', 'Coverage Player');
    for (const game of games) localStorage.setItem(`help.seen.${game}`, '1');
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
  }, { games: GAME_IDS, player: PLAYER_ID, storage: options.storage ?? {} });
  await context.addInitScript((coverageKey) => {
    addEventListener('pagehide', (event) => {
      if (!event.isTrusted || !globalThis.__coverage__) return;
      const snapshots = JSON.parse(sessionStorage.getItem(coverageKey) || '[]');
      snapshots.push({ coverage: globalThis.__coverage__, url: location.href });
      sessionStorage.setItem(coverageKey, JSON.stringify(snapshots));
    });
  }, NAVIGATION_COVERAGE_KEY);
  await page.route('**/*', async (request) => {
    const url = new URL(request.request().url());
    if (url.origin !== BASE_URL.origin) return request.abort();
    if (url.pathname === HARNESS_PATH) return request.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>' });
    if (url.pathname.startsWith('/api/')) {
      const body = request.request().postDataJSON();
      requests.push({ path: url.pathname, method: request.request().method(), body });
      const reply = await options.api?.(url, request.request(), requests, page);
      if (reply?.abort) return request.abort(reply.abort);
      if (reply) return request.fulfill({ contentType: JSON_TYPE, status: HTTP_OK, ...reply });
      const value = url.pathname === '/api/me' ? { resultOwner: 'coverage-owner', name: 'Coverage Player' }
        : url.pathname === '/api/rooms' ? { rooms: [] } : url.pathname === '/api/me/history' ? [] : [];
      return request.fulfill({ contentType: JSON_TYPE, status: HTTP_OK, body: JSON.stringify(value) });
    }
    return request.continue();
  });
  try {
    if (options.clock) {
      await page.clock.install({ time: CLOCK_START });
      await page.clock.pauseAt(CLOCK_START);
    }
    if (options.protocol) await installProtocol(page);
    if (options.init) await page.addInitScript(options.init);
    await saveCoverage(page);
    await page.goto(new URL(route, BASE).href);
    await run(page, requests);
    passed++;
    console.log(`PASS solo/social ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL solo/social ${name}: ${error.stack}`);
  } finally {
    await saveCoverage(page);
    const snapshots = await page.evaluate((coverageKey) => JSON.parse(sessionStorage.getItem(coverageKey) || '[]'), NAVIGATION_COVERAGE_KEY);
    for (const snapshot of snapshots) await saveCoverageData(snapshot.coverage, snapshot.url);
    await context.close();
  }
}

async function installProtocol(page) {
  await page.addInitScript(() => {
    const CONNECTING = 0;
    const OPEN = 1;
    const CLOSED = 3;
    const ROOM_SOCKET_PREFIX = '/api/nk/';
    window.coverageTransport = { sockets: [], sent: [] };
    class LocalSocket extends EventTarget {
      static CONNECTING = CONNECTING;
      static OPEN = OPEN;
      static CLOSED = CLOSED;
      constructor(url) {
        super();
        this.url = String(url);
        this.readyState = CONNECTING;
        window.coverageTransport.sockets.push(this);
        queueMicrotask(() => {
          if (this.readyState !== CONNECTING) return;
          this.readyState = OPEN;
          this.dispatchEvent(new Event('open'));
        });
      }
      dispatchEvent(event) {
        const dispatched = super.dispatchEvent(event);
        const handler = this[`on${event.type}`];
        if (typeof handler === 'function') handler.call(this, event);
        return dispatched;
      }
      send(text) {
        if (text === 'ping') return queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: 'pong' })));
        window.coverageTransport.sent.push(JSON.parse(text));
      }
      close() {
        this.readyState = CLOSED;
        this.dispatchEvent(new CloseEvent('close', { code: 1000 }));
      }
    }
    window.WebSocket = LocalSocket;
    window.coverageTransport.roomSocket = () => window.coverageTransport.sockets.findLast((socket) => new URL(socket.url, location.href).pathname.startsWith(ROOM_SOCKET_PREFIX) && socket.readyState === OPEN);
    window.coverageTransport.receive = (message) => {
      const socket = window.coverageTransport.roomSocket();
      if (!socket) throw new Error('No local room socket connected');
      if (message.t === 'state') window.coverageTransport.state = message;
      socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
    };
  });
}

async function state(page, value) {
  await page.waitForFunction(() => !!window.coverageTransport.roomSocket());
  await page.evaluate((message) => window.coverageTransport.receive({ ...message, now: Date.now() }), value);
}

function room(view = null, overrides = {}) {
  return { t: 'state', status: 'playing', host: PLAYER_ID, seats: [PLAYER_ID, 'other'], players: [{ id: PLAYER_ID, name: 'Coverage Player' }, { id: 'other', name: 'Other Player' }], cfg: {}, view, ...overrides };
}

async function clickName(page, name, scope = page) {
  await scope.getByRole('button', { name, exact: true }).click();
}

async function textIncludes(page, selector, text) {
  await page.waitForFunction(({ selector, text }) => document.querySelector(selector)?.textContent.includes(text), { selector, text });
}

async function pointer(page, selector, dx, dy) {
  await page.locator(selector).dispatchEvent('pointerdown', { clientX: 150, clientY: 150, pointerId: 1, pointerType: 'touch', isPrimary: true });
  await page.locator(selector).dispatchEvent('pointerup', { clientX: 150 + dx, clientY: 150 + dy, pointerId: 1, pointerType: 'touch', isPrimary: true });
}

for (const language of ['en', 'vi']) {
  await scenario(`2048 moves, undo, leaderboard and history (${language})`, `/2048/?lang=${language}`, async (page, requests) => {
    await page.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 16 && [...document.querySelectorAll('#tiles .tile')].filter((node) => node.textContent).length === 2);
    assert.equal(await page.locator('#btnUndo').isDisabled(), true);
    await page.keyboard.press('u');
    await page.keyboard.press('x');
    const before = await page.locator('#tiles').innerText();
    for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp']) await page.keyboard.press(key);
    assert.equal(await page.locator('#btnUndo').isDisabled(), false);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('u');
    await page.locator('#btnUndo').click();
    await pointer(page, '#board', -90, 0);
    await pointer(page, '#board', 90, 0);
    await pointer(page, '#board', 0, -90);
    await pointer(page, '#board', 0, 90);
    for (const direction of ['left', 'right', 'up', 'down']) await page.locator(`.pad [data-dir="${direction}"]`).click();
    assert.notEqual(await page.locator('#tiles').innerText(), before);
    await page.locator('#btnBoard').click();
    assert.equal(await page.locator('#side').evaluate((node) => node.classList.contains('open')), true);
    await page.locator('#btnBoard').click();
    await page.evaluate(() => localStorage.removeItem('pk.name'));
    await page.evaluate(() => {
      const keys = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'];
      const MAX_MOVES = 24000;
      let seed = 7;
      for (let index = 0; index < MAX_MOVES && document.querySelector('#over').hidden; index++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: keys[seed >>> 30], bubbles: true }));
      }
      if (document.querySelector('#over').hidden) throw new Error('2048 did not reach game over through legal moves');
    });
    assert.equal(await page.locator('#final').textContent(), await page.locator('#score').textContent());
    assert.notEqual(await page.locator('#name').inputValue(), '');
    await page.waitForFunction(() => document.querySelector('#historyStatus')?.textContent.includes(document.documentElement.lang === 'en' ? 'saved in your history' : 'Đã lưu ván'));
    await page.locator('#pad, .pad').first().getByRole('button').first().dispatchEvent('click');
    assert.equal(await page.locator('#over').isVisible(), true);
    assert(requests.some(({ path, body }) => path === '/api/me/history' && body.game === '2048' && body.score >= 0));
    await page.locator('#name').fill(' ');
    await page.locator('#saveForm').dispatchEvent('submit');
    assert.equal(requests.filter(({ method, path }) => method === 'POST' && path === '/api/board').length, 0);
    await page.locator('#name').fill('Coverage Champion');
    await page.keyboard.press('ArrowLeft');
    await page.locator('#saveForm').dispatchEvent('submit');
    await page.waitForFunction(() => !document.querySelector('#btnSave').disabled);
    await page.locator('#saveForm').dispatchEvent('submit');
    await textIncludes(page, '#lb', 'Coverage Champion');
    assert.equal(await page.locator('#btnUndo').isDisabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('pk.name')), 'Coverage Champion');
    await page.locator('#saveForm').dispatchEvent('submit');
    assert.equal(requests.filter(({ method, path }) => method === 'POST' && path === '/api/board').length, 2);
    await page.locator('#btnRetry').click();
    await page.waitForFunction(() => document.querySelector('#over').hidden && document.querySelector('#score').textContent === '0');
    await page.locator('#btnHelp').click();
    assert.equal(await page.locator('dialog.help-dlg').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.locator('#btnNew').click();
  }, { api: (url, request, requests) => {
    if (url.pathname !== '/api/board') return null;
    if (request.method() !== 'POST') return { body: JSON.stringify([{ name: 'Prior Player', score: 10, at: '2026-01-01' }]) };
    const posts = requests.filter((entry) => entry.path === '/api/board' && entry.method === 'POST');
    return posts.length === 1 ? { status: HTTP_UNAVAILABLE, body: '{}' } : { body: JSON.stringify([{ name: 'Coverage Champion', score: 100, at: '2026-01-02' }]) };
  } });

  await scenario(`tetris controls, levels, pause and game over (${language})`, `/tetris/?lang=${language}`, async (page, requests) => {
    assert.equal(await page.locator('#cells > div').count(), 200);
    await page.keyboard.press('p');
    await page.keyboard.press('ArrowLeft');
    const levels = await page.locator('[data-level]').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.dataset.level))]);
    await page.keyboard.press('x');
    for (const level of levels) {
      await page.locator(`#ovStart [data-level="${level}"]`).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('tetris.level')), level);
    }
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('#ovStart').hidden);
    assert(await page.locator('#cells .blk').count() > 0);
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']) await page.keyboard.press(key);
    await page.keyboard.press('p');
    assert.equal(await page.locator('#ovPause').isVisible(), true);
    const pausedBoard = await page.locator('#cells').innerHTML();
    await page.keyboard.press('ArrowDown');
    await page.clock.fastForward(SECOND_MS);
    assert.equal(await page.locator('#cells').innerHTML(), pausedBoard);
    await page.keyboard.press('P');
    await page.locator('#btnHelp').click();
    assert.equal(await page.locator('#ovPause').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.locator('#btnPause').click();
    for (const [dx, dy] of [[-80, 0], [80, 0], [0, -80], [0, 80], [0, 0]]) await pointer(page, '#board', dx, dy);
    for (const action of ['left', 'right', 'rotate', 'drop']) await page.locator(`.moves [data-act="${action}"]`).click();
    await page.evaluate(() => {
      const LIMIT = 100;
      for (let index = 0; index < LIMIT && document.querySelector('#ovOver').hidden; index++) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      }
      if (document.querySelector('#ovOver').hidden) throw new Error('Tetris stack did not reach game over');
    });
    assert.equal(await page.locator('#btnPause').isDisabled(), true);
    await page.waitForFunction(() => document.querySelector('#historyStatus')?.textContent.includes(document.documentElement.lang === 'en' ? 'saved in your history' : 'Đã lưu ván'));
    assert(requests.some(({ path, body }) => path === '/api/me/history' && body.game === 'tetris' && body.won === false));
    await page.locator('#ovOver [data-act="start"]').click();
    await page.waitForFunction(() => document.querySelector('#ovOver').hidden);
  }, { clock: true, storage: { 'tetris.level': 'invalid-level', 'tetris.best': 'invalid-score', 'tetris.best.hard': '17' } });

  await scenario(`sudoku notes, conflicts, hints, reset and solve (${language})`, `/sudoku/?lang=${language}`, async (page, requests) => {
    await page.waitForFunction(() => document.querySelectorAll('#grid > .given').length > 0);
    await page.keyboard.press('1');
    await page.keyboard.press('Delete');
    await page.keyboard.press('x');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#grid .sel').count(), 1);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#grid .sel').count(), 0);
    const given = page.locator('#grid .given').first();
    const givenValue = await given.textContent();
    await given.click();
    await page.keyboard.press('9');
    await page.keyboard.press('Backspace');
    assert.equal(await given.textContent(), givenValue);
    const user = page.locator('#grid .user').first();
    await user.click();
    await page.keyboard.press('n');
    await page.keyboard.press('3');
    await page.keyboard.press('1');
    assert.equal(await user.locator('.notes').textContent(), '13');
    await page.keyboard.press('3');
    assert.equal(await user.locator('.notes').textContent(), '1');
    await page.locator('#btnNote').click();
    const duplicate = await user.evaluate((node) => {
      const cells = [...node.parentElement.children];
      const row = Math.floor(cells.indexOf(node) / 9);
      return cells.slice(row * 9, row * 9 + 9).find((cell) => cell.classList.contains('given'))?.textContent ?? '1';
    });
    await page.keyboard.press(duplicate);
    assert(await page.locator('#grid .err').count() > 0);
    await page.keyboard.press(duplicate);
    await page.locator('#btnErase').click();
    assert.equal(await page.locator('#grid .err').count(), 0);
    await page.locator('#pad button').first().click();
    await page.locator('#btnPause').click();
    assert.equal(await page.locator('#ovPause').isVisible(), true);
    const paused = await page.locator('#clock').textContent();
    await page.keyboard.press('2');
    await page.keyboard.press('Delete');
    const selected = await page.locator('#grid .sel').count();
    await page.locator('#grid .user').first().dispatchEvent('click');
    assert.equal(await page.locator('#grid .sel').count(), selected);
    await page.clock.fastForward(SECOND_MS);
    assert.equal(await page.locator('#clock').textContent(), paused);
    await page.locator('#btnResume').click();
    await page.locator('#btnHelp').click();
    assert.equal(await page.locator('#ovPause').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#ovPause').hidden);
    await page.locator('#btnReset').click();
    await page.locator('#btnResetNo').click();
    assert.equal(await page.locator('#ovReset').isVisible(), false);
    await page.locator('#btnReset').click();
    await page.locator('#btnResetYes').click();
    await page.waitForFunction(() => document.querySelector('#ovReset').hidden);
    assert.equal(await page.locator('#grid .user').evaluateAll((nodes) => nodes.every((node) => !node.textContent)), true);
    for (let hint = 0; hint < 3; hint++) await page.locator('#btnHint').click();
    assert.equal(await page.locator('#btnHint').isDisabled(), true);
    await page.locator('#btnSide').click();
    assert.equal(await page.locator('#side').evaluate((node) => node.classList.contains('open')), true);
    await page.clock.runFor(SECOND_MS * 2);
    await solveSudoku(page);
    await page.waitForFunction(() => document.querySelector('#historyStatus')?.textContent.includes(document.documentElement.lang === 'en' ? 'saved in your history' : 'Đã lưu ván'));
    assert(requests.some(({ path, body }) => path === '/api/me/history' && body.game === 'sudoku' && body.won));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.best')).easy), 2);
    for (const difficulty of ['medium', 'hard', 'easy']) {
      await page.locator('#diff').evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('change')); }, difficulty);
      await page.waitForFunction((difficulty) => !document.querySelector('#diff').disabled && document.querySelector('#diff').value === difficulty, difficulty);
      assert.equal(await page.locator('#grid .given').count(), { easy: 41, medium: 31, hard: 21 }[difficulty]);
    }
    await page.clock.runFor(SECOND_MS * 3);
    await solveSudoku(page);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.best')).easy), 2);
    await page.locator('#btnNew').click();
  }, { clock: true, storage: { 'sudoku.best': '{invalid' } });
}

async function solveSudoku(page) {
  await page.evaluate(() => {
    const SIZE = 9;
    const BOX = 3;
    const nodes = [...document.querySelectorAll('#grid > div')];
    const puzzle = nodes.map((node) => node.classList.contains('given') ? Number(node.textContent) : 0);
    const valid = (index, value) => {
      const row = Math.floor(index / SIZE), column = index % SIZE;
      for (let offset = 0; offset < SIZE; offset++) {
        if (puzzle[row * SIZE + offset] === value || puzzle[offset * SIZE + column] === value) return false;
        const boxRow = Math.floor(row / BOX) * BOX + Math.floor(offset / BOX);
        const boxColumn = Math.floor(column / BOX) * BOX + offset % BOX;
        if (puzzle[boxRow * SIZE + boxColumn] === value) return false;
      }
      return true;
    };
    const solve = () => {
      const index = puzzle.indexOf(0);
      if (index < 0) return true;
      for (let number = 1; number <= SIZE; number++) {
        if (!valid(index, number)) continue;
        puzzle[index] = number;
        if (solve()) return true;
        puzzle[index] = 0;
      }
      return false;
    };
    if (!solve()) throw new Error('Displayed Sudoku is not solvable');
    if (document.querySelector('#btnNote').classList.contains('on')) document.querySelector('#btnNote').click();
    for (const [index, node] of nodes.entries()) {
      if (node.classList.contains('given')) continue;
      node.click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: String(puzzle[index]), bubbles: true }));
    }
    if (document.querySelector('#grid .err')) throw new Error('Solved Sudoku displays conflicts');
    if (nodes.some((node) => !/^[1-9]$/.test(node.textContent))) throw new Error('Solved Sudoku has empty cells');
  });
}

await scenario('history preparation failure preserves solo start controls', '/tetris/?lang=en', async (page) => {
  await page.keyboard.press('Space');
  await textIncludes(page, '#historyStatus', 'has not started');
  assert.equal(await page.locator('#ovStart').isVisible(), true);
  assert.equal(await page.locator('#btnPause').isDisabled(), true);
  await clickName(page, 'Retry');
  await page.waitForFunction(() => document.querySelector('#ovStart').hidden);
}, { api: (url, _request, requests) => url.pathname === '/api/me' && requests.filter((entry) => entry.path === '/api/me').length === 1 ? { status: HTTP_UNAVAILABLE, body: '{}' } : null });

async function revealLocalCard(page, player) {
  await page.getByRole('textbox', { name: 'Your name' }).fill(player);
  await clickName(page, 'View keyword');
  const word = await page.locator('.secret-word').textContent();
  await clickName(page, 'Done viewing');
  assert.equal(await page.locator('.secret-word').count(), 0);
  return { player, word };
}

await scenario('spy local handoff names, privacy and final results', '/undercover/?lang=en', async (page) => {
  const players = ['An', 'Binh', 'Chi', 'Dung', 'Eva', 'Fong'];
  await clickName(page, 'Pass one device');
  await page.getByRole('combobox', { name: 'Players', exact: true }).selectOption(String(players.length));
  await page.getByRole('combobox', { name: 'Mr. White', exact: true }).selectOption('1');
  await clickName(page, 'Dark mode');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
  await clickName(page, 'Light mode');
  await clickName(page, 'Start game');
  await clickName(page, 'View keyword');
  await textIncludes(page, '.handoff [role="alert"]', 'Enter your name.');
  await page.getByRole('textbox', { name: 'Your name' }).fill(players[0]);
  await clickName(page, 'View keyword');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.secret-word').count(), 0);
  const cards = [await revealLocalCard(page, players[0])];
  await page.getByRole('textbox', { name: 'Your name' }).fill(players[0]);
  await clickName(page, 'View keyword');
  await textIncludes(page, '.handoff [role="alert"]', 'This name is already taken.');
  for (const player of players.slice(1)) cards.push(await revealLocalCard(page, player));
  assert.equal(await page.locator('.player-name').first().textContent(), `1. ${players[0]}`);
  assert.equal(await page.locator('.phase-panel h2').textContent(), 'Give a clue');
  await clickName(page, 'Back');
  await clickName(page, 'Cancel', page.locator('dialog.spy-dialog[open]'));
  const white = cards.find((card) => card.word === 'No word');
  assert(white);
  await clickName(page, 'Eliminate directly');
  await choosePaginated(page, white.player);
  await clickName(page, 'Confirm', page.locator('dialog.spy-dialog[open]'));
  await clickName(page, 'Enter your guess');
  await page.locator('.guess-form input').fill('Definitely not the civilian word');
  await page.locator('.guess-form').dispatchEvent('submit');
  await clickName(page, 'Cancel', page.locator('dialog.spy-dialog[open]'));
  assert.equal(await page.locator('.guess-form input').inputValue(), 'Definitely not the civilian word');
  await page.locator('.guess-form').dispatchEvent('submit');
  await clickName(page, 'Confirm', page.locator('dialog.spy-dialog[open]'));
  const counts = new Map();
  for (const card of cards.filter((card) => card.word !== 'No word')) counts.set(card.word, (counts.get(card.word) ?? 0) + 1);
  const spy = cards.find((card) => card.word !== 'No word' && counts.get(card.word) === 1);
  assert(spy);
  await clickName(page, 'Eliminate directly');
  await choosePaginated(page, spy.player);
  await clickName(page, 'Confirm', page.locator('dialog.spy-dialog[open]'));
  assert.equal(await page.locator('.game-result').isVisible(), true);
  assert.equal(await page.locator('.word-pair dd').count(), 2);
  await clickName(page, 'Next page', page.locator('.game-result'));
  assert.equal(await page.locator('.game-result .player-row').count(), 2);
  await clickName(page, 'Previous page', page.locator('.game-result'));
  await clickName(page, 'Play a new game');
  assert.equal(await page.locator('.roster-list > li').count(), 6);
}, { storage: { 'gian-diep.theme': 'light' } });

async function choosePaginated(page, name) {
  const modal = page.locator('dialog.spy-dialog[open]');
  if (!await modal.getByRole('button', { name, exact: true }).count()) await clickName(page, 'Next page', modal);
  await clickName(page, name, modal);
}

for (const language of ['en', 'vi']) {
  await scenario(`spy AI success, denial, abort and form validation (${language})`, `${HARNESS_PATH}?lang=${language}`, async (page, requests) => {
    const labels = language === 'en' ? { suggest: 'Suggest topics', generate: 'Create secret pack', close: 'Close' } : { suggest: 'Gợi ý chủ đề', generate: 'Tạo bộ từ bí mật', close: 'Đóng' };
    await page.evaluate(async () => {
      const { aiPicker } = await import('/undercover/ai.js');
      window.openAi = () => aiPicker((result) => { document.querySelector('#fixture').textContent = `${result.packId}:${result.title}`; }, { room: 'TEST', deviceId: 'coverage-player' });
      window.openAi();
    });
    await clickName(page, labels.generate);
    assert.equal(requests.filter(({ path }) => path === '/api/undercover/ai').length, 0);
    await clickName(page, labels.suggest);
    await textIncludes(page, 'dialog [role="status"]', language === 'en' ? 'Denied topic' : 'Từ chối chủ đề');
    await clickName(page, labels.suggest);
    await clickName(page, 'Street food');
    assert.equal(await page.locator('dialog input').inputValue(), 'Street food');
    await page.locator('dialog form').dispatchEvent('submit');
    await textIncludes(page, '#fixture', 'aaaaaaaaaaaaaaaa:Street food');
    assert.equal(requests.at(-1).body.topic, 'Street food');
    assert.equal(requests.at(-1).body.room, 'TEST');
    const pair = await page.evaluate(async () => (await import('/undercover/ai.js')).dealAiPair('aaaaaaaaaaaaaaaa'));
    assert.deepEqual(pair, ['Phở', 'Bún']);
    await page.evaluate(() => window.openAi());
    await page.locator('dialog input').fill('Unavailable');
    await clickName(page, labels.generate);
    await textIncludes(page, 'dialog [role="status"]', language === 'en' ? 'AI is unavailable' : 'AI chưa sẵn sàng');
    await clickName(page, labels.close, page.locator('dialog[open]'));
    await page.evaluate(async () => {
      const original = window.fetch;
      window.fetch = async (url, options) => {
        if (String(url).includes('/api/undercover/ai')) throw new DOMException('Timed out', 'TimeoutError');
        return original(url, options);
      };
      window.openAi();
    });
    await clickName(page, labels.suggest);
    await textIncludes(page, 'dialog [role="status"]', language === 'en' ? 'AI timed out' : 'AI quá thời gian');
    await clickName(page, labels.close, page.locator('dialog[open]'));
    await page.evaluate(() => {
      window.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
        window.aiRequestAborted = true;
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true }));
      window.openAi();
    });
    await clickName(page, labels.suggest);
    assert.equal(await page.getByRole('button', { name: labels.generate, exact: true }).isDisabled(), true);
    await clickName(page, labels.close, page.locator('dialog[open]'));
    await page.waitForSelector('dialog[open]', { state: 'detached' });
    await page.waitForFunction(() => window.aiRequestAborted);
    assert.equal(await page.locator('dialog.spy-dialog').count(), 0);
  }, { api: (url, request, requests) => {
    if (url.pathname !== '/api/undercover/ai') return null;
    const body = request.postDataJSON();
    if (body.action === 'topics') {
      const count = requests.filter((entry) => entry.body?.action === 'topics').length;
      return count === 1 ? { status: HTTP_DENIED, body: JSON.stringify({ msg: ['Từ chối chủ đề', 'Denied topic'] }) } : { body: JSON.stringify({ topics: ['Street food', 'Travel'] }) };
    }
    if (body.action === 'deal') return { body: JSON.stringify({ pair: ['Phở', 'Bún'] }) };
    if (body.topic === 'Unavailable') return { status: HTTP_UNAVAILABLE, body: '{}' };
    return { body: JSON.stringify({ packId: 'aaaaaaaaaaaaaaaa', title: 'Street food' }) };
  } });
}

await scenario('spy UI accepts invalid setup input safely and renders ordered rosters', `${HARNESS_PATH}?lang=en`, async (page) => {
  const result = await page.evaluate(async () => {
    const ui = await import('/undercover/ui.js');
    const roster = await import('/undercover/roster.js');
    const { DEFAULT_CONFIG } = await import('/shared/games/gian-diep/logic.js');
    const root = document.querySelector('#fixture');
    const players = [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Binh' }, { id: 'c', name: 'Chi' }];
    root.append(roster.seatingRoster(players, 'a', null, Math.random), ui.results({}, (id) => id), ui.paginated([], () => document.createElement('div')));
    const warnings = [ui.setupWarning(2, DEFAULT_CONFIG), ui.setupWarning(21, DEFAULT_CONFIG), ui.setupWarning(3, { ...DEFAULT_CONFIG, spies: 3 }), ui.setupWarning(3, DEFAULT_CONFIG)];
    ui.settings(3, { ...DEFAULT_CONFIG, spies: 3 }, () => { root.dataset.saved = 'yes'; });
    return { warnings, order: roster.orderedPlayers(players, ['b', 'missing', 'b']).map((player) => player.id), draft: roster.rosterHasDraft(roster.rosterDraft()) };
  });
  assert.deepEqual(result.order, ['b', 'a', 'c']);
  assert.equal(result.draft, false);
  assert.match(result.warnings[0], /Need 1/);
  assert.match(result.warnings[1], /At most 20/);
  assert.match(result.warnings[2], /Invalid role counts/);
  assert.equal(await page.locator('dialog[open] .notice.warning').isVisible(), true);
  assert.equal(result.warnings[3], '');
  assert.equal(await page.getByRole('button', { name: 'Save settings', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('#fixture .roster-list li').count(), 3);
  await page.locator('dialog[open]').dispatchEvent('click');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
});

for (const language of ['en', 'vi']) {
  await scenario(`werewolf private roles, spectators and reveal (${language})`, `/soi/?r=TEST&lang=${language}`, async (page) => {
    await page.waitForFunction(() => window.coverageTransport.sockets.length > 0);
    await state(page, room(null, { status: 'waiting' }));
    await textIncludes(page, '#overlay', language === 'en' ? 'Need' : 'Cần thêm');
    const players = Array.from({ length: 5 }, (_, index) => ({ id: index ? `guest-${index}` : PLAYER_ID, name: `Player ${index}` }));
    const seats = players.map((player) => player.id);
    await state(page, room(null, { status: 'waiting', players, seats }));
    await textIncludes(page, '#overlay', language === 'en' ? 'Enough players' : 'Đủ người');
    await clickName(page, language === 'en' ? 'Start' : 'Bắt đầu');
    assert.equal(await page.evaluate(() => window.coverageTransport.sent.at(-1).t), 'start');
    for (const [index, role] of ['wolf', 'villager', null].entries()) {
      await state(page, room({ round: index + 1, role }, { players, seats }));
      if (!role) {
        await textIncludes(page, '.role', language === 'en' ? 'You are watching' : 'Bạn đang xem');
        assert.equal(await page.locator('.role.watching').count(), 1);
        continue;
      }
      const reveal = language === 'en' ? 'Tap to see your role' : 'Chạm để xem vai';
      await clickName(page, reveal);
      assert.equal(await page.locator(`.role.${role}`).count(), 1);
      await textIncludes(page, '.role h2', language === 'en' ? role === 'wolf' ? 'WOLF' : 'VILLAGER' : role === 'wolf' ? 'SÓI' : 'DÂN');
      await clickName(page, language === 'en' ? 'Hide' : 'Ẩn vai');
      assert.equal(await page.locator(`.role.${role}`).count(), 0);
    }
    await state(page, room({ round: 4, role: 'wolf' }, { players, seats, host: 'guest-1' }));
    assert.equal(await page.locator('.soi > button').isVisible(), false);
    await state(page, room({ round: 4, role: 'wolf' }, { players, seats }));
    await page.locator('.soi > button').click();
    assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'reveal' });
    await state(page, room({ round: 4, role: 'wolf', wolf: PLAYER_ID }, {
      players, seats, status: 'ended',
      result: { title: ['Đã tìm thấy sói', 'Wolf revealed'], ranks: [{ id: PLAYER_ID, name: 'Player 0', score: 300, won: true }] },
    }));
    await textIncludes(page, '#players', language === 'en' ? 'Wolf' : 'Sói');
    await page.locator('#room [data-help="soi"]').click();
    assert.match(await page.locator('.soi-intro-video').getAttribute('src'), /start=4353&end=4404/);
    assert.equal(await page.locator('.soi-intro a').getAttribute('rel'), 'noopener noreferrer');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.help-dlg').open);
    assert.match(await page.locator('.soi-intro-video').getAttribute('src'), /start=4353/);
  }, { protocol: true });
}

await scenario('loto buying, marking, calls, penalties, winner and spectator', '/loto/?r=TEST&lang=en', async (page) => {
  await page.waitForFunction(() => window.coverageTransport.sockets.length > 0);
  await state(page, room(null, { status: 'waiting', players: [{ id: PLAYER_ID, name: 'Coverage Player' }], seats: [PLAYER_ID], cfg: { pace: 0, penalty: 'both' } }));
  await textIncludes(page, '#overlay', 'Playing alone');
  await page.locator('#overlay .seg').first().getByRole('button', { name: '3s', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'config', cfg: { pace: 3 } });
  await clickName(page, 'Edit party penalties');
  await page.locator('.party-dlg input').fill('Sing a song');
  await page.locator('.party-dlg input').press('Enter');
  await textIncludes(page, '.plist', 'Sing a song');
  await clickName(page, 'Save', page.locator('.party-dlg'));
  assert((await page.evaluate(() => JSON.parse(localStorage.getItem('loto.party')))).includes('Sing a song'));
  const cards = await page.evaluate(async () => {
    const logic = await import('/shared/games/loto/logic.js');
    return [logic.newCard(), logic.newCard()];
  });
  const fresh = { cards: [cards[0]], colors: [0], called: [], marked: [], auto: false, pace: 0, best: { [PLAYER_ID]: 0, other: 4 }, pen: {} };
  await state(page, room(fresh));
  assert.equal(await page.locator('.grid .cell').count(), 81);
  assert.equal(await page.locator('.shop').isVisible(), true);
  await page.locator('.swatches button').first().click();
  await textIncludes(page, 'body', 'Keep at least one card');
  await page.locator('.swatches button').nth(1).click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'pick', colors: [0, 1] });
  const multi = { ...fresh, cards, colors: [0, 1] };
  await state(page, room(multi));
  assert.equal(await page.locator('.tabs button').count(), 2);
  await page.locator('.tabs button').first().click();
  await pointer(page, '.wrap', -100, 0);
  await textIncludes(page, '.strip', '2/2');
  await pointer(page, '.wrap', 100, 0);
  await textIncludes(page, '.strip', '1/2');
  await pointer(page, '.wrap', 5, 0);
  await pointer(page, '.wrap', 80, 100);
  await page.locator('.wrap').dispatchEvent('pointerdown', { clientX: 100, clientY: 100 });
  await page.locator('.wrap').dispatchEvent('pointercancel');
  await page.locator('.wrap').dispatchEvent('pointerup', { clientX: 0, clientY: 100 });
  await textIncludes(page, '.strip', '1/2');
  await page.locator('.swap').click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'swap', k: 0 });
  await page.locator('.swatches button').nth(1).click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'pick', colors: [0] });
  await page.evaluate(() => window.coverageTransport.receive({ t: 'loto', e: 'unknown' }));
  assert.equal(await page.locator('.pen').isVisible(), false);
  await state(page, room({ ...fresh, cards: Array.from({ length: 6 }, () => cards[0]), colors: [0, 1, 2, 3, 4, 5] }));
  await page.locator('.swatches button').nth(6).click();
  await textIncludes(page, 'body', 'At most 6 cards');
  await state(page, room(multi));
  await page.locator('.tabs button').first().click();
  const numberCell = page.locator('.cell:not(.blank)').first();
  const number = Number(await numberCell.textContent());
  const index = await numberCell.evaluate((node) => [...node.parentElement.children].indexOf(node));
  await numberCell.click();
  await textIncludes(page, 'body', `${number} has not been called`);
  await numberCell.click();
  await page.locator('.call').click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'call' });
  const called = { ...multi, called: [number], best: { [PLAYER_ID]: 1, other: 4 } };
  await state(page, room(called));
  assert.equal(await page.locator('.ball').textContent(), String(number));
  assert.equal(await page.locator('.count').textContent(), '1/90');
  assert.equal(await page.locator('.shop').isVisible(), false);
  assert.equal(await page.locator('.board .cur').textContent(), String(number));
  await state(page, room({ ...called, pace: 3, called: [number, 90] }));
  assert.equal(await page.locator('.ball').textContent(), '90');
  assert.match(await page.evaluate(() => window.audioLedger.spoken.at(-1).text), /ninety/i);
  await page.locator('.cell').nth(index).click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'mark', i: index });
  await state(page, room({ ...called, marked: [index] }));
  assert.equal(await page.locator('.cell').nth(index).evaluate((node) => node.classList.contains('hit')), true);
  const sent = await page.evaluate(() => window.coverageTransport.sent.length);
  await page.locator('.cell').nth(index).click();
  assert.equal(await page.evaluate(() => window.coverageTransport.sent.length), sent);
  const dismissNotification = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  while (await dismissNotification.count()) await dismissNotification.first().click();
  assert.equal(await page.locator('.ui-toast').count(), 0);
  await page.locator('.auto').click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'auto', on: true });
  await page.locator('.kinh').click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'kinh' });
  for (const pace of [0, 3, 5, 8]) {
    await state(page, room({ ...called, pace, next: Date.now() + SECOND_MS * pace }));
    await page.locator('.pace').click();
    assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'pace', s: { 0: 3, 3: 5, 5: 8, 8: 0 }[pace] });
  }
  const row = cards[0][0].filter((value) => value != null);
  const marks = cards[0][0].flatMap((value, column) => value == null ? [] : [column]);
  await state(page, room({ ...called, called: row.slice(0, -1), marked: marks.slice(0, -1), auto: true }));
  await textIncludes(page, '.status', 'WAITING');
  assert(await page.locator('.cell.wait').count() > 0);
  await state(page, room({ ...called, called: row, marked: marks, auto: true }));
  assert.equal(await page.locator('.kinh').evaluate((node) => node.classList.contains('ready')), true);
  await textIncludes(page, '.status', 'Row complete');
  const now = await page.evaluate(() => Date.now());
  await state(page, room({ ...called, pen: { lock: now + SECOND_MS * 30, freeze: now + SECOND_MS * 60 } }));
  assert.equal(await page.locator('.kinh').isDisabled(), true);
  assert.equal(await page.locator('.auto.frozen').count(), 1);
  await page.clock.fastForward(SECOND_MS);
  await textIncludes(page, '.kinh', '29s');
  await state(page, room({ ...called, pen: { after: 4 } }));
  await textIncludes(page, '.kinh', '3 more');
  for (const game of ['lock', 'chip', 'freeze', 'liar', 'after', 'invalid']) {
    await page.evaluate((game) => window.coverageTransport.receive({ t: 'loto', e: 'lao', id: 'other', game, chip: 7 }), game);
    await textIncludes(page, '.pen-card h3', 'Other Player');
    assert.equal(await page.locator('.pen').isVisible(), true);
    if (game === 'invalid') assert.equal(await page.locator('.pen-card .g').isVisible(), false);
    else assert.equal(await page.locator('.pen-card .g').isVisible(), true);
    await page.locator('.pen-card').click();
    assert.equal(await page.locator('.pen').isVisible(), false);
  }
  await page.evaluate(() => window.coverageTransport.receive({ t: 'loto', e: 'lao', id: 'missing', game: 'chip', chip: 7, party: ['Hát', 'Sing'] }));
  await page.clock.runFor(SECOND_MS * 4);
  await textIncludes(page, '.pen .landed', 'Sing');
  await page.clock.runFor(SECOND_MS * 5);
  assert.equal(await page.locator('.pen').isVisible(), false);
  const winner = { ...called, called: row, marked: marks, kinh: { wins: [{ id: PLAYER_ID, rows: [{ k: 0, r: 0 }] }] }, best: { [PLAYER_ID]: 5 } };
  await state(page, room(winner));
  assert.equal(await page.locator('.kinh').isDisabled(), true);
  assert(await page.locator('.cell.win').count() > 0);
  await textIncludes(page, '.status', 'KINH! Checking');
  await state(page, room(winner, { status: 'ended', result: { title: ['Kinh', 'KINH'], ranks: [{ id: PLAYER_ID, name: 'Coverage Player', score: 5, won: true }, { id: 'other', name: 'Other Player', score: 4 }] } }));
  await textIncludes(page, '#overlay .ranks', 'one away');
  await state(page, room({ ...called, kinh: null }, { status: 'ended', result: { title: ['Hết số', 'No winner'], ranks: [{ id: PLAYER_ID, name: 'Coverage Player', score: 2 }] } }));
  assert.equal(await page.locator('.status').textContent(), '');
  await textIncludes(page, '#overlay .ranks', '2/5');
  await state(page, room({ ...called, cards: null, colors: [], liars: ['other'] }, { host: 'other' }));
  await textIncludes(page, '.status', 'no seats left');
  assert.equal(await page.locator('.sheet').isVisible(), false);
  assert.equal(await page.locator('.call').isVisible(), false);
  await state(page, room({ ...called, pace: 5 }, { host: 'other' }));
  await textIncludes(page, '.pace-note', 'Auto call every 5s');
  for (let index = 0; index < 3; index++) await page.locator('.voice').click();
  await page.locator('.music').click();
  await page.locator('.music').click();
  await page.locator('.music-vol').evaluate((node) => { node.value = '3'; node.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.evaluate(() => localStorage.getItem('loto.music')), '3');
}, { protocol: true, clock: true, init: installAudioBoundary });

function installAudioBoundary() {
  const ledger = { tones: [], gains: [], sources: [], spoken: [], cancel: 0, resumed: 0 };
  window.audioLedger = ledger;
  const parameter = () => ({
    value: 0,
    setValueAtTime(value, at) { ledger.gains.push({ value, at, method: 'value' }); },
    exponentialRampToValueAtTime(value, at) { ledger.gains.push({ value, at, method: 'ramp' }); },
    setTargetAtTime(value, at, time) { ledger.gains.push({ value, at, time, method: 'target' }); },
  });
  const node = () => ({
    gain: parameter(), frequency: parameter(),
    connect(next) { return next; },
    start(at) { ledger.sources.push({ at, type: this.type ?? 'buffer' }); },
    stop(at) { this.stoppedAt = at; },
  });
  class Context {
    constructor() { this.state = 'running'; this.destination = node(); this.sampleRate = 40; this.born = Date.now(); }
    get currentTime() { return (Date.now() - this.born) / 1000; }
    createGain() { return node(); }
    createOscillator() { const oscillator = node(); ledger.tones.push(oscillator); return oscillator; }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node(); }
    createBuffer(_channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
    resume() { ledger.resumed++; this.state = 'running'; return Promise.resolve(); }
  }
  window.AudioContext = Context;
  window.webkitAudioContext = Context;
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  window.coverageVoices = [
    { lang: 'en_GB', name: 'English Natural', default: false },
    { lang: 'en-US', name: 'Zarvox', default: false },
    { lang: 'en-US', name: 'Grandpa', default: true },
    { lang: 'en-US', name: 'Google Natural', default: true },
    { lang: 'vi-VN', name: 'Vietnamese Natural', default: false },
  ];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => window.coverageVoices,
    cancel: () => { ledger.cancel++; },
    speak: (utterance) => { ledger.spoken.push(utterance); utterance.onstart?.(); },
  } });
}

await scenario('music synthesis, ducking, muted and unsupported audio', `${HARNESS_PATH}?lang=en`, async (page) => {
  const initial = await page.evaluate(async () => {
    const { createMusic } = await import('/loto/music.js');
    const { setSoundOn } = await import('/sound.js');
    window.coverageSound = { createMusic, setSoundOn };
    const music = createMusic();
    window.coverageMusic = music;
    const fallback = music.level;
    music.duck(true);
    music.stop();
    music.unlock();
    music.start();
    music.start();
    music.duck(true);
    music.duck(false);
    music.drum();
    music.fanfare();
    document.querySelector('#fixture').textContent = music.playing ? 'Music playing' : 'Music stopped';
    return { fallback, playing: music.playing, sources: window.audioLedger.sources.length };
  });
  assert.equal(initial.fallback, 2);
  assert.equal(initial.playing, true);
  assert(initial.sources > 10);
  await textIncludes(page, '#fixture', 'Music playing');
  await page.clock.runFor(SECOND_MS * 17);
  const played = await page.evaluate(() => ({
    sources: window.audioLedger.sources.length,
    types: [...new Set(window.audioLedger.sources.map((source) => source.type))],
    gains: window.audioLedger.gains.filter((gain) => gain.method === 'target').map((gain) => gain.value),
  }));
  assert(played.sources > initial.sources + 100);
  assert(played.types.includes('sine') && played.types.includes('square') && played.types.includes('triangle') && played.types.includes('buffer'));
  assert(played.gains.includes(0.055) && played.gains.includes(0.22));
  const stopped = await page.evaluate(() => {
    const music = window.coverageMusic;
    music.level = 3;
    const saved = localStorage.getItem('loto.music');
    window.coverageSound.setSoundOn(false);
    music.start();
    music.unlock();
    music.drum();
    music.fanfare();
    const muted = music.playing;
    window.coverageSound.setSoundOn(true);
    music.start();
    music.level = 0;
    music.start();
    music.stop();
    const zero = music.playing;
    delete window.AudioContext;
    delete window.webkitAudioContext;
    localStorage.setItem('loto.music', '2');
    const unsupported = window.coverageSound.createMusic();
    unsupported.unlock();
    unsupported.start();
    unsupported.drum();
    unsupported.fanfare();
    document.querySelector('#fixture').textContent = `Muted:${muted};zero:${zero};unsupported:${unsupported.playing}`;
    return { saved, muted, zero, unsupported: unsupported.playing };
  });
  assert.deepEqual(stopped, { saved: '3', muted: false, zero: false, unsupported: false });
  await textIncludes(page, '#fixture', 'unsupported:false');
}, { clock: true, init: installAudioBoundary, storage: { 'loto.music': 'invalid' } });

await scenario('voice ranking, lifecycle, loading and missing language fallback', `${HARNESS_PATH}?lang=en`, async (page) => {
  const result = await page.evaluate(async () => {
    const { createVoice } = await import('/loto/voice.js');
    const { setSoundOn } = await import('/sound.js');
    const root = document.querySelector('#fixture');
    window.voiceStates = [];
    window.missingVoices = [];
    const voice = createVoice({ lang: 'en', onMissing: (lang) => { window.missingVoices.push(lang); root.textContent = `Missing ${lang}`; }, onSpeaking: (on) => { window.voiceStates.push(on); root.textContent = on ? 'Speaking' : 'Silent'; } });
    window.coverageVoice = voice;
    voice.unlock();
    voice.unlock();
    voice.speak({ en: 'Number twelve', vi: 'Số mười hai' });
    const spoken = window.audioLedger.spoken.at(-1);
    const selected = spoken.voice.name;
    spoken.onend();
    voice.speak({ en: 'Number thirteen', vi: 'Số mười ba' });
    window.audioLedger.spoken.at(-1).onerror();
    voice.mode = 'off';
    const count = window.audioLedger.spoken.length;
    voice.speak({ en: 'Must not speak' });
    voice.mode = 'vi';
    voice.speak({ vi: 'Số một' });
    setSoundOn(false);
    voice.speak({ vi: 'Must not speak' });
    setSoundOn(true);
    const unavailable = voice.voiceFor('invalid');
    window.coverageVoices = [];
    voice.speak({ vi: 'Waiting for voice list' });
    return { selected, supported: voice.supported, offCount: count, count: window.audioLedger.spoken.length, unavailable, states: window.voiceStates, missing: window.missingVoices };
  });
  assert.equal(result.selected, 'Google Natural');
  assert.equal(result.supported, true);
  assert.equal(result.count, result.offCount + 1);
  assert.equal(result.unavailable, null);
  assert.deepEqual(result.states, [true, false, true, false, true]);
  assert.deepEqual(result.missing, []);
  await page.clock.fastForward(SECOND_MS * 2);
  await page.evaluate(() => {
    window.coverageVoice.speak({ vi: 'No voice loaded' });
    window.coverageVoice.speak({ vi: 'Warn once only' });
    window.coverageVoice.mode = 'en';
    window.coverageVoice.speak({ en: 'No English voice' });
  });
  assert.deepEqual(await page.evaluate(() => window.missingVoices), ['vi', 'en']);
  await textIncludes(page, '#fixture', 'Missing en');
  assert.equal(await page.evaluate(() => localStorage.getItem('loto.voice')), 'en');
}, { clock: true, init: installAudioBoundary, storage: { 'loto.voice': 'invalid' } });

await scenario('voice unavailable leaves visual game playable', `${HARNESS_PATH}?lang=vi`, async (page) => {
  const result = await page.evaluate(async () => {
    const { createVoice } = await import('/loto/voice.js');
    const missing = [];
    const voice = createVoice({ lang: 'vi', onMissing: (lang) => { missing.push(lang); document.querySelector('#fixture').textContent = `Số 12 — thiếu giọng ${lang}`; } });
    window.noVoice = voice;
    voice.unlock();
    voice.speak({ vi: 'Số mười hai' });
    window.noVoiceMissing = missing;
    return { supported: voice.supported, mode: voice.mode, voice: voice.voiceFor('vi') };
  });
  assert.deepEqual(result, { supported: false, mode: 'vi', voice: null });
  await page.clock.fastForward(SECOND_MS * 2);
  await page.evaluate(() => { window.noVoice.speak({ vi: 'Số mười hai' }); window.noVoice.speak({ vi: 'Số mười ba' }); });
  assert.deepEqual(await page.evaluate(() => window.noVoiceMissing), ['vi']);
  await textIncludes(page, '#fixture', 'Số 12 — thiếu giọng vi');
}, { clock: true, init: () => Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined }) });

for (const language of ['en', 'vi']) {
  await scenario(`public rooms filtering, full seats and refresh failure (${language})`, `/phong/?game=loto&lang=${language}`, async (page, requests) => {
    await page.waitForSelector('#waiting .room');
    assert.equal(await page.locator('#waiting .room').count(), 1);
    assert.equal(await page.locator('#playing .room').count(), 1);
    assert.equal(await page.locator('#nWait').textContent(), '(1)');
    assert.equal(await page.locator('#waiting .room .go').textContent(), language === 'en' ? 'Watch' : 'Vào xem');
    await clickName(page, language === 'en' ? 'All' : 'Tất cả', page.locator('#filter'));
    assert.equal(await page.locator('#waiting .room').count(), 3);
    assert.match(await page.locator('#waiting .room').nth(1).getAttribute('href'), /r=A%20%26B/);
    await textIncludes(page, '#waiting', 'custom-game');
    await clickName(page, 'custom-game', page.locator('#filter'));
    assert.equal(await page.locator('#waiting .room').count(), 1);
    assert.equal(await page.locator('#playing .empty').count(), 1);
    await page.clock.fastForward(SECOND_MS * 5);
    assert.equal(await page.locator('#waiting .room').count(), 1);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.querySelectorAll('#waiting .room').length === 0);
    assert.equal(await page.locator('#nWait').textContent(), '');
    assert.equal(await page.locator('#nPlay').textContent(), '');
    assert(requests.filter(({ path }) => path === '/api/rooms').length >= 3);
  }, { clock: true, api: (url, _request, requests) => {
    if (url.pathname !== '/api/rooms') return null;
    const number = requests.filter((entry) => entry.path === '/api/rooms').length;
    if (number === 2) return { status: HTTP_UNAVAILABLE, body: '{}' };
    if (number > 2) return { body: '{}' };
    return { body: JSON.stringify({ rooms: [
      { game: 'loto', path: '/loto/', code: 'FULL', status: 'waiting', cap: 2, players: 2, host: 'Host Name', mode: 'Party' },
      { game: 'soi', path: '/soi/', code: 'A &B', status: 'waiting', cap: 12, players: 3 },
      { game: 'custom-game', path: '/custom/', code: 'OPEN', status: 'waiting', players: 1 },
      { game: 'loto', path: '/loto/', code: 'PLAY', status: 'playing', cap: 6, players: 3 },
    ] }) };
  } });
}

await scenario('spy online phase privacy, voting, guessing, timeout and results', '/undercover/?r=TEST&lang=en', async (page) => {
  await page.waitForFunction(() => window.coverageTransport.sockets.length > 0);
  const players = [{ id: PLAYER_ID, name: 'Coverage Player' }, { id: 'other', name: 'Other Player' }, { id: 'third', name: 'Third Player' }, { id: 'fourth', name: 'Fourth Player' }, { id: 'fifth', name: 'Fifth Player' }, { id: 'sixth', name: 'Sixth Player' }];
  const seats = players.map((player) => player.id);
  const cfg = { spies: 1, whites: 1, seconds: 5, pack: 'food' };
  await state(page, room(null, { players, seats, cfg, status: 'waiting' }));
  assert.equal(await page.locator('#overlay > .card > button.primary').isDisabled(), false);
  await clickName(page, 'Move Coverage Player down');
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'config', cfg: { order: ['other', PLAYER_ID, 'third', 'fourth', 'fifth', 'sixth'] } });
  await state(page, room(null, { players, seats, cfg: { ...cfg, order: ['other', PLAYER_ID, 'third', 'fourth', 'fifth', 'sixth'] }, status: 'waiting' }));
  await clickName(page, 'Shuffle order');
  assert.deepEqual(new Set(await page.evaluate(() => window.coverageTransport.sent.at(-1).cfg.order)), new Set(seats));
  await page.locator('#room .room-theme').click();
  assert.equal(await page.locator('#room .room-theme').getAttribute('aria-label'), await page.locator('#home .room-theme').getAttribute('aria-label'));
  await clickName(page, 'Game settings');
  await clickName(page, 'Create AI pack', page.locator('dialog[open]'));
  await page.locator('dialog input').fill('Food');
  await clickName(page, 'Create secret pack', page.locator('dialog[open]'));
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await textIncludes(page, 'body', 'AI pack is ready');
  await textIncludes(page, '.settings-summary', 'Food');
  const view = {
    phase: 'deal', deadline: null, round: 1, cfg, speaker: PLAYER_ID, candidates: seats,
    pendingGuess: null, lastEliminated: null, winner: null,
    players: players.map(({ id }) => ({ id, alive: true })),
    card: { word: 'Phở' }, voteCount: 0, voteTotal: players.length, voted: false, tally: null, dealId: 'coverage-deal',
  };
  await state(page, room(view, { players, seats, cfg }));
  await clickName(page, 'Your private card');
  await clickName(page, 'Reveal card', page.locator('.secret-dialog'));
  await textIncludes(page, '.secret-word', 'Phở');
  await clickName(page, 'Hide card', page.locator('.secret-dialog'));
  assert.equal(await page.locator('.secret-word').count(), 0);
  await clickName(page, 'Reveal card', page.locator('.secret-dialog'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.secret-dialog', { state: 'detached' });
  const startClues = await page.getByRole('button', { name: 'Start giving clues', exact: true }).elementHandle();
  await clickName(page, 'Start giving clues');
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'next' });
  const sentBeforeDuplicate = await page.evaluate(() => window.coverageTransport.sent.length);
  assert.equal(await startClues.isDisabled(), true);
  await startClues.dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.coverageTransport.sent.length), sentBeforeDuplicate);
  await clickName(page, 'Your private card');
  await clickName(page, 'Reveal card', page.locator('.secret-dialog'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator('.secret-word').isVisible(), false);
  await page.waitForSelector('.secret-dialog', { state: 'detached' });
  assert.equal(await page.locator('.secret-word').count(), 0);
  await page.clock.fastForward(SECOND_MS * 7);
  await textIncludes(page, 'body', 'No confirmation yet');
  assert.equal(await startClues.evaluate((node) => node.disabled), false);
  assert.equal(await page.getByRole('button', { name: 'Start giving clues', exact: true }).isEnabled(), true);
  await clickName(page, 'Start giving clues');
  assert.equal(await page.evaluate(() => window.coverageTransport.sent.length), sentBeforeDuplicate + 1);
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'next' });
  for (const phase of ['describe', 'discuss', 'countdown', 'tie']) {
    if (phase === 'describe') {
      await clickName(page, 'Your private card');
      await clickName(page, 'Reveal card', page.locator('.secret-dialog'));
    }
    await state(page, room({ ...view, phase, deadline: phase === 'countdown' ? CLOCK_START.getTime() + SECOND_MS * 10 : null, tally: { [PLAYER_ID]: 2, other: 2 }, candidates: [PLAYER_ID, 'other'] }, { players, seats, cfg }));
    assert.equal(await page.locator('.phase-panel h2').textContent(), { describe: 'Give a clue', discuss: 'Discussion', countdown: 'Get ready to vote', tie: 'Tied vote' }[phase]);
    assert.equal(await page.locator('.secret-dialog[open]').count(), 0);
    await clickName(page, 'View vote totals');
    await textIncludes(page, 'dialog[open]', '2 votes');
    await clickName(page, 'Close', page.locator('dialog[open]'));
    if (phase === 'describe') await clickName(page, 'Next speaker');
    if (phase === 'describe') {
      const sent = await page.evaluate(() => window.coverageTransport.sent.length);
      await clickName(page, 'Eliminate directly');
      await clickName(page, 'Other Player', page.locator('dialog[open]'));
      await clickName(page, 'Confirm', page.locator('dialog[open]'));
      assert.equal(await page.evaluate(() => window.coverageTransport.sent.length), sent);
    }
    if (phase === 'discuss') await clickName(page, 'Open voting');
    if (phase === 'tie') await clickName(page, 'Clues done · Vote again');
  }
  await state(page, room({ ...view, phase: 'vote' }, { players, seats, cfg }));
  assert.equal(await page.locator('.vote-progress').textContent(), '0/6 votes');
  assert.equal(await page.locator('.phase-work').getByRole('button', { name: 'Coverage Player', exact: true }).count(), 0);
  await clickName(page, 'Other Player', page.locator('.phase-work'));
  await clickName(page, 'Cancel', page.locator('dialog[open]'));
  await clickName(page, 'Other Player', page.locator('.phase-work'));
  await clickName(page, 'Confirm', page.locator('dialog[open]'));
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'vote', target: 'other' });
  await state(page, room({ ...view, phase: 'vote', voted: true, voteCount: 1 }, { players, seats, cfg }));
  await textIncludes(page, '.phase-work', 'Vote received');
  const eliminated = view.players.map((player) => ({ ...player, alive: player.id !== PLAYER_ID }));
  await state(page, room({ ...view, phase: 'vote', players: eliminated }, { players, seats, cfg }));
  await textIncludes(page, '.phase-work', 'Only living players can vote');
  await textIncludes(page, '.game-sidebar', 'you can still moderate');
  await state(page, room({ ...view, phase: 'guess', pendingGuess: 'other', players: eliminated }, { players, seats, cfg, host: 'other' }));
  await textIncludes(page, '.phase-work', 'Waiting for Mr. White');
  await textIncludes(page, '.game-sidebar', 'Do not give clues or vote');
  await state(page, room({ ...view, phase: 'guess', pendingGuess: PLAYER_ID, card: { white: true }, players: eliminated }, { players, seats, cfg, host: 'other' }));
  await page.locator('.guess-form input').fill('   ');
  await page.locator('.guess-form').dispatchEvent('submit');
  assert.equal(await page.locator('dialog.spy-dialog[open]').count(), 0);
  await page.locator('.guess-form input').fill('Unsent private guess');
  await state(page, room({ ...view, phase: 'guess', pendingGuess: PLAYER_ID, card: { white: true }, players: eliminated, voteCount: 2 }, { players, seats, cfg, host: 'other' }));
  assert.equal(await page.locator('.guess-form input').inputValue(), 'Unsent private guess');
  await page.locator('.guess-form input').fill('pho');
  await page.locator('.guess-form').dispatchEvent('submit');
  await clickName(page, 'Confirm', page.locator('dialog[open]'));
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'guess', text: 'pho' });
  const spectator = { ...view, phase: 'discuss', players: view.players.filter((player) => player.id !== PLAYER_ID), card: null, lastEliminated: 'unknown-player' };
  await state(page, room(spectator, { players, seats: seats.filter((id) => id !== PLAYER_ID), cfg, host: 'other' }));
  await textIncludes(page, '.phase-work', 'You are watching');
  await textIncludes(page, '.host-controls', 'Waiting for the host');
  await textIncludes(page, '.last-out', 'Disconnected player');
  const ending = { ...view, phase: 'ended', winner: PLAYER_ID, reveal: { civilianWord: 'Phở', spyWord: 'Bún', roles: { [PLAYER_ID]: 'white', other: 'spy', third: 'civilian', fourth: 'civilian', fifth: 'civilian', sixth: 'civilian' } } };
  await state(page, room(ending, { players, seats, cfg }));
  await textIncludes(page, '.game-result', 'guessed correctly and wins alone');
  await state(page, room(ending, { players, seats, cfg, status: 'ended', result: { title: ['Kết quả', 'Results'], ranks: [{ id: PLAYER_ID, name: 'Coverage Player', score: 1, won: true }] } }));
  assert.equal(await page.locator('#overlay .results .word-pair').count(), 1);
  await state(page, room(ending, { players, seats, cfg, host: 'other', status: 'ended' }));
  assert.equal(await page.getByRole('button', { name: 'Game settings', exact: true }).count(), 0);
  await state(page, room(view, { players, seats, cfg }));
  await page.locator('#room header > button').first().click();
  await clickName(page, 'Cancel', page.locator('dialog[open]'));
  assert.equal(await page.locator('#room').isVisible(), true);
  await page.locator('#room header > button').first().click();
  await clickName(page, 'Confirm', page.locator('dialog[open]'));
  await page.waitForFunction(() => !document.querySelector('#home').hidden);
  await clickName(page, 'Choose another mode');
  await clickName(page, 'One device each');
  assert.equal(await page.locator('#home').isVisible(), true);
}, { protocol: true, clock: true, api: async (url, _request, _requests, page) => {
  if (url.pathname !== '/api/undercover/ai') return null;
  const pack = { packId: 'aaaaaaaaaaaaaaaa', title: 'Food' };
  await page.evaluate((pack) => {
    const current = window.coverageTransport.state;
    window.coverageTransport.receive({ ...current, cfg: { ...current.cfg, pack: 'ai', aiPackId: pack.packId, aiTopic: pack.title }, now: Date.now() });
  }, pack);
  return { body: JSON.stringify(pack) };
} });

await scenario('tetris clears actual rows and stores difficulty-specific records', '/tetris/?lang=en', async (page) => {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('#ovStart').hidden);
  await page.evaluate(() => {
    const WIDTH = 10;
    const PIECE_WIDTH = 2;
    const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    for (let column = 0; column < WIDTH; column += PIECE_WIDTH) {
      for (let index = 0; index < WIDTH; index++) press('ArrowLeft');
      for (let index = 0; index < column; index++) press('ArrowRight');
      press(' ');
      press('ArrowDown');
    }
  });
  assert.equal(await page.locator('#score').textContent(), '100');
  assert.equal(await page.locator('#best').textContent(), '100');
  assert.equal(await page.evaluate(() => localStorage.getItem('tetris.best.hard')), '100');
  assert.equal(await page.locator('#cells .blk').count(), 4);
}, { clock: true, storage: { 'tetris.level': 'hard' }, init: () => { Math.random = () => 0.5; } });

await scenario('spy local secret ballot tie and runoff reach a real winner', '/undercover/?lang=en', async (page) => {
  await clickName(page, 'Pass one device');
  await clickName(page, 'Start game');
  const cards = [];
  for (const player of ['Player 1', 'Player 2', 'Player 3']) cards.push(await revealLocalCard(page, player));
  for (let index = 0; index < cards.length; index++) await clickName(page, 'Next speaker');
  await clickName(page, 'Open voting');
  await clickName(page, 'Eliminate directly');
  assert.equal(await page.locator('dialog[open]').isVisible(), true);
  await page.clock.fastForward(SECOND_MS * 4);
  await page.waitForSelector('dialog.spy-dialog', { state: 'detached' });
  await textIncludes(page, '.phase-panel', 'Secret ballot');
  for (let index = 0; index < cards.length; index++) {
    await clickName(page, 'Ready to vote');
    if (index === 0) {
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button', { name: 'Ready to vote', exact: true }).isVisible(), true);
      await clickName(page, 'Ready to vote');
    }
    await clickName(page, cards[(index + 1) % cards.length].player, page.locator('.phase-work'));
    await clickName(page, 'Confirm', page.locator('dialog[open]'));
  }
  await textIncludes(page, '.phase-panel', 'Tied vote');
  await clickName(page, 'View vote totals');
  assert.equal(await page.locator('dialog[open] .player-row').count(), 3);
  await clickName(page, 'Close', page.locator('dialog[open]'));
  await clickName(page, 'Clues done · Vote again');
  await page.clock.fastForward(SECOND_MS * 4);
  const spy = cards.find((card) => cards.filter((candidate) => candidate.word === card.word).length === 1);
  assert(spy);
  for (const card of cards) {
    await clickName(page, 'Ready to vote');
    const target = card.player === spy.player ? cards.find((candidate) => candidate.player !== spy.player).player : spy.player;
    await clickName(page, target, page.locator('.phase-work'));
    await clickName(page, 'Confirm', page.locator('dialog[open]'));
  }
  await textIncludes(page, '.game-result', 'Civilian');
  assert.equal(await page.locator('.results .player-row').count(), 3);
}, { clock: true });

await scenario('penalty settings validate restored lists and edit defaults', `${HARNESS_PATH}?lang=en`, async (page) => {
  await page.evaluate(async () => {
    const { penaltyLobby } = await import('/loto/penalty.js');
    const root = document.querySelector('#fixture');
    window.penaltyUpdates = [];
    window.paintPenalty = (cfg, host = true) => {
      root.replaceChildren();
      penaltyLobby(root, { cfg }, host, (next) => { window.penaltyUpdates.push(next); });
    };
    window.paintPenalty({ penalty: 'party' });
  });
  await clickName(page, 'Edit party penalties');
  const editor = page.locator('.party-dlg');
  const count = await editor.locator('.plist li').count();
  await clickName(page, 'Add', editor);
  assert.equal(await editor.locator('.plist li').count(), count);
  await editor.locator('input').fill('Dance');
  await editor.locator('input').press('ArrowLeft');
  assert.equal(await editor.locator('.plist li').count(), count);
  await clickName(page, 'Add', editor);
  assert.equal(await editor.locator('.plist li').count(), count + 1);
  while (await editor.locator('.plist li').count() > 1) await editor.locator('.rm').last().click();
  assert.equal(await editor.locator('.rm').isDisabled(), true);
  await clickName(page, 'Save', editor);
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('loto.party')))).length, 1);
  await page.evaluate(() => window.paintPenalty({ penalty: 'both' }));
  assert.equal(await page.evaluate(() => window.penaltyUpdates.at(-1).party.length), 1);
  await clickName(page, 'Edit party penalties');
  await clickName(page, 'Defaults', page.locator('.party-dlg'));
  assert.equal(await page.evaluate(() => localStorage.getItem('loto.party')), '');
  assert.deepEqual(await page.evaluate(() => window.penaltyUpdates.at(-1)), { party: null });
  await page.evaluate(() => { localStorage.setItem('loto.party', '[]'); window.paintPenalty({ penalty: 'party' }); });
  await clickName(page, 'Edit party penalties');
  await clickName(page, 'Close', page.locator('.party-dlg'));
  await page.evaluate(() => window.paintPenalty({}, false));
  assert.equal(await page.locator('#fixture button:not(:disabled)').count(), 0);
  await page.evaluate(() => window.paintPenalty({ penalty: 'off' }));
  for (const mode of ['Off', 'In game', 'Party', 'Both']) await clickName(page, mode);
  assert.deepEqual(await page.evaluate(() => window.penaltyUpdates.slice(-4).map((change) => change.penalty)), ['off', 'game', 'party', 'both']);
}, { storage: { 'loto.party': '{bad-json' } });

await scenario('spy local AI denial restores setup and valid deal keeps words private', '/undercover/?lang=en', async (page) => {
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
  await clickName(page, 'Read the rules');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await textIncludes(page, QUICK_RULE_SELECTOR, 'Civilians share a word');
  await clickName(page, 'Got it', page.locator('.help-dlg'));
  await clickName(page, 'Pass one device');
  await clickName(page, 'Advanced settings');
  await clickName(page, 'Create AI pack', page.locator('dialog.spy-dialog[open]'));
  await page.locator('dialog.spy-dialog input').fill('Vietnamese dishes');
  await clickName(page, 'Create secret pack', page.locator('dialog.spy-dialog[open]'));
  await page.waitForSelector('dialog.spy-dialog[open]', { state: 'detached' });
  await textIncludes(page, '.config-badges', 'Vietnamese dishes');
  await clickName(page, 'Advanced settings');
  assert.equal(await page.locator('dialog.spy-dialog select').last().inputValue(), 'ai');
  await clickName(page, 'Save settings', page.locator('dialog.spy-dialog[open]'));
  await clickName(page, 'Start game');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
  await textIncludes(page, 'body', 'Deal denied');
  assert.equal(await page.locator('.spy-content').evaluate((node) => node.inert), false);
  assert.equal(await page.getByRole('button', { name: 'Start game', exact: true }).isEnabled(), true);
  await clickName(page, 'Start game');
  await page.getByRole('textbox', { name: 'Your name' }).fill('Player 1');
  await clickName(page, 'View keyword');
  assert(['Phở', 'Bún'].includes(await page.locator('.secret-word').textContent()));
  assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), true);
  await page.locator('[data-help="undercover-guide"]').click();
  assert.equal(await page.locator('.secret-word').count(), 0);
  await clickName(page, 'Got it', page.locator('.help-dlg'));
  await page.getByRole('textbox', { name: 'Your name' }).fill('Player 1');
  await clickName(page, 'View keyword');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.locator('.secret-word').count(), 0);
  await clickName(page, 'Back');
  await clickName(page, 'Confirm', page.locator('dialog.spy-dialog[open]'));
  assert.equal(await page.getByRole('button', { name: 'Pass one device', exact: true }).isVisible(), true);
}, { api: (url, request, requests) => {
  if (url.pathname !== '/api/undercover/ai') return null;
  if (request.postDataJSON().action === 'deal') {
    const attempts = requests.filter(({ body }) => body?.action === 'deal').length;
    return attempts === 1 ? { status: HTTP_DENIED, body: JSON.stringify({ msg: ['Không được chia', 'Deal denied'] }) } : { body: JSON.stringify({ pair: ['Phở', 'Bún'] }) };
  }
  return { body: JSON.stringify({ packId: '12345678-1234-4234-8234-123456789abc', title: 'Vietnamese dishes' }) };
} });

await scenario('audio unlock resumes suspended contexts and respects blocked permission', `${HARNESS_PATH}?lang=en`, async (page) => {
  const result = await page.evaluate(async () => {
    const { createMusic } = await import('/loto/music.js');
    const Context = window.AudioContext;
    class SuspendedContext extends Context {
      constructor() { super(); this.state = 'suspended'; }
    }
    delete window.AudioContext;
    window.webkitAudioContext = SuspendedContext;
    const resumed = createMusic();
    resumed.unlock();
    resumed.start();
    const resumedPlaying = resumed.playing;
    resumed.stop();
    const unopened = createMusic();
    unopened.level = 1;
    if (unopened.level !== 1 || localStorage.getItem('loto.music') !== '1') throw new Error('Unopened music did not persist the selected level');
    class BlockedContext extends Context {
      constructor() { super(); this.state = 'suspended'; }
      resume() { window.audioLedger.resumed++; return Promise.resolve(); }
    }
    window.AudioContext = BlockedContext;
    const blocked = createMusic();
    blocked.start();
    document.querySelector('#fixture').textContent = `Resumed:${resumedPlaying};blocked:${blocked.playing}`;
    return { resumedPlaying, blockedPlaying: blocked.playing, resumed: window.audioLedger.resumed };
  });
  assert.equal(result.resumedPlaying, true);
  assert.equal(result.blockedPlaying, false);
  assert.equal(result.resumed, 2);
  await textIncludes(page, '#fixture', 'Resumed:true;blocked:false');
}, { clock: true, init: installAudioBoundary });

for (const game of ['2048', 'sudoku', 'tetris']) {
  let failPreparation;
  const pendingPreparation = new Promise((resolve) => { failPreparation = resolve; });
  await scenario(`${game} pending history blocks duplicate starts and failure retries`, `/${game}/?lang=en`, async (page, requests) => {
    if (game === 'tetris') await page.keyboard.press('Space');
    await textIncludes(page, '#historyStatus', 'Preparing history');
    const controls = game === '2048' ? ['#btnNew']
      : game === 'sudoku' ? ['#btnNew', '#btnPause', '#btnNote', '#btnHint', '#btnReset'] : ['#ovStart [data-act="start"]', '#ovStart [data-level="hard"]'];
    for (const selector of controls) await page.locator(selector).click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('u');
    if (game === 'sudoku') {
      await page.locator('#grid > div').first().click();
      assert.equal(await page.locator('#grid .sel').count(), 0);
      assert.equal(await page.locator('#ovPause').isVisible(), false);
      assert.equal(await page.locator('#ovReset').isVisible(), false);
      assert.equal(await page.locator('#btnNote').evaluate((node) => node.classList.contains('on')), false);
    }
    if (game === 'tetris') assert.notEqual(await page.evaluate(() => localStorage.getItem('tetris.level')), 'hard');
    await page.clock.fastForward(SECOND_MS);
    assert.equal(requests.filter(({ path }) => path === '/api/me').length, 1);
    failPreparation({ status: HTTP_UNAVAILABLE, body: '{}' });
    await textIncludes(page, '#historyStatus', 'has not started');
    if (game === '2048') {
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#tiles .tile').evaluateAll((nodes) => nodes.every((node) => !node.textContent)), true);
    }
    await clickName(page, 'Retry');
    await page.waitForSelector('#historyStatus .history-message', { state: 'detached' });
    if (game === '2048') assert.equal(await page.locator('#tiles .tile').evaluateAll((nodes) => nodes.filter((node) => node.textContent).length), 2);
    if (game === 'sudoku') assert.equal(await page.locator('#grid .given').count(), 41);
    if (game === 'tetris') assert.equal(await page.locator('#ovStart').isVisible(), false);
    assert.equal(requests.filter(({ path }) => path === '/api/me').length, 2);
  }, { clock: true, api: (url, _request, requests) => url.pathname === '/api/me' && requests.filter(({ path }) => path === '/api/me').length === 1 ? pendingPreparation : null });
}

for (const failure of ['http', 'network']) {
  await scenario(`2048 unavailable leaderboard remains empty (${failure})`, '/2048/?lang=en', async (page, requests) => {
    await page.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 16 && [...document.querySelectorAll('#tiles .tile')].some((node) => node.textContent));
    await page.locator('#btnBoard').click();
    await page.waitForSelector('#side.open #lbEmpty', { state: 'visible' });
    assert.equal(await page.locator('#lbEmpty').isVisible(), true);
    assert.equal(await page.locator('#lb li').count(), 0);
    await textIncludes(page, '#lbEmpty', 'No scores yet. Be the first!');
    assert.equal(requests.filter(({ path }) => path === '/api/board').length, 1);
    for (const key of ['ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight']) await page.keyboard.press(key);
    assert.equal(await page.locator('#btnUndo').isDisabled(), false);
  }, { api: (url) => url.pathname === '/api/board' ? failure === 'http' ? { status: HTTP_UNAVAILABLE, body: '{}' } : { abort: 'failed' } : null });
}

let failSudokuReset;
const pendingSudokuReset = new Promise((resolve) => { failSudokuReset = resolve; });
await scenario('sudoku failed reset preserves board and retry completes reset', '/sudoku/?lang=en', async (page, requests) => {
  await page.waitForSelector('#grid .user');
  await page.locator('#grid .user').first().click();
  await page.keyboard.press('1');
  const filled = await page.locator('#grid').innerText();
  await page.locator('#btnReset').click();
  await page.locator('#btnResetYes').dblclick();
  assert.equal(requests.filter(({ path }) => path === '/api/me').length, 2);
  failSudokuReset({ status: HTTP_UNAVAILABLE, body: '{}' });
  await textIncludes(page, '#historyStatus', 'has not started');
  assert.equal(await page.locator('#grid').innerText(), filled);
  assert.equal(await page.locator('#ovReset').isVisible(), true);
  await clickName(page, 'Retry');
  await page.waitForFunction(() => document.querySelector('#ovReset').hidden);
  assert.equal(await page.locator('#grid .user').evaluateAll((nodes) => nodes.every((node) => !node.textContent)), true);
  await solveSudoku(page);
  const solved = await page.locator('#grid').innerText();
  await page.locator('#btnHint').click();
  assert.equal(await page.locator('#grid').innerText(), solved);
  assert.equal(await page.locator('#hints').textContent(), '3');
}, { api: (url, _request, requests) => url.pathname === '/api/me' && requests.filter(({ path }) => path === '/api/me').length === 2 ? pendingSudokuReset : null });

await scenario('spy AI ignores duplicate submissions and late response after close', `${HARNESS_PATH}?lang=en`, async (page) => {
  await page.evaluate(async () => {
    const { aiPicker } = await import('/undercover/ai.js');
    window.aiRequests = [];
    window.fetch = (_url, options) => {
      window.aiRequests.push(JSON.parse(options.body));
      return new Promise((resolve) => {
        window.completeAi = () => {
          const response = new Response(JSON.stringify({ packId: 'late-pack', title: 'Late pack' }));
          const json = response.json.bind(response);
          response.json = async () => {
            const result = await json();
            window.aiResponseRead = true;
            return result;
          };
          resolve(response);
        };
      });
    };
    aiPicker(() => { document.querySelector('#fixture').textContent = 'Unexpected saved pack'; });
  });
  await page.locator('dialog input').fill('Delayed pack');
  await page.locator('dialog form').dispatchEvent('submit');
  await textIncludes(page, 'dialog [role="status"]', 'AI is preparing');
  await page.locator('dialog form').dispatchEvent('submit');
  assert.equal(await page.evaluate(() => window.aiRequests.length), 1);
  await clickName(page, 'Close', page.locator('dialog[open]'));
  await page.waitForSelector('dialog.spy-dialog', { state: 'detached' });
  await page.evaluate(async () => { window.completeAi(); await Promise.resolve(); });
  await page.waitForFunction(() => window.aiResponseRead);
  assert.equal(await page.locator('#fixture').textContent(), '');
  assert.equal(await page.locator('dialog').count(), 0);
});

for (const language of ['vi', 'en']) {
  await scenario(`loto missing ${language} voice keeps call display active`, `/loto/?r=TEST&lang=${language}`, async (page) => {
    await state(page, room({ cards: null, called: [], marked: [], colors: [], auto: false, best: {} }));
    await page.clock.fastForward(SECOND_MS * 2);
    await state(page, room({ cards: null, called: [12], marked: [], colors: [], auto: false, best: {} }));
    await textIncludes(page, 'body', language === 'vi' ? 'không có giọng tiếng Việt' : 'No English voice');
    assert.equal(await page.locator('.ball').textContent(), '12');
    assert.equal(await page.locator('.count').textContent(), '1/90');
    await page.locator('.music').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('loto.music')), '2');
  }, { clock: true, protocol: true, init: () => Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined }), storage: { 'loto.music': '0', 'loto.voice': language } });
}

await scenario('spy local setup clamps role counts and back restores home', '/undercover/?lang=en', async (page) => {
  assert.equal(await page.getByRole('button', { name: 'Light mode', exact: true }).isVisible(), true);
  await clickName(page, 'Pass one device');
  const players = page.getByRole('combobox', { name: 'Players', exact: true });
  const white = page.getByRole('combobox', { name: 'Mr. White', exact: true });
  await players.selectOption('6');
  await white.selectOption('1');
  await players.selectOption('3');
  assert.equal(await white.inputValue(), '0');
  await clickName(page, 'Advanced settings');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForSelector('dialog.spy-dialog', { state: 'detached' });
  await clickName(page, 'Back');
  assert.equal(await page.getByRole('button', { name: 'Pass one device', exact: true }).isVisible(), true);
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: true }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await page.locator('.secret-word').count(), 0);
  await clickName(page, 'More games');
  await page.waitForURL(new URL('/', BASE).href);
}, { colorScheme: 'dark' });

await scenario('spy seating restores focus across ordered room updates', `${HARNESS_PATH}?lang=en`, async (page) => {
  await page.evaluate(async () => {
    const { seatingRoster } = await import('/undercover/roster.js');
    const root = document.querySelector('#fixture');
    const players = [{ id: 'ada', name: 'Ada' }, { id: 'binh', name: 'Binh' }, { id: 'chi', name: 'Chi' }];
    window.drawSeating = (next, editable = true) => root.replaceChildren(seatingRoster(next, 'ada', editable ? (ordered) => window.drawSeating(ordered) : null, () => 0));
    window.seatingPlayers = players;
    window.drawSeating(players);
  });
  await clickName(page, 'Move Ada down');
  await page.waitForFunction(() => document.activeElement?.closest('[data-player]')?.dataset.player === 'ada');
  assert.equal(await page.locator('.roster-list > li').nth(1).getAttribute('data-player'), 'ada');
  await page.evaluate(() => window.drawSeating(window.seatingPlayers, false));
  await page.waitForFunction(() => document.activeElement?.matches('[data-player="ada"]'));
  assert.equal(await page.locator('.roster-list button').count(), 0);
  await page.evaluate(() => window.drawSeating(window.seatingPlayers.filter((player) => player.id !== 'ada'), false));
  await page.waitForFunction(() => document.activeElement?.classList.contains('roster-list'));
  assert.equal(await page.locator('.roster-list > li').count(), 2);
  await page.evaluate(() => {
    window.drawSeating(window.seatingPlayers);
    document.querySelector('[data-player="ada"] button:not(:disabled)').focus();
    window.drawSeating(window.seatingPlayers);
    window.drawSeating(window.seatingPlayers.filter((player) => player.id !== 'ada'), false);
  });
  assert.equal(await page.locator('.roster-list > li').count(), 2);
  assert.equal(await page.locator('.roster-list button').count(), 0);
});

await scenario('2048 legal high-value merges keep rendering beyond the winning tile', '/2048/?lang=en', async (page) => {
  await page.waitForFunction(() => [...document.querySelectorAll('#tiles .tile')].filter((node) => node.textContent).length === 2);
  const result = await page.evaluate(async () => {
    const { DIRS, emptyCells, slide } = await import('/shared/games/2048/logic.js');
    const TARGET = 4096;
    const MAX_TURNS = 4096;
    const SPAWN_VALUE = 4;
    const KEY_BY_DIRECTION = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
    const SNAKE_ORDER = [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12];
    const EMPTY_WEIGHT = 128;
    const DESCENDING_WEIGHT = 8;
    const readGrid = () => [...document.querySelectorAll('#tiles .tile')].map((node) => Number(node.textContent));
    const value = (grid) => {
      let weighted = 0;
      let descending = 0;
      for (const [rank, index] of SNAKE_ORDER.entries()) {
        weighted += grid[index] * (SNAKE_ORDER.length - rank);
        if (rank) descending += Math.max(0, grid[index] - grid[SNAKE_ORDER[rank - 1]]);
      }
      return weighted + emptyCells(grid).length * EMPTY_WEIGHT - descending * DESCENDING_WEIGHT;
    };
    const outcomes = (grid) => DIRS.flatMap((direction) => {
      const moved = slide(grid, direction);
      if (!moved.moved) return [];
      const free = emptyCells(moved.grid);
      return free.map((index, position) => {
        const next = [...moved.grid];
        next[index] = SPAWN_VALUE;
        return { direction, grid: next, random: position / free.length, gain: moved.gain };
      });
    });
    let score = Number(document.querySelector('#score').textContent);
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const grid = readGrid();
      if (grid.some((tile) => tile >= TARGET)) return { score, turns: turn };
      const candidates = outcomes(grid);
      if (!candidates.length) throw new Error('Legal 2048 planner exhausted the board before the high-value tile');
      let selected = null;
      let best = -Infinity;
      for (const candidate of candidates) {
        const continuation = outcomes(candidate.grid);
        const rank = continuation.length ? Math.max(...continuation.map((next) => value(next.grid))) : -Infinity;
        if (rank > best) { best = rank; selected = candidate; }
      }
      if (!selected) throw new Error('No safe legal 2048 continuation');
      const originalRandom = Math.random;
      const samples = [selected.random, 0];
      Math.random = () => samples.length ? samples.shift() : originalRandom();
      try { window.dispatchEvent(new KeyboardEvent('keydown', { key: KEY_BY_DIRECTION[selected.direction], bubbles: true })); }
      finally { Math.random = originalRandom; }
      score += selected.gain;
      if (JSON.stringify(readGrid()) !== JSON.stringify(selected.grid)) throw new Error('Displayed 2048 move differs from the legal move and chosen spawn');
    }
    throw new Error('Legal 2048 high-value merge budget exhausted');
  });
  assert(result.turns > 0);
  assert.equal(await page.locator('#score').textContent(), String(result.score));
  assert.equal(await page.locator('#tiles .vbig').textContent(), '4096');
  assert.equal(await page.locator('#tiles .vbig').getAttribute('data-len'), '4');
  await page.locator('#btnUndo').click();
  assert.equal(await page.locator('#tiles .vbig').count(), 0);
  assert.equal(await page.locator('#over').isVisible(), false);
}, { init: () => { Math.random = () => 0; } });

await scenario('spy imported replay handles unknown phases and empty private cards', '/undercover/?r=TEST&replay=spy-legacy&lang=en', async (page) => {
  await textIncludes(page, '.rp-tag', 'Replay');
  await page.waitForSelector('.phase-panel');
  assert.equal(await page.locator('.phase-panel > .sub').textContent(), '');
  await clickName(page, 'Your private card');
  await clickName(page, 'Reveal card', page.locator('.secret-dialog'));
  assert.equal(await page.locator('.secret-word').textContent(), '');
  await textIncludes(page, '.secret-card', 'Your secret word');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.secret-dialog', { state: 'detached' });
  await page.locator('.rp-bar input').evaluate((node) => { node.value = node.max; node.dispatchEvent(new Event('input')); });
  await page.clock.runFor(1);
  await page.waitForFunction(() => document.querySelector('.board-stage').hidden);
  await page.locator('#room header > button').first().click();
  await page.waitForURL(new URL('/undercover/', BASE).href);
  assert.equal(await page.getByRole('button', { name: 'Pass one device', exact: true }).isVisible(), true);
}, { clock: true, api: (url) => {
  if (url.pathname !== '/api/replay/spy-legacy') return null;
  const players = [{ id: 'replay', name: 'Archived viewer' }, { id: 'other', name: 'Other player' }, { id: 'third', name: 'Third player' }];
  const cfg = { spies: 1, whites: 0, seconds: 5, pack: 'food' };
  const view = { phase: 'archived-phase', deadline: null, round: 1, cfg, speaker: null, candidates: [], pendingGuess: null, lastEliminated: null, winner: null, players: players.map(({ id }) => ({ id, alive: true })), card: {}, voteCount: 0, voteTotal: 3, voted: false, tally: null, dealId: 'legacy-deal' };
  const initial = room(view, { players, seats: players.map(({ id }) => id), cfg, now: CLOCK_START.getTime() });
  return { body: JSON.stringify({ game: 'undercover', page: '/undercover/', frames: [[0, initial], [SECOND_MS, { ...initial, status: 'lobby', view: null, now: CLOCK_START.getTime() + SECOND_MS }]] }) };
} });

let loadLegacyLotoReplay;
const legacyLotoReplay = new Promise((resolve) => { loadLegacyLotoReplay = resolve; });
await scenario('loto imported replay defaults missing optional card metadata and survives rewind', '/loto/?replay=loto-legacy&lang=en', async (page) => {
  const cards = await page.evaluate(async () => {
    const { newCard } = await import('/shared/games/loto/logic.js');
    return [newCard(), newCard()];
  });
  const recorded = room({ cards, colors: [], called: [12], marked: [], auto: false, best: {} }, { now: CLOCK_START.getTime() + SECOND_MS });
  loadLegacyLotoReplay({ body: JSON.stringify({ game: 'loto', page: '/loto/', frames: [[0, { t: 'notice', text: 'Recorded prelude' }], [SECOND_MS, recorded]] }) });
  await page.waitForSelector('.rp-bar');
  await page.clock.runFor(SECOND_MS * 2);
  await page.waitForSelector('.sheet', { state: 'visible' });
  await textIncludes(page, '.strip', 'red card');
  assert.equal(await page.locator('.ticket').evaluate((node) => node.style.getPropertyValue('--tc')), '#c62828');
  assert.equal(await page.locator('.tabs button').count(), 2);
  assert.deepEqual(await page.locator('.tabs button').evaluateAll((nodes) => nodes.map((node) => node.style.getPropertyValue('--c'))), ['#c62828', '#c62828']);
  assert.equal(await page.locator('.cell:not(:disabled)').count(), 0);
  await textIncludes(page, '.pace-note', 'Host calls by hand');
  await textIncludes(page, '.status', 'Fill a row of 5 to win');
  await page.locator('.rp-bar input').evaluate((node) => { node.value = node.min; node.dispatchEvent(new Event('input')); });
  const ticket = await page.locator('.strip').textContent();
  await pointer(page, '.wrap', -100, 0);
  assert.equal(await page.locator('.strip').textContent(), ticket);
  await page.clock.runFor(1);
  await textIncludes(page, '#overlay', 'Loading replay');
  await page.locator('.rp-bar input').evaluate((node) => { node.value = node.max; node.dispatchEvent(new Event('input')); });
  await page.clock.runFor(1);
  await textIncludes(page, '.strip', 'red card');
  assert.equal(await page.locator('#overlay').isVisible(), false);
}, { clock: true, api: (url) => url.pathname === '/api/replay/loto-legacy' ? legacyLotoReplay : null });

await scenario('werewolf replay rewind tolerates a hide click before the first room frame', '/soi/?replay=soi-prelude&lang=en', async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForSelector('.rp-bar');
  await page.clock.runFor(SECOND_MS * 2);
  await clickName(page, 'Tap to see your role');
  await textIncludes(page, '.role', 'You are the WOLF');
  await page.locator('.rp-bar input').evaluate((node) => { node.value = node.min; node.dispatchEvent(new Event('input')); });
  await clickName(page, 'Hide');
  await page.clock.runFor(1);
  await textIncludes(page, '#overlay', 'Loading replay');
  await page.locator('.rp-bar input').evaluate((node) => { node.value = node.max; node.dispatchEvent(new Event('input')); });
  await page.clock.runFor(1);
  assert.equal(await page.getByRole('button', { name: 'Tap to see your role', exact: true }).isVisible(), true);
  assert.equal(await page.locator('.role.wolf').count(), 0);
  assert.deepEqual(errors, []);
}, { clock: true, api: (url) => url.pathname === '/api/replay/soi-prelude' ? { body: JSON.stringify({
  game: 'soi', page: '/soi/', frames: [[0, { t: 'notice', text: 'Recorded prelude' }], [SECOND_MS, room({ round: 1, role: 'wolf' }, { now: CLOCK_START.getTime() + SECOND_MS })]],
}) } : null });

await scenario('spy local normalized-empty guess is rejected without consuming the valid guess', '/undercover/?lang=en', async (page) => {
  const COMBINING_ACUTE = '\u0301';
  const PLAYER_COUNT = 6;
  await clickName(page, 'Pass one device');
  await page.getByRole('combobox', { name: 'Players', exact: true }).selectOption(String(PLAYER_COUNT));
  await page.getByRole('combobox', { name: 'Mr. White', exact: true }).selectOption('1');
  await clickName(page, 'Start game');
  const cards = [];
  for (const player of ['Ada', 'Binh', 'Chi', 'Dung', 'Eva', 'Fong']) cards.push(await revealLocalCard(page, player));
  const white = cards.find(({ word }) => word === 'No word');
  const civilian = cards.find(({ word }) => cards.filter((card) => card.word === word).length > 1);
  assert(white);
  assert(civilian);
  await clickName(page, 'Eliminate directly');
  await choosePaginated(page, white.player);
  await clickName(page, 'Confirm', page.locator('dialog[open]'));
  await clickName(page, 'Enter your guess');
  const phase = await page.locator('.phase-panel h2').textContent();
  const description = await page.locator('.phase-panel > .sub').textContent();
  await page.locator('.guess-form input').fill(COMBINING_ACUTE);
  await clickName(page, 'Submit your one guess');
  await textIncludes(page, 'dialog[open]', 'You get exactly one guess');
  await clickName(page, 'Confirm', page.locator('dialog[open]'));
  await textIncludes(page, '.ui-toast[data-tone="warning"]', 'The turn changed. Choose an action from the current screen.');
  assert.equal(await page.locator('.phase-panel h2').textContent(), phase);
  assert.equal(await page.locator('.phase-panel > .sub').textContent(), description);
  assert.equal(await page.locator('.guess-form input').inputValue(), COMBINING_ACUTE);
  assert.equal(await page.locator('.game-result').count(), 0);
  await page.locator('.guess-form input').fill(civilian.word);
  await clickName(page, 'Submit your one guess');
  await clickName(page, 'Confirm', page.locator('dialog[open]'));
  await textIncludes(page, '.game-result', `${white.player} guessed correctly and wins alone.`);
  assert.equal(await page.locator('.word-pair dd').first().textContent(), civilian.word);
  assert.equal(await page.locator('.guess-form').count(), 0);
}, { clock: true });

await scenario('loto incomplete server snapshot ignores controls and recovers with the next view', '/loto/?r=TEST&lang=en', async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const card = await page.evaluate(async () => (await import('/shared/games/loto/logic.js')).newCard());
  const view = { cards: [card], colors: [0], called: [], marked: [], auto: false, best: {}, pen: {} };
  await state(page, room(view));
  await textIncludes(page, '.pace', 'Off');
  await page.locator('.pace').click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'pace', s: 3 });
  const ticket = await page.locator('.ticket').innerText();
  const cell = page.locator('.cell:not(.blank)').first();
  const number = Number(await cell.textContent());
  const index = await cell.evaluate((node) => [...node.parentElement.children].indexOf(node));
  await state(page, room(null));
  const sent = await page.evaluate(() => window.coverageTransport.sent.length);
  await page.locator('.pace').click();
  await page.locator('.swatches button').nth(1).click();
  await cell.click();
  assert.equal(await page.evaluate(() => window.coverageTransport.sent.length), sent);
  assert.equal(await page.locator('.ticket').innerText(), ticket);
  assert.equal(await page.locator('.cell.hit').count(), 0);
  await state(page, room(view));
  await page.locator('.swatches button').nth(1).click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'pick', colors: [0, 1] });
  await state(page, room({ ...view, called: [number], pace: 3 }));
  await cell.click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'mark', i: index });
  await state(page, room({ ...view, called: [number], marked: [index], pace: 3 }));
  assert.equal(await cell.evaluate((node) => node.classList.contains('hit')), true);
  await page.locator('.pace').click();
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'g', a: 'pace', s: 5 });
  assert.deepEqual(errors, []);
}, { protocol: true, clock: true, storage: { 'loto.voice': 'off', 'loto.music': '0' } });

await scenario('spy queued setup and ballot controls cannot change a later screen', '/undercover/?lang=en', async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const PLAYER_COUNT = 3;
  await clickName(page, 'Pass one device');
  const staleDeal = await page.getByRole('button', { name: 'Start game', exact: true }).elementHandle();
  await clickName(page, 'Start game');
  const handoff = await page.locator('.handoff').innerText();
  await staleDeal.evaluate((node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  assert.equal(await page.locator('.handoff').innerText(), handoff);
  assert.equal(await page.locator('.setup').count(), 0);
  for (let index = 0; index < PLAYER_COUNT; index++) {
    assert.equal(await page.locator('.handoff h2').textContent(), `Player ${index + 1}`);
    const card = await revealLocalCard(page, `Player ${index + 1}`);
    assert.notEqual(card.word, '');
  }
  for (let index = 0; index < PLAYER_COUNT; index++) await clickName(page, 'Next speaker');
  await clickName(page, 'Open voting');
  await page.clock.fastForward(SECOND_MS * 4);
  const staleReady = await page.getByRole('button', { name: 'Ready to vote', exact: true }).elementHandle();
  await clickName(page, 'Back');
  await clickName(page, 'Confirm', page.locator('dialog[open]'));
  const home = await page.locator('.spy-content').innerText();
  await staleReady.evaluate((node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  assert.equal(await page.locator('.spy-content').innerText(), home);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.spy-content').innerText(), home);
  assert.equal(await page.locator('.phase-work').count(), 0);
  await clickName(page, 'Pass one device');
  await clickName(page, 'Start game');
  await textIncludes(page, '.handoff h2', 'Player 1');
  await page.getByRole('textbox', { name: 'Your name' }).fill('Player 1');
  await clickName(page, 'View keyword');
  assert.notEqual(await page.locator('.secret-word').textContent(), '');
  assert.deepEqual(errors, []);
}, { clock: true });

let finishNavigatedAi;
const navigatedAiResponse = new Promise((resolve) => { finishNavigatedAi = resolve; });
await scenario('spy pending AI response preserves home after a queued back action', '/undercover/?lang=en', async (page) => {
  const title = 'Late kitchen pack';
  await clickName(page, 'Pass one device');
  const queuedBack = await page.getByRole('button', { name: 'Back', exact: true }).elementHandle();
  await clickName(page, 'Advanced settings');
  await clickName(page, 'Create AI pack', page.locator('dialog[open]'));
  await page.locator('dialog input').fill(title);
  const pending = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/undercover/ai');
  await clickName(page, 'Create secret pack', page.locator('dialog[open]'));
  await pending;
  await textIncludes(page, 'dialog [role="status"]', 'AI is preparing');
  await queuedBack.evaluate((node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.getByRole('button', { name: 'Pass one device', exact: true }).waitFor({ state: 'visible' });
  finishNavigatedAi({ body: JSON.stringify({ packId: '12345678-1234-4234-8234-123456789abc', title }) });
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'Pass one device', exact: true }).isVisible(), true);
  assert.equal(await page.locator('.setup').count(), 0);
  await clickName(page, 'Pass one device');
  await textIncludes(page, '.config-badges', title);
  await clickName(page, 'Start game');
  await page.getByRole('textbox', { name: 'Your name' }).fill('Player 1');
  await clickName(page, 'View keyword');
  assert(['Phở', 'Bún'].includes(await page.locator('.secret-word').textContent()));
}, { api: (url, request) => {
  if (url.pathname !== '/api/undercover/ai') return null;
  return request.postDataJSON().action === 'deal' ? { body: JSON.stringify({ pair: ['Phở', 'Bún'] }) } : navigatedAiResponse;
} });

await scenario('spy queued online reorder respects host loss and game start', '/undercover/?r=TEST&lang=en', async (page) => {
  const players = [{ id: PLAYER_ID, name: 'Coverage Player' }, { id: 'other', name: 'Other Player' }, { id: 'third', name: 'Third Player' }];
  const seats = players.map(({ id }) => id);
  const cfg = { spies: 1, whites: 0, seconds: 5, pack: 'food' };
  const waiting = room(null, { players, seats, cfg, status: 'waiting' });
  await state(page, waiting);
  const staleHostReorder = await page.getByRole('button', { name: 'Move Coverage Player down', exact: true }).elementHandle();
  await state(page, { ...waiting, host: 'other' });
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((node) => node.ariaLabel === 'Move Coverage Player down'));
  const sentBeforeHostLoss = await page.evaluate(() => window.coverageTransport.sent.length);
  await staleHostReorder.evaluate((node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  assert.equal(await page.evaluate(() => window.coverageTransport.sent.length), sentBeforeHostLoss);
  await state(page, waiting);
  const stalePlayingReorder = await page.getByRole('button', { name: 'Move Coverage Player down', exact: true }).elementHandle();
  const view = { phase: 'deal', deadline: null, round: 1, cfg, speaker: PLAYER_ID, candidates: seats, pendingGuess: null, lastEliminated: null, winner: null, players: seats.map((id) => ({ id, alive: true })), card: { word: 'Phở' }, voteCount: 0, voteTotal: seats.length, voted: false, tally: null, dealId: 'queued-order-deal' };
  await state(page, room(view, { players, seats, cfg }));
  await page.waitForSelector('.phase-panel');
  const board = await page.locator('.phase-panel').innerText();
  const sentBeforePlaying = await page.evaluate(() => window.coverageTransport.sent.length);
  await stalePlayingReorder.evaluate((node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  assert.equal(await page.evaluate(() => window.coverageTransport.sent.length), sentBeforePlaying);
  assert.equal(await page.locator('.phase-panel').innerText(), board);
  await state(page, waiting);
  await clickName(page, 'Move Coverage Player down');
  assert.deepEqual(await page.evaluate(() => window.coverageTransport.sent.at(-1)), { t: 'config', cfg: { order: ['other', PLAYER_ID, 'third'] } });
}, { protocol: true, clock: true });

await browser.close();
assert.equal(failures.length, 0, failures.map(({ name, error }) => `${name}: ${error.message}`).join('\n'));
console.log(`Solo/social coverage: ${passed} scenarios passed`);

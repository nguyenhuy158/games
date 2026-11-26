import assert from 'node:assert/strict';
import { findChromium } from '@huyab/e2e';
import { chromium } from 'playwright-core';
import { saveCoverage } from './coverage.mjs';
import { createGame as createSnake } from '../shared/games/nokia/snake/logic.js';
import { createSim as createBounce } from '../shared/games/nokia/bounce/logic.js';

const BASE = new URL(process.env.E2E_BASE_URL || 'http://127.0.0.1:8789');
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
assert(LOOPBACK_HOSTS.has(BASE.hostname) && HTTP_PROTOCOLS.has(BASE.protocol), 'Nokia fixtures require a loopback HTTP origin');
const PLAYER = 'nokia-gap-player';
const OTHER = 'nokia-gap-other';
const TIME = 1_800_000_000_000;
const WAIT_MS = 15_000;
const FRAME_MS = 32;
const FIXTURE_PATH = '/nokia-gap-fixture';
const REPLAY_ID = 'nokia-gap-replay';
const PALETTE = { background: [199, 240, 216, 255], ink: [67, 82, 61, 255] };
const PLAYERS = [{ id: PLAYER, name: 'Ada', online: true }, { id: OTHER, name: 'Lin', online: true }];
const state = (extra = {}) => ({ t: 'state', now: TIME, status: 'playing', host: PLAYER, players: structuredClone(PLAYERS), seats: [PLAYER, OTHER], cfg: {}, result: null, ...extra });
const browser = await chromium.launch({ executablePath: findChromium() });
let completed = 0;

async function scenario(game, name, run, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, serviceWorkers: 'block', hasTouch: true });
  const errors = [];
  await context.addInitScript(({ player, game }) => {
    localStorage.setItem('pk.id', player);
    localStorage.setItem('pk.name', 'Ada');
    localStorage.setItem('lang', 'en');
    localStorage.setItem('sound', '1');
    localStorage.setItem(`help.seen.${game}`, '1');
    window.nokiaFixture = { sent: [], sockets: [], beeps: [] };
    class FixtureSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 3;
      constructor(url) {
        super();
        this.url = String(url);
        this.readyState = FixtureSocket.CONNECTING;
        window.nokiaFixture.sockets.push(this);
        queueMicrotask(() => {
          if (this.readyState !== FixtureSocket.CONNECTING) return;
          this.readyState = FixtureSocket.OPEN;
          this.onopen?.(new Event('open'));
        });
      }
      send(value) {
        if (value === 'ping') {
          queueMicrotask(() => this.onmessage?.(new MessageEvent('message', { data: 'pong' })));
        } else window.nokiaFixture.sent.push(JSON.parse(value));
      }
      close(code = 1000) {
        this.readyState = FixtureSocket.CLOSED;
        const event = new CloseEvent('close', { code });
        this.onclose?.(event);
        this.dispatchEvent(event);
      }
    }
    window.WebSocket = FixtureSocket;
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      createOscillator() {
        const oscillator = super.createOscillator();
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (...args) => {
          window.nokiaFixture.beeps.push({ frequency: oscillator.frequency.value, type: oscillator.type });
          return start(...args);
        };
        return oscillator;
      }
    };
  }, { player: PLAYER, game });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE.origin) return route.abort();
    if (url.pathname === FIXTURE_PATH) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Nokia contract fixture</title></head><body></body></html>' });
    if (url.pathname === `/api/replay/${REPLAY_ID}`) return route.fulfill({ json: options.replay });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { user: null, rooms: [] } });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT_MS);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: TIME });
  await page.clock.pauseAt(TIME);
  try {
    const path = options.fixture ? FIXTURE_PATH : `/nokia/${game}/`;
    await page.goto(new URL(`${path}${options.replay ? `?replay=${REPLAY_ID}` : ''}`, BASE).href);
    if (!options.fixture) await page.waitForFunction(() => !!window.nk);
    await run(page);
    assert.deepEqual(errors, [], 'Nokia scenarios must not hide browser exceptions');
    completed += 1;
    console.log(`PASS Nokia gap: ${name}`);
  } finally {
    await saveCoverage(page);
    await context.close();
  }
}

async function join(page) {
  await page.locator('#home .code').fill('TEST');
  await page.locator('#home .code').press('Enter');
  await page.waitForFunction(() => window.nokiaFixture.sockets.at(-1)?.readyState === 1);
}

async function feed(page, message) {
  await page.evaluate((value) => {
    const socket = window.nokiaFixture.sockets.at(-1);
    socket.onmessage(new MessageEvent('message', { data: JSON.stringify(value) }));
  }, message);
  await page.clock.runFor(FRAME_MS);
}

async function image(page) {
  return page.locator('.screen canvas').evaluate((canvas) => canvas.toDataURL());
}

async function pixel(page, x, y) {
  return page.locator('.screen canvas').evaluate((canvas, point) => [...canvas.getContext('2d').getImageData(...point, 1, 1).data], [x, y]);
}

async function seek(page, time) {
  await page.locator('.rp-bar input').fill(String(time));
  await page.locator('.rp-bar input').dispatchEvent('input');
  await page.clock.runFor(FRAME_MS);
}

async function mountContract(page) {
  await page.evaluate(async () => {
    const { nokiaApp } = await import('/nokia/room.js');
    nokiaApp({
      game: 'nokia-gap-contract', title: 'Nokia contract', sub: 'Public room controls',
      help: { en: { goal: 'Exercise public room controls', play: [] } },
      mount(stage, app) {
        const output = document.createElement('output');
        output.id = 'contractInitial';
        output.textContent = JSON.stringify({ now: app.now(), pov: app.pov, color: app.colorOf('unseated') });
        stage.append(output);
      },
    });
  });
}

try {
  await scenario('nokia-gap-contract', 'LCD default keyboard gate and disabled pointer input', async (page) => {
    await page.evaluate(async () => {
      const { bindKeys } = await import('/nokia/lcd.js');
      const pad = document.createElement('div');
      pad.id = 'defaultPad';
      const output = document.createElement('output');
      output.id = 'keyOutput';
      document.body.append(pad, output);
      bindKeys(pad, (key, down) => { output.textContent += `${key}:${down};`; });
    });
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#keyOutput').textContent(), 'up:true;up:false;');
    await page.locator('#defaultPad [data-k=up]').dispatchEvent('pointercancel');
    assert.equal(await page.locator('#keyOutput').textContent(), 'up:true;up:false;');
    await page.evaluate(async () => {
      const { bindKeys } = await import('/nokia/lcd.js');
      const pad = document.createElement('div');
      pad.id = 'disabledPad';
      document.body.append(pad);
      bindKeys(pad, (key, down) => { document.querySelector('#keyOutput').textContent += `${key}:${down};`; }, () => false);
    });
    await page.locator('#disabledPad [data-k=left]').click();
    assert.equal(await page.locator('#disabledPad [data-k=left]').getAttribute('class'), '');
    assert.equal(await page.locator('#keyOutput').textContent(), 'up:true;up:false;left:false;');
  }, { fixture: true });

  await scenario('nokia-gap-contract', 'public Nokia room optional hooks and default beep', async (page) => {
    await mountContract(page);
    const initial = JSON.parse(await page.locator('#contractInitial').textContent());
    assert.equal(initial.now, TIME);
    assert.equal(initial.pov, PLAYER);
    assert.equal(initial.color, '#5cc8ff');
    await join(page);
    await feed(page, state({ status: 'lobby', players: [PLAYERS[0]], seats: [PLAYER], view: null }));
    assert.equal(await page.locator('#overlay .sub').textContent(), '1 in the room. ');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.nokiaFixture.sent), [{ t: 'start' }]);
    await page.evaluate(() => window.nk.beep());
    assert.deepEqual(await page.evaluate(() => window.nokiaFixture.beeps), [{ frequency: 880, type: 'square' }]);
  }, { fixture: true });

  await scenario('nokia-gap-contract', 'replay clock advances between actual delivered frames without seats', async (page) => {
    await mountContract(page);
    const initial = JSON.parse(await page.locator('#contractInitial').textContent());
    assert.deepEqual(initial, { now: 0, pov: 'replay', color: '#5cc8ff' });
    await page.locator('.rp-bar').waitFor();
    assert.equal(await page.evaluate(() => window.nk.pov), 'replay');
    await page.clock.runFor(160);
    const clock = await page.evaluate(() => window.nk.now());
    assert(clock > TIME + 1000 && clock < TIME + 2000, 'Recorded clock interpolates at its observed playback rate');
    assert.equal(await page.evaluate(() => window.nokiaFixture.sockets.length), 0);
  }, { fixture: true, replay: { page: FIXTURE_PATH, frames: [[0, state({ seats: [], players: [], view: null })], [100, state({ now: TIME + 1000, seats: [], players: [], view: null })], [1000, state({ now: TIME + 2000, seats: [], players: [], view: null })]] } });

  await scenario('snake', 'legacy snake configuration and missing optional events preserve input', async (page) => {
    await join(page);
    await feed(page, state({ status: 'lobby', cfg: { speed: 1, walls: true }, view: null }));
    assert.equal(await page.getByRole('button', { name: 'Shared arena', exact: true }).getAttribute('class'), 'on');
    assert.equal(await page.getByRole('button', { name: 'None', exact: true }).getAttribute('class'), 'on');
    const view = createSnake([PLAYER], { walls: true, maze: 0 }, () => 0.3);
    view.step = 1;
    delete view.events;
    await feed(page, state({ seats: [PLAYER], players: [PLAYERS[0]], view }));
    const [headX, headY] = view.snakes[0].body[0];
    const eye = { up: [1, 0], down: [1, 2], left: [0, 1], right: [2, 1] }[view.snakes[0].dir];
    assert.deepEqual(await pixel(page, 1 + headX * 3 + eye[0], 8 + headY * 3 + eye[1]), PALETTE.background);
    const legacy = structuredClone(view);
    legacy.step += 1;
    delete legacy.snakes[0].dir;
    await feed(page, state({ seats: [PLAYER], players: [PLAYERS[0]], view: legacy }));
    assert.deepEqual(await pixel(page, 1 + headX * 3 + eye[0], 8 + headY * 3 + eye[1]), PALETTE.ink);
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await page.evaluate(() => window.nokiaFixture.sent.at(-1)), { t: 'g', d: 'right' });
  });

  await scenario('logic', 'solved code state renders success and plays the success tone', async (page) => {
    await join(page);
    const view = { mine: { guesses: [], solved: false }, others: { [PLAYER]: { n: 0 } }, endsAt: TIME + 30000 };
    await feed(page, state({ view }));
    const before = await image(page);
    await feed(page, state({ view: { ...view, mine: { guesses: [{ guess: [0, 1, 2, 3], exact: 4, near: 0 }], solved: true }, others: { [PLAYER]: { n: 1, solved: true } } } }));
    assert.match(await page.locator('#players').textContent(), /done 1/);
    assert.notEqual(await image(page), before);
    assert((await page.evaluate(() => window.nokiaFixture.beeps)).some((tone) => tone.frequency === 1800));
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.nokiaFixture.sent), []);
  });

  await scenario('space-impact', 'lobby controls cannot send gameplay and held direction predicts ship motion', async (page) => {
    await join(page);
    await feed(page, state({ status: 'lobby', view: null }));
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await page.evaluate(() => window.nokiaFixture.sent), []);
    const view = { ships: [{ id: PLAYER, x: 4, y: 14, lives: 3, invul: 0 }], score: 50, level: 1, t: 1, enemies: [], bullets: [], shots: [], items: [], boss: null, phase: 'wave' };
    await feed(page, state({ view }));
    const before = await image(page);
    await page.keyboard.down('ArrowRight');
    await page.clock.runFor(120);
    assert.notEqual(await image(page), before);
    await page.keyboard.up('ArrowRight');
    assert((await page.evaluate(() => window.nokiaFixture.sent)).some((message) => message.keys?.right === true));
    await feed(page, state({ now: TIME + 100, view: { ...view, t: 2, events: ['future-event'], phase: 'boss', boss: { x: 75, y: 10, hp: 5, max: 10 } } }));
    assert.deepEqual(await pixel(page, 32, 24), PALETTE.ink);
    assert((await page.evaluate(() => window.nokiaFixture.beeps)).some((tone) => tone.frequency === 700 && tone.type === 'sawtooth'));
    await feed(page, state({ now: TIME + 200, view: { ...view, t: 3, phase: 'boss', boss: { x: 75, y: 10, hp: 5, max: 10 } } }));
    assert.deepEqual(await pixel(page, 32, 24), PALETTE.background);
  });

  for (const game of ['bounce', 'rapid-roll']) {
    await scenario(game, `${game} programmatic canvas input is safe before simulation starts`, async (page) => {
      await join(page);
      await feed(page, state({ status: 'lobby', cfg: { level: 0 }, view: null }));
      const before = await image(page);
      await page.keyboard.press('ArrowDown');
      await page.locator('.screen canvas').dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 0, clientY: 0 });
      await page.clock.runFor(FRAME_MS);
      assert.equal(await image(page), before);
      assert.deepEqual(await page.evaluate(() => window.nokiaFixture.sent), []);
      assert.equal(await page.evaluate(() => window.nk.room.status), 'lobby');
      assert.equal(await page.evaluate(() => window.nk.room.view), null);
      assert.equal(await page.locator('#overlay').isVisible(), true);
      if (game === 'bounce') {
        await feed(page, state({ status: 'ended', cfg: { level: 0 }, view: { runners: { [PLAYER]: { done: true, finished: false, score: 0 } } } }));
        assert.match(await page.locator('#players').textContent(), /out/);
      }
    });
  }

  const initialBall = createBounce(0);
  const bounceView = { seed: 42, level: 0, startAt: TIME, runners: { [PLAYER]: { at: [initialBall.x, initialBall.y], score: 1, done: false, finished: false } } };
  const pairView = { cards: Array(24).fill(-1), owner: Array(24).fill(null), open: [], score: {}, turn: OTHER, moves: 0 };
  for (const [game, explicit, sparse] of [
    ['bounce', state({ now: TIME + 1000, view: bounceView }), state({ now: TIME + 1000, view: { ...bounceView, runners: {} } })],
    ['pairs', state({ players: [PLAYERS[0], { ...PLAYERS[1], name: '' }], view: pairView }), state({ players: [PLAYERS[0]], view: pairView })],
  ]) {
    await scenario(game, `${game} imported replay omissions render established defaults`, async (page) => {
      await page.locator('.rp-bar').waitFor();
      await page.locator('.rp-bar button').first().click();
      await seek(page, 0);
      const expected = await image(page);
      await seek(page, 1000);
      assert.equal(await image(page), expected);
      assert.equal(await page.evaluate(() => window.nokiaFixture.sockets.length), 0);
      assert.deepEqual(await page.evaluate(() => window.nokiaFixture.sent), []);
    }, { replay: { page: `/nokia/${game}/`, frames: [[0, explicit], [1000, sparse]] } });
  }
  console.log(`Nokia gap coverage: ${completed} scenarios completed`);
} finally {
  await browser.close();
}

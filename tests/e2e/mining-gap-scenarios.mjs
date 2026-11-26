import assert from 'node:assert/strict';
import { createWorld, snapOf } from '../../shared/games/dao-vang/logic.js';

export async function runMiningGapScenarios({ scenario, feed, state, text, visible, outgoing, REPLAY_RECORDS, ME, OTHER, TIME }) {
  const PROFILE = { user: null, resultOwner: 'guest:mining-boundary', rooms: [] };
  const FRAME_MS = 32;
  await scenario('dao-vang', async (page) => {
    assert.equal(await page.evaluate(() => {
      window.dv.solo.hud();
      return window.dv.solo.view();
    }), null);
    await page.evaluate(() => window.dv.net.send({ t: 'shoot' }));
    assert.deepEqual(await outgoing(page), []);
    await page.getByPlaceholder('ROOM CODE', { exact: true }).press('ArrowLeft');
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await page.waitForFunction(() => window.dv.solo.screen === 'play');
    await page.clock.runFor(FRAME_MS);
    await page.locator('#btnSound').click();
    await page.locator('#game').click();
    assert.equal(await page.evaluate(() => window.dv.solo.me().mode), 'out');
    await page.locator('#btnSound').click();
    await page.locator('#btnMenu').click();
    const resume = await page.getByRole('button', { name: 'Resume', exact: true }).elementHandle();
    await resume.click();
    await resume.evaluate((node) => node.dispatchEvent(new MouseEvent('click')));
    assert.equal(await page.evaluate(() => window.dv.solo.screen), 'play');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await text(page, '#overlay', /Paused/);
    await page.evaluate(() => window.dv.solo.end());
    assert.equal(await page.evaluate(() => window.dv.solo.screen), 'pause');
    await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
    await visible(page, '#hud', false);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.getByRole('button', { name: 'Play solo', exact: true }).isVisible(), true);
  }, '', { prepare: async (page) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Audio unavailable', 'NotAllowedError'));
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        if (!String(args[0]).endsWith('assets/atlas.webp')) return response;
        const headers = new Headers(response.headers);
        headers.delete('content-length');
        return new Response(response.body, { status: response.status, headers });
      };
    });
  } });

  let pendingProfile;
  let profileReads = 0;
  let profileRequested;
  const requestedProfile = new Promise((resolve) => { profileRequested = resolve; });
  await scenario('dao-vang', async (page) => {
    const play = page.getByRole('button', { name: 'Play solo', exact: true });
    await play.click();
    await play.click();
    await page.waitForFunction(() => window.dv.solo.starting);
    await requestedProfile;
    assert.equal(profileReads, 1);
    await page.getByRole('button', { name: 'Create a multiplayer room', exact: true }).click();
    await pendingProfile.fulfill({ json: PROFILE });
    await page.waitForFunction(() => !window.dv.solo.starting);
    assert.equal(await page.evaluate(() => window.dv.solo.world), null);
    await text(page, '#overlay', /Connecting/);
  }, '', { prepare: async (page) => {
    await page.route('**/api/me', (route) => { profileReads++; pendingProfile = route; profileRequested(); });
  } });

  let attempts = 0;
  await scenario('dao-vang', async (page) => {
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForFunction(() => window.dv.solo.screen === 'play');
    assert.equal(attempts, 2);
    await visible(page, '#overlay', false);
  }, '', { prepare: async (page) => {
    await page.route('**/api/me', (route) => route.fulfill(++attempts === 1 ? { status: 503, json: { error: 'temporary profile outage' } } : { json: PROFILE }));
  } });

  await scenario('dao-vang', async (page) => {
    await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
    const world = createWorld(1, [{ id: ME }, { id: OTHER }]);
    const players = [{ id: ME, name: 'Ada', online: true, money: 0 }, { id: OTHER, name: 'Lin', online: false, money: 7 }];
    await feed(page, { t: 'world', world }, state({ status: 'playing', mode: 'versus', level: 1, versusLevels: 5, team: 0, target: 650, players }), snapOf(world));
    await page.clock.runFor(FRAME_MS);
    await text(page, '#scores .off', /Lin.*7/);
    await outgoing(page);
    await page.evaluate(() => window.dv.net.pause());
    assert.deepEqual(await outgoing(page), []);
    await feed(page, { t: 'error', msg: 'Room closed' });
    await text(page, '.ui-toast', /Room closed/);
    assert.equal(await page.getByRole('button', { name: 'Play solo', exact: true }).isVisible(), true);
  }, '?r=TEST');

  await scenario('dao-vang', async (page) => {
    await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
    await feed(page, state({ status: 'shop', mode: 'versus', level: 2, players: [], shopEndsAt: TIME }));
    await text(page, '#overlay', /Your wallet: \$0/);
    await feed(page, state({ status: 'ended', mode: 'solo', players: [], result: { level: 2, team: 17, target: 100, ranking: [], rp: null } }));
    await text(page, '#overlay', /Earned \$17 \/ needed \$100/);
    await feed(page, state({ status: 'ended', mode: 'coop', players: [], result: { level: 2, team: 17, target: 100, ranking: [], rp: null } }));
    await text(page, '#overlay', /Team fund \$17 \/ needed \$100/);
    await feed(page, state({ status: 'ended', mode: 'versus', players: [], result: { level: 2, team: 17, target: 0, ranking: [], rp: null } }));
    assert.doesNotMatch(await page.locator('#overlay').innerText(), /needed|Team fund/);
    const previousOverlay = await page.locator('#overlay').innerText();
    await feed(page, state({ status: 'paused', mode: 'versus', players: [] }));
    assert.equal(await page.locator('#overlay').innerText(), previousOverlay);
  }, '?r=TEST');

  for (const players of [[], [{ id: ME, name: 'Ada', money: 25, online: true }]]) {
    const replayId = `mining-shop-${players.length}`;
    REPLAY_RECORDS.set(replayId, { game: 'dao-vang', page: '/dao-vang/', frames: [
      [0, { t: 'me', id: ME }],
      [0, state({ status: 'shop', mode: 'solo', level: 2, players, shopEndsAt: 0 })],
    ] });
    await scenario('dao-vang', async (page) => {
      await text(page, '#overlay', players.length ? /Ada's wallet: \$25/ : /'s wallet: \$0/);
      assert.equal(await page.getByRole('button', { name: 'Ready up', exact: true }).count(), 0);
      assert.equal(await page.locator('.shop-items').getAttribute('inert'), '');
      await page.evaluate(() => window.dv.net.send({ t: 'buy', key: 'dynamite' }));
      assert.deepEqual(await outgoing(page), []);
      assert.equal(await page.evaluate(() => window.boardFixture.sockets.length), 0);
    }, `?replay=${replayId}`);
  }

  await scenario('dao-vang', async (page) => {
    await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
    await page.evaluate(() => window.boardFixture.sockets.at(-1).close(4000));
    await text(page, '.ui-toast', /another tab\/device/);
    assert.equal(await page.getByRole('button', { name: 'Play solo', exact: true }).isVisible(), true);
  }, '?r=TEST');

  let replayWrites = 0;
  let historyWrites = 0;
  await scenario('dao-vang', async (page) => {
    await page.getByRole('button', { name: 'Play solo', exact: true }).click();
    await page.waitForFunction(() => window.dv.solo.screen === 'play');
    await page.evaluate(() => window.dv.solo.end());
    await page.waitForFunction(() => document.querySelector('#historyStatus')?.textContent.includes('This game is saved'));
    assert.equal(replayWrites, 1);
    assert.equal(historyWrites, 1);
    await page.evaluate(() => { window.dv.solo.begin(); window.dv.solo.end(); window.dv.solo.end(); });
    await text(page, '#overlay', /Time's up!/);
    await page.clock.runFor(FRAME_MS);
    assert.equal(replayWrites, 1);
    assert.equal(historyWrites, 1);
  }, '', { prepare: async (page) => {
    await page.route('**/api/replay', (route) => { replayWrites++; return route.fulfill({ json: { id: 'mining-public-round' } }); });
    await page.route('**/api/me/history', (route) => { historyWrites++; return route.fulfill({ json: { ok: true } }); });
  } });

  await scenario('dao-vang', async (page) => {
    await page.waitForFunction(() => window.boardFixture.sockets.at(-1)?.readyState === WebSocket.OPEN);
    const world = createWorld(1, [{ id: OTHER }]);
    world.items.push({ id: 'unknown-asset', type: 'toString', x: 100, y: 150 });
    await feed(page, { t: 'world', world }, state({ status: 'playing', mode: 'versus', level: 1, players: [{ id: OTHER, name: 'Lin', online: true, money: 4 }], versusLevels: 5 }), snapOf(world));
    const next = snapOf(world);
    next.wt = 1;
    next.miners.push({ id: 'new-player', a: 0, l: 30, m: 'out', h: null, d: 0 });
    await feed(page, next);
    await page.clock.runFor(FRAME_MS);
    await text(page, '#scores', /Lin.*4/);
    assert.equal(await page.evaluate(() => window.dv.net.view().miners.find((m) => m.id === 'new-player').name), '');
    next.wt = 2;
    next.miners[0].m = 'in';
    next.miners[0].h = 'goldTiny';
    await feed(page, next);
    await page.clock.runFor(FRAME_MS);
    assert.equal(await page.locator('#panel .tile-badge').first().isVisible(), true);
  }, '?r=TEST');
}

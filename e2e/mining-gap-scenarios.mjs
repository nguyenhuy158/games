import assert from 'node:assert/strict';
import { createWorld, snapOf } from '../shared/games/dao-vang/logic.js';

export async function runMiningGapScenarios({ scenario, feed, state, text, visible, outgoing, REPLAY_RECORDS, ME, OTHER, TIME }) {
  const PROFILE = { user: null, resultOwner: 'guest:mining-boundary', rooms: [] };
  const FRAME_MS = 32;
  await scenario('dao-vang', async (page) => {
    assert.equal(await page.evaluate(() => {
      window.dv.solo.hud();
      return window.dv.solo.view();
    }), null);
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
      window.dv.solo.pause();
      window.dv.solo.pause();
    });
    await text(page, '#overlay', /Paused/);
    await page.evaluate(() => window.dv.solo.end());
    assert.equal(await page.evaluate(() => window.dv.solo.screen), 'pause');
    await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
    await visible(page, '#hud', false);
    assert.equal(await page.getByRole('button', { name: 'Play solo', exact: true }).isVisible(), true);
  }, '', { prepare: async (page) => {
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Audio unavailable', 'NotAllowedError'));
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
      assert.equal(await page.evaluate(() => window.boardFixture.sockets.length), 0);
    }, `?replay=${replayId}`);
  }
}

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (process.argv[1] && pathToFileURL(process.argv[1]).href !== import.meta.url) {
  execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { stdio: 'inherit' });
} else {
  await import('./scripts/node-ts-hooks.mjs');
  register(`data:text/javascript,${encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject{constructor(c,e){this.ctx=c;this.env=e}}', shortCircuit: true };
      return next(spec, ctx);
    }`)}`);
  const { DatabaseSync } = await import('node:sqlite');
  const { Top } = await import('./backend/src/adapters/top.js');
  const { http } = await import('./backend/src/adapters/http.js');
  const { gameRoom } = await import('./backend/src/adapters/game-room.js');
  const { default: bauCua } = await import('./backend/src/application/games/bau-cua.js');
  const { GUEST_COOKIE, GUEST_HEADER, USER_HEADER, GAME_HEADER, ROOM_HEADER, withGuestCookie } = await import('./backend/src/adapters/guest.js');
  const db = new DatabaseSync(':memory:');
  const sql = { exec(query, ...params) {
    const statement = db.prepare(query);
    let rows = [];
    if (/^\s*SELECT/i.test(query)) rows = statement.all(...params).map((row) => ({ ...row }));
    else statement.run(...params);
    return { toArray: () => rows };
  } };
  const transactionSync = (fn) => {
    db.exec('BEGIN');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const top = new Top({ storage: { sql, transactionSync } }, {});
  const origin = 'https://games.huyab.cfd';
  const namespace = { idFromName: (name) => name, get: () => top };
  let forwarded;
  const roomNamespace = { idFromName: (name) => name, get: () => ({ fetch: async (request) => { forwarded = request; return new Response('connected'); } }) };
  const env = {
    TOP: namespace, ROOM: roomNamespace, DICE: roomNamespace,
    ASSETS: { fetch: async (request) => new Response('asset', { headers: {
      'Content-Type': new URL(request.url).pathname.endsWith('.js') ? 'text/javascript' : 'text/html',
      'Cache-Control': 'public, max-age=3600',
    } }) },
  };
  const request = (path, options = {}) => http.fetch(new Request(`${origin}${path}`, options), env);
  const cookiePair = (response) => response.headers.get('Set-Cookie')?.split(';')[0];
  const guestId = (cookie) => cookie.slice(cookie.indexOf('=') + 1);
  const post = (path, body, cookie, headers = {}) => request(path, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: JSON.stringify(body),
  });
  const profile = async (cookie) => (await request('/api/me', { headers: { Cookie: cookie } })).json();
  const history = async (cookie) => (await request('/api/me/history', { headers: { Cookie: cookie } })).json();
  const play = (guest, overrides = {}) => ({ guest, game: 'pikachu', mode: 'coop', score: 125, level: 3, won: true, detail: '{"rank":1,"rp":"abcdefghijkl"}', eventId: crypto.randomUUID(), ...overrides });
  const count = () => db.prepare('SELECT COUNT(*) AS count FROM plays').get().count;

  const document = await request('/pikachu/');
  const cookieA = cookiePair(document);
  assert.match(cookieA, new RegExp(`^${GUEST_COOKIE}=[a-f0-9]{64}$`));
  assert.match(document.headers.get('Set-Cookie'), /Path=\/;.*HttpOnly; Secure; SameSite=Lax/);
  assert.ok(!document.headers.get('Set-Cookie').includes('Domain='));
  assert.equal(document.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await request('/pikachu/game.js')).headers.get('Set-Cookie'), null);
  assert.equal((await request('/api/fun')).headers.get('Set-Cookie'), null);
  assert.equal((await request('/api/fun')).headers.get('Cache-Control'), 'public, max-age=60');
  const bootstrap = await request('/api/me', { headers: { 'X-User': '{"sub":"victim"}', 'X-Guest': 'public-device-id' } });
  const cookieB = cookiePair(bootstrap);
  assert.notEqual(cookieA, cookieB);
  assert.deepEqual((await bootstrap.json()).stats, []);
  assert.equal((await profile(cookieA)).user, null);
  const guestA = guestId(cookieA), guestB = guestId(cookieB);
  const resultA = play(guestA), resultB = play(guestB, { score: 900 });
  top.addPlays([resultA, resultB]);
  assert.equal((await profile(cookieA)).guestPending, true);
  assert.equal((await history(cookieA))[0].score, 125);
  assert.equal((await history(cookieB))[0].score, 900);
  assert.deepEqual(top.fun('all').find((entry) => entry.key === 'plays').rows, []);

  const ownerA = (await profile(cookieA)).resultOwner;
  const solo = { game: '2048', score: 200, level: 1, won: false, eventId: crypto.randomUUID(), resultOwner: ownerA };
  const beforeSolo = count();
  assert.equal((await post('/api/me/history', solo, cookieA)).status, 200);
  assert.equal((await post('/api/me/history', { ...solo, score: 999 }, cookieA)).status, 200);
  assert.equal(count(), beforeSolo + 1);
  assert.equal((await history(cookieA)).find((row) => row.game === '2048').score, 200);
  assert.equal((await post('/api/me/history', solo, cookieB)).status, 409);
  for (const invalid of [
    { game: 'pikachu' }, { score: '200' }, { score: -1 }, { score: 3_932_101 }, { score: 1.5 },
    { level: 0 }, { level: 2 }, { won: 1 }, { eventId: 'public-device-id' }, { rp: 'bad' },
    { sub: 'victim' }, { guest: guestB }, { game: null }, { game: { toString: 1 } },
  ]) {
    assert.equal((await post('/api/me/history', { ...solo, eventId: crypto.randomUUID(), ...invalid }, cookieA)).status, 400, JSON.stringify(invalid));
  }
  for (const valid of [
    { game: 'dao-vang', score: 10_000_000, level: 999, won: false },
    { game: '2048', score: 3_932_100, level: 1, won: true },
    { game: 'tetris', score: 10_000_000, level: 3, won: false },
    { game: 'sudoku', score: 604_800, level: 3, won: true },
  ]) assert.equal((await post('/api/me/history', { ...solo, ...valid, eventId: crypto.randomUUID() }, cookieA)).status, 200);
  for (const invalid of [
    { game: 'dao-vang', score: 10_000_001, level: 1, won: false },
    { game: 'dao-vang', score: 0, level: 1000, won: false },
    { game: 'dao-vang', score: 0, level: 1, won: true },
    { game: 'tetris', score: 10_000_001, level: 1, won: false },
    { game: 'tetris', score: 0, level: 4, won: false },
    { game: 'tetris', score: 0, level: 1, won: true },
    { game: 'sudoku', score: 604_801, level: 1, won: true },
    { game: 'sudoku', score: 0, level: 4, won: true },
    { game: 'sudoku', score: 0, level: 1, won: false },
  ]) assert.equal((await post('/api/me/history', { ...solo, ...invalid, eventId: crypto.randomUUID() }, cookieA)).status, 400);
  assert.equal((await post('/api/me/history', solo, cookieA, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/me/history', solo, cookieA, { Origin: '' })).status, 403);
  assert.equal((await post('/api/me/history', solo, cookieA, { 'Sec-Fetch-Site': 'same-site' })).status, 403);
  assert.equal((await post('/api/me/history', solo, cookieA, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/me/history', solo, cookieA, { 'Content-Type': 'application/json-evil' })).status, 415);
  assert.equal((await post('/api/me/history', { ...solo, padding: 'x'.repeat(3000) }, cookieA)).status, 413);
  assert.equal((await request('/api/me/history?before=NaN', { headers: { Cookie: cookieA } })).status, 400);
  assert.equal((await request('/api/me/history', { method: 'DELETE', headers: { Cookie: cookieA } })).status, 405);
  const unauthClaim = await post('/api/me/history/claim', {}, cookieA);
  assert.equal(unauthClaim.status, 401);
  assert.equal(unauthClaim.headers.get('Set-Cookie'), null);

  const algorithm = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const key = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', key.publicKey);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(String(url).endsWith('/.well-known/jwks.json'));
    return Response.json({ keys: [jwk] });
  };
  const b64 = (value) => Buffer.from(value).toString('base64url');
  const authCookie = async (sub, guestCookie) => {
    const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64(JSON.stringify({ sub, email: `${sub}@example.test`, name: `User ${sub}`, iss: 'https://auth.huyab.cfd', exp: Math.floor(Date.now() / 1000) + 3600 }));
    const signature = await crypto.subtle.sign(algorithm.name, key.privateKey, new TextEncoder().encode(`${header}.${payload}`));
    return `${guestCookie}; huyab_sso=${header}.${payload}.${b64(signature)}`;
  };
  try {
    const accountA = await authCookie('account-a', cookieA);
    const accountB = await authCookie('account-b', cookieA);
    top.addPlays([play(null, { sub: 'account-a', name: 'Existing', score: 77 })]);
    const preservedGuest = await history(cookieA);
    const preservedAccount = await history(accountA);
    assert.equal((await profile(accountA)).guestPending, true);
    assert.equal((await post('/api/me/history', solo, accountA)).status, 409);
    const rejectedCsrf = await post('/api/me/history/claim', {}, accountA, { Origin: 'https://evil.example' });
    assert.equal(rejectedCsrf.status, 403);
    assert.equal(rejectedCsrf.headers.get('Set-Cookie'), null);
    assert.equal((await post('/api/me/history/claim', { guest: guestB }, accountA)).status, 400);
    const claim = await post('/api/me/history/claim', {}, accountA);
    assert.equal(claim.status, 200);
    assert.deepEqual(await claim.json(), { ok: true, claimed: preservedGuest.length });
    const rotated = cookiePair(claim);
    assert.ok(rotated);
    assert.notEqual(rotated, cookieA);
    const claimedHistory = await history(await authCookie('account-a', rotated));
    assert.equal(claimedHistory.length, preservedAccount.length + preservedGuest.length);
    for (const row of preservedGuest) assert.ok(claimedHistory.some((entry) => JSON.stringify(entry) === JSON.stringify(row)), 'claim preserves complete result and timestamp');
    assert.deepEqual(await history(cookieA), []);
    assert.deepEqual(await history(rotated), []);
    assert.equal((await profile(cookieA)).guestPending, false);
    assert.deepEqual((await profile(cookieA)).stats, []);
    assert.deepEqual(await history(await authCookie('account-b', rotated)), []);
    const duplicateClaim = await post('/api/me/history/claim', {}, accountA);
    assert.deepEqual(await duplicateClaim.json(), { ok: true, claimed: 0 });
    const steal = await post('/api/me/history/claim', {}, accountB);
    assert.equal(steal.status, 409);
    assert.equal(steal.headers.get('Set-Cookie'), null);
    const beforeLate = count();
    top.addPlays([resultA]);
    assert.equal(count(), beforeLate);
    top.addPlays([play(guestA, { score: 456 })]);
    assert.equal((await history(accountA)).length, claimedHistory.length + 1);
    assert.deepEqual(await history(accountB), []);
    assert.deepEqual(await history(cookieA), []);
    assert.equal((await history(cookieB)).length, 1);
    const fun = Object.fromEntries(top.fun('all').map((entry) => [entry.key, entry.rows]));
    assert.deepEqual(fun.plays, [{ name: 'User account-a', value: 3 }]);
    const loggedInOwner = (await profile(accountA)).resultOwner;
    const accountResult = { ...solo, eventId: crypto.randomUUID(), resultOwner: loggedInOwner };
    assert.equal((await post('/api/me/history', accountResult, accountB)).status, 409);
    assert.equal((await post('/api/me/history', accountResult, await authCookie('account-a', rotated))).status, 409);
    assert.equal((await post('/api/me/history', accountResult, accountA)).status, 200);
    const beforeDuplicate = count();
    assert.equal((await post('/api/me/history', accountResult, accountA)).status, 200);
    assert.equal(count(), beforeDuplicate);
  } finally { globalThis.fetch = realFetch; }

  await request('/api/room/ABCD?id=public-device-id', { headers: {
    Upgrade: 'websocket', Cookie: cookieB, 'X-User': '{"sub":"victim"}', 'X-Guest': guestA, 'X-Game': 'wrong', 'X-Room': 'EVIL',
  } });
  assert.equal(forwarded.headers.get(USER_HEADER), null);
  assert.equal(forwarded.headers.get(GUEST_HEADER), guestB);
  assert.equal(forwarded.headers.get(GAME_HEADER), 'pikachu');
  assert.equal(forwarded.headers.get(ROOM_HEADER), 'ABCD');
  const blockedSocket = await request('/api/room/ABCD?id=public-device-id', { headers: { Upgrade: 'websocket', Cookie: cookieA, Origin: 'https://evil.example' } });
  assert.equal(blockedSocket.status, 403);
  const firstSocket = await request('/api/room/ABCD?id=public-device-id', { headers: { Upgrade: 'websocket' } });
  assert.equal(guestId(cookiePair(firstSocket)), forwarded.headers.get(GUEST_HEADER));
  const NativeResponse = globalThis.Response;
  class UpgradeResponse extends NativeResponse {
    constructor(body, init) {
      super(body, { ...init, status: init.status === 101 ? 200 : init.status });
      Object.defineProperty(this, 'status', { value: init.status });
      this.webSocket = init.webSocket;
    }
  }
  try {
    globalThis.Response = UpgradeResponse;
    const socket = {};
    const upgraded = withGuestCookie(new UpgradeResponse(null, { status: 101, webSocket: socket }), guestB);
    assert.equal(upgraded.status, 101);
    assert.equal(upgraded.webSocket, socket);
    assert.ok(upgraded.headers.get('Set-Cookie'));
  } finally { globalThis.Response = NativeResponse; }

  const Room = gameRoom({ test: { max: 2, cfg: {}, replay: false, start() {}, view() { return {}; } }, 'bau-cua': bauCua });
  const room = Object.create(Room.prototype);
  room.env = { TOP: { idFromName: (name) => name, get: () => ({ addPlays: async (rows) => top.addPlays(rows) }) } };
  room.s = {
    game: 'test', status: 'playing', seats: ['public-a', 'public-b'], order: ['public-a', 'public-b'],
    players: { 'public-a': { guest: guestA, name: 'Guest' }, 'public-b': { guest: guestB, name: 'Other' } },
    owners: { 'public-a': { guest: guestA }, 'public-b': { guest: guestB } },
  };
  room.s.players['public-a'].user = { sub: 'account-b', name: 'Changed after start' };
  const beforeRoom = top.history('account-a').length;
  room.finish({ ranks: [{ id: 'public-a', score: 12, won: true }, { id: 'public-b', score: 5, won: false }], mode: 'multi' });
  await room.drain();
  assert.equal(top.history('account-a').length, beforeRoom + 1);
  assert.equal(top.history('account-b').length, 0);
  assert.equal(top.historyFor(null, guestB).length, 2);
  room.finish({ ranks: [{ id: 'public-a', score: 999, won: true }] });
  await room.drain();
  assert.equal(top.history('account-a').length, beforeRoom + 1);
  const recorded = [];
  bauCua.leave({
    g: { purse: { p: { net: -75, rounds: 4, coins: 925, rescues: 0 } }, phase: 'bet', bets: {}, mode: 'house' },
    players: { p: { guest: guestB } }, record: (rows) => recorded.push(...rows), online: () => new Set(), order: () => ['p'],
  }, 'p');
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], { id: 'p', game: 'bau-cua', mode: 'house', score: -75, level: 4, won: false, detail: '{"coins":925,"rescues":0}' });
  room.s.owners.p = { guest: guestB };
  room.record(recorded);
  await room.drain();
  assert.equal(top.historyFor(null, guestB).find((row) => row.game === 'bau-cua').score, -75);
  db.close();
  console.log('guest history ok');
}

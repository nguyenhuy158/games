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
  const { Top, REPLAY_ID, REPLAY_MAX, BOARDS } = await import('./backend/src/adapters/top.js');
  const { http } = await import('./backend/src/adapters/http.js');
  const { gameRoom } = await import('./backend/src/adapters/game-room.js');
  const { SpyAi } = await import('./backend/src/adapters/spy-ai.js');
  const { generateRoomAi } = await import('./backend/src/adapters/room-ai.js');
  const { routeAi } = await import('./backend/src/adapters/spy-ai-http.js');
  const { userFrom } = await import('./backend/src/adapters/sso.js');
  const { GUEST_COOKIE, GUEST_HEADER, USER_HEADER, GAME_HEADER, ROOM_HEADER } = await import('./backend/src/adapters/guest.js');
  const { AI_ACTION, AI_ERROR, AI_LIMIT, AI_PATH, AI_GAME } = await import('./backend/src/application/spy-ai.js');
  const { uniqueName, otherNames } = await import('./backend/src/domain/names.js');

  const ORIGIN = 'https://games.huyab.cfd';
  const OWNER = 'a'.repeat(64);
  const OTHER = 'b'.repeat(64);
  const GUEST = `${GUEST_COOKIE}=${OWNER}`;
  const HOST = 'host-device';
  const PEER = 'peer-device';
  const WATCHER = 'watch-device';
  const ROOM_CODE = 'ABCD';
  const ROOM_GAME = 'turn';
  const REPLAY = 'abcdefghijkL';
  const DAY_MS = 86_400_000;
  const START_TIME = Date.now();
  let now = START_TIME;
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  Date.now = () => now;

  function durableStorage(initial = {}) {
    const values = new Map(Object.entries(structuredClone(initial)));
    return {
      values, writes: [], alarm: null,
      async get(key) { return structuredClone(values.get(key)); },
      async put(key, value) { values.set(key, structuredClone(value)); this.writes.push(key); },
      async delete(key) { return values.delete(key); },
      async deleteAll() { values.clear(); this.alarm = null; },
      async setAlarm(at) { this.alarm = at; },
      async deleteAlarm() { this.alarm = null; },
    };
  }

  function topFixture() {
    const db = new DatabaseSync(':memory:');
    const sql = { exec(query, ...params) {
      const statement = db.prepare(query);
      let rows = [];
      if (/^\s*SELECT/i.test(query)) rows = statement.all(...params).map((row) => ({ ...row }));
      else statement.run(...params);
      return { toArray: () => rows };
    } };
    const transactionSync = (work) => {
      db.exec('BEGIN');
      try { const value = work(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    };
    const top = new Top({ storage: { sql, transactionSync } }, {});
    const recorder = Object.fromEntries(['add', 'addPlays', 'roomUpsert', 'roomDrop', 'saveReplay'].map((method) => [method, async (...args) => top[method](...args)]));
    return { db, top, recorder };
  }

  const namespace = (instance) => ({ idFromName: (name) => name, get: () => instance });
  const play = (overrides = {}) => ({ sub: 'account', name: 'An', game: 'pikachu', mode: 'coop', score: 50, level: 2, won: true, eventId: crypto.randomUUID(), ...overrides });
  const PAIRS = [
    ['Bánh mì', 'Bánh bao'], ['Cà phê', 'Trà xanh'], ['Cơm rang', 'Cơm tấm'], ['Phở bò', 'Bún bò'],
    ['Cam', 'Quýt'], ['Xoài', 'Ổi'], ['Mít', 'Sầu riêng'], ['Sữa chua', 'Kem'],
    ['Nước mía', 'Nước dừa'], ['Cá hồi', 'Cá thu'], ['Tôm', 'Cua'], ['Kẹo', 'Sô cô la'],
  ];
  const TOPICS = ['Ẩm thực Việt', 'Động vật', 'Du lịch', 'Đồ dùng', 'Thể thao'];
  const provider = { async run(_model, input) {
    return { response: input.max_tokens === AI_LIMIT.TOPIC_TOKENS ? { topics: TOPICS } : { pairs: PAIRS } };
  } };
  const aiFixture = async (ai = provider, storage = durableStorage()) => {
    const ctx = { storage, blockConcurrencyWhile(work) { this.ready = work(); } };
    const instance = new SpyAi(ctx, { AI: ai });
    await ctx.ready;
    return { instance, storage };
  };

  try {
    assert.equal(uniqueName('An', ['An', 'An 2', 'An 3']), 'An 4');
    const longName = 'abcdefghijklmnopqrst';
    assert.equal(uniqueName(longName, [longName, 'abcdefghijklmnopqr 2']), 'abcdefghijklmnopqr 3');
    assert.deepEqual(otherNames({ a: { id: 'a', name: 'An' }, b: { id: 'b', name: 'Bình' } }, 'a'), ['Bình']);
    assert.equal(uniqueName('Lan', []), 'Lan');

    {
      const { top, db } = topFixture();
      try {
        top.addPlays([play({ sub: null, guest: null })]);
        assert.deepEqual(top.history('account'), []);
        const duplicate = play();
        top.addPlays([duplicate, { ...duplicate, score: 999 }]);
        assert.equal(top.history('account').length, 1);
        assert.equal(top.history('account')[0].score, 50);
        assert.throws(() => top.addPlays([play({ sub: 'rolled-back' }), play({ game: null })]), /NOT NULL/);
        assert.deepEqual(top.history('rolled-back'), []);
        top.addPlays([play({ sub: 'anonymous', name: undefined, eventId: undefined, won: false })]);
        assert.ok(top.fun('all').find((category) => category.key === 'plays').rows.some((row) => row.name === 'Ẩn danh'));
        const cached = top.history('account');
        assert.equal(top.history('account'), cached);
        now += 2_001;
        assert.notEqual(top.history('account'), cached);
        const evicted = top.history('account');
        for (let index = 0; index < 130; index++) top.history(`cache-user-${index}`);
        assert.notEqual(top.history('account'), evicted);
        const row = { key: 'turn:ABCD', game: 'turn', code: 'ABCD', path: '/turn/', players: 1, cap: 2, status: 'waiting', host: 'An' };
        top.roomUpsert(row);
        assert.equal(top.rooms()[0].mode, null);
        top.roomUpsert({ ...row, players: 2, status: 'playing', mode: 'duel', host: 'Bình' });
        assert.equal(top.rooms().length, 1);
        assert.equal(top.rooms()[0].host, 'Bình');
        assert.equal(top.rooms()[0].mode, 'duel');
        top.roomUpsert({ ...row, key: 'turn:EFGH', code: 'EFGH' });
        assert.equal(top.rooms()[0].key, 'turn:EFGH');
        top.roomDrop('turn:EFGH');
        now += 90_001;
        assert.deepEqual(top.rooms(), []);
        top.saveReplay({ id: REPLAY, game: 'turn', page: '/turn/', frames: [[0, { t: 'state', score: 2 }]] });
        assert.equal(top.replayPage(REPLAY), '/turn/');
        assert.deepEqual(top.replay(REPLAY).frames, [[0, { t: 'state', score: 2 }]]);
        top.saveReplay({ id: REPLAY, game: 'turn', page: '/turn/', frames: [[1, { t: 'state', score: 3 }]] });
        assert.equal(top.replay(REPLAY).frames[0][1].score, 3);
        now += 31 * DAY_MS;
        top.saveReplay({ id: 'mnopqrstuvWX', game: 'turn', page: '/turn/', frames: [] });
        assert.equal(top.replay(REPLAY), null);
        assert.equal(top.replayPage(REPLAY), null);
        top.add([
          { mode: 'coop', size: 0, names: 'An', score: 20, level: 2, cleared: true },
          { mode: 'coop', size: 0, names: 'Bình', score: 30, level: 1, cleared: false },
        ]);
        assert.deepEqual(top.list('coop', 0).map((row) => [row.names, row.cleared]), [['Bình', 0], ['An', 1]]);
        assert.deepEqual(top.list('race', 0), []);
      } finally { db.close(); now = START_TIME; }
    }

    const algorithm = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
    const key = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', key.publicKey);
    globalThis.fetch = async (url) => {
      assert.ok(String(url).endsWith('/.well-known/jwks.json'));
      return Response.json({ keys: [jwk] });
    };
    const b64 = (value) => Buffer.from(value).toString('base64url');
    const authCookie = async (overrides = {}) => {
      const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const payload = b64(JSON.stringify({ sub: 'account', email: 'account@example.test', iss: 'https://auth.huyab.cfd', exp: Math.floor(now / 1000) + 3600, ...overrides }));
      const signature = await crypto.subtle.sign(algorithm.name, key.privateKey, new TextEncoder().encode(`${header}.${payload}`));
      return `${GUEST}; huyab_sso=${header}.${payload}.${b64(signature)}`;
    };
    const auth = await authCookie({ name: 'An' });
    assert.deepEqual(await userFrom(new Request(ORIGIN, { headers: { Cookie: await authCookie({ email: 'fallback@example.test', picture: 'https://example.test/avatar.png' }) } })), { sub: 'account', name: 'fallback@example.test', picture: 'https://example.test/avatar.png' });
    assert.equal((await userFrom(new Request(ORIGIN, { headers: { Cookie: await authCookie() } }))).name, 'account@example.test');
    assert.equal(await userFrom(new Request(ORIGIN, { headers: { Cookie: await authCookie({ email: undefined }) } })), null);
    assert.equal(await userFrom(new Request(ORIGIN, { headers: { Cookie: await authCookie({ email: '' }) } })), null);
    assert.equal((await userFrom(new Request(ORIGIN, { headers: { Cookie: await authCookie({ name: 'x'.repeat(50) }) } }))).name.length, 40);
    assert.equal(await userFrom(new Request(ORIGIN, { headers: { Authorization: `Bearer ${auth.split('huyab_sso=')[1]}` } })), null);

    {
      const { top, db } = topFixture();
      const forwarded = [];
      const roomNamespace = { idFromName: (name) => name, get: (name) => ({ async fetch(request) {
        forwarded.push({ name, request });
        return new Response('connected');
      } }) };
      const { instance: ai } = await aiFixture();
      const env = { TOP: namespace(top), ROOM: roomNamespace, CARO: roomNamespace, SHIPS: roomNamespace, DICE: roomNamespace, MINES: roomNamespace, MINER: roomNamespace, NOKIA: roomNamespace, SPY_AI: namespace(ai), ASSETS: { async fetch() { return new Response('<title>Games</title>', { headers: { 'Content-Type': 'text/html' } }); } } };
      const request = (path, options = {}) => http.fetch(new Request(ORIGIN + path, options), env);
      const post = (path, body, cookie = GUEST, headers = {}) => request(path, { method: 'POST', headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
      const rawPost = (path, body, cookie = GUEST, headers = {}) => request(path, { method: 'POST', headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body }) });
      try {
        for (const path of ['/api/me', '/api/me/history/claim']) assert.equal((await request(path, { method: 'PUT' })).status, 405);
        for (const text of [undefined, 'not json', 'null', '[]', '42']) assert.equal((await rawPost('/api/me/history', text)).status, 400);
        const streamFailure = new ReadableStream({ start(controller) { controller.error(new Error('connection lost')); } });
        assert.equal((await request('/api/me/history', { method: 'POST', headers: { Origin: ORIGIN, Cookie: GUEST, 'Content-Type': 'application/json' }, body: streamFailure, duplex: 'half' })).status, 400);
        assert.equal((await rawPost('/api/me/history', '{}', GUEST, { 'Content-Type': '' })).status, 415);
        for (const before of ['0', '-1', '1.5', 'bad']) assert.equal((await request(`/api/me/history?before=${before}`, { headers: { Cookie: GUEST } })).status, 400);
        assert.deepEqual(await (await request('/api/me/history?before=1', { headers: { Cookie: GUEST } })).json(), []);
        const profile = await (await request('/api/me', { headers: { Cookie: GUEST } })).json();
        const result = { game: '2048', score: 20, level: 1, won: false, eventId: crypto.randomUUID(), resultOwner: profile.resultOwner, rp: REPLAY };
        assert.equal((await post('/api/me/history', result, GUEST, { 'Sec-Fetch-Site': 'same-origin' })).status, 200);
        assert.equal(JSON.parse(top.historyFor(null, OWNER)[0].detail).rp, REPLAY);
        for (const overrides of [{ level: '1' }, { eventId: null }, { resultOwner: null }, { rp: 42 }]) assert.equal((await post('/api/me/history', { ...result, ...overrides })).status, 400);
        assert.equal((await request(AI_PATH)).status, 405);
        assert.equal((await rawPost(AI_PATH, '{}', GUEST, { 'Content-Type': 'text/plain' })).status, 415);
        const topicResponse = await post(AI_PATH, { action: AI_ACTION.TOPICS });
        assert.deepEqual((await topicResponse.json()).topics, TOPICS);
        assert.equal(topicResponse.headers.get('Cache-Control'), 'private, no-store');
        assert.deepEqual(await (await request('/api/version')).json(), { id: null, at: null });
        env.CF_VERSION = { id: 'deployment-id', timestamp: '2026-11-26T00:00:00Z' };
        assert.deepEqual(await (await request('/api/version')).json(), { id: env.CF_VERSION.id, at: env.CF_VERSION.timestamp });
        assert.equal((await request('/api/version')).headers.get('Cache-Control'), 'no-store');
        assert.equal((await (await request('/api/fun?period=week')).json()).length, 13);
        assert.deepEqual((await (await request('/api/rooms')).json()).rooms, []);
        assert.equal((await request('/api/top?mode=bad&size=0')).status, 400);
        assert.equal((await request('/api/top?mode=coop&size=99')).status, 400);
        assert.deepEqual(await (await request('/api/top?mode=coop&size=0')).json(), []);
        assert.equal((await request('/api/board?game=constructor')).status, 400);
        assert.equal((await rawPost('/api/board?game=2048', '{}', GUEST, { 'Content-Type': '' })).status, 415);
        assert.equal((await rawPost('/api/board?game=2048', '{')).status, 400);
        for (const body of [null, {}, { name: 42, score: 1 }, { name: ' ', score: 1 }, { name: 'An', score: -1 }, { name: 'An', score: 0.5 }, { name: 'An', score: BOARDS[2048] + 1 }]) assert.equal((await post('/api/board?game=2048', body)).status, 400);
        assert.equal((await post('/api/board?game=2048', { name: '  An  ', score: '42' })).status, 200);
        assert.equal((await (await request('/api/board?game=2048')).json())[0].name, 'An');
        assert.equal((await post('/api/replay', {})).status, 401);
        assert.equal((await rawPost('/api/replay', '{}', auth, { 'Content-Type': '' })).status, 415);
        assert.equal((await rawPost('/api/replay', 'x'.repeat(REPLAY_MAX + 1), auth)).status, 413);
        assert.equal((await rawPost('/api/replay', '{', auth)).status, 400);
        for (const body of [null, {}, { game: 'turn', page: 42, frames: [] }, { game: 'turn', page: 'https://evil.example', frames: [] }, { game: 'turn', page: '/turn/', frames: {} }]) assert.equal((await post('/api/replay', body, auth)).status, 400);
        const replayResponse = await post('/api/replay', { game: 'turn', page: '/turn/', frames: [[0, { t: 'state', score: 12 }]] }, auth);
        const { id } = await replayResponse.json();
        assert.match(id, REPLAY_ID);
        const replay = await request(`/api/replay/${id}`);
        assert.equal(replay.headers.get('Cache-Control'), 'public, max-age=86400');
        assert.equal((await replay.json()).frames[0][1].score, 12);
        assert.equal((await request(`/replay/${id}/`)).headers.get('Location'), `${ORIGIN}/turn/?replay=${id}`);
        assert.equal((await request(`/replay/${REPLAY}`)).status, 404);
        assert.equal((await request(`/api/replay/${REPLAY}`)).status, 404);
        assert.equal((await request('/api/replay/invalid')).status, 404);
        assert.equal((await request(`/api/replay/${id}`, { method: 'PUT' })).status, 404);
        assert.equal((await request('/api/replay')).status, 404);
        assert.equal((await request('/api/unknown')).status, 404);
        assert.equal((await request('/api/room/ABCD')).status, 404);
        assert.equal((await request('/api/nk/snake/room/ABCD')).status, 404);
        const paths = [
          ['/api/room/ABCD', 'pikachu', 'ABCD'], ['/api/cc/room/ABCD', 'caro', 'ABCD'],
          ['/api/c4/room/ABCD', 'c4', 'c4:ABCD'], ['/api/bt/room/ABCD', 'ban-tau', 'ABCD'],
          ['/api/bc/room/ABCD', 'bau-cua', 'ABCD'], ['/api/ms/room/ABCD', 'do-min', 'ABCD'],
          ['/api/dv/room/ABCD', 'dao-vang', 'ABCD'], ['/api/nk/snake/room/ABCD', 'snake', 'snake:ABCD'],
        ];
        for (const [path, game, name] of paths) {
          const response = await request(path, { headers: { Upgrade: 'websocket', Origin: ORIGIN, Cookie: auth, [USER_HEADER]: '{"sub":"forged"}', [GUEST_HEADER]: OTHER, [GAME_HEADER]: 'forged', [ROOM_HEADER]: 'EVIL' } });
          assert.equal(response.status, 200);
          const sent = forwarded.at(-1);
          assert.equal(sent.name, name);
          assert.equal(sent.request.headers.get(GAME_HEADER), game);
          assert.equal(sent.request.headers.get(ROOM_HEADER), ROOM_CODE);
          assert.equal(sent.request.headers.get(GUEST_HEADER), OWNER);
          assert.deepEqual(JSON.parse(sent.request.headers.get(USER_HEADER)), { sub: 'account', name: 'An' });
        }
        const count = forwarded.length;
        assert.equal((await request('/api/room/ABCD', { headers: { Upgrade: 'websocket', Origin: 'https://evil.example', Cookie: GUEST } })).status, 403);
        assert.equal(forwarded.length, count);
        assert.equal((await request('/turn/', { headers: { Cookie: GUEST } })).headers.get('Set-Cookie'), null);
      } finally { db.close(); }
    }

    {
      const { instance, storage } = await aiFixture();
      assert.deepEqual((await instance.topics(OWNER)).topics, TOPICS);
      const offline = await instance.generate(OWNER, 'Ẩm thực');
      assert.equal(offline.count, PAIRS.length);
      const dealt = await instance.deal(OWNER, offline.packId);
      assert.ok(PAIRS.some((pair) => JSON.stringify(pair) === JSON.stringify(dealt.pair)));
      const resumed = (await aiFixture(provider, storage)).instance;
      assert.equal((await resumed.generate(OWNER, 'Ẩm thực')).packId, offline.packId);
      const online = await instance.generate(OWNER, 'Ẩm thực', true);
      assert.deepEqual(online.pairs, PAIRS);
      assert.equal((await instance.deal(OWNER, online.packId)).error, AI_ERROR.EXPIRED);
      assert.equal((await routeAi({}, {}, OWNER)).error, AI_ERROR.REQUEST);
      assert.equal((await routeAi({ action: AI_ACTION.DEAL }, {}, OWNER)).error, AI_ERROR.REQUEST);
      assert.equal((await routeAi({ action: AI_ACTION.DEAL, packId: 'bad' }, {}, OWNER)).error, AI_ERROR.REQUEST);
      assert.equal((await routeAi({ action: AI_ACTION.TOPICS }, {}, OWNER)).error, AI_ERROR.UNAVAILABLE);
      assert.equal((await routeAi({ action: AI_ACTION.GENERATE, topic: 'Ẩm thực', room: ROOM_CODE, deviceId: HOST }, {}, OWNER)).error, AI_ERROR.UNAVAILABLE);
      for (const body of [
        { action: 1 }, { action: 'unknown' }, { action: AI_ACTION.TOPICS, owner: OWNER },
        { action: AI_ACTION.GENERATE, topic: 'Ẩm thực', room: 'bad', deviceId: HOST },
        { action: AI_ACTION.GENERATE, topic: 'Ẩm thực', room: ROOM_CODE, deviceId: 1 },
        { action: AI_ACTION.GENERATE, topic: 'Ẩm thực', room: ROOM_CODE, deviceId: 'short' },
      ]) assert.equal((await routeAi(body, {}, OWNER)).error, AI_ERROR.REQUEST);
      for (const error of [new Error('offline'), Object.assign(new Error('quota'), { code: AI_ERROR.QUOTA })]) {
        const broken = { SPY_AI: namespace({ async topics() { throw error; } }) };
        assert.equal((await routeAi({ action: AI_ACTION.TOPICS }, broken, OWNER)).error, error.code ?? AI_ERROR.UNAVAILABLE);
      }
      assert.equal((await routeAi({ action: AI_ACTION.GENERATE, topic: '<script>' }, {}, OWNER)).error, AI_ERROR.TOPIC);
      assert.deepEqual((await routeAi({ action: AI_ACTION.TOPICS }, { SPY_AI: namespace(instance) }, OWNER)).topics, TOPICS);

      const makeAiRoom = (service = instance) => ({
        s: { game: AI_GAME, status: 'ended', runId: 'previous-run', keep: { dealId: 2 }, cfg: { pack: 'everyday' }, players: { [HOST]: { guest: OWNER } } },
        env: { SPY_AI: namespace(service) }, saves: 0, broadcasts: 0,
        hostId() { return HOST; }, async save() { this.saves++; }, broadcast() { this.broadcasts++; }, async drain() {},
      });
      const ready = makeAiRoom();
      assert.equal((await generateRoomAi(ready, 'Ẩm thực', HOST, '')).error, AI_ERROR.FORBIDDEN);
      for (const mutate of [
        (room) => { room.s = null; }, (room) => { room.s.game = 'snake'; },
        (room) => { room.s.status = 'playing'; }, (room) => { delete room.s.players[HOST]; },
      ]) {
        const room = makeAiRoom(); mutate(room);
        assert.equal((await generateRoomAi(room, 'Ẩm thực', HOST, OWNER)).error, AI_ERROR.FORBIDDEN);
      }
      const unavailable = makeAiRoom(); unavailable.env = {};
      assert.equal((await generateRoomAi(unavailable, 'Ẩm thực', HOST, OWNER)).error, AI_ERROR.UNAVAILABLE);
      const broken = makeAiRoom({ async generate() { throw new Error('offline'); } });
      assert.equal((await generateRoomAi(broken, 'Ẩm thực', HOST, OWNER)).error, AI_ERROR.UNAVAILABLE);
      const invalid = makeAiRoom((await aiFixture({ async run() { return { response: {} }; } })).instance);
      assert.equal((await generateRoomAi(invalid, 'Ẩm thực', HOST, OWNER)).error, AI_ERROR.OUTPUT);
      assert.equal(invalid.saves, 0);
      const result = await generateRoomAi(ready, 'Ẩm thực', HOST, OWNER);
      assert.equal(result.count, PAIRS.length);
      assert.equal(ready.s.cfg.pack, 'ai');
      assert.equal(ready.saves, 1);
      assert.equal(ready.broadcasts, 1);
      for (const change of [
        (room) => { room.s = structuredClone(room.s); },
        (room) => { room.aiRequest = 'newer-request'; },
      ]) {
        const room = makeAiRoom({ async generate(...args) { const pack = await instance.generate(...args); change(room); return pack; } });
        assert.equal((await generateRoomAi(room, 'Ẩm thực', HOST, OWNER)).error, AI_ERROR.CHANGED);
        assert.equal(room.saves, 0);
      }
    }

    {
      const { top, db, recorder } = topFixture();
      const NativeResponse = globalThis.Response;
      const NativePair = globalThis.WebSocketPair;
      const NativeAutoResponse = globalThis.WebSocketRequestResponsePair;
      const nativeInterval = globalThis.setInterval;
      const nativeClearInterval = globalThis.clearInterval;
      const intervalCallbacks = new Map();
      class Socket {
        constructor() { this.frames = []; this.closed = false; this.attachment = undefined; }
        accept() { this.accepted = true; }
        serializeAttachment(value) { this.attachment = structuredClone(value); }
        deserializeAttachment() { return structuredClone(this.attachment); }
        send(value) {
          if (this.closed || this.broken) throw new Error('socket is closed');
          this.frames.push(JSON.parse(value));
        }
        close(code, reason) { this.closed = true; this.closeCode = code; this.closeReason = reason; }
      }
      class SocketPair {
        constructor() { this[0] = new Socket(); this[1] = new Socket(); this[0].peer = this[1]; this[1].peer = this[0]; }
      }
      class UpgradeResponse extends NativeResponse {
        constructor(body, init = {}) {
          super(body, { ...init, status: init.status === 101 ? 200 : init.status });
          if (init.status === 101) Object.defineProperty(this, 'status', { value: init.status });
          this.webSocket = init.webSocket;
        }
      }
      globalThis.Response = UpgradeResponse;
      globalThis.WebSocketPair = SocketPair;
      globalThis.WebSocketRequestResponsePair = class {
        constructor(request, response) { this.request = request; this.response = response; }
      };
      globalThis.setInterval = (callback, ms) => {
        const handle = { ms };
        intervalCallbacks.set(handle, callback);
        return handle;
      };
      globalThis.clearInterval = (handle) => { intervalCallbacks.delete(handle); };

      const module = {
        max: 2, maxOnline: 3, cfg: { difficulty: 1 }, page: '/turn/', emotes: 3, persist: true,
        config(cfg, input) { return Number.isInteger(input.difficulty) && input.difficulty > 0 ? { ...cfg, difficulty: input.difficulty } : null; },
        start(ctx) {
          Object.assign(ctx.g, { moves: 0, joined: [], left: [] });
          ctx.send(ctx.seats[0], { t: 'secret', value: 'first-seat-only' });
        },
        view(ctx, id) { return { moves: ctx.g?.moves ?? 0, seated: ctx.seats.includes(id), secret: id === ctx.seats[0] ? 'first-seat-only' : null }; },
        msg(ctx, player, message) {
          if (!ctx.seats.includes(player.id) || message.action !== 'move') return false;
          ctx.g.moves++;
          return true;
        },
        join(ctx, player) { ctx.g.joined.push(player.id); },
        leave(ctx, id) { ctx.g.left.push(id); },
        hello(ctx, id) { ctx.send(id, { t: 'hello', name: ctx.name(id) }, { tape: false }); },
        tick(ctx) {
          if (ctx.g.finishOnTick) { ctx.end({ ranks: ctx.seats.map((id) => ({ id, won: true })) }); return true; }
          ctx.g.moves++;
          return !ctx.g.silent;
        },
      };
      const modules = {
        turn: module,
        continuous: { ...module, maxOnline: undefined, autostart: true, flat: true, replay: false, persist: false, messages: ['move'], slug: 'continuous-game' },
        realtime: { ...module, volatile: true, tickMs: (cfg) => cfg.difficulty * 100 },
        clock: { ...module, tickMs: 100 },
        minimal: { max: 1, cfg: {}, replay: false, start(ctx) { ctx.g.moves = 0; }, view(ctx) { return { moves: ctx.g.moves }; }, msg() { return false; } },
      };
      const Room = gameRoom(modules);
      const fixture = async (initial = {}, env = { TOP: namespace(recorder) }, existingSockets = []) => {
        const storage = durableStorage(initial);
        const sockets = [...existingSockets];
        const ctx = {
          storage, sockets,
          getWebSockets() { return sockets.filter((socket) => !socket.closed); },
          acceptWebSocket(socket) { socket.accept(); sockets.push(socket); },
          setWebSocketAutoResponse(pair) { this.autoResponse = pair; },
          blockConcurrencyWhile(work) { this.ready = work(); },
        };
        const room = new Room(ctx, env);
        await ctx.ready;
        return { room, ctx, storage };
      };
      const connect = async (room, id = HOST, name = 'An', game = ROOM_GAME, headers = {}) => {
        const url = new URL(ORIGIN);
        if (id !== undefined) url.searchParams.set('id', id);
        if (name !== undefined) url.searchParams.set('name', name);
        const response = await room.fetch(new Request(url, { headers: { [GAME_HEADER]: game, [ROOM_HEADER]: ROOM_CODE, [GUEST_HEADER]: id === HOST ? OWNER : OTHER, ...headers } }));
        assert.equal(response.status, 101);
        return response.webSocket.peer;
      };
      const message = (room, socket, value) => room.webSocketMessage(socket, JSON.stringify(value));
      const state = (socket) => socket.frames.findLast((frame) => frame.t === 'state');
      const savedState = (storage) => storage.get('s');
      try {
        const empty = await fixture();
        assert.equal(empty.ctx.autoResponse.request, 'ping');
        assert.equal(empty.ctx.autoResponse.response, 'pong');
        assert.equal(empty.room.s, null);
        assert.equal(await empty.room.save(), undefined);
        await empty.room.alarm();
        await empty.room.schedule();
        await empty.room.webSocketClose(new Socket());
        empty.room.unlist();
        empty.room.list();
        assert.equal(empty.storage.alarm, null);
        assert.equal((await connect(empty.room, HOST, 'An', 'missing')).frames[0].msg[1], 'No such game');
        assert.equal((await connect(empty.room, 'bad')).frames[0].msg[1], 'Invalid device');
        const invalid = await empty.room.fetch(new Request(ORIGIN));
        assert.equal(invalid.webSocket.peer.closeCode, 4001);
        const orphan = await fixture({ s: { game: 'removed-game', status: 'playing' } });
        assert.equal(orphan.room.s, null);
        const missingId = await empty.room.fetch(new Request(ORIGIN, { headers: { [GAME_HEADER]: ROOM_GAME } }));
        assert.equal(missingId.webSocket.peer.frames[0].msg[1], 'Invalid device');
        const unnamed = await fixture();
        const unnamedResponse = await unnamed.room.fetch(new Request(`${ORIGIN}?id=${HOST}`, { headers: { [GAME_HEADER]: 'minimal' } }));
        const unnamedSocket = unnamedResponse.webSocket.peer;
        assert.equal(state(unnamedSocket).players[0].name, 'Người chơi');
        assert.equal(unnamed.room.s.code, '');
        await unnamed.room.webSocketClose(new Socket());
        assert.equal(unnamed.room.s.players[HOST].name, 'Người chơi');
        await unnamed.room.webSocketClose(unnamedSocket);
        assert.equal(unnamed.room.s, null);

        const { room, storage } = await fixture();
        const host = await connect(room, HOST, 'An', ROOM_GAME, { [USER_HEADER]: JSON.stringify({ sub: 'account', name: 'Account An' }) });
        assert.equal(state(host).view, null);
        assert.equal(state(host).host, HOST);
        const peer = await connect(room, PEER, 'An');
        assert.equal(state(peer).players[1].name, 'An 2');
        const spectator = await connect(room, WATCHER, 'An');
        assert.equal(state(spectator).players[2].name, 'An 3');
        const rejected = await connect(room, 'fourth-device', 'Fourth');
        assert.equal(rejected.frames[0].msg[1], 'This room is full');
        assert.equal(rejected.closeCode, 4001);
        assert.equal(room.s.order.length, 3);
        await room.webSocketMessage(host, 'invalid-json');
        await message(room, new Socket(), { t: 'start' });
        const unknown = new Socket(); unknown.serializeAttachment({ id: 'missing-device' });
        await message(room, unknown, { t: 'start' });
        await message(room, peer, { t: 'config', cfg: { difficulty: 3 } });
        await message(room, host, { t: 'config', cfg: { difficulty: 0 } });
        assert.equal(room.s.cfg.difficulty, 1);
        await message(room, host, { t: 'config', cfg: { difficulty: 2 } });
        assert.equal((await savedState(storage)).cfg.difficulty, 2);
        await message(room, host, { t: 'config', difficulty: 3 });
        assert.equal(room.s.cfg.difficulty, 3);
        await message(room, peer, { t: 'start' });
        await message(room, host, { t: 'g', action: 'move' });
        assert.equal(room.s.status, 'lobby');
        await message(room, peer, { t: 'public', on: true });
        await message(room, host, { t: 'public', on: 'yes' });
        assert.equal(room.s.pub, false);
        await message(room, host, { t: 'public', on: true });
        assert.equal(top.rooms()[0].status, 'waiting');
        assert.equal(storage.alarm, now + 30_000);
        const priorListing = top.rooms()[0].at;
        now++;
        room.list();
        await room.drain();
        assert.equal(top.rooms()[0].at, priorListing);
        await room.alarm();
        assert.equal(top.rooms()[0].at, now);
        room.s.players['offline-device'] = { id: 'offline-device', name: 'Offline', guest: OWNER };
        room.s.order.push('offline-device');
        await message(room, host, { t: 'start' });
        assert.equal(room.s.players['offline-device'], undefined);
        assert.deepEqual(state(spectator).seats, [HOST, PEER]);
        assert.equal(state(spectator).view.seated, false);
        assert.equal(state(spectator).view.secret, null);
        assert.equal(state(host).view.secret, 'first-seat-only');
        assert.equal(top.rooms()[0].players, 2);
        assert.equal(top.rooms()[0].status, 'playing');
        const runId = room.s.runId;
        await message(room, host, { t: 'start' });
        await message(room, host, { t: 'config', cfg: { difficulty: 9 } });
        assert.equal(room.s.runId, runId);
        assert.equal(room.s.cfg.difficulty, 3);
        await message(room, spectator, { t: 'g', action: 'move' });
        await message(room, host, { t: 'g', action: 'invalid' });
        assert.equal(room.s.g.moves, 0);
        await message(room, host, { t: 'g', action: 'move' });
        assert.equal(state(peer).view.moves, 1);
        const frames = peer.frames.length;
        for (const e of [-1, 3, 0.5]) await message(room, host, { t: 'emo', e });
        assert.equal(peer.frames.length, frames);
        await message(room, host, { t: 'emo', e: 1 });
        await message(room, host, { t: 'emo', e: 2 });
        assert.equal(peer.frames.length, frames + 1);
        now += 701;
        await message(room, host, { t: 'emo', e: 2 });
        assert.equal(peer.frames.at(-1).e, 2);
        await message(room, host, { t: 'unknown' });
        const replacement = await connect(room, HOST, 'An renamed');
        assert.equal(host.closeCode, 4000);
        assert.equal(host.closeReason, 'replaced');
        assert.equal(room.s.owners[HOST].sub, 'account');
        await room.webSocketClose(host);
        assert.deepEqual(room.s.g.left, []);
        assert.ok(room.s.g.joined.includes(HOST));
        const ctx = room.ctxFor();
        assert.equal(ctx.now(), now);
        assert.ok(ctx.rand() >= 0 && ctx.rand() < 1);
        assert.equal(ctx.name(HOST), 'An renamed');
        assert.equal(ctx.name('missing'), '');
        assert.deepEqual(ctx.online(), new Set([PEER, WATCHER, HOST]));
        assert.equal(ctx.host(), HOST);
        assert.deepEqual(ctx.order(), [HOST, PEER, WATCHER]);
        assert.equal(ctx.allow('action', 100), true);
        assert.equal(ctx.allow('action', 100), false);
        now += 100;
        assert.equal(ctx.allow('action', 100), true);
        ctx.wakeAt(now + 500);
        assert.equal(storage.alarm, now + 500);
        await room.alarm();
        assert.equal(room.s.g.moves, 1);
        now += 500;
        await room.alarm();
        assert.equal(room.s.g.moves, 2);
        assert.equal(room.s.wake, 0);
        ctx.send(HOST, { t: 'private', value: 3 });
        ctx.send(PEER, { t: 'private', value: 4 });
        ctx.send(HOST, { t: 'not-recorded' }, { tape: false });
        assert.equal(replacement.frames.at(-1).t, 'not-recorded');
        assert.equal(peer.frames.at(-1).value, 4);
        peer.broken = true;
        ctx.send(PEER, { t: 'closed' });
        ctx.sendAll({ t: 'broadcast' });
        ctx.sendAll({ t: 'unrecorded-broadcast' }, { tape: false });
        room.broadcast();
        peer.broken = false;
        assert.equal(replacement.frames.at(-1).t, 'state');
        const rank = { mode: 'coop', size: 0, names: 'An', score: 100, level: 2, cleared: true };
        ctx.rank([]);
        ctx.rank([rank]);
        ctx.record([]);
        await room.drain();
        assert.equal(top.list('coop', 0)[0].score, 100);
        const clip = ctx.clip();
        assert.equal(ctx.clip(), clip);
        assert.match(clip, REPLAY_ID);
        room.broadcast();
        await room.drain();
        assert.equal(top.replay(clip).frames.some((frame) => frame[1].t === 'not-recorded'), false);
        assert.ok(top.replay(clip).frames.some((frame) => frame[1].t === 'private' && frame[1].value === 3));
        const restored = await fixture({ s: await storage.get('s'), tape: await storage.get('tape') }, { TOP: namespace(recorder) }, [replacement, peer, spectator]);
        assert.equal(restored.room.tape.frames.length, room.tape.frames.length);
        assert.equal(restored.room.clipRp, null);
        const savedClip = 'mnopqrstuvWX';
        const withClip = await fixture({ s: await storage.get('s'), tape: { ...await storage.get('tape'), clipRp: savedClip } });
        assert.equal(withClip.room.clipRp, savedClip);
        restored.room.ctxFor().end({ ranks: [{ id: HOST, won: true }, { id: PEER, score: 4, level: 5, detail: { elapsed: 8 } }], level: 3 });
        restored.room.broadcast();
        await restored.room.drain();
        assert.equal(top.history('account')[0].mode, 'multi');
        assert.equal(top.history('account')[0].score, 0);
        assert.equal(top.history('account')[0].level, 3);
        assert.equal(restored.room.s.result.ranks[0].name, 'An renamed');
        assert.ok(top.replay(restored.room.s.result.rp));
        assert.equal(restored.storage.values.has('tape'), false);
        const resultCount = top.history('account').length;
        restored.room.finish({ ranks: [{ id: HOST, score: 999 }] });
        await restored.room.drain();
        assert.equal(top.history('account').length, resultCount);
        await message(room, replacement, { t: 'public', on: false });
        assert.deepEqual(top.rooms(), []);
        assert.equal(storage.alarm, null);
        const legacyState = await storage.get('s');
        delete legacyState.owners;
        const legacy = await fixture({ s: legacyState });
        const legacySocket = await connect(legacy.room, HOST);
        assert.equal(legacy.room.s.owners[HOST].guest, OWNER);
        assert.equal(state(legacySocket).status, 'playing');

        const missingRecorder = await fixture({}, {});
        const lone = await connect(missingRecorder.room, HOST, 'Only');
        await message(missingRecorder.room, lone, { t: 'start' });
        missingRecorder.room.ctxFor().rank([rank]);
        missingRecorder.room.ctxFor().record([play({ id: HOST })]);
        missingRecorder.room.s.pub = true;
        missingRecorder.room.list();
        missingRecorder.room.unlist();
        missingRecorder.room.finish({ ranks: [{ id: HOST }] });
        missingRecorder.room.broadcast();
        assert.equal(missingRecorder.room.s.status, 'ended');
        const solo = await fixture();
        const soloSocket = await connect(solo.room, HOST);
        await message(solo.room, soloSocket, { t: 'start' });
        delete solo.room.s.runId;
        delete solo.room.s.owners;
        solo.room.ctxFor().record([play({ id: HOST, sub: undefined, guest: undefined, eventId: undefined })]);
        solo.room.finish({ ranks: [{ id: HOST }, { id: 'departed', name: 'Former player' }, { id: 'unknown' }] });
        await solo.room.drain();
        assert.equal(solo.room.s.result.ranks[1].name, 'Former player');
        assert.equal(solo.room.s.result.ranks[2].name, '');
        assert.equal(top.historyFor(null, OWNER).some((row) => row.mode === 'solo'), true);
        const smoke = await fixture();
        const smokeSocket = await connect(smoke.room, 'smoke-device');
        await message(smoke.room, smokeSocket, { t: 'start' });
        smoke.room.ctxFor().rank([{ ...rank, score: 999 }]);
        await smoke.room.drain();
        assert.equal(top.list('coop', 0)[0].score, 100);

        const continuous = await fixture();
        const first = await connect(continuous.room, HOST, 'First', 'continuous');
        assert.equal(state(first).status, 'playing');
        assert.equal(state(first).moves, 0);
        assert.equal(state(first).view, undefined);
        assert.equal(continuous.room.ctxFor().clip(), undefined);
        await message(continuous.room, first, { t: 'public', on: true });
        assert.equal(top.rooms()[0].game, 'continuous-game');
        assert.equal(top.rooms()[0].status, 'waiting');
        const second = await connect(continuous.room, PEER, 'Second', 'continuous');
        assert.equal(top.rooms()[0].status, 'playing');
        await message(continuous.room, first, { t: 'move', action: 'invalid' });
        await message(continuous.room, first, { t: 'move', action: 'move' });
        assert.equal(state(second).moves, 1);
        continuous.room.finish({ ranks: [{ id: HOST, score: 1, level: 2 }], mode: 'house' });
        await message(continuous.room, first, { t: 'start' });
        assert.equal(continuous.room.s.status, 'ended');
        await continuous.room.webSocketClose(first);
        first.close();
        assert.equal(continuous.room.s.players[HOST], undefined);
        assert.equal(continuous.room.s.owners[HOST], undefined);
        await continuous.room.webSocketError(second);
        second.close();
        assert.equal(continuous.room.s, null);
        assert.equal(continuous.storage.values.size, 0);
        assert.equal(top.rooms().some((entry) => entry.key === 'continuous:ABCD'), false);

        const persists = await fixture();
        const persistentSocket = await connect(persists.room);
        await message(persists.room, persistentSocket, { t: 'public', on: true });
        await message(persists.room, persistentSocket, { t: 'start' });
        await persists.room.webSocketClose(persistentSocket);
        persistentSocket.close();
        assert.equal(persists.room.s.status, 'playing');
        assert.deepEqual(persists.room.s.g.left, [HOST]);
        assert.equal(top.rooms().some((entry) => entry.key === 'turn:ABCD'), false);
        persists.room.list();
        assert.equal(persists.room.hostId(), null);
        const reconnected = await connect(persists.room);
        assert.equal(state(reconnected).status, 'playing');
        assert.equal(top.rooms()[0].players, 1);
        await persists.room.webSocketClose(reconnected);
        reconnected.close();
        persists.room.s.g.finishOnTick = true;
        persists.room.ctxFor().wakeAt(now);
        await persists.room.alarm();
        assert.equal(persists.room.s, null);
        assert.equal(persists.storage.values.size, 0);

        const silent = await fixture();
        const silentSocket = await connect(silent.room);
        await message(silent.room, silentSocket, { t: 'start' });
        silent.room.s.g.silent = true;
        silent.room.ctxFor().wakeAt(now);
        await silent.room.alarm();
        assert.equal(silent.room.s.wake, 0);
        assert.equal(silent.storage.alarm, null);
        await silent.room.webSocketClose(silentSocket);
        silentSocket.close();
        silent.room.s.g.finishOnTick = true;
        silent.room.ctxFor().wakeAt(now);
        await silent.room.alarm();
        assert.equal(silent.room.s, null);
        const quiet = await fixture();
        const quietSocket = await connect(quiet.room, HOST, 'Quiet', 'minimal');
        await message(quiet.room, quietSocket, { t: 'config', cfg: { difficulty: 2 } });
        await message(quiet.room, quietSocket, { t: 'start' });
        await message(quiet.room, quietSocket, { t: 'emo', e: 0 });
        const lateQuiet = await connect(quiet.room, PEER, 'Late', 'minimal');
        await quiet.room.webSocketClose(lateQuiet);
        lateQuiet.close();
        quiet.room.ctxFor().wakeAt(now);
        await quiet.room.alarm();
        assert.equal(quiet.room.s.status, 'playing');
        quiet.room.s.pub = true;
        quiet.room.list();
        assert.equal(top.rooms().some((entry) => entry.key === 'minimal:ABCD'), false);
        await quiet.room.webSocketClose(quietSocket);
        quietSocket.close();
        assert.equal(quiet.room.s, null);

        for (const game of ['realtime', 'clock']) {
          const timed = await fixture();
          const timedSocket = await connect(timed.room, HOST, 'Clock', game);
          await message(timed.room, timedSocket, { t: 'start' });
          assert.equal(timed.room.timer.ms, 100);
          assert.equal((await savedState(timed.storage)).status, game === 'realtime' ? 'lobby' : 'playing');
          const tick = intervalCallbacks.get(timed.room.timer);
          tick();
          assert.equal(state(timedSocket).view.moves, 1);
          timed.room.s.g.silent = true;
          const writes = timed.storage.writes.length;
          tick();
          assert.equal(timed.storage.writes.length, writes);
          now += 2_001;
          tick();
          assert.equal(timed.storage.writes.length, writes + (game === 'clock' ? 1 : 0));
          if (game === 'clock') {
            const resumed = await fixture({ s: await timed.storage.get('s') });
            assert.equal(resumed.room.timer.ms, 100);
            resumed.room.onTick();
            assert.equal(resumed.storage.writes.includes('s'), true);
            resumed.room.s.status = 'ended';
            resumed.room.onTick();
            assert.equal(intervalCallbacks.has(resumed.room.timer), false);
          }
          timed.room.s.g.silent = false;
          const timedClip = timed.room.ctxFor().clip();
          timed.room.broadcast();
          await timed.room.drain();
          assert.ok(top.replay(timedClip));
          timed.room.finish({ ranks: [{ id: HOST }] });
          await timed.room.save();
          assert.equal((await savedState(timed.storage)).status, 'ended');
          timed.room.onTick();
          assert.equal(intervalCallbacks.has(timed.room.timer), false);
          timed.room.s = null;
          timed.room.onTick();
        }

        const switched = await fixture();
        await connect(switched.room, HOST, 'Original');
        const switchedSocket = await connect(switched.room, HOST, '  ', 'minimal', { [ROOM_HEADER]: '' });
        assert.equal(state(switchedSocket).game, 'minimal');
        assert.equal(state(switchedSocket).players[0].name, 'Người chơi');
        switched.room.s.pub = true;
        switched.room.list();
        switched.room.unlist();
        assert.equal(switched.room.s.code, '');
        const errors = [];
        const originalError = console.error;
        try {
          console.error = (...args) => errors.push(args);
          switched.room.io(Promise.reject(new Error('recorder unavailable')));
          switched.room.io(Promise.resolve().then(() => { switched.room.io(Promise.resolve('nested')); }));
          await switched.room.drain();
          assert.equal(errors[0][0], 'game-room io');
          assert.equal(errors[0][1].message, 'recorder unavailable');
          assert.equal(switched.room.pending.length, 0);
        } finally { console.error = originalError; }
      } finally {
        globalThis.Response = NativeResponse;
        globalThis.WebSocketPair = NativePair;
        globalThis.WebSocketRequestResponsePair = NativeAutoResponse;
        globalThis.setInterval = nativeInterval;
        globalThis.clearInterval = nativeClearInterval;
        db.close();
      }
    }
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
}

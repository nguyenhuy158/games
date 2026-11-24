import assert from 'node:assert/strict';
import { register } from 'node:module';
import './scripts/node-ts-hooks.mjs';
import { AI_ACTION, AI_ERROR, AI_LIMIT, AI_MODEL, AI_PATH, SpyAiService, parseAiOutput, normalizeAiTopic } from './worker/spy-ai.js';
import { resolveAiPair } from './worker/games/gian-diep-ai.js';
import { GUEST_COOKIE } from './worker/guest.js';

register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject{constructor(c,e){this.ctx=c;this.env=e}}', shortCircuit: true };
    return next(spec, ctx);
  }`)}`);
const { http } = await import('./worker/adapters/http.js');
const { NokiaRoom } = await import('./worker/index.js');

const PAIRS = [
  ['Bánh mì', 'Bánh bao'], ['Cà phê', 'Trà xanh'], ['Cơm rang', 'Cơm tấm'], ['Phở bò', 'Bún bò'],
  ['Cam', 'Quýt'], ['Xoài', 'Ổi'], ['Mít', 'Sầu riêng'], ['Sữa chua', 'Kem'],
  ['Nước mía', 'Nước dừa'], ['Cá hồi', 'Cá thu'], ['Tôm', 'Cua'], ['Kẹo', 'Sô cô la'],
];
const TOPICS = ['Ẩm thực Việt', 'Động vật', 'Du lịch', 'Đồ dùng', 'Thể thao'];
const OWNER = 'a'.repeat(64), OTHER = 'b'.repeat(64);
const output = () => ({ response: { pairs: structuredClone(PAIRS) } });
const namespace = (instance) => ({ idFromName: (name) => name, get: () => instance });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function storage() {
  let snapshot;
  return {
    reads: 0,
    async get() { this.reads++; return structuredClone(snapshot); },
    async put(_key, value) { snapshot = structuredClone(value); },
    snapshot: () => structuredClone(snapshot),
  };
}

function provider(handler = output) {
  const calls = [];
  return { calls, async run(model, input) { calls.push({ model, input }); return handler(model, input); } };
}

assert.equal(normalizeAiTopic('  Ẩm thực Việt  '), 'Ẩm thực Việt');
for (const topic of ['', ' ', 'x'.repeat(101), '<script>', 'a\nb', { topic: 'Ẩm thực' }]) {
  assert.throws(() => normalizeAiTopic(topic), (error) => error.code === AI_ERROR.TOPIC);
}
assert.deepEqual(parseAiOutput(output(), AI_ACTION.GENERATE).pairs, PAIRS);
assert.deepEqual(parseAiOutput({ response: JSON.stringify({ topics: TOPICS }) }, AI_ACTION.TOPICS).topics, TOPICS);
assert.equal(parseAiOutput({ response: { pairs: [...PAIRS.slice(0, 10), PAIRS[0], [...PAIRS[1]].reverse()] } }, AI_ACTION.GENERATE).pairs.length, 10);
for (const response of [null, 'not json', { pairs: PAIRS, prompt: 'leak' }, { pairs: PAIRS.slice(0, 9) }, { pairs: [...PAIRS, PAIRS[0]] }, { pairs: PAIRS.map(() => ['Cam', 'cam']) }, { pairs: [...PAIRS.slice(0, 11), ['<b>Cam</b>', 'Quýt']] }, { pairs: [...PAIRS.slice(0, 11), ['Cam\n', 'Quýt']] }]) {
  assert.throws(() => parseAiOutput({ response }, AI_ACTION.GENERATE), (error) => error.code === AI_ERROR.OUTPUT);
}
assert.throws(() => parseAiOutput({ response: { topics: ['Ẩm thực', 'ẩm thực', 'Đồ dùng'] } }, AI_ACTION.TOPICS));

{
  const store = storage(), ai = provider(), service = new SpyAiService(store, ai);
  const first = await service.generate(OWNER, 'Ẩm thực');
  assert.deepEqual(Object.keys(first).sort(), ['count', 'packId', 'title']);
  assert.equal(first.count, 12);
  assert.equal(ai.calls[0].model, AI_MODEL);
  assert.equal(ai.calls[0].input.max_tokens, AI_LIMIT.TOKENS);
  assert.equal(ai.calls[0].input.response_format.type, 'json_schema');
  assert.ok(ai.calls[0].input.messages.every((message) => !message.content.includes(OWNER)));
  assert.equal((await service.deal(OTHER, first.packId)).error, AI_ERROR.EXPIRED);
  const dealt = await service.deal(OWNER, first.packId);
  assert.deepEqual(Object.keys(dealt), ['pair']);
  assert.ok(PAIRS.some((pair) => JSON.stringify(pair) === JSON.stringify(dealt.pair)));
  const second = await service.generate(OTHER, 'ẩm thực');
  assert.notEqual(second.packId, first.packId);
  assert.equal(ai.calls.length, 1);
  assert.equal((await service.deal(OWNER, second.packId)).error, AI_ERROR.EXPIRED);
  const resumed = new SpyAiService(store, ai);
  assert.ok((await resumed.deal(OWNER, first.packId)).pair);
  assert.equal((await resumed.generate(OWNER, 'Ẩm thực')).packId, first.packId);
  assert.equal(ai.calls.length, 1);
  assert.equal(store.reads, 2);
  for (let i = 0; i < 10; i++) await resumed.deal(OWNER, first.packId);
  assert.equal(store.reads, 2);
  const online = await service.generate(OWNER, 'Ẩm thực', true);
  assert.equal((await service.deal(OWNER, online.packId)).error, AI_ERROR.EXPIRED);
  const ctx = { cfg: { pack: 'ai', aiPackId: online.packId }, keep: { aiPack: online }, now: Date.now, rand: () => 0 };
  assert.deepEqual(resolveAiPair(ctx), PAIRS[0]);
  assert.throws(() => resolveAiPair({ ...ctx, cfg: { pack: 'ai', aiPackId: crypto.randomUUID() } }), RangeError);
  assert.throws(() => resolveAiPair({ ...ctx, now: () => online.expires }), RangeError);
}

{
  const store = storage(), started = deferred(), finish = deferred();
  const ai = provider(() => { started.resolve(); return finish.promise; });
  const service = new SpyAiService(store, ai);
  const requests = [service.generate(OWNER, 'Ẩm thực'), service.generate(OTHER, 'ẩm thực'), service.generate(OWNER, 'Ẩm thực')];
  await started.promise;
  assert.equal(store.snapshot().total, 1, 'reservation is durable before provider begins');
  const restarted = new SpyAiService(store, ai);
  assert.equal((await restarted.generate(OTHER, 'Ẩm thực')).error, AI_ERROR.UNAVAILABLE, 'orphan reservations cannot bill again after reset');
  finish.resolve(output());
  const results = await Promise.all(requests);
  assert.equal(ai.calls.length, 1);
  assert.equal(results[0].packId, results[2].packId);
  assert.notEqual(results[0].packId, results[1].packId);
}

{
  const ai = provider(), service = new SpyAiService(storage(), ai);
  const results = await Promise.all(Array.from({ length: AI_LIMIT.GUEST + 1 }, (_, index) => service.generate(OWNER, `Chủ đề ${index}`)));
  assert.equal(results.filter((result) => result.packId).length, AI_LIMIT.GUEST);
  assert.equal(results.filter((result) => result.error === AI_ERROR.QUOTA).length, 1);
  assert.equal(ai.calls.length, AI_LIMIT.GUEST, 'concurrent reservations cannot overspend a guest budget');
}

{
  let now = 10 * AI_LIMIT.TTL;
  const store = storage(), ai = provider((_model, input) => input.max_tokens === AI_LIMIT.TOPIC_TOKENS ? { response: { topics: TOPICS } } : output());
  let service = new SpyAiService(store, ai, () => now);
  assert.deepEqual((await service.topics(OWNER)).topics, TOPICS);
  for (let i = 1; i < AI_LIMIT.GUEST; i++) assert.ok((await service.generate(OWNER, `Chủ đề ${i}`)).packId);
  service = new SpyAiService(store, ai, () => now);
  assert.equal((await service.generate(OWNER, 'Chủ đề vượt hạn mức')).error, AI_ERROR.QUOTA);
  assert.equal(ai.calls.length, AI_LIMIT.GUEST);
  assert.deepEqual((await service.topics(OTHER)).topics, TOPICS);
  assert.equal(ai.calls.length, AI_LIMIT.GUEST);
  assert.ok((await service.generate(OWNER, 'Chủ đề 1')).packId, 'cache remains available after quota');
  now += AI_LIMIT.TTL;
  assert.ok((await service.generate(OWNER, 'Chủ đề mới')).packId);
  assert.equal(ai.calls.length, AI_LIMIT.GUEST + 1);
}

{
  const store = storage(), ai = provider();
  let service = new SpyAiService(store, ai);
  for (let i = 0; i < AI_LIMIT.GLOBAL; i++) assert.ok((await service.generate(`guest-${i}`, `Chủ đề ${i}`)).packId);
  service = new SpyAiService(store, ai);
  assert.equal((await service.generate('fresh-guest', 'Chủ đề vượt hạn mức')).error, AI_ERROR.QUOTA);
  assert.equal(ai.calls.length, AI_LIMIT.GLOBAL);
  assert.ok((await service.generate('fresh-guest', 'Chủ đề 0')).packId);
  assert.equal(ai.calls.length, AI_LIMIT.GLOBAL);
}

{
  const store = storage(), ai = provider(() => ({ response: { pairs: [['Cam', 'Cam']] } }));
  const service = new SpyAiService(store, ai);
  assert.equal((await service.generate(OWNER, 'Ẩm thực')).error, AI_ERROR.OUTPUT);
  assert.equal(store.snapshot().total, 1, 'invalid output still consumes the reserved call');
  assert.deepEqual(store.snapshot().grants, {});
  assert.deepEqual(store.snapshot().cache, {});
  assert.equal((await service.generate(OWNER, '<unsafe>')).error, AI_ERROR.TOPIC);
  assert.equal(ai.calls.length, 1);
  assert.equal((await new SpyAiService(storage(), null).topics(OWNER)).error, AI_ERROR.UNAVAILABLE);
  const failed = provider(() => { throw new Error('provider offline'); });
  assert.equal((await new SpyAiService(storage(), failed).topics(OWNER)).error, AI_ERROR.UNAVAILABLE);
  assert.equal(failed.calls.length, 1, 'there is no automatic retry');
}

{
  let now = 100;
  const store = storage(), ai = provider(), service = new SpyAiService(store, ai, () => now);
  const pack = await service.generate(OWNER, 'Ẩm thực');
  now += AI_LIMIT.TTL;
  assert.equal((await service.deal(OWNER, pack.packId)).error, AI_ERROR.EXPIRED);
  assert.notEqual((await service.generate(OWNER, 'Ẩm thực')).packId, pack.packId);
  assert.equal(ai.calls.length, 2);
}

function roomFixture(service) {
  const frames = [], saved = [];
  const room = Object.create(NokiaRoom.prototype);
  room.env = { SPY_AI: namespace(service) };
  room.s = { game: 'gian-diep', status: 'lobby', order: ['host-device', 'guest-device'], players: {
    'host-device': { id: 'host-device', guest: OWNER, name: 'Host private name' },
    'guest-device': { id: 'guest-device', guest: OTHER, name: 'Guest private name' },
  }, cfg: { spies: 1, whites: 0, pack: 'everyday' }, seats: [], g: null, pub: false };
  const sockets = room.s.order.map((id) => ({ deserializeAttachment: () => ({ id }), send: (frame) => frames.push(JSON.parse(frame)) }));
  room.ctx = { getWebSockets: () => sockets, storage: { put: async (_key, state) => { saved.push(structuredClone(state)); } } };
  return { room, frames, saved, sockets };
}

{
  const ai = provider(), service = new SpyAiService(storage(), ai), { room, frames, saved } = roomFixture(service);
  assert.equal((await room.generateSpyAi('Ẩm thực', 'guest-device', OTHER)).error, AI_ERROR.FORBIDDEN);
  assert.equal((await room.generateSpyAi('Ẩm thực', 'host-device', OTHER)).error, AI_ERROR.FORBIDDEN);
  room.s.status = 'playing';
  assert.equal((await room.generateSpyAi('Ẩm thực', 'host-device', OWNER)).error, AI_ERROR.FORBIDDEN);
  assert.equal(ai.calls.length, 0);
  room.s.status = 'lobby';
  const result = await room.generateSpyAi('Ẩm thực', 'host-device', OWNER);
  assert.deepEqual(Object.keys(result).sort(), ['count', 'packId', 'title']);
  assert.equal(saved[0].keep.aiPack.pairs.length, PAIRS.length);
  assert.equal(room.s.cfg.aiPackId, result.packId);
  assert.equal(frames.length, 2);
  for (const frame of frames) {
    assert.equal(frame.cfg.pack, 'ai');
    assert.equal(frame.cfg.aiTopic, 'Ẩm thực');
    assert.equal(frame.keep, undefined);
    assert.equal(frame.pairs, undefined);
    assert.equal(frame.view, null);
    for (const word of PAIRS.flat()) assert.ok(!JSON.stringify(frame).includes(word));
  }
  assert.ok(ai.calls[0].input.messages.every((message) => !message.content.includes('private name')));
}

for (const change of [
  (fixture) => { fixture.room.s.status = 'playing'; },
  (fixture) => { fixture.room.s.runId = crypto.randomUUID(); fixture.room.s.status = 'ended'; },
  (fixture) => { fixture.room.s.keep = { dealId: 1 }; },
  (fixture) => { fixture.room.s.cfg = { ...fixture.room.s.cfg, spies: 2 }; },
  (fixture) => { fixture.sockets.shift(); },
  (fixture) => { fixture.room.s.players['host-device'].guest = OTHER; },
]) {
  const started = deferred(), finish = deferred(), ai = provider(() => { started.resolve(); return finish.promise; });
  const fixture = roomFixture(new SpyAiService(storage(), ai));
  const pending = fixture.room.generateSpyAi('Ẩm thực', 'host-device', OWNER);
  await started.promise;
  change(fixture);
  finish.resolve(output());
  assert.equal((await pending).error, AI_ERROR.CHANGED);
  assert.equal(fixture.saved.length, 0);
  assert.equal(fixture.frames.length, 0);
  assert.equal(fixture.room.s.keep?.aiPack, undefined);
}

{
  const ai = provider(), service = new SpyAiService(storage(), ai), fixture = roomFixture(service);
  const env = { SPY_AI: namespace(service), NOKIA: namespace(fixture.room) };
  const origin = 'https://games.huyab.cfd';
  const post = (body, owner = OWNER, headers = {}) => http.fetch(new Request(origin + AI_PATH, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `${GUEST_COOKIE}=${owner}`, ...headers }, body: JSON.stringify(body),
  }), env);
  for (const body of [
    { action: 'generate', topic: 'Ẩm thực', room: 'ABCD' },
    { action: 'generate', topic: 'Ẩm thực', deviceId: 'host-device' },
    { action: 'generate', topic: 'Ẩm thực', room: 'ABCD', deviceId: 'guest-device' },
    { action: 'generate', topic: 'Ẩm thực', owner: OWNER },
    { action: 'constructor' }, { action: 'deal', packId: crypto.randomUUID(), room: 'ABCD' },
  ]) assert.ok((await post(body)).status >= 400);
  assert.equal(ai.calls.length, 0);
  assert.equal((await post({ action: 'generate', topic: 'Ẩm thực' }, OWNER, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await post({ action: 'generate', topic: 'Ẩm thực' }, OWNER, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post({ action: 'generate', topic: 'a'.repeat(AI_LIMIT.BODY) })).status, 413);
  const forged = await post({ action: 'generate', topic: 'Ẩm thực', room: 'ABCD', deviceId: 'host-device' }, OTHER, { 'X-Guest': OWNER });
  assert.equal(forged.status, 403);
  assert.equal(ai.calls.length, 0);
  const response = await post({ action: 'generate', topic: 'Ẩm thực' });
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const pack = await response.json();
  assert.deepEqual(Object.keys(pack).sort(), ['count', 'packId', 'title']);
  assert.equal((await post({ action: 'deal', packId: pack.packId }, OTHER, { 'X-Guest': OWNER })).status, 404);
  const deal = await (await post({ action: 'deal', packId: pack.packId })).json();
  assert.ok(PAIRS.some((pair) => JSON.stringify(pair) === JSON.stringify(deal.pair)));
  const online = await (await post({ action: 'generate', topic: 'Ẩm thực', room: 'ABCD', deviceId: 'host-device' })).json();
  assert.deepEqual(Object.keys(online).sort(), ['count', 'packId', 'title']);
  assert.equal((await post({ action: 'deal', packId: online.packId })).status, 404);
  assert.equal(ai.calls.length, 1);
}

console.log('spy-ai ok');

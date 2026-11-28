// Test adapter HTTP: domain cũ và tên miền ngắn chuyển hướng trước khi chạm ASSETS / Durable Object.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import '../support/node-ts-hooks.mjs';

register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject{constructor(c,e){this.ctx=c;this.env=e}}', shortCircuit: true };
    return next(spec, ctx);
  }`)}`);
const { http } = await import('../../backend/src/adapters/http.js');

const env = {
  ASSETS: { fetch: async () => new Response('asset') },
  TOP: { idFromName: (name) => name, get: () => ({ profile: () => ({ stats: [], guestPending: false }), replayPage: () => '/gian-diep/', rooms: () => [{ game: 'gian-diep', path: '/gian-diep/' }] }) },
};
const get = (url) => http.fetch(new Request(url), env);

// soi.huyab.cfd: tên ngắn của /soi/ (302, giữ query như ?r=MÃ)
{
  let r = await get('https://soi.huyab.cfd/');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('Location'), 'https://games.huyab.cfd/soi/');
  r = await get('https://soi.huyab.cfd/?r=ABCD');
  assert.equal(r.headers.get('Location'), 'https://games.huyab.cfd/soi/?r=ABCD');
  r = await get('https://soi.huyab.cfd/logos/soi.svg');
  assert.equal(r.headers.get('Location'), 'https://games.huyab.cfd/logos/soi.svg', 'file khác giữ nguyên đường dẫn');
  r = await get('https://soi.huyab.cfd/api/me');
  assert.equal(r.status, 200, '/api/* không bị chuyển hướng (tab đang mở không rớt)');
}
// Domain cũ pikachu vẫn 301 sang domain chính
{
  const r = await get('https://pikachu.huyab.cfd/pikachu/?r=ABCD');
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('Location'), 'https://games.huyab.cfd/pikachu/?r=ABCD');
}
// Domain chính phục vụ file tĩnh
{
  const r = await get('https://games.huyab.cfd/soi/');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'asset');
}
// Link phòng cũ giữ nguyên mã phòng và ngôn ngữ.
for (const path of ['/gian-diep', '/gian-diep/', '/gian-diep/index.html']) {
  const r = await get(`https://games.huyab.cfd${path}?r=ABCD&lang=vi`);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('Location'), 'https://games.huyab.cfd/undercover/?r=ABCD&lang=vi');
}
{
  const replay = await get('https://games.huyab.cfd/replay/AbCdEf123456');
  assert.equal(replay.headers.get('Location'), 'https://games.huyab.cfd/undercover/?replay=AbCdEf123456');
  const rooms = await get('https://games.huyab.cfd/api/rooms');
  assert.deepEqual((await rooms.json()).rooms, [{ game: 'undercover', path: '/undercover/' }]);
}
{
  const forwarded = [];
  const nokia = {
    idFromName: (name) => name,
    get: (name) => ({ fetch: (req) => {
      forwarded.push([name, req.headers.get('X-Game'), req.headers.get('X-Room')]);
      return new Response('room');
    } }),
  };
  for (const id of ['undercover', 'gian-diep']) {
    const request = new Request(`https://games.huyab.cfd/api/nk/${id}/room/ABCD`, { headers: { Upgrade: 'websocket' } });
    assert.equal(await (await http.fetch(request, { ...env, NOKIA: nokia })).text(), 'room');
  }
  assert.deepEqual(forwarded, [
    ['gian-diep:ABCD', 'undercover', 'ABCD'],
    ['gian-diep:ABCD', 'undercover', 'ABCD'],
  ]);
}
console.log('http ok');

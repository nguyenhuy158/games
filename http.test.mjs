// Test adapter HTTP: domain cũ và tên miền ngắn chuyển hướng trước khi chạm ASSETS / Durable Object.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import './scripts/node-ts-hooks.mjs';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject{constructor(c,e){this.ctx=c;this.env=e}}', shortCircuit: true };
    return next(spec, ctx);
  }`));
const { http } = await import('./worker/adapters/http.js');

const env = { ASSETS: { fetch: async () => new Response('asset') } };
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
console.log('http ok');

// Test xác thực JWT SSO (worker/sso.js) bằng khoá RSA tự tạo + JWKS giả.
import assert from 'node:assert/strict';
import './scripts/node-ts-hooks.mjs';

const alg = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const good = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
const evil = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', good.publicKey);
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => (String(url).endsWith('/.well-known/jwks.json') ? Response.json({ keys: [jwk] }) : realFetch(url));
const { userFrom } = await import('./worker/sso.js');

const b64 = (buf) => Buffer.from(buf).toString('base64url');
async function token(claims, key = good.privateKey) {
  const h = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const p = b64(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64(sig)}`;
}
const req = (t) => new Request('https://games.huyab.click/api/me', { headers: t ? { Cookie: `other=1; huyab_sso=${t}; x=2` } : {} });
const base = { iss: 'https://auth.huyab.click', sub: 'u1', email: 'a@b.c', name: 'An', exp: Math.floor(Date.now() / 1000) + 3600 };

assert.deepEqual(await userFrom(req(await token(base))), { sub: 'u1', name: 'An', picture: null });
assert.equal(await userFrom(req(null)), null, 'no cookie');
assert.equal(await userFrom(req('garbage')), null, 'malformed');
assert.equal(await userFrom(req(await token({ ...base, exp: 1 }))), null, 'expired');
assert.equal(await userFrom(req(await token({ ...base, iss: 'https://evil.example' }))), null, 'wrong issuer');
assert.equal(await userFrom(req(await token(base, evil.privateKey))), null, 'signed by other key');
const t = await token(base);
const [h, , s] = t.split('.');
assert.equal(await userFrom(req(`${h}.${b64(JSON.stringify({ ...base, sub: 'admin' }))}.${s}`)), null, 'tampered payload');
// cookie tên gần giống không được nhận nhầm
assert.equal(await userFrom(new Request('https://x', { headers: { Cookie: `fake_huyab_sso=${t}` } })), null, 'cookie name prefix');

globalThis.fetch = realFetch;
console.log('sso ok');

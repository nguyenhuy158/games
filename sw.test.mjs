// Mọi đường dẫn trong CORE của public/sw.js phải có thật: một file 404 là cache.addAll() hỏng, service worker không cài được
// (từng xảy ra khi commit thiếu public/bfcache.js).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const src = readFileSync('public/sw.js', 'utf8');
const core = [...src.slice(src.indexOf('const CORE'), src.indexOf('];')).matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
assert.ok(core.length > 50, 'CORE list parsed');
const missing = core.filter((p) => !existsSync(`public${p.endsWith('/') ? `${p}index.html` : p}`));
assert.deepEqual(missing, [], `sw.js CORE has paths with no file: ${missing.join(', ')}`);
assert.equal(new Set(core).size, core.length, 'no duplicate CORE entries');
console.log('sw ok');

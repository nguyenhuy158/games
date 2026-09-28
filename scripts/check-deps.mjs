// Kiểm chiều phụ thuộc hexagonal (worker/ports.js): domain <- application <- adapter.
//   public/<game>/logic.js : domain — chỉ được import domain khác (không DOM, không Worker, không I/O)
//   worker/games/*.js      : application — chỉ được import domain + worker/games (+ ports.js cho kiểu)
//   worker/adapters/*.js   : adapter — không import ngược từ worker/index.js
// Gọi từ logic.test.mjs nên build Cloudflare fail nếu sai.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const imports = (f) => [...readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
const resolve = (f, spec) => (spec.startsWith('.') ? normalize(join(dirname(f), spec)) : spec);
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const isDomain = (p) => /^public\/.+\/logic\.js$/.test(p);

const bad = [];
for (const f of walk('public').filter(isDomain)) {
  for (const i of imports(f).map((s) => resolve(f, s))) if (!isDomain(i)) bad.push(`${f} (domain) -> ${i}`);
}
for (const f of walk('worker/games')) {
  for (const i of imports(f).map((s) => resolve(f, s))) if (!isDomain(i) && !i.startsWith('worker/games/') && i !== 'worker/ports.js') bad.push(`${f} (application) -> ${i}`);
}
for (const f of walk('worker/adapters')) {
  for (const i of imports(f).map((s) => resolve(f, s))) if (i === 'worker/index.js') bad.push(`${f} (adapter) -> ${i}`);
}
if (bad.length) throw new Error(`Sai chiều phụ thuộc:\n  ${bad.join('\n  ')}`);
console.log('deps ok');

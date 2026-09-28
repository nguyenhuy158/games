// Handler dạng thuộc tính (el.onkeydown = ...) mà trả về false thì trình duyệt huỷ luôn sự kiện:
// `onkeydown = (e) => e.key === 'Enter' && join()` trả về false với mọi phím khác Enter -> ô mã phòng không gõ được chữ.
// Chặn viết kiểu arrow trả thẳng biểu thức && / || cho on<sự kiện>; hãy dùng { if (...) ...; }.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'vendor') walk(p); } else if (p.endsWith('.js') || p.endsWith('.html')) files.push(p); } };
walk('public');
const bad = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l])
  .filter(([, , l]) => /\.on[a-z]+\s*=\s*\([^)]*\)\s*=>\s*[^{\s][^;]*(&&|\|\|)/.test(l)));
assert.deepEqual(bad.map(([f, n, l]) => `${f}:${n}: ${l.trim()}`), [], 'on<event> handler returns a && / || expression (may cancel the event)');
console.log('handlers ok');

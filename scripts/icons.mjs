// Trích các icon lucide cần dùng thành public/icons.js (vài KB) thay vì tải cả thư viện.
// Thêm icon: thêm tên vào NAMES rồi chạy `pnpm icons`.
import { writeFileSync } from 'node:fs';

const NAMES = ['arrow-left', 'link', 'lightbulb', 'shuffle', 'volume-2', 'volume-x', 'crown', 'trophy', 'users', 'swords', 'zap', 'play', 'rotate-ccw'];

const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ');
const out = {};
for (const n of NAMES) {
  const [, , children] = (await import(`lucide/dist/esm/icons/${n}.js`)).default;
  out[n] = children.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
}

writeFileSync('public/icons.js', `// Sinh bởi scripts/icons.mjs từ lucide (ISC) — đừng sửa tay.
const PATHS = ${JSON.stringify(out, null, 2)};

export const icon = (name) =>
  \`<svg class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">\${PATHS[name]}</svg>\`;

// Thay mọi <i data-icon="tên"> trong root bằng SVG.
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('i[data-icon]')) el.outerHTML = icon(el.dataset.icon);
}
`);
console.log('icons:', NAMES.length);

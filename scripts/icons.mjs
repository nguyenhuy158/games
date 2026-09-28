// Trích các icon lucide cần dùng thành public/icons.js (vài KB) thay vì tải cả thư viện.
// Thêm icon: thêm tên vào NAMES rồi chạy `pnpm icons`.
import { writeFileSync } from 'node:fs';

const NAMES = ['arrow-left', 'link', 'lightbulb', 'shuffle', 'volume-2', 'volume-x', 'crown', 'trophy', 'users', 'swords', 'zap', 'play', 'rotate-ccw', 'mouse-pointer-2', 'grid-3x3', 'flag', 'paw-print', 'eye', 'layers', 'qr-code', 'share-2', 'copy',
  'crown', 'bot', 'party-popper', 'frown', 'coins', 'dices', 'bomb', 'timer', 'heart', 'heart-off', 'pickaxe',
  'arrow-down', 'gamepad-2', 'moon', 'handshake', 'medal', 'circle-check', 'circle-x', 'info', 'triangle-alert',
  'thumbs-up', 'laugh', 'flame', 'sparkles', 'hourglass', 'smartphone', 'pause', 'x', 'circle'];

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

// Icon dạng element để chèn vào DOM (el(..., iconEl('crown'), 'chữ')).
export function iconEl(name) {
  const t = document.createElement('template');
  t.innerHTML = icon(name);
  return t.content.firstChild;
}

// Thay mọi <i data-icon="tên"> trong root bằng SVG.
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('i[data-icon]')) el.outerHTML = icon(el.dataset.icon);
}
`);
console.log('icons:', NAMES.length);

// Sinh screenshots/README.md từ cây screenshots/<game>/<thiết bị>/*.webp: mỗi game một mục, mỗi thiết bị
// một hàng ảnh nhỏ bấm vào xem ảnh gốc. Chụp thêm / xoá ảnh xong thì chạy lại: node scripts/screenshots-readme.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = 'screenshots';
const GAMES = {
  hub: 'Trang chủ', phong: 'Phòng đang mở', pikachu: 'Pikachu', 'do-min': 'Dò mìn', 'bau-cua': 'Bầu cua', 'o-an-quan': 'Ô ăn quan', 'co-caro': 'Cờ caro',
  'noi-4': 'Nối 4', 'ban-tau': 'Bắn tàu', 'dao-vang': 'Đào Vàng', snake: 'Rắn săn mồi', bantumi: 'Bantumi', pairs: 'Lật hình', logic: 'Logic',
  'rapid-roll': 'Rapid Roll', 'space-impact': 'Space Impact', bounce: 'Bounce',
};
const NOKIA = ['snake', 'bantumi', 'pairs', 'logic', 'rapid-roll', 'space-impact', 'bounce'];
const URL = Object.fromEntries(Object.keys(GAMES).map((g) => [g, g === 'hub' ? '/' : NOKIA.includes(g) ? `/nokia/${g}/` : `/${g}/`]));
// Thiết bị: tên thư mục -> [mô tả, bộ chụp, bề rộng ảnh nhỏ]
const DEVICES = {
  desktop: ['Desktop 1280×800', 'A', 260],
  tablet: ['Tablet 820×1180 (DPR 2, cảm ứng)', 'A', 170],
  phone: ['Điện thoại 390×844 (DPR 2, cảm ứng)', 'A', 130],
  'desktop-1440': ['Desktop 1440×900', 'B', 260],
  'iphone-portrait': ['iPhone 14 Plus dọc 428×926', 'B', 130],
  'iphone-landscape': ['iPhone 14 Plus ngang 926×428', 'B', 260],
};
const NOTES = '<!-- notes -->';

const ls = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }) : []);
const out = [`# Ảnh chụp màn hình

Xem nhanh từng game theo thiết bị — bấm ảnh để mở ảnh gốc. Sinh bởi \`node scripts/screenshots-readme.mjs\` (đừng sửa tay phần trên ghi chú).

| Bộ | Chụp | Thiết bị |
|---|---|---|
| **A** | Playwright + Chrome headless trên prod https://games.huyab.click, sau commit \`0d8c435\` (tên ngẫu nhiên, nút bốc tên, XO 3×3) | ${Object.entries(DEVICES).filter(([, d]) => d[1] === 'A').map(([k]) => `\`${k}\``).join(', ')} |
| **B** (mới nhất) | browser-use (Chrome CDP) trên prod https://games.huyab.click, sau commit \`2a72320\` (trang chủ chia nhóm, Nokia màn tràn, song ngữ, công tắc Công khai) — mọi game: sảnh → phòng chờ → đang chơi | ${Object.entries(DEVICES).filter(([, d]) => d[1] === 'B').map(([k]) => `\`${k}\``).join(', ')} |

**Mục lục:** ${Object.entries(GAMES).map(([k, v]) => `[${v}](#${slug(v)})`).join(' · ')}
`];

function slug(s) {
  return s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-');
}

for (const [game, title] of Object.entries(GAMES)) {
  const devs = ls(`${ROOT}/${game}`).filter((d) => d.isDirectory()).map((d) => d.name)
    .sort((a, b) => Object.keys(DEVICES).indexOf(a) - Object.keys(DEVICES).indexOf(b));
  if (!devs.length) continue;
  out.push(`## ${title}\n\nhttps://games.huyab.click${URL[game]}\n`);
  for (const dev of devs) {
    const [label, set, w] = DEVICES[dev] ?? [dev, '?', 200];
    const files = ls(`${ROOT}/${game}/${dev}`).map((f) => f.name).filter((f) => /\.(webp|png|jpe?g)$/.test(f)).sort();
    out.push(`### ${label} · bộ ${set} · \`${game}/${dev}/\`\n`);
    out.push(`<table><tr>${files.map((f) => {
      const p = `${game}/${dev}/${f}`;
      return `<td align="center" valign="top"><a href="${p}"><img src="${p}" width="${w}" alt="${f}"></a><br><sub>${f.replace(/\.\w+$/, '')}</sub></td>`;
    }).join('')}</tr></table>\n`);
  }
}

// Giữ phần ghi chú viết tay (sau dấu NOTES) khi sinh lại.
const old = existsSync(`${ROOT}/README.md`) ? readFileSync(`${ROOT}/README.md`, 'utf8') : '';
const notes = old.includes(NOTES) ? old.slice(old.indexOf(NOTES) + NOTES.length).trim() : '';
out.push(`${NOTES}\n\n${notes}\n`);
writeFileSync(`${ROOT}/README.md`, out.join('\n'));
console.log('screenshots/README.md', out.length, 'blocks');

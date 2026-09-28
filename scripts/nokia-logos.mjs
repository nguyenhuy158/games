// Logo kawaii các game Nokia: chiếc điện thoại mặt cười, màn LCD xanh vẽ pixel của từng game.
// Cùng phong cách scripts/logos.mjs (nền pastel bo tròn, viền nâu, sticker trắng, lấp lánh).
// Chạy: node scripts/nokia-logos.mjs -> public/logos/<game>.svg + -192/-512.png (cần Google Chrome).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const INK = '#4b2c2c', BLUSH = '#ff8fa3', LCD = '#c7f0d8', PIX = '#43523d';
const sparkle = (x, y, s, fill = '#fff') =>
  `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
function face(cx, cy, k) {
  const e = (x) => `<ellipse cx="${x}" cy="${cy}" rx="${13 * k}" ry="${17 * k}" fill="${INK}"/><circle cx="${x - 4 * k}" cy="${cy - 6 * k}" r="${5 * k}" fill="#fff"/>`;
  const dx = 40 * k, my = cy + 26 * k;
  return `${e(cx - dx)}${e(cx + dx)}
    <ellipse cx="${cx - dx - 22 * k}" cy="${cy + 24 * k}" rx="${18 * k}" ry="${10 * k}" fill="${BLUSH}" opacity=".75"/>
    <ellipse cx="${cx + dx + 22 * k}" cy="${cy + 24 * k}" rx="${18 * k}" ry="${10 * k}" fill="${BLUSH}" opacity=".75"/>
    <path d="M${cx - 14 * k} ${my}q${7 * k} ${10 * k} ${14 * k} 0q${7 * k} ${10 * k} ${14 * k} 0" fill="none" stroke="${INK}" stroke-width="${6 * k}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
const sticker = (shape) => `<g stroke="#fff" stroke-width="34" stroke-linejoin="round" fill="#fff">${shape}</g>${shape}`;
const frame = (id, c1, c2, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="${id}" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>
    <clipPath id="${id}c"><rect x="8" y="8" width="496" height="496" rx="120"/></clipPath>
  </defs>
  <rect x="8" y="8" width="496" height="496" rx="120" fill="url(#${id})"/>
  <g clip-path="url(#${id}c)">${body}</g>
  <rect x="8" y="8" width="496" height="496" rx="120" fill="none" stroke="${INK}" stroke-width="12"/>
</svg>`;

// Màn LCD 16×10 ô (mỗi ô 13px) tại (152, 96); pixel = '#'.
const LX = 152, LY = 100, P = 13;
const pixels = (rows) => rows.flatMap((r, y) => [...r].map((c, x) => (c === '#' ? `<rect x="${LX + x * P}" y="${LY + y * P}" width="${P}" height="${P}" fill="${PIX}"/>` : ''))).join('');
const phone = (id, c1, c2, rows) => frame(id, c1, c2, `
  ${sticker(`<rect x="126" y="52" width="260" height="420" rx="70" fill="#5d7690" stroke="${INK}" stroke-width="12"/>`)}
  <rect x="140" y="88" width="232" height="154" rx="18" fill="#1d2b36"/>
  <rect x="${LX - 4}" y="${LY - 4}" width="216" height="138" rx="8" fill="${LCD}"/>
  ${pixels(rows)}
  <ellipse cx="200" cy="80" rx="46" ry="10" fill="#fff" opacity=".25"/>
  ${face(256, 330, 0.62)}
  <rect x="206" y="404" width="100" height="30" rx="15" fill="#b8f07a" stroke="${INK}" stroke-width="8"/>
  ${sparkle(86, 110, 26)}${sparkle(436, 118, 22, '#ffe066')}${sparkle(430, 420, 18)}${sparkle(80, 420, 16, '#ffe066')}`);

export const NOKIA_LOGOS = {
  snake: phone('ns', '#eaffd9', '#9be564', [
    '................', '..###########...', '..#.........#...', '..#..####...#...', '..#..#..#...#...',
    '..####..#...#.#.', '.........#####..', '..............#.', '.......#........', '......###.......']),
  bantumi: phone('nb', '#fff1d6', '#f7b267', [
    '................', '.##..##..##..##.', '#..##..##..##..#', '#..##..##..##..#', '.##..##..##..##.',
    '................', '.##..##..##..##.', '#..##..##..##..#', '#..##..##..##..#', '.##..##..##..##.']),
  pairs: phone('np', '#fde7ff', '#e0a8ff', [
    '................', '.#####....#####.', '.#...#....#.#.#.', '.#.#.#....##.##.', '.#...#....#.#.#.',
    '.#####....#####.', '................', '.#####....#####.', '.##.##....#...#.', '.#####....#####.']),
  logic: phone('nl', '#e6f0ff', '#9fb7e8', [
    '................', '.##..##..##..##.', '#..##..##..##..#', '.##..##..##..##.', '................',
    '.#.#.#.#........', '................', '.##..##..##..##.', '####.##.####.##.', '.##..##..##..##.']),
  'rapid-roll': phone('nr', '#fffbd6', '#ffd84d', [
    '................', '.......##.......', '......####......', '.......##.......', '..#######.......',
    '................', '.......#######..', '................', '.#######.....###', '................']),
  'space-impact': phone('nsi', '#e3f7ff', '#8fd3ff', [
    '................', '.##.........#...', '.###.......###..', '#######...#####.', '.###.#.#.#...#..',
    '.##.........#...', '................', '..........#.#...', '...........#....', '..........#.#...']),
  bounce: phone('nbo', '#ffe3e3', '#ff9a9a', [
    '................', '.....####.......', '....######......', '....######......', '.....####.......',
    '................', '...........###..', '####......#####.', '####......#####.', '################']),
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const tmp = mkdtempSync(join(tmpdir(), 'nk-logos-'));
  for (const [name, svg] of Object.entries(NOKIA_LOGOS)) {
    writeFileSync(`public/logos/${name}.svg`, svg);
    for (const size of [192, 512]) {
      const file = join(tmp, 'p.html');
      writeFileSync(file, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
      execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${size},${size}`,
        '--default-background-color=00000000', `--screenshot=${resolve(`public/logos/${name}-${size}.png`)}`, `file://${file}`], { stdio: 'ignore' });
    }
    console.log('logo', name);
  }
}

// Sinh ảnh tĩnh bằng Chrome headless (chạy tay khi cần đổi, rồi commit ảnh):
//   - public/pikachu/images/tiles.webp: atlas 2880x150 cho cả hai bộ ô (36 ô ngang mỗi bộ):
//     hàng 0 = 36 con vật Twemoji (CC-BY 4.0) 80x100, hàng 100px = Pokémon 40x50 lấy từ
//     scripts/assets/pieces-sprite.png. Khung từng bộ khai báo ở SHEETS trong pikachu/app.js.
//   - public/logos/<game>.svg + -192/-512.png: logo kawaii từng game (scripts/logos.mjs);
//     public/pwa-*.png lấy từ logo trang chủ.
// Chạy: node scripts/render-assets.mjs   (cần Google Chrome + cwebp; đổi CHROME nếu nằm chỗ khác)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TWEMOJI = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg';
const ANIMALS = [
  '1f436', '1f431', '1f42d', '1f439', '1f430', '1f98a', '1f43b', '1f43c', '1f428', '1f42f', '1f981', '1f42e',
  '1f437', '1f438', '1f435', '1f414', '1f427', '1f426', '1f424', '1f986', '1f989', '1f43a', '1f417', '1f434',
  '1f984', '1f41d', '1f41b', '1f98b', '1f40c', '1f41e', '1f422', '1f40d', '1f419', '1f980', '1f420', '1f42c',
];
const W = 80, H = 100; // 2x của 40x50 cho nét trên màn hình retina

const tmp = mkdtempSync(join(tmpdir(), 'pk-assets-'));
function shot(html, out, w, h) {
  const file = join(tmp, 'page.html');
  writeFileSync(file, html);
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`, '--default-background-color=00000000', '--virtual-time-budget=3000',
    `--screenshot=${resolve(out)}`, `file://${file}`,
  ], { stdio: 'ignore' });
  console.log('wrote', out);
}

const svgs = await Promise.all(ANIMALS.map(async (cp) => {
  const r = await fetch(`${TWEMOJI}/${cp}.svg`);
  if (!r.ok) throw new Error(`${cp}: ${r.status}`);
  return r.text();
}));

const atlasPng = join(tmp, 'tiles.png');
shot(`<!doctype html><style>
  html, body { margin: 0; background: transparent; }
  .row { display: flex; }
  .t { width: ${W}px; height: ${H}px; box-sizing: border-box; display: grid; place-items: center;
       background: linear-gradient(160deg, #fff6ea, #f3c9a4); border: 3px solid #e2a77c; border-radius: 10px; }
  .t svg { width: 60px; height: 60px; }
  img { display: block; }
</style><body><div class="row">${svgs.map((s) => `<div class="t">${s}</div>`).join('')}</div>
<img src="file://${resolve('scripts/assets/pieces-sprite.png')}" width="${(W / 2) * ANIMALS.length}" height="${H / 2}"></body>`,
atlasPng, W * ANIMALS.length, H * 1.5);
// q90: không phân biệt được bằng mắt với PNG, nhẹ ~3 lần.
execFileSync('cwebp', ['-quiet', '-q', '90', '-alpha_q', '100', '-m', '6', atlasPng, '-o', 'public/pikachu/images/tiles.webp']);
console.log('wrote public/pikachu/images/tiles.webp');

// Logo kawaii từng game (scripts/logos.mjs): SVG làm favicon, PNG cho icon app / apple-touch.
// Icon PWA của cả trang (public/pwa-*.png) dùng logo trang chủ.
const { LOGOS } = await import('./logos.mjs');
mkdirSync('public/logos', { recursive: true });
for (const [name, svg] of Object.entries(LOGOS)) {
  writeFileSync(`public/logos/${name}.svg`, svg);
  for (const size of [192, 512]) {
    const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
    shot(html, `public/logos/${name}-${size}.png`, size, size);
    if (name === 'hub') shot(html, `public/pwa-${size}.png`, size, size);
  }
}

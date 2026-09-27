// Luật chơi dùng chung cho browser (public/app.js) và Worker (worker/index.js).
// Bàn là mảng (rows+2) x (cols+2): viền ngoài luôn = 0 để đường nối đi vòng ra ngoài.
// 0 = ô trống, 1..TYPES = loại icon (thứ tự trong pieces-sprite.png).

export const TYPES = 36;

// Cỡ bàn phổ biến [cols, rows] (lấy từ bản gốc). Ràng buộc: số ô chia hết cho 4
// và số ô / 4 <= TYPES để mỗi loại icon xuất hiện đúng 4 lần. Màn hình dọc thì
// client tự xoay bàn nên không cần bản đứng riêng.
export const SIZES = [[16, 9], [12, 9], [10, 8], [8, 6]];

// Thời gian MỖI MÀN, 2.5 giây mỗi ô: 16x9 = 6 phút.
export const durationOf = ([cols, rows]) => cols * rows * 2500;

// Các màn như bản gốc: màn 1 đứng yên, từ màn 2 ô dồn về một hướng sau mỗi lần ăn.
export const SLIDES = [null, 'down', 'left', 'up', 'right'];
export const LEVELS = SLIDES.length;
export const SLIDE_ICON = { down: '↓', left: '←', up: '↑', right: '→' };

// Dồn các ô còn lại về hướng dir (tại chỗ). Client và server gọi cùng hàm này
// sau mỗi lần ăn nên bàn hai bên luôn giống nhau.
export function slide(g, dir) {
  if (!dir) return g;
  const R = g.length - 2, C = g[0].length - 2;
  const vertical = dir === 'down' || dir === 'up';
  const toEnd = dir === 'down' || dir === 'right';
  const lines = vertical ? C : R, len = vertical ? R : C;
  for (let i = 1; i <= lines; i++) {
    const at = (j) => (vertical ? [j, i] : [i, j]);
    const vals = [];
    for (let j = 1; j <= len; j++) { const [r, c] = at(j); if (g[r][c]) vals.push(g[r][c]); }
    for (let j = 1; j <= len; j++) {
      const [r, c] = at(j);
      const k = toEnd ? j - (len - vals.length) - 1 : j - 1;
      g[r][c] = k >= 0 && k < vals.length ? vals[k] : 0;
    }
  }
  return g;
}

function shuffleArr(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

export function newBoard([cols, rows] = SIZES[0], rand = Math.random) {
  // Bàn nhỏ dùng ít loại hơn: bốc ngẫu nhiên cols*rows/4 loại, mỗi loại 4 ô.
  const types = Array.from({ length: TYPES }, (_, i) => i + 1);
  shuffleArr(types, rand);
  const tiles = Array.from({ length: cols * rows }, (_, i) => types[i >> 2]);
  shuffleArr(tiles, rand);
  const g = Array.from({ length: rows + 2 }, () => Array(cols + 2).fill(0));
  let k = 0;
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) g[r][c] = tiles[k++];
  if (!findPair(g)) reshuffle(g, rand);
  return g;
}

const same = (r, c, p) => p[0] === r && p[1] === c;

// Đoạn thẳng p -> q không vướng ô nào (trừ 2 đầu mút a, b).
function clear(g, p, q, a, b) {
  const dr = Math.sign(q[0] - p[0]), dc = Math.sign(q[1] - p[1]);
  for (let r = p[0], c = p[1]; ; r += dr, c += dc) {
    if (g[r][c] && !same(r, c, a) && !same(r, c, b)) return false;
    if (r === q[0] && c === q[1]) return true;
  }
}

// Đường nối tối đa 3 đoạn (<= 2 lần rẽ). Mọi đường như vậy có dạng
// a -> (r, a.c) -> (r, b.c) -> b hoặc a -> (a.r, c) -> (b.r, c) -> b,
// nên chỉ cần quét mọi hàng r và mọi cột c. Trả về các điểm gãy, hoặc null.
export function findPath(g, a, b) {
  const t = g[a[0]][a[1]];
  if (!t || t !== g[b[0]][b[1]] || same(a[0], a[1], b)) return null;
  let best = null, bestLen = Infinity;
  const tryVia = (p1, p2) => {
    if (!clear(g, a, p1, a, b) || !clear(g, p1, p2, a, b) || !clear(g, p2, b, a, b)) return;
    const pts = [a, p1, p2, b].filter((p, i, s) => i === 0 || !same(p[0], p[1], s[i - 1]));
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
    if (len < bestLen) { best = pts; bestLen = len; }
  };
  for (let r = 0; r < g.length; r++) tryVia([r, a[1]], [r, b[1]]);
  for (let c = 0; c < g[0].length; c++) tryVia([a[0], c], [b[0], c]);
  return best;
}

export function findPair(g) {
  const byType = {};
  for (let r = 1; r < g.length - 1; r++) {
    for (let c = 1; c < g[0].length - 1; c++) {
      const t = g[r][c];
      if (!t) continue;
      for (const p of byType[t] ?? []) if (findPath(g, p, [r, c])) return [p, [r, c]];
      (byType[t] ??= []).push([r, c]);
    }
  }
  return null;
}

export function countLeft(g) {
  let n = 0;
  for (const row of g) for (const t of row) if (t) n++;
  return n;
}

// Xáo các quân còn lại tại chỗ cho tới khi có ít nhất một cặp nối được.
export function reshuffle(g, rand = Math.random) {
  const cells = [], tiles = [];
  for (let r = 1; r < g.length - 1; r++) {
    for (let c = 1; c < g[0].length - 1; c++) if (g[r][c]) { cells.push([r, c]); tiles.push(g[r][c]); }
  }
  for (let tries = 0; tries < 100 && tiles.length; tries++) {
    shuffleArr(tiles, rand);
    cells.forEach(([r, c], i) => { g[r][c] = tiles[i]; });
    if (findPair(g)) return g;
  }
  return g;
}

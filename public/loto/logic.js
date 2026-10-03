// Luật Lô tô Việt Nam (thuần, không DOM). Tờ dò 9 hàng × 9 cột, chia 3 khối 3 hàng; mỗi hàng đúng 5 số + 4 ô trống (45 số / tờ).
// Cột k chứa số trong khoảng của nó (cột 0: 1–9, cột 1: 10–19, ..., cột 8: 80–90), trong cột xếp tăng dần từ trên xuống;
// trong mỗi khối, cột nào cũng có ít nhất một số. Người hô bốc lần lượt các số 1–90 (ngẫu nhiên, không lặp); người chơi dò
// số đã hô trên tờ, hàng ngang nào đủ 5 số đã hô thì bấm KINH.
// Một người có thể cầm nhiều tờ: ô thứ i trong các tờ của người đó = k * CELLS + r * COLS + c (tờ k, hàng r, cột c).
export const ROWS = 9;
export const COLS = 9;
export const BLOCK = 3;
export const PER_ROW = 5;
export const CELLS = ROWS * COLS;
export const PER_CARD = ROWS * PER_ROW;
export const MAX_NUMBER = 90;
// Màu tờ (chỉ số vào bảng màu ở client): đỏ, xanh lá, xanh dương, vàng, tím, cam, hồng, xanh ngọc.
export const COLOR_COUNT = 8;
export const MAX_CARDS = 6;
export const PACES = [0, 3, 5, 8]; // giây giữa hai lần tự hô; 0 = chủ phòng tự bấm

export const colRange = (c) => [c === 0 ? 1 : c * 10, c === COLS - 1 ? MAX_NUMBER : c * 10 + 9];

function pickDistinct(pool, n, rand) {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const ALL_COLS = Array.from({ length: COLS }, (_, c) => c);

// Tờ mới: mảng 9 hàng × 9 cột, ô trống = null.
export function newCard(rand = Math.random) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let b = 0; b < ROWS; b += BLOCK) {
    let rows;
    do rows = Array.from({ length: BLOCK }, () => pickDistinct(ALL_COLS, PER_ROW, rand));
    while (new Set(rows.flat()).size < COLS);
    rows.forEach((cs, i) => { for (const c of cs) grid[b + i][c] = 0; });
  }
  for (let c = 0; c < COLS; c++) {
    const rows = grid.map((row, r) => (row[c] === 0 ? r : -1)).filter((r) => r >= 0);
    const [min, max] = colRange(c);
    const nums = pickDistinct(Array.from({ length: max - min + 1 }, (_, i) => min + i), rows.length, rand).sort((a, b) => a - b);
    rows.forEach((r, i) => { grid[r][c] = nums[i]; });
  }
  return grid;
}

// Khoá so trùng: hai tờ cùng khoá là một tờ.
export const cardKey = (grid) => grid.flat().join(',');

// Số chưa hô kế tiếp (ngẫu nhiên); hô hết rồi thì null.
export function nextNumber(called, rand = Math.random) {
  const seen = new Set(called);
  const left = [];
  for (let n = 1; n <= MAX_NUMBER; n++) if (!seen.has(n)) left.push(n);
  return left.length ? left[Math.floor(rand() * left.length)] : null;
}

// Số ở ô i trong các tờ (null nếu ô trống / ngoài tờ).
export function numberAt(cards, i) {
  if (!Number.isInteger(i) || i < 0 || i >= cards.length * CELLS) return null;
  const k = Math.floor(i / CELLS), j = i % CELLS;
  return cards[k][Math.floor(j / COLS)][j % COLS];
}

// Đánh được ô i không: ô có số, số đã hô, chưa đánh.
export function canMark(cards, called, marked, i) {
  const v = numberAt(cards, i);
  return v != null && !marked.includes(i) && called.includes(v);
}

// Các ô (chỉ số i) có số n trên các tờ.
export const cellsOf = (cards, n) => rowsOf(cards).flatMap((row) => row.cells.filter((_, j) => row.nums[j] === n));

// Mỗi hàng của các tờ: { k, r, nums: 5 số, cells: 5 ô }.
export function rowsOf(cards) {
  return cards.flatMap((grid, k) => grid.map((row, r) => {
    const cells = [], nums = [];
    row.forEach((v, c) => {
      if (v != null) { cells.push(k * CELLS + r * COLS + c); nums.push(v); }
    });
    return { k, r, nums, cells };
  }));
}

// Hàng kinh được: đủ 5 số đã hô (server kiểm theo số đã hô, không theo ô người chơi tự đánh).
export function kinhRows(cards, called) {
  const set = new Set(called);
  return rowsOf(cards).filter((row) => row.nums.every((n) => set.has(n)));
}

// Hàng đang CHỜ: đã đánh 4 số, còn thiếu đúng 1 số chưa hô -> { k, r, n: số đang chờ }.
export function waitRows(cards, called, marked) {
  const hit = new Set(marked), seen = new Set(called);
  return rowsOf(cards).flatMap(({ k, r, nums, cells }) => {
    const miss = cells.filter((i) => !hit.has(i));
    if (miss.length !== 1) return [];
    const n = nums[cells.indexOf(miss[0])];
    return seen.has(n) ? [] : [{ k, r, n }];
  });
}

// Hàng nhiều số đã hô nhất (0–5): độ gần kinh của một người.
export function bestRow(cards, called) {
  const set = new Set(called);
  return Math.max(0, ...rowsOf(cards).map((row) => row.nums.filter((n) => set.has(n)).length));
}

// Hàng đánh được nhiều ô nhất (0–5): hiện cạnh tên người chơi (4 = đang chờ).
export function bestMarked(cards, marked) {
  const hit = new Set(marked);
  return Math.max(0, ...rowsOf(cards).map((row) => row.cells.filter((i) => hit.has(i)).length));
}

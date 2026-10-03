// Luật Lô tô (thuần, không DOM): mỗi người một phiếu 3 hàng × 9 cột, mỗi hàng đúng 5 số (15 số / phiếu).
// Cột k chứa số trong khoảng của nó (cột 0: 1–9, cột 1: 10–19, ..., cột 8: 80–90), trong cột xếp tăng dần từ trên xuống.
// Chủ phòng gọi lần lượt các số 1–90 (ngẫu nhiên, không lặp); người chơi dò số đã gọi trên phiếu, ai kín một hàng 5 số trước là KINH.
// Ô trên phiếu đánh số r * COLS + c.
export const ROWS = 3;
export const COLS = 9;
export const PER_ROW = 5;
export const MAX_NUMBER = 90;

export const colRange = (c) => [c === 0 ? 1 : c * 10, c === COLS - 1 ? MAX_NUMBER : c * 10 + 9];

function pickDistinct(pool, n, rand) {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// Phiếu mới: mảng 3 hàng × 9 cột, ô trống = null.
export function newCard(rand = Math.random) {
  const cols = Array.from({ length: COLS }, (_, c) => c);
  const rowCols = Array.from({ length: ROWS }, () => pickDistinct(cols, PER_ROW, rand));
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let c = 0; c < COLS; c++) {
    const rows = [0, 1, 2].filter((r) => rowCols[r].includes(c));
    const [min, max] = colRange(c);
    const nums = pickDistinct(Array.from({ length: max - min + 1 }, (_, i) => min + i), rows.length, rand).sort((a, b) => a - b);
    rows.forEach((r, i) => { grid[r][c] = nums[i]; });
  }
  return grid;
}

// Số chưa gọi kế tiếp (ngẫu nhiên); gọi hết rồi thì null.
export function nextNumber(called, rand = Math.random) {
  const seen = new Set(called);
  const left = [];
  for (let n = 1; n <= MAX_NUMBER; n++) if (!seen.has(n)) left.push(n);
  return left.length ? left[Math.floor(rand() * left.length)] : null;
}

// Đánh được ô i không: ô có số, số đã gọi, chưa đánh.
export function canMark(card, called, marked, i) {
  if (!Number.isInteger(i) || i < 0 || i >= ROWS * COLS || marked.includes(i)) return false;
  const v = card[Math.floor(i / COLS)][i % COLS];
  return v != null && called.includes(v);
}

// Hàng kín (cả 5 số đã đánh) đầu tiên, không có thì -1.
export function wonRow(card, marked) {
  const set = new Set(marked);
  return card.findIndex((row, r) => row.every((v, c) => v == null || set.has(r * COLS + c)));
}

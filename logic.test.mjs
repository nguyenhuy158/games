// node logic.test.mjs
import assert from 'node:assert/strict';
import { ROWS, COLS, TYPES, newBoard, findPath, findPair, countLeft, reshuffle } from './public/logic.js';

const empty = () => Array.from({ length: ROWS + 2 }, () => Array(COLS + 2).fill(0));

// Kề nhau: 1 đoạn.
let g = empty();
g[1][1] = g[1][2] = 5;
assert.deepEqual(findPath(g, [1, 1], [1, 2]), [[1, 1], [1, 2]]);

// Khác loại / cùng ô: không nối.
g[1][3] = 6;
assert.equal(findPath(g, [1, 1], [1, 3]), null);
assert.equal(findPath(g, [1, 1], [1, 1]), null);

// Bị chặn giữa -> phải vòng qua viền ngoài (2 lần rẽ).
g = empty();
g[1][1] = g[1][3] = 5;
g[1][2] = 7;
assert.deepEqual(findPath(g, [1, 1], [1, 3]), [[1, 1], [0, 1], [0, 3], [1, 3]]);

// Bàn đầy quân 9, chỉ khoét hành lang: U 3 đoạn hợp lệ, bịt đáy là hết đường.
const walled = () => {
  const w = empty();
  for (let r = 1; r <= ROWS; r++) for (let c = 1; c <= COLS; c++) w[r][c] = 9;
  return w;
};
g = walled();
g[5][5] = g[5][7] = 1;
g[6][5] = g[6][6] = g[6][7] = 0;
assert.deepEqual(findPath(g, [5, 5], [5, 7]), [[5, 5], [6, 5], [6, 7], [5, 7]]);
g[6][6] = 9;
assert.equal(findPath(g, [5, 5], [5, 7]), null);

// Hành lang bậc thang cần 3 lần rẽ -> không hợp lệ.
g = walled();
g[5][5] = g[7][7] = 1;
g[6][5] = g[6][6] = g[7][6] = 0;
assert.equal(findPath(g, [5, 5], [7, 7]), null);

// Bàn mới: đủ 4 ô mỗi loại, viền trống, luôn có nước đi.
g = newBoard();
assert.equal(countLeft(g), ROWS * COLS);
const counts = {};
for (const row of g) for (const t of row) if (t) counts[t] = (counts[t] ?? 0) + 1;
assert.equal(Object.keys(counts).length, TYPES);
assert.ok(Object.values(counts).every((n) => n === 4));
assert.ok(g[0].every((t) => t === 0) && g.every((row) => row[0] === 0 && row[COLS + 1] === 0));
assert.ok(findPair(g));

// Xáo giữ nguyên số quân và vị trí trống.
const before = countLeft(g);
g[1][1] = 0;
reshuffle(g);
assert.equal(g[1][1], 0);
assert.equal(countLeft(g), before - 1);

// Chơi hết bàn bằng findPair phải về 0 quân.
g = newBoard();
for (let p; (p = findPair(g)) || countLeft(g); ) {
  if (!p) { reshuffle(g); continue; }
  g[p[0][0]][p[0][1]] = g[p[1][0]][p[1][1]] = 0;
}
assert.equal(countLeft(g), 0);

console.log('logic ok');

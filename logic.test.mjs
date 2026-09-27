// node logic.test.mjs
import assert from 'node:assert/strict';
import { SIZES, TYPES, LEVELS, SLIDES, durationOf, slide, newBoard, findPath, findPair, countLeft, reshuffle } from './public/pikachu/logic.js';

const [COLS, ROWS] = SIZES[0];

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

// Mọi cỡ bàn: hợp lệ, mỗi loại đúng 4 ô, chơi hết bằng findPair phải về 0 quân.
assert.equal(durationOf(SIZES[0]), 6 * 60 * 1000);
for (const [cols, rows] of SIZES) {
  assert.equal((cols * rows) % 4, 0);
  assert.ok(cols * rows / 4 <= TYPES);
  g = newBoard([cols, rows]);
  assert.equal(g.length, rows + 2);
  assert.equal(g[0].length, cols + 2);
  const n = {};
  for (const row of g) for (const t of row) if (t) n[t] = (n[t] ?? 0) + 1;
  assert.ok(Object.values(n).every((v) => v === 4), `${cols}x${rows} mỗi loại 4 ô`);
  for (let p; (p = findPair(g)) || countLeft(g); ) {
    if (!p) { reshuffle(g); continue; }
    g[p[0][0]][p[0][1]] = g[p[1][0]][p[1][1]] = 0;
  }
  assert.equal(countLeft(g), 0);
}

// Ô trượt: dồn đúng hướng, giữ thứ tự, không mất quân.
const mini = () => [
  [0, 0, 0, 0, 0],
  [0, 1, 0, 2, 0],
  [0, 0, 3, 0, 0],
  [0, 4, 0, 5, 0],
  [0, 0, 0, 0, 0],
];
assert.deepEqual(slide(mini(), 'down').map((r) => r.slice(1, 4)).slice(1, 4), [[0, 0, 0], [1, 0, 2], [4, 3, 5]]);
assert.deepEqual(slide(mini(), 'up').map((r) => r.slice(1, 4)).slice(1, 4), [[1, 3, 2], [4, 0, 5], [0, 0, 0]]);
assert.deepEqual(slide(mini(), 'left').map((r) => r.slice(1, 4)).slice(1, 4), [[1, 2, 0], [3, 0, 0], [4, 5, 0]]);
assert.deepEqual(slide(mini(), 'right').map((r) => r.slice(1, 4)).slice(1, 4), [[0, 1, 2], [0, 0, 3], [0, 4, 5]]);
assert.deepEqual(slide(mini(), null), mini());
assert.equal(LEVELS, SLIDES.length);

// Chơi hết mọi màn có trượt vẫn về 0 quân, viền luôn trống.
for (const dir of SLIDES) {
  g = newBoard(SIZES[3]);
  for (let p; (p = findPair(g)) || countLeft(g); ) {
    if (!p) { reshuffle(g); continue; }
    g[p[0][0]][p[0][1]] = g[p[1][0]][p[1][1]] = 0;
    slide(g, dir);
    assert.ok(g[0].every((t) => !t) && g.at(-1).every((t) => !t) && g.every((r) => !r[0] && !r.at(-1)));
  }
  assert.equal(countLeft(g), 0);
}

console.log('logic ok');

await import('./dao-vang.test.mjs');

import assert from 'node:assert/strict';
import { mergeLine, slide, addTile, newGame, isOver, emptyCells } from './public/2048/logic.js';

// Gộp: mỗi ô chỉ gộp một lần mỗi lượt, gộp từ phía dồn tới.
assert.deepEqual(mergeLine([2, 2, 2, 0]), { line: [4, 2, 0, 0], gain: 4 });
assert.deepEqual(mergeLine([2, 2, 2, 2]), { line: [4, 4, 0, 0], gain: 8 });
assert.deepEqual(mergeLine([4, 4, 8, 0]), { line: [8, 8, 0, 0], gain: 8 }, 'merged 8 does not merge again');
assert.deepEqual(mergeLine([0, 2, 0, 2]), { line: [4, 0, 0, 0], gain: 4 }, 'gaps close before merging');
assert.deepEqual(mergeLine([2, 4, 8, 16]), { line: [2, 4, 8, 16], gain: 0 });

// Trượt 4 hướng trên cùng một bàn.
const g = [
  2, 2, 0, 4,
  0, 0, 0, 4,
  2, 0, 0, 0,
  0, 0, 0, 8,
];
assert.deepEqual(slide(g, 'left').grid.slice(0, 4), [4, 4, 0, 0]);
assert.deepEqual(slide(g, 'right').grid.slice(0, 4), [0, 0, 4, 4]);
const up = slide(g, 'up');
assert.deepEqual([0, 4, 8, 12].map((i) => up.grid[i]), [4, 0, 0, 0], 'column 0 merges upward');
assert.deepEqual([3, 7, 11, 15].map((i) => up.grid[i]), [8, 8, 0, 0]);
assert.equal(up.gain, 12);
const down = slide(g, 'down');
assert.deepEqual([3, 7, 11, 15].map((i) => down.grid[i]), [0, 0, 8, 8]);
assert.equal(slide(g, 'left').moved, true);
// Bàn đã dồn sát và không còn cặp gộp theo hướng đó: không phải lượt hợp lệ (không sinh ô mới).
const settled = [2, 4, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 16, 2, 0, 0];
assert.equal(slide(settled, 'left').moved, false);
assert.deepEqual(slide(settled, 'left').grid, settled);

// Ô mới: vào ô trống, 2 hoặc 4 theo xác suất; bàn đầy thì giữ nguyên.
const one = [0, ...Array(15).fill(2)];
assert.equal(addTile(one, () => 0.5)[0], 2);
assert.equal(addTile(one, () => 0.05)[0], 4);
const full = Array(16).fill(2);
assert.equal(addTile(full), full);
for (let k = 0; k < 50; k++) {
  const ng = newGame();
  assert.equal(16 - emptyCells(ng).length, 2, 'new game starts with 2 tiles');
  assert.ok(ng.every((v) => [0, 2, 4].includes(v)));
}

// Hết ván: đầy và không còn cặp kề nhau giống nhau.
const stuck = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
assert.equal(isOver(stuck), true);
assert.equal(isOver([...stuck.slice(0, 15), 0]), false, 'empty cell');
const pair = [...stuck];
pair[15] = 4; // kề ô 14 (4) theo hàng
assert.equal(isOver(pair), false, 'adjacent pair left');
console.log('2048 ok');

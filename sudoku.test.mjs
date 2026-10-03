import assert from 'node:assert/strict';
import { N, HOLES, formatTime, isValid, solvedBoard, newPuzzle, markConflicts, isFull, isSolved } from './public/sudoku/logic.js';

const digits = (a) => [...a].sort((x, y) => x - y).join('');
const ALL = '123456789';

// Lời giải: mỗi hàng / cột / khối có đủ 1–9.
for (let k = 0; k < 5; k++) {
  const b = solvedBoard();
  for (let i = 0; i < N; i++) {
    assert.equal(digits(b[i]), ALL, 'row');
    assert.equal(digits(b.map((row) => row[i])), ALL, 'column');
    const r0 = Math.floor(i / 3) * 3, c0 = (i % 3) * 3;
    assert.equal(digits(b.slice(r0, r0 + 3).flatMap((row) => row.slice(c0, c0 + 3))), ALL, 'box');
  }
}
// Đề: đúng số ô khoét theo độ khó, số đề cho khớp lời giải.
for (const d of ['easy', 'medium', 'hard']) {
  const { board, solution } = newPuzzle(d);
  const givens = board.flat().filter((c) => c.given);
  assert.equal(givens.length, N * N - HOLES[d]);
  board.forEach((row, r) => {
    row.forEach((c, k) => {
      assert.equal(c.given, c.value != null);
      if (c.given) assert.equal(c.value, solution[r][k]);
    });
  });
  assert.equal(isFull(board), false);
}
// isValid trên bàn số.
{
  const b = Array.from({ length: N }, () => Array(N).fill(0));
  b[0][0] = 5;
  assert.equal(isValid(b, 0, 8, 5), false, 'same row');
  assert.equal(isValid(b, 8, 0, 5), false, 'same column');
  assert.equal(isValid(b, 2, 2, 5), false, 'same box');
  assert.equal(isValid(b, 4, 4, 5), true);
}
// Trùng số: đánh dấu cả hai ô; sửa lại thì hết lỗi; điền đúng lời giải là giải xong.
{
  const { board, solution } = newPuzzle('easy');
  const cells = board.flatMap((row, r) => row.map((c, k) => ({ c, r, k })));
  const hole = cells.find((x) => !x.c.given && board[x.r].some((c) => c.given));
  const clash = board[hole.r].find((c) => c.given); // số đề cho cùng hàng
  hole.c.value = clash.value;
  markConflicts(board);
  assert.equal(hole.c.error, true);
  assert.equal(clash.error, true);
  hole.c.value = null;
  markConflicts(board);
  assert.ok(board.flat().every((c) => !c.error));
  for (const x of cells) if (!x.c.given) x.c.value = solution[x.r][x.k];
  markConflicts(board);
  assert.equal(isFull(board), true);
  assert.equal(isSolved(board), true);
}
assert.equal(formatTime(75), '1:15');
assert.equal(formatTime(5), '0:05');
assert.equal(formatTime(3600), '60:00');
console.log('sudoku ok');

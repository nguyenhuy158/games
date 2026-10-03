import assert from 'node:assert/strict';
import { W, H, SHAPES, TYPES, TICK_MS, LEVELS, DEFAULT_LEVEL, tickMs, newGame, spawn, shift, rotate, rotateShape, hardDrop, tick, collides } from './public/tetris/logic.js';

const pick = (type) => () => (TYPES.indexOf(type) + 0.5) / TYPES.length; // rand cho ra đúng loại khối

// Sinh khối giữa đỉnh bàn.
{
  const s = newGame();
  assert.equal(spawn(s, pick('I')), true);
  assert.deepEqual([s.piece.type, s.piece.x, s.piece.y], ['I', 3, 0]);
  spawn(s, pick('T'));
  assert.equal(s.piece.x, 4);
}
// Xoay theo chiều kim đồng hồ; xoay / đi vào tường thì đứng yên.
{
  assert.deepEqual(rotateShape(SHAPES.I), [[1], [1], [1], [1]]);
  assert.deepEqual(rotateShape(SHAPES.T), [[1, 0], [1, 1], [1, 0]]);
  assert.deepEqual(rotateShape(rotateShape(rotateShape(rotateShape(SHAPES.L)))), SHAPES.L);
  const s = newGame();
  spawn(s, pick('O'));
  let moved = 0;
  while (shift(s, -1)) moved++;
  assert.equal(s.piece.x, 0);
  assert.equal(moved, 4);
  while (shift(s, 1));
  assert.equal(s.piece.x, W - 2);
  assert.equal(collides(s.board, SHAPES.I, W - 3, 5), true, 'I sticks out of the right wall');
  // I dựng đứng sát tường phải: xoay lại thành nằm ngang sẽ lòi ra -> không xoay.
  spawn(s, pick('I'));
  rotate(s);
  while (shift(s, 1));
  assert.equal(rotate(s), false);
}
// Rơi theo nhịp, chạm đáy thì khoá ở nhịp sau rồi sinh khối mới.
{
  const s = newGame();
  spawn(s, pick('O'));
  assert.equal(tick(s, pick('T')), -1);
  assert.equal(s.piece.y, 1);
  hardDrop(s);
  assert.equal(s.piece.y, H - 2, 'hard drop moves to the floor but does not lock');
  assert.equal(shift(s, -1), true, 'still slides after hard drop');
  assert.equal(tick(s, pick('T')), 0, 'locks on the next tick');
  assert.equal(s.board[H - 1][3], 'O');
  assert.equal(s.piece.type, 'T');
  assert.equal(s.score, 0);
}
// Xoá hàng: 1 hàng 40 điểm, 4 hàng (tetris) 1200 điểm; hàng trên tụt xuống.
{
  const s = newGame();
  for (let x = 0; x < W; x++) if (x < 3 || x > 6) s.board[H - 1][x] = 'Z';
  s.board[H - 2][0] = 'J';
  spawn(s, pick('I'));
  hardDrop(s);
  assert.equal(tick(s, pick('O')), 1);
  assert.equal(s.score, 40);
  assert.ok(s.board[H - 1].every((v, x) => (x === 0 ? v === 'J' : !v)), 'row above dropped down');
  const t = newGame();
  for (let y = H - 4; y < H; y++) for (let x = 1; x < W; x++) t.board[y][x] = 'S';
  spawn(t, pick('I'));
  rotate(t);
  while (shift(t, -1));
  hardDrop(t);
  assert.equal(tick(t, pick('O')), 4);
  assert.equal(t.score, 1200);
  assert.ok(t.board.every((row) => row.every((v) => !v)));
}
// Khối mới chạm ngay lúc sinh -> hết ván.
{
  const s = newGame();
  for (let x = 0; x < W; x++) s.board[0][x] = 'L';
  assert.equal(spawn(s), false);
  assert.equal(s.over, true);
  assert.equal(s.piece, null);
  assert.equal(tick(s), -1);
}
// Độ khó: càng khó nhịp rơi càng ngắn; mức lạ thì về mặc định.
{
  assert.equal(tickMs(DEFAULT_LEVEL), TICK_MS);
  assert.ok(tickMs('normal') > tickMs('hard') && tickMs('hard') > tickMs('expert'));
  assert.equal(tickMs('nope'), TICK_MS);
  assert.equal(tickMs('toString'), TICK_MS);
  assert.equal(Object.keys(LEVELS)[0], DEFAULT_LEVEL);
}
console.log('tetris ok');

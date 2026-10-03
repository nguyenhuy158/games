import assert from 'node:assert/strict';
import { ROWS, COLS, drop, winLine, full, botMove, LEVELS } from './public/noi-4/logic.js';
import { c4 } from './worker/games/caro.js';

const at = (r, c) => r * COLS + c;
const empty = () => new Array(ROWS * COLS).fill(0);
// Thả lần lượt các cột, người đi luân phiên từ 1.
const play = (...cols) => { const b = empty(); cols.forEach((c, k) => { b[drop(b, c)] = (k % 2) + 1; }); return b; };

// Rơi xuống đáy, chồng lên nhau, cột đầy thì -1
const b0 = empty();
assert.equal(drop(b0, 3), at(5, 3));
b0[at(5, 3)] = 1;
assert.equal(drop(b0, 3), at(4, 3));
const tall = play(0, 0, 0, 0, 0, 0);
assert.equal(drop(tall, 0), -1, 'full column');

// Ngang, dọc, 2 đường chéo
assert.ok(winLine(play(0, 0, 1, 1, 2, 2, 3), at(5, 3)), 'horizontal');
assert.ok(winLine(play(0, 1, 0, 1, 0, 1, 0), at(2, 0)), 'vertical');
// Chéo "/": 1 ở (5,0) (4,1) (3,2) (2,3)
const d = empty();
for (const [r, c] of [[5, 0], [4, 1], [3, 2], [2, 3]]) d[at(r, c)] = 1;
assert.deepEqual(winLine(d, at(3, 2)), [at(2, 3), at(3, 2), at(4, 1), at(5, 0)]);
const e = empty();
for (const [r, c] of [[2, 3], [3, 4], [4, 5], [5, 6]]) e[at(r, c)] = 2;
assert.ok(winLine(e, at(5, 6)), 'diagonal \\');
assert.equal(winLine(play(0, 0, 1, 1, 2), at(5, 2)), null, 'three is not enough');
// Không nối vòng từ mép phải sang hàng trên
const w = empty();
for (const c of [5, 6]) w[at(4, c)] = 1;
for (const c of [0, 1]) w[at(3, c)] = 1;
assert.equal(winLine(w, at(4, 6)), null, 'no row wrap');
assert.ok(!full(empty()) && full(new Array(ROWS * COLS).fill(1)));

// Máy thắng ngay nếu được, chặn nếu đối thủ sắp thắng, bàn trống vào giữa
const winNow = empty();
for (const c of [0, 1, 2]) winNow[at(5, c)] = 2;
assert.equal(botMove(winNow, 2), 3, 'bot takes the win');
const block = empty();
for (const c of [1, 2, 3]) block[at(5, c)] = 1;
block[at(5, 0)] = 2; block[at(4, 1)] = 2;
assert.equal(botMove(block, 2), 4, 'bot blocks a horizontal three');
const stack = empty();
for (const r of [5, 4, 3]) stack[at(r, 6)] = 1;
assert.equal(botMove(stack, 2), 6, 'bot blocks a vertical three');
assert.equal(botMove(empty(), 1, () => 0), 3, 'opening in the centre');

// Độ khó: mọi mức vẫn thắng ngay khi được (trừ lúc Dễ đánh bừa); Dễ có lúc đánh bừa; Khó chặn cả thế đôi 2 nước tới.
assert.equal(LEVELS.length, 3);
for (const lv of [0, 1, 2]) assert.equal(botMove(winNow, 2, () => 0.99, lv), 3, `level ${lv} takes the win`);
assert.equal(botMove(winNow, 2, () => 0, 0), 3, 'easy random pick uses the rand() stream (0 -> first open column = centre)');
const moves = new Set(Array.from({ length: 60 }, () => botMove(empty(), 1, Math.random, 0)));
assert.ok(moves.size > 1, 'easy is not deterministic');
// Đỏ có 2 quân đáy giữa (cột 2,3), vàng đi: không chặn thì đỏ tạo thế đôi 1-2-3-4 -> Khó phải chặn một đầu.
const trap = empty();
trap[at(5, 2)] = 1; trap[at(5, 3)] = 1; trap[at(4, 3)] = 2;
assert.ok([1, 4].includes(botMove(trap, 2, () => 0.99, 2)), 'hard blocks the open-two trap');

// Server (worker/games/caro.js, module c4) là trọng tài: đúng lượt, cột hợp lệ, cột đầy bị từ chối, thắng do server tính.
{
  const ends = [];
  const ctx = { g: {}, cfg: { ...c4.cfg }, keep: {}, seats: ['a', 'b'], wakeAt: () => {}, end: (r) => ends.push(r), name: (id) => id };
  c4.start(ctx);
  const [first, second] = ctx.g.seats;
  const mv = (id, i) => c4.msg(ctx, { id }, { t: 'move', i });
  assert.equal(mv(second, 3), false, 'not your turn');
  for (const bad of [-1, COLS, 2.5, '3', undefined]) assert.equal(mv(first, bad), false, `bad column ${bad}`);
  assert.equal(mv('watcher', 3), false, 'spectators cannot move');
  // Lấp đầy cột 6 xen kẽ: quân rơi từ đáy lên, nước thứ 7 vào cột đầy bị từ chối.
  for (let k = 0; k < ROWS; k++) assert.equal(mv(k % 2 ? second : first, 6), true);
  assert.equal(ctx.g.board[at(0, 6)], 2);
  assert.equal(mv(first, 6), false, 'full column');
  // Quân 1 nối ngang ở đáy cột 1-4 -> thắng, ván khoá.
  for (const c of [1, 1, 2, 2, 3, 3]) mv(ctx.g.turn === 1 ? first : second, c);
  assert.equal(mv(first, 4), true);
  assert.equal(ctx.g.winner, 1);
  assert.deepEqual(ctx.g.line, [at(5, 1), at(5, 2), at(5, 3), at(5, 4)]);
  assert.equal(ends.length, 1);
  assert.equal(mv(second, 5), false, 'game over');
}

console.log('noi-4 ok');

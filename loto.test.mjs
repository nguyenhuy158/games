import assert from 'node:assert/strict';
import { ROWS, COLS, PER_ROW, MAX_NUMBER, colRange, newCard, nextNumber, canMark, wonRow } from './public/loto/logic.js';
import mod from './worker/games/loto.js';

// Phiếu: 3 hàng × 5 số, số đúng khoảng của cột, tăng dần trong cột, không trùng.
for (let k = 0; k < 300; k++) {
  const card = newCard();
  assert.equal(card.length, ROWS);
  for (const row of card) assert.equal(row.filter((n) => n != null).length, PER_ROW);
  const nums = card.flat().filter((n) => n != null);
  assert.equal(new Set(nums).size, ROWS * PER_ROW);
  for (let c = 0; c < COLS; c++) {
    const [min, max] = colRange(c);
    const col = card.map((row) => row[c]).filter((n) => n != null);
    assert.ok(col.every((n) => n >= min && n <= max), `column ${c} range`);
    assert.deepEqual(col, [...col].sort((a, b) => a - b), `column ${c} sorted`);
  }
}
assert.deepEqual([colRange(0), colRange(1), colRange(8)], [[1, 9], [10, 19], [80, 90]]);

// Gọi số: không lặp, đủ 90 số rồi hết.
{
  const called = [];
  for (let n = nextNumber(called); n != null; n = nextNumber(called)) called.push(n);
  assert.equal(called.length, MAX_NUMBER);
  assert.equal(new Set(called).size, MAX_NUMBER);
}

// Đánh dấu chỉ ô có số đã gọi, chưa đánh; kín một hàng là thắng.
const CARD = [
  [1, null, 20, null, 40, null, 60, null, 80],
  [null, 11, null, 31, null, 51, null, 71, 81],
  [2, 12, 22, 32, 42, null, null, null, null],
];
assert.equal(canMark(CARD, [1], [], 0), true);
assert.equal(canMark(CARD, [1], [0], 0), false, 'already marked');
assert.equal(canMark(CARD, [20], [], 0), false, 'number not called');
assert.equal(canMark(CARD, [1], [], 1), false, 'blank cell');
assert.equal(canMark(CARD, [1], [], 99), false, 'out of range');
assert.equal(wonRow(CARD, [0, 2, 4, 6]), -1);
assert.equal(wonRow(CARD, [18, 19, 20, 21, 22]), 2);

// Module server: chủ phòng gọi số, người chơi dò số, kín hàng thì hết ván; vào giữa ván được phát phiếu.
{
  let result = null;
  const ctx = {
    g: {}, seats: ['a', 'b'], rand: Math.random, host: () => 'a', name: (id) => ({ a: 'An', b: 'Bình', c: 'Cường' }[id]),
    end: (r) => { result = r; },
  };
  mod.start(ctx);
  assert.equal(ctx.g.called.length, 1, 'first number is called on start');
  assert.ok(ctx.g.cards.a && ctx.g.cards.b);
  assert.equal(mod.view(ctx, 'a').card, ctx.g.cards.a);
  assert.equal(mod.view(ctx, 'x').card, null, 'other cards stay hidden');
  assert.equal(mod.msg(ctx, { id: 'b' }, { a: 'call' }), false, 'only the host calls');
  assert.equal(mod.msg(ctx, { id: 'a' }, { a: 'call' }), true);
  assert.equal(ctx.g.called.length, 2);
  // Phiếu cố định để dò: b thiếu đúng 1 số ở hàng 3 thì kinh.
  ctx.g.cards.b = CARD;
  ctx.g.called = [2, 12, 22, 32, 42, 1];
  const uncalled = CARD[0].indexOf(20);
  assert.equal(mod.msg(ctx, { id: 'b' }, { a: 'mark', i: uncalled }), false, 'cannot mark an uncalled number');
  for (const i of [18, 19, 20, 21, 0]) assert.equal(mod.msg(ctx, { id: 'b' }, { a: 'mark', i }), true);
  assert.equal(result, null);
  mod.join(ctx, { id: 'c' });
  assert.deepEqual(ctx.seats, ['a', 'b', 'c'], 'late joiner gets a seat');
  assert.ok(ctx.g.cards.c);
  const cCard = ctx.g.cards.c;
  mod.join(ctx, { id: 'c' });
  assert.equal(ctx.g.cards.c, cCard, 'reconnect keeps the same card');
  assert.equal(mod.view(ctx, 'a').counts.b, 5);
  mod.msg(ctx, { id: 'b' }, { a: 'mark', i: 22 });
  assert.ok(result, 'full row ends the game');
  assert.deepEqual(result.ranks[0], { id: 'b', score: 6, won: true });
  assert.equal(result.ranks.length, 3);
  assert.deepEqual(result.title, ['Bình KINH!', 'Bình wins — KINH!']);
}
// Gọi hết 90 số mà chưa ai kinh: hết ván không ai thắng.
{
  let result = null;
  const ctx = { g: {}, seats: ['a'], rand: Math.random, host: () => 'a', name: () => 'An', end: (r) => { result = r; } };
  mod.start(ctx);
  while (!result) mod.msg(ctx, { id: 'a' }, { a: 'call' });
  assert.equal(ctx.g.called.length, MAX_NUMBER);
  assert.ok(result.ranks.every((r) => !r.won));
  assert.equal(result.level, MAX_NUMBER);
}
console.log('loto ok');

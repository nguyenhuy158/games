import assert from 'node:assert/strict';
import { ROWS, COLS, BLOCK, PER_ROW, PER_CARD, CELLS, MAX_NUMBER, colRange, newCard, cardKey, nextNumber, canMark, cellsOf, kinhRows, waitRows } from './public/loto/logic.js';
import mod from './worker/games/loto.js';

// Tờ dò: 9 hàng × 9 cột, mỗi hàng đúng 5 số, số đúng khoảng của cột, tăng dần trong cột, không trùng; khối 3 hàng nào cũng đủ 9 cột.
for (let k = 0; k < 300; k++) {
  const card = newCard();
  assert.equal(card.length, ROWS);
  for (const row of card) assert.equal(row.filter((n) => n != null).length, PER_ROW);
  const nums = card.flat().filter((n) => n != null);
  assert.equal(new Set(nums).size, PER_CARD);
  for (let c = 0; c < COLS; c++) {
    const [min, max] = colRange(c);
    const col = card.map((row) => row[c]).filter((n) => n != null);
    assert.ok(col.every((n) => n >= min && n <= max), `column ${c} range`);
    assert.deepEqual(col, [...col].sort((a, b) => a - b), `column ${c} sorted`);
    for (let b = 0; b < ROWS; b += BLOCK) assert.ok(card.slice(b, b + BLOCK).some((row) => row[c] != null), `block ${b / BLOCK} column ${c}`);
  }
}
assert.deepEqual([colRange(0), colRange(1), colRange(8)], [[1, 9], [10, 19], [80, 90]]);

// Hô số: không lặp, đủ 90 số rồi hết.
{
  const called = [];
  for (let n = nextNumber(called); n != null; n = nextNumber(called)) called.push(n);
  assert.equal(called.length, MAX_NUMBER);
  assert.equal(new Set(called).size, MAX_NUMBER);
}

// Tờ cố định: hàng 0 = 1 20 40 60 80, các hàng khác không có số nào trong số đó (và không có 90); ô i = k * 81 + r * 9 + c.
const CARD = [[1, null, 20, null, 40, null, 60, null, 80],
  ...Array.from({ length: ROWS - 1 }, (_, r) => [null, 11 + r, null, 31 + r, null, 51 + r, null, 71 + r, 82 + r])];
const ROW0 = [0, 2, 4, 6, 8];
const cards = [CARD];
assert.equal(canMark(cards, [1], [], 0), true);
assert.equal(canMark(cards, [1], [0], 0), false, 'already marked');
assert.equal(canMark(cards, [20], [], 0), false, 'number not called');
assert.equal(canMark(cards, [1], [], 1), false, 'blank cell');
assert.equal(canMark(cards, [1], [], CELLS), false, 'out of range');
// Kinh theo số đã hô; CHỜ = 4 ô đã đánh, thiếu đúng 1 số chưa hô.
assert.deepEqual(kinhRows(cards, [1, 20, 40, 60]), []);
assert.deepEqual(kinhRows(cards, [1, 20, 40, 60, 80]).map(({ k, r }) => [k, r]), [[0, 0]]);
assert.deepEqual(waitRows(cards, [1, 20, 40, 60], [0, 2, 4, 6]).filter((w) => w.r === 0), [{ k: 0, r: 0, n: 80 }]);
assert.deepEqual(waitRows(cards, [1, 20, 40, 60, 80], [0, 2, 4, 6]).filter((w) => w.r === 0), [], 'missing number already called is not a wait');
assert.deepEqual(waitRows(cards, [1, 20, 40], [0, 2, 4]).filter((w) => w.r === 0), [], 'three marked is not a wait');

// Module server.
const ctxOf = (seats, extra = {}) => {
  const out = { result: null, sent: [], wake: 0, t: 1000 };
  const ctx = {
    g: {}, seats, keep: {}, cfg: { pace: 0 }, rand: Math.random, host: () => seats[0], name: (id) => ({ a: 'An', b: 'Bình', c: 'Cường' }[id]),
    now: () => out.t, allow: () => true, wakeAt: (at) => { out.wake = at; }, sendAll: (m) => out.sent.push(m),
    end: (r) => { out.result = r; }, ...extra,
  };
  return [ctx, out];
};
// Tự hô: mặc định 5 giây; chủ phòng bấm hô số đầu, server hẹn giờ hô tiếp; đổi tốc độ / tắt; KINH thì dừng hẹn.
{
  assert.deepEqual(mod.cfg, { pace: 5 });
  assert.deepEqual(mod.config(mod.cfg, { pace: 3 }), { pace: 3 });
  assert.equal(mod.config(mod.cfg, { pace: 4 }), null);
  const [ctx, out] = ctxOf(['a', 'b'], { cfg: { pace: 5 } });
  mod.start(ctx);
  assert.equal(mod.tick(ctx), false, 'no auto call before the host starts calling');
  mod.msg(ctx, { id: 'a' }, { a: 'call' });
  assert.equal(out.wake, out.t + 5000);
  out.t = out.wake - 1;
  assert.equal(mod.tick(ctx), false, 'not early');
  out.t += 1;
  assert.equal(mod.tick(ctx), true);
  assert.equal(ctx.g.called.length, 2, 'server calls by itself');
  assert.equal(out.wake, out.t + 5000, 'and books the next call');
  assert.equal(mod.msg(ctx, { id: 'b' }, { a: 'pace', s: 3 }), false, 'only the host sets the pace');
  assert.equal(mod.msg(ctx, { id: 'a' }, { a: 'pace', s: 4 }), false);
  assert.equal(mod.msg(ctx, { id: 'a' }, { a: 'pace', s: 3 }), true);
  assert.equal(out.wake, out.t + 3000);
  assert.equal(mod.view(ctx, 'b').next, out.wake, 'everyone sees when the next number comes');
  mod.msg(ctx, { id: 'a' }, { a: 'pace', s: 0 });
  out.t = out.wake;
  assert.equal(mod.tick(ctx), false, 'paused');
  mod.msg(ctx, { id: 'a' }, { a: 'pace', s: 8 });
  ctx.g.cards.b = [CARD];
  ctx.g.called = [1, 20, 40, 60, 80];
  mod.msg(ctx, { id: 'b' }, { a: 'kinh' });
  assert.equal(ctx.g.next, 0, 'KINH stops auto calling');
  out.t = out.wake;
  assert.equal(mod.tick(ctx), true);
  assert.equal(ctx.g.called.length, 5, 'no call during the check');
  assert.ok(out.result.ranks[0].won);
}
{
  const [ctx, out] = ctxOf(['a', 'b']);
  mod.start(ctx);
  assert.equal(ctx.g.called.length, 0, 'host starts calling');
  assert.equal(ctx.g.cards.a.length, 1);
  assert.notEqual(cardKey(ctx.g.cards.a[0]), cardKey(ctx.g.cards.b[0]), 'cards in a room differ');
  assert.equal(mod.view(ctx, 'a').cards, ctx.g.cards.a);
  assert.equal(mod.view(ctx, 'x').cards, null, 'other cards stay hidden');
  assert.equal(mod.msg(ctx, { id: 'b' }, { a: 'call' }), false, 'only the host calls');
  assert.equal(mod.msg(ctx, { id: 'a' }, { a: 'call' }), true);
  assert.equal(ctx.g.called.length, 1);
  // b cầm tờ cố định; kinh khi hàng 0 chưa đủ là kinh láo: báo cả phòng, ván vẫn chạy.
  ctx.g.cards.b = [CARD];
  ctx.g.called = [1, 20, 40, 60];
  assert.equal(mod.msg(ctx, { id: 'b' }, { a: 'mark', i: 8 }), false, 'cannot mark an uncalled number');
  for (const i of ROW0.slice(0, 4)) assert.equal(mod.msg(ctx, { id: 'b' }, { a: 'mark', i }), true);
  assert.equal(mod.view(ctx, 'a').best.b, 4, 'others see b waiting');
  assert.equal(mod.msg(ctx, { id: 'b' }, { a: 'kinh' }), false);
  assert.deepEqual(out.sent, [{ t: 'loto', e: 'lao', id: 'b' }]);
  assert.equal(ctx.g.kinh, null);
  // Vào giữa ván được phát tờ; vào lại giữ tờ cũ.
  mod.join(ctx, { id: 'c' });
  assert.deepEqual(ctx.seats, ['a', 'b', 'c'], 'late joiner gets a seat');
  const cCards = ctx.g.cards.c;
  mod.join(ctx, { id: 'c' });
  assert.equal(ctx.g.cards.c, cCards, 'reconnect keeps the same card');
  // Hô 80: b kinh đúng (không cần đã đánh ô) -> dừng hô, chờ dò vé; c cũng kinh số đó thì chia giải.
  ctx.g.called.push(80);
  ctx.g.cards.c = [CARD.map((row) => [...row])];
  assert.equal(mod.msg(ctx, { id: 'b' }, { a: 'kinh' }), true);
  assert.equal(out.wake, out.t + 4000);
  assert.equal(mod.msg(ctx, { id: 'b' }, { a: 'kinh' }), false, 'one claim per player');
  assert.equal(mod.msg(ctx, { id: 'a' }, { a: 'call' }), false, 'calling pauses while checking');
  assert.equal(mod.msg(ctx, { id: 'c' }, { a: 'kinh' }), true);
  assert.equal(mod.tick(ctx), false, 'not before the check ends');
  assert.equal(out.result, null);
  out.t = out.wake;
  assert.equal(mod.tick(ctx), true);
  assert.deepEqual(out.result.ranks.slice(0, 2).map((r) => [r.id, r.won, r.score]), [['b', true, 5], ['c', true, 5]]);
  assert.equal(out.result.ranks[2].won, false);
  assert.deepEqual(out.result.title, ['Bình, Cường cùng KINH — chia giải!', 'Bình, Cường share the win — KINH!']);
  assert.deepEqual(mod.view(ctx, 'a').kinh.wins[0].rows[0].nums, [1, 20, 40, 60, 80]);
}
// Một người kinh: tiêu đề có hàng thắng. Tự dò: server đánh hộ số đã hô và số hô sau.
{
  const [ctx, out] = ctxOf(['a']);
  mod.start(ctx);
  ctx.g.cards.a = [CARD];
  ctx.g.called = [1, 20];
  assert.equal(mod.msg(ctx, { id: 'a' }, { a: 'auto', on: true }), true);
  assert.deepEqual(ctx.g.marked.a, [0, 2]);
  ctx.g.called.push(40, 60);
  ctx.rand = () => 0.999; // còn 86 số: bốc số lớn nhất là 90 (không có trên hàng 0)
  mod.msg(ctx, { id: 'a' }, { a: 'call' });
  ctx.g.called.splice(-1, 1, 80);
  mod.msg(ctx, { id: 'a' }, { a: 'auto', on: true });
  assert.ok(ROW0.every((i) => ctx.g.marked.a.includes(i)));
  mod.msg(ctx, { id: 'a' }, { a: 'kinh' });
  out.t = out.wake;
  mod.tick(ctx);
  assert.deepEqual(out.result.title, ['An KINH! (1 · 20 · 40 · 60 · 80)', 'An wins — KINH! (1 · 20 · 40 · 60 · 80)']);
  assert.equal(mod.view(ctx, 'a').auto, true);
}
// Mua tờ trước số đầu tiên: mỗi màu một tờ (1–6, không trùng màu), màu giữ lại thì giữ tờ; đổi tờ khác; ván sau nhớ lựa chọn.
{
  const [ctx] = ctxOf(['a', 'b']);
  mod.start(ctx);
  const pick = (colors) => mod.msg(ctx, { id: 'a' }, { a: 'pick', colors });
  for (const bad of [[], [0, 0], [0, 1, 2, 3, 4, 5, 6], [8], [1.5], 'x', null]) assert.equal(pick(bad), false, `reject ${JSON.stringify(bad)}`);
  const [first] = ctx.g.colors.a, firstCard = ctx.g.cards.a[0];
  const other = (first + 1) % 8;
  assert.equal(pick([other, first, (first + 2) % 8]), true);
  assert.equal(ctx.g.cards.a.length, 3);
  assert.equal(ctx.g.cards.a[1], firstCard, 'kept colour keeps its card');
  const keys = Object.values(ctx.g.cards).flat().map(cardKey);
  assert.equal(new Set(keys).size, keys.length, 'no repeated card in the room');
  assert.equal(mod.msg(ctx, { id: 'a' }, { a: 'swap', k: 1 }), true);
  assert.notEqual(ctx.g.cards.a[1], firstCard, 'swap deals another card');
  assert.equal(mod.msg(ctx, { id: 'a' }, { a: 'swap', k: 3 }), false);
  mod.msg(ctx, { id: 'a' }, { a: 'call' });
  assert.equal(pick([first]), false, 'no buying once calling started');
  assert.equal(mod.msg(ctx, { id: 'a' }, { a: 'swap', k: 0 }), false);
  // Ô của tờ thứ 3 (k = 2): i = 2 * 81 + c; đánh được khi số đã hô, ô cùng số ở tờ khác vẫn để trống.
  const top = ctx.g.cards.a[2][0], c = top.findIndex((v) => v != null && !ctx.g.called.includes(v));
  ctx.g.called.push(top[c]);
  assert.equal(mod.msg(ctx, { id: 'a' }, { a: 'mark', i: 2 * CELLS + c }), true);
  assert.deepEqual(ctx.g.marked.a, [2 * CELLS + c]);
  assert.ok(cellsOf(ctx.g.cards.a, top[c]).includes(2 * CELLS + c));
  mod.start(Object.assign(ctx, { g: {} }));
  assert.deepEqual(ctx.g.colors.a, [other, first, (first + 2) % 8], 'next round remembers the pick');
  assert.equal(ctx.g.cards.a.length, 3);
}
// Hô hết 90 số mà chưa ai kinh: hết ván không ai thắng.
{
  const [ctx, out] = ctxOf(['a']);
  mod.start(ctx);
  while (!out.result) mod.msg(ctx, { id: 'a' }, { a: 'call' });
  assert.equal(ctx.g.called.length, MAX_NUMBER);
  assert.ok(out.result.ranks.every((r) => !r.won));
  assert.equal(out.result.level, MAX_NUMBER);
}
console.log('loto ok');

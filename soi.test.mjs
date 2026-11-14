import assert from 'node:assert/strict';
import { MIN_PLAYERS, MAX_PLAYERS, ROUND_TTL_MS, WOLF, VILLAGER, pickWolf, roleOf } from './public/soi/logic.js';
import soi from './worker/games/soi.js';

const seats = ['a', 'b', 'c', 'd', 'e'];

// Chọn Sói: biên của rand, luôn là một người ngồi ghế
{
  assert.equal(pickWolf(seats, () => 0), 'a');
  assert.equal(pickWolf(seats, () => 0.999999), 'e');
  assert.equal(pickWolf(seats, () => 1), 'e', 'rand = 1 do làm tròn vẫn không vượt ghế');
  assert.equal(pickWolf(seats, () => 0.5), 'c');
  assert.equal(pickWolf(['x'], () => 0.7), 'x');
}
// Phân bố: ai cũng có thể làm Sói (12 ghế, 1200 lần)
{
  const twelve = Array.from({ length: MAX_PLAYERS }, (_, i) => `p${i}`);
  const hit = new Set();
  for (let i = 0; i < 1200; i++) hit.add(pickWolf(twelve, Math.random));
  assert.equal(hit.size, MAX_PLAYERS);
}
// Vai: đúng 1 Sói, còn lại Dân; người xem / chưa có Sói thì chưa có vai
{
  const roles = seats.map((id) => roleOf('c', seats, id));
  assert.equal(roles.filter((r) => r === WOLF).length, 1);
  assert.equal(roles.filter((r) => r === VILLAGER).length, 4);
  assert.equal(roleOf('c', seats, 'watcher'), null);
  assert.equal(roleOf(undefined, seats, 'a'), null);
}

// Module server với ctx giả
function room(ids, { rand = Math.random, host = ids[0] } = {}) {
  const ended = [], wakes = [];
  const ctx = {
    g: {}, keep: {}, seats: ids, rand, host: () => host, now: () => 1_000,
    name: (id) => `Tên ${id}`, end: (r) => ended.push(r), wakeAt: (at) => wakes.push(at),
  };
  return { ctx, ended, wakes };
}
assert.equal(soi.max, MAX_PLAYERS);
assert.equal(soi.page, '/soi/');
assert.equal(soi.persist, true, 'rớt mạng giữa ván không xoá phòng');
assert.equal(soi.leave, undefined, 'socket đóng không được tính là bỏ cuộc (điện thoại ngủ)');
assert.equal(soi.tickMs, undefined, 'không có nhịp đều, chỉ có một giờ hết hạn');
assert.equal(soi.replay, false, 'không ghi bản xem lại (vai bí mật)');

// Ít hơn MIN_PLAYERS: server chặn, không chọn Sói
{
  const { ctx, ended } = room(['a', 'b']);
  soi.start(ctx);
  assert.equal(ctx.g.wolf, undefined);
  assert.equal(ended.length, 1);
  assert.match(ended[0].title[0], new RegExp(`${MIN_PLAYERS}`));
  assert.deepEqual(ended[0].ranks, []);
  assert.equal(soi.view(ctx, 'a').role, null);
}
// Đủ người: đúng 1 Sói, mỗi người chỉ thấy vai của mình
{
  const { ctx, ended } = room(seats, { rand: () => 0.5 });
  soi.start(ctx);
  assert.equal(ended.length, 0);
  assert.equal(ctx.g.wolf, 'c');
  const views = seats.map((id) => soi.view(ctx, id));
  assert.equal(views.filter((v) => v.role === WOLF).length, 1);
  assert.equal(soi.view(ctx, 'c').role, WOLF);
  for (const v of views) {
    assert.equal(v.wolf, null, 'chưa lật bài: không lộ Sói');
    assert.equal(JSON.stringify(v).includes('"c"'), false, 'view không chứa id người khác');
  }
  assert.equal(soi.view(ctx, 'watcher').role, null, 'người xem không có vai');
}
// Lật bài: chỉ chủ phòng, một lần, rồi mới lộ Sói
{
  const { ctx, ended } = room(seats, { rand: () => 0.5 });
  soi.start(ctx);
  assert.equal(soi.msg(ctx, { id: 'b' }, { a: 'reveal' }), false, 'không phải chủ phòng');
  assert.equal(soi.msg(ctx, { id: 'a' }, { a: 'nope' }), false, 'tin lạ');
  assert.equal(ended.length, 0);
  assert.equal(soi.msg(ctx, { id: 'a' }, { a: 'reveal' }), true);
  assert.deepEqual(ended[0].title, ['Sói là Tên c', 'The wolf is Tên c']);
  assert.deepEqual(ended[0].ranks, []);
  assert.equal(soi.view(ctx, 'b').wolf, 'c', 'sau khi lật, ai cũng thấy Sói');
  assert.equal(soi.msg(ctx, { id: 'a' }, { a: 'reveal' }), false, 'lật lần hai bị bỏ qua');
  assert.equal(ended.length, 1);
}
// Hết hạn: hẹn giờ lúc bắt đầu, tới giờ thì ván tự kết thúc (và lộ Sói); ván đã lật rồi thì bỏ qua
{
  const { ctx, ended, wakes } = room(seats, { rand: () => 0.5 });
  soi.start(ctx);
  assert.deepEqual(wakes, [1_000 + ROUND_TTL_MS]);
  assert.equal(soi.tick(ctx), true);
  assert.deepEqual(ended[0].title, ['Ván đã hết hạn', 'The round expired']);
  assert.equal(soi.view(ctx, 'a').wolf, 'c');
  assert.equal(soi.tick(ctx), false, 'không kết thúc hai lần');
  assert.equal(ended.length, 1);
  const done = room(seats, { rand: () => 0.5 });
  soi.start(done.ctx);
  soi.msg(done.ctx, { id: 'a' }, { a: 'reveal' });
  assert.equal(soi.tick(done.ctx), false, 'đã lật bài thì hết hạn không làm gì');
  assert.equal(done.ended.length, 1);
}
// Ván mới: đếm ván tăng và chọn lại Sói
{
  const { ctx } = room(seats, { rand: () => 0 });
  soi.start(ctx);
  assert.equal(ctx.g.round, 1);
  assert.equal(ctx.g.wolf, 'a');
  ctx.g = {};
  ctx.rand = () => 0.99;
  soi.start(ctx);
  assert.equal(ctx.g.round, 2);
  assert.equal(ctx.g.wolf, 'e');
  assert.equal(ctx.g.done, undefined, 'ván mới chưa lật');
}
console.log('soi ok');

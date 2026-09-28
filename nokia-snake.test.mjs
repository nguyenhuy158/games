import assert from 'node:assert/strict';
import { createGame, turn, step, over, ranking, COLS, ROWS } from './public/nokia/snake/logic.js';

const r0 = () => 0; // mồi luôn rơi vào ô trống đầu tiên -> dễ đoán
// Đi thẳng, ăn mồi thì dài ra
{
  const g = createGame(['a']);
  const s = g.snakes[0];
  assert.equal(s.body.length, 3);
  g.food = [s.body[0][0] + 1, s.body[0][1]];
  step(g, r0);
  assert.equal(s.score, 1);
  step(g, r0);
  assert.equal(s.body.length, 4, 'grows by one after eating');
}
// Không quay đầu 180°, xếp hàng tối đa 2 lượt
{
  const g = createGame(['a']);
  const s = g.snakes[0];
  assert.equal(turn(s, 'left'), false, 'no reverse');
  assert.equal(turn(s, 'up'), true);
  assert.equal(turn(s, 'left'), true);
  assert.equal(turn(s, 'down'), false, 'queue full');
  const [x, y] = s.body[0];
  step(g); step(g);
  assert.deepEqual(s.body[0], [x - 1, y - 1]);
}
// Không tường: đi xuyên; có tường: chết
{
  const g = createGame(['a'], { walls: false });
  const s = g.snakes[0];
  s.body = [[COLS - 1, 5], [COLS - 2, 5], [COLS - 3, 5]];
  g.food = [0, 0];
  step(g);
  assert.deepEqual(s.body[0], [0, 5], 'wraps around');
  const w = createGame(['a'], { walls: true });
  w.snakes[0].body = [[COLS - 1, 5], [COLS - 2, 5], [COLS - 3, 5]];
  w.food = [0, 0];
  step(w);
  assert.equal(w.snakes[0].alive, false);
  assert.equal(over(w), true);
}
// Cắn thân mình chết; đi vào ô đuôi vừa rời thì không sao
{
  const g = createGame(['a']);
  const s = g.snakes[0];
  s.body = [[5, 5], [6, 5], [6, 6], [5, 6]]; // hình vuông, đầu đi xuống vào ô đuôi (5,6)
  s.dir = 'down';
  g.food = [20, 10];
  step(g);
  assert.equal(s.alive, true, 'tail cell is free this step');
  const h = createGame(['a']);
  h.snakes[0].body = [[5, 5], [6, 5], [6, 6], [5, 6], [4, 6]];
  h.snakes[0].dir = 'down';
  h.food = [20, 10];
  step(h);
  assert.equal(h.snakes[0].alive, false, 'bites own body');
}
// Nhiều người: đâm đầu nhau chết cả hai; con sống sót xếp nhất
{
  const g = createGame(['a', 'b', 'c']);
  const [a, b, c] = g.snakes;
  a.body = [[5, 5], [4, 5], [3, 5]]; a.dir = 'right';
  b.body = [[7, 5], [8, 5], [9, 5]]; b.dir = 'left';
  c.body = [[5, 10], [4, 10], [3, 10]]; c.dir = 'right';
  g.food = [20, 0];
  step(g);
  assert.equal(a.alive || b.alive, false, 'head-on: both die');
  assert.equal(c.alive, true);
  assert.equal(over(g), true);
  assert.equal(ranking(g)[0].id, 'c');
}
// Bọ thưởng ra sau mỗi 5 mồi
{
  const g = createGame(['a']);
  const s = g.snakes[0];
  for (let k = 0; k < 5; k++) {
    g.food = [s.body[0][0] + 1, s.body[0][1]];
    step(g, r0);
  }
  assert.ok(g.bug, 'bug spawned');
  assert.ok(g.bug.at[0] >= 0 && g.bug.at[1] < ROWS);
}
// Module server, sân riêng: mỗi người 1 thế giới, hết khi tất cả chết, xếp theo điểm
{
  const mod = (await import('./worker/games/snake.js')).default;
  let result = null;
  const ctx = { g: {}, seats: ['a', 'b'], cfg: mod.config(mod.cfg, { mode: 'solo', walls: true }), rand: r0, end: (r) => { result = r; } };
  mod.start(ctx);
  assert.equal(ctx.g.worlds.length, 2);
  const [wa, wb] = ctx.g.worlds;
  assert.notEqual(wa.food, wb.food, 'separate food');
  wb.snakes[0].score = 7;
  assert.equal(mod.view(ctx, 'a').snakes.length, 1, 'sees only own snake');
  assert.equal(mod.view(ctx, 'a').board.length, 2, 'board has everyone');
  assert.equal(mod.view(ctx, 'x').snakes[0].id, 'b', 'spectator watches the leader');
  for (let i = 0; i < 60 && !result; i++) mod.tick(ctx);
  assert.ok(result, 'ends when all crash into walls');
  assert.equal(result.mode, 'race');
  assert.equal(result.ranks[0].id, 'b');
  assert.equal(result.ranks[0].won, true);
}
console.log('nokia-snake ok');

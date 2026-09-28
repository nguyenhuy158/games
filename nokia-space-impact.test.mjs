import assert from 'node:assert/strict';
import { createWorld, step, KINDS, TOP, H, LIVES } from './public/nokia/space-impact/logic.js';

const r0 = () => 0.5;
const tick = (w, n) => { for (let i = 0; i < n && !w.over; i++) step(w); return w; };
// Tàu di chuyển trong giới hạn, bắn theo nhịp
{
  const w = createWorld(['a'], r0);
  const s = w.ships[0];
  s.keys = { up: true, fire: true };
  tick(w, 40);
  assert.equal(s.y, TOP, 'clamped to top');
  assert.ok(w.bullets.length >= 3, 'auto-fire while holding');
  s.keys = { right: true };
  tick(w, 100);
  assert.ok(s.x <= 42, 'stays in left half');
}
// Bắn hạ quái được điểm
{
  const w = createWorld(['a'], r0);
  const s = w.ships[0];
  w.spawnAt = 1e9;
  w.enemies.push({ kind: 'a', x: 40, y: s.y, base: s.y, hp: 1, phase: 0, cool: 9 });
  s.keys = { fire: true };
  tick(w, 20);
  assert.equal(w.enemies.length, 0, 'enemy destroyed');
  assert.equal(s.score, KINDS.a.pts);
  assert.equal(w.score, KINDS.a.pts);
}
// Trúng đạn mất mạng + bất tử 2 giây; hết mạng -> hết ván
{
  const w = createWorld(['a'], r0);
  const s = w.ships[0];
  s.invul = 0;
  w.spawnAt = 1e9;
  w.shots.push({ x: s.x + 2, y: s.y + 2, vx: 0, vy: 0 });
  step(w);
  assert.equal(s.lives, LIVES - 1);
  assert.ok(s.invul > 1.5);
  s.lives = 1; s.invul = 0;
  w.shots.push({ x: s.x + 2, y: s.y + 2, vx: 0, vy: 0 });
  step(w);
  assert.equal(w.over, true, 'all ships down -> over');
}
// Hết đợt thì ra trùm; hạ trùm sang màn 2; hạ trùm màn cuối thì thắng
{
  const w = createWorld(['a'], r0);
  w.ships[0].invul = 1e9;
  w.spawnAt = 1e9;
  w.t = 40;
  step(w);
  assert.ok(w.boss, 'boss appears after the wave');
  w.boss.hp = 1;
  w.boss.x = 60; // đã bay vào màn
  w.bullets.push({ x: w.boss.x - 3, y: w.boss.y + 3, by: 'a' });
  step(w);
  assert.equal(w.level, 2, 'next level');
  w.level = 3; w.phase = 'boss'; w.boss = { x: 60, y: 20, hp: 1, max: 1, dir: 1, cool: 9 };
  w.bullets.push({ x: 60, y: 23, by: 'a' });
  step(w);
  assert.equal(w.won, true);
  assert.equal(w.over, true);
}
// Nhiều tàu: một tàu chết, tàu kia còn thì chưa hết ván
{
  const w = createWorld(['a', 'b'], r0);
  w.ships[0].lives = 0;
  step(w);
  assert.equal(w.over, false);
  assert.ok(w.ships[1].y >= TOP && w.ships[1].y <= H);
}
console.log('nokia-space-impact ok');

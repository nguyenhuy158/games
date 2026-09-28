import assert from 'node:assert/strict';
import { createSim, step, score, scrollAt, TOP, H, BALL } from './public/nokia/rapid-roll/logic.js';

const run = (sim, secs, keys = {}) => { for (let i = 0; i < secs * 60; i++) step(sim, 1 / 60, keys); return sim; };
// Cùng hạt giống -> cùng đề
{
  const a = createSim(42), b = createSim(42), c = createSim(7);
  assert.deepEqual(a.plats.map((p) => [p.x, p.spike]), b.plats.map((p) => [p.x, p.spike]));
  assert.notDeepEqual(a.plats.map((p) => p.x), c.plats.map((p) => p.x));
}
// Cuộn tăng dần, có trần tốc độ
assert.equal(scrollAt(0), 0);
assert.ok(scrollAt(10) - scrollAt(9) < scrollAt(40) - scrollAt(39), 'accelerates');
assert.equal(Math.round(scrollAt(100) - scrollAt(99)), 32, 'capped at 32 px/s');
// Đứng yên trên thanh thì bị cuộn lên chạm gai -> mất mạng, hồi sinh bất tử
{
  const s = createSim(1);
  const lives = s.lives;
  let hit = false;
  for (let i = 0; i < 600 && !hit; i++) { step(s, 1 / 60); hit = s.lives < lives; }
  assert.ok(hit, 'resting on a platform eventually hits the top spikes');
  assert.ok(s.invul > 0, 'respawn is invulnerable');
  assert.ok(s.y - scrollAt(s.t) > TOP && s.y - scrollAt(s.t) < H, 'respawned on screen');
}
// Hết mạng -> dead, không chạy tiếp
{
  const s = createSim(3);
  run(s, 120);
  assert.equal(s.dead, true);
  const t = s.t;
  step(s, 1);
  assert.equal(s.t, t, 'dead sim is frozen');
  assert.ok(score(s) > 0);
}
// Rơi: bóng rời thanh thì rơi xuống (đi sang trái mãi)
{
  const s = createSim(5);
  const y = s.y;
  run(s, 0.5, { left: true });
  assert.ok(s.x >= 0 && s.x <= 84 - BALL, 'stays inside screen');
  assert.ok(s.y !== y || s.on, 'falls or stays on a platform');
}
console.log('nokia-rapid-roll ok');

import assert from 'node:assert/strict';
import { LEVELS, createSim, step, jump, tileAt, T, ROWS } from './public/nokia/bounce/logic.js';

// Màn hợp lệ: đủ 8 hàng cùng độ dài, có viền, có cửa đích và vòng
for (const lv of LEVELS) {
  assert.equal(lv.length, ROWS);
  assert.ok(lv.every((r) => r.length === lv[0].length), 'rows same length');
  assert.ok(lv[ROWS - 1].split('').every((c) => c === '#'), 'solid floor');
  assert.ok(lv.some((r) => r.includes('E')) && lv.some((r) => r.includes('o')));
}
const run = (sim, secs, keys = {}, onFrame) => { for (let i = 0; i < secs * 60 && !sim.dead && !sim.finished; i++) { onFrame?.(sim, i); step(sim, 1 / 60, keys); } return sim; };
// Rơi xuống đất và đứng yên
{
  const s = createSim(0);
  run(s, 1);
  assert.equal(s.ground, true);
  assert.equal(tileAt(s.lv, s.x + 3, s.y + 6), '#', 'resting on the floor');
}
// Nhảy lên rồi rơi lại; không xuyên tường
{
  const s = createSim(0);
  run(s, 1);
  const y = s.y;
  jump(s);
  step(s, 1 / 60);
  run(s, 0.2);
  assert.ok(s.y < y - 8, 'jumped up');
  run(s, 1.5);
  assert.equal(s.y, y, 'landed back');
  const w = createSim(0);
  run(w, 3, { left: true });
  assert.ok(w.x >= T, 'left wall blocks');
}
// Gai làm mất mạng rồi hồi sinh chỗ an toàn
{
  const s = createSim(0);
  run(s, 1);
  s.x = 20 * T; s.y = 5 * T; // ngay trên gai cột 20
  run(s, 0.5);
  assert.ok(s.lives < 3, 'spike hurts');
  assert.ok(!s.dead && s.x < 20 * T, 'respawned at safe spot');
}
// Chui vòng thu điểm; cửa chỉ mở khi đủ vòng
{
  const s = createSim(0);
  run(s, 1);
  s.x = 57 * T; s.y = 6 * T; // ngay cửa, chưa có vòng
  run(s, 0.2);
  assert.equal(s.finished, false, 'exit closed without rings');
  s.rings = new Set(['15:4', '27:2', '46:4']);
  run(s, 0.2);
  assert.equal(s.finished, true, 'exit opens with all rings');
  const r = createSim(0);
  run(r, 1);
  r.x = 15 * T; r.y = 4 * T + 2; r.vy = 0;
  step(r, 1 / 60);
  assert.equal(r.rings.size, 1, 'ring collected');
}
console.log('nokia-bounce ok');

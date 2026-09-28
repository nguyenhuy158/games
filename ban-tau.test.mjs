import assert from 'node:assert/strict';
import { N, FLEET, MISS, HIT, SUNK, randomFleet, shoot, botShot } from './public/ban-tau/logic.js';

// Xếp ngẫu nhiên: đủ tàu, đúng độ dài, thẳng hàng liền nhau, không chồng / không chạm nhau (kể cả chéo).
for (let k = 0; k < 200; k++) {
  const ships = randomFleet();
  assert.deepEqual(ships.map((s) => s.length), FLEET);
  const owner = new Map();
  ships.forEach((s, idx) => s.forEach((i) => { assert.ok(!owner.has(i), 'overlap'); owner.set(i, idx); }));
  for (const s of ships) {
    const rs = s.map((i) => Math.floor(i / N)), cs = s.map((i) => i % N);
    const flat = rs.every((r) => r === rs[0]) ? cs : rs;
    assert.ok(rs.every((r) => r === rs[0]) || cs.every((c) => c === cs[0]), 'straight');
    flat.forEach((v, j) => j && assert.equal(v, flat[j - 1] + 1, 'contiguous'));
  }
  for (const [i, idx] of owner) {
    const r = Math.floor(i / N), c = i % N;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
      const o = owner.get(rr * N + cc);
      assert.ok(o === undefined || o === idx, 'ships touch');
    }
  }
}

// Bắn: trượt, trúng, chìm (đánh dấu cả tàu + ô xung quanh), hết tàu, không bắn lại ô cũ
const ships = [[0, 1], [22, 32, 42]];
const shots = new Array(N * N).fill(0);
assert.deepEqual(shoot(ships, shots, 5), { hit: false, sunk: -1, done: false });
assert.equal(shots[5], MISS);
assert.equal(shoot(ships, shots, 5), null, 'already shot');
assert.equal(shoot(ships, shots, 100), null, 'off board');
assert.deepEqual(shoot(ships, shots, 0), { hit: true, sunk: -1, done: false });
assert.equal(shots[0], HIT);
assert.deepEqual(shoot(ships, shots, 1), { hit: true, sunk: 0, done: false });
assert.ok(shots[0] === SUNK && shots[1] === SUNK);
assert.ok([2, 10, 11, 12].every((i) => shots[i] === MISS), 'cells around a sunk ship become misses');
shoot(ships, shots, 22); shoot(ships, shots, 32);
assert.equal(shoot(ships, shots, 42).done, true);

// Máy: bắn nối dài 2 ô trúng thẳng hàng; 1 ô trúng thì bắn kề; không có thì bắn ô chưa bắn, ưu tiên ô "đen"
const s2 = new Array(N * N).fill(0);
s2[44] = HIT; s2[45] = HIT;
for (let k = 0; k < 20; k++) assert.ok([43, 46].includes(botShot(s2)));
const s3 = new Array(N * N).fill(0);
s3[0] = HIT;
for (let k = 0; k < 20; k++) assert.ok([1, 10].includes(botShot(s3)));
const s4 = new Array(N * N).fill(MISS);
s4[57] = 0;
assert.equal(botShot(s4), 57);
for (let k = 0; k < 20; k++) { const i = botShot(new Array(N * N).fill(0)); assert.equal((Math.floor(i / N) + (i % N)) % 2, 0); }
// Máy bắn tới khi chìm hết (không kẹt, không bắn trùng)
const fleet = randomFleet(), mine = new Array(N * N).fill(0);
let n = 0, done = false;
while (!done) { const r = shoot(fleet, mine, botShot(mine)); assert.ok(r, 'bot never repeats'); done = r.done; assert.ok(++n <= N * N); }

console.log('ban-tau ok');

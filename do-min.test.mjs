// Chạy chung với logic.test.mjs.
import assert from 'node:assert/strict';
import { SIZES, HIDDEN, FLAG, BOOM, neighbors, newField, newVis, reveal, chord, toggleFlag, openedCount, safeTotal, cleared } from './public/do-min/logic.js';
import { seeded } from './public/dao-vang/logic.js';
import mod from './worker/games/do-min.js';

assert.deepEqual(neighbors(0, 3, 3).sort(), [1, 3, 4]);
assert.equal(neighbors(4, 3, 3).length, 8);

for (const size of SIZES) {
  const { rows: R, cols: C } = size;
  for (let seed = 1; seed <= 10; seed++) {
    const safe = Math.floor(seeded(seed)() * R * C);
    const f = newField(size, safe, seeded(seed));
    assert.equal(f.mines.reduce((a, b) => a + b), size.mines, 'đúng số mìn');
    assert.ok(![safe, ...neighbors(safe, R, C)].some((i) => f.mines[i]), 'vùng an toàn không có mìn');
    // Mở ô an toàn -> loang ra, không nổ, ô mở là số đúng.
    const vis = newVis(R, C);
    const r = reveal(f, vis, safe, R, C);
    assert.ok(!r.boom && r.opened.length >= 1 && vis[safe] === 0);
    for (const [i, v] of r.opened) assert.equal(v, f.counts[i]);
    // Loang không bao giờ mở mìn.
    assert.ok(vis.every((v, i) => v === HIDDEN || !f.mines[i]));
    // Mở hết ô an toàn -> cleared.
    for (let i = 0; i < R * C; i++) if (!f.mines[i]) reveal(f, vis, i, R, C);
    assert.ok(cleared(vis, size));
    assert.equal(openedCount(vis), safeTotal(size));
  }
}

// Cùng seed -> cùng đề (đua công bằng).
assert.deepEqual(newField(SIZES[1], 40, seeded(9)), newField(SIZES[1], 40, seeded(9)));

// Đạp mìn, cờ, chord trên bàn nhỏ tự dựng:  mìn ở ô 0
//  M 1 .
//  1 1 .
//  . . .
{
  const R = 3, C = 3;
  const mines = [1, 0, 0, 0, 0, 0, 0, 0, 0];
  const f = { mines, counts: mines.map((_, i) => neighbors(i, R, C).reduce((s, j) => s + mines[j], 0)) };
  let vis = newVis(R, C);
  assert.deepEqual(reveal(f, vis, 0, R, C), { opened: [[0, BOOM]], boom: true });
  vis = newVis(R, C);
  const r = reveal(f, vis, 8, R, C);
  assert.equal(r.opened.length, 8, 'loang mở hết trừ mìn');
  assert.equal(vis[0], HIDDEN);
  assert.ok(cleared(vis, { rows: 3, cols: 3, mines: 1 }));
  // cờ
  vis = newVis(R, C);
  assert.equal(toggleFlag(vis, 0), true);
  assert.equal(vis[0], FLAG);
  assert.deepEqual(reveal(f, vis, 0, R, C).opened, [], 'không mở ô cờ');
  assert.equal(toggleFlag(vis, 0), false);
  // chord: mở ô 4 (số 1), cắm cờ ô 0, chord ô 4 -> mở hết xung quanh
  vis = newVis(R, C);
  reveal(f, vis, 4, R, C);
  assert.equal(vis[4], 1);
  assert.equal(chord(f, vis, 4, R, C).opened.length, 0, 'chưa đủ cờ thì không chord');
  toggleFlag(vis, 0);
  const ch = chord(f, vis, 4, R, C);
  assert.ok(!ch.boom && ch.opened.length === 7);
  // chord sai cờ -> nổ
  vis = newVis(R, C);
  reveal(f, vis, 4, R, C);
  toggleFlag(vis, 8);
  assert.equal(chord(f, vis, 4, R, C).boom, true);
  assert.equal(toggleFlag(vis, 4), null, 'không cắm cờ ô đã mở');
}

// Mặt cười làm lại giữa ván: chỉ khi chơi một mình (như Minesweeper cổ điển); có người cùng chơi thì không.
{
  const ctx = (seats) => ({
    g: {}, cfg: { ...mod.cfg }, seats, rand: Math.random, host: () => seats[0], online: () => new Set(seats), order: () => seats,
    send: () => {}, end: () => {}, allow: () => true, name: (id) => id,
  });
  const solo = ctx(['a']);
  mod.start(solo);
  const field = solo.g.field;
  solo.g.units.all.booms = 1;
  assert.equal(mod.msg(solo, { id: 'a' }, { t: 'restart' }), true);
  assert.notEqual(solo.g.field, field, 'new board');
  assert.equal(solo.g.units.all.booms, 0);
  solo.g.over = true;
  assert.equal(mod.msg(solo, { id: 'a' }, { t: 'restart' }), false, 'ended game uses the normal Start');
  const duo = ctx(['a', 'b']);
  mod.start(duo);
  assert.equal(mod.msg(duo, { id: 'a' }, { t: 'restart' }), false, 'not with other players');
}

console.log('do-min ok');

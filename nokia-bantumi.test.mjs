import assert from 'node:assert/strict';
import { newBoard, move, legal, winner, botMove } from './public/nokia/bantumi/logic.js';

// Rải + đi tiếp khi hạt cuối vào kho mình
{
  const b = newBoard(4);
  const r = move(b, 1, 2); // 4 hạt: 3,4,5,6(kho)
  assert.deepEqual(r.path, [3, 4, 5, 6]);
  assert.equal(r.again, true);
  assert.equal(b[6], 1);
  assert.equal(b[2], 0);
}
// Bỏ qua kho đối thủ
{
  const b = newBoard(0);
  b[12] = 3; // người 2 rải: 13(kho mình), 0, 1 — không có kho người 1 (6) trên đường
  move(b, 2, 12);
  assert.equal(b[13], 1);
  const c = newBoard(0);
  c[5] = 9; // người 1 rải qua 6..13 -> bỏ 13, vòng về 0
  move(c, 1, 5);
  assert.equal(c[13], 0, 'skips opponent store');
  assert.equal(c[0], 1);
}
// Ăn: hạt cuối vào hố trống bên mình, đối diện có sỏi
{
  const b = newBoard(0);
  b[0] = 1; b[12] = 5; b[3] = 1; b[9] = 1;
  const r = move(b, 1, 0); // rơi vào 1 (trống), đối diện 11 = 0 -> không ăn
  assert.equal(r.captured, 0);
  const c = newBoard(0);
  c[0] = 2; c[10] = 7; c[5] = 1; c[8] = 1; // rơi vào 2, đối diện 10 có 7 -> ăn 8
  const r2 = move(c, 1, 0);
  assert.equal(r2.captured, 8);
  assert.equal(c[6], 8);
  assert.equal(c[2], 0);
  assert.equal(c[10], 0);
}
// Hết sỏi một bên -> gom, phân thắng thua
{
  const b = newBoard(0);
  b[5] = 1; b[7] = 3; b[6] = 10; b[13] = 5;
  const r = move(b, 1, 5); // hạt vào kho, bên 1 hết sỏi -> kết thúc
  assert.equal(r.over, true);
  assert.equal(r.again, false, 'no extra turn after game over');
  assert.equal(b[13], 8);
  assert.equal(winner(b), 1);
  assert.equal(legal(b, 2, 7), false);
}
// Máy chọn nước đi tiếp / ăn được nhiều, và luôn chọn nước hợp lệ
{
  const b = newBoard(4);
  const i = botMove(b, 1, 5);
  assert.ok(legal(b, 1, i));
  const c = newBoard(0);
  c[0] = 1; c[1] = 1; c[11] = 9; c[7] = 1; // nước 0 rơi vào hố 1? (không trống) ; nước 1 rơi vào 2 trống, đối diện 10 = 0
  c[2] = 0; c[4] = 1; c[8] = 6;           // nước 4 rơi vào 5 trống, đối diện 7 = 1 -> ăn 2; nước ... chọn nước tốt nhất
  assert.ok(legal(c, 1, botMove(c, 1, 3)));
}
// Máy đánh với máy đến hết ván, tổng sỏi luôn giữ nguyên
{
  const b = newBoard(4);
  let p = 1, guard = 0;
  while (guard++ < 200) {
    const r = move(b, p, botMove(b, p, 4));
    assert.equal(b.reduce((a, x) => a + x, 0), 48, 'seeds conserved');
    if (r.over) break;
    if (!r.again) p = 3 - p;
  }
  assert.ok(guard < 200, 'game ends');
}
console.log('nokia-bantumi ok');

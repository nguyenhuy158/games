import assert from 'node:assert/strict';
import { newGame, move, legal, score, winner, botMove, moves, side, owner, players, QUAN } from './public/o-an-quan/logic.js';

const total = (g) => g.b.reduce((a, x) => a + x, 0) + g.cap[1].small + g.cap[2].small + (g.big.reduce((a, x) => a + x, 0) + g.cap[1].big + g.cap[2].big) * 100;
// Rải: bốc ô 1 (5 dân) sang phải -> 2..6; ô sau (7) có dân -> bốc rải tiếp
{
  const g = newGame();
  assert.equal(legal(g, 1, 1, 1), true);
  assert.equal(legal(g, 2, 7, 1), false, 'not your turn');
  assert.equal(legal(g, 1, 7, 1), false, 'not your cell');
  const steps = move(g, 1, 1);
  assert.deepEqual(steps.slice(0, 6), [['pick', 1], ['drop', 2], ['drop', 3], ['drop', 4], ['drop', 5], ['drop', 6]]);
  assert.deepEqual(steps[6], ['pick', 7]);
  assert.equal(total(g), 250, 'stones conserved');
  assert.equal(g.turn, 2);
}
// Ô sau trống -> ăn ô kế; ăn dồn trống - có - trống - có
{
  const g = newGame();
  g.b = [0, 1, 0, 3, 0, 4, 0, 0, 0, 0, 0, 0]; g.big = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  g.b[1] = 1; g.b[2] = 0; // rải 1 dân từ ô 1 sang ô 2; ô 3 có -> bốc 3: 4,5,6; ô 7 trống -> ăn ô 8? trống nên thôi
  const s = move(g, 1, 1);
  assert.deepEqual(s.filter((x) => x[0] === 'pick').map((x) => x[1]), [1, 3]);
  const h = newGame();
  h.b = [0, 1, 0, 0, 2, 0, 3, 0, 0, 0, 0, 0]; h.big = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  move(h, 1, 1); // rải vào 2; ô 3 trống -> ăn ô 4 (2); ô 5 trống -> ăn ô 6 (3 dân, không còn quan)
  assert.equal(h.cap[1].small + h.debt[2], 5, 'chain capture (then player 2, out of stones, borrows all 5)');
  assert.equal(h.debt[2], 5);
}
// Quan non: quan dưới 5 dân chưa ăn được; đủ 5 thì ăn được cả quan
{
  const g = newGame();
  g.b = [2, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]; g.b[4] = 1;
  move(g, 4, 1); // 4 -> 5; ô 6 là quan -> dừng
  assert.equal(g.cap[1].small, 0);
  const k = newGame();
  k.b = [2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 3]; // rải ô 2 sang trái -> 1; ô 0 là quan -> dừng
  move(k, 2, -1);
  assert.equal(k.cap[1].big, 0);
  const m = newGame();
  m.b = [2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3]; // ô 3 sang trái -> 2; ô 1 trống; ô 0 quan non (2 dân) -> không ăn
  move(m, 3, -1);
  assert.equal(m.cap[1].big, 0, 'quan non protected');
  const n2 = newGame({ quanNon: false });
  n2.b = [2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3];
  move(n2, 3, -1);
  assert.equal(score(n2, 1), 2 + QUAN, 'ate quan with its 2 dan');
}
// Hết dân bên mình -> lấy 5 dân đã ăn rải lại; thiếu thì vay
{
  const g = newGame();
  g.b = [5, 0, 0, 0, 0, 1, 5, 2, 0, 0, 0, 0];
  g.cap[2].small = 2; g.cap[1].small = 10; g.turn = 1;
  move(g, 5, 1); // 5 -> 6 (quan): ... ô sau 7 có dân -> bốc tiếp, xong tới lượt 2
  assert.equal(g.turn, 2);
  const seeded = [7, 8, 9, 10, 11].reduce((a, k) => a + g.b[k], 0);
  assert.ok(seeded > 0, 'player 2 has stones to play');
  assert.equal(total(g), 5 + 1 + 5 + 2 + 2 + 10 + 200);
}
// Bot đánh hết ván với chính nó, luôn hợp lệ và kết thúc
{
  let g = newGame(), n = 0;
  while (!g.over && n++ < 500) {
    const m = botMove(g, 3);
    assert.ok(legal(g, g.turn, ...m), 'bot move legal');
    move(g, ...m);
    assert.equal(total(g), 250);
  }
  assert.equal(g.over, true);
  assert.equal(score(g, 1) + score(g, 2), 50 + 2 * QUAN);
  assert.ok([0, 1, 2].includes(winner(g)));
  assert.equal(moves(newGame()).length, 10);
}
// Bot chọn nước ăn được quan
{
  const g = newGame({ quanNon: false });
  g.b = [4, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1];
  const m = botMove(g, 2);
  assert.deepEqual(m, [3, -1]);
}
// 3–5 người: vòng 6n ô, lượt đi vòng, máy tự đánh hết ván, sỏi bảo toàn
for (const n of [3, 4, 5]) {
  const all = (g) => g.b.reduce((a, x) => a + x, 0) + g.cap.slice(1).reduce((a, c) => a + c.small + (c.big * 100), 0) + g.big.reduce((a, x) => a + x, 0) * 100;
  let g = newGame({ n });
  assert.equal(players(g), n);
  assert.equal(g.b.length, 6 * n);
  assert.deepEqual(side(n), [6 * n - 5, 6 * n - 4, 6 * n - 3, 6 * n - 2, 6 * n - 1]);
  assert.equal(owner(6 * n - 1), n);
  assert.equal(moves(g).length, 10);
  const first = all(g);
  const turns = [];
  let c = 0;
  while (!g.over && c++ < 2000) {
    turns.push(g.turn);
    const m = botMove(g, 2);
    assert.ok(legal(g, g.turn, ...m), 'bot move legal');
    move(g, ...m);
    assert.equal(all(g), first, 'stones conserved');
  }
  assert.equal(g.over, true, `${n} players: game ends`);
  assert.deepEqual(turns.slice(0, n), Array.from({ length: n }, (_, i) => i + 1), 'turns go round');
  const pts = Array.from({ length: n }, (_, i) => score(g, i + 1));
  assert.equal(pts.reduce((a, x) => a + x, 0), 25 * n + n * QUAN);
  const w = winner(g);
  assert.ok(w === 0 || pts[w - 1] === Math.max(...pts));
}
// 3 người: hết dân thì vay người nhiều dân nhất, cuối ván trả
{
  const g = newGame({ n: 3 });
  g.b = g.b.map(() => 0); g.big = g.big.map(() => 0);
  g.b[1] = 1; g.big[6] = 1; g.big[12] = 1; g.b[13] = 1;
  g.cap[2].small = 1; g.cap[3].small = 9; g.turn = 1;
  move(g, 1, 1); // 1 -> 2; ô 3 trống, ô 4 trống -> hết lượt; tới người 2: hết dân, có 1 -> vay 4 của người 3
  assert.equal(g.turn, 2);
  assert.deepEqual(g.loans, [[2, 3, 4]]);
  assert.equal(g.debt[2], 4);
  assert.equal(side(2).reduce((a, k) => a + g.b[k], 0), 5);
}
console.log('o-an-quan ok');

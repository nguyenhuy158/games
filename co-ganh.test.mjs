import assert from 'node:assert/strict';
import { N, ADJ, newGame, move, legal, moves, count, botMove } from './public/co-ganh/logic.js';

const at = (r, c) => r * N + c;
const empty = () => ({ b: Array(N * N).fill(0), turn: 1, over: false, winner: 0, moves: 0 });
// Bàn: điểm chẵn có 8 hướng, điểm lẻ chỉ ngang dọc
{
  assert.equal(ADJ[at(2, 2)].length, 8);
  assert.equal(ADJ[at(2, 1)].length, 4);
  assert.equal(ADJ[at(0, 0)].length, 3);
  assert.equal(ADJ[at(0, 1)].length, 3);
  const g = newGame();
  assert.equal(count(g, 1), 8);
  assert.equal(count(g, 2), 8);
  assert.ok(moves(g).length > 0);
  assert.equal(legal(g, 1, at(3, 0), at(2, 0)), false, 'occupied');
  assert.equal(legal(g, 1, at(2, 4), at(2, 3)), true);
  assert.equal(legal(g, 2, at(0, 0), at(1, 1)), false, 'not your turn');
  assert.equal(legal(g, 1, at(3, 0), at(2, 1)), false, '(3,0) is odd: no diagonal');
}
// Gánh ngang: đi vào giữa 2 quân địch -> đổi màu cả hai
{
  const g = empty();
  g.b[at(2, 1)] = 2; g.b[at(2, 3)] = 2; g.b[at(3, 2)] = 1; g.b[at(0, 0)] = 2;
  const r = move(g, at(3, 2), at(2, 2));
  assert.deepEqual(r.ganh.sort((a, b) => a - b), [at(2, 1), at(2, 3)]);
  assert.equal(g.b[at(2, 1)], 1);
  assert.equal(g.b[at(2, 3)], 1);
  assert.equal(g.turn, 2);
}
// Gánh chéo chỉ ở điểm chẵn
{
  const g = empty();
  g.b[at(1, 1)] = 2; g.b[at(3, 3)] = 2; g.b[at(2, 1)] = 1; g.b[at(4, 0)] = 2;
  move(g, at(2, 1), at(2, 2));
  assert.equal(g.b[at(1, 1)], 1, 'diagonal carry through (2,2)');
  const h = empty();
  h.b[at(1, 0)] = 2; h.b[at(3, 2)] = 2; h.b[at(2, 0)] = 1; h.b[at(4, 4)] = 2;
  move(h, at(2, 0), at(2, 1)); // (2,1) lẻ: không có đường chéo (1,0)-(3,2)
  assert.equal(h.b[at(1, 0)], 2);
}
// Vây: quân địch ở góc bị chặn hết đường -> đổi màu; hết quân thì thua
{
  const g = empty();
  g.b[at(0, 0)] = 2; g.b[at(0, 1)] = 1; g.b[at(1, 0)] = 1; g.b[at(2, 2)] = 1;
  const r = move(g, at(2, 2), at(1, 1));
  assert.deepEqual(r.vay, [at(0, 0)]);
  assert.equal(count(g, 2), 0);
  assert.equal(g.over, true);
  assert.equal(g.winner, 1);
}
// Máy đánh với chính nó: luôn hợp lệ, ván kết thúc, tổng quân không đổi
{
  const g = newGame();
  while (!g.over) {
    const m = botMove(g, 2);
    assert.ok(legal(g, g.turn, ...m), 'bot move legal');
    move(g, ...m);
    assert.equal(count(g, 1) + count(g, 2), 16);
  }
  assert.ok([0, 1, 2].includes(g.winner));
}
// Máy thấy nước gánh
{
  const g = empty();
  g.b[at(2, 1)] = 2; g.b[at(2, 3)] = 2; g.b[at(3, 2)] = 1; g.b[at(0, 0)] = 2; g.b[at(4, 4)] = 1;
  assert.deepEqual(botMove(g, 1), [at(3, 2), at(2, 2)]);
}
console.log('co-ganh ok');

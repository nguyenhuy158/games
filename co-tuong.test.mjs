import assert from 'node:assert/strict';
import { COLS, K, A, E, H, R, C, P, newGame, move, legal, moves, inCheck, botMove } from './public/co-tuong/logic.js';

const at = (r, c) => r * COLS + c;
const empty = (turn = 1) => ({ b: Array(90).fill(0), turn, over: false, winner: 0, moves: 0 });
// Khai cuộc: đúng 44 nước cho Đỏ (chuẩn cờ tướng)
{
  const g = newGame();
  assert.equal(moves(g).length, 44);
  assert.equal(legal(g, 1, at(7, 1), at(7, 4)), true, 'pháo đầu');
  assert.equal(legal(g, 1, at(7, 1), at(0, 1)), true, 'pháo ăn mã qua ngòi');
  assert.equal(legal(g, 1, at(9, 1), at(7, 2)), true, 'mã lên');
  assert.equal(legal(g, 1, at(9, 1), at(8, 3)), false, 'mã bị cản chân? (8,1) trống nhưng (9,2) có tượng');
  assert.equal(legal(g, 2, at(0, 0), at(1, 0)), false, 'chưa tới lượt Đen');
}
// Tượng không qua sông, bị cản mắt; sĩ / tướng ở trong cung
{
  const g = empty();
  g.b[at(9, 4)] = K; g.b[at(0, 3)] = -K;
  g.b[at(5, 2)] = E; g.b[at(9, 3)] = A;
  const m = moves(g).filter(([f]) => f === at(5, 2)).map(([, t]) => t);
  assert.ok(!m.includes(at(3, 0)) && !m.includes(at(3, 4)), 'elephant stays home');
  assert.ok(m.includes(at(7, 0)) && m.includes(at(7, 4)));
  g.b[at(6, 3)] = P;
  assert.ok(!moves(g).some(([f, t]) => f === at(5, 2) && t === at(7, 4)), 'elephant eye blocked');
  assert.deepEqual(moves(g).filter(([f]) => f === at(9, 3)).map(([, t]) => t), [at(8, 4)], 'advisor in palace only');
}
// Tốt: chưa qua sông chỉ đi thẳng, qua sông đi ngang được
{
  const g = empty();
  g.b[at(9, 4)] = K; g.b[at(0, 3)] = -K;
  g.b[at(6, 0)] = P; g.b[at(4, 8)] = P;
  const t0 = moves(g).filter(([f]) => f === at(6, 0)).map(([, t]) => t);
  assert.deepEqual(t0, [at(5, 0)]);
  const t1 = moves(g).filter(([f]) => f === at(4, 8)).map(([, t]) => t).sort((a, b) => a - b);
  assert.deepEqual(t1, [at(3, 8), at(4, 7)]);
}
// Lộ mặt tướng: không được đi quân chắn duy nhất ra khỏi cột
{
  const g = empty();
  g.b[at(9, 4)] = K; g.b[at(0, 4)] = -K; g.b[at(5, 4)] = R;
  assert.ok(moves(g).every(([f, t]) => f !== at(5, 4) || t % COLS === 4), 'rook pinned on the file');
  assert.equal(inCheck(g.b, 1), false);
  g.b[at(5, 4)] = 0;
  assert.equal(inCheck(g.b, 1), true, 'flying general = check');
}
// Chiếu bí: xe + xe dồn tướng Đen -> Đen hết nước, Đỏ thắng
{
  const g = empty();
  g.b[at(9, 3)] = K; g.b[at(0, 4)] = -K;
  g.b[at(1, 0)] = R; g.b[at(5, 8)] = R;
  move(g, at(5, 8), at(0, 8)); // xe chiếu hàng 0, xe kia khoá hàng 1
  assert.equal(g.over, true);
  assert.equal(g.winner, 1);
}
// Máy: ăn quân miễn phí, luôn đi nước hợp lệ, không vượt thời gian
{
  const g = empty();
  // Tướng đỏ ở (9,5): không có thế chiếu bí (Xe sang cột 3 thì Tướng đen chạy sang (0,4)), nên ăn Mã là nước tốt nhất.
  g.b[at(9, 5)] = K; g.b[at(0, 3)] = -K; g.b[at(7, 0)] = R; g.b[at(2, 0)] = -H;
  for (const d of [1, 2, 3]) assert.deepEqual(botMove(g, d, 2000, () => 0), [at(7, 0), at(2, 0)], `takes the hanging horse (depth ${d})`);
  // Thế chiếu bí 1 nước: Tướng đỏ (9,4) khoá cột 4, Xe sang cột 3 là bí.
  const mate = empty();
  mate.b[at(9, 4)] = K; mate.b[at(0, 3)] = -K; mate.b[at(7, 0)] = R; mate.b[at(2, 0)] = -H;
  const m = botMove(mate, 2, 2000, () => 0);
  move(mate, ...m);
  assert.equal(mate.winner, 1, 'bot finds mate in 1');
  const h = newGame();
  const t = Date.now();
  for (let n = 0; n < 12 && !h.over; n++) {
    const m = botMove(h, 3, 150);
    assert.ok(legal(h, h.turn, ...m), 'bot move legal');
    move(h, ...m);
  }
  assert.ok(Date.now() - t < 12 * 400, 'bot respects its time budget');
}
console.log('co-tuong ok');

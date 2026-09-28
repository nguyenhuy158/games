import assert from 'node:assert/strict';
import { winLine, botMove, full } from './public/co-caro/logic.js';

const n = 15;
const at = (r, c) => r * n + c;
const put = (b, who, ...rc) => { for (const [r, c] of rc) b[at(r, c)] = who; return b; };
const empty = () => new Array(n * n).fill(0);

// Ngang, dọc, chéo
assert.deepEqual(winLine(put(empty(), 1, [3, 3], [3, 4], [3, 5], [3, 6], [3, 7]), n, at(3, 5)), [at(3, 3), at(3, 4), at(3, 5), at(3, 6), at(3, 7)]);
assert.ok(winLine(put(empty(), 2, [0, 0], [1, 0], [2, 0], [3, 0], [4, 0]), n, at(4, 0)));
assert.ok(winLine(put(empty(), 1, [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]), n, at(4, 4)));
assert.ok(winLine(put(empty(), 1, [2, 8], [3, 7], [4, 6], [5, 5], [6, 4]), n, at(2, 8)), 'anti-diagonal');
assert.equal(winLine(put(empty(), 1, [3, 3], [3, 4], [3, 5], [3, 6]), n, at(3, 6)), null, 'four is not enough');
// 5 quân ở mép phải không được nối sang hàng dưới
assert.equal(winLine(put(empty(), 1, [0, 12], [0, 13], [0, 14], [1, 0], [1, 1]), n, at(0, 14)), null, 'no row wrap');

// Chặn 2 đầu
const blocked = put(put(empty(), 1, [5, 2], [5, 3], [5, 4], [5, 5], [5, 6]), 2, [5, 1], [5, 7]);
assert.equal(winLine(blocked, n, at(5, 4), true), null, 'blocked both ends does not win');
assert.ok(winLine(blocked, n, at(5, 4), false), 'freestyle ignores blocks');
const oneEnd = put(put(empty(), 1, [5, 2], [5, 3], [5, 4], [5, 5], [5, 6]), 2, [5, 1]);
assert.ok(winLine(oneEnd, n, at(5, 4), true), 'one blocked end still wins');
const edge = put(put(empty(), 1, [5, 0], [5, 1], [5, 2], [5, 3], [5, 4]), 2, [5, 5]);
assert.ok(winLine(edge, n, at(5, 2), true), 'board edge is not a block');

// Máy: nước đầu vào giữa; thắng ngay nếu được; chặn 4 của đối thủ.
assert.equal(botMove(empty(), n, 2), at(7, 7));
const b1 = put(empty(), 2, [4, 4], [4, 5], [4, 6], [4, 7]);
put(b1, 1, [8, 8], [8, 9], [8, 10], [8, 11]);
assert.ok([at(4, 3), at(4, 8)].includes(botMove(b1, n, 2)), 'bot takes the win');
const b2 = put(empty(), 1, [6, 3], [6, 4], [6, 5], [6, 6]);
put(b2, 2, [0, 0]);
assert.ok([at(6, 2), at(6, 7)].includes(botMove(b2, n, 2)), 'bot blocks the open four');
const b3 = put(empty(), 1, [9, 5], [9, 6], [9, 7]);
put(b3, 2, [2, 2]);
assert.ok([at(9, 4), at(9, 8), at(9, 3), at(9, 9)].includes(botMove(b3, n, 2)), 'bot blocks the open three');
assert.equal(full(new Array(4).fill(1)), true);
console.log('co-caro ok');

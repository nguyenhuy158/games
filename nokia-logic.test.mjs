import assert from 'node:assert/strict';
import { score, valid, newSecret, SHAPES } from './public/nokia/logic/logic.js';

assert.deepEqual(score([0, 1, 2, 3], [0, 1, 2, 3]), { exact: 4, near: 0 });
assert.deepEqual(score([0, 1, 2, 3], [3, 2, 1, 0]), { exact: 0, near: 4 });
assert.deepEqual(score([0, 0, 1, 1], [0, 1, 0, 5]), { exact: 1, near: 2 });
assert.deepEqual(score([0, 0, 0, 1], [0, 0, 0, 0]), { exact: 3, near: 0 }, 'duplicates count once');
assert.deepEqual(score([1, 2, 3, 4], [1, 1, 1, 1]), { exact: 1, near: 0 });
assert.deepEqual(score([5, 4, 5, 4], [4, 5, 0, 0]), { exact: 0, near: 2 });
assert.equal(valid([0, 1, 2, 5]), true);
assert.equal(valid([0, 1, 2, 6]), false);
assert.equal(valid([0, 1, 2]), false);
assert.equal(valid('0123'), false);
const s = newSecret();
assert.ok(valid(s));
assert.ok(SHAPES.every((x) => x.length === 5 && x.every((r) => r.length === 5)));
console.log('nokia-logic ok');

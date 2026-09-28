import assert from 'node:assert/strict';
import { SYMBOLS, roll, settle, betTotal } from './public/bau-cua/logic.js';

// Cua(4) ra 2 mặt, Tôm(5) 1 mặt, Nai(0) không ra.
const dice = [4, 4, 5];
assert.deepEqual(settle({ a: [100, 0, 0, 0, 50, 0], b: [0, 0, 0, 0, 0, 10], c: [0, 0, 0, 0, 0, 0] }, dice), { a: -100 + 100, b: 10, c: 0 });
assert.deepEqual(settle({ a: [0, 0, 0, 0, 0, 0] }, [1, 1, 1]), { a: 0 });
assert.equal(settle({ a: [0, 20, 0, 0, 0, 0] }, [1, 1, 1]).a, 60, 'ra 3 mặt ăn gấp 3');
assert.equal(betTotal([10, 0, 50, 0, 0, 5]), 65);
assert.equal(betTotal(undefined), 0);
const r = roll();
assert.equal(r.length, 3);
assert.ok(r.every((d) => Number.isInteger(d) && d >= 0 && d < SYMBOLS.length));
assert.deepEqual(roll(() => 0.999), [5, 5, 5]);
console.log('bau-cua ok');

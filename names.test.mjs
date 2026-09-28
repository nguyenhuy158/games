import assert from 'node:assert/strict';
import { uniqueName, otherNames } from './worker/names.js';

assert.equal(uniqueName('Mèo Lười', []), 'Mèo Lười');
assert.equal(uniqueName('Mèo Lười', ['Mèo Lười']), 'Mèo Lười 2');
assert.equal(uniqueName('Mèo Lười', ['Mèo Lười', 'Mèo Lười 2']), 'Mèo Lười 3');
assert.equal(uniqueName('12345678901234567890', ['12345678901234567890']), '123456789012345678 2', 'stays within 20 chars');
assert.deepEqual(otherNames({ a: { id: 'a', name: 'A' }, b: { id: 'b', name: 'B' } }, 'a'), ['B'], 'own name is not a clash');
console.log('names ok');

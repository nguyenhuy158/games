import assert from 'node:assert/strict';
import { createActionGate } from '../../frontend/src/ui/feedback.mjs';

const gate = createActionGate();
const releaseSave = gate.claim('save');
assert.equal(gate.claim('save'), null, 'a pending action cannot submit twice');
const releaseCopy = gate.claim('copy');
assert.equal(typeof releaseCopy, 'function', 'independent actions remain available');
releaseSave();
const releaseNextSave = gate.claim('save');
assert.equal(typeof releaseNextSave, 'function', 'completion permits another submission');
releaseSave();
assert.equal(gate.claim('save'), null, 'an old completion cannot release a newer action');
assert.equal(gate.claim('copy'), null, 'completion does not release other actions');
releaseNextSave();
releaseCopy();
assert.equal(gate.busy('save'), false);
assert.equal(gate.busy('copy'), false);
console.log('feedback action gate ok');

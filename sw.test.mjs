import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildAssets } from './scripts/build-assets.mjs';

buildAssets();
const BUILD_ROOT = 'dist';
const SERVICE_WORKER = `${BUILD_ROOT}/sw.js`;
const INDEX_DOCUMENT = 'index.html';
const INSTALL_EVENT = 'install';
const listeners = new Map();
let core;
let installed = false;
runInNewContext(readFileSync(SERVICE_WORKER, 'utf8'), {
  self: {
    addEventListener: (name, listener) => listeners.set(name, listener),
    skipWaiting: () => { installed = true; },
  },
  caches: { open: async () => ({ addAll: async (paths) => { core = Array.from(paths); } }) },
}, { filename: SERVICE_WORKER });
let installation;
listeners.get(INSTALL_EVENT)({ waitUntil: (promise) => { installation = promise; } });
await installation;
assert.equal(installed, true);
const missing = core.filter((path) => !existsSync(`${BUILD_ROOT}${path.endsWith('/') ? `${path}${INDEX_DOCUMENT}` : path}`));
assert.deepEqual(missing, [], `sw.js caches paths with no built file: ${missing.join(', ')}`);
assert.equal(new Set(core).size, core.length, 'no duplicate cached assets');
console.log('sw ok');

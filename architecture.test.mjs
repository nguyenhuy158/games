import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkDependencies } from './scripts/check-deps.mjs';

const root = mkdtempSync(join(tmpdir(), 'games-architecture-'));
const fixtures = {
  'index.html': '<script type="module" src="/game.js"></script>',
  'shared/rules.js': 'export const score = 1;',
  'backend/src/domain/names.js': 'export { score } from "../../../shared/rules.js";',
  'backend/src/ports.js': 'export const port = 1;',
  'backend/src/application/game.js': 'import "../domain/names.js"; import "../ports.js";',
  'backend/src/adapters/http.js': 'import "../application/game.js";',
  'backend/src/index.js': 'import "./adapters/http.js";',
  'frontend/src/game.js': 'export { score } from "../../shared/rules.js";',
};
const forbidden = [
  ['shared/rules.js', 'import "../frontend/src/game.js";', 'shared/rules.js -> frontend/src/game.js'],
  ['shared/rules.js', 'export * from "../backend/src/domain/names.js";', 'shared/rules.js -> backend/src/domain/names.js'],
  ['shared/rules.js', 'import "node:fs";', 'shared/rules.js -> node:fs'],
  ['shared/rules.js', 'import "cloudflare:workers";', 'shared/rules.js -> cloudflare:workers'],
  ['shared/rules.js', 'import "https://example.com/module.js";', 'shared/rules.js -> https://example.com/module.js'],
  ['shared/rules.js', 'fetch("https://example.com");', 'shared/rules.js: runtime global fetch'],
  ['shared/rules.js', 'document.createElement("div");', 'shared/rules.js: runtime global document'],
  ['backend/src/domain/names.js', 'import "../application/game.js";', 'backend/src/domain/names.js -> backend/src/application/game.js'],
  ['backend/src/application/game.js', 'await import("../adapters/http.js");', 'backend/src/application/game.js -> backend/src/adapters/http.js'],
  ['backend/src/application/game.js', 'export * from "node:fs";', 'backend/src/application/game.js -> node:fs'],
  ['backend/src/adapters/http.js', 'export { default } from "../index.js";', 'backend/src/adapters/http.js -> backend/src/index.js'],
  ['backend/src/adapters/http.js', 'import "../../../frontend/src/game.js";', 'backend/src/adapters/http.js -> frontend/src/game.js'],
  ['frontend/src/game.js', 'import "../../backend/src/ports.js";', 'frontend/src/game.js -> backend/src/ports.js'],
  ['frontend/src/game.js', 'import "./missing.js";', 'frontend/src/game.js: missing module ./missing.js'],
];
try {
  for (const [path, source] of Object.entries(fixtures)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  assert.deepEqual(checkDependencies(root), [], 'inward dependencies are accepted');
  for (const [path, source, expected] of forbidden) {
    writeFileSync(join(root, path), source);
    assert.ok(checkDependencies(root).includes(expected), expected);
    writeFileSync(join(root, path), fixtures[path]);
  }
  writeFileSync(join(root, 'shared/rules.js'), 'const text = "import from node:fs"; export { text };');
  assert.deepEqual(checkDependencies(root), [], 'module-looking strings are not dependencies');
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('architecture boundaries ok');

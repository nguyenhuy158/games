import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT_PATH = resolve(REPO_ROOT, 'dist');
const STATIC_PATH = resolve(REPO_ROOT, 'public');
const FRONTEND_PATH = resolve(REPO_ROOT, 'frontend/src');
const SHARED_PATH = resolve(REPO_ROOT, 'shared');
const INDEX_FILE = 'index.html';
const SHARED_DIRECTORY = 'shared';
const COVERAGE_ENABLED = '1';
const COVERAGE_SCRIPT = resolve(REPO_ROOT, 'tests/support/instrument-browser.mjs');

export function buildAssets() {
  rmSync(OUTPUT_PATH, { recursive: true, force: true });
  mkdirSync(OUTPUT_PATH, { recursive: true });
  cpSync(STATIC_PATH, OUTPUT_PATH, { recursive: true });
  cpSync(FRONTEND_PATH, OUTPUT_PATH, { recursive: true });
  cpSync(SHARED_PATH, resolve(OUTPUT_PATH, SHARED_DIRECTORY), { recursive: true });
  cpSync(resolve(REPO_ROOT, INDEX_FILE), resolve(OUTPUT_PATH, INDEX_FILE));
  if (process.env.E2E_COVERAGE === COVERAGE_ENABLED) execFileSync(process.execPath, [COVERAGE_SCRIPT], { stdio: 'inherit' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAssets();
}

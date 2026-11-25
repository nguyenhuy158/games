import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT_PATH = resolve(REPO_ROOT, 'dist');
const STATIC_PATH = resolve(REPO_ROOT, 'public');
const FRONTEND_PATH = resolve(REPO_ROOT, 'frontend/src');
const SHARED_PATH = resolve(REPO_ROOT, 'shared');
const INDEX_FILE = 'index.html';
const SHARED_DIRECTORY = 'shared';

export function buildAssets() {
  rmSync(OUTPUT_PATH, { recursive: true, force: true });
  mkdirSync(OUTPUT_PATH, { recursive: true });
  cpSync(STATIC_PATH, OUTPUT_PATH, { recursive: true });
  cpSync(FRONTEND_PATH, OUTPUT_PATH, { recursive: true });
  cpSync(SHARED_PATH, resolve(OUTPUT_PATH, SHARED_DIRECTORY), { recursive: true });
  cpSync(resolve(REPO_ROOT, INDEX_FILE), resolve(OUTPUT_PATH, INDEX_FILE));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAssets();
}

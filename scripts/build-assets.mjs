import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAvatar } from '@dicebear/core';
import * as funEmoji from '@dicebear/fun-emoji';
import { AVATAR_COUNT, AVATAR_DIRECTORY, AVATAR_SIZE } from '../frontend/src/soi/avatar.js';
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
  const avatars = resolve(OUTPUT_PATH, AVATAR_DIRECTORY);
  mkdirSync(avatars, { recursive: true });
  for (let index = 0; index < AVATAR_COUNT; index++) {
    const avatar = createAvatar(funEmoji, { seed: String(index), size: AVATAR_SIZE });
    writeFileSync(resolve(avatars, `${index}.svg`), avatar.toString());
  }
  if (process.env.E2E_COVERAGE === COVERAGE_ENABLED) execFileSync(process.execPath, [COVERAGE_SCRIPT], { stdio: 'inherit' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAssets();
}

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createContext, Script } from 'node:vm';
import { parse } from 'acorn';
import * as physics from '../../shared/games/nokia/rapid-roll/logic.js';

const SOURCE_PATH = 'frontend/src/nokia/rapid-roll/game.js';
const ROOT_URL = new URL('../../', import.meta.url);
const SOURCE_URL = new URL(SOURCE_PATH, ROOT_URL);
const ROOT = fileURLToPath(ROOT_URL);
const BASELINE_REVISION = process.env.RAPID_ROLL_FRAME_REVISION;
const SOURCE_ENCODING = 'utf8';
const MODULE_SOURCE_TYPE = 'module';
const ECMASCRIPT_VERSION = 'latest';
const IMPORT_NODE_TYPE = 'ImportDeclaration';
const SOURCE_SEPARATOR = '\n';
const FRAME_STEP_SECONDS = 1 / 60;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_DEATH_SECONDS = 120;
const VM_TIMEOUT_MS = 1000;
const DELAY_AFTER_DEATH_SECONDS = 5;
const NEXT_FRAME_MS = 250;
const START_AT = 10_000;
const ME = 'frame-player';
const SEEDS = [1, 42, 2026];
const DEATH_FREQUENCY = 100;
const DEATH_BEEP_MS = 400;
const GAME_OVER_TEXT = 'GAME OVER';
const DRAW_SCRIPT = new Script('frameCallbacks.draw(lcd, room, frameNow)', { filename: 'rapid-roll-draw-invocation.js' });
const STATE_SCRIPT = new Script('frameCallbacks.onState(room)', { filename: 'rapid-roll-state-invocation.js' });
const INPUT_SCRIPT = new Script("frameCallbacks.onKey('right', true)", { filename: 'rapid-roll-input-invocation.js' });
const VM_OPTIONS = { timeout: VM_TIMEOUT_MS };
const source = BASELINE_REVISION
  ? execFileSync('git', ['show', `${BASELINE_REVISION}:${SOURCE_PATH}`], { cwd: ROOT, encoding: SOURCE_ENCODING })
  : await readFile(SOURCE_URL, SOURCE_ENCODING);
const ast = parse(source, { ecmaVersion: ECMASCRIPT_VERSION, sourceType: MODULE_SOURCE_TYPE });
const executableSource = ast.body.filter((node) => node.type !== IMPORT_NODE_TYPE).map((node) => source.slice(node.start, node.end)).join(SOURCE_SEPARATOR);
const moduleScript = new Script(executableSource, { filename: fileURLToPath(SOURCE_URL) });

function expectedDeath(seed, keys) {
  const sim = physics.createSim(seed);
  const stepLimit = Math.ceil(MAX_DEATH_SECONDS / FRAME_STEP_SECONDS);
  for (let index = 0; index < stepLimit && !sim.dead; index++) physics.step(sim, FRAME_STEP_SECONDS, keys);
  assert.equal(sim.dead, true, `Seed ${seed} must reach natural death under the real physics`);
  assert(sim.t < MAX_DEATH_SECONDS);
  return { at: [sim.x, sim.y], score: physics.score(sim), diedAt: sim.t };
}

function fixture(seed) {
  const sent = [];
  const banners = [];
  const drawCalls = [];
  let deathBeeps = 0;
  const app = {
    id: ME,
    replay: false,
    send(message) { sent.push(structuredClone(message)); },
    beep(frequency, duration) {
      if (frequency === DEATH_FREQUENCY && duration === DEATH_BEEP_MS) deathBeeps++;
    },
  };
  const lcd = {
    sprite(...args) { drawCalls.push(['sprite', ...args]); },
    rect(...args) { drawCalls.push(['rect', ...args]); },
    text(...args) { drawCalls.push(['text', ...args]); },
    px(...args) { drawCalls.push(['px', ...args]); },
    center(...args) { drawCalls.push(['center', ...args]); },
    banner(lines) { banners.push(Array.from(lines)); },
  };
  const room = {
    status: 'playing',
    seats: [ME],
    players: [{ id: ME, name: 'Ada' }],
    view: { seed, startAt: START_AT, runners: { [ME]: { score: 0, done: false } } },
  };
  const sandbox = {
    ...physics,
    lcd,
    room,
    frameNow: START_AT,
    t: (vi, en) => en ?? vi,
    nokiaApp(options) { sandbox.frameCallbacks = options; return app; },
  };
  const context = createContext(sandbox);
  moduleScript.runInContext(context, VM_OPTIONS);
  STATE_SCRIPT.runInContext(context, VM_OPTIONS);
  return { context, sandbox, sent, banners, drawCalls, deathBeeps: () => deathBeeps };
}

for (const seed of SEEDS) {
  for (const holdingRight of [false, true]) {
    const expected = expectedDeath(seed, holdingRight ? { right: true } : {});
    const f = fixture(seed);
    if (holdingRight) INPUT_SCRIPT.runInContext(f.context, VM_OPTIONS);
    f.sandbox.frameNow = START_AT + (expected.diedAt + DELAY_AFTER_DEATH_SECONDS) * MILLISECONDS_PER_SECOND;
    DRAW_SCRIPT.runInContext(f.context, VM_OPTIONS);
    const completion = f.sent.filter((message) => message.done);
    assert.deepEqual(completion, [{ done: true, score: expected.score }]);
    assert.deepEqual(f.sent.find((message) => message.at), { at: expected.at, score: expected.score });
    assert.equal(f.deathBeeps(), 1, 'Natural death emits its sound once while catching up');
    assert.deepEqual(f.banners.at(-1), [GAME_OVER_TEXT, `${expected.score} M`]);
    assert(f.drawCalls.some(([method]) => method === 'sprite'), 'The real draw callback must paint the scene after catching up');
    const messagesAfterDeath = f.sent.length;
    f.sandbox.frameNow += NEXT_FRAME_MS;
    DRAW_SCRIPT.runInContext(f.context, VM_OPTIONS);
    assert.equal(f.sent.length, messagesAfterDeath, 'Later frames must not send the final result or position twice');
    assert.equal(f.deathBeeps(), 1);
    assert.deepEqual(f.banners.at(-1), [GAME_OVER_TEXT, `${expected.score} M`]);
  }
}
console.log('rapid-roll delayed-frame regression ok');

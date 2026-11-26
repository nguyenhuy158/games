import assert from 'node:assert/strict';
import * as mining from '../../shared/games/dao-vang/logic.js';
import * as mines from '../../shared/games/do-min/logic.js';
import * as spy from '../../shared/games/gian-diep/logic.js';
import { numberWordsEn } from '../../shared/games/loto/logic.js';
import * as wolf from '../../shared/games/soi/logic.js';
import * as dice from '../../shared/games/bau-cua/logic.js';
import * as bantumi from '../../shared/games/nokia/bantumi/logic.js';
import * as bounce from '../../shared/games/nokia/bounce/logic.js';
import * as roll from '../../shared/games/nokia/rapid-roll/logic.js';
import * as snake from '../../shared/games/nokia/snake/logic.js';
import * as space from '../../shared/games/nokia/space-impact/logic.js';
import { Tape, REPLAY_MAX } from '../../shared/tape.js';

{
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const tape = new Tape();
    const first = { t: 'state', value: 1 };
    tape.push(first);
    first.value = 9;
    now += 10;
    tape.push({ t: 'state', value: 1 });
    tape.push(null);
    tape.push({ t: 'event', value: 2 });
    assert.deepEqual(tape.done(), [[0, { t: 'state', value: 1 }], [10, null], [10, { t: 'event', value: 2 }]]);
    assert.deepEqual(tape.done(), tape.frames);

    const throttled = new Tape(100);
    throttled.push({ t: 'state', value: 1 });
    now += 10;
    throttled.push({ t: 'state', value: 2 });
    now += 10;
    throttled.push({ t: 'state', value: 3 });
    throttled.push({ t: 'event' });
    assert.deepEqual(throttled.frames, [[0, { t: 'state', value: 1 }], [20, { t: 'state', value: 3 }], [20, { t: 'event' }]]);
    assert.equal(throttled.lastAt, 20);
    now += 10;
    throttled.push({ t: 'state', value: 4 });
    now += 90;
    throttled.push({ t: 'state', value: 5 });
    assert.equal(throttled.pending, null);
    now += 1;
    throttled.push({ t: 'state', value: 6 });
    assert.deepEqual(throttled.done().slice(-2), [[120, { t: 'state', value: 5 }], [121, { t: 'state', value: 6 }]]);
    assert.equal(throttled.done().length, 5);

    const bounded = new Tape();
    bounded.push({ t: 'state', value: 0 });
    bounded.push({ t: 'event', payload: 'x'.repeat(REPLAY_MAX) });
    assert.equal(bounded.full, true);
    bounded.push({ t: 'event', value: 'ignored' });
    now += 1;
    bounded.push({ t: 'state', value: 1 });
    now += 1;
    bounded.push({ t: 'state', value: 2 });
    assert.deepEqual(bounded.done(), [[0, { t: 'state', value: 0 }], [2, { t: 'state', value: 2 }]]);
    assert.equal(bounded.pending, null);
  } finally {
    Date.now = originalNow;
  }
}

{
  const originalRandom = Math.random;
  Math.random = mining.seeded(17);
  try {
    const generated = mining.genLevel(1);
    assert.ok(generated.some((item) => item.type === 'goldBig'));
    assert.deepEqual(mining.bagOutcome(1, () => 0), { dynamite: 1 });
    assert.equal(mining.valueOf('goldTiny'), mining.ITEMS.goldTiny.value);
    const generatedSpace = space.createWorld(['a']);
    generatedSpace.spawnAt = 0;
    space.step(generatedSpace, 0);
    assert.ok(generatedSpace.enemies.length > 0);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(bantumi.newBoard().reduce((sum, count) => sum + count, 0), 12 * bantumi.SEEDS);
  const finalMove = bantumi.newBoard(0);
  finalMove[5] = 1;
  finalMove[7] = 1;
  assert.equal(bantumi.botMove(finalMove, 1), 5);
}

{
  const level = mining.genLevel(1, () => 0);
  assert.ok(level.length > 0);
  assert.ok(level.reduce((sum, item) => sum + mining.ITEMS[item.type].value, 0) < mining.targetOf(1) * 1.3);
  for (let i = 0; i < level.length; i++) for (const other of level.slice(i + 1)) {
    assert.ok(Math.hypot(level[i].x - other.x, level[i].y - other.y) > mining.ITEMS[level[i].type].r + mining.ITEMS[other.type].r + 6);
  }
  assert.equal(mining.SHOP.polish.price(3, () => 0), 200);
  assert.equal(mining.SHOP.polish.price(3, () => 0.999999), 540);
  assert.ok(mining.shopOffer(3, () => 0).some((offer) => offer.key === 'polish'));
  const mouse = { id: 99, type: 'mouse', x: 100, y: 300, x0: 100, amp: 20, speed: 40, ph: 0 };
  assert.equal(mining.mouseDir(mouse, 0), 1);
  assert.equal(mining.mouseDir(mouse, 1), -1);
  assert.equal(mining.mouseX({ ...mouse, amp: 0 }, 500), 100);
  assert.equal(mining.mouseDir({ ...mouse, amp: 0 }, 500), 1);
  const world = mining.createWorld(1, [{ id: 'a' }], mining.seeded(1));
  world.items = [mouse];
  mining.step(world, 0.25);
  assert.equal(mouse.x, 110);
  const miner = world.miners[0];
  for (const [x, angle] of [[0, -1], [mining.W, 1], [320, 0]]) {
    Object.assign(miner, { x, angle, len: mining.H, mode: 'out' });
    mining.step(world, 0.01);
    assert.equal(miner.mode, 'in');
  }
  Object.assign(miner, { mode: 'in', len: 100, held: { type: 'goldBig' }, buffs: { strength: true } });
  mining.step(world, 0.1);
  assert.ok(Math.abs(miner.len - (100 - mining.PULL / mining.ITEMS.goldBig.weight * mining.STRENGTH * 0.1)) < 1e-10);
  for (const [random, expected] of [[0, { dynamite: 1 }], [0.25, { strength: true }], [0.5, { value: 195 }]]) {
    Object.assign(miner, { mode: 'in', len: mining.MIN_LEN, held: { type: 'bag' }, dynamite: 0, buffs: {} });
    const events = mining.step(world, 0, () => random);
    assert.deepEqual(events, [{ k: 'collect', id: 'a', type: 'bag', value: 0, ...expected }]);
    assert.equal(miner.held, null);
    assert.equal(miner.mode, 'swing');
    assert.equal(miner.dynamite, expected.dynamite ?? 0);
    assert.equal(!!miner.buffs.strength, !!expected.strength);
  }
  Object.assign(miner, { mode: 'in', len: 20, held: { type: 'bag' }, buffs: { clover: true } });
  assert.equal(mining.step(world, 0, () => 0.5)[0].value, 460);
  Object.assign(world, { t: 1.23456, time: 12.34567 });
  Object.assign(miner, { angle: 0.12345, len: 20.26, mode: 'in', held: { type: 'diamond' }, anim: { name: 'down', t: 0 }, dynamite: 2, buffs: { strength: true } });
  assert.deepEqual(mining.snapOf(world), { t: 'snap', time: 12.346, wt: 1.235, miners: [{ id: 'a', a: 0.123, l: 20.3, m: 'in', h: 'diamond', an: 'down', d: 2, s: true }] });
  miner.held = null;
  miner.anim = null;
  miner.buffs = {};
  assert.deepEqual(mining.snapOf(world).miners[0], { id: 'a', a: 0.123, l: 20.3, m: 'in', h: null, an: null, d: 2, s: false });
  miner.mode = 'unknown-restored-mode';
  miner.held = { id: 100, type: 'goldTiny', x: 320, y: 100 };
  const restoredMiner = structuredClone(miner);
  const previousTime = world.time;
  const previousTick = world.t;
  const previousItemCount = world.items.length;
  assert.deepEqual(mining.step(world, 0.1), []);
  assert.deepEqual(miner, restoredMiner);
  assert.equal(world.time, previousTime - 0.1);
  assert.equal(world.t, previousTick + 0.1);
  assert.equal(world.items.length, previousItemCount);
}

{
  const field = { mines: [0, 0, 0, 0], counts: [0, 0, 0, 0] };
  for (const visible of [mines.HIDDEN, mines.FLAG, mines.BOOM, 0]) {
    const vis = [visible, mines.HIDDEN, mines.HIDDEN, mines.HIDDEN];
    assert.deepEqual(mines.chord(field, vis, 0, 2, 2), { opened: [], boom: false });
    assert.deepEqual(vis, [visible, mines.HIDDEN, mines.HIDDEN, mines.HIDDEN]);
  }
  const staleDeadline = { players: [], phase: spy.PHASE.VOTE, deadline: 1 };
  assert.equal(spy.advance(staleDeadline, 2), false);
  assert.deepEqual(staleDeadline, { players: [], phase: spy.PHASE.VOTE, deadline: 1 });
  assert.equal(spy.resultTitle(null), null);
  assert.equal(spy.resultTitle(undefined), null);
  for (const [number, words] of [[0, 'zero'], [1, 'one'], [11, 'eleven'], [19, 'nineteen'], [20, 'twenty'], [21, 'twenty-one'], [40, 'forty'], [55, 'fifty-five'], [90, 'ninety']]) assert.equal(numberWordsEn(number), words);
  assert.equal(wolf.pickWolf(['a', 'b', 'c'], () => 1), 'c');
  assert.equal(wolf.roleOf('c', ['a', 'b', 'c'], 'spectator'), null);
  assert.deepEqual(dice.roll(() => 0), [0, 0, 0]);
  assert.deepEqual(dice.roll(() => 0.999999), [5, 5, 5]);
  assert.deepEqual(dice.settle({ a: [10, 10, 10, 10, 10, 10] }, [0, 0, 0]), { a: -20 });
  const board = bantumi.newBoard(0);
  board[13] = 1;
  assert.equal(bantumi.winner(board), 2);
  board[6] = 1;
  assert.equal(bantumi.winner(board), 0);
}

{
  const sim = bounce.createSim(-1);
  assert.equal(sim.lv, bounce.LEVELS[0]);
  for (const [x, y] of [[0, -1], [0, bounce.ROWS * bounce.T], [-1, 0], [sim.lv[0].length * bounce.T, 0]]) assert.equal(bounce.tileAt(sim.lv, x, y), '#');
  Object.assign(sim, { x: 9 * bounce.T, y: 6 * bounce.T, vx: bounce.SPEED });
  bounce.step(sim, 1 / 60, { right: true });
  assert.equal(sim.x, 9 * bounce.T);
  assert.equal(sim.vx, 0);
  Object.assign(sim, { x: 2 * bounce.T, y: bounce.T, vy: -bounce.JUMP });
  bounce.step(sim, 1 / 60);
  assert.equal(sim.y, bounce.T);
  assert.equal(sim.vy, 0);
  Object.assign(sim, { x: 15 * bounce.T, y: 5 * bounce.T, vy: 0, vx: 0 });
  bounce.step(sim, 0);
  assert.deepEqual([...sim.rings], ['15:4']);
  bounce.step(sim, 0);
  assert.deepEqual(sim.events, []);

  const extraLife = bounce.createSim(1);
  Object.assign(extraLife, { x: 49 * bounce.T, y: 3 * bounce.T });
  bounce.step(extraLife, 0);
  assert.equal(extraLife.lives, bounce.LIVES + 1);
  assert.deepEqual(extraLife.events, ['life']);
  bounce.step(extraLife, 0);
  assert.equal(extraLife.lives, bounce.LIVES + 1);
  assert.deepEqual(extraLife.events, []);

  Object.assign(sim, { x: 20 * bounce.T, y: 6 * bounce.T, lives: 1 });
  bounce.step(sim, 0);
  assert.equal(sim.dead, true);
  assert.deepEqual(sim.events, ['hurt', 'dead']);
  const deadSnapshot = structuredClone(sim);
  assert.equal(bounce.step(sim, 10), sim);
  assert.deepEqual(sim, deadSnapshot);
  const finished = bounce.createSim(0);
  Object.assign(finished, { x: 57 * bounce.T, y: 6 * bounce.T, rings: new Set(['15:4', '27:2', '46:4']) });
  bounce.step(finished, 0);
  assert.equal(finished.finished, true);
  assert.equal(bounce.step(finished, 10).t, 0);
  assert.equal(bounce.timeScore({ t: 12.345 }), 12.3);
}

{
  const replay = roll.createSim(1);
  const body = { x: replay.x, y: replay.y, lives: replay.lives };
  assert.equal(roll.rollTo(replay, 10), replay);
  assert.equal(replay.t, 10);
  assert.deepEqual({ x: replay.x, y: replay.y, lives: replay.lives }, body);
  const platforms = structuredClone(replay.plats);
  roll.rollTo(replay, 9);
  roll.rollTo(replay, 10);
  assert.equal(replay.t, 10);
  assert.deepEqual(replay.plats, platforms);

  for (const [spike, invul, heart] of [[false, 0, false], [false, 0, true], [true, 0, false], [true, 1, false]]) {
    const sim = roll.createSim(2);
    roll.rollTo(sim, 10);
    const platform = sim.plats.find((candidate) => candidate.y - roll.scrollAt(sim.t) > 20 && candidate.y - roll.scrollAt(sim.t) < 40);
    Object.assign(platform, { spike, heart });
    Object.assign(sim, { x: platform.x + 2, y: platform.y - roll.BALL - 1, on: null, invul });
    roll.step(sim, 0.05, { right: true });
    if (spike && !invul) {
      assert.deepEqual(sim.events, ['spike']);
      assert.equal(sim.lives, roll.LIVES - 1);
      assert.ok(sim.invul > 0);
    } else {
      assert.equal(sim.on, platform);
      assert.equal(sim.y, platform.y - roll.BALL);
      assert.equal(sim.lives, roll.LIVES + Number(heart));
      assert.equal(sim.hearts, Number(heart));
      assert.equal(platform.heart, false);
      assert.deepEqual(sim.events, heart ? ['heart'] : []);
    }
  }
  const capped = roll.createSim(2);
  roll.rollTo(capped, 10);
  const heart = capped.plats.find((candidate) => candidate.y - roll.scrollAt(capped.t) > 20 && candidate.y - roll.scrollAt(capped.t) < 40);
  Object.assign(heart, { heart: true, spike: false });
  Object.assign(capped, { x: heart.x, y: heart.y - roll.BALL, on: null, lives: roll.MAX_LIVES });
  roll.step(capped, 0);
  assert.equal(capped.lives, roll.MAX_LIVES);
  assert.equal(capped.hearts, 1);
  const crowded = roll.createSim(1);
  roll.rollTo(crowded, 10);
  for (const platform of crowded.plats) platform.spike = true;
  const rescue = crowded.plats.find((platform) => platform.y - roll.scrollAt(crowded.t) > roll.TOP + 6);
  Object.assign(crowded, { x: 60, y: roll.scrollAt(crowded.t) + 49, on: null });
  roll.step(crowded, 0);
  assert.deepEqual(crowded.events, ['fall']);
  assert.equal(crowded.on, rescue);
  assert.equal(crowded.invul, 1.5);
  for (const seed of [0, 1, 2, 42, 0xffffffff]) for (const time of [0, 1.2, 43.99, 44, 44.01, 100]) {
    const sim = roll.createSim(seed);
    roll.rollTo(sim, time);
    const scroll = roll.scrollAt(time);
    Object.assign(sim, { y: scroll + 2 * roll.H, on: null });
    roll.step(sim, 0);
    assert.deepEqual(sim.events, ['fall']);
    assert.equal(sim.lives, roll.LIVES - 1);
    assert.equal(sim.dead, false);
    assert.ok(sim.plats.includes(sim.on));
    assert.equal(sim.y, sim.on.y - roll.BALL);
    assert.equal(sim.x, sim.on.x + roll.PW / 2 - roll.BALL / 2);
    assert.ok(sim.y - scroll > roll.TOP);
    assert.ok(sim.y - scroll < roll.H);
    assert.equal(sim.invul, 1.5);
  }
}

{
  const game = snake.createGame(['a'], { maze: 999 }, () => 0);
  assert.deepEqual(game.maze, []);
  delete game.maze;
  assert.ok(snake.freeCell(game, () => 0));
  const actor = game.snakes[0];
  assert.equal(snake.turn(actor, 'invalid'), false);
  actor.alive = false;
  assert.equal(snake.turn(actor, 'up'), false);
  actor.alive = true;
  const [x, y] = actor.body[0];
  game.food = null;
  game.bug = { at: [x + 1, y], left: snake.BUG_LIFE };
  assert.deepEqual(snake.step(game, () => 0), [{ t: 'bug', id: 'a' }]);
  assert.equal(actor.score, 20);
  assert.equal(actor.grow, 2);
  assert.equal(game.bug, null);
  game.bug = { at: [actor.body[0][0] + 1, y - 1], left: 1 };
  assert.deepEqual(snake.step(game, () => 0), []);
  assert.equal(game.bug, null);
  game.bug = { at: [0, 0], left: 2 };
  snake.step(game, () => 0);
  assert.equal(game.bug.left, 1);
  const fullBody = Array.from({ length: snake.ROWS }, (_, row) => Array.from({ length: snake.COLS }, (_, col) => [row % 2 ? snake.COLS - 1 - col : col, row])).flat();
  const filled = snake.createGame(['a'], {}, () => 0);
  filled.snakes[0].body = fullBody;
  filled.food = null;
  assert.equal(snake.freeCell(filled, () => 0), null);
  const lastMeal = snake.createGame(['a'], {}, () => 0);
  const eater = lastMeal.snakes[0];
  eater.body = fullBody.slice(1);
  eater.dir = 'left';
  lastMeal.food = [0, 0];
  lastMeal.eaten = snake.BUG_EVERY - 1;
  eater.grow = 1;
  assert.deepEqual(snake.step(lastMeal, () => 0), [{ t: 'eat', id: 'a' }]);
  assert.equal(lastMeal.bug, null);
  assert.equal(lastMeal.food, null);
}

const quietSpace = (ids = ['a']) => {
  const world = space.createWorld(ids, () => 0.5);
  world.spawnAt = Infinity;
  return world;
};

{
  for (const [level, random, kind, count, hp] of [[1, 0, 'a', 3, 1], [2, 0.5, 'b', 1, 3], [3, 0.3, 'b', 1, 4], [3, 0.9, 'c', 1, 1]]) {
    const world = space.createWorld(['a'], () => random);
    world.level = level;
    world.spawnAt = 0;
    space.step(world, 0);
    assert.equal(world.enemies.length, count);
    assert.ok(world.enemies.every((enemy) => enemy.kind === kind && enemy.hp === hp));
  }
  const movement = quietSpace();
  const ship = movement.ships[0];
  ship.keys = { left: true, down: true };
  space.step(movement, 2);
  assert.equal(ship.x, 0);
  assert.equal(ship.y, space.H - space.SHIP_H);

  const shooter = quietSpace();
  shooter.enemies = [{ kind: 'b', x: 60, y: 20, base: 20, hp: 2, phase: 0, cool: 0 }];
  space.step(shooter, 0);
  assert.deepEqual(shooter.shots, [{ x: 58, y: 23, vx: -40, vy: 0 }]);
  assert.equal(shooter.enemies[0].cool, 2.75);
  shooter.enemies[0].x = space.W;
  shooter.enemies[0].cool = 0;
  space.step(shooter, 0);
  assert.equal(shooter.shots.length, 1);
  shooter.enemies[0].cool = 1;
  space.step(shooter, 0);
  assert.equal(shooter.shots.length, 1);

  for (const level of [1, 2]) {
    const world = quietSpace();
    world.level = level;
    world.phase = 'boss';
    world.boss = { x: 60, y: space.TOP - 1, hp: 10, max: 10, dir: -1, cool: 0 };
    space.step(world, 0);
    assert.equal(world.boss.y, space.TOP);
    assert.equal(world.boss.dir, 1);
    assert.deepEqual(world.shots.map((shot) => shot.vy), level === 1 ? [0] : [-14, 0, 14]);
    assert.ok(world.boss.cool > 0);
    world.boss.y = space.H - space.BOSS_H + 1;
    space.step(world, 0);
    assert.equal(world.boss.y, space.H - space.BOSS_H);
    assert.equal(world.boss.dir, -1);
  }

  const drop = quietSpace();
  drop.rand = () => 0;
  drop.enemies = [{ kind: 'a', x: 40, y: 20, base: 20, hp: 1, phase: 0, cool: 1 }];
  drop.bullets = [{ x: 40, y: 20, by: 'departed-player' }];
  space.step(drop, 0);
  assert.equal(drop.score, space.KINDS.a.pts);
  assert.equal(drop.ships[0].score, 0);
  assert.deepEqual(drop.items, [{ x: 40, y: 20 }]);
  space.step(drop, 0.1);
  assert.equal(drop.items[0].x, 38.8);
  drop.items.push({ x: -5, y: 20 });
  space.step(drop, 0);
  assert.equal(drop.items.length, 1);

  const pickup = quietSpace(['a', 'b']);
  const first = pickup.ships[0];
  first.lives = 5;
  pickup.ships[1].x = first.x;
  pickup.ships[1].y = first.y;
  pickup.items = [{ x: first.x, y: first.y }, { x: 60, y: 30 }];
  space.step(pickup, 0);
  assert.equal(first.lives, 5);
  assert.equal(pickup.ships[1].lives, space.LIVES);
  assert.deepEqual(pickup.events, ['life']);
  assert.deepEqual(pickup.items, [{ x: 60, y: 30 }]);
  const cleanup = quietSpace();
  cleanup.shots = [
    { x: -3, y: 20, vx: 0, vy: 0 },
    { x: 20, y: space.TOP - 2, vx: 0, vy: 0 },
    { x: 20, y: space.H + 2, vx: 0, vy: 0 },
    { x: 20, y: 20, vx: 0, vy: 0 },
  ];
  space.step(cleanup, 0);
  assert.deepEqual(cleanup.shots, [{ x: 20, y: 20, vx: 0, vy: 0 }]);
  const armored = quietSpace();
  armored.enemies = [{ kind: 'b', x: 40, y: 20, base: 20, hp: 2, phase: 0, cool: 1 }];
  armored.bullets = [{ x: 40, y: 20, by: 'a' }];
  space.step(armored, 0);
  assert.equal(armored.enemies[0].hp, 1);
  assert.equal(armored.bullets.length, 0);
  assert.equal(armored.score, 0);
  const bossHit = quietSpace();
  bossHit.phase = 'boss';
  bossHit.boss = { x: 60, y: 20, hp: 2, max: 2, dir: 1, cool: 1 };
  bossHit.bullets = [{ x: 60, y: 20, by: 'a' }];
  space.step(bossHit, 0);
  assert.equal(bossHit.boss.hp, 1);
  assert.equal(bossHit.score, 0);
  assert.equal(bossHit.bullets.length, 0);

  const collision = quietSpace();
  const target = collision.ships[0];
  target.invul = 0;
  collision.phase = 'boss';
  collision.boss = { x: target.x, y: target.y, hp: 10, max: 10, dir: 1, cool: 1 };
  space.step(collision, 0);
  assert.equal(target.lives, space.LIVES - 1);
  assert.deepEqual(collision.events, ['hurt']);
  collision.over = true;
  const before = collision.t;
  assert.equal(space.step(collision, 100), collision);
  assert.equal(collision.t, before);
  assert.deepEqual(collision.events, []);
}

console.log('rules action coverage ok');

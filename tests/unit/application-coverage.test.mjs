import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { caro, c4 } from '../../backend/src/application/games/caro.js';
import fleet from '../../backend/src/application/games/ban-tau.js';
import bantumi from '../../backend/src/application/games/bantumi.js';
import ganh from '../../backend/src/application/games/co-ganh.js';
import chess from '../../backend/src/application/games/co-tuong.js';
import quan from '../../backend/src/application/games/o-an-quan.js';
import dice from '../../backend/src/application/games/bau-cua.js';
import gold from '../../backend/src/application/games/dao-vang.js';
import mines from '../../backend/src/application/games/do-min.js';
import tiles from '../../backend/src/application/games/pikachu.js';
import pairs from '../../backend/src/application/games/pairs.js';
import code from '../../backend/src/application/games/logic.js';
import bounce from '../../backend/src/application/games/bounce.js';
import rapid from '../../backend/src/application/games/rapid-roll.js';
import space from '../../backend/src/application/games/space-impact.js';
import snake from '../../backend/src/application/games/snake.js';
import loto from '../../backend/src/application/games/loto.js';
import spy from '../../backend/src/application/games/gian-diep.js';
import { raceModule } from '../../backend/src/application/games/race.js';
import { aiFailure, AI_ACTION, AI_ERROR, AI_LIMIT, AI_STATUS, SpyAiService } from '../../backend/src/application/spy-ai.js';
import { seeded, VERSUS_LEVELS, teamTarget } from '../../shared/games/dao-vang/logic.js';
import { randomFleet } from '../../shared/games/ban-tau/logic.js';
import { SIZES as CARO_SIZES } from '../../shared/games/co-caro/logic.js';
import { moves as chessMoves, K, R, MAX_MOVES as CHESS_MAX_MOVES } from '../../shared/games/co-tuong/logic.js';
import { moves as ganhMoves, MAX_MOVES as GANH_MAX_MOVES } from '../../shared/games/co-ganh/logic.js';
import { moves as quanMoves } from '../../shared/games/o-an-quan/logic.js';
import { SIZES as MINE_SIZES, HIDDEN, FLAG, BOOM_PENALTY_MS, neighbors } from '../../shared/games/do-min/logic.js';
import { findPair, LEVELS as TILE_LEVELS } from '../../shared/games/pikachu/logic.js';
import { MAX_GUESSES, KINDS } from '../../shared/games/nokia/logic/logic.js';
import { START_COINS, RESCUE } from '../../shared/games/bau-cua/logic.js';
import { SPEEDS } from '../../shared/games/nokia/snake/logic.js';

let clock = 1_000_000;
const originalNow = Date.now;
const originalRandom = Math.random;
const FIRST = 'player-first';
const SECOND = 'player-second';
const THIRD = 'player-third';
const WATCHER = 'spectator';
const BOT = 'bot';
const player = (id = FIRST) => ({ id });

function context(module, seats = [FIRST, SECOND], cfg = {}) {
  const online = new Set(seats);
  const order = [...seats];
  const sent = [], results = [], records = [], ranks = [], alarms = [], throttles = new Map();
  const ctx = {
    g: {}, cfg: { ...module.cfg, ...cfg }, keep: {}, seats: [...seats],
    rand: seeded(981), now: () => clock,
    name: (id) => `Name ${id}`, host: () => order.find((id) => online.has(id)) ?? null,
    online: () => new Set(online), order: () => [...order],
    allow(key, ms) {
      const last = throttles.get(key);
      if (last !== undefined && clock - last < ms) return false;
      throttles.set(key, clock);
      return true;
    },
    wakeAt(at) { alarms.push(at); },
    send(id, message, options) { sent.push(structuredClone({ id, message, options })); },
    sendAll(message, options) { sent.push(structuredClone({ message, options })); },
    end(result) { results.push(structuredClone(result)); },
    record(rows) { records.push(...structuredClone(rows)); },
    rank(rows) { ranks.push(...structuredClone(rows)); },
    clip: () => 'replay-clip',
    out: { sent, results, records, ranks, alarms, online, order },
  };
  return ctx;
}

function expired(ctx) {
  clock = Math.max(clock, ctx.g.deadline);
}

function restored(module, ctx) {
  const next = context(module, ctx.seats, ctx.cfg);
  next.g = structuredClone(ctx.g);
  next.keep = structuredClone(ctx.keep);
  return next;
}

Date.now = () => clock;
Math.random = seeded(1729);
try {
  for (const module of [caro, c4]) {
    const ctx = context(module);
    ctx.g = null;
    assert.equal(module.tick(ctx), false);
    assert.equal(module.msg(ctx, player(), { i: 0 }), false);
    assert.deepEqual(module.view(ctx).names, ['', '']);
    ctx.g = {};
    assert.equal(module.view(ctx).board, null);
    const invalid = module === caro ? { size: -1, block: 'yes' } : { level: -1 };
    assert.deepEqual(module.config(ctx.cfg, invalid), ctx.cfg);
    const valid = module === caro ? { size: 0, block: true } : { level: 0 };
    assert.deepEqual(module.config(ctx.cfg, valid), { ...ctx.cfg, ...valid });
    module.start(ctx);
    assert.equal(module.tick(ctx), false);
    for (const id of [SECOND, WATCHER]) assert.equal(module.msg(ctx, player(id), { i: 0 }), false);
    for (const i of [-1, 0.5, 999]) assert.equal(module.msg(ctx, player(), { i }), false);
    assert.equal(module.msg(ctx, player(), { i: 0 }), true);
    assert.equal(ctx.g.moves, 1);
    const resumed = restored(module, ctx);
    assert.deepEqual(module.view(resumed), module.view(ctx));
    expired(resumed);
    assert.equal(module.tick(resumed), true);
    assert.equal(resumed.g.winner, 1);
    assert.equal(resumed.out.results[0].mode, 'pvp');
    assert.equal(resumed.out.results[0].ranks[0].detail.vs, `Name ${SECOND}`);
    assert.equal(module.tick(resumed), false);
    assert.equal(module.msg(resumed, player(SECOND), { i: 1 }), false);
    module.start(resumed);
    assert.deepEqual(resumed.g.seats, [SECOND, FIRST]);
    assert.equal(resumed.keep.score[FIRST], 1);
    expired(resumed);
    module.tick(resumed);
    assert.equal(resumed.keep.score[FIRST], 2);
    const solo = context(module, [FIRST], module === c4 ? { level: 0 } : {});
    module.start(solo);
    assert.equal(module.view(solo).names[1], 'Máy');
    assert.equal(module.msg(solo, player(), { i: 0 }), true);
    expired(solo);
    assert.equal(module.tick(solo), true);
    assert.equal(solo.g.moves, 2);
    expired(solo);
    module.tick(solo);
    assert.equal(solo.out.results[0].mode, 'bot');
    assert.equal(solo.out.results[0].ranks.length, 1);
    assert.equal(solo.out.results[0].ranks[0].detail.vs, 'Máy');
    module.start(solo);
    assert.equal(solo.g.seats[0], BOT);
    expired(solo);
    module.tick(solo);
    assert.equal(solo.g.moves, 1);
  }

  {
    const ctx = context(caro);
    caro.start(ctx);
    const width = CARO_SIZES[ctx.cfg.size];
    const winning = [0, width, 1, width + 1, 2, width + 2, 3, width + 3, 4];
    for (const i of winning) assert.equal(caro.msg(ctx, player(ctx.g.seats[ctx.g.turn - 1]), { i }), true);
    assert.equal(ctx.g.winner, 1);
    assert.deepEqual(ctx.g.line, [0, 1, 2, 3, 4]);
    assert.equal(ctx.out.results[0].ranks[0].won, true);
    assert.equal(ctx.keep.score[FIRST], 1);
  }

  {
    const ctx = context(fleet);
    ctx.g = null;
    assert.equal(fleet.tick(ctx), false);
    assert.equal(fleet.msg(ctx, player(), { t: 'ready' }), false);
    assert.deepEqual(fleet.view(ctx, WATCHER).fleets, [null, null]);
    ctx.g = {};
    fleet.start(ctx);
    assert.equal(fleet.tick(ctx), false);
    assert.equal(fleet.msg(ctx, player(WATCHER), { t: 'ready' }), false);
    assert.equal(fleet.msg(ctx, player(), { t: 'unknown' }), false);
    assert.equal(fleet.msg(ctx, player(), { t: 'shoot', i: 0 }), false);
    assert.equal(fleet.msg(ctx, player(), { t: 'place', ships: [] }), false);
    assert.equal(fleet.msg(ctx, player(), { t: 'reroll' }), true);
    assert.equal(fleet.msg(ctx, player(), { t: 'reroll' }), false);
    const placement = randomFleet(seeded(29));
    assert.equal(fleet.msg(ctx, player(), { t: 'place', ships: placement }), true);
    assert.deepEqual(ctx.g.fleets[0], placement);
    assert.notEqual(ctx.g.fleets[0][0], placement[0]);
    assert.equal(fleet.view(ctx, FIRST).fleets[1], null);
    assert.equal(fleet.msg(ctx, player(), { t: 'ready' }), true);
    assert.equal(ctx.g.phase, 'placing');
    assert.equal(fleet.msg(ctx, player(), { t: 'place', ships: placement }), false);
    assert.equal(fleet.msg(ctx, player(), { t: 'reroll' }), false);
    assert.equal(fleet.msg(ctx, player(SECOND), { t: 'ready' }), true);
    assert.equal(ctx.g.phase, 'playing');
    for (const t of ['ready', 'place', 'reroll']) assert.equal(fleet.msg(ctx, player(), { t, ships: placement }), false);
    assert.equal(fleet.msg(ctx, player(SECOND), { t: 'shoot', i: 0 }), false);
    assert.equal(fleet.msg(ctx, player(), { t: 'shoot', i: -1 }), false);
    const firstHit = ctx.g.fleets[1][0][0];
    assert.equal(fleet.msg(ctx, player(), { t: 'shoot', i: firstHit }), true);
    assert.equal(fleet.msg(ctx, player(), { t: 'shoot', i: firstHit }), false);
    assert.equal(ctx.g.turn, 1);
    const resumed = restored(fleet, ctx);
    for (const i of resumed.g.fleets[1].flat().filter((i) => i !== firstHit)) {
      assert.equal(fleet.msg(resumed, player(), { t: 'shoot', i }), true);
    }
    assert.equal(resumed.g.phase, 'ended');
    assert.equal(resumed.g.why, 'sunk');
    assert.ok(fleet.view(resumed, WATCHER).sunk[1].every(Boolean));
    assert.deepEqual(fleet.view(resumed, WATCHER).fleets, resumed.g.fleets);
    assert.equal(resumed.out.results[0].ranks[0].score, resumed.g.fleets[1].flat().length);
    assert.equal(fleet.tick(resumed), false);
    fleet.start(resumed);
    assert.deepEqual(resumed.g.seats, [SECOND, FIRST]);
    expired(resumed);
    fleet.tick(resumed);
    assert.equal(resumed.g.phase, 'playing');
    const miss = resumed.g.shots[0].findIndex((_, i) => !resumed.g.fleets[1].flat().includes(i));
    fleet.msg(resumed, player(SECOND), { t: 'shoot', i: miss });
    assert.equal(resumed.g.turn, 2);
    expired(resumed);
    assert.equal(fleet.tick(resumed), true);
    assert.equal(resumed.g.afk[1], 1);
    resumed.g.afk[resumed.g.turn - 1] = 2;
    expired(resumed);
    fleet.tick(resumed);
    assert.equal(resumed.g.why, 'timeout');
    assert.equal(resumed.out.results.at(-1).mode, 'pvp');
    const solo = context(fleet, [FIRST]);
    fleet.start(solo);
    fleet.msg(solo, player(), { t: 'ready' });
    const empty = solo.g.shots[0].findIndex((_, i) => !solo.g.fleets[1].flat().includes(i));
    fleet.msg(solo, player(), { t: 'shoot', i: empty });
    expired(solo);
    assert.equal(fleet.tick(solo), true);
    assert.equal(solo.g.fired[1], 1);
    solo.g.turn = 1;
    solo.g.afk[0] = 2;
    expired(solo);
    fleet.tick(solo);
    assert.equal(solo.out.results[0].ranks[0].detail.vs, 'Máy');
    assert.equal(solo.out.results[0].mode, 'bot');
  }

  for (const module of [bantumi, ganh, chess]) {
    const cfg = module === bantumi ? { seeds: 3 } : { level: 0 };
    assert.deepEqual(module.config(module.cfg, cfg), { ...module.cfg, ...cfg });
    assert.equal(module.config(module.cfg, module === bantumi ? { seeds: 2 } : { level: -1 }), null);
    const ctx = context(module, [FIRST, SECOND], cfg);
    module.start(ctx);
    assert.equal(module.tick(ctx), false);
    const message = module === bantumi ? { i: 0 } : { from: 0, to: 1 };
    assert.equal(module.msg(ctx, player(SECOND), message), false);
    assert.equal(module.msg(ctx, player(WATCHER), message), false);
    assert.equal(module.msg(ctx, player(), module === bantumi ? { i: 0.5 } : { from: -1, to: -1 }), false);
    const valid = module === bantumi ? { i: 0 } : (() => {
      const [from, to] = (module === ganh ? ganhMoves : chessMoves)(ctx.g.s)[0];
      return { from, to };
    })();
    assert.equal(module.msg(ctx, player(), valid), true);
    assert.equal(module.view(ctx).moves, 1);
    expired(ctx);
    assert.equal(module.tick(ctx), true);
    assert.equal(ctx.out.results[0].mode, 'pvp');
    assert.equal(ctx.out.results[0].ranks.filter((r) => r.won).length, 1);
    module.start(ctx);
    assert.deepEqual(ctx.g.side, [SECOND, FIRST]);
    const solo = context(module, [FIRST], cfg);
    module.start(solo);
    module.start(solo);
    assert.equal(solo.g.side[0], BOT);
    assert.deepEqual(module.view(solo).names[0], ['Máy', 'Bot']);
    expired(solo);
    assert.equal(module.tick(solo), true);
    assert.equal(module.view(solo).moves, 1);
    if (module === bantumi) solo.g.turn = 2;
    else solo.g.s.turn = 2;
    expired(solo);
    module.tick(solo);
    assert.equal(solo.out.results[0].mode, 'bot');
    assert.equal(solo.out.results[0].ranks.length, 1);
    assert.match(solo.out.results[0].title[1], /Bot wins/);
  }

  for (const [left, right, expected] of [[10, 0, true], [0, 10, false], [0, 0, false]]) {
    const ctx = context(bantumi);
    bantumi.start(ctx);
    ctx.g.board = [0, 0, 0, 0, 0, 1, left, 1, 0, 0, 0, 0, 0, right];
    assert.equal(bantumi.msg(ctx, player(), { i: 5 }), true);
    assert.equal(ctx.out.results[0].ranks.find((r) => r.id === FIRST).won, expected);
    assert.equal(ctx.g.deadline, 0);
    if (left === right) assert.match(ctx.out.results[0].title[1], /^Draw/);
  }
  {
    const ctx = context(bantumi);
    bantumi.start(ctx);
    assert.equal(bantumi.msg(ctx, player(), { i: 2 }), true);
    assert.equal(ctx.g.turn, 1);
    assert.equal(ctx.g.last.again, true);
    assert.equal(bantumi.msg(ctx, player(), { i: 2 }), false);
  }

  for (const module of [ganh, chess]) {
    const ctx = context(module, [FIRST, SECOND], { level: 0 });
    module.start(ctx);
    if (module === ganh) {
      ctx.g.s.b.fill(0);
      ctx.g.s.b[0] = 2; ctx.g.s.b[1] = 1; ctx.g.s.b[5] = 1; ctx.g.s.b[12] = 1;
      assert.equal(module.msg(ctx, player(), { from: 12, to: 6 }), true);
      assert.deepEqual(ctx.g.last.vay, [0]);
    } else {
      ctx.g.s.b.fill(0);
      ctx.g.s.b[84] = K; ctx.g.s.b[4] = -K; ctx.g.s.b[9] = R; ctx.g.s.b[53] = R;
      assert.equal(module.msg(ctx, player(), { from: 53, to: 8 }), true);
    }
    assert.equal(ctx.g.s.over, true);
    assert.equal(ctx.out.results.length, 0);
    assert.equal(module.tick(ctx), false);
    expired(ctx);
    module.tick(ctx);
    assert.equal(ctx.out.results[0].ranks[0].won, true);
    assert.equal(module.view(ctx).over, true);
    module.start(ctx);
    ctx.g.s.moves = (module === ganh ? GANH_MAX_MOVES : CHESS_MAX_MOVES) - 1;
    const [from, to] = (module === ganh ? ganhMoves : chessMoves)(ctx.g.s)[0];
    module.msg(ctx, player(SECOND), { from, to });
    assert.equal(ctx.g.s.over, true);
    expired(ctx);
    module.tick(ctx);
    assert.ok(ctx.out.results.at(-1).ranks.every((r) => !r.won));
    assert.match(ctx.out.results.at(-1).title[1], /^Draw/);
  }

  {
    const ctx = context(caro, [FIRST, SECOND], { size: 2 });
    caro.start(ctx);
    for (const i of [0, 1, 2, 4, 3, 5, 7, 6, 8]) {
      assert.equal(caro.msg(ctx, player(ctx.g.seats[ctx.g.turn - 1]), { i }), true);
    }
    assert.equal(ctx.g.why, 'full');
    assert.equal(ctx.g.winner, 0);
    assert.ok(ctx.out.results[0].ranks.every((r) => !r.won));
  }

  {
    assert.deepEqual(quan.config(quan.cfg, { quanNon: false, level: 0, n: 5 }), { quanNon: false, level: 0, n: 5 });
    for (const patch of [{ quanNon: 'no' }, { level: -1 }, { n: 1 }, { n: 6 }, { n: 2.5 }]) {
      assert.deepEqual(quan.config(quan.cfg, patch), quan.cfg);
    }
    const ctx = context(quan, [FIRST, SECOND], { level: 0 });
    quan.start(ctx);
    assert.equal(quan.tick(ctx), false);
    assert.equal(quan.msg(ctx, player(SECOND), { k: 1, d: 1 }), false);
    expired(ctx);
    quan.tick(ctx);
    assert.equal(ctx.out.results[0].mode, 'pvp');
    assert.equal(ctx.out.results[0].ranks.find((r) => r.id === SECOND).won, true);
    assert.match(ctx.out.results[0].title[1], /time out/);
    const solo = context(quan, [FIRST], { level: 0 });
    delete solo.cfg.n;
    quan.start(solo);
    delete solo.g.afk;
    delete solo.g.hist;
    const [k, d] = quanMoves(solo.g.s)[0];
    assert.equal(quan.msg(solo, player(), { k, d }), true);
    assert.equal(solo.g.hist.length, 1);
    assert.equal(solo.g.afk.length, 2);
    solo.g.side[1] = BOT;
    expired(solo);
    quan.tick(solo);
    while (!solo.g.s.over && solo.g.s.turn !== 1) { expired(solo); quan.tick(solo); }
    expired(solo);
    quan.tick(solo);
    assert.match(solo.out.results[0].title[1], /Bot wins/);
    const multi = context(quan, [FIRST, SECOND, THIRD], { n: 4, level: 0 });
    quan.start(multi);
    delete multi.g.afk;
    expired(multi);
    quan.tick(multi);
    assert.equal(multi.g.afk[0], 1);
    assert.equal(multi.g.s.moves, 1);
    const bots = context(quan, [FIRST], { n: 3, level: 0 });
    quan.start(bots);
    assert.equal(quan.view(bots).names[1][1], 'Bot 1');
    let turnCount = 0;
    while (!bots.g.s.over && turnCount++ < 2000) {
      const who = bots.g.side[bots.g.s.turn - 1];
      if (who === FIRST) {
        const [pit, direction] = quanMoves(bots.g.s)[0];
        assert.equal(quan.msg(bots, player(), { k: pit, d: direction }), true);
      } else { expired(bots); quan.tick(bots); }
    }
    assert.equal(bots.g.s.over, true);
    expired(bots);
    quan.tick(bots);
    assert.equal(bots.out.results[0].ranks.length, 1);
    assert.equal(bots.out.results[0].ranks[0].detail.of, 3);
  }

  {
    const ctx = context(dice);
    dice.start(ctx);
    dice.join(ctx, player());
    assert.equal(dice.view(ctx).players[0].coins, START_COINS);
    assert.equal(dice.tick(ctx), false);
    assert.equal(dice.msg(ctx, player(), { t: 'unknown' }), false);
    assert.equal(dice.msg(ctx, player(SECOND), { t: 'mode', mode: 'rotate' }), false);
    assert.equal(dice.msg(ctx, player(), { t: 'mode', mode: 'bad' }), false);
    assert.equal(dice.msg(ctx, player(), { t: 'roll' }), false);
    for (const m of [{ s: -1, amt: 10 }, { s: 0.5, amt: 10 }, { s: 0, amt: 11 }]) {
      assert.equal(dice.msg(ctx, player(), { t: 'bet', ...m }), false);
    }
    assert.equal(dice.msg(ctx, player(), { t: 'unbet' }), false);
    assert.equal(dice.msg(ctx, player(), { t: 'bet', s: 0, amt: 10 }), true);
    assert.equal(dice.msg(ctx, player(), { t: 'unbet', s: 0 }), true);
    assert.equal(ctx.g.bets[FIRST][0], 0);
    assert.equal(dice.msg(ctx, player(), { t: 'unbet' }), true);
    assert.equal(ctx.g.bets[FIRST], undefined);
    ctx.g.purse[FIRST].coins = 0;
    assert.equal(dice.msg(ctx, player(), { t: 'bet', s: 0, amt: 10 }), false);
    ctx.g.purse[FIRST].coins = START_COINS;
    assert.equal(dice.msg(ctx, player(), { t: 'bet', s: 0, amt: 10 }), true);
    assert.equal(dice.msg(ctx, player(SECOND), { t: 'roll' }), false);
    ctx.rand = () => 0;
    assert.equal(dice.msg(ctx, player(), { t: 'roll' }), true);
    assert.equal(ctx.g.phase, 'show');
    assert.deepEqual(ctx.g.dice, [0, 0, 0]);
    assert.equal(ctx.g.purse[FIRST].net, 30);
    assert.equal(ctx.g.rp, 'replay-clip');
    assert.equal(dice.view(ctx).dealer, null);
    for (const t of ['mode', 'bet', 'unbet', 'roll']) assert.equal(dice.msg(ctx, player(), { t, mode: 'rotate', s: 0, amt: 10 }), false);
    assert.equal(dice.tick(ctx), false);
    const resumed = restored(dice, ctx);
    resumed.g.purse[SECOND].coins = 0;
    clock += dice.view(resumed).showMs;
    assert.equal(dice.tick(resumed), true);
    assert.equal(resumed.g.purse[SECOND].coins, RESCUE);
    assert.equal(resumed.g.purse[SECOND].rescues, 1);
    assert.equal(resumed.g.round, 2);
    assert.equal(resumed.g.rp, undefined);
    assert.equal(dice.msg(resumed, player(), { t: 'mode', mode: 'rotate' }), true);
    assert.equal(dice.view(resumed).dealer, FIRST);
    assert.equal(dice.msg(resumed, player(), { t: 'bet', s: 0, amt: 10 }), false);
    assert.equal(dice.msg(resumed, player(SECOND), { t: 'bet', s: 0, amt: 10 }), true);
    assert.equal(dice.msg(resumed, player(SECOND), { t: 'roll' }), false);
    resumed.rand = () => 0;
    assert.equal(dice.msg(resumed, player(), { t: 'roll' }), true);
    assert.equal(resumed.g.deltas[FIRST], -30);
    assert.equal(resumed.g.deltas[SECOND], 30);
    dice.join(resumed, player(THIRD));
    dice.leave(resumed, SECOND);
    assert.equal(resumed.out.records.length, 1);
    assert.equal(resumed.out.records[0].score, 30);
    assert.equal(resumed.out.records[0].won, true);
    assert.equal(JSON.parse(resumed.out.records[0].detail).rescues, 1);
    dice.leave(resumed, SECOND);
    assert.equal(resumed.out.records.length, 1);
    clock += dice.view(resumed).showMs;
    dice.tick(resumed);
    assert.equal(resumed.g.dealerIdx, 1);
    resumed.out.online.delete(SECOND);
    dice.leave(resumed, SECOND);
    assert.equal(dice.view(resumed).dealer, null);
    dice.msg(resumed, player(), { t: 'bet', s: 1, amt: 10 });
    clock += dice.view(resumed).afkMs + 1;
    assert.equal(dice.msg(resumed, player(THIRD), { t: 'roll' }), true);
  }

  for (const module of [rapid, bounce, raceModule({ page: '/fixture/', timeMs: 1000 })]) {
    if (module === bounce) {
      assert.deepEqual(module.config(module.cfg, { level: 0 }), { level: 0 });
      for (const level of [-1, 0.5, 999]) assert.equal(module.config(module.cfg, { level }), null);
    }
    const ctx = context(module);
    module.start(ctx);
    assert.equal(module.msg(ctx, player(), { score: 10 }), false);
    assert.equal(module.msg(ctx, player(WATCHER), { done: true }), false);
    assert.equal(module.tick(ctx), true);
    assert.equal(ctx.out.results.length, 0);
    clock = ctx.g.startAt;
    for (const message of [{ at: [0] }, { at: [0, NaN] }, { score: -1 }, { score: 1e7 }, { score: '12' }]) {
      assert.equal(module.msg(ctx, player(), message), false);
    }
    assert.equal(ctx.g.runners[FIRST].score, 0);
    assert.equal(module.msg(ctx, player(), { at: [1.24, 2.66], score: 20.4 }), false);
    assert.deepEqual(module.view(ctx).runners[FIRST].at, [1.2, 2.7]);
    assert.equal(module.msg(ctx, player(), { done: true, finished: true }), true);
    assert.equal(module.msg(ctx, player(), { score: 999 }), false);
    assert.equal(ctx.out.results.length, 0);
    module.msg(ctx, player(SECOND), { done: true, score: 10, finished: true });
    const result = ctx.out.results[0];
    assert.equal(result.mode, 'multi');
    assert.equal(result.ranks[0].id, module === bounce ? SECOND : FIRST);
    assert.equal(result.ranks[0].won, true);
    module.leave(ctx, FIRST);
    module.leave(ctx, WATCHER);
    clock = ctx.g.endsAt;
    module.tick(ctx);
    assert.equal(ctx.out.results.length, 1);
    const solo = context(module, [FIRST]);
    module.start(solo);
    clock = solo.g.startAt;
    module.msg(solo, player(), { done: true, finished: true, score: 12 });
    assert.equal(solo.out.results[0].mode, 'solo');
    assert.equal(solo.out.results[0].ranks[0].won, module === bounce);
    const disconnected = context(module);
    module.start(disconnected);
    module.leave(disconnected, FIRST);
    assert.equal(disconnected.out.results.length, 0);
    clock = disconnected.g.endsAt;
    module.tick(disconnected);
    assert.equal(disconnected.out.results[0].ranks.length, 2);
    if (module === bounce) assert.ok(disconnected.out.results[0].ranks.every((r) => !r.won));
    const absent = context(module);
    absent.g = null;
    module.leave(absent, FIRST);
  }

  {
    const ctx = context(bounce);
    bounce.start(ctx);
    clock = ctx.g.startAt;
    bounce.msg(ctx, player(), { score: 100, done: true, finished: true });
    bounce.msg(ctx, player(SECOND), { score: 1, done: true });
    assert.equal(ctx.out.results[0].ranks[0].id, FIRST);
  }

  for (const seats of [[FIRST], [FIRST, SECOND]]) {
    const ctx = context(pairs, seats);
    pairs.start(ctx);
    assert.ok(pairs.view(ctx).cards.every((v) => v === -1));
    assert.equal(pairs.msg(ctx, player(WATCHER), { i: 0 }), false);
    assert.equal(pairs.msg(ctx, player(), { i: -1 }), false);
    assert.equal(pairs.tick(ctx), false);
    const other = ctx.g.deck.findIndex((v) => v !== ctx.g.deck[0]);
    assert.equal(pairs.msg(ctx, player(), { i: 0 }), true);
    assert.equal(pairs.view(ctx).cards[0], ctx.g.deck[0]);
    assert.equal(pairs.msg(ctx, player(), { i: 0 }), false);
    assert.equal(pairs.msg(ctx, player(), { i: other }), true);
    assert.equal(pairs.view(ctx).deadline, 0);
    assert.equal(pairs.msg(ctx, player(), { i: 1 }), false);
    assert.equal(pairs.tick(ctx), false);
    clock = ctx.g.hideAt;
    assert.equal(pairs.tick(ctx), true);
    assert.deepEqual(ctx.g.open, []);
    ctx.out.online.delete(SECOND);
    clock = ctx.g.deadline;
    assert.equal(pairs.tick(ctx), true);
    assert.equal(pairs.view(ctx).turn, FIRST);
    pairs.leave(ctx, WATCHER);
    ctx.out.online.clear();
    pairs.leave(ctx, FIRST);
    assert.deepEqual(ctx.g.open, []);
    ctx.out.online.add(FIRST);
    const resumed = restored(pairs, ctx);
    resumed.out.online.delete(SECOND);
    resumed.g.turn = 0;
    while (resumed.g.owner.some((v) => v === null)) {
      const i = resumed.g.owner.indexOf(null);
      const j = resumed.g.deck.findIndex((v, k) => k !== i && v === resumed.g.deck[i] && resumed.g.owner[k] === null);
      assert.equal(pairs.msg(resumed, player(), { i }), true);
      assert.equal(pairs.msg(resumed, player(), { i: j }), true);
    }
    assert.equal(resumed.out.results.length, 1);
    assert.equal(resumed.out.results[0].mode, seats.length === 1 ? 'solo' : 'multi');
    assert.equal(resumed.out.results[0].ranks[0].won, seats.length > 1);
    assert.deepEqual(pairs.view(resumed).cards, resumed.g.deck);
  }

  {
    const ctx = context(code);
    code.start(ctx);
    assert.equal(code.view(ctx, WATCHER).mine, null);
    assert.equal(code.view(ctx, FIRST).secret, null);
    assert.equal(code.msg(ctx, player(WATCHER), { guess: ctx.g.secret }), false);
    assert.equal(code.msg(ctx, player(), { guess: [] }), false);
    assert.equal(code.tick(ctx), false);
    const wrong = ctx.g.secret.map((v) => (v + 1) % KINDS);
    assert.equal(code.msg(ctx, player(), { guess: wrong }), true);
    assert.equal(code.view(ctx, SECOND).others[FIRST].n, 1);
    assert.equal(code.msg(ctx, player(), { guess: ctx.g.secret }), true);
    assert.equal(code.msg(ctx, player(), { guess: ctx.g.secret }), false);
    for (let i = 0; i < MAX_GUESSES; i++) assert.equal(code.msg(ctx, player(SECOND), { guess: wrong }), true);
    assert.equal(code.msg(ctx, player(SECOND), { guess: wrong }), false);
    assert.equal(ctx.out.results[0].ranks[0].id, FIRST);
    assert.equal(ctx.out.results[0].ranks[0].won, true);
    assert.deepEqual(code.view(ctx, SECOND).secret, ctx.g.secret);
    for (const solved of [true, false]) {
      const solo = context(code, [FIRST]);
      code.start(solo);
      if (solved) code.msg(solo, player(), { guess: solo.g.secret });
      else { clock = solo.g.endsAt; assert.equal(code.tick(solo), true); }
      assert.equal(solo.out.results[0].ranks[0].won, solved);
      assert.equal(solo.out.results[0].mode, 'solo');
      assert.match(solo.out.results[0].title[1], solved ? /^Cracked/ : /^Code not/);
    }
    const tied = context(code, [FIRST, SECOND, THIRD]);
    code.start(tied);
    code.msg(tied, player(SECOND), { guess: tied.g.secret });
    clock++;
    code.msg(tied, player(), { guess: tied.g.secret });
    code.msg(tied, player(THIRD), { guess: tied.g.secret.map((v) => (v + 1) % KINDS) });
    code.msg(tied, player(THIRD), { guess: tied.g.secret });
    assert.deepEqual(tied.out.results[0].ranks.map((r) => r.id), [SECOND, FIRST, THIRD]);
  }

  for (const seats of [[FIRST], [FIRST, SECOND]]) {
    const ctx = context(space, seats);
    space.leave(ctx, FIRST);
    space.start(ctx);
    assert.equal(space.msg(ctx, player(WATCHER), { keys: { fire: true } }), false);
    for (const keys of [null, 'up']) assert.equal(space.msg(ctx, player(), { keys }), false);
    assert.equal(space.msg(ctx, player(), { keys: { fire: 1, right: true, ignored: true } }), false);
    assert.deepEqual(ctx.g.w.ships[0].keys, { up: false, down: false, left: false, right: true, fire: true });
    assert.equal(space.tick(ctx), true);
    assert.ok(ctx.g.w.bullets.length);
    const w = ctx.g.w;
    w.spawnAt = 1e9;
    w.shots.push({ x: 80.6, y: 10.2, vx: 0, vy: 0 });
    w.enemies.push({ kind: 'a', x: 70.6, y: 20.2, base: 20, hp: 1, phase: 0, cool: 9 });
    w.items.push({ x: 50.6, y: 20.2 });
    w.boss = { x: 80.6, y: 30.2, hp: 3, max: 5, dir: 1, cool: 9 };
    const view = space.view(ctx);
    assert.deepEqual(view.shots, [[81, 10]]);
    assert.deepEqual(view.enemies, [['a', 71, 20]]);
    assert.deepEqual(view.items, [[51, 20]]);
    assert.deepEqual(view.boss, { x: 81, y: 30, hp: 3, max: 5 });
    space.leave(ctx, FIRST);
    space.leave(ctx, WATCHER);
    assert.deepEqual(w.ships[0].keys, {});
    w.boss = null;
    assert.equal(space.view(ctx).boss, null);
    for (const ship of w.ships) { ship.lives = 1; ship.invul = 0; w.shots.push({ x: ship.x + 2, y: ship.y + 2, vx: 0, vy: 0 }); }
    space.tick(ctx);
    assert.equal(ctx.out.results[0].mode, seats.length > 1 ? 'coop' : 'solo');
    assert.ok(ctx.out.results[0].ranks.every((r) => !r.won));
    assert.match(ctx.out.results[0].title[1], /^Out of lives/);
  }
  {
    const ctx = context(space);
    space.start(ctx);
    Object.assign(ctx.g.w, { level: 3, phase: 'boss', spawnAt: 1e9, boss: { x: 60, y: 20, hp: 1, max: 1, dir: 1, cool: 9 } });
    ctx.g.w.bullets.push({ x: 60, y: 23, by: SECOND });
    space.tick(ctx);
    assert.equal(ctx.g.w.won, true);
    assert.equal(ctx.out.results[0].ranks[0].id, SECOND);
    assert.ok(ctx.out.results[0].ranks.every((r) => r.won));
  }

  {
    assert.equal(snake.tickMs(snake.cfg), SPEEDS[snake.cfg.speed]);
    assert.deepEqual(snake.config(snake.cfg, { speed: -1, maze: -1, walls: 'yes', mode: 'unknown' }), snake.cfg);
    assert.deepEqual(snake.config(snake.cfg, { speed: 1.5, maze: 1.5 }), snake.cfg);
    const configured = snake.config(snake.cfg, { speed: 0, walls: true, mode: 'solo', maze: 1 });
    assert.deepEqual(configured, { speed: 0, walls: true, mode: 'solo', maze: 1 });
    for (const [seats, mode] of [[[FIRST], 'arena'], [[FIRST, SECOND], 'arena'], [[FIRST, SECOND], 'solo']]) {
      const ctx = context(snake, seats, { mode });
      snake.start(ctx);
      assert.equal(snake.msg(ctx, player(WATCHER), { d: 1 }), false);
      assert.equal(snake.msg(ctx, player(), { d: 1 }), false);
      assert.equal(snake.msg(ctx, player(), { d: 'up' }), false);
      snake.tick(ctx);
      assert.equal(snake.view(ctx, FIRST).snakes[0].dir, 'up');
      const worlds = ctx.g.solo ? ctx.g.worlds : [ctx.g];
      assert.equal(snake.view(ctx, FIRST).solo, mode === 'solo');
      assert.equal(snake.view(ctx, WATCHER).board.length, seats.length);
      for (const world of worlds) for (const s of world.snakes) s.alive = false;
      if (ctx.g.solo) {
        worlds[0].snakes[0].score = 10;
        worlds[1].snakes[0].score = 5;
        assert.equal(snake.view(ctx, WATCHER).snakes[0].id, FIRST);
      }
      snake.tick(ctx);
      assert.equal(ctx.out.results[0].mode, mode === 'solo' ? 'race' : seats.length > 1 ? 'multi' : 'solo');
      assert.equal(ctx.out.results[0].ranks[0].won, seats.length > 1);
    }
    const tied = context(snake, [FIRST, SECOND], { mode: 'solo' });
    snake.start(tied);
    tied.g.worlds[0].snakes[0].alive = false;
    assert.equal(snake.view(tied, WATCHER).snakes[0].id, SECOND);
    tied.g.worlds[1].snakes[0].alive = false;
    snake.tick(tied);
    assert.ok(tied.out.results[0].ranks.every((r) => !r.won));
  }

  {
    assert.equal(gold.config(gold.cfg, { mode: 'invalid' }), null);
    assert.deepEqual(gold.config(gold.cfg, { mode: 'versus' }), { mode: 'versus' });
    const lobby = context(gold, [FIRST, SECOND, THIRD, 'fourth', WATCHER]);
    lobby.g = null;
    assert.equal(gold.view(lobby).players.at(-1).spec, true);
    gold.hello(lobby, FIRST);
    assert.equal(lobby.out.sent.length, 0);
    const ctx = context(gold);
    ctx.out.order.push(WATCHER);
    ctx.out.online.add(WATCHER);
    gold.start(ctx);
    assert.equal(ctx.out.sent[0].message.t, 'me');
    assert.equal(ctx.out.sent[1].message.t, 'world');
    assert.equal(gold.view(ctx).players.at(-1).spec, true);
    gold.hello(ctx, WATCHER);
    assert.equal(ctx.out.sent.at(-1).id, WATCHER);
    assert.equal(gold.msg(ctx, player(WATCHER), { t: 'shoot' }), false);
    assert.equal(gold.msg(ctx, player(), { t: 'unknown' }), false);
    assert.equal(gold.msg(ctx, player(), { t: 'ready' }), false);
    assert.equal(gold.msg(ctx, player(), { t: 'buy', key: 'dynamite' }), false);
    assert.equal(gold.msg(ctx, player(), { t: 'dyn' }), false);
    assert.equal(gold.msg(ctx, player(), { t: 'shoot' }), false);
    assert.equal(ctx.out.sent.at(-1).message.evs[0].k, 'shoot');
    const sent = ctx.out.sent.length;
    gold.msg(ctx, player(), { t: 'shoot' });
    assert.equal(ctx.out.sent.length, sent);
    const miner = ctx.g.world.miners[0];
    Object.assign(miner, { mode: 'in', held: { id: 999, type: 'rockBig' }, dynamite: 1 });
    gold.msg(ctx, player(), { t: 'dyn' });
    assert.equal(miner.dynamite, 0);
    assert.equal(ctx.out.sent.at(-1).message.evs[0].k, 'boom');
    Object.assign(miner, { mode: 'in', held: { id: 998, type: 'goldBig' }, len: 1 });
    clock += 50;
    assert.equal(gold.tick(ctx), false);
    assert.equal(ctx.g.team, 500);
    assert.equal(ctx.g.pl[FIRST].money, 500);
    assert.equal(ctx.out.sent.at(-1).options.tape, true);
    clock += 20;
    gold.tick(ctx);
    assert.equal(ctx.out.sent.at(-1).options.tape, false);
    ctx.g.team = teamTarget(ctx.g.level, ctx.seats.length) + 1000;
    ctx.g.world.time = 0;
    clock += 50;
    assert.equal(gold.tick(ctx), true);
    assert.equal(ctx.g.phase, 'shop');
    assert.equal(gold.view(ctx).status, 'shop');
    assert.equal(gold.tick(ctx), false);
    assert.equal(gold.msg(ctx, player(), { t: 'shoot' }), false);
    assert.equal(gold.msg(ctx, player(), { t: 'dyn' }), false);
    assert.equal(gold.msg(ctx, player(), { t: 'buy', key: 'missing' }), false);
    const offer = ctx.g.pl[FIRST].offer[0];
    const money = ctx.g.team;
    ctx.g.team = offer.price - 1;
    assert.equal(gold.msg(ctx, player(), { t: 'buy', key: offer.key }), false);
    ctx.g.team = money;
    assert.equal(gold.msg(ctx, player(), { t: 'buy', key: offer.key }), true);
    assert.equal(ctx.g.team, money - offer.price);
    assert.equal(gold.msg(ctx, player(), { t: 'buy', key: offer.key }), false);
    ctx.g.pl[FIRST].bought.dynamite = true;
    assert.equal(gold.msg(ctx, player(), { t: 'ready' }), true);
    assert.equal(ctx.g.phase, 'shop');
    assert.equal(gold.msg(ctx, player(SECOND), { t: 'ready' }), true);
    assert.equal(ctx.g.phase, 'playing');
    assert.equal(ctx.g.level, 2);
    assert.equal(ctx.g.pl[FIRST].dynamite, 1);
    ctx.g.world.time = 0;
    ctx.g.team = 0;
    clock += 50;
    assert.equal(gold.tick(ctx), true);
    assert.equal(ctx.g.phase, 'ended');
    assert.equal(ctx.out.results[0].win, false);
    assert.equal(ctx.out.results[0].ranks[0].score, 500);
    assert.equal(gold.tick(ctx), false);
    gold.leave(ctx, FIRST);
    assert.equal(gold.view(ctx).team, 0);
  }

  {
    const ctx = context(gold, [FIRST, SECOND], { mode: 'versus' });
    gold.start(ctx);
    assert.equal(gold.view(ctx).target, null);
    ctx.out.online.delete(SECOND);
    assert.equal(gold.view(ctx).players.find((p) => p.id === SECOND).online, false);
    const miner = ctx.g.world.miners[0];
    Object.assign(miner, { mode: 'in', held: { id: 999, type: 'goldBig' }, len: 1 });
    clock += 50;
    gold.tick(ctx);
    assert.equal(ctx.g.team, 0);
    assert.equal(ctx.g.pl[FIRST].money, 500);
    ctx.g.world.time = 0;
    gold.tick(ctx);
    assert.equal(ctx.g.phase, 'shop');
    const offer = ctx.g.pl[FIRST].offer[0];
    ctx.g.pl[FIRST].money = offer.price;
    assert.equal(gold.msg(ctx, player(), { t: 'buy', key: offer.key }), true);
    assert.equal(ctx.g.pl[FIRST].money, 0);
    clock = ctx.g.shopEndsAt;
    assert.equal(gold.tick(ctx), true);
    assert.equal(ctx.g.level, 2);
    ctx.g.world.time = 0;
    gold.tick(ctx);
    ctx.g.pl[FIRST].ready = true;
    ctx.g.pl[SECOND].ready = true;
    gold.leave(ctx, SECOND);
    assert.equal(ctx.g.phase, 'playing');
    ctx.g.level = VERSUS_LEVELS;
    ctx.g.pl[SECOND].money = 999;
    ctx.g.world.time = 0;
    gold.tick(ctx);
    assert.equal(ctx.out.results[0].winner, SECOND);
    assert.equal(ctx.out.results[0].ranks[0].id, SECOND);
    assert.equal(ctx.out.results[0].ranks[0].detail.team, undefined);
    ctx.out.online.clear();
    assert.equal(gold.view(ctx).players.length, 2);
  }

  for (const mode of ['coop', 'race']) {
    const ctx = context(mines, [FIRST, SECOND], { mode });
    ctx.out.order.push(WATCHER);
    ctx.out.online.add(WATCHER);
    ctx.g = null;
    assert.equal(mines.view(ctx).startedAt, 0);
    mines.hello(ctx, FIRST);
    assert.equal(ctx.out.sent.length, 0);
    for (const t of ['open', 'cur', 'restart']) assert.equal(mines.msg(ctx, player(), { t, i: 0 }), false);
    ctx.g = {};
    mines.start(ctx);
    const own = ctx.g.units[mode === 'coop' ? 'all' : FIRST];
    const field = ctx.g.field;
    const initialGrids = ctx.out.sent.find((m) => m.id === FIRST).message.grids;
    assert.equal(Object.keys(initialGrids).length, 1);
    for (const id of [WATCHER, '']) assert.equal(mines.msg(ctx, player(id), { t: 'open', i: 0 }), false);
    for (const i of [-1, 0.5, field.mines.length]) assert.equal(mines.msg(ctx, player(), { t: 'open', i }), false);
    const mine = field.mines.findIndex(Boolean);
    assert.equal(mines.msg(ctx, player(), { t: 'flag', i: mine }), false);
    assert.equal(own.vis[mine], FLAG);
    assert.equal(mines.msg(ctx, player(), { t: 'open', i: mine }), false);
    assert.equal(mines.msg(ctx, player(), { t: 'flag', i: mine }), false);
    assert.equal(own.vis[mine], HIDDEN);
    const opened = own.vis.findIndex((v) => v >= 0);
    assert.equal(mines.msg(ctx, player(), { t: 'flag', i: opened }), false);
    assert.equal(mines.msg(ctx, player(), { t: 'open', i: opened }), false);
    assert.equal(mines.msg(ctx, player(), { t: 'chord', i: mine }), false);
    for (const p of ['invalid', [NaN]]) assert.equal(mines.msg(ctx, player(), { t: 'cur', p }), false);
    for (const p of [null, [1.5, 2.5]]) {
      const before = ctx.out.sent.length;
      assert.equal(mines.msg(ctx, player(), { t: 'cur', p }), false);
      assert.ok(ctx.out.sent.length > before);
      assert.ok(ctx.out.sent.slice(before).every((m) => m.id !== FIRST));
    }
    for (const i of [-1, field.mines.length, 0.5]) assert.equal(mines.msg(ctx, player(), { t: 'ping', i }), false);
    const beforePing = ctx.out.sent.length;
    mines.msg(ctx, player(), { t: 'ping', i: mine });
    assert.ok(ctx.out.sent.length > beforePing);
    const afterPing = ctx.out.sent.length;
    mines.msg(ctx, player(), { t: 'ping', i: mine });
    assert.equal(ctx.out.sent.length, afterPing);
    assert.equal(mines.msg(ctx, player(WATCHER), { t: 'cur', p: null }), false);
    assert.equal(mines.msg(ctx, player(), { t: 'open', i: mine }), true);
    assert.equal(ctx.g.stats[FIRST].booms, 1);
    assert.equal(own.booms, 1);
    assert.equal(own.penalty, mode === 'race' ? BOOM_PENALTY_MS : 0);
    const resumed = restored(mines, ctx);
    clock += 1000;
    for (let i = 0; i < field.mines.length && !resumed.g.over; i++) {
      if (!field.mines[i]) mines.msg(resumed, player(), { t: 'open', i });
    }
    assert.equal(resumed.g.over, true);
    assert.equal(resumed.out.results[0].ranks[0].won, true);
    assert.equal(resumed.out.results[0].ranks[1].won, mode === 'coop');
    assert.equal(resumed.out.results[0].ranks[0].detail.booms, 1);
    assert.ok(resumed.out.sent.some((m) => m.message.t === 'reveal' && m.message.mines.includes(mine)));
    assert.equal(mines.msg(resumed, player(), { t: 'open', i: opened }), false);
    assert.equal(mines.msg(resumed, player(), { t: 'cur', p: null }), false);
    mines.hello(resumed, WATCHER);
    assert.equal(resumed.out.sent.at(-1).message.t, 'reveal');
    assert.equal(mines.view(resumed).units[mode === 'coop' ? 'all' : FIRST].done, 'clear');
  }

  {
    assert.deepEqual(mines.config(mines.cfg, { mode: 'race', size: 1 }), { mode: 'race', size: 1 });
    for (const patch of [{ mode: 'team' }, { size: -1 }, { size: 0.5 }]) assert.deepEqual(mines.config(mines.cfg, patch), mines.cfg);
    const ctx = context(mines);
    mines.start(ctx);
    const mineCells = ctx.g.field.mines.flatMap((v, i) => v ? [i] : []);
    for (const i of mineCells.slice(0, ctx.g.units.all.lives)) mines.msg(ctx, player(), { t: 'open', i });
    assert.equal(ctx.g.units.all.done, 'dead');
    assert.equal(ctx.g.winner, null);
    assert.ok(ctx.out.results[0].ranks.every((r) => !r.won));
    const lobby = context(mines, [FIRST, SECOND, THIRD, 'fourth', WATCHER]);
    assert.equal(mines.view(lobby).players.at(-1).spec, true);
    const chord = context(mines, [FIRST]);
    mines.start(chord);
    const size = MINE_SIZES[chord.cfg.size];
    const numbered = chord.g.field.counts.findIndex((v, i) => v > 0 && !chord.g.field.mines[i]);
    mines.msg(chord, player(), { t: 'open', i: numbered });
    const around = neighbors(numbered, size.rows, size.cols);
    for (const i of around) if (chord.g.field.mines[i]) mines.msg(chord, player(), { t: 'flag', i });
    mines.msg(chord, player(), { t: 'chord', i: numbered });
    assert.ok(around.every((i) => chord.g.field.mines[i] || chord.g.units.all.vis[i] >= 0));
  }

  {
    const lobby = context(tiles, [FIRST, SECOND, THIRD, 'fourth', WATCHER]);
    lobby.g = null;
    assert.equal(tiles.view(lobby).players.at(-1).spec, true);
    assert.equal(tiles.msg(lobby, player(), { t: 'team', team: 'invalid' }), false);
    assert.equal(tiles.msg(lobby, player(), { t: 'team', team: 'B' }), true);
    assert.equal(lobby.keep.team[FIRST], 'B');
    assert.equal(tiles.msg(lobby, player(), { t: 'pick', a: [1, 1], b: [1, 2] }), false);
    assert.equal(tiles.tick(lobby), false);
    tiles.hello(lobby, WATCHER);
    assert.equal(lobby.out.sent.length, 0);
    assert.deepEqual(tiles.config(tiles.cfg, { mode: 'team', size: 3, tiles: 'animal' }), { mode: 'team', size: 3, tiles: 'animal' });
    for (const patch of [{ mode: 'bad' }, { size: 0.5 }, { size: -1 }, { tiles: 'bad' }]) assert.deepEqual(tiles.config(tiles.cfg, patch), tiles.cfg);
  }

  for (const mode of ['coop', 'race', 'team']) {
    const ctx = context(tiles, [FIRST, SECOND, THIRD], { mode, size: 3 });
    ctx.out.order.push(WATCHER);
    ctx.out.online.add(WATCHER);
    tiles.start(ctx);
    const uid = mode === 'coop' ? 'all' : mode === 'race' ? FIRST : ctx.keep.team[FIRST];
    const unit = ctx.g.units[uid];
    assert.equal(tiles.view(ctx).players.find((p) => p.id === FIRST).unit, uid);
    assert.ok(ctx.out.sent.some((m) => m.id === WATCHER && m.message.t === 'minis'));
    tiles.hello(ctx, FIRST);
    assert.equal(ctx.out.sent.at(-2).message.why, 'sync');
    assert.equal(tiles.msg(ctx, player(), { t: 'team', team: 'A' }), false);
    assert.equal(tiles.msg(ctx, player(), { t: 'watch', unit: uid }), false);
    assert.equal(tiles.msg(ctx, player(WATCHER), { t: 'watch', unit: 'missing' }), false);
    const watched = Object.keys(ctx.g.units).at(-1);
    assert.equal(tiles.msg(ctx, player(WATCHER), { t: 'watch', unit: watched }), false);
    assert.equal(ctx.g.watch[WATCHER], watched);
    assert.equal(ctx.out.sent.at(-1).message.unit, watched);
    assert.equal(tiles.msg(ctx, player(WATCHER), { t: 'sel', a: null }), false);
    assert.equal(tiles.msg(ctx, player(WATCHER), { t: 'pick', a: [1, 1], b: [1, 2] }), false);
    assert.equal(tiles.msg(ctx, player(WATCHER), { t: 'shuffle' }), false);
    assert.equal(tiles.msg(ctx, player(), { t: 'unknown' }), false);
    for (const a of [null, [0, 1], [-1, 1], [1, 0], [1, -1], [999, 1], [1, 999], [0.5, 1], [1, 0.5], 'bad']) {
      assert.equal(tiles.msg(ctx, player(), { t: 'pick', a, b: [1, 2] }), false);
    }
    assert.equal(tiles.msg(ctx, player(), { t: 'pick', a: [1, 1], b: [1, 1] }), false);
    assert.equal(ctx.out.sent.at(-1).message.why, 'sync');
    assert.equal(ctx.out.sent.at(-1).options.tape, false);
    for (const p of [[-1, 0], [0, -1], [999, 0], [0, 999], [NaN, 0], [0, NaN], 'bad']) {
      assert.equal(tiles.msg(ctx, player(), { t: 'cur', p }), false);
    }
    for (const message of [{ t: 'cur', p: [1.5, 1.5] }, { t: 'cur', p: null }, { t: 'sel', a: [1, 1] }, { t: 'sel', a: null }]) {
      const before = ctx.out.sent.length;
      assert.equal(tiles.msg(ctx, player(), message), false);
      assert.ok(ctx.out.sent.slice(before).every((m) => m.id !== FIRST));
    }
    assert.equal(tiles.msg(ctx, player(), { t: 'sel', a: [0, 0] }), false);
    assert.equal(tiles.msg(ctx, player(), { t: 'ping', a: null }), false);
    assert.equal(tiles.msg(ctx, player(), { t: 'ping', a: [1, 1] }), false);
    const pingCount = ctx.out.sent.length;
    assert.equal(tiles.msg(ctx, player(), { t: 'ping', a: [1, 1] }), false);
    assert.equal(ctx.out.sent.length, pingCount);
    const beforeShuffle = unit.shuffles;
    assert.equal(tiles.msg(ctx, player(), { t: 'shuffle' }), true);
    assert.equal(unit.shuffles, beforeShuffle - 1);
    unit.shuffles = 0;
    assert.equal(tiles.msg(ctx, player(), { t: 'shuffle' }), false);
    const matched = findPair(unit.board);
    assert.ok(matched);
    const [a, b] = matched;
    assert.equal(tiles.msg(ctx, player(), { t: 'pick', a, b }), true);
    assert.equal(ctx.g.score[FIRST], 10);
    assert.equal(unit.score, 10);
    assert.ok(ctx.out.sent.some((m) => m.message.t === 'match' && m.message.pts === 10));
    const next = findPair(unit.board);
    assert.ok(next);
    assert.equal(tiles.msg(ctx, player(), { t: 'pick', a: next[0], b: next[1] }), true);
    assert.equal(unit.combo, 2);
    assert.equal(unit.score, 30);
    clock += 3001;
    const later = findPair(unit.board);
    assert.ok(later);
    tiles.msg(ctx, player(), { t: 'pick', a: later[0], b: later[1] });
    assert.equal(unit.combo, 1);
    const resumed = restored(tiles, ctx);
    assert.deepEqual(tiles.view(resumed).units, tiles.view(ctx).units);
    for (const u of Object.values(resumed.g.units)) u.endAt = clock;
    assert.equal(tiles.tick(resumed), true);
    assert.equal(resumed.g.over, true);
    assert.equal(resumed.out.results[0].ranks[0].won, mode !== 'coop');
    assert.ok(resumed.out.ranks.some((r) => r.score === 40 && r.cleared === false));
    assert.equal(tiles.tick(resumed), false);
    assert.equal(tiles.msg(resumed, player(), { t: 'shuffle' }), false);
  }

  {
    const ctx = context(tiles, [FIRST], { size: 3 });
    tiles.start(ctx);
    const unit = ctx.g.units.all;
    const board = unit.board;
    for (const row of board) row.fill(0);
    board[1][1] = 9; board[1][2] = 9;
    board[2][1] = 1; board[2][2] = 2;
    board[3][1] = 2; board[3][2] = 1;
    const deadline = unit.endAt;
    assert.equal(tiles.msg(ctx, player(), { t: 'pick', a: [1, 1], b: [1, 2] }), true);
    assert.equal(unit.endAt, deadline + 10_000);
    assert.ok(ctx.out.sent.some((m) => m.message.why === 'stuck'));
    assert.ok(findPair(unit.board));
  }

  for (const mode of ['coop', 'race']) {
    const ctx = context(tiles, [FIRST, SECOND], { mode, size: 3 });
    tiles.start(ctx);
    const uid = mode === 'coop' ? 'all' : FIRST;
    const unit = ctx.g.units[uid];
    const prior = unit.shuffles;
    for (const row of unit.board) row.fill(0);
    unit.board[1][1] = 1; unit.board[1][2] = 1;
    assert.equal(tiles.msg(ctx, player(), { t: 'pick', a: [1, 1], b: [1, 2] }), true);
    assert.equal(unit.level, 2);
    assert.equal(unit.shuffles, prior + 1);
    assert.notEqual(unit.board, ctx.g.deck[1]);
    assert.deepEqual(unit.board, ctx.g.deck[1]);
    unit.level = TILE_LEVELS;
    for (const row of unit.board) row.fill(0);
    unit.board[1][1] = 1; unit.board[1][2] = 1;
    assert.equal(tiles.msg(ctx, player(), { t: 'pick', a: [1, 1], b: [1, 2] }), true);
    assert.equal(unit.done, 'clear');
    assert.equal(ctx.g.winner, uid);
    assert.equal(ctx.out.ranks[0].cleared, true);
    assert.equal(ctx.out.results[0].ranks[0].won, true);
    assert.equal(ctx.out.results[0].ranks[1].won, mode === 'coop');
  }

  {
    const ctx = context(tiles, [FIRST, SECOND], { mode: 'race', size: 3 });
    tiles.start(ctx);
    ctx.g.units[FIRST].endAt = clock;
    assert.equal(tiles.msg(ctx, player(), { t: 'pick', a: [1, 1], b: [1, 2] }), true);
    assert.equal(ctx.g.units[FIRST].done, 'out');
    assert.equal(ctx.g.over, false);
    assert.equal(tiles.msg(ctx, player(), { t: 'pick', a: [1, 1], b: [1, 2] }), false);
    assert.equal(tiles.msg(ctx, player(), { t: 'shuffle' }), false);
    ctx.g.units[SECOND].level = 2;
    ctx.g.units[SECOND].endAt = clock;
    tiles.tick(ctx);
    assert.equal(ctx.g.winner, SECOND);
    assert.equal(ctx.out.results[0].ranks[1].won, true);
  }

  {
    const ctx = context(loto, [FIRST]);
    delete ctx.cfg.pace;
    ctx.cfg.penalty = 'party';
    ctx.keep.auto = { [FIRST]: true };
    loto.start(ctx);
    assert.equal(ctx.g.pace, 0);
    assert.equal(loto.msg(ctx, player(), { a: 'pace', s: 0 }), true);
    assert.equal(loto.msg(ctx, player(WATCHER), { a: 'mark', i: 0 }), false);
    assert.equal(loto.msg(ctx, player(), { a: 'auto', on: 'yes' }), false);
    assert.equal(loto.msg(ctx, player(), { a: 'unknown' }), false);
    ctx.rand = () => 0;
    assert.equal(loto.msg(ctx, player(), { a: 'kinh' }), true);
    assert.deepEqual(ctx.out.sent.at(-1).message, {
      t: 'loto', e: 'lao', id: FIRST, party: ['Hát 1 câu', 'Sing one line of a song'],
    });
    assert.equal(loto.msg(ctx, player(), { a: 'kinh' }), false);
    delete ctx.g.pen;
    assert.deepEqual(loto.view(ctx, FIRST).liars, []);
    const initialSeed = 42;
    const duplicate = context(loto, [FIRST]);
    duplicate.rand = seeded(initialSeed);
    loto.start(duplicate);
    const firstCard = structuredClone(duplicate.g.cards[FIRST][0]);
    duplicate.rand = seeded(initialSeed);
    loto.join(duplicate, player(SECOND));
    assert.notDeepEqual(duplicate.g.cards[SECOND][0], firstCard);
  }

  for (const scores of [[25, 25], [40, 10]]) {
    const ctx = context(quan, [FIRST, SECOND], { level: 0 });
    quan.start(ctx);
    ctx.g.s.b.fill(0);
    ctx.g.s.big.fill(0);
    ctx.g.s.cap[1] = { small: scores[0], big: 1 };
    ctx.g.s.cap[2] = { small: scores[1], big: 1 };
    ctx.g.s.over = true;
    const resumed = restored(quan, ctx);
    expired(resumed);
    assert.equal(quan.tick(resumed), true);
    assert.equal(resumed.out.results[0].ranks[0].score, scores[0] + 10);
    assert.equal(resumed.out.results[0].ranks[0].won, scores[0] > scores[1]);
    assert.match(resumed.out.results[0].title[1], scores[0] === scores[1] ? /^Draw/ : /^Name player-first wins/);
  }

  {
    const ctx = context(pairs);
    pairs.start(ctx);
    for (let pair = 0; pair < 12; pair++) {
      const id = ctx.seats[ctx.g.turn];
      const i = ctx.g.owner.indexOf(null);
      const j = ctx.g.deck.findIndex((v, k) => k !== i && v === ctx.g.deck[i] && ctx.g.owner[k] === null);
      pairs.msg(ctx, player(id), { i });
      pairs.msg(ctx, player(id), { i: j });
      if (pair < 11) { clock = ctx.g.deadline; pairs.tick(ctx); }
    }
    assert.deepEqual(ctx.out.results[0].ranks.map((r) => [r.score, r.won]), [[6, false], [6, false]]);
  }

  {
    const ctx = context(fleet, [FIRST]);
    fleet.start(ctx);
    assert.deepEqual(fleet.view(ctx, FIRST).names, [`Name ${FIRST}`, 'Máy']);
    fleet.msg(ctx, player(), { t: 'ready' });
    const hit = ctx.g.fleets[1][0][0];
    fleet.msg(ctx, player(), { t: 'shoot', i: hit });
    const previous = [...ctx.g.shots[0]];
    expired(ctx);
    assert.equal(fleet.tick(ctx), true);
    assert.equal(ctx.g.fired[0], 2);
    assert.notEqual(ctx.g.last.i, hit);
    assert.equal(ctx.g.shots[0].filter(Boolean).length, previous.filter(Boolean).length + 1);
  }

  {
    const ctx = context(ganh);
    ganh.start(ctx);
    const legacy = restored(ganh, ctx);
    delete legacy.g.s.open;
    assert.equal(ganh.view(legacy).open, -1);
    assert.deepEqual(ganh.view(legacy).b, ctx.g.s.b);
    assert.equal(Object.hasOwn(legacy.g.s, 'open'), false);
  }

  {
    const ctx = context(gold, [FIRST, SECOND], { mode: 'versus' });
    gold.start(ctx);
    const orphan = structuredClone(ctx.g.world.miners[0]);
    Object.assign(orphan, { id: WATCHER, mode: 'in', held: { id: 999, type: 'goldBig' }, len: 1, dynamite: 7 });
    ctx.g.world.miners.push(orphan);
    ctx.g.level = VERSUS_LEVELS;
    ctx.g.world.time = 0;
    const resumed = restored(gold, ctx);
    clock += 50;
    assert.equal(gold.tick(resumed), true);
    assert.equal(resumed.g.pl[WATCHER], undefined);
    assert.deepEqual(resumed.out.results[0].ranks.map((r) => [r.id, r.score]), [[FIRST, 0], [SECOND, 0]]);
    const collection = resumed.out.sent.find((entry) => entry.message.evs?.some((event) => event.k === 'collect'));
    assert.deepEqual(collection.message.money.players, { [FIRST]: 0, [SECOND]: 0 });
    assert.equal(collection.message.evs.find((event) => event.k === 'collect').id, WATCHER);
    assert.equal(collection.message.evs.find((event) => event.k === 'collect').value, 500);
  }

  {
    const ctx = context(gold);
    gold.start(ctx);
    ctx.g.team = teamTarget(ctx.g.level, ctx.seats.length);
    ctx.g.world.time = 0;
    gold.tick(ctx);
    assert.equal(ctx.g.phase, 'shop');
    const resumed = restored(gold, ctx);
    delete resumed.g.pl[FIRST].bought;
    clock = resumed.g.shopEndsAt;
    assert.equal(gold.tick(resumed), true);
    assert.equal(resumed.g.level, 2);
    assert.deepEqual(resumed.g.pl[FIRST].buffs, { strength: false, clover: false, rockBook: false, polish: false });
    assert.equal(resumed.g.pl[FIRST].dynamite, 0);
  }

  {
    const ctx = context(tiles);
    ctx.g = { units: {}, watch: { [FIRST]: 'removed-unit' } };
    const resumed = restored(tiles, ctx);
    tiles.hello(resumed, FIRST);
    assert.deepEqual(resumed.out.sent, [{ id: FIRST, message: { t: 'minis', boards: {} }, options: undefined }]);
    assert.deepEqual(tiles.view(resumed).units, {});
  }

  {
    let retainedHistory;
    for (let seed = 1; seed <= 32 && !retainedHistory; seed++) {
      const ctx = context(quan, [FIRST], { level: 0 });
      quan.start(ctx);
      const choose = seeded(seed);
      const beforeHumanMoves = [];
      while (!ctx.g.s.over && beforeHumanMoves.length <= 10) {
        if (ctx.g.side[ctx.g.s.turn - 1] !== FIRST) {
          expired(ctx);
          quan.tick(ctx);
          continue;
        }
        const moves = quanMoves(ctx.g.s);
        const [k, d] = moves[Math.floor(choose() * moves.length)];
        beforeHumanMoves.push(structuredClone(ctx.g.s));
        assert.equal(quan.msg(ctx, player(), { k, d }), true);
        assert.deepEqual(ctx.g.hist, beforeHumanMoves.slice(-10));
      }
      if (beforeHumanMoves.length === 11) retainedHistory = ctx.g.hist;
    }
    assert.equal(retainedHistory?.length, 10);
  }

  {
    const ctx = context(spy, [FIRST, SECOND, THIRD, 'fourth'], { pack: 'ai', aiPackId: 'a9e481fa-b555-4c86-9c7d-111111111111', aiTopic: 'Động vật' });
    spy.start(ctx);
    assert.deepEqual(ctx.out.results[0].ranks, []);
    assert.match(ctx.out.results[0].title[1], /AI pack expired/);
    const brokenRandom = context(spy, [FIRST, SECOND, THIRD, 'fourth']);
    brokenRandom.rand = () => { throw new Error('random source unavailable'); };
    assert.throws(() => spy.start(brokenRandom), /random source unavailable/);
    assert.equal(brokenRandom.out.results.length, 0);
    const lobby = context(spy);
    lobby.g = null;
    assert.equal(spy.view(lobby, FIRST).dealId, 0);
  }
} finally {
  Date.now = originalNow;
  Math.random = originalRandom;
}

{
  const fallback = aiFailure('unknown-provider-error');
  assert.equal(fallback.status, AI_STATUS.UNAVAILABLE);
  assert.deepEqual(fallback.msg, aiFailure(AI_ERROR.UNAVAILABLE).msg);
  assert.equal(aiFailure(AI_ERROR.REQUEST, AI_STATUS.CONFLICT).status, AI_STATUS.CONFLICT);
  const broken = {
    async get() { return undefined; },
    async put() { throw new Error('storage unavailable'); },
  };
  let calls = 0;
  const provider = { async run() { calls++; throw new Error('must not bill after failed reservation'); } };
  const service = new SpyAiService(broken, provider);
  assert.equal((await service.topics(FIRST)).error, AI_ERROR.UNAVAILABLE);
  assert.equal(calls, 0);
  assert.equal((await service.generate(FIRST, 'Động vật')).error, AI_ERROR.UNAVAILABLE);
  assert.equal(calls, 0);
}

{
  const now = AI_LIMIT.TTL;
  const pairs = Array.from({ length: AI_LIMIT.PAIRS }, (_, i) => [`Chó ${i}`, `Mèo ${i}`]);
  const grants = Object.fromEntries(Array.from({ length: AI_LIMIT.GRANTS }, (_, i) => [`pack-${i}`, {
    packId: `pack-${i}`, owner: `guest-${i}`, title: 'Động vật', pairs, expires: now + AI_LIMIT.TTL,
  }]));
  const snapshot = {
    day: 1, total: 0, guests: {}, reservations: {}, grants,
    cache: { 'generate:động vật': { title: 'Động vật', pairs, expires: now + AI_LIMIT.TTL } },
  };
  const writes = [];
  const storage = {
    async get() { return structuredClone(snapshot); },
    async put(key, value) { writes.push(structuredClone({ key, value })); },
  };
  const service = new SpyAiService(storage, null, () => now);
  assert.equal((await service.generate(FIRST, 'Động vật')).error, AI_ERROR.QUOTA);
  assert.equal(writes.length, 0);
  const existing = await service.generate('guest-0', 'Động vật');
  assert.equal(existing.packId, 'pack-0');
  assert.equal(existing.count, AI_LIMIT.PAIRS);
}

{
  const storage = { async get() { return undefined; }, async put() { throw new Error('unexpected write'); } };
  const provider = { run: () => new Promise(() => {}) };
  const service = new SpyAiService(storage, provider);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const inference = service.infer(AI_ACTION.TOPICS, '');
    const rejected = assert.rejects(inference, (error) => error.code === AI_ERROR.UNAVAILABLE);
    mock.timers.tick(AI_LIMIT.TIMEOUT);
    await rejected;
  } finally {
    mock.timers.reset();
  }
}

console.log('application coverage ok');

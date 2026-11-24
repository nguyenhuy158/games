import assert from 'node:assert/strict';
import { MIN_PLAYERS, MAX_PLAYERS, NAME_LIMIT, NAME_ERROR, DEFAULT_CONFIG, PACKS, DURATIONS, PHASE, ACTION, ROLE, limits, normalizeConfig, validateSetup, createGame, act, advance, view, parseNames, orderedIds, movePlayer, shufflePlayers } from './public/gian-diep/logic.js';
import gianDiep from './worker/games/gian-diep.js';

const NOW = 1_000;
const SECOND = 1_000;
const COUNTDOWN = 3 * SECOND;
const HIDDEN_TEAM = 'hidden';
const idsFor = (n) => Array.from({ length: n }, (_, index) => `player-${index}`);
const makeGame = (n = 6, cfg = {}, rand = () => 0.999999) => createGame(idsFor(n), { ...DEFAULT_CONFIG, ...cfg }, rand, NOW);
const hostOf = (g) => g.players[0].id;
const playerOf = (g, role) => g.players.find((player) => player.alive && player.role === role);
const alive = (g) => g.players.filter((player) => player.alive);

function rejected(g, actor, message, host = hostOf(g), now = NOW) {
  const before = structuredClone(g);
  assert.equal(act(g, actor, host, message, now), false);
  assert.deepEqual(g, before, 'a rejected action must not mutate anything');
}

function begin(g, now = NOW) {
  assert.equal(act(g, hostOf(g), hostOf(g), { a: ACTION.NEXT }, now), true);
  assert.equal(g.phase, PHASE.DESCRIBE);
}

function discussion(g, now = NOW) {
  if (g.phase === PHASE.DEAL) begin(g, now);
  for (let turn = 0; turn <= g.players.length && g.phase === PHASE.DESCRIBE; turn++) {
    assert.equal(act(g, hostOf(g), hostOf(g), { a: ACTION.NEXT }, now), true);
  }
  assert.equal(g.phase, PHASE.DISCUSS);
}

function voting(g, now = NOW) {
  if (g.phase !== PHASE.TIE) discussion(g, now);
  const action = g.phase === PHASE.TIE ? ACTION.NEXT : ACTION.VOTING;
  assert.equal(act(g, hostOf(g), hostOf(g), { a: action }, now), true);
  assert.equal(g.phase, PHASE.COUNTDOWN);
  assert.equal(g.deadline, now + COUNTDOWN);
  assert.equal(advance(g, g.deadline), true);
  assert.equal(g.phase, PHASE.VOTE);
}

function eliminate(g, target, now = NOW) {
  if (g.phase === PHASE.DEAL) begin(g, now);
  assert.equal(act(g, hostOf(g), hostOf(g), { a: ACTION.ELIMINATE, target }, now), true);
  assert.equal(g.players.find((player) => player.id === target).alive, false);
}

function voteOut(g, target) {
  voting(g);
  const voters = alive(g);
  const other = voters.find((player) => player.id !== target).id;
  for (const voter of voters) {
    assert.equal(act(g, voter.id, hostOf(g), { a: ACTION.VOTE, target: voter.id === target ? other : target }, NOW + COUNTDOWN), true);
  }
  assert.equal(g.lastEliminated, target);
  assert.equal(g.players.find((player) => player.id === target).alive, false);
}

function room(n = 6, cfg = {}, rand = () => 0.999999) {
  let now = NOW;
  let host = idsFor(n)[0];
  const ended = [], wakes = [];
  const ctx = {
    g: {}, keep: {}, seats: idsFor(n), cfg: { ...DEFAULT_CONFIG, ...cfg }, rand,
    now: () => now, host: () => host, name: (id) => `Tên ${id}`,
    end: (result) => ended.push(result), wakeAt: (at) => wakes.push(at),
  };
  return { ctx, ended, wakes, time: (value) => { now = value; }, host: (value) => { host = value; } };
}

{
  assert.deepEqual(parseNames(' An \r\nBình\r\nChi '), { names: ['An', 'Bình', 'Chi'] });
  assert.deepEqual(parseNames('An\nBình\nChi'), { names: ['An', 'Bình', 'Chi'] });
  for (const text of ['', '   ', 'An\n\nChi', 'An\r\n']) assert.equal(parseNames(text).error, NAME_ERROR.EMPTY);
  for (const text of ['An\nan', 'Án\nA\u0301n']) assert.equal(parseNames(text).error, NAME_ERROR.DUPLICATE);
  assert.equal(parseNames(' AN ', ['An']).error, NAME_ERROR.DUPLICATE);
  assert.equal(parseNames('x'.repeat(NAME_LIMIT + 1)).error, NAME_ERROR.LONG);
  assert.deepEqual(parseNames('x'.repeat(NAME_LIMIT)), { names: ['x'.repeat(NAME_LIMIT)] });
  const names = idsFor(MAX_PLAYERS);
  assert.deepEqual(parseNames(names.join('\n')), { names });
  assert.equal(parseNames([...names, 'extra'].join('\n')).error, NAME_ERROR.LIMIT);
  assert.equal(parseNames('extra', names).error, NAME_ERROR.LIMIT);
  assert.deepEqual(names, idsFor(MAX_PLAYERS));
}

{
  const players = idsFor(6).map((id) => ({ id, name: `Tên ${id}` }));
  const original = structuredClone(players);
  const host = players[0].id;
  const moved = movePlayer(players, host, 1);
  assert.equal(moved[1].id, host);
  assert.deepEqual(movePlayer(players, host, -1), players);
  assert.deepEqual(movePlayer(players, 'missing', 1), players);
  const renamed = moved.map((player) => player.id === host ? { ...player, name: 'Tên chủ mới' } : player);
  const shuffled = shufflePlayers(renamed, () => 0);
  assert.deepEqual(players, original);
  assert.equal(shuffled.find((player) => player.id === host).name, 'Tên chủ mới');
  assert.deepEqual(new Set(shuffled.map((player) => player.id)), new Set(players.map((player) => player.id)));
  assert.notDeepEqual(shuffled, renamed);
  const g = createGame(shuffled.map((player) => player.id), DEFAULT_CONFIG, () => 0.5, NOW);
  assert.deepEqual(g.players.map((player) => player.id), shuffled.map((player) => player.id));
  for (const player of shuffled) assert.ok(view(g, player.id).card);
  const other = shuffled.find((player) => player.id !== host).id;
  rejected(g, other, { a: ACTION.NEXT }, host);
  assert.equal(act(g, host, host, { a: ACTION.NEXT }, NOW), true);
  assert.deepEqual(g.turnOrder, shuffled.map((player) => player.id));
}

{
  const ids = idsFor(6);
  const order = [ids[2], ids[0], 'left-room', ids[1]];
  assert.deepEqual(orderedIds(ids, order), [ids[2], ids[0], ids[1], ...ids.slice(3)]);
  assert.deepEqual(orderedIds(ids, [ids[2], ids[2], 'left-room']), [ids[2], ...ids.filter((id) => id !== ids[2])]);
  for (const invalid of [null, {}, 'first', [ids[0], ids[0]], [''], [1], ['x'.repeat(65)], idsFor(MAX_PLAYERS + 1)]) {
    assert.equal(normalizeConfig({ order: invalid }), null);
    assert.equal(gianDiep.config(DEFAULT_CONFIG, { order: invalid }), null);
  }
  const cfg = gianDiep.config(DEFAULT_CONFIG, { order });
  assert.deepEqual(cfg.order, order);
  assert.notEqual(cfg.order, order);
  const setup = room(6, cfg);
  gianDiep.start(setup.ctx);
  assert.deepEqual(setup.ctx.seats, ids, 'seating preference must not mutate room ownership order');
  assert.equal(setup.ctx.host(), ids[0]);
  assert.deepEqual(setup.ctx.g.players.map((player) => player.id), orderedIds(ids, order));
  assert.equal(gianDiep.msg(setup.ctx, { id: ids[2] }, { a: ACTION.NEXT }), false);
  assert.equal(gianDiep.msg(setup.ctx, { id: ids[0] }, { a: ACTION.NEXT }), true);
  assert.equal(setup.ctx.g.speaker, ids[2]);
  const departed = room(6, cfg);
  departed.ctx.seats = [...ids.filter((id) => id !== ids[2]), 'new-arrival'];
  gianDiep.start(departed.ctx);
  assert.deepEqual(departed.ctx.g.players.map((player) => player.id), [ids[0], ids[1], ...ids.slice(3), 'new-arrival']);
  assert.equal(new Set(departed.ctx.g.players.map((player) => player.id)).size, departed.ctx.seats.length);
}

for (const pack of PACKS) {
  assert.equal(pack.label.length, 2);
  assert.ok(pack.label.every((label) => typeof label === 'string' && label.length > 0));
  assert.ok(pack.pairs.length >= 12);
  assert.equal(new Set(pack.pairs.map((pair) => JSON.stringify(pair))).size, pack.pairs.length);
  for (const pair of pack.pairs) {
    assert.equal(pair.length, 2);
    assert.ok(pair.every((word) => typeof word === 'string' && word.trim() !== ''));
    assert.notEqual(pair[0], pair[1]);
  }
}

const caps = [1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7];
for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
  assert.equal(limits(n).spies, caps[n - MIN_PLAYERS], `${n} player spy cap`);
  const whiteCap = n <= 5 ? 0 : n === 6 ? 1 : 2;
  for (let spies = 1; spies <= 7; spies++) {
    assert.equal(limits(n, spies).whites, spies <= caps[n - MIN_PLAYERS] ? Math.max(0, Math.min(whiteCap, Math.ceil(n / 3) - spies, n - spies - 2)) : 0);
    for (let whites = 0; whites <= 2; whites++) {
      const cfg = { ...DEFAULT_CONFIG, spies, whites };
      const valid = spies <= caps[n - MIN_PLAYERS] && whites <= whiteCap && spies + whites <= Math.ceil(n / 3) && n - spies - whites >= 2;
      assert.equal(validateSetup(n, cfg), valid, JSON.stringify({ n, spies, whites }));
      if (!valid) {
        assert.throws(() => createGame(idsFor(n), cfg, () => 0.5, NOW), RangeError);
        continue;
      }
      const g = createGame(idsFor(n), cfg, () => 0.5, NOW);
      assert.equal(g.players.length, n);
      assert.equal(g.players.filter((player) => player.role === ROLE.SPY).length, spies);
      assert.equal(g.players.filter((player) => player.role === ROLE.WHITE).length, whites);
      assert.equal(g.players.filter((player) => player.role === ROLE.CIVILIAN).length, n - spies - whites);
      assert.ok(g.players.every((player) => player.alive));
      assert.ok(g.players.filter((player) => player.role === ROLE.CIVILIAN).every((player) => player.word === g.civilianWord));
      assert.ok(g.players.filter((player) => player.role === ROLE.SPY).every((player) => player.word === g.spyWord));
      assert.ok(g.players.filter((player) => player.role === ROLE.WHITE).every((player) => player.word === null));
      assert.notEqual(g.civilianWord, g.spyWord);
      assert.deepEqual(g.cfg, cfg);
    }
  }
}
for (const n of [0, 1, 2, 21, -1, 3.5, '6', null, NaN, Infinity]) {
  assert.deepEqual(limits(n), { spies: 0, whites: 0 });
  assert.equal(validateSetup(n, DEFAULT_CONFIG), false);
}
assert.deepEqual(limits(6, 2), { spies: 2, whites: 0 });
assert.deepEqual(limits(7, 1), { spies: 3, whites: 2 });
assert.deepEqual(limits(20, 6), { spies: 7, whites: 1 });
assert.equal(limits(7, NaN).whites, 0);
assert.equal(limits(7, 0).whites, 0);
assert.deepEqual(normalizeConfig({}), DEFAULT_CONFIG);
assert.deepEqual(normalizeConfig({ seconds: 5 }), { ...DEFAULT_CONFIG, seconds: 5 });
for (const cfg of [null, undefined, [], true, 'food', { spies: 0 }, { spies: -1 }, { spies: 1.5 }, { spies: '1' }, { spies: NaN }, { spies: 8 }, { whites: -1 }, { whites: 3 }, { whites: 0.5 }, { whites: '1' }, { spies: 7, whites: 1 }, { seconds: 0 }, { seconds: 20 }, { seconds: '15' }, { seconds: Infinity }, { seconds: undefined }, { pack: '' }, { pack: 'internal-company' }, { pack: {} }, { role: ROLE.SPY }, JSON.parse('{"__proto__":{"spies":1}}')]) {
  assert.equal(normalizeConfig(cfg), null, JSON.stringify(cfg));
  assert.equal(validateSetup(6, cfg), false);
}
for (const pack of PACKS) for (const seconds of DURATIONS) {
  const cfg = { ...DEFAULT_CONFIG, pack: pack.id, seconds };
  assert.deepEqual(normalizeConfig(cfg), cfg);
  assert.ok(pack.pairs.some((pair) => pair.includes(makeGame(6, cfg).civilianWord)));
}
for (const ids of [null, {}, [], idsFor(2), idsFor(21), ['a', 'a', 'b'], ['a', 'b', ''], ['a', 'b', ' '], ['a', 'b', null], ['a', 'b', 3], ['civilian', 'a', 'b'], ['hidden', 'a', 'b']]) {
  assert.throws(() => createGame(ids, DEFAULT_CONFIG, () => 0.5, NOW), RangeError);
}
for (const now of [-1, NaN, Infinity, '1000', null]) assert.throws(() => createGame(idsFor(3), DEFAULT_CONFIG, () => 0.5, now), RangeError);
assert.throws(() => createGame(idsFor(3), DEFAULT_CONFIG, null, NOW), RangeError);

{
  const ids = idsFor(7), cfg = { ...DEFAULT_CONFIG, whites: 2 };
  const beforeIds = [...ids], beforeCfg = { ...cfg };
  const g = createGame(ids, cfg, () => 0, NOW);
  assert.deepEqual(ids, beforeIds);
  assert.deepEqual(cfg, beforeCfg);
  assert.notEqual(g.cfg, cfg);
  assert.equal(g.phase, PHASE.DEAL);
  assert.equal(g.deadline, 0);
  assert.equal(g.speaker, null);
  assert.equal(g.round, 1);
  assert.equal(g.winner, null);
  assert.equal(g.pendingGuess, null);
  assert.deepEqual(g.votes, {});
  assert.deepEqual(g.candidates, []);
  const before = structuredClone(g);
  assert.equal(advance(g, NOW + 1_000_000), false);
  assert.deepEqual(g, before, 'reading cards never starts the description timer');
  rejected(g, ids[0], { a: ACTION.ELIMINATE, target: ids[1] });
  rejected(g, ids[0], { a: ACTION.VOTING });
  begin(g, NOW + 1_000_000);
  assert.equal(g.deadline, NOW + 1_000_000 + DEFAULT_CONFIG.seconds * SECOND);
}

{
  for (const random of [-1, 0, 0.5, 0.999999, 1, NaN, Infinity]) {
    const g = makeGame(20, { spies: 5, whites: 2 }, () => random);
    assert.equal(g.players.filter((player) => player.role === ROLE.SPY).length, 5);
    assert.equal(g.players.filter((player) => player.role === ROLE.WHITE).length, 2);
    assert.ok(g.civilianWord && g.spyWord);
  }
  const pair = PACKS[0].pairs[0];
  const first = makeGame(3, {}, () => 0);
  let call = 0;
  const swapped = makeGame(3, {}, () => call++ === 1 ? 0.999999 : 0);
  assert.equal(first.civilianWord, pair[0]);
  assert.equal(first.spyWord, pair[1]);
  assert.equal(swapped.civilianWord, pair[1]);
  assert.equal(swapped.spyWord, pair[0]);
  let seed = 17;
  const seeded = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const spySeats = new Set();
  for (let deal = 0; deal < 500; deal++) spySeats.add(playerOf(makeGame(20, {}, seeded), ROLE.SPY).id);
  assert.equal(spySeats.size, MAX_PLAYERS, 'every seat can receive the spy word');
}

{
  const g = makeGame(7, { whites: 2 });
  for (const player of g.players) {
    const projected = view(g, player.id);
    assert.deepEqual(projected.card, player.role === ROLE.WHITE ? { white: true } : { word: player.word });
    assert.equal(projected.reveal, null);
    assert.equal(projected.tally, null);
    assert.ok(projected.players.every((entry) => Object.keys(entry).length === 2 && !Object.hasOwn(entry, 'role')));
    for (const key of ['votes', 'civilianWord', 'spyWord', 'turnOrder', 'startIndex', 'role']) assert.equal(Object.hasOwn(projected, key), false);
    assert.equal(JSON.stringify(projected).includes(player.role === ROLE.SPY ? g.civilianWord : g.spyWord), false);
  }
  const watcher = view(g, 'watcher');
  assert.equal(watcher.card, null);
  assert.equal(watcher.voted, false);
  assert.equal(JSON.stringify(watcher).includes(g.civilianWord), false);
  assert.equal(JSON.stringify(watcher).includes(g.spyWord), false);
  const before = structuredClone(g);
  const projected = view(g, hostOf(g));
  projected.cfg.seconds = 5;
  projected.players[0].alive = false;
  projected.candidates.push('spoof');
  projected.card.word = 'spoof';
  assert.deepEqual(g, before, 'public view never exposes mutable domain references');
  assert.equal(view({}, 'watcher').card, null);
  assert.equal(view(null, 'watcher').reveal, null);
}

{
  const g = makeGame();
  for (const message of [null, undefined, true, [], 'next', {}, { a: 'unknown' }, { a: {} }, Object.create({ a: ACTION.NEXT })]) rejected(g, hostOf(g), message);
  rejected(g, 'watcher', { a: ACTION.NEXT }, 'watcher');
  rejected(g, g.players[1].id, { a: ACTION.NEXT });
  rejected(g, hostOf(g), { a: ACTION.NEXT }, hostOf(g), NaN);
  rejected(g, hostOf(g), { a: ACTION.NEXT }, hostOf(g), -1);
  rejected(g, hostOf(g), { a: ACTION.GUESS, text: g.civilianWord });
  begin(g);
  rejected(g, g.players[1].id, { a: ACTION.ELIMINATE, target: g.players[2].id });
  rejected(g, hostOf(g), { a: ACTION.ELIMINATE, target: 'missing' });
  rejected(g, hostOf(g), { a: ACTION.ELIMINATE, target: {} });
  rejected(g, hostOf(g), { a: ACTION.VOTING });
  rejected(g, hostOf(g), { a: ACTION.VOTE, target: g.players[1].id });
}

for (const seconds of DURATIONS) {
  const g = makeGame(6, { seconds });
  begin(g);
  assert.equal(g.speaker, g.players[0].id);
  assert.equal(g.deadline, NOW + seconds * SECOND);
  const before = structuredClone(g);
  assert.equal(advance(g, g.deadline - 1), false);
  assert.equal(advance(g, NaN), false);
  assert.deepEqual(g, before);
  let now = g.deadline;
  assert.equal(advance(g, now), true);
  assert.equal(g.speaker, g.players[1].id);
  assert.equal(g.deadline, now + seconds * SECOND);
  now += 1_000_000;
  assert.equal(advance(g, now), true);
  assert.equal(g.speaker, g.players[2].id, 'late timer does not skip every remaining speaker');
  assert.equal(g.deadline, now + seconds * SECOND);
  for (let index = 3; index <= g.players.length; index++) {
    assert.equal(advance(g, g.deadline), true);
    assert.equal(g.speaker, g.players[index]?.id ?? null);
  }
  assert.equal(g.phase, PHASE.DISCUSS);
  assert.equal(g.deadline, 0);
  assert.equal(advance(g, now + 1_000_000), false);
  rejected(g, hostOf(g), { a: ACTION.NEXT });
  rejected(g, g.players[1].id, { a: ACTION.VOTING });
  assert.equal(act(g, hostOf(g), hostOf(g), { a: ACTION.VOTING }, now), true);
  assert.equal(g.deadline, now + COUNTDOWN);
  rejected(g, hostOf(g), { a: ACTION.VOTING });
  rejected(g, hostOf(g), { a: ACTION.VOTE, target: g.players[1].id });
  assert.equal(advance(g, g.deadline - 1), false);
  assert.equal(advance(g, g.deadline), true);
  assert.equal(g.phase, PHASE.VOTE);
  assert.equal(g.deadline, 0);
  assert.equal(advance(g, now + 1_000_000), false, 'nonresponders are never assigned votes');
  assert.deepEqual(g.votes, {});
}

{
  const g = makeGame(7, { spies: 2 });
  begin(g);
  eliminate(g, g.players[2].id);
  assert.equal(g.round, 2);
  assert.equal(g.speaker, g.players[1].id);
  assert.deepEqual(g.turnOrder, [1, 3, 4, 5, 6, 0].map((index) => g.players[index].id));
  eliminate(g, g.players[1].id);
  assert.equal(g.round, 3);
  assert.equal(g.speaker, g.players[3].id, 'rotation skips the eliminated previous starter and dead next seat');
  assert.deepEqual(g.turnOrder, [3, 4, 5, 6, 0].map((index) => g.players[index].id));
  rejected(g, g.players[1].id, { a: ACTION.NEXT });
  rejected(g, hostOf(g), { a: ACTION.ELIMINATE, target: g.players[1].id });
}

{
  const g = makeGame(7, { spies: 2 });
  const host = hostOf(g);
  eliminate(g, host);
  assert.equal(g.phase, PHASE.DESCRIBE);
  assert.equal(act(g, host, host, { a: ACTION.NEXT }, NOW), true, 'eliminated host remains moderator');
  discussion(g);
  assert.equal(act(g, host, host, { a: ACTION.VOTING }, NOW), true);
  advance(g, g.deadline);
  rejected(g, host, { a: ACTION.VOTE, target: g.players[1].id });
  assert.deepEqual(view(g, host).card, { word: g.spyWord });
  assert.equal(act(g, host, host, { a: ACTION.ELIMINATE, target: g.players[2].id }, NOW), true);
}

{
  const g = makeGame();
  voting(g);
  const [first, second, third] = g.players;
  rejected(g, 'watcher', { a: ACTION.VOTE, target: first.id });
  rejected(g, first.id, { a: ACTION.VOTE, target: first.id });
  rejected(g, first.id, { a: ACTION.VOTE, target: 'missing' });
  rejected(g, first.id, { a: ACTION.VOTE, target: { id: second.id } });
  assert.equal(act(g, first.id, hostOf(g), { a: ACTION.VOTE, target: second.id, actor: third.id, role: ROLE.WHITE }, NOW), true);
  assert.equal(view(g, first.id).voted, true);
  assert.equal(view(g, second.id).voted, false);
  assert.equal(view(g, 'watcher').voteCount, 1);
  assert.equal(view(g, first.id).voteTotal, 6);
  assert.equal(view(g, first.id).tally, null);
  assert.equal(Object.hasOwn(view(g, first.id), 'votes'), false);
  rejected(g, first.id, { a: ACTION.VOTE, target: third.id });
  assert.equal(g.phase, PHASE.VOTE);
  assert.equal(g.players.every((player) => player.alive), true);
  const saved = JSON.parse(JSON.stringify(g));
  assert.equal(view(saved, first.id).voted, true);
  assert.equal(act(saved, second.id, hostOf(saved), { a: ACTION.VOTE, target: first.id }, NOW), true);
  assert.equal(view(saved, second.id).voteCount, 2);
  eliminate(g, third.id);
  assert.equal(g.phase, PHASE.DESCRIBE);
  assert.equal(g.tally, null, 'manual override never publishes an unfinished tally');
  assert.equal(view(g, hostOf(g)).voteCount, 0);
  voting(g);
  rejected(g, third.id, { a: ACTION.VOTE, target: first.id });
  rejected(g, first.id, { a: ACTION.VOTE, target: third.id });
  assert.equal(view(g, first.id).voteTotal, 5);
}

{
  const g = makeGame();
  voting(g);
  const ids = g.players.map((player) => player.id);
  const targets = [ids[1], ids[0], ids[0], ids[1], ids[0], ids[1]];
  for (let index = 0; index < ids.length; index++) {
    assert.equal(act(g, ids[index], hostOf(g), { a: ACTION.VOTE, target: targets[index] }, NOW), true);
    if (index < ids.length - 1) {
      assert.equal(g.phase, PHASE.VOTE);
      assert.equal(view(g, ids[index]).tally, null);
    }
  }
  assert.equal(g.phase, PHASE.TIE);
  assert.equal(g.round, 1);
  assert.equal(g.speaker, null);
  assert.equal(g.deadline, 0);
  assert.deepEqual(g.candidates, ids.slice(0, 2));
  assert.deepEqual(view(g, ids[0]).tally, { [ids[0]]: 3, [ids[1]]: 3, [ids[2]]: 0, [ids[3]]: 0, [ids[4]]: 0, [ids[5]]: 0 });
  const projected = view(g, ids[0]);
  projected.tally[ids[0]] = 999;
  projected.candidates.push('spoof');
  assert.equal(g.tally[ids[0]], 3);
  assert.equal(g.candidates.length, 2);
  assert.equal(advance(g, NOW + 1_000_000), false);
  rejected(g, ids[1], { a: ACTION.NEXT });
  rejected(g, ids[0], { a: ACTION.VOTING });
  rejected(g, ids[0], { a: ACTION.ELIMINATE, target: ids[2] });
  rejected(g, ids[0], { a: ACTION.VOTE, target: ids[1] });
  voting(g);
  assert.equal(view(g, ids[0]).tally, null);
  assert.equal(view(g, ids[0]).voteCount, 0);
  assert.equal(view(g, ids[0]).voted, false);
  rejected(g, ids[0], { a: ACTION.VOTE, target: ids[2] });
  for (let index = 0; index < ids.length; index++) assert.equal(act(g, ids[index], hostOf(g), { a: ACTION.VOTE, target: targets[index] }, NOW), true);
  assert.equal(g.phase, PHASE.TIE, 'a repeated tie creates another restricted runoff');
  assert.equal(g.round, 1);
  voting(g);
  for (const id of ids) assert.equal(act(g, id, hostOf(g), { a: ACTION.VOTE, target: id === ids[1] ? ids[0] : ids[1] }, NOW), true);
  assert.equal(g.lastEliminated, ids[1]);
  assert.equal(g.phase, PHASE.DESCRIBE);
  assert.equal(g.round, 2);
  assert.equal(g.speaker, ids[2]);
  assert.deepEqual(view(g, ids[0]).tally, { [ids[0]]: 1, [ids[1]]: 5 });
  assert.deepEqual(g.candidates, []);
  voting(g);
  assert.equal(g.candidates.includes(ids[1]), false);
  assert.equal(g.candidates.length, 5);
  assert.equal(view(g, ids[0]).tally, null);
}

{
  const g = makeGame(3);
  voting(g);
  for (let index = 0; index < g.players.length; index++) assert.equal(act(g, g.players[index].id, hostOf(g), { a: ACTION.VOTE, target: g.players[(index + 1) % g.players.length].id }, NOW), true);
  assert.equal(g.phase, PHASE.TIE);
  assert.equal(g.candidates.length, 3, 'all-way ties remain unresolved rather than eliminating randomly');
}

for (const byVote of [false, true]) {
  const g = makeGame(6, { whites: 1 });
  const white = playerOf(g, ROLE.WHITE);
  if (byVote) voteOut(g, white.id);
  else eliminate(g, white.id);
  assert.equal(g.phase, PHASE.GUESS);
  assert.equal(g.pendingGuess, white.id);
  assert.equal(g.winner, null);
  assert.equal(g.deadline, 0);
  assert.equal(g.speaker, null);
  assert.equal(view(g, white.id).reveal, null);
  assert.ok(view(g, white.id).players.every((player) => !Object.hasOwn(player, 'role')));
  assert.deepEqual(view(g, white.id).card, { white: true });
  assert.equal(advance(g, NOW + 1_000_000), false);
  for (const action of [ACTION.NEXT, ACTION.VOTING, ACTION.ELIMINATE, ACTION.VOTE]) rejected(g, hostOf(g), { a: action, target: g.players[2].id });
  for (const id of [hostOf(g), 'watcher', g.players[2].id]) rejected(g, id, { a: ACTION.GUESS, text: g.civilianWord });
  for (const text of ['', ' \n\t ', null, 4, {}, 'a'.repeat(121)]) rejected(g, white.id, { a: ACTION.GUESS, text });
  const guess = `  ${g.civilianWord.toUpperCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/Đ/g, 'D').split(' ').join('  \n ')}  `;
  assert.equal(act(g, white.id, hostOf(g), { a: ACTION.GUESS, text: guess }, NOW), true);
  assert.equal(g.phase, PHASE.ENDED);
  assert.equal(g.winner, white.id);
  assert.equal(g.pendingGuess, null);
  rejected(g, white.id, { a: ACTION.GUESS, text: g.civilianWord });
  rejected(g, hostOf(g), { a: ACTION.ELIMINATE, target: hostOf(g) });
  assert.equal(advance(g, NOW + 1_000_000), false);
}

{
  const g = makeGame(6, { whites: 1 });
  const white = playerOf(g, ROLE.WHITE);
  eliminate(g, white.id);
  assert.equal(act(g, white.id, hostOf(g), { a: ACTION.GUESS, text: `${g.civilianWord}!` }, NOW), true);
  assert.equal(g.phase, PHASE.DESCRIBE, 'punctuation is not silently discarded from a wrong answer');
  assert.equal(g.round, 2);
  assert.equal(g.winner, null);
  assert.equal(g.pendingGuess, null);
  rejected(g, white.id, { a: ACTION.GUESS, text: g.civilianWord });
}

for (const correct of [false, true]) {
  const g = makeGame(7, { whites: 2 });
  eliminate(g, playerOf(g, ROLE.SPY).id);
  assert.equal(g.winner, null, 'white players still count as hidden after all spies are gone');
  const firstWhite = playerOf(g, ROLE.WHITE);
  eliminate(g, firstWhite.id);
  assert.equal(act(g, firstWhite.id, hostOf(g), { a: ACTION.GUESS, text: 'không trùng từ' }, NOW), true);
  assert.equal(g.winner, null);
  const lastWhite = playerOf(g, ROLE.WHITE);
  voteOut(g, lastWhite.id);
  assert.equal(g.phase, PHASE.GUESS);
  assert.equal(g.winner, null, 'last hidden elimination must wait for the white guess before civilian victory');
  assert.equal(view(g, lastWhite.id).reveal, null);
  assert.equal(act(g, lastWhite.id, hostOf(g), { a: ACTION.GUESS, text: correct ? g.civilianWord : g.spyWord }, NOW), true);
  assert.equal(g.winner, correct ? lastWhite.id : ROLE.CIVILIAN);
  assert.equal(g.phase, PHASE.ENDED);
}

{
  const g = makeGame(6, { spies: 2 });
  while (alive(g).filter((player) => player.role === ROLE.CIVILIAN).length > 2) eliminate(g, playerOf(g, ROLE.CIVILIAN).id);
  assert.equal(g.winner, null, 'equal hidden and civilian counts are not a win');
  voteOut(g, playerOf(g, ROLE.CIVILIAN).id);
  assert.equal(g.winner, HIDDEN_TEAM);
  assert.equal(g.phase, PHASE.ENDED);
}

{
  const g = makeGame(5);
  const civilian = playerOf(g, ROLE.CIVILIAN);
  eliminate(g, civilian.id);
  voteOut(g, playerOf(g, ROLE.SPY).id);
  assert.equal(g.winner, ROLE.CIVILIAN);
  const spectator = view(g, 'watcher');
  assert.equal(spectator.card, null);
  assert.equal(spectator.reveal.civilianWord, g.civilianWord);
  assert.equal(spectator.reveal.spyWord, g.spyWord);
  assert.deepEqual(spectator.reveal.roles, Object.fromEntries(g.players.map((player) => [player.id, player.role])));
  assert.ok(spectator.players.every((player) => player.role === g.players.find((entry) => entry.id === player.id).role));
  spectator.reveal.roles[civilian.id] = ROLE.WHITE;
  spectator.players[0].role = ROLE.WHITE;
  assert.equal(g.players.find((player) => player.id === civilian.id).role, ROLE.CIVILIAN);
  assert.equal(view(g, hostOf(g)).reveal.roles[hostOf(g)], ROLE.SPY);
}

{
  const ids = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'normal-a', 'normal-b'];
  let g = createGame(ids, DEFAULT_CONFIG, () => 0.999999, NOW);
  voting(g);
  assert.equal(view(g, ids[0]).voted, false);
  assert.equal(act(g, ids[0], hostOf(g), { a: ACTION.VOTE, target: ids[1] }, NOW), true);
  assert.equal(view(g, ids[0]).voted, true);
  g = JSON.parse(JSON.stringify(g));
  for (const id of ids.slice(1)) assert.equal(act(g, id, hostOf(g), { a: ACTION.VOTE, target: ids[0] }, NOW), true);
  assert.equal(g.winner, ROLE.CIVILIAN);
  assert.equal(view(g, ids[0]).tally[ids[0]], 5);
  assert.equal(view(g, ids[0]).reveal.roles[ids[0]], ROLE.SPY);
  assert.equal(Object.getPrototypeOf(g.votes), Object.prototype);
  assert.equal(Object.hasOwn(g.votes, ids[0]), true);
  assert.equal(Object.prototype.polluted, undefined);
}

{
  const cfg = { ...gianDiep.cfg };
  assert.deepEqual(gianDiep.config(cfg, { seconds: 5 }), { ...cfg, seconds: 5 });
  assert.deepEqual(gianDiep.config(cfg, { pack: 'culture', spies: 2, whites: 1 }), { ...cfg, pack: 'culture', spies: 2, whites: 1 });
  for (const patch of [null, undefined, [], 'food', { pack: 'missing' }, { seconds: '5' }, { spies: 0 }, { whites: 3 }, { role: ROLE.SPY }, { winner: ROLE.CIVILIAN }, JSON.parse('{"__proto__":{"spies":1}}')]) assert.equal(gianDiep.config(cfg, patch), null);
  assert.deepEqual(cfg, DEFAULT_CONFIG);
}

for (const [n, cfg] of [[2, {}], [21, {}], [3, { spies: 2 }], [4, { spies: 2 }], [5, { whites: 1 }], [6, { spies: 2, whites: 1 }], [7, { spies: 2, whites: 2 }], [6, { seconds: '15' }]]) {
  const { ctx, ended, wakes } = room(n, cfg);
  gianDiep.start(ctx);
  assert.equal(ended.length, 1);
  assert.deepEqual(ended[0].ranks, []);
  assert.equal(ended[0].title.length, 2);
  assert.equal(ctx.g.players.length, 0, 'invalid counts never silently alter the requested roles');
  assert.equal(gianDiep.view(ctx, ctx.seats[0]).card, null);
  assert.equal(gianDiep.view(ctx, ctx.seats[0]).reveal, null);
  assert.deepEqual(wakes, [0]);
  assert.equal(gianDiep.msg(ctx, { id: ctx.seats[0] }, { a: ACTION.NEXT }), false);
  assert.equal(gianDiep.tick(ctx), false);
  assert.equal(ended.length, 1);
}

{
  const { ctx, ended } = room();
  ctx.seats[1] = ctx.seats[0];
  gianDiep.start(ctx);
  assert.equal(ended.length, 1);
  assert.deepEqual(ended[0].ranks, []);
  assert.equal(gianDiep.view(ctx, ctx.seats[0]).card, null);
}

{
  const r = room(20, { spies: 5, whites: 2, seconds: 10 });
  const { ctx, ended, wakes } = r;
  gianDiep.start(ctx);
  assert.equal(ended.length, 0);
  assert.equal(ctx.g.players.length, 20);
  assert.equal(ctx.g.dealId, 1);
  assert.equal(gianDiep.view(ctx, ctx.seats[0]).dealId, 1);
  assert.equal(ctx.g.phase, PHASE.DEAL);
  assert.deepEqual(wakes, [0]);
  r.time(NOW + 1_000_000);
  assert.equal(gianDiep.tick(ctx), false);
  const before = structuredClone(ctx.g), beforeWakes = [...wakes];
  assert.equal(gianDiep.msg(ctx, { id: ctx.seats[1] }, { a: ACTION.NEXT }), false);
  assert.deepEqual(ctx.g, before);
  assert.deepEqual(wakes, beforeWakes);
  assert.equal(gianDiep.msg(ctx, { id: ctx.seats[0] }, { a: ACTION.NEXT }), true);
  assert.equal(wakes.at(-1), NOW + 1_000_000 + 10 * SECOND);
  r.time(ctx.g.deadline - 1);
  assert.equal(gianDiep.tick(ctx), false);
  r.time(ctx.g.deadline);
  assert.equal(gianDiep.tick(ctx), true);
  assert.equal(ctx.g.speaker, ctx.seats[1]);
  assert.equal(wakes.at(-1), ctx.g.deadline);
  ctx.g = JSON.parse(JSON.stringify(ctx.g));
  r.host(ctx.seats[2]);
  assert.equal(gianDiep.msg(ctx, { id: ctx.seats[0] }, { a: ACTION.NEXT }), false);
  assert.equal(gianDiep.msg(ctx, { id: ctx.seats[2] }, { a: ACTION.NEXT }), true, 'adapter host transfer takes effect immediately');
  for (let turn = 0; turn < MAX_PLAYERS && ctx.g.phase === PHASE.DESCRIBE; turn++) gianDiep.msg(ctx, { id: ctx.seats[2] }, { a: ACTION.NEXT });
  assert.equal(ctx.g.phase, PHASE.DISCUSS);
  assert.equal(wakes.at(-1), 0, 'manual transition clears the stale description alarm');
  assert.equal(gianDiep.msg(ctx, { id: ctx.seats[2] }, { a: ACTION.VOTING }), true);
  assert.equal(wakes.at(-1), ctx.g.deadline);
  r.time(ctx.g.deadline);
  assert.equal(gianDiep.tick(ctx), true);
  assert.equal(ctx.g.phase, PHASE.VOTE);
  assert.equal(wakes.at(-1), 0);
  r.time(NOW + 2_000_000);
  assert.equal(gianDiep.tick(ctx), false);
  assert.equal(ended.length, 0);
}

for (const winner of [ROLE.CIVILIAN, HIDDEN_TEAM, ROLE.WHITE]) {
  const { ctx, ended, wakes } = room(6, { whites: 1 });
  gianDiep.start(ctx);
  const host = ctx.seats[0];
  assert.equal(gianDiep.msg(ctx, { id: host }, { a: ACTION.NEXT }), true);
  const remove = (player) => assert.equal(gianDiep.msg(ctx, { id: host }, { a: ACTION.ELIMINATE, target: player.id }), true);
  if (winner === HIDDEN_TEAM) {
    for (const civilian of ctx.g.players.filter((player) => player.role === ROLE.CIVILIAN).slice(1)) remove(civilian);
  } else {
    remove(playerOf(ctx.g, ROLE.SPY));
    const white = playerOf(ctx.g, ROLE.WHITE);
    remove(white);
    assert.equal(ended.length, 0, 'server cannot record a result before the pending white guess');
    assert.equal(gianDiep.view(ctx, white.id).reveal, null);
    assert.equal(wakes.at(-1), 0);
    assert.equal(gianDiep.msg(ctx, { id: white.id }, { a: ACTION.GUESS, text: winner === ROLE.WHITE ? ctx.g.civilianWord : ctx.g.spyWord }), true);
  }
  assert.equal(ended.length, 1);
  assert.equal(ended[0].mode, 'multi');
  assert.equal(ended[0].ranks.length, ctx.seats.length);
  assert.equal(new Set(ended[0].ranks.map((rank) => rank.id)).size, ctx.seats.length);
  for (const rank of ended[0].ranks) {
    const player = ctx.g.players.find((entry) => entry.id === rank.id);
    const won = winner === ROLE.CIVILIAN ? player.role === ROLE.CIVILIAN : winner === HIDDEN_TEAM ? player.role !== ROLE.CIVILIAN : player.role === ROLE.WHITE;
    assert.equal(rank.won, won);
    assert.equal(rank.score, won ? 1 : 0);
  }
  assert.equal(ended[0].ranks[0].won, true);
  assert.equal(gianDiep.tick(ctx), false);
  assert.equal(gianDiep.msg(ctx, { id: host }, { a: ACTION.NEXT }), false);
  assert.equal(ended.length, 1);
  const finished = gianDiep.view(ctx, 'watcher');
  assert.ok(finished.reveal);
  assert.equal(finished.card, null);
  const firstDeal = finished.dealId;
  ctx.g = {};
  ctx.rand = () => 0;
  gianDiep.start(ctx);
  const next = gianDiep.view(ctx, host);
  assert.equal(next.dealId, firstDeal + 1);
  assert.equal(next.phase, PHASE.DEAL);
  assert.equal(next.deadline, 0);
  assert.equal(next.round, 1);
  assert.equal(next.reveal, null);
  assert.equal(next.winner, null);
  assert.equal(next.lastEliminated, null);
  assert.equal(next.voted, false);
  assert.ok(next.players.every((player) => player.alive && !Object.hasOwn(player, 'role')));
}

console.log('gian-diep ok');

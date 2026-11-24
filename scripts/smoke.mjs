// Smoke test nhiều người qua WebSocket thật: mỗi game vào phòng, bắt đầu ván, bot chơi tới hết (hoặc đủ xa để thấy chạy).
// Chạy trước / sau mỗi bước refactor để chắc hành vi không đổi:
//   node scripts/smoke.mjs                         (mặc định http://localhost:8789, wrangler dev)
//   node scripts/smoke.mjs https://games.huyab.cfd [tên game ...]
import { AsyncLocalStorage } from 'node:async_hooks';
import { botMove as oaqBot } from '../public/o-an-quan/logic.js';
import { botMove as bantumiBot } from '../public/nokia/bantumi/logic.js';
import { COLS } from '../public/noi-4/logic.js';
import { N } from '../public/ban-tau/logic.js';
import { findPair } from '../public/pikachu/logic.js';
import { botMove as ganhBot } from '../public/co-ganh/logic.js';
import { botMove as tuongBot } from '../public/co-tuong/logic.js';
import { kinhRows as lotoKinh } from '../public/loto/logic.js';
import { ACTION as SPY_ACTION, PHASE as SPY_PHASE, ROLE as SPY_ROLE } from '../public/gian-diep/logic.js';
import { SLOTS as LOGIC_SLOTS } from '../public/nokia/logic/logic.js';
import { createSim as rapidSim, step as rapidStep, score as rapidScore } from '../public/nokia/rapid-roll/logic.js';
import { createSim as bounceSim, step as bounceStep, timeScore as bounceScore } from '../public/nokia/bounce/logic.js';

const MAX_CONCURRENT_GAMES = 3;
const MAX_ATTEMPTS = 2;
const LOG_NAME_WIDTH = 13;
const MILLISECONDS_PER_SECOND = 1000;
const DURATION_DECIMAL_PLACES = 1;
const GAME_LIST_SEPARATOR = ', ';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const SMOKE_MODE = { FULL: 'full', FAST: 'fast' };
const smokeMode = process.env.E2E_SMOKE_MODE ?? SMOKE_MODE.FULL;
const concurrencyInput = process.env.E2E_GAME_CONCURRENCY ?? String(MAX_CONCURRENT_GAMES);
const gameConcurrency = Number(concurrencyInput);
const MIN_CONCURRENT_GAMES = 1;
const INTEGER_INPUT = /^[1-9]\d*$/;
const ACK_TIMEOUT_MS = 5000;
const CONFIG_TIMEOUT_MS = 3000;
const FAST_MOVES = 2;
const FULL_BATTLESHIP_SHOTS = 5;
const FAST_BATTLESHIP_SHOTS = 1;
const THREE_PLAYER_BOARD = 3;
const SIMULATION_STEPS = 20;
const SIMULATION_STEP_SECONDS = 0.05;
const POSITION_PRECISION = 10;
const SLOW_FIRST = ['co-tuong', 'dao-vang', 'o-an-quan-3', 'co-ganh', 'o-an-quan', 'bantumi'];

if (!Object.values(SMOKE_MODE).includes(smokeMode)) {
  console.error('E2E_SMOKE_MODE must be full or fast');
  process.exit(EXIT_FAILURE);
}
if (!INTEGER_INPUT.test(concurrencyInput) || !Number.isInteger(gameConcurrency) ||
    gameConcurrency < MIN_CONCURRENT_GAMES || gameConcurrency > MAX_CONCURRENT_GAMES) {
  console.error(`E2E_GAME_CONCURRENCY must be an integer from ${MIN_CONCURRENT_GAMES} to ${MAX_CONCURRENT_GAMES}`);
  process.exit(EXIT_FAILURE);
}
const fast = smokeMode === SMOKE_MODE.FAST;
const attemptSockets = new AsyncLocalStorage();

const base = (process.argv[2] ?? 'http://localhost:8789').replace(/^http/, 'ws');
const only = process.argv.slice(3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const code = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');

function connectSocket(url) {
  const { sockets } = attemptSockets.getStore();
  const ws = new WebSocket(url);
  sockets.add(ws);
  return ws;
}

async function runAttempt(run) {
  const sockets = new Set();
  const messages = new AbortController();
  return attemptSockets.run({ sockets, messages }, async () => {
    try {
      return await run();
    } finally {
      messages.abort();
      for (const ws of sockets) {
        ws.onmessage = null;
        ws.close();
      }
    }
  });
}

// Mở n người vào cùng phòng; trả về socket có .me, .last (state mới nhất), .msgs; host() = socket đang làm chủ phòng.
async function join(path, n, onState = () => {}) {
  const room = code();
  const socks = await Promise.all(Array.from({ length: n }, (_, k) => new Promise((ok, fail) => {
    const me = `smoke-${k}-${room}-${Math.random().toString(36).slice(2, 8)}`;
    const ws = connectSocket(`${base}${path(room)}${path(room).includes('?') ? '&' : '?'}id=${me}&name=Bot${k}`);
    Object.assign(ws, { me, last: null, msgs: [] });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      ws.msgs.push(m);
      if (m.t === 'error') fail(new Error(JSON.stringify(m.msg)));
      if (m.t === 'state') { ws.last = m; onState(ws, m); }
    };
    ws.onopen = () => ok(ws);
    ws.onerror = () => fail(new Error('ws error'));
  })));
  await until(() => socks.every((s) => s.last?.players?.length === n), 5000, 'all players see each other');
  const send = (ws, m) => ws.send(JSON.stringify(m));
  return { socks, send, code: room, host: () => socks.find((s) => s.last.host === s.me), close: () => socks.forEach((s) => s.close()) };
}
async function untilAsync(fn, ms, what) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (await fn()) return;
  throw new Error(`timeout: ${what}`);
}
async function until(fn, ms, what) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (fn()) return;
  throw new Error(`timeout: ${what}`);
}

const GAMES = {
  // Cờ caro 3×3 với máy: đánh ô trống đầu tiên tới khi hết ván.
  async caro() {
    const r = await join((c) => `/api/cc/room/${c}`, 1, (ws, m) => {
      const seat = m.seats.indexOf(ws.me) + 1;
      if (m.status === 'playing' && m.turn === seat && ws.moved !== m.moves) { ws.moved = m.moves; r.send(ws, { t: 'move', i: m.board.indexOf(0) }); }
    });
    r.send(r.host(), { t: 'config', size: 2 });
    r.send(r.host(), { t: 'start' });
    await until(() => r.socks[0].last.status === 'ended', 45000, 'caro ends'); // lần đầu sau khi dev server khởi động có thể chậm
    return `why=${r.socks[0].last.why} moves=${r.socks[0].last.moves}`;
  },
  // Nối 4, 2 người: thả vào cột ngẫu nhiên chưa đầy.
  async c4() {
    const r = await join((c) => `/api/c4/room/${c}`, 2, (ws, m) => {
      const seat = m.seats.indexOf(ws.me) + 1;
      if (m.status !== 'playing' || m.turn !== seat || ws.moved === m.moves) return;
      ws.moved = m.moves;
      const cols = [...Array(COLS).keys()].filter((c) => !m.board[c]);
      r.send(ws, { t: 'move', i: cols[Math.floor(Math.random() * cols.length)] });
    });
    r.send(r.host(), { t: 'start' });
    await until(() => r.socks[0].last.status === 'ended', 30000, 'c4 ends');
    return `why=${r.socks[0].last.why} moves=${r.socks[0].last.moves}`;
  },
  // Bắn tàu với máy: xếp tàu ngẫu nhiên, sẵn sàng, bắn 5 phát (cả ván quá lâu cho smoke).
  async 'ban-tau'() {
    const targetShots = fast ? FAST_BATTLESHIP_SHOTS : FULL_BATTLESHIP_SHOTS;
    let shots = 0;
    const r = await join((c) => `/api/bt/room/${c}`, 1, (ws, m) => {
      const seat = m.seats.indexOf(ws.me) + 1;
      if (m.status === 'placing' && !m.ready[seat - 1] && !ws.readied) { ws.readied = true; r.send(ws, { t: 'ready' }); }
      if (m.status === 'playing' && m.turn === seat && shots < targetShots && ws.at !== String(m.fired)) {
        ws.at = String(m.fired);
        const mine = m.shots?.[seat - 1] ?? []; // shots[k] = các phát người ghế k+1 đã bắn
        const i = [...Array(N * N).keys()].find((k) => !mine[k]);
        shots++;
        r.send(ws, { t: 'shoot', i });
      }
    });
    r.send(r.host(), { t: 'start' });
    await until(() => {
      const s = r.socks[0], seat = s.last.seats.indexOf(s.me);
      return s.last.fired[seat] >= targetShots;
    }, 30000, `ban-tau ${targetShots} acknowledged shots`);
    const s = r.socks[0], seat = s.last.seats.indexOf(s.me);
    if (s.last.status !== 'ended' && s.last.fleets[1 - seat] !== null) throw new Error('opponent fleet leaked');
    return `status=${s.last.status} shots=${s.last.fired[seat]}`;
  },
  // Bầu cua 2 người, máy làm cái: người khách đặt, chủ phòng mở bát.
  async 'bau-cua'() {
    const r = await join((c) => `/api/bc/room/${c}`, 2);
    const guest = r.socks.find((s) => s !== r.host());
    r.send(guest, { t: 'bet', s: 0, amt: 50 });
    await until(() => r.host().last.bets?.[guest.me], 3000, 'bet placed');
    r.send(r.host(), { t: 'roll' });
    await until(() => r.host().last.phase === 'show', 5000, 'bowl opened');
    return `dice=${r.host().last.dice} delta=${r.host().last.deltas?.[guest.me]}`;
  },
  // Pikachu đua 2 người, bàn 8x6: mỗi bot nối cặp tìm được tới khi có người phá đảo 5 màn; giữa ván có người vào xem.
  async pikachu() {
    const r = await join((c) => `/api/room/${c}`, 2);
    const boards = {};
    for (const ws of r.socks) {
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        if ((m.t === 'board' || m.t === 'match') && m.unit === ws.me) {
          boards[ws.me] = m.board;
          if (m.t === 'match') ws.matched = true;
          const pair = findPair(m.board);
          if (pair && (!fast || !ws.matched)) r.send(ws, { t: 'pick', a: pair[0], b: pair[1] });
        }
      }, { signal: attemptSockets.getStore().messages.signal });
    }
    r.send(r.host(), { t: 'config', mode: 'race', size: 3 });
    await until(() => r.socks.every((s) => s.last.mode === 'race' && s.last.size === 3), 3000, 'race 8x6');
    r.send(r.host(), { t: 'start' });
    await until(() => r.socks.every((s) => boards[s.me]), 5000, 'boards received');
    const watcher = connectSocket(`${base}/api/room/${r.code}?id=smoke-watch-${Date.now()}&name=Watch`);
    watcher.msgs = [];
    watcher.onmessage = (e) => watcher.msgs.push(JSON.parse(e.data));
    await until(() => watcher.msgs.some((m) => m.t === 'board') && watcher.msgs.some((m) => m.t === 'minis') &&
      watcher.msgs.some((m) => m.t === 'state' && m.players.some((p) => p.name === 'Watch' && p.spec)),
    ACK_TIMEOUT_MS, 'watcher receives spectator state, board and minis');
    if (fast) {
      await until(() => r.socks.every((s) => s.matched && s.last.units[s.me].score > 0), ACK_TIMEOUT_MS, 'both players match a pair');
      return 'both players matched a pair; watcher receives board and minis as spectator';
    }
    await until(() => r.socks[0].last.status === 'ended', 60000, 'someone clears 5 levels');
    const w = r.socks[0].last;
    const seen = new Set(watcher.msgs.map((m) => m.t));
    watcher.close();
    if (!seen.has('board') || !seen.has('minis')) throw new Error(`watcher got ${[...seen]}`);
    if (!w.result?.rp) throw new Error('no replay id');
    return `winner=${w.winner === r.socks[0].me ? 'Bot0' : 'Bot1'} levels=${Object.values(w.units).map((u) => u.level)} watcher=${w.players.find((p) => p.name === 'Watch')?.spec ? 'spec' : '?'}`;
  },
  // Đào Vàng tranh vàng 2 người: thả móc liên tục hết màn 1 (60 giây) -> tiệm, mua được thì mua, cả hai sẵn sàng -> màn 2.
  async 'dao-vang'() {
    const r = await join((c) => `/api/dv/room/${c}`, 2);
    r.send(r.host(), { t: 'config', mode: 'versus' });
    await until(() => r.socks.every((s) => s.last.mode === 'versus'), 3000, 'versus mode');
    r.send(r.host(), { t: 'start' });
    await until(() => r.socks.every((s) => s.msgs.some((m) => m.t === 'world') && s.last.status === 'playing'), 5000, 'world received');
    if (fast) {
      for (const s of r.socks) r.send(s, { t: 'shoot' });
      await until(() => r.socks.every((s) => r.socks.every((player) =>
        s.msgs.some((m) => m.t === 'ev' && m.evs.some((e) => e.k === 'shoot' && e.id === player.me)) &&
        s.msgs.some((m) => m.t === 'snap' && m.miners.some((miner) => miner.id === player.me && miner.m === 'out' &&
          miner.l > s.msgs.find((event) => event.t === 'world').world.miners.find((miner) => miner.id === player.me).len))
      )), ACK_TIMEOUT_MS, 'both miners shoot and extend hooks on both clients');
      return 'both miners shoot; both clients observe extending hooks';
    }
    const pump = setInterval(() => r.socks.forEach((s) => r.send(s, { t: 'shoot' })), 500);
    try { await until(() => r.socks.every((s) => s.last.status === 'shop'), 75000, 'level 1 -> shop'); } finally { clearInterval(pump); }
    const snaps = r.socks[0].msgs.filter((m) => m.t === 'snap').length, grabs = r.socks[0].msgs.filter((m) => m.t === 'ev').length;
    for (const s of r.socks) {
      const me = s.last.players.find((p) => p.id === s.me);
      const buy = me.offer.find((o) => o.price <= me.money);
      if (buy) r.send(s, { t: 'buy', key: buy.key });
      r.send(s, { t: 'ready' });
    }
    await until(() => r.socks.every((s) => s.last.status === 'playing' && s.last.level === 2), 5000, 'level 2');
    return `snaps=${snaps} ev=${grabs} money=${r.socks[0].last.players.map((p) => p.money)}`;
  },
  // Dò mìn đua 2 người: mỗi người mở ô ẩn ngẫu nhiên tới hết ván; không ai được nhận bàn của đối thủ trước khi hết ván.
  async 'do-min'() {
    const r = await join((c) => `/api/ms/room/${c}`, 2);
    const grid = {};
    let leak = false;
    for (const ws of r.socks) {
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        // Bàn đối thủ chỉ được tới kèm 'reveal' ngay sau (hết ván).
        if (ws.foreign && m.t !== 'reveal') leak = true;
        ws.foreign = m.t === 'grid' && Object.keys(m.grids).some((u) => u !== ws.me);
        if (m.t === 'grid' && m.grids[ws.me]) grid[ws.me] = m.grids[ws.me];
        if (m.t === 'open' && m.unit === ws.me) for (const [i, v] of m.cells) grid[ws.me][i] = v;
      }, { signal: attemptSockets.getStore().messages.signal });
    }
    r.send(r.host(), { t: 'config', mode: 'race', size: 0 });
    await until(() => r.socks.every((s) => s.last.mode === 'race'), 3000, 'race mode');
    r.send(r.host(), { t: 'start' });
    await until(() => r.socks.every((s) => grid[s.me]), 5000, 'grids received');
    // Mỗi bot mở ô ẩn chưa gửi (mạng chậm thì bàn về trễ: khỏi gửi lại ô đang chờ kết quả).
    const sent = Object.fromEntries(r.socks.map((ws) => [ws.me, new Set()]));
    for (const end = Date.now() + 45000; r.socks[0].last.status === 'playing' && Date.now() < end;) {
      const pending = [];
      for (const ws of r.socks) {
        const hidden = grid[ws.me].flatMap((v, i) => (v === -1 && !sent[ws.me].has(i) ? [i] : []));
        if (!hidden.length) continue;
        const i = hidden[Math.floor(Math.random() * hidden.length)];
        sent[ws.me].add(i);
        pending.push([ws, i]);
        r.send(ws, { t: 'open', i });
      }
      if (!pending.length) {
        await until(() => r.socks[0].last.status === 'ended', ACK_TIMEOUT_MS, 'exhausted mine boards end');
        break;
      }
      await until(() => r.socks[0].last.status === 'ended' || pending.every(([ws, i]) => grid[ws.me][i] !== -1),
        ACK_TIMEOUT_MS, 'mine opens acknowledged');
      if (fast) {
        await until(() => r.socks.every((s) => pending.every(([ws, i]) =>
          s.last.status === 'ended' || (s.last.players.find((p) => p.id === ws.me).opened +
            s.last.players.find((p) => p.id === ws.me).booms > 0 && grid[ws.me][i] !== -1))),
        ACK_TIMEOUT_MS, 'both players receive open progress');
        if (r.socks[0].last.status === 'ended') break;
        if (leak || r.socks.some((s) => s.foreign || s.msgs.some((m) => m.t === 'reveal'))) throw new Error('race: private mine data leaked');
        return 'both players opened a hidden cell; opponent grids and mines stay private';
      }
    }
    await until(() => r.socks[0].last.status === 'ended', 5000, 'do-min ends');
    await until(() => r.socks.every((s) => s.msgs.some((m) => m.t === 'reveal')), 3000, 'mines revealed');
    if (leak) throw new Error('race: opponent grid leaked');
    const w = r.socks[0].last.winner;
    return `winner=${w === r.socks[0].me ? 'Bot0' : w === r.socks[1].me ? 'Bot1' : w}`;
  },
  // Ô ăn quan với máy: tới hết ván.
  async 'o-an-quan'() {
    const r = await nokia('o-an-quan', 1, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v || v.over || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves || (fast && v.moves >= FAST_MOVES)) return;
      ws.moved = v.moves;
      const [k, d] = oaqBot({ b: v.b, big: v.big, cap: v.cap, debt: v.debt, turn: v.turn, quanNon: v.quanNon, over: false, moves: v.moves }, 1);
      r.send(ws, { t: 'g', k, d });
    }, { level: 0 });
    if (fast) return nokiaMoves(r, 'o-an-quan', 300000);
    await until(() => r.socks[0].last.status === 'ended', 300000, 'o-an-quan ends'); // ván dài: mỗi nước còn chờ client diễn lại
    return JSON.stringify(r.socks[0].last.result.title);
  },
  // Ô ăn quan bàn 3 người: bot smoke + 2 máy của server, tới hết ván.
  async 'o-an-quan-3'() {
    const r = await nokia('o-an-quan', 1, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v || v.over || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves || (fast && v.moves >= FAST_MOVES)) return;
      ws.moved = v.moves;
      const [k, d] = oaqBot({ b: v.b, big: v.big, cap: v.cap, debt: v.debt, turn: v.turn, quanNon: v.quanNon, over: false, moves: v.moves }, 1);
      r.send(ws, { t: 'g', k, d });
    }, { level: 0, n: 3 });
    if (fast) {
      const progress = await nokiaMoves(r, 'o-an-quan-3', 400000);
      if (r.socks[0].last.view.side.length !== THREE_PLAYER_BOARD) throw new Error('not a 3-player board');
      return progress;
    }
    await until(() => r.socks[0].last.status === 'ended', 400000, 'o-an-quan-3 ends');
    const v = r.socks[0].last;
    if (v.result.ranks[0].detail.of !== 3) throw new Error('not a 3-player board');
    return JSON.stringify(v.result.title);
  },
  // Cờ gánh với máy: tới hết ván.
  async 'co-ganh'() {
    const r = await nokia('co-ganh', 1, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v || v.over || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves || (fast && v.moves >= FAST_MOVES)) return;
      ws.moved = v.moves;
      const [from, to] = ganhBot({ b: v.b, turn: v.turn, open: v.open, over: false, winner: 0, moves: v.moves }, 1);
      r.send(ws, { t: 'g', from, to });
    }, { level: 0 });
    if (fast) return nokiaMoves(r, 'co-ganh', 180000);
    await until(() => r.socks[0].last.status === 'ended', 180000, 'co-ganh ends');
    return JSON.stringify(r.socks[0].last.result.title);
  },
  // Sói, 3 người: đúng 1 Sói, mỗi người chỉ thấy vai của mình (không lộ ai); chủ phòng lật bài thì ván kết thúc và lộ Sói.
  async soi() {
    const r = await nokia('soi', 3, () => {});
    await until(() => r.socks.every((s) => s.last.status === 'playing' && s.last.view?.role), 5000, 'soi roles');
    const roles = r.socks.map((s) => s.last.view.role);
    if (roles.filter((x) => x === 'wolf').length !== 1 || roles.filter((x) => x === 'villager').length !== 2) throw new Error(`bad roles ${roles}`);
    if (r.socks.some((s) => s.last.view.wolf !== null)) throw new Error('wolf leaked before reveal');
    r.send(r.host(), { t: 'g', a: 'reveal' });
    await until(() => r.socks.every((s) => s.last.status === 'ended'), 5000, 'soi reveal');
    const wolf = r.socks[roles.indexOf('wolf')].me;
    if (r.socks.some((s) => s.last.view.wolf !== wolf)) throw new Error('reveal names the wrong wolf');
    r.close();
    return JSON.stringify(r.socks[0].last.result.title);
  },
  async 'gian-diep'() {
    const r = await nokia('gian-diep', 6, () => {}, { spies: 1, whites: 1, seconds: 15, pack: 'food' });
    const phase = () => r.host().last.view?.phase;
    const send = (ws, a, extra = {}) => r.send(ws, { t: 'g', a, ...extra });
    try {
      await until(() => r.socks.every((s) => s.last.view?.card), 5000, 'private spy cards');
      const white = r.socks.find((s) => s.last.view.card.white);
      const words = r.socks.map((s) => s.last.view.card.word).filter(Boolean);
      const civilianWord = words.find((word) => words.filter((candidate) => candidate === word).length > 1);
      const spy = r.socks.find((s) => s.last.view.card.word && s.last.view.card.word !== civilianWord);
      if (!white || !spy) throw new Error('missing white or distinct spy word');
      if (r.socks.some((s) => s.last.view.reveal || s.last.view.players.some((p) => p.role))) throw new Error('private roles leaked');
      send(r.host(), SPY_ACTION.NEXT);
      await until(() => phase() === SPY_PHASE.DESCRIBE, 5000, 'host starts descriptions after dealing');
      send(r.host(), SPY_ACTION.ELIMINATE, { target: white.me });
      await until(() => phase() === SPY_PHASE.GUESS, 5000, 'white gets eliminated guess');
      send(white, SPY_ACTION.GUESS, { text: 'not-a-word-in-any-pack' });
      await until(() => phase() !== SPY_PHASE.GUESS, 5000, 'wrong white guess resumes');
      while (phase() === SPY_PHASE.DESCRIBE) {
        const speaker = r.host().last.view.speaker;
        send(r.host(), SPY_ACTION.NEXT);
        await until(() => phase() !== SPY_PHASE.DESCRIBE || r.host().last.view.speaker !== speaker, 5000, 'speaker advances');
      }
      send(r.host(), SPY_ACTION.VOTING);
      await until(() => phase() === SPY_PHASE.VOTE, 6000, 'vote countdown completes');
      const alive = r.socks.filter((s) => s !== white);
      for (const [index, s] of alive.entries()) send(s, SPY_ACTION.VOTE, { target: alive[(index + 1) % alive.length].me });
      await until(() => phase() === SPY_PHASE.TIE, 5000, 'tied vote needs more clues');
      send(r.host(), SPY_ACTION.NEXT);
      await until(() => phase() === SPY_PHASE.VOTE, 6000, 'runoff opens');
      for (const s of alive) send(s, SPY_ACTION.VOTE, { target: s === spy ? alive.find((p) => p !== spy).me : spy.me });
      await until(() => r.socks.every((s) => s.last.status === 'ended'), 5000, 'civilians win runoff');
      if (r.host().last.view.winner !== SPY_ROLE.CIVILIAN) throw new Error('wrong runoff winner');
      if (r.host().last.result.rp) throw new Error('secret game recorded replay');
      r.send(r.host(), { t: 'start' });
      await until(() => r.socks.every((s) => s.last.status === 'playing'), 5000, 'fresh deal');
      const nextWhite = r.socks.find((s) => s.last.view.card.white);
      const nextWords = r.socks.map((s) => s.last.view.card.word).filter(Boolean);
      const answer = nextWords.find((word) => nextWords.filter((candidate) => candidate === word).length > 1);
      send(r.host(), SPY_ACTION.NEXT);
      await until(() => phase() === SPY_PHASE.DESCRIBE, 5000, 'host starts fresh descriptions');
      send(r.host(), SPY_ACTION.ELIMINATE, { target: nextWhite.me });
      await until(() => phase() === SPY_PHASE.GUESS, 5000, 'new white guess');
      send(nextWhite, SPY_ACTION.GUESS, { text: answer });
      await until(() => r.socks.every((s) => s.last.status === 'ended'), 5000, 'white wins immediately');
      if (r.host().last.view.winner !== nextWhite.me) throw new Error('white guess winner is wrong');
      return '6 private cards; wrong white guess; tied vote; civilian runoff win; correct white guess win';
    } finally {
      r.close();
    }
  },
  // Cờ tướng với máy (máy dễ): bot smoke đi nước tốt nhất sâu 2, ván hết khi có người bị chiếu bí (hoặc 300 nước).
  async 'co-tuong'() {
    const r = await nokia('co-tuong', 1, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v || v.over || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves || (fast && v.moves >= FAST_MOVES)) return;
      ws.moved = v.moves;
      const [from, to] = tuongBot({ b: v.b, turn: v.turn, over: false, winner: 0, moves: v.moves }, 2, 60);
      r.send(ws, { t: 'g', from, to });
    }, { level: 0 });
    if (fast) return nokiaMoves(r, 'co-tuong', 240000);
    await until(() => r.socks[0].last.status === 'ended', 240000, 'co-tuong ends');
    return JSON.stringify(r.socks[0].last.result.title);
  },
  // Lô tô: trước hết 1 bot, tự hô 3 giây: bấm hô số đầu rồi server phải tự hô thêm (alarm của phòng).
  // Sau đó 2 người: bot 0 bật tự dò, bot 1 tự dò từng ô và kinh láo một lần; chủ phòng dò xong thì hô tiếp; ai có hàng đủ 5 số
  // đã hô thì KINH, server dò vé xong là hết ván.
  async loto() {
    const a = await nokia('loto', 1, (ws, m) => {
      if (m.status === 'playing' && m.view && !m.view.called.length && !ws.started) { ws.started = true; a.send(ws, { t: 'g', a: 'call' }); }
    }, { pace: 3 });
    await until(() => a.socks[0].last.view?.called.length >= 3, 15000, 'loto auto call');
    const auto = a.socks[0].last.view.called.length;
    a.close();
    const r = await nokia('loto', 2, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v?.cards) return;
      // Chủ phòng mua 3 tờ trước khi hô (giữ màu đang có, thêm 2 màu khác).
      if (m.host === ws.me && !v.called.length && v.cards.length < 3) {
        if (!ws.picked) { ws.picked = true; r.send(ws, { t: 'g', a: 'pick', colors: [v.colors[0], (v.colors[0] + 1) % 8, (v.colors[0] + 2) % 8] }); }
        return;
      }
      if (ws === r.socks[0] && !v.auto && !ws.auto) { ws.auto = true; return r.send(ws, { t: 'g', a: 'auto', on: true }); }
      if (ws === r.socks[1] && v.called.length === 1 && !ws.lao) { ws.lao = true; r.send(ws, { t: 'g', a: 'kinh' }); }
      if (ws.kinh !== v.called.length && !v.kinh?.wins.some((w) => w.id === ws.me) && lotoKinh(v.cards, v.called).length) { ws.kinh = v.called.length; return r.send(ws, { t: 'g', a: 'kinh' }); }
      const i = v.cards.flatMap((g) => g.flat()).findIndex((n, k) => n != null && v.called.includes(n) && !v.marked.includes(k));
      if (i >= 0) {
        if (ws.marking !== `${i}:${v.marked.length}`) { ws.marking = `${i}:${v.marked.length}`; r.send(ws, { t: 'g', a: 'mark', i }); }
      } else if (m.host === ws.me && !v.kinh && ws.called !== v.called.length) {
        ws.called = v.called.length;
        r.send(ws, { t: 'g', a: 'call' });
      }
    });
    await until(() => r.socks[0].last.status === 'ended', 60000, 'loto ends');
    const res = r.socks[0].last.result;
    if (!res.ranks[0].won || res.ranks[0].score !== 5) throw new Error(JSON.stringify(res));
    const lao = r.socks[0].msgs.find((m) => m.t === 'loto' && m.e === 'lao');
    if (!lao?.game || !lao.party) throw new Error(`kinh láo without penalties: ${JSON.stringify(lao)}`);
    const host = r.socks.find((s) => s.last.host === s.me) ?? r.socks[0];
    if (host.last.view.cards.length !== 3) throw new Error(`host holds ${host.last.view.cards.length} cards`);
    r.close();
    return `auto-called ${auto}; host 3 cards; kinh láo -> ${lao.game} + "${lao.party[0] ?? lao.party}"; ${JSON.stringify(res.title)} after ${r.socks[0].last.view.called.length} calls`;
  },
  // Bantumi với máy: tới hết ván.
  async bantumi() {
    const r = await nokia('bantumi', 1, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves || (fast && v.moves >= FAST_MOVES)) return;
      ws.moved = v.moves;
      r.send(ws, { t: 'g', i: bantumiBot(v.board, v.turn, 2) });
    });
    if (fast) return nokiaMoves(r, 'bantumi', 120000);
    await until(() => r.socks[0].last.status === 'ended', 120000, 'bantumi ends');
    return JSON.stringify(r.socks[0].last.result.title);
  },
  // Rắn sân riêng, có tường, tốc độ nhanh nhất: 2 con đâm tường là hết ván.
  async snake() {
    const r = await nokia('snake', 2, () => {}, { mode: 'solo', walls: true, speed: 4 });
    await until(() => r.socks[0].last.status === 'ended', 20000, 'snake ends');
    return `mode=${r.socks[0].last.result.ranks.length}p`;
  },
  // Phòng công khai: bật -> có trong /api/rooms (waiting), bắt đầu -> playing, tắt -> biến mất.
  async public() {
    const http = base.replace(/^ws/, 'http');
    const rooms = async () => (await (await fetch(`${http}/api/rooms`)).json()).rooms;
    const r = await join((c) => `/api/nk/pairs/room/${c}`, 2);
    const code = r.socks[0].last && new URL(r.socks[0].url).pathname.split('/').pop();
    const key = `pairs:${code}`;
    r.send(r.host(), { t: 'public', on: true });
    await until(() => r.socks.every((s) => s.last.pub === true), 3000, 'pub in state');
    let row;
    await untilAsync(async () => (row = (await rooms()).find((x) => x.key === key)), 5000, 'listed');
    if (row.status !== 'waiting' || row.players !== 2 || row.path !== '/nokia/pairs/') throw new Error(JSON.stringify(row));
    r.send(r.host(), { t: 'start' });
    await untilAsync(async () => (await rooms()).find((x) => x.key === key)?.status === 'playing', 5000, 'listed as playing');
    r.send(r.host(), { t: 'public', on: false });
    await untilAsync(async () => !(await rooms()).some((x) => x.key === key), 5000, 'unlisted');
    r.close();
    return `${key} listed -> playing -> unlisted`;
  },
  // Các game Nokia còn lại: bắt đầu được và có view.
  async pairs() { return nokiaStart('pairs'); },
  async logic() { return nokiaStart('logic'); },
  async 'rapid-roll'() { return nokiaStart('rapid-roll'); },
  async 'space-impact'() { return nokiaStart('space-impact'); },
  async bounce() { return nokiaStart('bounce'); },
};

async function nokia(game, n, onState, cfg) {
  const r = await join((c) => `/api/nk/${game}/room/${c}`, n, onState);
  if (cfg) {
    const previous = r.socks.map((s) => s.last);
    r.send(r.host(), { t: 'config', cfg });
    await until(() => r.socks.every((s, i) => s.last !== previous[i] &&
      Object.entries(cfg).every(([key, value]) => s.last.cfg?.[key] === value)),
    CONFIG_TIMEOUT_MS, `${game} config acknowledged`);
  }
  r.send(r.host(), { t: 'start' });
  return r;
}
async function nokiaMoves(r, game, timeout) {
  await until(() => r.socks.every((s) => s.moved !== undefined && s.last.view?.moves >= FAST_MOVES),
    timeout, `${game} ${FAST_MOVES} acknowledged moves`);
  return `acknowledged moves=${r.socks[0].last.view.moves}`;
}
async function nokiaStart(game) {
  const r = await nokia(game, 2, () => {});
  await until(() => r.socks.every((s) => s.last.status === 'playing' && s.last.view), 5000, `${game} playing`);
  if (fast) return nokiaProgress(r, game);
  r.close();
  return 'playing';
}

async function nokiaProgress(r, game) {
  if (game === 'pairs') {
    if (r.socks.some((s) => s.last.view.cards.some((card) => card !== -1))) throw new Error('face-down pairs leaked');
    const player = r.socks.find((s) => s.me === s.last.view.turn);
    const firstCard = 0;
    r.send(player, { t: 'g', i: firstCard });
    await until(() => r.socks.every((s) => s.last.view.open.includes(firstCard) && s.last.view.cards[firstCard] >= 0),
      ACK_TIMEOUT_MS, 'first card revealed to both players');
    if (r.socks.some((s) => s.last.view.cards.some((card, i) => i !== firstCard && card !== -1))) throw new Error('unflipped pairs leaked');
    return 'legal flip broadcast to both players; other cards stay hidden';
  }
  if (game === 'logic') {
    const guess = Array(LOGIC_SLOTS).fill(0);
    for (const s of r.socks) r.send(s, { t: 'g', guess });
    await until(() => r.socks.every((s) => s.last.view.mine.guesses.length === 1 &&
      r.socks.every((player) => s.last.view.others[player.me].n === 1)),
    ACK_TIMEOUT_MS, 'both guesses scored and progress broadcast');
    for (const s of r.socks) {
      const { mine, others, secret } = s.last.view;
      const result = mine.guesses[0];
      if (result.guess.some((value, i) => value !== guess[i]) ||
          !Number.isInteger(result.exact) || !Number.isInteger(result.near) ||
          result.exact < 0 || result.near < 0 || result.exact + result.near > LOGIC_SLOTS) throw new Error('invalid guess score');
      if ((s.last.status === 'playing' && secret !== null) || Object.values(others).some((player) => player.guesses)) throw new Error('private logic data leaked');
    }
    return 'both guesses scored; only aggregate opponent progress exposed';
  }
  if (game === 'space-impact') {
    const initial = new Map(r.socks.map((s) => [s.me, s.last.view.ships.find((ship) => ship.id === s.me).x]));
    for (const s of r.socks) r.send(s, { t: 'g', keys: { right: true, fire: true } });
    await until(() => r.socks.every((s) => s.last.view.bullets.length > 0 &&
      r.socks.every((player) => s.last.view.ships.find((ship) => ship.id === player.me).x > initial.get(player.me))),
    ACK_TIMEOUT_MS, 'both ships move and fire');
    return 'both ships moved; firing produced bullets on both clients';
  }
  await until(() => r.socks.every((s) => s.last.now >= s.last.view.startAt), ACK_TIMEOUT_MS, `${game} countdown completes`);
  const expected = new Map();
  for (const s of r.socks) {
    const simulation = game === 'rapid-roll' ? rapidSim(s.last.view.seed) : bounceSim(s.last.view.level);
    const step = game === 'rapid-roll' ? rapidStep : bounceStep;
    for (let i = 0; i < SIMULATION_STEPS; i++) step(simulation, SIMULATION_STEP_SECONDS, { right: true });
    const score = Math.round(game === 'rapid-roll' ? rapidScore(simulation) : bounceScore(simulation));
    const at = [simulation.x, simulation.y].map((value) => Math.round(value * POSITION_PRECISION) / POSITION_PRECISION);
    expected.set(s.me, { at, score });
    r.send(s, { t: 'g', at, score });
  }
  await until(() => r.socks.every((s) => [...expected].every(([id, progress]) => {
    const runner = s.last.view.runners[id];
    return runner.score === progress.score && runner.at?.every((value, i) => value === progress.at[i]);
  })), ACK_TIMEOUT_MS, `${game} simulated positions and scores broadcast`);
  return 'both simulated runners progressed; positions and scores broadcast to both clients';
}

async function runGame(name, run) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t = Date.now();
    try {
      const info = await runAttempt(run);
      console.log(`ok   ${name.padEnd(LOG_NAME_WIDTH)} ${((Date.now() - t) / MILLISECONDS_PER_SECOND).toFixed(DURATION_DECIMAL_PLACES)}s  ${info}${attempt > 1 ? '  (lần 2)' : ''}`);
      return true;
    } catch (e) {
      console.log(`${attempt < MAX_ATTEMPTS ? 'retry' : 'FAIL '} ${name.padEnd(LOG_NAME_WIDTH)} ${e.message}`);
    }
  }
  return false;
}

const unknown = only.filter((name) => !Object.hasOwn(GAMES, name));
if (unknown.length) {
  console.error(`Unknown smoke games: ${unknown.join(GAME_LIST_SEPARATOR)}`);
  process.exit(EXIT_FAILURE);
}

const selected = Object.entries(GAMES).filter(([name]) => !only.length || only.includes(name));
const priority = (name) => SLOW_FIRST.includes(name) ? SLOW_FIRST.indexOf(name) : SLOW_FIRST.length;
selected.sort(([left], [right]) => priority(left) - priority(right));
const queue = selected.values();
let fail = 0;
await Promise.all(Array.from({ length: Math.min(gameConcurrency, selected.length) }, async () => {
  for (const [name, run] of queue) {
    if (!await runGame(name, run)) fail++;
  }
}));
process.exit(fail ? EXIT_FAILURE : EXIT_SUCCESS);

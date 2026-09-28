// Smoke test nhiều người qua WebSocket thật: mỗi game vào phòng, bắt đầu ván, bot chơi tới hết (hoặc đủ xa để thấy chạy).
// Chạy trước / sau mỗi bước refactor để chắc hành vi không đổi:
//   node scripts/smoke.mjs                         (mặc định http://localhost:8789, wrangler dev)
//   node scripts/smoke.mjs https://games.huyab.click [tên game ...]
import { botMove as oaqBot } from '../public/o-an-quan/logic.js';
import { botMove as bantumiBot } from '../public/nokia/bantumi/logic.js';
import { COLS } from '../public/noi-4/logic.js';
import { N } from '../public/ban-tau/logic.js';

const base = (process.argv[2] ?? 'http://localhost:8789').replace(/^http/, 'ws');
const only = process.argv.slice(3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const code = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');

// Mở n người vào cùng phòng; trả về socket có .me, .last (state mới nhất), .msgs; host() = socket đang làm chủ phòng.
async function join(path, n, onState = () => {}) {
  const room = code();
  const socks = await Promise.all(Array.from({ length: n }, (_, k) => new Promise((ok, fail) => {
    const me = `smoke-${k}-${room}-${Math.random().toString(36).slice(2, 8)}`;
    const ws = new WebSocket(`${base}${path(room)}${path(room).includes('?') ? '&' : '?'}id=${me}&name=Bot${k}`);
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
  return { socks, send, host: () => socks.find((s) => s.last.host === s.me), close: () => socks.forEach((s) => s.close()) };
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
    let shots = 0;
    const r = await join((c) => `/api/bt/room/${c}`, 1, (ws, m) => {
      const seat = m.seats.indexOf(ws.me) + 1;
      if (m.status === 'placing' && !m.ready[seat - 1] && !ws.readied) { ws.readied = true; r.send(ws, { t: 'ready' }); }
      if (m.status === 'playing' && m.turn === seat && shots < 5 && ws.at !== String(m.fired)) {
        ws.at = String(m.fired);
        const mine = m.shots?.[seat - 1] ?? []; // shots[k] = các phát người ghế k+1 đã bắn
        const i = [...Array(N * N).keys()].find((k) => !mine[k]);
        shots++;
        r.send(ws, { t: 'shoot', i });
      }
    });
    r.send(r.host(), { t: 'start' });
    await until(() => shots >= 5, 30000, 'ban-tau 5 shots');
    await sleep(800);
    return `status=${r.socks[0].last.status} shots=${shots}`;
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
  // Pikachu / Đào Vàng / Dò mìn: vào phòng 2 người, bắt đầu, thấy ván chạy.
  async pikachu() { return startOnly((c) => `/api/room/${c}`); },
  async 'dao-vang'() { return startOnly((c) => `/api/dv/room/${c}`); },
  async 'do-min'() { return startOnly((c) => `/api/ms/room/${c}`); },
  // Ô ăn quan với máy: tới hết ván.
  async 'o-an-quan'() {
    const r = await nokia('o-an-quan', 1, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v || v.over || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves) return;
      ws.moved = v.moves;
      const [k, d] = oaqBot({ b: v.b, big: v.big, cap: v.cap, debt: v.debt, turn: v.turn, quanNon: v.quanNon, over: false, moves: v.moves }, 1);
      r.send(ws, { t: 'g', k, d });
    }, { level: 0 });
    await until(() => r.socks[0].last.status === 'ended', 120000, 'o-an-quan ends');
    return JSON.stringify(r.socks[0].last.result.title);
  },
  // Bantumi với máy: tới hết ván.
  async bantumi() {
    const r = await nokia('bantumi', 1, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves) return;
      ws.moved = v.moves;
      r.send(ws, { t: 'g', i: bantumiBot(v.board, v.turn, 2) });
    });
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

async function startOnly(path) {
  const r = await join(path, 2);
  const before = r.socks[0].last.status;
  r.send(r.host(), { t: 'start' });
  await until(() => r.socks.every((s) => s.last.status !== before), 5000, 'status changes after start');
  r.close();
  return `${before} -> ${r.socks[0].last.status}`;
}
async function nokia(game, n, onState, cfg) {
  const r = await join((c) => `/api/nk/${game}/room/${c}`, n, onState);
  if (cfg) { r.send(r.host(), { t: 'config', cfg }); await sleep(200); }
  r.send(r.host(), { t: 'start' });
  return r;
}
async function nokiaStart(game) {
  const r = await nokia(game, 2, () => {});
  await until(() => r.socks.every((s) => s.last.status === 'playing' && s.last.view), 5000, `${game} playing`);
  r.close();
  return 'playing';
}

let fail = 0;
for (const [name, run] of Object.entries(GAMES)) {
  if (only.length && !only.includes(name)) continue;
  const t = Date.now();
  try {
    const info = await run();
    console.log(`ok   ${name.padEnd(13)} ${((Date.now() - t) / 1000).toFixed(1)}s  ${info}`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${name.padEnd(13)} ${e.message}`);
  }
}
process.exit(fail ? 1 : 0);

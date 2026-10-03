// Smoke test nhiều người qua WebSocket thật: mỗi game vào phòng, bắt đầu ván, bot chơi tới hết (hoặc đủ xa để thấy chạy).
// Chạy trước / sau mỗi bước refactor để chắc hành vi không đổi:
//   node scripts/smoke.mjs                         (mặc định http://localhost:8789, wrangler dev)
//   node scripts/smoke.mjs https://games.huyab.click [tên game ...]
import { botMove as oaqBot } from '../public/o-an-quan/logic.js';
import { botMove as bantumiBot } from '../public/nokia/bantumi/logic.js';
import { COLS } from '../public/noi-4/logic.js';
import { N } from '../public/ban-tau/logic.js';
import { findPair } from '../public/pikachu/logic.js';
import { botMove as ganhBot } from '../public/co-ganh/logic.js';
import { botMove as tuongBot } from '../public/co-tuong/logic.js';
import { kinhRows as lotoKinh } from '../public/loto/logic.js';

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
  // Pikachu đua 2 người, bàn 8x6: mỗi bot nối cặp tìm được tới khi có người phá đảo 5 màn; giữa ván có người vào xem.
  async pikachu() {
    const r = await join((c) => `/api/room/${c}`, 2);
    const boards = {};
    for (const ws of r.socks) {
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data);
        if ((m.t === 'board' || m.t === 'match') && m.unit === ws.me) {
          boards[ws.me] = m.board;
          const pair = findPair(m.board); // lúc bắt đầu board tới trước state
          if (pair) setTimeout(() => r.send(ws, { t: 'pick', a: pair[0], b: pair[1] }), 5);
        }
      });
    }
    r.send(r.host(), { t: 'config', mode: 'race', size: 3 });
    await until(() => r.socks.every((s) => s.last.mode === 'race' && s.last.size === 3), 3000, 'race 8x6');
    r.send(r.host(), { t: 'start' });
    await until(() => r.socks.every((s) => boards[s.me]), 5000, 'boards received');
    const watcher = new WebSocket(`${base}/api/room/${r.code}?id=smoke-watch-${Date.now()}&name=Watch`);
    watcher.msgs = [];
    watcher.onmessage = (e) => watcher.msgs.push(JSON.parse(e.data));
    await until(() => r.socks[0].last.status === 'ended', 60000, 'someone clears 5 levels');
    const w = r.socks[0].last;
    await sleep(300);
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
      });
    }
    r.send(r.host(), { t: 'config', mode: 'race', size: 0 });
    await until(() => r.socks.every((s) => s.last.mode === 'race'), 3000, 'race mode');
    r.send(r.host(), { t: 'start' });
    await until(() => r.socks.every((s) => grid[s.me]), 5000, 'grids received');
    // Mỗi bot mở ô ẩn chưa gửi (mạng chậm thì bàn về trễ: khỏi gửi lại ô đang chờ kết quả).
    const sent = Object.fromEntries(r.socks.map((ws) => [ws.me, new Set()]));
    for (const end = Date.now() + 45000; r.socks[0].last.status === 'playing' && Date.now() < end;) {
      for (const ws of r.socks) {
        const hidden = grid[ws.me].flatMap((v, i) => (v === -1 && !sent[ws.me].has(i) ? [i] : []));
        if (!hidden.length) continue;
        const i = hidden[Math.floor(Math.random() * hidden.length)];
        sent[ws.me].add(i);
        r.send(ws, { t: 'open', i });
      }
      await sleep(40);
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
      if (m.status !== 'playing' || !v || v.over || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves) return;
      ws.moved = v.moves;
      const [k, d] = oaqBot({ b: v.b, big: v.big, cap: v.cap, debt: v.debt, turn: v.turn, quanNon: v.quanNon, over: false, moves: v.moves }, 1);
      r.send(ws, { t: 'g', k, d });
    }, { level: 0 });
    await until(() => r.socks[0].last.status === 'ended', 300000, 'o-an-quan ends'); // ván dài: mỗi nước còn chờ client diễn lại
    return JSON.stringify(r.socks[0].last.result.title);
  },
  // Ô ăn quan bàn 3 người: bot smoke + 2 máy của server, tới hết ván.
  async 'o-an-quan-3'() {
    const r = await nokia('o-an-quan', 1, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v || v.over || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves) return;
      ws.moved = v.moves;
      const [k, d] = oaqBot({ b: v.b, big: v.big, cap: v.cap, debt: v.debt, turn: v.turn, quanNon: v.quanNon, over: false, moves: v.moves }, 1);
      r.send(ws, { t: 'g', k, d });
    }, { level: 0, n: 3 });
    await until(() => r.socks[0].last.status === 'ended', 400000, 'o-an-quan-3 ends');
    const v = r.socks[0].last;
    if (v.result.ranks[0].detail.of !== 3) throw new Error('not a 3-player board');
    return JSON.stringify(v.result.title);
  },
  // Cờ gánh với máy: tới hết ván.
  async 'co-ganh'() {
    const r = await nokia('co-ganh', 1, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v || v.over || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves) return;
      ws.moved = v.moves;
      const [from, to] = ganhBot({ b: v.b, turn: v.turn, open: v.open, over: false, winner: 0, moves: v.moves }, 1);
      r.send(ws, { t: 'g', from, to });
    }, { level: 0 });
    await until(() => r.socks[0].last.status === 'ended', 180000, 'co-ganh ends');
    return JSON.stringify(r.socks[0].last.result.title);
  },
  // Cờ tướng với máy (máy dễ): bot smoke đi nước tốt nhất sâu 2, ván hết khi có người bị chiếu bí (hoặc 300 nước).
  async 'co-tuong'() {
    const r = await nokia('co-tuong', 1, (ws, m) => {
      const v = m.view;
      if (m.status !== 'playing' || !v || v.over || v.side[v.turn - 1] !== ws.me || ws.moved === v.moves) return;
      ws.moved = v.moves;
      const [from, to] = tuongBot({ b: v.b, turn: v.turn, over: false, winner: 0, moves: v.moves }, 2, 60);
      r.send(ws, { t: 'g', from, to });
    }, { level: 0 });
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
      if (ws === r.socks[0] && !v.auto && !ws.auto) { ws.auto = true; return r.send(ws, { t: 'g', a: 'auto', on: true }); }
      if (ws === r.socks[1] && v.called.length === 1 && !ws.lao) { ws.lao = true; r.send(ws, { t: 'g', a: 'kinh' }); }
      if (!ws.kinh && lotoKinh(v.cards, v.called).length) { ws.kinh = true; return r.send(ws, { t: 'g', a: 'kinh' }); }
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
    if (!r.socks[0].msgs.some((m) => m.t === 'loto' && m.e === 'lao')) throw new Error('no kinh láo notice');
    r.close();
    return `auto-called ${auto}; ${JSON.stringify(res.title)} after ${r.socks[0].last.view.called.length} calls`;
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
  // Mạng / lúc vừa deploy có thể chập chờn: game fail thì chạy lại 1 lần, ghi rõ để còn thấy.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t = Date.now();
    try {
      const info = await run();
      console.log(`ok   ${name.padEnd(13)} ${((Date.now() - t) / 1000).toFixed(1)}s  ${info}${attempt > 1 ? '  (lần 2)' : ''}`);
      break;
    } catch (e) {
      console.log(`${attempt < 2 ? 'retry' : 'FAIL '} ${name.padEnd(13)} ${e.message}`);
      if (attempt === 2) fail++;
    }
  }
}
process.exit(fail ? 1 : 0);

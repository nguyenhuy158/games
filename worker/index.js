import { DurableObject } from 'cloudflare:workers';
import { SIZES, LEVELS, SLIDES, durationOf, slide, newBoard, findPath, findPair, reshuffle, countLeft } from '../public/pikachu/logic.js';

const MAX_PLAYERS = 4;
const MAX_ONLINE = 8; // người chơi + khán giả
const SHUFFLES = 5;
const PAIR_SCORE = 10;
const COMBO_MS = 3000; // ăn cặp kế tiếp trong khoảng này thì combo tăng
const MAX_COMBO = 5;
const STUCK_BONUS_MS = 10_000; // hết nước tự xáo thì cộng giờ, đỡ ức chế
const MODES = ['coop', 'race', 'team'];
const TILESETS = ['poke', 'animal'];
const EMOJI_COUNT = 5; // khớp EMOJIS ở public/app.js
const TOP_LIMIT = 10;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/top') {
      const mode = url.searchParams.get('mode');
      const size = Number(url.searchParams.get('size'));
      if (!MODES.includes(mode) || !SIZES[size]) return new Response('Bad request', { status: 400 });
      const rows = await env.TOP.get(env.TOP.idFromName('global')).list(mode, size);
      return Response.json(rows, { headers: { 'Cache-Control': 'public, max-age=30' } });
    }
    const m = url.pathname.match(/^\/api\/room\/([A-Z0-9]{4})$/);
    if (!m || req.headers.get('Upgrade') !== 'websocket') return new Response('Not found', { status: 404 });
    return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
  },
};

// Bảng xếp hạng: một DO SQLite duy nhất (gói free đã hết quota D1).
export class Top extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL, size INTEGER NOT NULL, names TEXT NOT NULL,
      score INTEGER NOT NULL, level INTEGER NOT NULL, cleared INTEGER NOT NULL, at INTEGER NOT NULL)`);
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS scores_top ON scores (mode, size, score DESC)');
  }

  add(rows) {
    for (const r of rows) {
      this.ctx.storage.sql.exec(
        'INSERT INTO scores (mode, size, names, score, level, cleared, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        r.mode, r.size, r.names, r.score, r.level, r.cleared ? 1 : 0, Date.now(),
      );
    }
  }

  list(mode, size) {
    return this.ctx.storage.sql
      .exec('SELECT names, score, level, cleared, at FROM scores WHERE mode = ? AND size = ? ORDER BY score DESC, at ASC LIMIT ?', mode, size, TOP_LIMIT)
      .toArray();
  }
}

// Một "bàn chơi" (unit) giữ bàn, màn, đồng hồ, combo, lượt xáo riêng:
//   coop: cả phòng 1 unit 'all' · race: mỗi người 1 unit (id người) · team: unit 'A' / 'B'.
// Nhờ vậy mọi luật (màn, combo, cộng giờ, thắng thua) viết một lần cho cả 3 chế độ.
const fresh = () => ({
  status: 'lobby', mode: 'coop', size: 0, tiles: 'poke',
  order: [], players: {}, units: {}, deck: [], winner: null,
});
const isCell = (p, g) =>
  Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) &&
  p[0] >= 1 && p[0] <= g.length - 2 && p[1] >= 1 && p[1] <= g[0].length - 2;
// Toạ độ chuột theo đơn vị ô (số thực), cho phép lấn ra viền 1 ô.
const isPos = (p, g) =>
  Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
  p[0] >= 0 && p[0] <= g.length && p[1] >= 0 && p[1] <= g[0].length;
const copy = (g) => g.map((r) => r.slice());

// Một phòng = một Durable Object. Người chơi ẩn danh, định danh bằng deviceId
// (UUID lưu localStorage phía client). Server giữ bàn thật và kiểm lại mọi nước đi.
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.watch = {}; // khán giả id -> unit đang xem (không cần lưu)
    this.rate = {}; // chống spam ping/emoji: `${id}:${kind}` -> thời điểm cuối
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('s');
      // Phòng lưu từ bản cũ khác cấu trúc -> bỏ, tạo mới.
      this.s = saved?.units ? { ...fresh(), ...saved } : fresh();
    });
  }

  async fetch(req) {
    const q = new URL(req.url).searchParams;
    const id = q.get('id') ?? '';
    const name = (q.get('name') ?? '').trim().slice(0, 20) || 'Pika';
    const [client, server] = Object.values(new WebSocketPair());
    const s = this.s;

    const reject = (msg) => {
      server.accept();
      server.send(JSON.stringify({ t: 'error', msg }));
      server.close(4001, 'rejected');
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!/^[\w-]{8,64}$/.test(id)) return reject('Thiết bị không hợp lệ');

    let p = s.players[id];
    if (!p) {
      const online = this.onlineIds();
      if (online.size >= MAX_ONLINE) return reject('Phòng đông quá rồi');
      const playing = [...online].filter((i) => s.players[i] && !s.players[i].spec).length;
      // Đang chơi hoặc đã đủ người -> vào xem, ván sau được chơi.
      const spec = s.status === 'playing' || playing >= MAX_PLAYERS;
      p = s.players[id] = { id, name, score: 0, spec, team: this.smallerTeam() };
      s.order.push(id);
    }
    p.name = name;

    // Cùng thiết bị mở tab mới -> tab cũ nhường chỗ.
    for (const ws of this.sockets()) if (ws.deserializeAttachment()?.id === id) ws.close(4000, 'replaced');
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });

    await this.save();
    this.sendBoardTo(server);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const s = this.s;
    const p = s.players[ws.deserializeAttachment()?.id];
    if (!p) return;
    const isHost = this.hostId() === p.id;
    const lobby = s.status !== 'playing';

    switch (m.t) {
      case 'start':
        if (isHost && lobby) await this.start();
        return;
      case 'config': {
        if (!isHost || !lobby) return;
        if (MODES.includes(m.mode)) s.mode = m.mode;
        if (Number.isInteger(m.size) && SIZES[m.size]) s.size = m.size;
        if (TILESETS.includes(m.tiles)) s.tiles = m.tiles;
        break;
      }
      case 'team':
        if (!lobby || !['A', 'B'].includes(m.team)) return;
        p.team = m.team;
        break;
      case 'watch':
        if (!p.spec || !s.units[m.unit]) return;
        this.watch[p.id] = m.unit;
        this.sendBoardTo(ws);
        return;
      case 'sel':
      case 'cur':
      case 'ping': {
        // Chỉ để đồng đội cùng bàn thấy, không lưu.
        const uid = this.unitOf(p), u = s.units[uid];
        if (!u || s.status !== 'playing') return;
        const v = m.t === 'cur' ? m.p : m.a;
        if (v !== null && !(m.t === 'cur' ? isPos : isCell)(v, u.board)) return;
        if (m.t === 'ping' && (v === null || !this.allow(p.id, 'ping', 400))) return;
        this.toViewers(uid, { t: m.t, id: p.id, [m.t === 'cur' ? 'p' : 'a']: v }, ws);
        return;
      }
      case 'emo':
        if (!Number.isInteger(m.e) || m.e < 0 || m.e >= EMOJI_COUNT || !this.allow(p.id, 'emo', 700)) return;
        this.relay(ws, { t: 'emo', id: p.id, e: m.e });
        return;
      case 'pick':
        await this.pick(ws, p, m.a, m.b);
        return;
      case 'shuffle': {
        const uid = this.unitOf(p), u = s.units[uid];
        if (s.status !== 'playing' || !u || u.done || u.shuffles <= 0) return;
        u.shuffles--;
        reshuffle(u.board);
        this.toViewers(uid, { t: 'board', unit: uid, board: u.board, why: 'shuffle', by: p.id });
        break;
      }
      default:
        return;
    }
    await this.save();
    this.broadcast();
  }

  async pick(ws, p, a, b) {
    const s = this.s;
    const uid = this.unitOf(p), u = s.units[uid];
    if (s.status !== 'playing' || !u || u.done || !isCell(a, u.board) || !isCell(b, u.board)) return;
    if (Date.now() >= u.endAt) return this.settle(); // hết giờ mà alarm chưa kịp chạy
    const path = findPath(u.board, a, b);
    // Client lệch (hoặc đồng đội vừa ăn mất ô đó) -> đồng bộ lại.
    if (!path) return ws.send(JSON.stringify({ t: 'board', unit: uid, board: u.board, why: 'sync' }));

    const now = Date.now();
    u.combo = now - u.lastAt <= COMBO_MS ? Math.min(MAX_COMBO, u.combo + 1) : 1;
    u.lastAt = now;
    const pts = PAIR_SCORE * u.combo;
    p.score += pts;
    u.score += pts;
    u.board[a[0]][a[1]] = u.board[b[0]][b[1]] = 0;
    slide(u.board, SLIDES[u.level - 1]);
    // Kèm bàn sau khi trượt: client thay bàn theo server, khỏi lệch khi 2 người ăn cùng lúc.
    this.toViewers(uid, { t: 'match', unit: uid, id: p.id, a, b, path, combo: u.combo, pts, board: u.board });

    if (!countLeft(u.board)) {
      if (u.level === LEVELS) {
        u.done = 'clear';
      } else {
        u.level++;
        u.board = copy(s.deck[u.level - 1]);
        u.endAt = now + durationOf(SIZES[s.size]);
        u.shuffles++;
        u.combo = 0;
        this.toViewers(uid, { t: 'board', unit: uid, board: u.board, why: 'level' });
      }
    } else if (!findPair(u.board)) {
      reshuffle(u.board);
      u.endAt += STUCK_BONUS_MS;
      this.toViewers(uid, { t: 'board', unit: uid, board: u.board, why: 'stuck' });
    }
    await this.settle();
  }

  async webSocketClose(ws) {
    const s = this.s;
    const id = ws.deserializeAttachment()?.id;
    const online = this.onlineIds(ws);
    // Ở sảnh chờ thì ai rời là mất chỗ, nhường cho người khác vào.
    // (Ván đã xong thì giữ lại để màn kết quả còn tên; start() tự loại người offline.)
    if (s.status === 'lobby' && id && !online.has(id)) {
      s.order = s.order.filter((i) => i !== id);
      delete s.players[id];
      delete this.watch[id];
    }
    if (!online.size && s.status !== 'playing') {
      this.s = fresh();
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.save();
    this.broadcast(ws);
  }

  webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  async alarm() {
    if (this.s.status === 'playing') await this.settle();
  }

  async start() {
    const s = this.s;
    const online = this.onlineIds();
    s.order = s.order.filter((i) => online.has(i));
    for (const id of Object.keys(s.players)) if (!online.has(id)) delete s.players[id];
    // Ai đang online đều được chơi (khán giả cũ cũng vào), tối đa MAX_PLAYERS theo thứ tự vào.
    s.order.forEach((id, i) => {
      Object.assign(s.players[id], { score: 0, spec: i >= MAX_PLAYERS });
    });
    // Đề chung cho mọi bàn, mỗi màn một đề: đua/đội là công bằng.
    s.deck = Array.from({ length: LEVELS }, () => newBoard(SIZES[s.size]));
    const endAt = Date.now() + durationOf(SIZES[s.size]);
    s.units = {};
    for (const id of s.order) {
      const uid = this.unitOf(s.players[id]);
      if (uid && !s.units[uid]) {
        s.units[uid] = { board: copy(s.deck[0]), level: 1, score: 0, shuffles: SHUFFLES, endAt, combo: 0, lastAt: 0, done: null };
      }
    }
    s.status = 'playing';
    s.winner = null;
    this.watch = {};
    await this.save();
    await this.ctx.storage.setAlarm(endAt);
    for (const ws of this.sockets()) this.sendBoardTo(ws, 'start');
    this.broadcast();
  }

  // Sau mỗi thay đổi: đánh dấu bàn hết giờ, xem ván kết thúc chưa, hẹn alarm kế tiếp.
  async settle() {
    const s = this.s;
    const now = Date.now();
    const units = Object.entries(s.units);
    for (const [, u] of units) if (!u.done && now >= u.endAt) u.done = 'out';
    const cleared = units.find(([, u]) => u.done === 'clear');
    if (cleared && s.mode !== 'coop') return this.finish(cleared[0]);
    if (units.every(([, u]) => u.done)) {
      // coop: phá đảo mới thắng. Đua/đội: không ai phá đảo thì xét màn rồi điểm.
      const best = units.reduce((x, y) => (y[1].level * 1e6 + y[1].score > x[1].level * 1e6 + x[1].score ? y : x));
      return this.finish(s.mode === 'coop' ? (cleared ? cleared[0] : null) : best[0]);
    }
    const next = Math.min(...units.filter(([, u]) => !u.done).map(([, u]) => u.endAt));
    await this.ctx.storage.setAlarm(next);
    await this.save();
    this.broadcast();
  }

  async finish(winner) {
    const s = this.s;
    s.status = 'ended';
    s.winner = winner;
    await this.ctx.storage.deleteAlarm();
    await this.save();
    this.broadcast();
    const rows = Object.entries(s.units)
      .filter(([, u]) => u.score > 0)
      .map(([uid, u]) => ({
        mode: s.mode, size: s.size, score: u.score, level: u.level, cleared: u.done === 'clear',
        names: this.membersOf(uid).map((id) => s.players[id].name).join(', ').slice(0, 100),
      }));
    // Lỗi ghi bảng xếp hạng không được làm hỏng ván chơi.
    try { if (rows.length) await this.env.TOP.get(this.env.TOP.idFromName('global')).add(rows); } catch {}
  }

  unitOf(p) {
    if (!p || p.spec) return null;
    return this.s.mode === 'coop' ? 'all' : this.s.mode === 'race' ? p.id : p.team;
  }

  membersOf(uid) {
    return this.s.order.filter((id) => this.unitOf(this.s.players[id]) === uid);
  }

  smallerTeam() {
    const n = { A: 0, B: 0 };
    for (const p of Object.values(this.s.players)) if (!p.spec) n[p.team]++;
    return n.A <= n.B ? 'A' : 'B';
  }

  // Bàn mà socket đang nhìn: bàn của mình, hoặc bàn khán giả chọn (mặc định bàn đầu).
  viewOf(ws) {
    const p = this.s.players[ws.deserializeAttachment()?.id];
    if (!p) return null;
    const own = this.unitOf(p);
    if (own && this.s.units[own]) return own;
    const w = this.watch[p.id];
    return this.s.units[w] ? w : Object.keys(this.s.units)[0] ?? null;
  }

  sendBoardTo(ws, why = 'sync') {
    const uid = this.viewOf(ws);
    if (this.s.status === 'lobby' || !uid) return;
    ws.send(JSON.stringify({ t: 'board', unit: uid, board: this.s.units[uid].board, why }));
  }

  toViewers(uid, msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets(except)) {
      if (this.viewOf(ws) === uid) try { ws.send(data); } catch {}
    }
  }

  allow(id, kind, ms) {
    const k = `${id}:${kind}`, now = Date.now();
    if (now - (this.rate[k] ?? 0) < ms) return false;
    this.rate[k] = now;
    return true;
  }

  save() {
    return this.ctx.storage.put('s', this.s);
  }

  sockets(except) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except);
  }

  onlineIds(except) {
    return new Set(this.sockets(except).map((ws) => ws.deserializeAttachment()?.id).filter(Boolean));
  }

  hostId(except) {
    const online = this.onlineIds(except);
    return this.s.order.find((id) => online.has(id) && !this.s.players[id].spec) ??
      this.s.order.find((id) => online.has(id)) ?? null;
  }

  relay(from, msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets(from)) try { ws.send(data); } catch {}
  }

  broadcast(except) {
    const s = this.s;
    const online = this.onlineIds(except);
    const msg = JSON.stringify({
      t: 'state',
      status: s.status, mode: s.mode, size: s.size, tiles: s.tiles,
      duration: durationOf(SIZES[s.size]),
      now: Date.now(),
      winner: s.winner,
      host: this.hostId(except),
      units: Object.fromEntries(Object.entries(s.units).map(([uid, u]) => [uid, {
        level: u.level, score: u.score, shuffles: u.shuffles, endAt: u.endAt, done: u.done,
        combo: u.combo, left: countLeft(u.board) / 2,
      }])),
      players: s.order.map((id) => {
        const p = s.players[id];
        return { id, name: p.name, score: p.score, spec: p.spec, team: p.team, unit: this.unitOf(p), online: online.has(id) };
      }),
    });
    for (const ws of this.sockets(except)) try { ws.send(msg); } catch {}
  }
}

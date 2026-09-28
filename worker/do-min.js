import { DurableObject } from 'cloudflare:workers';
import {
  SIZES, LIVES, BOOM_PENALTY_MS, FLAG, newField, newVis, reveal, chord, toggleFlag, openedCount, safeTotal, cleared,
} from '../public/do-min/logic.js';
import { uniqueName, otherNames } from './names.js';

const MAX_PLAYERS = 4;
const MAX_ONLINE = 8;
const MODES = ['coop', 'race'];

// Phòng Dò mìn. Vị trí mìn (field) CHỈ nằm ở server; client nhận ô đã mở qua 'grid' / 'open'.
//   coop: cả phòng một bàn (unit 'all'), chung 3 mạng, thấy chuột + ping nhau.
//   race: mỗi người một bàn cùng đề (unit = id người), đạp mìn +10 giây, ai mở hết trước thắng.
// ponytail: lobby/join/host lặp lại gần giống MinerRoom; gom thành base class khi có game thứ 4 dùng phòng.
const fresh = () => ({
  status: 'lobby', mode: 'coop', size: 0, order: [], players: {}, field: null, units: {},
  startedAt: 0, endedAt: 0, winner: null,
});

export class MineRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rate = {};
    ctx.blockConcurrencyWhile(async () => {
      this.s = { ...fresh(), ...(await ctx.storage.get('s')) };
    });
  }

  async fetch(req) {
    const q = new URL(req.url).searchParams;
    const id = q.get('id') ?? '';
    const name = (q.get('name') ?? '').trim().slice(0, 20) || 'Người chơi';
    const [client, server] = Object.values(new WebSocketPair());
    const s = this.s;
    const reject = (msg) => {
      server.accept();
      server.send(JSON.stringify({ t: 'error', msg }));
      server.close(4001, 'rejected');
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!/^[\w-]{8,64}$/.test(id)) return reject(['Thiết bị không hợp lệ', 'Invalid device']);
    let p = s.players[id];
    if (!p) {
      const online = this.onlineIds();
      if (online.size >= MAX_ONLINE) return reject(['Phòng đông quá rồi', 'Room is full']);
      const playing = [...online].filter((i) => s.players[i] && !s.players[i].spec).length;
      p = s.players[id] = { id, name, booms: 0, opened: 0, spec: s.status === 'playing' || playing >= MAX_PLAYERS };
      s.order.push(id);
    }
    p.name = uniqueName(name, otherNames(s.players, id));
    p.user = JSON.parse(req.headers.get('X-User') || 'null');
    for (const ws of this.sockets()) if (ws.deserializeAttachment()?.id === id) ws.close(4000, 'replaced');
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });
    await this.save();
    this.broadcast();
    this.sendGrids(server);
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
      case 'config':
        if (!isHost || !lobby) return;
        if (MODES.includes(m.mode)) s.mode = m.mode;
        if (Number.isInteger(m.size) && SIZES[m.size]) s.size = m.size;
        break;
      case 'start':
        if (isHost && lobby) await this.start();
        return;
      case 'open':
      case 'chord':
      case 'flag':
        await this.act(p, m.t, m.i);
        return;
      case 'cur':
      case 'ping': {
        // Chỉ để đồng đội cùng bàn thấy, không lưu.
        const uid = this.unitOf(p), size = SIZES[s.size];
        if (s.status !== 'playing' || !s.units[uid]) return;
        if (m.t === 'ping' && (!Number.isInteger(m.i) || m.i < 0 || m.i >= size.rows * size.cols || !this.allow(p.id, 400))) return;
        if (m.t === 'cur' && m.p !== null && !(Array.isArray(m.p) && m.p.every(Number.isFinite))) return;
        this.toUnit(uid, m.t === 'cur' ? { t: 'cur', id: p.id, p: m.p } : { t: 'ping', id: p.id, i: m.i }, ws);
        return;
      }
      default:
        return;
    }
    await this.save();
    this.broadcast();
  }

  async act(p, kind, i) {
    const s = this.s;
    const size = SIZES[s.size];
    const uid = this.unitOf(p), u = s.units[uid];
    if (s.status !== 'playing' || !u || u.done || !Number.isInteger(i) || i < 0 || i >= size.rows * size.cols) return;
    if (kind === 'flag') {
      const on = toggleFlag(u.vis, i);
      if (on === null) return;
      this.toUnit(uid, { t: 'open', unit: uid, cells: [[i, on ? FLAG : -1]], by: p.id });
      return; // cờ không đổi tiến độ -> khỏi lưu/broadcast (rẻ)
    }
    const res = (kind === 'chord' ? chord : reveal)(s.field, u.vis, i, size.rows, size.cols);
    if (!res.opened.length) return;
    p.opened += res.opened.filter(([, v]) => v >= 0).length;
    if (res.boom) {
      p.booms++;
      u.booms++;
      if (s.mode === 'coop') u.lives--;
      else u.penalty += BOOM_PENALTY_MS;
      // Ô mìn vừa nổ coi như đã đánh dấu: chơi tiếp được (không phải mở lại).
    }
    this.toUnit(uid, { t: 'open', unit: uid, cells: res.opened, by: p.id, boom: res.boom });
    if (cleared(u.vis, size)) { u.done = 'clear'; u.time = Date.now() - s.startedAt + u.penalty; }
    else if (s.mode === 'coop' && u.lives <= 0) u.done = 'dead';
    const units = Object.values(s.units);
    if (s.mode === 'coop' ? u.done : u.done === 'clear') return this.finish(u.done === 'clear' ? uid : null);
    if (units.every((x) => x.done)) return this.finish(null);
    await this.save();
    this.broadcast();
  }

  async start() {
    const s = this.s;
    const online = this.onlineIds();
    s.order = s.order.filter((i) => online.has(i));
    for (const id of Object.keys(s.players)) if (!online.has(id)) delete s.players[id];
    s.order.forEach((id, i) => Object.assign(s.players[id], { booms: 0, opened: 0, spec: i >= MAX_PLAYERS }));
    const size = SIZES[s.size];
    // Ô xuất phát ngẫu nhiên, rải mìn chừa quanh nó rồi mở sẵn cho mọi bàn -> cùng vạch xuất phát.
    const safe = Math.floor(Math.random() * size.rows * size.cols);
    s.field = newField(size, safe);
    s.units = {};
    for (const id of s.order) {
      const uid = this.unitOf(s.players[id]);
      if (uid && !s.units[uid]) {
        const vis = newVis(size.rows, size.cols);
        reveal(s.field, vis, safe, size.rows, size.cols);
        s.units[uid] = { vis, lives: LIVES, booms: 0, penalty: 0, done: null, time: 0 };
      }
    }
    Object.assign(s, { status: 'playing', startedAt: Date.now(), endedAt: 0, winner: null });
    await this.save();
    this.broadcast();
    for (const ws of this.sockets()) this.sendGrids(ws);
  }

  async finish(winner) {
    const s = this.s;
    Object.assign(s, { status: 'ended', endedAt: Date.now(), winner });
    await this.save();
    this.broadcast();
    // Ván xong: gửi đủ bàn + lộ hết mìn cho mọi người xem (không còn gì để gian lận).
    for (const ws of this.sockets()) this.sendGrids(ws);
    const plays = s.order.filter((id) => s.players[id].user && this.unitOf(s.players[id])).map((id) => {
      const p = s.players[id], uid = this.unitOf(p), u = s.units[uid];
      const secs = Math.round((u.time || s.endedAt - s.startedAt + u.penalty) / 1000);
      return {
        sub: p.user.sub, name: p.user.name, game: 'do-min', mode: s.mode, score: secs, level: s.size + 1,
        won: s.mode === 'coop' ? u.done === 'clear' : winner === uid,
        detail: JSON.stringify({ opened: p.opened, booms: p.booms, size: SIZES[s.size].name }),
      };
    });
    try { if (plays.length) await this.env.TOP.get(this.env.TOP.idFromName('global')).addPlays(plays); } catch {}
  }

  async webSocketClose(ws) {
    const s = this.s;
    const id = ws.deserializeAttachment()?.id;
    const online = this.onlineIds(ws);
    if (s.status === 'lobby' && id && !online.has(id)) {
      s.order = s.order.filter((i) => i !== id);
      delete s.players[id];
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

  unitOf(p) {
    if (!p || p.spec) return null;
    return this.s.mode === 'coop' ? 'all' : p.id;
  }

  // Chỉ gửi bàn người này được xem: đua cùng đề mà thấy bàn đối thủ là chép được ô an toàn,
  // nên đua chỉ nhận bàn mình (khán giả / ván đã xong thì xem hết).
  sendGrids(ws) {
    const s = this.s;
    if (s.status === 'lobby' || !s.field) return;
    const p = s.players[ws.deserializeAttachment()?.id];
    const mine = this.unitOf(p);
    const all = s.status === 'ended' || !mine || s.mode === 'coop';
    const grids = Object.fromEntries(Object.entries(s.units).filter(([uid]) => all || uid === mine).map(([uid, u]) => [uid, u.vis]));
    ws.send(JSON.stringify({ t: 'grid', grids }));
    if (s.status === 'ended') ws.send(JSON.stringify({ t: 'reveal', mines: s.field.mines.flatMap((v, i) => (v ? [i] : [])) }));
  }

  // Gửi cho người cùng bàn uid + khán giả (không lộ bàn cho đối thủ khi đua).
  toUnit(uid, msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets(except)) {
      const p = this.s.players[ws.deserializeAttachment()?.id];
      if (this.unitOf(p) === uid || p?.spec) try { ws.send(data); } catch {}
    }
  }

  allow(id, ms) {
    const now = Date.now();
    if (now - (this.rate[id] ?? 0) < ms) return false;
    this.rate[id] = now;
    return true;
  }

  save() { return this.ctx.storage.put('s', this.s); }
  sockets(except) { return this.ctx.getWebSockets().filter((ws) => ws !== except); }
  onlineIds(except) { return new Set(this.sockets(except).map((ws) => ws.deserializeAttachment()?.id).filter(Boolean)); }
  hostId(except) {
    const online = this.onlineIds(except);
    return this.s.order.find((id) => online.has(id) && !this.s.players[id].spec) ?? this.s.order.find((id) => online.has(id)) ?? null;
  }
  sendAll(msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets(except)) try { ws.send(data); } catch {}
  }

  broadcast(except) {
    const s = this.s;
    const online = this.onlineIds(except);
    const size = SIZES[s.size];
    this.sendAll({
      t: 'state', status: s.status, mode: s.mode, size: s.size, startedAt: s.startedAt, endedAt: s.endedAt,
      now: Date.now(), winner: s.winner, host: this.hostId(except),
      units: Object.fromEntries(Object.entries(s.units).map(([uid, u]) => [uid, {
        opened: openedCount(u.vis), total: safeTotal(size), lives: u.lives, booms: u.booms, penalty: u.penalty,
        done: u.done, time: u.time,
      }])),
      players: s.order.map((id) => {
        const p = s.players[id];
        return { id, name: p.name, spec: p.spec, online: online.has(id), unit: this.unitOf(p), opened: p.opened, booms: p.booms };
      }),
    }, except);
  }
}


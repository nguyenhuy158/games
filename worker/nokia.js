import { DurableObject } from 'cloudflare:workers';
import { uniqueName, otherNames } from './names.js';
import snake from './nokia/snake.js';
import bantumi from './nokia/bantumi.js';
import pairs from './nokia/pairs.js';
import logic from './nokia/logic.js';
import rapid from './nokia/rapid-roll.js';
import space from './nokia/space-impact.js';
import bounce from './nokia/bounce.js';
import oAnQuan from './nokia/o-an-quan.js';

// Một DO cho mọi game Nokia (và các game lượt 1v1 khác như Ô ăn quan): /api/nk/<game>/room/CODE -> NokiaRoom tên "<game>:<CODE>".
// Phòng lo phần chung (người chơi, chủ phòng, sảnh chờ, gửi trạng thái, lưu lịch sử); mỗi game chỉ là một module:
//   { name, max, cfg: {mặc định}, config(cfg, m) -> cfg mới | null, start(ctx), msg(ctx, p, m) -> true nếu đổi,
//     tickMs? (số hoặc hàm của cfg), tick?(ctx) -> true nếu đổi, view(ctx, id) -> dữ liệu gửi người id, volatile? (không lưu g lúc chơi) }
// Chữ gửi cho người chơi (lỗi, tiêu đề kết quả) là cặp ['vi', 'en'], client chọn bằng tx() (public/i18n.js).
// ctx = { g (trạng thái game), cfg, seats (id người chơi), players, now(), rand(), end(result), send(id, msg) }
// end({ ranks: [{ id, score, won }], level?, mode? }) -> kết thúc ván, lưu lịch sử người đã đăng nhập.
export const GAMES = Object.fromEntries(Object.entries({ snake, bantumi, pairs, logic, 'rapid-roll': rapid, 'space-impact': space, bounce, 'o-an-quan': oAnQuan }).filter(([, m]) => m));
const MAX_ONLINE = 12;

export class NokiaRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get('s')) ?? null;
      // DO bị tạo lại giữa ván (bị dừng / deploy): bật lại nhịp để máy đánh + hết giờ vẫn chạy.
      if (this.s && !GAMES[this.s.game]) this.s = null;
      if (this.s?.status === 'playing') this.arm();
    });
  }

  fresh(game) {
    const mod = GAMES[game];
    return { game, status: 'lobby', order: [], players: {}, cfg: { ...mod.cfg }, seats: [], g: null, result: null };
  }

  get mod() { return GAMES[this.s.game]; }

  async fetch(req) {
    const url = new URL(req.url);
    const game = url.searchParams.get('game');
    const id = url.searchParams.get('id') ?? '';
    const name = (url.searchParams.get('name') ?? '').trim().slice(0, 20) || 'Người chơi';
    const [client, server] = Object.values(new WebSocketPair());
    const reject = (msg) => {
      server.accept();
      server.send(JSON.stringify({ t: 'error', msg }));
      server.close(4001, 'rejected');
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!GAMES[game]) return reject(['Không có game này', 'No such game']);
    if (!/^[\w-]{8,64}$/.test(id)) return reject(['Thiết bị không hợp lệ', 'Invalid device']);
    if (!this.s || this.s.game !== game) this.s = this.fresh(game);
    const s = this.s;
    if (!s.players[id]) {
      if (this.onlineIds().size >= MAX_ONLINE) return reject(['Phòng đông quá rồi', 'This room is full']);
      s.players[id] = { id, name };
      s.order.push(id);
    }
    const p = s.players[id];
    p.name = uniqueName(name, otherNames(s.players, id));
    p.user = JSON.parse(req.headers.get('X-User') || 'null');
    for (const ws of this.sockets()) if (ws.deserializeAttachment()?.id === id) ws.close(4000, 'replaced');
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });
    await this.save();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const s = this.s;
    const p = s?.players[ws.deserializeAttachment()?.id];
    if (!p) return;
    const isHost = this.hostId() === p.id;
    const lobby = s.status !== 'playing';
    if (m.t === 'config') {
      if (!isHost || !lobby) return;
      const cfg = this.mod.config?.(s.cfg, m.cfg ?? {});
      if (!cfg) return;
      s.cfg = cfg;
    } else if (m.t === 'start') {
      if (!isHost || !lobby) return;
      this.start();
    } else if (m.t === 'g') {
      if (s.status !== 'playing' || !this.mod.msg(this.ctxFor(), p, m)) return;
    } else return;
    await this.save();
    this.broadcast();
  }

  start() {
    const s = this.s;
    const online = this.onlineIds();
    s.order = s.order.filter((i) => online.has(i));
    for (const id of Object.keys(s.players)) if (!online.has(id)) delete s.players[id];
    s.seats = s.order.slice(0, this.mod.max);
    Object.assign(s, { status: 'playing', g: {}, result: null, startedAt: Date.now() });
    this.mod.start(this.ctxFor());
    this.arm();
  }

  arm() {
    clearInterval(this.timer);
    const ms = typeof this.mod.tickMs === 'function' ? this.mod.tickMs(this.s.cfg) : this.mod.tickMs;
    if (ms) this.timer = setInterval(() => this.onTick(), ms);
  }

  onTick() {
    const s = this.s;
    if (s?.status !== 'playing') return clearInterval(this.timer);
    if (this.mod.tick(this.ctxFor())) {
      if (!this.mod.volatile) this.save();
      this.broadcast();
    }
  }

  // Ngữ cảnh đưa cho module game.
  ctxFor() {
    const s = this.s;
    return {
      g: s.g, cfg: s.cfg, seats: s.seats, players: s.players, now: () => Date.now(),
      rand: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
      name: (id) => s.players[id]?.name ?? '',
      online: () => this.onlineIds(),
      end: (result) => this.finish(result),
      send: (id, msg) => { for (const ws of this.sockets()) if (ws.deserializeAttachment()?.id === id) try { ws.send(JSON.stringify(msg)); } catch {} },
      sendAll: (msg) => { const d = JSON.stringify(msg); for (const ws of this.sockets()) try { ws.send(d); } catch {} },
    };
  }

  finish(result) {
    const s = this.s;
    clearInterval(this.timer);
    s.status = 'ended';
    s.result = { ...result, ranks: result.ranks.map((r) => ({ ...r, name: s.players[r.id]?.name ?? r.name ?? '' })) };
    const plays = result.ranks.filter((r) => s.players[r.id]?.user).map((r) => ({
      sub: s.players[r.id].user.sub, name: s.players[r.id].user.name, game: s.game, mode: result.mode ?? (s.seats.length > 1 ? 'multi' : 'solo'),
      score: r.score ?? 0, level: result.level ?? 1, won: !!r.won,
      detail: JSON.stringify({ rank: result.ranks.indexOf(r) + 1, of: result.ranks.length }),
    }));
    if (plays.length && this.env.TOP) this.env.TOP.get(this.env.TOP.idFromName('global')).addPlays(plays).catch(() => {});
  }

  async webSocketClose(ws) {
    const s = this.s;
    if (!s) return;
    const id = ws.deserializeAttachment()?.id;
    const online = this.onlineIds(ws);
    if (s.status !== 'playing' && id && !online.has(id)) {
      s.order = s.order.filter((i) => i !== id);
      delete s.players[id];
    }
    if (!online.size) {
      clearInterval(this.timer);
      this.s = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    this.mod.leave?.(this.ctxFor(), id);
    await this.save();
    this.broadcast(ws);
  }

  webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  save() {
    const s = this.s;
    if (!s) return;
    // Game thời gian thực: không ghi g mỗi nhịp (chỉ sống trong bộ nhớ khi đang chơi).
    return this.ctx.storage.put('s', this.mod.volatile && s.status === 'playing' ? { ...s, g: null, status: 'lobby' } : s);
  }
  sockets(except) { return this.ctx.getWebSockets().filter((ws) => ws !== except); }
  onlineIds(except) { return new Set(this.sockets(except).map((ws) => ws.deserializeAttachment()?.id).filter(Boolean)); }
  hostId(except) {
    const online = this.onlineIds(except);
    return this.s.order.find((id) => online.has(id)) ?? null;
  }

  // Mỗi người nhận view riêng (game có thông tin ẩn như Pairs / Logic).
  broadcast(except) {
    const s = this.s;
    const online = this.onlineIds(except);
    const base = {
      t: 'state', game: s.game, status: s.status, cfg: s.cfg, host: this.hostId(except), now: Date.now(), result: s.result,
      seats: s.seats, players: s.order.filter((id) => online.has(id)).map((id) => ({ id, name: s.players[id].name })),
    };
    const ctx = this.ctxFor();
    for (const ws of this.sockets(except)) {
      const id = ws.deserializeAttachment()?.id;
      try { ws.send(JSON.stringify({ ...base, view: s.g ? this.mod.view(ctx, id) : null })); } catch {}
    }
  }
}

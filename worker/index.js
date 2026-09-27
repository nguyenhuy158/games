import { DurableObject } from 'cloudflare:workers';
import { ROWS, COLS, newBoard, findPath, findPair, reshuffle, countLeft } from '../public/logic.js';

const MAX_PLAYERS = 4;
const DURATION = 6 * 60 * 1000;
const SHUFFLES = 5;
const PAIR_SCORE = 10;

export default {
  fetch(req, env) {
    const m = new URL(req.url).pathname.match(/^\/api\/room\/([A-Z0-9]{4})$/);
    if (!m || req.headers.get('Upgrade') !== 'websocket') return new Response('Not found', { status: 404 });
    return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
  },
};

const fresh = () => ({ status: 'lobby', order: [], players: {}, endAt: 0, winner: null });
const isCell = (p) =>
  Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) &&
  p[0] >= 1 && p[0] <= ROWS && p[1] >= 1 && p[1] <= COLS;

// Một phòng = một Durable Object. Người chơi ẩn danh, định danh bằng deviceId
// (UUID lưu localStorage phía client). Mỗi người chơi trên bàn riêng nhưng cùng
// một đề; server giữ bàn thật và kiểm lại mọi nước đi.
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get('s')) ?? fresh();
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
      if (s.status === 'playing') return reject('Phòng đang chơi, đợi ván sau nhé');
      // Đếm người đang online: người rời sau ván cũ không giữ chỗ (start() tự loại).
      if (this.onlineIds().size >= MAX_PLAYERS) return reject(`Phòng đã đủ ${MAX_PLAYERS} người`);
      p = s.players[id] = { id, name, score: 0, board: null, shuffles: SHUFFLES };
      s.order.push(id);
    }
    p.name = name;

    // Cùng thiết bị mở tab mới -> tab cũ nhường chỗ.
    for (const ws of this.sockets()) if (ws.deserializeAttachment()?.id === id) ws.close(4000, 'replaced');
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });

    await this.save();
    if (s.status !== 'lobby' && p.board) this.sendBoard(server, p);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const s = this.s;
    const p = s.players[ws.deserializeAttachment()?.id];
    if (!p) return;

    if (m.t === 'start') {
      if (this.hostId() === p.id && s.status !== 'playing') await this.start();
    } else if (m.t === 'pick') {
      if (s.status !== 'playing' || !isCell(m.a) || !isCell(m.b)) return;
      if (!findPath(p.board, m.a, m.b)) return this.sendBoard(ws, p); // client lệch -> đồng bộ lại
      p.board[m.a[0]][m.a[1]] = p.board[m.b[0]][m.b[1]] = 0;
      p.score += PAIR_SCORE;
      if (!countLeft(p.board)) return this.finish(p.id);
      if (!findPair(p.board)) { reshuffle(p.board); this.sendBoard(ws, p); }
      await this.save();
      this.broadcast();
    } else if (m.t === 'shuffle') {
      if (s.status !== 'playing' || p.shuffles <= 0) return;
      p.shuffles--;
      reshuffle(p.board);
      this.sendBoard(ws, p);
      await this.save();
      this.broadcast();
    }
  }

  async webSocketClose(ws) {
    const s = this.s;
    const id = ws.deserializeAttachment()?.id;
    const online = this.onlineIds(ws);
    // Ở sảnh chờ thì ai rời là mất chỗ, nhường cho người khác vào.
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

  async alarm() {
    if (this.s.status === 'playing') await this.finish(null);
  }

  async start() {
    const s = this.s;
    const online = this.onlineIds();
    s.order = s.order.filter((i) => online.has(i));
    const board = newBoard();
    const players = {};
    for (const id of s.order) {
      players[id] = { ...s.players[id], score: 0, board: board.map((r) => r.slice()), shuffles: SHUFFLES };
    }
    s.players = players;
    s.status = 'playing';
    s.endAt = Date.now() + DURATION;
    s.winner = null;
    await this.ctx.storage.setAlarm(s.endAt);
    await this.save();
    for (const ws of this.sockets()) {
      const p = s.players[ws.deserializeAttachment()?.id];
      if (p) this.sendBoard(ws, p, true);
    }
    this.broadcast();
  }

  async finish(winnerId) {
    const s = this.s;
    s.status = 'ended';
    s.winner = winnerId ?? s.order.reduce((best, id) => (s.players[id].score > (s.players[best]?.score ?? -1) ? id : best), null);
    await this.ctx.storage.deleteAlarm();
    await this.save();
    this.broadcast();
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
    return this.s.order.find((id) => online.has(id)) ?? null;
  }

  sendBoard(ws, p, isNew = false) {
    ws.send(JSON.stringify({ t: 'board', board: p.board, shuffles: p.shuffles, isNew }));
  }

  broadcast(except) {
    const s = this.s;
    const online = this.onlineIds(except);
    const msg = JSON.stringify({
      t: 'state',
      status: s.status,
      endAt: s.endAt,
      duration: DURATION,
      now: Date.now(),
      winner: s.winner,
      host: this.hostId(except),
      players: s.order.map((id) => {
        const p = s.players[id];
        return { id, name: p.name, score: p.score, left: p.board ? countLeft(p.board) / 2 : 0, shuffles: p.shuffles, online: online.has(id) };
      }),
    });
    for (const ws of this.sockets(except)) {
      try { ws.send(msg); } catch {}
    }
  }
}

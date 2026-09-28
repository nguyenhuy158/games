import { DurableObject } from 'cloudflare:workers';
import { SIZES, winLine, full, botMove } from '../public/co-caro/logic.js';
import * as C4 from '../public/noi-4/logic.js';
import { uniqueName, otherNames } from './names.js';

const MAX_ONLINE = 12;
const TURN_MS = 30_000; // hết giờ một nước = thua
const BOT_MS = 600; // máy "suy nghĩ" chút cho tự nhiên
const EMO_COUNT = 5;
const BOT = 'bot';

// Luật riêng từng game đánh theo lượt 1v1; phần phòng (ghế, lượt, giờ, máy, người xem) dùng chung.
// move nhận `m.i` từ client: caro = ô, nối 4 = cột (quân rơi xuống ô trống thấp nhất). -1 = nước không hợp lệ.
const RULES = {
  caro: {
    cells: (s) => SIZES[s.size] ** 2,
    place: (s, i) => (Number.isInteger(i) && i >= 0 && i < s.board.length && !s.board[i] ? i : -1),
    win: (s, i) => winLine(s.board, SIZES[s.size], i, s.block),
    bot: (s) => botMove(s.board, SIZES[s.size], s.turn),
    history: (s) => ({ game: 'co-caro', level: SIZES[s.size], block: s.block }),
  },
  c4: {
    cells: () => C4.ROWS * C4.COLS,
    place: (s, c) => (Number.isInteger(c) && c >= 0 && c < C4.COLS ? C4.drop(s.board, c) : -1),
    win: (s, i) => C4.winLine(s.board, i),
    bot: (s) => C4.drop(s.board, C4.botMove(s.board, s.turn, Math.random, s.level)),
    history: (s) => ({ game: 'noi-4', level: s.level }),
  },
};

// Phòng Cờ caro / Nối 4 (Worker chọn game qua header X-Game, id DO của nối 4 có tiền tố "c4:").
// 2 người đầu (theo thứ tự vào) cầm quân 1 / 2, còn lại xem. Ở một mình thì đánh với máy.
// Mỗi ván mới đổi người đi trước (quân 1 luôn đi trước, nên hai người đổi quân cho nhau).
const fresh = () => ({
  game: '', status: 'lobby', size: 0, block: false, level: 1, order: [], players: {}, seats: [null, null], score: {},
  board: null, turn: 1, last: -1, moves: 0, line: null, winner: 0, why: '', deadline: 0, swap: false,
});

export class CaroRoom extends DurableObject {
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
    if (!s.game) s.game = req.headers.get('X-Game') === 'c4' ? 'c4' : 'caro';
    if (!/^[\w-]{8,64}$/.test(id)) return this.reject(server, client, ['Thiết bị không hợp lệ', 'Invalid device']);
    if (!s.players[id]) {
      if (this.onlineIds().size >= MAX_ONLINE) return this.reject(server, client, ['Phòng đông quá rồi', 'Room is full']);
      s.players[id] = { id, name };
      s.order.push(id);
    }
    const p = s.players[id];
    p.name = uniqueName(name, otherNames(s.players, id));
    p.user = JSON.parse(req.headers.get('X-User') || 'null');
    for (const ws of this.sockets()) if (ws.deserializeAttachment()?.id === id) ws.close(4000, 'replaced');
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });
    await this.tick();
    await this.save();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  reject(server, client, msg) {
    server.accept();
    server.send(JSON.stringify({ t: 'error', msg }));
    server.close(4001, 'rejected');
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const s = this.s;
    const p = s.players[ws.deserializeAttachment()?.id];
    if (!p) return;
    await this.tick();
    const isHost = this.hostId() === p.id;
    const lobby = s.status !== 'playing';

    switch (m.t) {
      case 'config':
        if (!isHost || !lobby) return;
        if (s.game === 'c4') { if (Number.isInteger(m.level) && C4.LEVELS[m.level]) s.level = m.level; break; }
        if (Number.isInteger(m.size) && SIZES[m.size]) s.size = m.size;
        if (typeof m.block === 'boolean') s.block = m.block;
        break;
      case 'start':
        if (!isHost || !lobby) return;
        this.start();
        break;
      case 'move': {
        const seat = s.seats.indexOf(p.id) + 1;
        if (s.status !== 'playing' || seat !== s.turn) return;
        const i = this.rules().place(s, m.i);
        if (i < 0) return;
        await this.move(i);
        return;
      }
      case 'emo':
        // Cảm xúc: chỉ phát lại, không lưu.
        if (!Number.isInteger(m.e) || m.e < 0 || m.e >= EMO_COUNT || !this.allow(p.id, 700)) return;
        this.sendAll({ t: 'emo', id: p.id, e: m.e });
        return;
      default:
        return;
    }
    await this.save();
    this.broadcast();
  }

  start() {
    const s = this.s;
    const online = this.onlineIds();
    s.order = s.order.filter((i) => online.has(i));
    for (const id of Object.keys(s.players)) if (!online.has(id)) delete s.players[id];
    const two = s.order.slice(0, 2);
    // Cặp đấu đổi -> điểm cặp cũ bỏ đi.
    const pair = [...two].sort().join('|') || BOT;
    if (s.pair !== pair) { s.score = {}; s.pair = pair; s.swap = false; }
    const seats = two.length === 2 ? two : [two[0], BOT];
    s.seats = s.swap ? [seats[1], seats[0]] : seats;
    s.swap = !s.swap;
    Object.assign(s, { status: 'playing', board: new Array(this.rules().cells(s)).fill(0), turn: 1, last: -1, moves: 0, line: null, winner: 0, why: '' });
    this.arm();
  }

  async move(i) {
    const s = this.s;
    s.board[i] = s.turn;
    s.last = i;
    s.moves++;
    const line = this.rules().win(s, i);
    if (line) return this.finish(s.turn, 'five', line);
    if (full(s.board)) return this.finish(0, 'full');
    s.turn = 3 - s.turn;
    this.arm();
    await this.save();
    this.broadcast();
  }

  // Hẹn giờ nước hiện tại (máy thì đánh sau BOT_MS). tick() kiểm tra lại khi DO bị tắt giữa chừng.
  arm() {
    const s = this.s;
    const bot = s.seats[s.turn - 1] === BOT;
    s.deadline = Date.now() + (bot ? BOT_MS : TURN_MS);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick().then(() => this.save()).then(() => this.broadcast()), s.deadline - Date.now() + 20);
  }

  async tick() {
    const s = this.s;
    if (s.status !== 'playing' || Date.now() < s.deadline) return;
    if (s.seats[s.turn - 1] === BOT) return this.move(this.rules().bot(s));
    return this.finish(3 - s.turn, 'timeout');
  }

  async finish(winner, why, line = null) {
    const s = this.s;
    clearTimeout(this.timer);
    Object.assign(s, { status: 'ended', winner, why, line, deadline: 0 });
    if (winner) { const w = s.seats[winner - 1]; s.score[w] = (s.score[w] ?? 0) + 1; }
    await this.save();
    this.broadcast();
    const vsBot = s.seats.includes(BOT);
    const { game, level, ...extra } = this.rules().history(s);
    const plays = s.seats.map((id, k) => [id, k + 1]).filter(([id]) => s.players[id]?.user).map(([id, seat]) => {
      const p = s.players[id], opp = s.seats[2 - seat];
      return {
        sub: p.user.sub, name: p.user.name, game, mode: vsBot ? 'bot' : 'pvp', score: s.moves, level,
        won: winner === seat, detail: JSON.stringify({ vs: opp === BOT ? 'Máy' : s.players[opp]?.name, ...extra, why }),
      };
    });
    try { if (plays.length) await this.env.TOP.get(this.env.TOP.idFromName('global')).addPlays(plays); } catch {}
  }

  async webSocketClose(ws) {
    const s = this.s;
    const id = ws.deserializeAttachment()?.id;
    const online = this.onlineIds(ws);
    if (s.status !== 'playing' && id && !online.has(id)) {
      s.order = s.order.filter((i) => i !== id);
      delete s.players[id];
    }
    if (!online.size && s.status !== 'playing') {
      clearTimeout(this.timer);
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

  allow(id, ms) {
    const now = Date.now();
    if (now - (this.rate[id] ?? 0) < ms) return false;
    this.rate[id] = now;
    return true;
  }

  rules() { return RULES[this.s.game] ?? RULES.caro; }
  save() { return this.ctx.storage.put('s', this.s); }
  sockets(except) { return this.ctx.getWebSockets().filter((ws) => ws !== except); }
  onlineIds(except) { return new Set(this.sockets(except).map((ws) => ws.deserializeAttachment()?.id).filter(Boolean)); }
  hostId(except) {
    const online = this.onlineIds(except);
    return this.s.order.find((id) => online.has(id)) ?? null;
  }
  sendAll(msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets(except)) try { ws.send(data); } catch {}
  }

  broadcast(except) {
    const s = this.s;
    const online = this.onlineIds(except);
    this.sendAll({
      t: 'state', status: s.status, size: s.size, block: s.block, level: s.level, board: s.board, turn: s.turn, last: s.last, moves: s.moves,
      line: s.line, winner: s.winner, why: s.why, deadline: s.deadline, now: Date.now(), turnMs: TURN_MS,
      host: this.hostId(except), seats: s.seats, score: s.score,
      // Tên người cầm quân (kể cả khi họ vừa rớt mạng giữa ván).
      names: s.seats.map((id) => (id === BOT ? 'Máy' : s.players[id]?.name ?? '')),
      players: s.order.filter((id) => online.has(id)).map((id) => ({ id, name: s.players[id].name })),
    }, except);
  }
}

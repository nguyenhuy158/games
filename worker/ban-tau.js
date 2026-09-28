import { DurableObject } from 'cloudflare:workers';
import { N, SUNK, randomFleet, validFleet, shoot, botShot } from '../public/ban-tau/logic.js';
import { uniqueName, otherNames } from './names.js';

const MAX_ONLINE = 12;
const PLACE_MS = 60_000; // hết giờ xếp tàu thì vào trận với cách xếp đang có
const TURN_MS = 30_000; // hết giờ một lượt: bắn giùm 1 phát ngẫu nhiên; 3 lượt liền như vậy = thua
const AFK_LIMIT = 3;
const BOT_MS = 700;
const EMO_COUNT = 5;
const BOT = 'bot';

// Phòng Bắn tàu. 2 người đầu vào cầm hạm đội, còn lại xem; ở một mình thì đấu với máy.
// Mỗi ván: xếp tàu (ngẫu nhiên, xếp lại hoặc tự dời / xoay từng chiếc) -> cả hai sẵn sàng -> bắn luân phiên, trúng thì bắn tiếp.
// Vị trí tàu chỉ gửi cho chủ hạm đội (người xem / đối thủ chỉ thấy ô đã bắn) tới khi hết ván.
const fresh = () => ({
  status: 'lobby', order: [], players: {}, seats: [null, null], score: {}, pair: '', swap: false,
  fleets: [null, null], shots: [null, null], ready: [false, false], fired: [0, 0], afk: [0, 0],
  turn: 1, last: null, winner: 0, why: '', deadline: 0,
});

export class ShipRoom extends DurableObject {
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
    if (!/^[\w-]{8,64}$/.test(id)) return this.reject(server, client, 'Thiết bị không hợp lệ');
    if (!s.players[id]) {
      if (this.onlineIds().size >= MAX_ONLINE) return this.reject(server, client, 'Phòng đông quá rồi');
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
    const seat = s.seats.indexOf(p.id) + 1;

    switch (m.t) {
      case 'start':
        if (this.hostId() !== p.id || s.status === 'placing' || s.status === 'playing') return;
        this.start();
        break;
      case 'reroll':
        if (s.status !== 'placing' || !seat || s.ready[seat - 1] || !this.allow(p.id, 250)) return;
        s.fleets[seat - 1] = randomFleet();
        break;
      case 'place':
        // Tự xếp: client gửi cả hạm đội, server kiểm lại luật (không tin client).
        if (s.status !== 'placing' || !seat || s.ready[seat - 1] || !validFleet(m.ships)) return;
        s.fleets[seat - 1] = m.ships.map((ship) => [...ship]);
        break;
      case 'ready':
        if (s.status !== 'placing' || !seat) return;
        s.ready[seat - 1] = true;
        if (s.ready.every(Boolean)) this.begin();
        break;
      case 'shoot':
        if (s.status !== 'playing' || seat !== s.turn) return;
        s.afk[seat - 1] = 0;
        await this.fire(m.i);
        return;
      case 'emo':
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
    const pair = [...two].sort().join('|') || BOT;
    if (s.pair !== pair) { s.score = {}; s.pair = pair; s.swap = false; }
    const seats = two.length === 2 ? two : [two[0], BOT];
    // Ghế 1 bắn trước; mỗi ván đổi ghế để đổi người bắn trước.
    s.seats = s.swap ? [seats[1], seats[0]] : seats;
    s.swap = !s.swap;
    Object.assign(s, {
      status: 'placing', fleets: [randomFleet(), randomFleet()], shots: [null, null], fired: [0, 0], afk: [0, 0],
      ready: s.seats.map((id) => id === BOT), turn: 1, last: null, winner: 0, why: '',
    });
    this.arm(PLACE_MS);
  }

  begin() {
    const s = this.s;
    Object.assign(s, { status: 'playing', ready: [true, true], shots: [new Array(N * N).fill(0), new Array(N * N).fill(0)], turn: 1 });
    this.armTurn();
  }

  // Người cầm lượt bắn ô i. Trúng thì bắn tiếp, trượt thì đổi lượt.
  async fire(i) {
    const s = this.s;
    const k = s.turn - 1;
    const r = shoot(s.fleets[1 - k], s.shots[k], i);
    if (!r) return;
    s.fired[k]++;
    s.last = { by: s.turn, i, hit: r.hit, sunk: r.sunk };
    if (r.done) return this.finish(s.turn, 'sunk');
    if (!r.hit) s.turn = 3 - s.turn;
    this.armTurn();
    await this.save();
    this.broadcast();
  }

  armTurn() { this.arm(this.s.seats[this.s.turn - 1] === BOT ? BOT_MS : TURN_MS); }

  // Hẹn giờ pha hiện tại; tick() kiểm tra lại khi DO bị tắt giữa chừng.
  arm(ms) {
    const s = this.s;
    s.deadline = Date.now() + ms;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick().then(() => this.save()).then(() => this.broadcast()), ms + 20);
  }

  async tick() {
    const s = this.s;
    if (Date.now() < s.deadline) return;
    if (s.status === 'placing') return this.begin();
    if (s.status !== 'playing') return;
    const k = s.turn - 1;
    if (s.seats[k] === BOT) return this.fire(botShot(s.shots[k]));
    if (++s.afk[k] >= AFK_LIMIT) return this.finish(3 - s.turn, 'timeout');
    const open = s.shots[k].flatMap((v, i) => (v ? [] : [i]));
    return this.fire(open[Math.floor(Math.random() * open.length)]);
  }

  async finish(winner, why) {
    const s = this.s;
    clearTimeout(this.timer);
    Object.assign(s, { status: 'ended', winner, why, deadline: 0 });
    const w = s.seats[winner - 1];
    s.score[w] = (s.score[w] ?? 0) + 1;
    await this.save();
    this.broadcast();
    const vsBot = s.seats.includes(BOT);
    const plays = s.seats.map((id, k) => [id, k + 1]).filter(([id]) => s.players[id]?.user).map(([id, seat]) => {
      const p = s.players[id], opp = s.seats[2 - seat];
      return {
        sub: p.user.sub, name: p.user.name, game: 'ban-tau', mode: vsBot ? 'bot' : 'pvp', score: s.fired[seat - 1], level: 0,
        won: winner === seat, detail: JSON.stringify({ vs: opp === BOT ? 'Máy' : s.players[opp]?.name, why }),
      };
    });
    try { if (plays.length) await this.env.TOP.get(this.env.TOP.idFromName('global')).addPlays(plays); } catch {}
  }

  async webSocketClose(ws) {
    const s = this.s;
    const id = ws.deserializeAttachment()?.id;
    const online = this.onlineIds(ws);
    const active = s.status === 'placing' || s.status === 'playing';
    if (!active && id && !online.has(id)) {
      s.order = s.order.filter((i) => i !== id);
      delete s.players[id];
    }
    if (!online.size && !active) {
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

  // Mỗi người một bản: chỉ thấy hạm đội của mình (hết ván thì thấy hết).
  broadcast(except) {
    const s = this.s;
    const online = this.onlineIds(except);
    const base = {
      t: 'state', status: s.status, turn: s.turn, last: s.last, winner: s.winner, why: s.why, deadline: s.deadline,
      now: Date.now(), turnMs: TURN_MS, placeMs: PLACE_MS, host: this.hostId(except), seats: s.seats, score: s.score,
      ready: s.ready, shots: s.shots, fired: s.fired,
      // Tàu nào của mỗi bên đã chìm (theo thứ tự FLEET) — ai cũng biết, không lộ vị trí tàu còn nổi.
      sunk: s.fleets.map((f, k) => (f ?? []).map((ship) => !!s.shots[1 - k] && ship.every((i) => s.shots[1 - k][i] === SUNK))),
      names: s.seats.map((id) => (id === BOT ? 'Máy' : s.players[id]?.name ?? '')),
      players: s.order.filter((id) => online.has(id)).map((id) => ({ id, name: s.players[id].name })),
    };
    const ended = s.status === 'ended';
    for (const ws of this.sockets(except)) {
      const seat = s.seats.indexOf(ws.deserializeAttachment()?.id) + 1;
      const fleets = s.fleets.map((f, k) => (ended || k === seat - 1 ? f : null));
      try { ws.send(JSON.stringify({ ...base, fleets })); } catch {}
    }
  }
}

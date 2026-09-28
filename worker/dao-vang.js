import { DurableObject } from 'cloudflare:workers';
import {
  MAX_PLAYERS, VERSUS_LEVELS, teamTarget, createWorld, step, shoot, dynamite, shopOffer,
} from '../public/dao-vang/logic.js';
import { uniqueName, otherNames } from './names.js';

const TICK_MS = 50; // 20 lần/giây: đủ mượt, client nội suy phần còn lại
const SHOP_MS = 20_000;
const MAX_ONLINE = 8;
const MODES = ['coop', 'versus'];

// Phòng Đào Vàng nhiều người: server chạy vật lý thật (cùng hàm step() với bản 1 người),
// client chỉ gửi lệnh và vẽ lại theo snapshot. Cả phòng chung một mỏ.
//   coop:   quỹ tiền chung, mục tiêu x crowd(n), thua khi không đủ tiền.
//   versus: ví riêng, chơi VERSUS_LEVELS màn, nhiều tiền nhất thắng.
const fresh = () => ({
  status: 'lobby', // lobby | playing | shop | ended
  mode: 'coop', level: 1, team: 0, order: [], players: {}, world: null, shopEndsAt: 0, result: null,
});

export class MinerRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.timer = null;
    this.last = 0;
    this.lastSave = 0;
    ctx.blockConcurrencyWhile(async () => {
      this.s = { ...fresh(), ...(await ctx.storage.get('s')) };
    });
  }

  async fetch(req) {
    const q = new URL(req.url).searchParams;
    const id = q.get('id') ?? '';
    const name = (q.get('name') ?? '').trim().slice(0, 20) || 'Thợ mỏ';
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
      // Vào giữa ván (hoặc đủ người) thì xem, ván sau được chơi.
      p = s.players[id] = { id, name, money: 0, dynamite: 0, buffs: {}, spec: (s.status !== 'lobby' && s.status !== 'ended') || playing >= MAX_PLAYERS };
      s.order.push(id);
    }
    p.name = uniqueName(name, otherNames(s.players, id));
    p.user = JSON.parse(req.headers.get('X-User') || 'null'); // tài khoản SSO, null = khách
    for (const ws of this.sockets()) if (ws.deserializeAttachment()?.id === id) ws.close(4000, 'replaced');
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });
    await this.save();
    if (s.world) server.send(JSON.stringify({ t: 'world', world: s.world }));
    this.broadcast();
    this.resume();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const s = this.s;
    const p = s.players[ws.deserializeAttachment()?.id];
    if (!p) return;
    this.resume();
    const isHost = this.hostId() === p.id;

    switch (m.t) {
      case 'config':
        if (!isHost || (s.status !== 'lobby' && s.status !== 'ended') || !MODES.includes(m.mode)) return;
        s.mode = m.mode;
        break;
      case 'start':
        if (isHost && (s.status === 'lobby' || s.status === 'ended')) await this.startGame();
        return;
      case 'shoot':
        if (s.status === 'playing' && shoot(s.world, p.id)) this.sendAll({ t: 'ev', evs: [{ k: 'shoot', id: p.id }] });
        return;
      case 'dyn': {
        const e = s.status === 'playing' && dynamite(s.world, p.id);
        if (e) this.sendAll({ t: 'ev', evs: [e] });
        return;
      }
      case 'buy': {
        const offer = s.status === 'shop' && p.offer?.find((o) => o.key === m.key);
        if (!offer || p.bought?.[m.key]) return;
        const coop = s.mode === 'coop';
        if ((coop ? s.team : p.money) < offer.price) return;
        if (coop) s.team -= offer.price; else p.money -= offer.price;
        (p.bought ??= {})[m.key] = true;
        break;
      }
      case 'ready':
        if (s.status !== 'shop') return;
        p.ready = true;
        if (this.activeIds().every((id) => s.players[id].ready)) return this.nextLevel();
        break;
      default:
        return;
    }
    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws) {
    const s = this.s;
    const id = ws.deserializeAttachment()?.id;
    const online = this.onlineIds(ws);
    if (s.status === 'lobby' && id && !online.has(id)) {
      s.order = s.order.filter((i) => i !== id);
      delete s.players[id];
    }
    if (!online.size) {
      // Hết người: dừng vòng lặp, xoá phòng.
      this.stopTicking();
      this.s = fresh();
      await this.ctx.storage.deleteAll();
      return;
    }
    // Đang ở tiệm mà người còn lại đều sẵn sàng thì đi tiếp luôn.
    if (s.status === 'shop' && this.activeIds(ws).every((i) => s.players[i].ready)) return this.nextLevel();
    await this.save();
    this.broadcast(ws);
  }

  webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  async alarm() {
    // Dự phòng khi DO bị dừng giữa chừng (deploy...): hết giờ tiệm thì sang màn mới.
    if (this.s.status === 'shop' && Date.now() >= this.s.shopEndsAt) await this.nextLevel();
  }

  // ---------- vòng đời ván ----------
  async startGame() {
    const s = this.s;
    const online = this.onlineIds();
    s.order = s.order.filter((i) => online.has(i));
    for (const id of Object.keys(s.players)) if (!online.has(id)) delete s.players[id];
    s.order.forEach((id, i) => Object.assign(s.players[id], { money: 0, dynamite: 0, buffs: {}, spec: i >= MAX_PLAYERS, ready: false, bought: null, offer: null }));
    Object.assign(s, { level: 1, team: 0, result: null });
    await this.beginLevel();
  }

  async beginLevel() {
    const s = this.s;
    const players = this.activeIds().map((id) => s.players[id]);
    s.world = createWorld(s.level, players.map((p) => ({ id: p.id, dynamite: p.dynamite, buffs: p.buffs })));
    s.status = 'playing';
    await this.save();
    this.sendAll({ t: 'world', world: s.world });
    this.broadcast();
    this.startTicking();
  }

  async endLevel() {
    this.stopTicking();
    const s = this.s;
    // Thuốc nổ còn dư mang sang màn sau; đồ mua chỉ có tác dụng một màn.
    for (const m of s.world.miners) if (s.players[m.id]) s.players[m.id].dynamite = m.dynamite;
    const n = this.activeIds().length;
    const coop = s.mode === 'coop';
    const failed = coop && s.team < teamTarget(s.level, n);
    const done = !coop && s.level >= VERSUS_LEVELS;
    if (failed || done) {
      s.status = 'ended';
      const ranking = this.activeIds().map((id) => ({ id, name: s.players[id].name, money: s.players[id].money })).sort((a, b) => b.money - a.money);
      s.result = coop ? { win: false, level: s.level, team: s.team, target: teamTarget(s.level, n), ranking } : { win: true, winner: ranking[0]?.id, ranking };
      s.world = null;
      // Lịch sử cá nhân cho người đã đăng nhập. coop: màn đạt được là thành tích (luôn "thua" ở màn cuối).
      const plays = this.activeIds().filter((id) => s.players[id].user).map((id) => ({
        sub: s.players[id].user.sub, name: s.players[id].user.name, game: 'dao-vang', mode: s.mode, score: s.players[id].money, level: s.level,
        won: !coop && ranking[0]?.id === id,
        detail: JSON.stringify({ team: coop ? s.team : undefined, rank: ranking.findIndex((x) => x.id === id) + 1, of: ranking.length }),
      }));
      try { if (plays.length) await this.env.TOP.get(this.env.TOP.idFromName('global')).addPlays(plays); } catch {}
    } else {
      s.status = 'shop';
      s.shopEndsAt = Date.now() + SHOP_MS;
      for (const id of this.activeIds()) Object.assign(s.players[id], { offer: shopOffer(s.level + 1, Math.random), bought: {}, ready: false });
      await this.ctx.storage.setAlarm(s.shopEndsAt);
      this.shopTimer = setTimeout(() => this.s.status === 'shop' && this.nextLevel(), SHOP_MS);
    }
    await this.save();
    this.broadcast();
  }

  async nextLevel() {
    const s = this.s;
    if (s.status !== 'shop') return;
    // Đổi trạng thái ngay (trước await) để hẹn giờ tiệm và "sẵn sàng" không cùng mở màn 2 lần.
    s.status = 'starting';
    clearTimeout(this.shopTimer);
    this.shopTimer = null;
    await this.ctx.storage.deleteAlarm();
    for (const id of this.activeIds()) {
      const p = s.players[id];
      const b = p.bought ?? {};
      p.buffs = { strength: !!b.strength, clover: !!b.clover, rockBook: !!b.rockBook, polish: !!b.polish };
      if (b.dynamite) p.dynamite++;
      Object.assign(p, { offer: null, bought: null, ready: false });
    }
    s.level++;
    await this.beginLevel();
  }

  startTicking() {
    this.stopTicking();
    this.last = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stopTicking() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // DO bị khởi động lại giữa ván (deploy, eviction) -> chạy tiếp vòng lặp / tiệm.
  resume() {
    if (this.s.status === 'playing' && !this.timer) this.startTicking();
    if (this.s.status === 'shop' && !this.shopTimer) {
      this.shopTimer = setTimeout(() => this.s.status === 'shop' && this.nextLevel(), Math.max(0, this.s.shopEndsAt - Date.now()));
    }
  }

  tick() {
    const s = this.s;
    if (s.status !== 'playing' || !s.world) return this.stopTicking();
    const now = Date.now();
    const dt = Math.min(0.2, (now - this.last) / 1000);
    this.last = now;
    const evs = step(s.world, dt);
    let ended = false;
    for (const e of evs) {
      if (e.k === 'collect') {
        // coop: tiền vào quỹ chung; money của từng người chỉ để xem ai đóng góp nhiều.
        if (s.mode === 'coop') s.team += e.value;
        if (s.players[e.id]) s.players[e.id].money += e.value;
      }
      if (e.k === 'end') ended = true;
    }
    const out = evs.filter((e) => e.k !== 'end');
    if (out.length) this.sendAll({ t: 'ev', evs: out, money: this.moneyState() });
    this.sendAll({
      t: 'snap', time: s.world.time, wt: s.world.t,
      miners: s.world.miners.map((m) => ({
        id: m.id, a: Math.round(m.angle * 1000) / 1000, l: Math.round(m.len * 10) / 10, m: m.mode,
        h: m.held?.type ?? null, an: m.anim?.name ?? null, d: m.dynamite, s: !!m.buffs.strength,
      })),
    });
    if (ended) return this.endLevel();
    // Lưu định kỳ để deploy giữa ván không mất tiến trình.
    if (now - this.lastSave > 2000) { this.lastSave = now; this.save(); }
  }

  // ---------- tiện ích ----------
  moneyState() {
    const s = this.s;
    return { team: s.team, players: Object.fromEntries(this.activeIds().map((id) => [id, s.players[id].money])) };
  }

  activeIds(except) {
    const online = this.onlineIds(except);
    return this.s.order.filter((id) => !this.s.players[id]?.spec && (online.has(id) || this.s.world?.miners.some((m) => m.id === id)));
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
    return this.s.order.find((id) => online.has(id) && !this.s.players[id].spec) ?? this.s.order.find((id) => online.has(id)) ?? null;
  }

  sendAll(msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets(except)) try { ws.send(data); } catch {}
  }

  broadcast(except) {
    const s = this.s;
    const online = this.onlineIds(except);
    const n = this.activeIds(except).length || 1;
    this.sendAll({
      t: 'state',
      status: s.status, mode: s.mode, level: s.level, team: s.team,
      target: s.mode === 'coop' ? teamTarget(s.level, n) : null,
      versusLevels: VERSUS_LEVELS,
      shopEndsAt: s.shopEndsAt, now: Date.now(), result: s.result,
      host: this.hostId(except),
      players: s.order.map((id) => {
        const p = s.players[id];
        return {
          id, name: p.name, money: p.money, spec: p.spec, online: online.has(id), dynamite: p.dynamite,
          offer: p.offer, bought: p.bought, ready: !!p.ready,
        };
      }),
    }, except);
  }
}

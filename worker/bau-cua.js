import { DurableObject } from 'cloudflare:workers';
import { SYMBOLS, CHIPS, START_COINS, RESCUE, roll, settle, betTotal } from '../public/bau-cua/logic.js';

const MAX_ONLINE = 10;
const SHAKE_MS = 2500; // client lắc bát trong lúc này rồi mới mở
const SHOW_MS = 7000; // từ lúc bấm mở bát tới ván mới
const AFK_MS = 30_000; // cái ngồi im quá lâu thì ai cũng mở bát được
const MODES = ['rotate', 'house'];

// Phòng Bầu cua. Cược công khai; xúc xắc chỉ tung lúc mở bát (cược đã khoá) nên không có gì để gian lận.
//   house (mặc định): máy làm cái, ai cũng được đặt · rotate: người làm cái xoay vòng mỗi ván (ăn/chung bằng xu của mình).
// Ở một mình thì luôn là máy làm cái.
const fresh = () => ({
  mode: 'house', order: [], players: {}, dealerIdx: 0, phase: 'bet', phaseAt: Date.now(), round: 1,
  bets: {}, dice: null, deltas: null, dealer: null,
});

export class DiceRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
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
      s.players[id] = { id, name, coins: START_COINS, net: 0, rounds: 0, rescues: 0 };
      s.order.push(id);
    }
    const p = s.players[id];
    p.name = name;
    p.user = JSON.parse(req.headers.get('X-User') || 'null');
    for (const ws of this.sockets()) if (ws.deserializeAttachment()?.id === id) ws.close(4000, 'replaced');
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });
    await this.tick();
    this.dropDealerBets();
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
    const dealer = this.dealerId();
    const betting = s.phase === 'bet';

    switch (m.t) {
      case 'mode':
        if (!betting || this.hostId() !== p.id || !MODES.includes(m.mode)) return;
        s.mode = m.mode;
        this.dropDealerBets(); // sang xoay cái: cái mới được trả lại cược
        break;
      case 'bet': {
        if (!betting || p.id === dealer || !Number.isInteger(m.s) || !SYMBOLS[m.s] || !CHIPS.includes(m.amt)) return;
        const b = (s.bets[p.id] ??= SYMBOLS.map(() => 0));
        if (betTotal(b) + m.amt > p.coins) return;
        b[m.s] += m.amt;
        break;
      }
      case 'unbet':
        if (!betting || !s.bets[p.id]) return;
        if (Number.isInteger(m.s) && SYMBOLS[m.s]) s.bets[p.id][m.s] = 0;
        else delete s.bets[p.id];
        break;
      case 'roll': {
        if (!betting) return;
        const afk = Date.now() - s.phaseAt > AFK_MS;
        const may = dealer ? p.id === dealer : p.id === this.hostId();
        if (!may && !afk) return;
        await this.roll(dealer);
        return;
      }
      default:
        return;
    }
    await this.save();
    this.broadcast();
  }

  async roll(dealer) {
    const s = this.s;
    // Chỉ tính cược của người đang online và không phải cái.
    const online = this.onlineIds();
    const bets = Object.fromEntries(Object.entries(s.bets).filter(([id, b]) => id !== dealer && online.has(id) && betTotal(b)));
    if (!Object.keys(bets).length) return;
    const dice = roll(cryptoRand);
    const deltas = settle(bets, dice);
    if (dealer) deltas[dealer] = -Object.values(deltas).reduce((a, x) => a + x, 0);
    for (const [id, d] of Object.entries(deltas)) {
      const p = s.players[id];
      p.coins += d;
      p.net += d;
      p.rounds++;
    }
    Object.assign(s, { phase: 'show', phaseAt: Date.now(), dice, deltas, dealer, bets });
    await this.save();
    this.broadcast();
    // Ván mới tự đến; nếu DO bị tắt giữa chừng thì tick() ở lần kết nối/tin nhắn sau sẽ làm tiếp.
    setTimeout(() => this.tick().then(() => this.save()).then(() => this.broadcast()), SHOW_MS + 50);
  }

  // Hết giờ xem kết quả -> ván mới: xoay cái, xoá cược, cứu trợ người hết xu.
  async tick() {
    const s = this.s;
    if (s.phase !== 'show' || Date.now() - s.phaseAt < SHOW_MS) return;
    if (s.dealer) s.dealerIdx++;
    for (const p of Object.values(s.players)) {
      if (p.coins < CHIPS[0]) { p.coins += RESCUE; p.rescues++; }
    }
    Object.assign(s, { phase: 'bet', phaseAt: Date.now(), round: s.round + 1, bets: {}, dice: null, deltas: null, dealer: null });
  }

  async webSocketClose(ws) {
    const s = this.s;
    const id = ws.deserializeAttachment()?.id;
    const online = this.onlineIds(ws);
    const p = s.players[id];
    if (p && !online.has(id)) {
      await this.record(p);
      if (s.phase === 'bet') delete s.bets[id];
      this.dropDealerBets(ws);
    }
    if (!online.size) {
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

  // Lưu lãi/lỗ cả buổi khi rời phòng (người đã đăng nhập). Vào lại thì tính buổi mới.
  async record(p) {
    if (!p.user || !p.rounds) return;
    const row = {
      sub: p.user.sub, name: p.user.name, game: 'bau-cua', mode: this.s.mode, score: p.net, level: p.rounds, won: p.net > 0,
      detail: JSON.stringify({ coins: p.coins, rescues: p.rescues }),
    };
    p.net = 0;
    p.rounds = 0;
    try { await this.env.TOP.get(this.env.TOP.idFromName('global')).addPlays([row]); } catch {}
  }

  // Người vào/ra làm đổi cái giữa lúc cược: cái mới không được giữ cược (trả lại xu).
  dropDealerBets(except) {
    if (this.s.phase === 'bet') delete this.s.bets[this.dealerId(except)];
  }

  // Người làm cái ván này (null = máy). Cái rời phòng thì người kế tiếp lên thay.
  dealerId(except) {
    const s = this.s;
    if (s.phase === 'show') return s.dealer;
    const ids = this.onlineIds(except);
    const online = s.order.filter((id) => ids.has(id));
    if (s.mode === 'house' || online.length < 2) return null;
    return online[s.dealerIdx % online.length];
  }

  save() { return this.ctx.storage.put('s', this.s); }
  sockets(except) { return this.ctx.getWebSockets().filter((ws) => ws !== except); }
  onlineIds(except) { return new Set(this.sockets(except).map((ws) => ws.deserializeAttachment()?.id).filter(Boolean)); }
  hostId(except) {
    const online = this.onlineIds(except);
    return this.s.order.find((id) => online.has(id)) ?? null;
  }

  broadcast(except) {
    const s = this.s;
    const online = this.onlineIds(except);
    const data = JSON.stringify({
      t: 'state', mode: s.mode, phase: s.phase, phaseAt: s.phaseAt, now: Date.now(), round: s.round,
      shakeMs: SHAKE_MS, showMs: SHOW_MS, afkMs: AFK_MS,
      host: this.hostId(except), dealer: this.dealerId(except), bets: s.bets, dice: s.dice, deltas: s.deltas,
      players: s.order.filter((id) => online.has(id)).map((id) => {
        const p = s.players[id];
        return { id, name: p.name, coins: p.coins, net: p.net, rescues: p.rescues };
      }),
    });
    for (const ws of this.sockets(except)) try { ws.send(data); } catch {}
  }
}

const cryptoRand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

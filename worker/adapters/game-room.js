import { DurableObject } from 'cloudflare:workers';
import { uniqueName, otherNames } from '../names.js';

// Adapter phòng chơi dùng chung (hexagonal): Durable Object + WebSocket hibernation lo người chơi, chủ phòng, sảnh chờ,
// view riêng từng người, lưu trạng thái, hẹn giờ, ghi lịch sử, danh sách phòng công khai. Luật + diễn biến ván nằm trong
// module game (worker/games/*, hợp đồng GameModule ở worker/ports.js) — module không đụng I/O, chỉ dùng ctx.
//
//   export class NokiaRoom extends gameRoom({ snake, bantumi, ... }) {}
//
// Worker (index.js) gọi DO với header tin cậy: X-Game (key game), X-Room (mã phòng), X-User (tài khoản SSO) — header client tự gửi bị xoá trước.
// Chữ gửi cho người chơi (lỗi, tiêu đề kết quả) là cặp ['vi', 'en'], client chọn bằng tx() (public/i18n.js).
const MAX_ONLINE = 12;
const BEAT_MS = 30_000; // phòng công khai: nhịp báo "còn sống" cho danh sách phòng (Top bỏ phòng im quá 90s)

/** @param {Record<string, import('../ports.js').GameModule>} games */
export function gameRoom(games) {
  return class GameRoom extends DurableObject {
    constructor(ctx, env) {
      super(ctx, env);
      ctx.blockConcurrencyWhile(async () => {
        this.s = (await ctx.storage.get('s')) ?? null;
        // DO bị tạo lại giữa ván (bị dừng / deploy): trạng thái lạ thì bỏ; game nhịp đều thì bật lại nhịp.
        if (this.s && !games[this.s.game]) this.s = null;
        if (this.s?.status === 'playing') this.arm();
      });
    }

    // Gọi ra ngoài (Top: lịch sử, danh sách phòng) phải được chờ trước khi sự kiện kết thúc: DO ngủ đông sau khi
    // xử lý xong tin WebSocket sẽ huỷ lời gọi còn treo. io() ghi nhận, drain() chờ hết ở cuối fetch / tin / đóng / alarm.
    io(p) { (this.pending ??= []).push(p.catch(() => {})); }
    async drain() { while (this.pending?.length) await Promise.all(this.pending.splice(0)); }

    fresh(game, code) {
      return { game, code, status: 'lobby', order: [], players: {}, cfg: { ...games[game].cfg }, seats: [], g: null, result: null, pub: false, wake: 0 };
    }

    get mod() { return games[this.s.game]; }
    get slug() { return this.mod.slug ?? this.s.game; }

    async fetch(req) {
      const url = new URL(req.url);
      const game = req.headers.get('X-Game') ?? '';
      const id = url.searchParams.get('id') ?? '';
      const name = (url.searchParams.get('name') ?? '').trim().slice(0, 20) || 'Người chơi';
      const [client, server] = Object.values(new WebSocketPair());
      const reject = (msg) => {
        server.accept();
        server.send(JSON.stringify({ t: 'error', msg }));
        server.close(4001, 'rejected');
        return new Response(null, { status: 101, webSocket: client });
      };
      if (!games[game]) return reject(['Không có game này', 'No such game']);
      if (!/^[\w-]{8,64}$/.test(id)) return reject(['Thiết bị không hợp lệ', 'Invalid device']);
      if (!this.s || this.s.game !== game) this.s = this.fresh(game, req.headers.get('X-Room') ?? '');
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
      await this.drain();
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
      } else if (m.t === 'public') {
        // Công khai phòng lên danh sách /phong/ (chủ phòng bật/tắt lúc nào cũng được).
        if (!isHost || typeof m.on !== 'boolean') return;
        s.pub = m.on;
        if (!s.pub) this.unlist();
        await this.schedule();
      } else if (m.t === 'g') {
        if (s.status !== 'playing' || !this.mod.msg(this.ctxFor(), p, m)) return;
      } else return;
      await this.save();
      this.broadcast();
      await this.drain();
    }

    start() {
      const s = this.s;
      const online = this.onlineIds();
      s.order = s.order.filter((i) => online.has(i));
      for (const id of Object.keys(s.players)) if (!online.has(id)) delete s.players[id];
      s.seats = s.order.slice(0, this.mod.max);
      Object.assign(s, { status: 'playing', g: {}, result: null, startedAt: Date.now(), wake: 0 });
      this.mod.start(this.ctxFor());
      this.arm();
    }

    // Nhịp đều (setInterval) cho game thời gian thực; game theo lượt dùng ctx.wakeAt (alarm).
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
      this.drain(); // kết quả ván ghi lúc đang chạy nhịp
    }

    // Một alarm cho cả hai việc: giờ game đã hẹn (s.wake) + nhịp báo danh sách phòng công khai.
    async schedule() {
      const s = this.s;
      const at = [s?.status === 'playing' && s.wake, s?.pub && Date.now() + BEAT_MS].filter(Boolean);
      if (at.length) await this.ctx.storage.setAlarm(Math.min(...at));
      else await this.ctx.storage.deleteAlarm();
    }

    async alarm() {
      const s = this.s;
      if (!s) return;
      if (s.status === 'playing' && s.wake && Date.now() >= s.wake) { // alarm không bao giờ chạy sớm
        s.wake = 0;
        if (this.mod.tick?.(this.ctxFor())) { await this.save(); this.broadcast(); }
      }
      if (s.pub) this.list(true);
      await this.schedule();
      await this.drain();
    }

    // Ngữ cảnh đưa cho module game (port Ctx).
    ctxFor() {
      const s = this.s;
      return {
        g: s.g, cfg: s.cfg, seats: s.seats, players: s.players, now: () => Date.now(),
        rand: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
        name: (id) => s.players[id]?.name ?? '',
        online: () => this.onlineIds(),
        wakeAt: (at) => { s.wake = at; this.schedule(); },
        end: (result) => this.finish(result),
        send: (id, msg) => { for (const ws of this.sockets()) if (ws.deserializeAttachment()?.id === id) try { ws.send(JSON.stringify(msg)); } catch {} },
        sendAll: (msg) => { const d = JSON.stringify(msg); for (const ws of this.sockets()) try { ws.send(d); } catch {} },
      };
    }

    finish(result) {
      const s = this.s;
      clearInterval(this.timer);
      Object.assign(s, { status: 'ended', wake: 0 });
      s.result = { ...result, ranks: result.ranks.map((r) => ({ ...r, name: s.players[r.id]?.name ?? r.name ?? '' })) };
      const plays = result.ranks.filter((r) => s.players[r.id]?.user).map((r) => ({
        sub: s.players[r.id].user.sub, name: s.players[r.id].user.name, game: this.slug, mode: result.mode ?? (s.seats.length > 1 ? 'multi' : 'solo'),
        score: r.score ?? 0, level: result.level ?? 1, won: !!r.won,
        detail: JSON.stringify({ rank: result.ranks.indexOf(r) + 1, of: result.ranks.length }),
      }));
      if (plays.length && this.recorder()) this.io(this.recorder().addPlays(plays));
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
        if (s.pub) this.unlist();
        this.s = null;
        await this.ctx.storage.deleteAll(); // xoá cả alarm
        await this.drain();
        return;
      }
      this.mod.leave?.(this.ctxFor(), id);
      await this.save();
      this.broadcast(ws);
      await this.drain();
    }

    webSocketError(ws) {
      return this.webSocketClose(ws);
    }

    // ---------- danh sách phòng công khai (Recorder = DO Top) ----------
    recorder() { return this.env.TOP?.get(this.env.TOP.idFromName('global')) ?? null; }
    // Báo lên Top khi thông tin đổi (số người, trạng thái, chủ phòng) hoặc tới nhịp; force = từ alarm.
    list(force = false, except) {
      const s = this.s;
      if (!s?.pub || !s.code) return;
      const host = s.players[this.hostId(except)]?.name ?? '';
      const row = {
        key: `${s.game}:${s.code}`, game: this.slug, code: s.code, path: this.mod.page, players: this.onlineIds(except).size, cap: this.mod.max,
        status: s.status === 'playing' ? 'playing' : 'waiting', host,
      };
      const sig = JSON.stringify(row);
      if (!force && sig === this.listed) return;
      this.listed = sig;
      if (this.recorder()) this.io(this.recorder().roomUpsert(row));
    }
    unlist() {
      this.listed = null;
      if (this.s?.code && this.recorder()) this.io(this.recorder().roomDrop(`${this.s.game}:${this.s.code}`));
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
        t: 'state', game: s.game, status: s.status, cfg: s.cfg, host: this.hostId(except), now: Date.now(), result: s.result, pub: !!s.pub,
        seats: s.seats, players: s.order.filter((id) => online.has(id)).map((id) => ({ id, name: s.players[id].name })),
      };
      const ctx = this.ctxFor();
      for (const ws of this.sockets(except)) {
        const id = ws.deserializeAttachment()?.id;
        try { ws.send(JSON.stringify({ ...base, view: s.g ? this.mod.view(ctx, id) : null })); } catch {}
      }
      this.list(false, except);
    }
  };
}

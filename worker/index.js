import { DurableObject } from 'cloudflare:workers';
export { MinerRoom } from './dao-vang.js';
export { MineRoom } from './do-min.js';
export { DiceRoom } from './bau-cua.js';
export { CaroRoom } from './co-caro.js';
export { ShipRoom } from './ban-tau.js';
import { userFrom } from './sso.js';
import { gameRoom } from './adapters/game-room.js';
import snake from './games/snake.js';
import bantumi from './games/bantumi.js';
import pairs from './games/pairs.js';
import logic from './games/logic.js';
import rapidRoll from './games/rapid-roll.js';
import spaceImpact from './games/space-impact.js';
import bounce from './games/bounce.js';
import oAnQuan from './games/o-an-quan.js';
import { uniqueName, otherNames } from './names.js';
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
const ROOM_TTL = 90_000;

// Các game chạy trên adapter phòng chung (worker/adapters/game-room.js): /api/nk/<game>/room/CODE, DO tên "<game>:<CODE>".
export const NOKIA_GAMES = { snake, bantumi, pairs, logic, 'rapid-roll': rapidRoll, 'space-impact': spaceImpact, bounce, 'o-an-quan': oAnQuan };
export class NokiaRoom extends gameRoom(NOKIA_GAMES) {}

const HOME = 'games.huyab.click';
const OLD_HOSTS = ['pikachu.huyab.click'];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const api = url.pathname.startsWith('/api/');
    // Domain cũ: đổi sang domain mới, giữ nguyên đường dẫn + query (hub tự đưa ?r= cũ về /pikachu/).
    // /api/* vẫn phục vụ để tab đang mở không rớt WebSocket.
    if (OLD_HOSTS.includes(url.hostname) && !api) {
      url.hostname = HOME;
      return Response.redirect(url.toString(), 301);
    }
    if (!api) return env.ASSETS.fetch(req);
    const top = () => env.TOP.get(env.TOP.idFromName('global'));
    if (url.pathname === '/api/me') {
      const user = await userFrom(req);
      const body = user ? { user, stats: await top().stats(user.sub) } : { user: null };
      return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/me/history') {
      const user = await userFrom(req);
      if (!user) return Response.json({ error: 'login' }, { status: 401 });
      if (req.method === 'POST') {
        // Bắt buộc JSON: trang lạ muốn gửi kiểu này phải qua CORS preflight (Worker không cho) -> chặn CSRF.
        if (!req.headers.get('Content-Type')?.startsWith('application/json')) return new Response('Unsupported', { status: 415 });
        // Chỉ Đào Vàng chơi 1 người (chạy hết ở client) mới tự gửi kết quả lên; ván nhiều người
        // do server ghi. Kết quả tự báo nên chỉ là lịch sử cá nhân, không vào bảng xếp hạng.
        let b;
        try { b = await req.json(); } catch { return new Response('Bad request', { status: 400 }); }
        const score = Number(b?.score), level = Number(b?.level);
        if (b?.game !== 'dao-vang' || !Number.isInteger(score) || score < 0 || score > 1e7 || !Number.isInteger(level) || level < 1 || level > 999) {
          return new Response('Bad request', { status: 400 });
        }
        await top().addPlays([{ sub: user.sub, name: user.name, game: 'dao-vang', mode: 'solo', score, level, won: false, detail: '' }]);
        return Response.json({ ok: true });
      }
      return Response.json(await top().history(user.sub), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/fun') {
      const period = url.searchParams.get('period') === 'week' ? 'week' : 'all';
      return Response.json(await top().fun(period), { headers: { 'Cache-Control': 'public, max-age=60' } });
    }
    // Phòng đang mở mà chủ phòng bật "Công khai" (trang /phong/).
    if (url.pathname === '/api/rooms-debug-7f3a') { // TẠM: chẩn đoán danh sách phòng, xoá sau
      const r = { key: 'debug:TEST', game: 'snake', code: 'TEST', path: '/nokia/snake/', players: 1, cap: 4, status: 'waiting', host: 'dbg' };
      let err = null;
      try { await top().roomUpsert(r); } catch (e) { err = String(e); }
      return Response.json({ err, rooms: await top().rooms() });
    }
    if (url.pathname === '/api/rooms') {
      return Response.json({ rooms: await top().rooms(), now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/top') {
      const mode = url.searchParams.get('mode');
      const size = Number(url.searchParams.get('size'));
      if (!MODES.includes(mode) || !SIZES[size]) return new Response('Bad request', { status: 400 });
      const rows = await top().list(mode, size);
      return Response.json(rows, { headers: { 'Cache-Control': 'public, max-age=30' } });
    }
    // /api/nk/<game>/room/CODE = các game Nokia: một class NokiaRoom, mỗi phòng là DO tên "<game>:<CODE>" (adapter worker/adapters/game-room.js).
    const nk = url.pathname.match(/^\/api\/nk\/([a-z-]+)\/room\/([A-Z0-9]{4})$/);
    if (nk && req.headers.get('Upgrade') === 'websocket') {
      const headers = new Headers(req.headers);
      for (const h of ['X-User', 'X-Game', 'X-Room']) headers.delete(h);
      headers.set('X-Game', nk[1]);
      headers.set('X-Room', nk[2]);
      const user = await userFrom(req);
      if (user) headers.set('X-User', JSON.stringify({ sub: user.sub, name: user.name }));
      return env.NOKIA.get(env.NOKIA.idFromName(`${nk[1]}:${nk[2]}`)).fetch(new Request(req, { headers }));
    }
    // /api/room/CODE = Pikachu, /api/dv/room/CODE = Đào Vàng, /api/ms/room/CODE = Dò mìn, /api/bc/room/CODE = Bầu cua,
    // /api/cc/room/CODE = Cờ caro, /api/c4/room/CODE = Nối 4 (chung class phòng với caro), /api/bt/room/CODE = Bắn tàu.
    const m = url.pathname.match(/^\/api\/(dv\/|ms\/|bc\/|cc\/|c4\/|bt\/)?room\/([A-Z0-9]{4})$/);
    if (!m || req.headers.get('Upgrade') !== 'websocket') return new Response('Not found', { status: 404 });
    const ns = { 'dv/': env.MINER, 'ms/': env.MINES, 'bc/': env.DICE, 'cc/': env.CARO, 'c4/': env.CARO, 'bt/': env.SHIPS }[m[1]] ?? env.ROOM;
    // Phòng tin header X-User / X-Game vì chỉ Worker gọi được DO; header client tự gửi luôn bị xoá trước.
    const headers = new Headers(req.headers);
    headers.delete('X-User');
    headers.delete('X-Game');
    if (m[1] === 'c4/') headers.set('X-Game', 'c4');
    const user = await userFrom(req);
    if (user) headers.set('X-User', JSON.stringify({ sub: user.sub, name: user.name }));
    return ns.get(ns.idFromName(m[1] === 'c4/' ? `c4:${m[2]}` : m[2])).fetch(new Request(req, { headers }));
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
    // Lịch sử chơi của người đã đăng nhập (sub = id tài khoản SSO). Không lưu email.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS plays (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sub TEXT NOT NULL, game TEXT NOT NULL, mode TEXT NOT NULL,
      score INTEGER NOT NULL, level INTEGER NOT NULL, won INTEGER NOT NULL, detail TEXT NOT NULL, at INTEGER NOT NULL)`);
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS plays_user ON plays (sub, at DESC)');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS plays_at ON plays (at)');
    // Tên hiển thị cho bảng xếp hạng vui (tên SSO mới nhất của mỗi tài khoản).
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS users (sub TEXT PRIMARY KEY, name TEXT NOT NULL, at INTEGER NOT NULL)');
    // Danh sách phòng công khai: phòng tự báo khi đổi + mỗi 30s; im quá ROOM_TTL thì coi như đã đóng.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (
      key TEXT PRIMARY KEY, game TEXT NOT NULL, code TEXT NOT NULL, path TEXT NOT NULL, players INTEGER NOT NULL, cap INTEGER NOT NULL,
      status TEXT NOT NULL, host TEXT NOT NULL, mode TEXT, at INTEGER NOT NULL)`);
  }

  roomUpsert(r) {
    this.ctx.storage.sql.exec(
      `INSERT INTO rooms (key, game, code, path, players, cap, status, host, mode, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET players = excluded.players, cap = excluded.cap, status = excluded.status, host = excluded.host,
       mode = excluded.mode, at = excluded.at`,
      r.key, r.game, r.code, r.path, r.players, r.cap, r.status, r.host, r.mode ?? null, Date.now(),
    );
  }

  roomDrop(key) {
    this.ctx.storage.sql.exec('DELETE FROM rooms WHERE key = ?', key);
  }

  rooms() {
    const since = Date.now() - ROOM_TTL;
    this.ctx.storage.sql.exec('DELETE FROM rooms WHERE at < ?', since);
    return this.ctx.storage.sql
      .exec("SELECT key, game, code, path, players, cap, status, host, mode, at FROM rooms ORDER BY status = 'playing', players DESC, at DESC LIMIT 100")
      .toArray();
  }

  addPlays(rows) {
    for (const r of rows) {
      if (r.name) {
        this.ctx.storage.sql.exec(
          'INSERT INTO users (sub, name, at) VALUES (?, ?, ?) ON CONFLICT(sub) DO UPDATE SET name = excluded.name, at = excluded.at',
          r.sub, r.name, Date.now(),
        );
      }
      this.ctx.storage.sql.exec(
        'INSERT INTO plays (sub, game, mode, score, level, won, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        r.sub, r.game, r.mode, r.score, r.level, r.won ? 1 : 0, r.detail ?? '', Date.now(),
      );
    }
  }

  history(sub) {
    return this.ctx.storage.sql
      .exec('SELECT game, mode, score, level, won, detail, at FROM plays WHERE sub = ? ORDER BY at DESC LIMIT 30', sub)
      .toArray();
  }

  // Bảng xếp hạng "cho vui" (icon mỗi hạng mục chọn ở client theo key, xem public/me.js) giữa người đã đăng nhập, top 5 mỗi hạng mục.
  fun(period) {
    const since = period === 'week' ? Date.now() - 7 * 86400_000 : 0;
    // order 'ASC' cho hạng mục "càng nhỏ càng giỏi" (thời gian dò mìn).
    const q = (key, title, unit, agg, where = '1', order = 'DESC') => ({
      key, title, unit,
      rows: this.ctx.storage.sql.exec(
        `SELECT COALESCE(u.name, 'Ẩn danh') AS name, ${agg} AS value FROM plays p LEFT JOIN users u ON u.sub = p.sub
         WHERE p.at >= ? AND (${where}) GROUP BY p.sub HAVING value > 0 ORDER BY value ${order}, MIN(p.at) ASC LIMIT 5`, since,
      ).toArray(),
    });
    // Giờ Việt Nam = UTC+7; "cú đêm" = ván kết thúc từ 0h tới trước 5h sáng.
    const vnHour = '((p.at / 3600000 + 7) % 24)';
    return [
      q('plays', 'Chiến thần cày game', 'ván', 'COUNT(*)'),
      q('wins', 'Vua chiến thắng', 'lần thắng', 'SUM(p.won)'),
      q('gold', 'Đại gia Đào Vàng', '$', 'MAX(p.score)', "p.game = 'dao-vang'"),
      q('tiles', 'Thánh nối thú', 'điểm', 'MAX(p.score)', "p.game = 'pikachu'"),
      q('deep', 'Thợ mỏ lì đòn', 'màn', 'MAX(p.level)', "p.game = 'dao-vang'"),
      q('mines', 'Thánh dò mìn', 'giây', 'MIN(p.score)', "p.game = 'do-min' AND p.won = 1", 'ASC'),
      q('baucua', 'Đại gia Bầu cua', 'xu lãi', 'SUM(p.score)', "p.game = 'bau-cua'"),
    q('caro', 'Kỳ thủ caro', 'ván thắng', 'SUM(p.won)', "p.game = 'co-caro' AND p.mode = 'pvp'"),
    q('c4', 'Vua Nối 4', 'ván thắng', 'SUM(p.won)', "p.game = 'noi-4' AND p.mode = 'pvp'"),
    q('ships', 'Xạ thủ Bắn tàu', 'phát', 'MIN(p.score)', "p.game = 'ban-tau' AND p.won = 1", 'ASC'),
    q('nokia', 'Huyền thoại Nokia', 'ván', 'COUNT(*)', "p.game IN ('snake', 'bantumi', 'pairs', 'logic', 'rapid-roll', 'space-impact', 'bounce')"),
    q('team', 'Đồng đội quốc dân', 'ván chung', 'COUNT(*)', "p.mode IN ('coop', 'team')"),
      q('night', 'Cú đêm', 'ván lúc 0–5h', 'COUNT(*)', `${vnHour} < 5`),
    ];
  }

  stats(sub) {
    return this.ctx.storage.sql
      .exec('SELECT game, COUNT(*) AS plays, SUM(won) AS wins, MAX(score) AS best, MIN(CASE WHEN won = 1 THEN score END) AS fastest, MAX(level) AS maxLevel FROM plays WHERE sub = ? GROUP BY game', sub)
      .toArray();
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
    if (!/^[\w-]{8,64}$/.test(id)) return reject(['Thiết bị không hợp lệ', 'Invalid device']);

    let p = s.players[id];
    if (!p) {
      const online = this.onlineIds();
      if (online.size >= MAX_ONLINE) return reject(['Phòng đông quá rồi', 'This room is full']);
      const playing = [...online].filter((i) => s.players[i] && !s.players[i].spec).length;
      // Đang chơi hoặc đã đủ người -> vào xem, ván sau được chơi.
      const spec = s.status === 'playing' || playing >= MAX_PLAYERS;
      p = s.players[id] = { id, name, score: 0, spec, team: this.smallerTeam() };
      s.order.push(id);
    }
    p.name = uniqueName(name, otherNames(s.players, id));
    // Tài khoản SSO (Worker đã xác thực và gắn header). Khách thì null -> ván không được lưu.
    p.user = JSON.parse(req.headers.get('X-User') || 'null');

    // Cùng thiết bị mở tab mới -> tab cũ nhường chỗ.
    for (const ws of this.sockets()) if (ws.deserializeAttachment()?.id === id) ws.close(4000, 'replaced');
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });

    await this.save();
    // state trước, board sau: client cần biết mình thuộc bàn nào mới nhận được board.
    this.broadcast();
    this.sendBoardTo(server);
    this.sendMinis(server);
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
    for (const ws of this.sockets()) { this.sendBoardTo(ws, 'start'); this.sendMinis(ws); }
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
    // Lịch sử cá nhân cho người đã đăng nhập.
    const plays = s.order.filter((id) => s.players[id].user && this.unitOf(s.players[id])).map((id) => {
      const p = s.players[id], uid = this.unitOf(p), u = s.units[uid];
      return {
        sub: p.user.sub, name: p.user.name, game: 'pikachu', mode: s.mode, score: p.score, level: u.level,
        won: s.mode === 'coop' ? u.done === 'clear' : winner === uid,
        detail: JSON.stringify({ size: s.size, team: u.score, with: this.membersOf(uid).filter((x) => x !== id).map((x) => s.players[x].name) }),
      };
    });
    // Lỗi ghi bảng xếp hạng / lịch sử không được làm hỏng ván chơi.
    try {
      const top = this.env.TOP.get(this.env.TOP.idFromName('global'));
      if (rows.length) await top.add(rows);
      if (plays.length) await top.addPlays(plays);
    } catch {}
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

  // Gửi cho người đang xem bàn uid. Message có kèm bàn (ăn cặp, qua màn, xáo...) thì những
  // người còn lại nhận bản "mini" để vẽ ô xem trước kiểu Google Meet ở khung bên cạnh.
  toViewers(uid, msg, except) {
    const data = JSON.stringify(msg);
    const mini = msg.board ? JSON.stringify({ t: 'mini', unit: uid, board: msg.board }) : null;
    for (const ws of this.sockets(except)) {
      const mine = this.viewOf(ws) === uid;
      try { if (mine) ws.send(data); else if (mini) ws.send(mini); } catch {}
    }
  }

  // Đủ bàn của mọi đơn vị (lúc vào phòng / bắt đầu ván) cho khung xem trước.
  sendMinis(ws) {
    if (this.s.status === 'lobby') return;
    const boards = Object.fromEntries(Object.entries(this.s.units).map(([uid, u]) => [uid, u.board]));
    ws.send(JSON.stringify({ t: 'minis', boards }));
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

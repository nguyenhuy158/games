import { DurableObject } from 'cloudflare:workers';

// Adapter lưu trữ (port Recorder trong worker/ports.js): một DO SQLite duy nhất "global" (gói free đã hết quota D1).
// Bảng: scores (top Pikachu), plays (lịch sử người đã đăng nhập), users (tên hiển thị), rooms (phòng công khai).
const TOP_LIMIT = 10;
const ROOM_TTL = 90_000;
const REPLAY_DAYS = 30;
// Mã bản ghi: 12 ký tự ngẫu nhiên (khó đoán -> link share là quyền xem). Giới hạn cỡ để vừa 1 ô SQLite của DO (2MB).
export const REPLAY_ID = /^[A-Za-z0-9]{12}$/;
export { REPLAY_MAX } from '../../public/tape.js';
export const replayId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[b % 57]).join('');

// Hạng mục bảng xếp hạng "cho vui" (icon + tên tiếng Anh chọn ở client theo key, xem public/me.js):
// [key, tên, đơn vị, giá trị gộp theo người, điều kiện, thứ tự]. order 'ASC' = càng nhỏ càng giỏi (thời gian dò mìn, số phát bắn).
// Giờ Việt Nam = UTC+7; "cú đêm" = ván kết thúc từ 0h tới trước 5h sáng.
const VN_HOUR = '((p.at / 3600000 + 7) % 24)';
export const FUN = [
  ['plays', 'Chiến thần cày game', 'ván', 'COUNT(*)'],
  ['wins', 'Vua chiến thắng', 'lần thắng', 'SUM(p.won)'],
  ['gold', 'Đại gia Đào Vàng', '$', 'MAX(p.score)', "p.game = 'dao-vang'"],
  ['tiles', 'Thánh nối thú', 'điểm', 'MAX(p.score)', "p.game = 'pikachu'"],
  ['deep', 'Thợ mỏ lì đòn', 'màn', 'MAX(p.level)', "p.game = 'dao-vang'"],
  ['mines', 'Thánh dò mìn', 'giây', 'MIN(p.score)', "p.game = 'do-min' AND p.won = 1", 'ASC'],
  ['baucua', 'Đại gia Bầu cua', 'xu lãi', 'SUM(p.score)', "p.game = 'bau-cua'"],
  ['caro', 'Kỳ thủ caro', 'ván thắng', 'SUM(p.won)', "p.game = 'co-caro' AND p.mode = 'pvp'"],
  ['c4', 'Vua Nối 4', 'ván thắng', 'SUM(p.won)', "p.game = 'noi-4' AND p.mode = 'pvp'"],
  ['ships', 'Xạ thủ Bắn tàu', 'phát', 'MIN(p.score)', "p.game = 'ban-tau' AND p.won = 1", 'ASC'],
  ['nokia', 'Huyền thoại Nokia', 'ván', 'COUNT(*)', "p.game IN ('snake', 'bantumi', 'pairs', 'logic', 'rapid-roll', 'space-impact', 'bounce')"],
  ['team', 'Đồng đội quốc dân', 'ván chung', 'COUNT(*)', "p.mode IN ('coop', 'team')"],
  ['night', 'Cú đêm', 'ván lúc 0–5h', 'COUNT(*)', `${VN_HOUR} < 5`],
];

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
    // Bản ghi xem lại ván (share bằng link /<game>/?replay=<id>, ai có link đều xem được). Giữ REPLAY_DAYS ngày.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS replays (
      id TEXT PRIMARY KEY, game TEXT NOT NULL, page TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL)`);
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS replays_at ON replays (at)');
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

  // r = { id, game, page, frames: [[ms, msg], ...] } (xem public/replay.js). Dọn bản ghi quá hạn mỗi lần ghi.
  saveReplay(r) {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM replays WHERE at < ?', now - REPLAY_DAYS * 86_400_000);
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO replays (id, game, page, data, at) VALUES (?, ?, ?, ?, ?)',
      r.id, r.game, r.page, JSON.stringify(r.frames), now);
  }

  replay(id) {
    const row = this.ctx.storage.sql.exec('SELECT game, page, data, at FROM replays WHERE id = ?', id).toArray()[0];
    return row ? { game: row.game, page: row.page, at: row.at, frames: JSON.parse(row.data) } : null;
  }

  replayPage(id) {
    return this.ctx.storage.sql.exec('SELECT page FROM replays WHERE id = ?', id).toArray()[0]?.page ?? null;
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

  // Trang lịch sử: 30 ván trước mốc `before` (ms), mới nhất trước.
  history(sub, before = Number.MAX_SAFE_INTEGER) {
    return this.ctx.storage.sql
      .exec('SELECT game, mode, score, level, won, detail, at FROM plays WHERE sub = ? AND at < ? ORDER BY at DESC LIMIT 30', sub, before)
      .toArray();
  }

  // Bảng xếp hạng "cho vui" (icon mỗi hạng mục chọn ở client theo key, xem public/me.js) giữa người đã đăng nhập, top 5 mỗi hạng mục.
  fun(period) {
    const since = period === 'week' ? Date.now() - 7 * 86400_000 : 0;
    const q = (key, title, unit, agg, where = '1', order = 'DESC') => ({
      key, title, unit,
      rows: this.ctx.storage.sql.exec(
        `SELECT COALESCE(u.name, 'Ẩn danh') AS name, ${agg} AS value FROM plays p LEFT JOIN users u ON u.sub = p.sub
         WHERE p.at >= ? AND (${where}) GROUP BY p.sub HAVING value > 0 ORDER BY value ${order}, MIN(p.at) ASC LIMIT 5`, since,
      ).toArray(),
    });
    return FUN.map((c) => q(...c));
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

import { SIZES, LEVELS, SLIDES, durationOf, slide, newBoard, findPath, findPair, reshuffle, countLeft } from '../../public/pikachu/logic.js';

// Pikachu nối thú (chạy trong adapter phòng chung, giao thức cũ "phẳng"). Server giữ bàn thật và kiểm lại mọi nước đi;
// bàn gửi qua tin riêng 'board' / 'match' (người xem bàn đó) + 'mini' / 'minis' (bản xem trước cho những người khác).
// Một "bàn chơi" (unit) giữ bàn, màn, đồng hồ, combo, lượt xáo riêng:
//   coop: cả phòng 1 unit 'all' · race: mỗi người 1 unit (id người) · team: unit 'A' / 'B'.
// Nhờ vậy mọi luật (màn, combo, cộng giờ, thắng thua) viết một lần cho cả 3 chế độ.
const MAX_PLAYERS = 4;
const SHUFFLES = 5;
const PAIR_SCORE = 10;
const COMBO_MS = 3000; // ăn cặp kế tiếp trong khoảng này thì combo tăng
const MAX_COMBO = 5;
const STUCK_BONUS_MS = 10_000; // hết nước tự xáo thì cộng giờ, đỡ ức chế
export const MODES = ['coop', 'race', 'team'];
const TILESETS = ['poke', 'animal'];

const isCell = (p, g) =>
  Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) &&
  p[0] >= 1 && p[0] <= g.length - 2 && p[1] >= 1 && p[1] <= g[0].length - 2;
// Toạ độ chuột theo đơn vị ô (số thực), cho phép lấn ra viền 1 ô.
const isPos = (p, g) =>
  Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
  p[0] >= 0 && p[0] <= g.length && p[1] >= 0 && p[1] <= g[0].length;
const copy = (g) => g.map((r) => r.slice());
const lobby = (ctx) => !ctx.g || ctx.g.over;

// Người ngoài 4 ghế (vào sau / vào giữa ván) là khán giả, ván sau được chơi. Chưa có ván nào thì xét theo thứ tự vào phòng.
function spec(ctx, id) {
  if (ctx.g?.units) return !ctx.seats.includes(id);
  const online = ctx.online();
  return ctx.order().filter((i) => online.has(i)).indexOf(id) >= MAX_PLAYERS;
}
// Đội giữ qua các ván; người mới vào đội ít người hơn.
function teamOf(ctx, id) {
  const team = (ctx.keep.team ??= {});
  if (!team[id]) {
    const n = { A: 0, B: 0 };
    for (const i of ctx.order()) if (i !== id && team[i] && !spec(ctx, i)) n[team[i]]++;
    team[id] = n.A <= n.B ? 'A' : 'B';
  }
  return team[id];
}
const unitOf = (ctx, id) => (!id || spec(ctx, id) ? null : ctx.cfg.mode === 'coop' ? 'all' : ctx.cfg.mode === 'race' ? id : teamOf(ctx, id));
const membersOf = (ctx, uid) => ctx.seats.filter((id) => unitOf(ctx, id) === uid);

// Bàn người này đang nhìn: bàn của mình, hoặc bàn khán giả chọn (mặc định bàn đầu).
function viewOf(ctx, id) {
  const units = ctx.g?.units ?? {};
  const own = unitOf(ctx, id);
  if (own && units[own]) return own;
  const w = ctx.g?.watch?.[id];
  return units[w] ? w : Object.keys(units)[0] ?? null;
}
function sendBoardTo(ctx, id, why = 'sync') {
  const uid = ctx.g?.units && viewOf(ctx, id);
  if (uid) ctx.send(id, { t: 'board', unit: uid, board: ctx.g.units[uid].board, why });
}
// Đủ bàn của mọi đơn vị (lúc vào phòng / bắt đầu ván) cho khung xem trước.
function sendMinis(ctx, id) {
  if (ctx.g?.units) ctx.send(id, { t: 'minis', boards: Object.fromEntries(Object.entries(ctx.g.units).map(([uid, u]) => [uid, u.board])) });
}
// Gửi cho người đang xem bàn uid. Tin có kèm bàn (ăn cặp, qua màn, xáo...) thì những người còn lại nhận bản "mini"
// để vẽ ô xem trước kiểu Google Meet. Duyệt cả người vừa rớt mạng: bản xem lại theo góc người cầm ghế 1 dù họ đã rời.
function toViewers(ctx, uid, msg, except) {
  const mini = msg.board ? { t: 'mini', unit: uid, board: msg.board } : null;
  const tape = msg.t !== 'cur'; // bỏ tin chuột cho bản ghi đỡ nặng
  for (const id of ctx.order()) {
    if (id === except) continue;
    if (viewOf(ctx, id) === uid) ctx.send(id, msg, { tape });
    else if (mini) ctx.send(id, mini);
  }
}

// Sau mỗi thay đổi: đánh dấu bàn hết giờ, xem ván kết thúc chưa, hẹn giờ kế tiếp.
function settle(ctx) {
  const g = ctx.g, now = Date.now();
  const units = Object.entries(g.units);
  for (const [, u] of units) if (!u.done && now >= u.endAt) u.done = 'out';
  const cleared = units.find(([, u]) => u.done === 'clear');
  if (cleared && ctx.cfg.mode !== 'coop') return finish(ctx, cleared[0]);
  if (units.every(([, u]) => u.done)) {
    // coop: phá đảo mới thắng. Đua/đội: không ai phá đảo thì xét màn rồi điểm.
    const best = units.reduce((x, y) => (y[1].level * 1e6 + y[1].score > x[1].level * 1e6 + x[1].score ? y : x));
    return finish(ctx, ctx.cfg.mode === 'coop' ? (cleared ? cleared[0] : null) : best[0]);
  }
  ctx.wakeAt(Math.min(...units.filter(([, u]) => !u.done).map(([, u]) => u.endAt)));
}

function finish(ctx, winner) {
  const g = ctx.g, { mode, size } = ctx.cfg;
  Object.assign(g, { over: true, winner });
  const names = (ids) => ids.map((id) => ctx.name(id));
  ctx.rank(Object.entries(g.units).filter(([, u]) => u.score > 0).map(([uid, u]) => ({
    mode, size, score: u.score, level: u.level, cleared: u.done === 'clear', names: names(membersOf(ctx, uid)).join(', ').slice(0, 100),
  })));
  ctx.end({
    mode,
    ranks: ctx.seats.map((id) => {
      const uid = unitOf(ctx, id), u = g.units[uid];
      return {
        id, score: g.score[id], level: u.level, won: mode === 'coop' ? u.done === 'clear' : winner === uid,
        detail: { size, team: u.score, with: names(membersOf(ctx, uid).filter((x) => x !== id)) },
      };
    }),
  });
}

function pick(ctx, p, a, b) {
  const g = ctx.g;
  const uid = unitOf(ctx, p.id), u = g.units[uid];
  if (!u || u.done || !isCell(a, u.board) || !isCell(b, u.board)) return false;
  if (Date.now() >= u.endAt) { settle(ctx); return true; } // hết giờ mà alarm chưa kịp chạy
  const path = findPath(u.board, a, b);
  // Client lệch (hoặc đồng đội vừa ăn mất ô đó) -> đồng bộ lại.
  if (!path) { ctx.send(p.id, { t: 'board', unit: uid, board: u.board, why: 'sync' }); return false; }

  const now = Date.now();
  u.combo = now - u.lastAt <= COMBO_MS ? Math.min(MAX_COMBO, u.combo + 1) : 1;
  u.lastAt = now;
  const pts = PAIR_SCORE * u.combo;
  g.score[p.id] += pts;
  u.score += pts;
  u.board[a[0]][a[1]] = u.board[b[0]][b[1]] = 0;
  slide(u.board, SLIDES[u.level - 1]);
  // Kèm bàn sau khi trượt: client thay bàn theo server, khỏi lệch khi 2 người ăn cùng lúc.
  toViewers(ctx, uid, { t: 'match', unit: uid, id: p.id, a, b, path, combo: u.combo, pts, board: u.board });

  if (!countLeft(u.board)) {
    if (u.level === LEVELS) u.done = 'clear';
    else {
      u.level++;
      u.board = copy(g.deck[u.level - 1]);
      u.endAt = now + durationOf(SIZES[ctx.cfg.size]);
      u.shuffles++;
      u.combo = 0;
      toViewers(ctx, uid, { t: 'board', unit: uid, board: u.board, why: 'level' });
    }
  } else if (!findPair(u.board)) {
    reshuffle(u.board);
    u.endAt += STUCK_BONUS_MS;
    toViewers(ctx, uid, { t: 'board', unit: uid, board: u.board, why: 'stuck' });
  }
  settle(ctx);
  return true;
}

export default {
  slug: 'pikachu', page: '/pikachu/', max: MAX_PLAYERS, maxOnline: 8, persist: true, flat: true, emotes: 5,
  messages: ['team', 'watch', 'sel', 'cur', 'ping', 'pick', 'shuffle'],
  cfg: { mode: 'coop', size: 0, tiles: 'poke' },
  config: (cfg, m) => ({
    ...cfg, ...(MODES.includes(m.mode) ? { mode: m.mode } : {}), ...(Number.isInteger(m.size) && SIZES[m.size] ? { size: m.size } : {}),
    ...(TILESETS.includes(m.tiles) ? { tiles: m.tiles } : {}),
  }),
  start(ctx) {
    const size = SIZES[ctx.cfg.size];
    // Đề chung cho mọi bàn, mỗi màn một đề: đua/đội là công bằng.
    const deck = Array.from({ length: LEVELS }, () => newBoard(size));
    const endAt = Date.now() + durationOf(size);
    const g = Object.assign(ctx.g, { deck, units: {}, score: {}, watch: {}, winner: null, over: false });
    for (const id of ctx.seats) {
      g.score[id] = 0;
      const uid = unitOf(ctx, id);
      g.units[uid] ??= { board: copy(deck[0]), level: 1, score: 0, shuffles: SHUFFLES, endAt, combo: 0, lastAt: 0, done: null };
    }
    ctx.wakeAt(endAt);
    for (const id of ctx.online()) { sendBoardTo(ctx, id, 'start'); sendMinis(ctx, id); }
  },
  // Vào / vào lại: state trước (adapter), board sau — client cần biết mình thuộc bàn nào mới nhận được board.
  hello(ctx, id) { sendBoardTo(ctx, id); sendMinis(ctx, id); },
  msg(ctx, p, m) {
    const g = ctx.g;
    if (m.t === 'team') {
      if (!lobby(ctx) || !['A', 'B'].includes(m.team)) return false;
      (ctx.keep.team ??= {})[p.id] = m.team;
      return true;
    }
    if (lobby(ctx)) return false;
    const uid = unitOf(ctx, p.id), u = g.units[uid];
    switch (m.t) {
      case 'watch':
        if (!spec(ctx, p.id) || !g.units[m.unit]) return false;
        g.watch[p.id] = m.unit;
        sendBoardTo(ctx, p.id);
        return false;
      case 'sel':
      case 'cur':
      case 'ping': {
        // Chỉ để đồng đội cùng bàn thấy, không lưu.
        if (!u) return false;
        const v = m.t === 'cur' ? m.p : m.a;
        if (v !== null && !(m.t === 'cur' ? isPos : isCell)(v, u.board)) return false;
        if (m.t === 'ping' && (v === null || !ctx.allow(`${p.id}:ping`, 400))) return false;
        toViewers(ctx, uid, { t: m.t, id: p.id, [m.t === 'cur' ? 'p' : 'a']: v }, p.id);
        return false;
      }
      case 'pick':
        return pick(ctx, p, m.a, m.b);
      case 'shuffle':
        if (!u || u.done || u.shuffles <= 0) return false;
        u.shuffles--;
        reshuffle(u.board);
        toViewers(ctx, uid, { t: 'board', unit: uid, board: u.board, why: 'shuffle', by: p.id });
        return true;
      default:
        return false;
    }
  },
  tick(ctx) {
    if (lobby(ctx)) return false;
    settle(ctx);
    return true;
  },
  view(ctx) {
    const g = ctx.g ?? {};
    const online = ctx.online();
    return {
      ...ctx.cfg, duration: durationOf(SIZES[ctx.cfg.size]), winner: g.winner ?? null,
      units: Object.fromEntries(Object.entries(g.units ?? {}).map(([uid, u]) => [uid, {
        level: u.level, score: u.score, shuffles: u.shuffles, endAt: u.endAt, done: u.done, combo: u.combo, left: countLeft(u.board) / 2,
      }])),
      players: ctx.order().map((id) => ({
        id, name: ctx.name(id), score: g.score?.[id] ?? 0, spec: spec(ctx, id), team: teamOf(ctx, id), unit: unitOf(ctx, id), online: online.has(id),
      })),
    };
  },
};

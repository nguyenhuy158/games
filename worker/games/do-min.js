import {
  SIZES, LIVES, BOOM_PENALTY_MS, FLAG, newField, newVis, reveal, chord, toggleFlag, openedCount, safeTotal, cleared,
} from '../../public/do-min/logic.js';

// Dò mìn (chạy trong adapter phòng chung, giao thức cũ "phẳng"). Vị trí mìn (g.field) CHỈ nằm ở server;
// client nhận ô đã mở qua tin riêng 'grid' / 'open' (không nằm trong state).
//   coop: cả phòng một bàn (unit 'all'), chung 3 mạng, thấy chuột + ping nhau.
//   race: mỗi người một bàn cùng đề (unit = id người), đạp mìn +10 giây, ai mở hết trước thắng.
const MAX_PLAYERS = 4;
const MODES = ['coop', 'race'];

// Người ngoài 4 ghế (vào sau / vào giữa ván) là khán giả. Chưa có ván nào thì xét theo thứ tự vào phòng.
function spec(ctx, id) {
  if (ctx.g?.units) return !ctx.seats.includes(id);
  const online = ctx.online();
  return ctx.order().filter((i) => online.has(i)).indexOf(id) >= MAX_PLAYERS;
}
const unitOf = (ctx, id) => (!id || spec(ctx, id) ? null : ctx.cfg.mode === 'coop' ? 'all' : id);

// Chỉ gửi bàn người này được xem: đua cùng đề mà thấy bàn đối thủ là chép được ô an toàn,
// nên đua chỉ nhận bàn mình (khán giả / ván đã xong thì xem hết).
function sendGrids(ctx, id) {
  const g = ctx.g;
  if (!g?.field) return;
  const mine = unitOf(ctx, id);
  const all = g.over || !mine || ctx.cfg.mode === 'coop';
  ctx.send(id, { t: 'grid', grids: Object.fromEntries(Object.entries(g.units).filter(([uid]) => all || uid === mine).map(([uid, u]) => [uid, u.vis])) });
  if (g.over) ctx.send(id, { t: 'reveal', mines: g.field.mines.flatMap((v, i) => (v ? [i] : [])) });
}
const sendAllGrids = (ctx) => { for (const id of ctx.online()) sendGrids(ctx, id); };

// Gửi cho người cùng bàn uid + khán giả (không lộ bàn cho đối thủ khi đua).
function toUnit(ctx, uid, msg, except) {
  for (const id of ctx.online()) if (id !== except && (unitOf(ctx, id) === uid || spec(ctx, id))) ctx.send(id, msg);
}

function finish(ctx, winner) {
  const g = ctx.g, size = SIZES[ctx.cfg.size];
  Object.assign(g, { over: true, endedAt: Date.now(), winner });
  ctx.end({
    mode: ctx.cfg.mode, level: ctx.cfg.size + 1,
    ranks: ctx.seats.map((id) => {
      const u = g.units[unitOf(ctx, id)], st = g.stats[id];
      return {
        id, score: Math.round((u.time || g.endedAt - g.startedAt + u.penalty) / 1000),
        won: ctx.cfg.mode === 'coop' ? u.done === 'clear' : winner === id,
        detail: { opened: st.opened, booms: st.booms, size: size.name },
      };
    }),
  });
  sendAllGrids(ctx); // ván xong: gửi đủ bàn + lộ hết mìn (không còn gì để gian lận)
}

function act(ctx, p, kind, i) {
  const g = ctx.g, size = SIZES[ctx.cfg.size];
  const uid = unitOf(ctx, p.id), u = g.units[uid];
  if (g.over || !u || u.done || !Number.isInteger(i) || i < 0 || i >= size.rows * size.cols) return false;
  if (kind === 'flag') {
    const on = toggleFlag(u.vis, i);
    if (on !== null) toUnit(ctx, uid, { t: 'open', unit: uid, cells: [[i, on ? FLAG : -1]], by: p.id });
    return false; // cờ không đổi tiến độ -> khỏi lưu / gửi state (rẻ)
  }
  const res = (kind === 'chord' ? chord : reveal)(g.field, u.vis, i, size.rows, size.cols);
  if (!res.opened.length) return false;
  const st = g.stats[p.id];
  st.opened += res.opened.filter(([, v]) => v >= 0).length;
  if (res.boom) {
    st.booms++;
    u.booms++;
    if (ctx.cfg.mode === 'coop') u.lives--;
    else u.penalty += BOOM_PENALTY_MS;
    // Ô mìn vừa nổ coi như đã đánh dấu: chơi tiếp được (không phải mở lại).
  }
  toUnit(ctx, uid, { t: 'open', unit: uid, cells: res.opened, by: p.id, boom: res.boom });
  if (cleared(u.vis, size)) { u.done = 'clear'; u.time = Date.now() - g.startedAt + u.penalty; }
  else if (ctx.cfg.mode === 'coop' && u.lives <= 0) u.done = 'dead';
  if (ctx.cfg.mode === 'coop' ? u.done : u.done === 'clear') finish(ctx, u.done === 'clear' ? uid : null);
  else if (Object.values(g.units).every((x) => x.done)) finish(ctx, null);
  return true;
}

export default {
  slug: 'do-min', page: '/do-min/', max: MAX_PLAYERS, maxOnline: 8, persist: true, flat: true,
  messages: ['open', 'chord', 'flag', 'cur', 'ping'],
  cfg: { mode: 'coop', size: 0 },
  config: (cfg, m) => ({ ...cfg, ...(MODES.includes(m.mode) ? { mode: m.mode } : {}), ...(Number.isInteger(m.size) && SIZES[m.size] ? { size: m.size } : {}) }),
  start(ctx) {
    const size = SIZES[ctx.cfg.size];
    // Ô xuất phát ngẫu nhiên, rải mìn chừa quanh nó rồi mở sẵn cho mọi bàn -> cùng vạch xuất phát.
    const safe = Math.floor(ctx.rand() * size.rows * size.cols);
    const g = Object.assign(ctx.g, { field: newField(size, safe), units: {}, stats: {}, startedAt: Date.now(), endedAt: 0, winner: null, over: false });
    for (const id of ctx.seats) {
      g.stats[id] = { opened: 0, booms: 0 };
      const uid = unitOf(ctx, id);
      if (g.units[uid]) continue;
      const vis = newVis(size.rows, size.cols);
      reveal(g.field, vis, safe, size.rows, size.cols);
      g.units[uid] = { vis, lives: LIVES, booms: 0, penalty: 0, done: null, time: 0 };
    }
    sendAllGrids(ctx);
  },
  hello: sendGrids, // vào / vào lại phòng: gửi bàn đang chơi (hoặc đã xong)
  msg(ctx, p, m) {
    const g = ctx.g;
    if (m.t === 'open' || m.t === 'chord' || m.t === 'flag') return !!g?.units && act(ctx, p, m.t, m.i);
    // cur / ping: chỉ để đồng đội cùng bàn thấy, không lưu.
    const uid = unitOf(ctx, p.id), size = SIZES[ctx.cfg.size];
    if (!g?.units || g.over || !g.units[uid]) return false;
    if (m.t === 'ping' && (!Number.isInteger(m.i) || m.i < 0 || m.i >= size.rows * size.cols || !ctx.allow(`${p.id}:ping`, 400))) return false;
    if (m.t === 'cur' && m.p !== null && !(Array.isArray(m.p) && m.p.every(Number.isFinite))) return false;
    toUnit(ctx, uid, m.t === 'cur' ? { t: 'cur', id: p.id, p: m.p } : { t: 'ping', id: p.id, i: m.i }, p.id);
    return false;
  },
  view(ctx) {
    const g = ctx.g ?? {}, size = SIZES[ctx.cfg.size];
    const online = ctx.online();
    return {
      ...ctx.cfg, startedAt: g.startedAt ?? 0, endedAt: g.endedAt ?? 0, winner: g.winner ?? null,
      units: Object.fromEntries(Object.entries(g.units ?? {}).map(([uid, u]) => [uid, {
        opened: openedCount(u.vis), total: safeTotal(size), lives: u.lives, booms: u.booms, penalty: u.penalty, done: u.done, time: u.time,
      }])),
      players: ctx.order().map((id) => ({
        id, name: ctx.name(id), spec: spec(ctx, id), online: online.has(id), unit: unitOf(ctx, id),
        opened: g.stats?.[id]?.opened ?? 0, booms: g.stats?.[id]?.booms ?? 0,
      })),
    };
  },
};

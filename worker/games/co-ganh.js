import { newGame, move, legal, count, botMove } from '../../public/co-ganh/logic.js';

// Cờ gánh 1v1 (hoặc với máy nếu phòng chỉ có 1 người) — dùng chung phòng NokiaRoom, giao diện riêng ở /co-ganh/.
// Mỗi ván đổi người đi trước. Hết giờ một nước = thua.
const TURN_MS = 30_000, BOT_MS = 700, SHOW_MS = 700, BOT = 'bot';
const DEPTH = [1, 3, 5];

export default {
  max: 2,
  slug: 'co-ganh',
  page: '/co-ganh/',
  cfg: { level: 1 },
  config: (cfg, m) => (DEPTH[m.level] !== undefined ? { ...cfg, level: m.level } : null),
  start(ctx) {
    const two = ctx.seats.length === 2 ? [...ctx.seats] : [ctx.seats[0], BOT];
    ctx.keep.swap = !ctx.keep.swap;
    Object.assign(ctx.g, { side: ctx.keep.swap ? two : [two[1], two[0]], s: newGame(), last: null });
    arm(ctx);
  },
  msg(ctx, p, m) {
    const g = ctx.g;
    if (!legal(g.s, g.side.indexOf(p.id) + 1, m.from, m.to)) return false;
    play(ctx, m.from, m.to);
    return true;
  },
  tick(ctx) {
    const g = ctx.g;
    if (Date.now() < g.deadline) return false;
    if (g.s.over) end(ctx, g.s.winner, false);
    else if (g.side[g.s.turn - 1] === BOT) play(ctx, ...botMove(g.s, DEPTH[ctx.cfg.level]));
    else end(ctx, 3 - g.s.turn, true);
    return true;
  },
  view(ctx) {
    const g = ctx.g, s = g.s;
    return {
      side: g.side, names: g.side.map((id) => (id === BOT ? ['Máy', 'Bot'] : ctx.name(id))),
      b: s.b, turn: s.turn, over: s.over, moves: s.moves, last: g.last, deadline: g.deadline,
    };
  },
};

function arm(ctx) {
  const g = ctx.g;
  g.deadline = Date.now() + (g.side[g.s.turn - 1] === BOT ? BOT_MS : TURN_MS);
  ctx.wakeAt(g.deadline);
}

function play(ctx, from, to) {
  const g = ctx.g;
  const p = g.s.turn;
  const { ganh, vay } = move(g.s, from, to);
  g.last = { p, from, to, ganh, vay };
  // Hết ván: để client thấy nước cuối rồi mới hiện kết quả.
  if (g.s.over) ctx.wakeAt(g.deadline = Date.now() + SHOW_MS);
  else arm(ctx);
}

function end(ctx, w, timeout) {
  const g = ctx.g;
  g.deadline = 0;
  const pts = [0, count(g.s, 1), count(g.s, 2)];
  const bot = g.side[w - 1] === BOT, wName = w && ctx.name(g.side[w - 1]);
  const out = timeout ? [' (hết giờ)', ' (time out)'] : ['', ''];
  ctx.end({
    mode: g.side.includes(BOT) ? 'bot' : 'pvp', level: ctx.cfg.level + 1,
    title: w ? [`${bot ? 'Máy' : wName} thắng, còn ${pts[w]} quân${out[0]}`, `${bot ? 'Bot' : wName} wins with ${pts[w]} pieces${out[1]}`]
      : [`Hoà ${pts[1]}–${pts[2]}`, `Draw ${pts[1]}–${pts[2]}`],
    ranks: g.side.map((id, i) => ({ id, seat: i + 1 })).filter((x) => x.id !== BOT)
      .map(({ id, seat }) => ({ id, score: pts[seat], won: w === seat, detail: { vs: g.side[2 - seat] === BOT ? 'Máy' : ctx.name(g.side[2 - seat]), moves: g.s.moves } })),
  });
}

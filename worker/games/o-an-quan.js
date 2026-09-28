import { newGame, move, legal, score, winner, botMove } from '../../public/o-an-quan/logic.js';

// Ô ăn quan 1v1 (hoặc với máy nếu phòng chỉ có 1 người) — dùng chung phòng NokiaRoom, giao diện riêng ở /o-an-quan/.
// Hạn giờ mỗi nước tính thêm thời gian client diễn lại các bước rải (STEP_MS mỗi bước).
const TURN_MS = 30_000, BOT_MS = 900, STEP_MS = 170, BOT = 'bot';
const DEPTH = [1, 3, 6];

export default {
  max: 2,
  cfg: { quanNon: true, level: 1 },
  config(cfg, m) {
    const next = { ...cfg };
    if (typeof m.quanNon === 'boolean') next.quanNon = m.quanNon;
    if (DEPTH[m.level] !== undefined) next.level = m.level;
    return next;
  },
  tickMs: 300,
  start(ctx) {
    const g = ctx.g;
    const two = ctx.seats.length === 2 ? [...ctx.seats] : [ctx.seats[0], BOT];
    ctx.cfg.swap = !ctx.cfg.swap; // ván sau đổi người đi trước
    Object.assign(g, { side: ctx.cfg.swap ? two : [two[1], two[0]], s: newGame(ctx.cfg), last: null });
    arm(g, 0);
  },
  msg(ctx, p, m) {
    const g = ctx.g;
    const who = g.side.indexOf(p.id) + 1;
    if (!legal(g.s, who, m.k, m.d)) return false;
    play(ctx, m.k, m.d);
    return true;
  },
  tick(ctx) {
    const g = ctx.g;
    if (Date.now() < g.deadline) return false;
    if (g.s.over) end(ctx, winner(g.s), false);
    else if (g.side[g.s.turn - 1] === BOT) play(ctx, ...botMove(g.s, DEPTH[ctx.cfg.level]));
    else end(ctx, 3 - g.s.turn, true);
    return true;
  },
  view(ctx) {
    const g = ctx.g, s = g.s;
    return {
      side: g.side, names: g.side.map((id) => (id === BOT ? ['Máy', 'Bot'] : ctx.name(id))), b: s.b, big: s.big, cap: s.cap, debt: s.debt,
      turn: s.turn, over: s.over, moves: s.moves, last: g.last, deadline: g.deadline, quanNon: s.quanNon,
    };
  },
};

function arm(g, steps) {
  g.deadline = Date.now() + steps * STEP_MS + (g.side[g.s.turn - 1] === BOT ? BOT_MS : TURN_MS);
}

function play(ctx, k, d) {
  const g = ctx.g;
  const from = { b: g.s.b.slice(), big: g.s.big.slice() };
  const p = g.s.turn;
  const steps = move(g.s, k, d);
  g.last = { p, k, d, from, steps };
  // Hết ván: chờ client diễn xong nước cuối rồi mới hiện kết quả.
  if (g.s.over) g.deadline = Date.now() + steps.length * STEP_MS + 1200;
  else arm(g, steps.length);
}

function end(ctx, w, timeout) {
  const g = ctx.g;
  g.deadline = 0;
  const pts = [0, score(g.s, 1), score(g.s, 2)];
  const humans = g.side.map((id, i) => ({ id, seat: i + 1 })).filter((x) => x.id !== BOT);
  const bot = g.side[w - 1] === BOT, wName = w && ctx.name(g.side[w - 1]);
  ctx.end({
    mode: g.side.includes(BOT) ? 'bot' : 'pvp', level: ctx.cfg.level + 1,
    title: w ? [`${bot ? 'Máy' : wName} thắng ${pts[w]}–${pts[3 - w]}${timeout ? ' (hết giờ)' : ''}`, `${bot ? 'Bot' : wName} wins ${pts[w]}–${pts[3 - w]}${timeout ? ' (time out)' : ''}`]
      : [`Hoà ${pts[1]}–${pts[2]}`, `Draw ${pts[1]}–${pts[2]}`],
    ranks: humans.map(({ id, seat }) => ({ id, score: pts[seat], won: w === seat })).sort((a, b) => b.won - a.won || b.score - a.score),
  });
}

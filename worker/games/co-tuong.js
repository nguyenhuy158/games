import { newGame, move, legal, inCheck, botMove } from '../../public/co-tuong/logic.js';

// Cờ tướng 1v1 (hoặc với máy nếu phòng chỉ có 1 người) — dùng chung phòng NokiaRoom, giao diện riêng ở /co-tuong/.
// Mỗi ván đổi người cầm Đỏ (Đỏ đi trước). Hết giờ một nước = thua. Máy tìm nước có hạn thời gian để giữ CPU của DO.
const TURN_MS = 60_000, BOT_MS = 500, SHOW_MS = 900, BOT = 'bot';
const LEVELS = [[1, 60], [3, 250], [5, 700]]; // [độ sâu tối đa, ms]

export default {
  max: 2,
  slug: 'co-tuong',
  page: '/co-tuong/',
  cfg: { level: 1 },
  config: (cfg, m) => (LEVELS[m.level] ? { ...cfg, level: m.level } : null),
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
    else if (g.side[g.s.turn - 1] === BOT) play(ctx, ...botMove(g.s, ...LEVELS[ctx.cfg.level]));
    else end(ctx, 3 - g.s.turn, true);
    return true;
  },
  view(ctx) {
    const g = ctx.g, s = g.s;
    return {
      side: g.side, names: g.side.map((id) => (id === BOT ? ['Máy', 'Bot'] : ctx.name(id))),
      b: s.b, turn: s.turn, check: !s.over && inCheck(s.b, s.turn), over: s.over, moves: s.moves, last: g.last, deadline: g.deadline,
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
  const cap = move(g.s, from, to);
  g.last = { p, from, to, cap };
  if (g.s.over) ctx.wakeAt(g.deadline = Date.now() + SHOW_MS); // cho thấy nước cuối rồi mới hiện kết quả
  else arm(ctx);
}

function end(ctx, w, timeout) {
  const g = ctx.g;
  g.deadline = 0;
  const bot = g.side[w - 1] === BOT, wName = w && ctx.name(g.side[w - 1]);
  const how = timeout ? [' (hết giờ)', ' (time out)'] : w ? [' — chiếu bí', ' — checkmate'] : ['', ''];
  ctx.end({
    mode: g.side.includes(BOT) ? 'bot' : 'pvp', level: ctx.cfg.level + 1,
    title: w ? [`${bot ? 'Máy' : wName} thắng${how[0]}`, `${bot ? 'Bot' : wName} wins${how[1]}`] : ['Hoà (quá số nước)', 'Draw (move limit)'],
    ranks: g.side.map((id, i) => ({ id, seat: i + 1 })).filter((x) => x.id !== BOT).map(({ id, seat }) => ({
      id, score: Math.ceil(g.s.moves / 2), won: w === seat,
      detail: { vs: g.side[2 - seat] === BOT ? 'Máy' : ctx.name(g.side[2 - seat]), side: seat === 1 ? 'red' : 'black' },
    })),
  });
}

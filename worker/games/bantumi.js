import { newBoard, legal, move, winner, botMove, store } from '../../public/nokia/bantumi/logic.js';

const TURN_MS = 30_000, BOT_MS = 900;
const BOT = 'bot';

// Bantumi 1v1 (hoặc với máy nếu phòng chỉ có 1 người). Mỗi nước 30 giây, hết giờ thua.
// Ván sau đổi người đi trước (người 1 luôn đi trước, nên hai người đổi phía).
export default {
  max: 2,
  page: '/nokia/bantumi/',
  cfg: { seeds: 4 },
  config(cfg, m) {
    return [3, 4, 5, 6].includes(m.seeds) ? { ...cfg, seeds: m.seeds } : null;
  },
  start(ctx) {
    const g = ctx.g;
    const two = ctx.seats.length === 2 ? [...ctx.seats] : [ctx.seats[0], BOT];
    // Đổi bên mỗi ván: nhớ qua cfg (phòng giữ cfg giữa các ván).
    ctx.cfg.swap = !ctx.cfg.swap;
    Object.assign(g, { side: ctx.cfg.swap ? two : [two[1], two[0]], board: newBoard(ctx.cfg.seeds), turn: 1, last: null, moves: 0 });
    arm(ctx);
  },
  msg(ctx, p, m) {
    const g = ctx.g;
    const who = g.side.indexOf(p.id) + 1;
    if (who !== g.turn || !Number.isInteger(m.i) || !legal(g.board, who, m.i)) return false;
    play(ctx, m.i);
    return true;
  },
  tick(ctx) {
    const g = ctx.g;
    if (Date.now() < g.deadline) return false;
    if (g.side[g.turn - 1] === BOT) play(ctx, botMove(g.board, g.turn));
    else end(ctx, 3 - g.turn, 'timeout');
    return true;
  },
  view(ctx) {
    const g = ctx.g;
    return { side: g.side, names: g.side.map((id) => (id === BOT ? ['Máy', 'Bot'] : ctx.name(id))), board: g.board, turn: g.turn, last: g.last, deadline: g.deadline, moves: g.moves };
  },
};

function play(ctx, i) {
  const g = ctx.g;
  const r = move(g.board, g.turn, i);
  g.moves++;
  g.last = { who: g.turn, from: i, path: r.path, captured: r.captured, again: r.again };
  if (r.over) return end(ctx, winner(g.board), 'done');
  if (!r.again) g.turn = 3 - g.turn;
  arm(ctx);
}

// Hạn nước hiện tại (máy thì đánh sau BOT_MS); adapter gọi tick() đúng lúc đó bằng alarm.
function arm(ctx) {
  const g = ctx.g;
  g.deadline = Date.now() + (g.side[g.turn - 1] === BOT ? BOT_MS : TURN_MS);
  ctx.wakeAt(g.deadline);
}

function end(ctx, w, why) {
  const g = ctx.g;
  g.deadline = 0;
  const humans = g.side.map((id, k) => ({ id, seat: k + 1 })).filter((x) => x.id !== BOT);
  const ranks = humans.map(({ id, seat }) => ({ id, score: g.board[store(seat)], won: w === seat }))
    .sort((a, b) => b.won - a.won || b.score - a.score);
  const bot = g.side[w - 1] === BOT, wName = w && ctx.name(g.side[w - 1]);
  const hi = Math.max(g.board[6], g.board[13]), lo = Math.min(g.board[6], g.board[13]), late = why === 'timeout';
  ctx.end({
    mode: g.side.includes(BOT) ? 'bot' : 'pvp', level: ctx.cfg.seeds,
    title: w ? [`${bot ? 'Máy' : wName} thắng ${hi}–${lo}${late ? ' (hết giờ)' : ''}`, `${bot ? 'Bot' : wName} wins ${hi}–${lo}${late ? ' (time out)' : ''}`]
      : [`Hoà ${g.board[6]}–${g.board[13]}`, `Draw ${g.board[6]}–${g.board[13]}`],
    ranks,
  });
}

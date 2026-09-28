import { SIZES, winLine, full, botMove } from '../../public/co-caro/logic.js';
import * as C4 from '../../public/noi-4/logic.js';

// Cờ caro / Nối 4: đánh theo lượt 1v1 (chạy trong adapter phòng chung, giao thức cũ "phẳng" của client).
// 2 người đầu (theo thứ tự vào) cầm quân 1 / 2, còn lại xem; ở một mình thì đánh với máy.
// Mỗi ván mới đổi người đi trước (quân 1 luôn đi trước, nên hai người đổi quân cho nhau); tỉ số tính theo cặp đấu.
// move nhận `m.i` từ client: caro = ô, nối 4 = cột (quân rơi xuống ô trống thấp nhất). -1 = nước không hợp lệ.
const TURN_MS = 30_000; // hết giờ một nước = thua
const BOT_MS = 600; // máy "suy nghĩ" chút cho tự nhiên
const BOT = 'bot';

const RULES = {
  caro: {
    slug: 'co-caro', page: '/co-caro/',
    cfg: { size: 0, block: false },
    config: (cfg, m) => ({ ...cfg, ...(Number.isInteger(m.size) && SIZES[m.size] ? { size: m.size } : {}), ...(typeof m.block === 'boolean' ? { block: m.block } : {}) }),
    cells: (cfg) => SIZES[cfg.size] ** 2,
    place: (g, cfg, i) => (Number.isInteger(i) && i >= 0 && i < g.board.length && !g.board[i] ? i : -1),
    win: (g, cfg, i) => winLine(g.board, SIZES[cfg.size], i, cfg.block),
    bot: (g, cfg) => botMove(g.board, SIZES[cfg.size], g.turn),
    history: (cfg) => ({ level: SIZES[cfg.size], extra: { block: cfg.block } }),
  },
  c4: {
    slug: 'noi-4', page: '/noi-4/',
    cfg: { level: 1 },
    config: (cfg, m) => (Number.isInteger(m.level) && C4.LEVELS[m.level] ? { ...cfg, level: m.level } : cfg),
    cells: () => C4.ROWS * C4.COLS,
    place: (g, cfg, c) => (Number.isInteger(c) && c >= 0 && c < C4.COLS ? C4.drop(g.board, c) : -1),
    win: (g, cfg, i) => C4.winLine(g.board, i),
    bot: (g, cfg) => C4.drop(g.board, C4.botMove(g.board, g.turn, Math.random, cfg.level)),
    history: (cfg) => ({ level: cfg.level, extra: {} }),
  },
};

function duel(R) {
  const arm = (ctx) => {
    const g = ctx.g;
    g.deadline = Date.now() + (g.seats[g.turn - 1] === BOT ? BOT_MS : TURN_MS);
    ctx.wakeAt(g.deadline);
  };
  const finish = (ctx, winner, why, line = null) => {
    const g = ctx.g, keep = ctx.keep;
    Object.assign(g, { over: true, winner, why, line, deadline: 0 });
    if (winner) { const w = g.seats[winner - 1]; keep.score[w] = (keep.score[w] ?? 0) + 1; }
    const vsBot = g.seats.includes(BOT);
    const { level, extra } = R.history(ctx.cfg);
    ctx.end({
      mode: vsBot ? 'bot' : 'pvp', level,
      ranks: g.seats.map((id, k) => [id, k + 1]).filter(([id]) => id !== BOT).map(([id, seat]) => {
        const opp = g.seats[2 - seat];
        return { id, score: g.moves, won: winner === seat, detail: { vs: opp === BOT ? 'Máy' : ctx.name(opp), ...extra, why } };
      }),
    });
  };
  const move = (ctx, i) => {
    const g = ctx.g;
    g.board[i] = g.turn;
    g.last = i;
    g.moves++;
    const line = R.win(g, ctx.cfg, i);
    if (line) return finish(ctx, g.turn, 'five', line);
    if (full(g.board)) return finish(ctx, 0, 'full');
    g.turn = 3 - g.turn;
    arm(ctx);
  };
  return {
    slug: R.slug, page: R.page, max: 2, persist: true, flat: true, emotes: 5, messages: ['move'],
    cfg: R.cfg,
    config: R.config,
    start(ctx) {
      const keep = ctx.keep;
      const two = ctx.seats;
      // Cặp đấu đổi -> điểm cặp cũ bỏ đi.
      const pair = [...two].sort().join('|') || BOT;
      if (keep.pair !== pair) Object.assign(keep, { score: {}, pair, swap: false });
      const seats = two.length === 2 ? [...two] : [two[0], BOT];
      Object.assign(ctx.g, {
        seats: keep.swap ? [seats[1], seats[0]] : seats, board: new Array(R.cells(ctx.cfg)).fill(0),
        turn: 1, last: -1, moves: 0, line: null, winner: 0, why: '', over: false,
      });
      keep.swap = !keep.swap;
      arm(ctx);
    },
    msg(ctx, p, m) {
      const g = ctx.g;
      if (!g?.board || g.over || g.seats.indexOf(p.id) + 1 !== g.turn) return false;
      const i = R.place(g, ctx.cfg, m.i);
      if (i < 0) return false;
      move(ctx, i);
      return true;
    },
    tick(ctx) {
      const g = ctx.g;
      if (!g?.board || g.over || Date.now() < g.deadline) return false;
      if (g.seats[g.turn - 1] === BOT) move(ctx, R.bot(g, ctx.cfg));
      else finish(ctx, 3 - g.turn, 'timeout');
      return true;
    },
    view(ctx) {
      const g = ctx.g ?? {};
      const seats = g.seats ?? [null, null];
      return {
        ...ctx.cfg, board: g.board ?? null, turn: g.turn ?? 1, last: g.last ?? -1, moves: g.moves ?? 0, line: g.line ?? null,
        winner: g.winner ?? 0, why: g.why ?? '', deadline: g.deadline ?? 0, turnMs: TURN_MS, seats, score: ctx.keep.score ?? {},
        // Tên người cầm quân (kể cả khi họ vừa rớt mạng giữa ván).
        names: seats.map((id) => (id === BOT ? 'Máy' : id ? ctx.name(id) : '')),
      };
    },
  };
}

export const caro = duel(RULES.caro);
export const c4 = duel(RULES.c4);

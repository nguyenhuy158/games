import { createGame, turn, step, over, ranking, SPEEDS, MAX } from '../../public/nokia/snake/logic.js';

// Snake: server chạy bước theo tốc độ đã chọn.
// cfg.mode 'arena' = chung 1 sân, tranh mồi, đâm rắn khác là chết; 'solo' = mỗi người 1 sân riêng, hết mạng hết thì so điểm.
const MODES = ['arena', 'solo'];
const worlds = (g) => (g.solo ? g.worlds : [g]);
const snakesOf = (g) => worlds(g).flatMap((w) => w.snakes);
const pick = ({ id, body, alive, score, dir }) => ({ id, body, alive, score, dir });

export default {
  page: '/nokia/snake/',
  max: MAX,
  cfg: { speed: 2, walls: false, mode: 'arena' },
  config(cfg, m) {
    const next = { ...cfg };
    if (Number.isInteger(m.speed) && SPEEDS[m.speed]) next.speed = m.speed;
    if (typeof m.walls === 'boolean') next.walls = m.walls;
    if (MODES.includes(m.mode)) next.mode = m.mode;
    return next;
  },
  volatile: true,
  tickMs: (cfg) => SPEEDS[cfg.speed],
  start(ctx) {
    if (ctx.cfg.mode === 'solo' && ctx.seats.length > 1) {
      Object.assign(ctx.g, { solo: true, worlds: ctx.seats.map((id) => ({ ...createGame([id], ctx.cfg, ctx.rand), events: [] })) });
    } else Object.assign(ctx.g, createGame(ctx.seats, ctx.cfg, ctx.rand), { events: [] });
  },
  msg(ctx, p, m) {
    const s = snakesOf(ctx.g).find((x) => x.id === p.id);
    if (s) turn(s, m.d); // chỉ xếp hàng; nhịp sau mới gửi trạng thái
    return false;
  },
  tick(ctx) {
    const g = ctx.g;
    for (const w of worlds(g)) w.events = w.snakes.some((s) => s.alive) ? step(w, ctx.rand) : [];
    const done = g.solo ? g.worlds.every((w) => over(w)) : over(g);
    if (done) {
      const all = snakesOf(g);
      const multi = all.length > 1;
      // Sân riêng: chỉ so điểm. Sân chung: sống sót trước, rồi điểm.
      const ranks = g.solo ? [...all].sort((a, b) => b.score - a.score) : ranking(g);
      ctx.end({
        mode: g.solo ? 'race' : multi ? 'multi' : 'solo', level: ctx.cfg.speed + 1,
        title: multi ? null : [`${all[0].score} điểm`, `${all[0].score} points`],
        ranks: ranks.map((s, i) => ({ id: s.id, score: s.score, won: multi && i === 0 && (!g.solo || s.score > ranks[1].score) })),
      });
    }
    return true;
  },
  view(ctx, id) {
    const g = ctx.g;
    // Sân riêng: mỗi người xem sân mình; người xem thì xem sân của người đang dẫn đầu còn sống.
    const w = !g.solo ? g : g.worlds.find((x) => x.snakes[0].id === id)
      ?? [...g.worlds].sort((a, b) => (b.snakes[0].alive - a.snakes[0].alive) || (b.snakes[0].score - a.snakes[0].score))[0];
    return {
      solo: !!g.solo, snakes: w.snakes.map(pick), food: w.food, bug: w.bug, walls: w.walls, events: w.events, step: w.step,
      board: snakesOf(g).map(({ id, score, alive }) => ({ id, score, alive })),
    };
  },
};

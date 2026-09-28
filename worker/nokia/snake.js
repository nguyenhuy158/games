import { createGame, turn, step, over, ranking, SPEEDS, MAX } from '../../public/nokia/snake/logic.js';

// Snake: server chạy bước theo tốc độ đã chọn, gửi thân rắn + mồi cho mọi người.
export default {
  max: MAX,
  cfg: { speed: 2, walls: false },
  config(cfg, m) {
    const next = { ...cfg };
    if (Number.isInteger(m.speed) && SPEEDS[m.speed]) next.speed = m.speed;
    if (typeof m.walls === 'boolean') next.walls = m.walls;
    return next;
  },
  volatile: true,
  tickMs: (cfg) => SPEEDS[cfg.speed],
  start(ctx) {
    Object.assign(ctx.g, createGame(ctx.seats, ctx.cfg, ctx.rand), { events: [] });
  },
  msg(ctx, p, m) {
    const s = ctx.g.snakes.find((x) => x.id === p.id);
    // Đổi hướng chỉ cần xếp hàng; nhịp sau mới gửi trạng thái (khỏi broadcast mỗi lần bấm).
    if (s && turn(s, m.d)) return false;
    return false;
  },
  tick(ctx) {
    const g = ctx.g;
    g.events = step(g, ctx.rand);
    if (over(g)) {
      const multi = g.snakes.length > 1;
      ctx.end({
        mode: multi ? 'multi' : 'solo', level: ctx.cfg.speed + 1,
        title: multi ? null : `${g.snakes[0].score} điểm`,
        ranks: ranking(g).map((s, i) => ({ id: s.id, score: s.score, won: multi && i === 0 })),
      });
    }
    return true;
  },
  view(ctx) {
    const g = ctx.g;
    return { snakes: g.snakes.map(({ id, body, alive, score, dir }) => ({ id, body, alive, score, dir })), food: g.food, bug: g.bug, walls: g.walls, events: g.events, step: g.step };
  },
};

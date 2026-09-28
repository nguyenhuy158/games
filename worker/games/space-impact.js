import { createWorld, step, DT } from '../../public/nokia/space-impact/logic.js';

// Space Impact chơi chung: server chạy thế giới 20 lần/giây (cùng step() với test), client chỉ gửi phím đang giữ.
const KEYS = ['up', 'down', 'left', 'right', 'fire'];

export default {
  max: 4,
  cfg: {},
  volatile: true,
  tickMs: DT * 1000,
  start(ctx) {
    Object.assign(ctx.g, { w: createWorld(ctx.seats, ctx.rand) });
  },
  msg(ctx, p, m) {
    const s = ctx.g.w.ships.find((x) => x.id === p.id);
    if (s && m.keys && typeof m.keys === 'object') s.keys = Object.fromEntries(KEYS.map((k) => [k, !!m.keys[k]]));
    return false; // phím có hiệu lực ở nhịp sau
  },
  leave(ctx, id) {
    const s = ctx.g?.w?.ships.find((x) => x.id === id);
    if (s) s.keys = {};
  },
  tick(ctx) {
    const w = ctx.g.w;
    step(w);
    if (w.over) {
      const multi = w.ships.length > 1;
      ctx.end({
        mode: multi ? 'coop' : 'solo', level: w.level,
        title: w.won ? [`Phá đảo! ${w.score} điểm`, `Cleared! ${w.score} points`] : [`Hết mạng ở màn ${w.level} — ${w.score} điểm`, `Out of lives on level ${w.level} — ${w.score} points`],
        ranks: [...w.ships].sort((a, b) => b.score - a.score).map((s) => ({ id: s.id, score: s.score, won: w.won })),
      });
    }
    return true;
  },
  view(ctx) {
    const w = ctx.g.w;
    const r = (v) => Math.round(v * 10) / 10;
    return {
      t: w.t, level: w.level, score: w.score, phase: w.phase, events: w.events, won: w.won,
      ships: w.ships.map((s) => ({ id: s.id, x: r(s.x), y: r(s.y), lives: s.lives, invul: s.invul > 0, score: s.score })),
      bullets: w.bullets.map((b) => [Math.round(b.x), Math.round(b.y)]),
      shots: w.shots.map((s) => [Math.round(s.x), Math.round(s.y)]),
      enemies: w.enemies.map((e) => [e.kind, Math.round(e.x), Math.round(e.y)]),
      items: w.items.map((it) => [Math.round(it.x), Math.round(it.y)]),
      boss: w.boss && { x: Math.round(w.boss.x), y: Math.round(w.boss.y), hp: w.boss.hp, max: w.boss.max },
    };
  },
};

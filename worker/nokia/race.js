// Khuôn "đua cùng đề" cho game Nokia chạy mô phỏng ở client (Rapid Roll, Bounce): server phát hạt giống + giờ xuất phát,
// client tự chạy game của mình và gửi { at: [x, y], score } (vài lần/giây) + { done: true, score } khi chết / về đích;
// server phát lại vị trí mọi người (bóng ma) và chốt xếp hạng khi ai cũng xong hoặc hết giờ.
// ponytail: tin điểm client gửi (game vui, không có tiền thật); muốn chống gian lận thì server phải mô phỏng lại theo input.
export function raceModule({ max = 6, timeMs, better = 'high', cfg = {}, config = null, countdownMs = 3000, extra = () => ({}) }) {
  const rank = (a, b) => (better === 'high' ? b.score - a.score : a.score - b.score);
  return {
    max, cfg, config, tickMs: 250, volatile: true,
    start(ctx) {
      const at = Date.now() + countdownMs;
      Object.assign(ctx.g, { seed: Math.floor(ctx.rand() * 2 ** 31), startAt: at, endsAt: at + timeMs, runners: {}, ...extra(ctx) });
      for (const id of ctx.seats) ctx.g.runners[id] = { at: null, score: 0, done: false, finished: false };
    },
    msg(ctx, p, m) {
      const r = ctx.g.runners[p.id];
      if (!r || r.done || Date.now() < ctx.g.startAt) return false;
      if (Array.isArray(m.at) && m.at.length === 2 && m.at.every(Number.isFinite)) r.at = m.at.map((v) => Math.round(v * 10) / 10);
      if (Number.isFinite(m.score) && m.score >= 0 && m.score < 1e7) r.score = Math.round(m.score);
      if (m.done) { r.done = true; r.finished = !!m.finished; r.t = Date.now() - ctx.g.startAt; check(ctx); }
      return !!m.done; // vị trí thường gửi theo nhịp tick, khỏi broadcast mỗi tin
    },
    tick(ctx) {
      if (Date.now() >= ctx.g.endsAt) {
        for (const r of Object.values(ctx.g.runners)) r.done = true;
        check(ctx);
      }
      return true;
    },
    leave(ctx, id) {
      const r = ctx.g?.runners?.[id];
      if (r && !r.done) { r.done = true; check(ctx); }
    },
    view(ctx) {
      const g = ctx.g;
      return { seed: g.seed, startAt: g.startAt, endsAt: g.endsAt, level: g.level, runners: g.runners };
    },
  };
  function check(ctx) {
    const rs = Object.entries(ctx.g.runners);
    if (!rs.every(([, r]) => r.done) || ctx.g.over) return;
    ctx.g.over = true;
    // Bounce ("low" = thời gian): người về đích xếp trên người chưa về.
    const ranks = rs.map(([id, r]) => ({ id, score: r.score, finished: r.finished })).sort((a, b) => (better === 'low' ? (b.finished - a.finished) || rank(a, b) : rank(a, b)));
    const multi = rs.length > 1;
    ranks.forEach((r, i) => { r.won = multi ? i === 0 && (better === 'high' || r.finished) : better === 'low' && r.finished; });
    ctx.end({ mode: multi ? 'multi' : 'solo', level: ctx.g.level ?? 1, ranks });
  }
}

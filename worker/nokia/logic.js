import { newSecret, valid, score, SLOTS, MAX_GUESSES, TIME_MS } from '../../public/nokia/logic/logic.js';

// Logic: mọi người đoán CÙNG một mã (chỉ ở server). Mỗi người thấy lượt đoán của mình, của người khác chỉ thấy tiến độ.
// Xếp hạng: giải được trước, ít lượt hơn, nhanh hơn. Hết 10 lượt hoặc 5 phút là dừng.
export default {
  max: 6,
  cfg: {},
  tickMs: 1000,
  start(ctx) {
    Object.assign(ctx.g, { secret: newSecret(ctx.rand), boards: {}, endsAt: Date.now() + TIME_MS, startedAt: Date.now() });
    for (const id of ctx.seats) ctx.g.boards[id] = { guesses: [], solved: false, time: 0 };
  },
  msg(ctx, p, m) {
    const b = ctx.g.boards[p.id];
    if (!b || b.solved || b.guesses.length >= MAX_GUESSES || !valid(m.guess)) return false;
    const s = score(ctx.g.secret, m.guess);
    b.guesses.push({ guess: m.guess, ...s });
    if (s.exact === SLOTS) { b.solved = true; b.time = Date.now() - ctx.g.startedAt; }
    if (Object.values(ctx.g.boards).every((x) => x.solved || x.guesses.length >= MAX_GUESSES)) finish(ctx);
    return true;
  },
  tick(ctx) {
    if (Date.now() < ctx.g.endsAt) return false;
    finish(ctx);
    return true;
  },
  view(ctx, id) {
    const g = ctx.g;
    const over = !!g.over;
    return {
      mine: g.boards[id] ?? null,
      secret: over ? g.secret : null, // chỉ lộ mã khi hết ván
      others: Object.fromEntries(Object.entries(g.boards).map(([k, b]) => [k, { n: b.guesses.length, solved: b.solved, best: Math.max(0, ...b.guesses.map((x) => x.exact)) }])),
      endsAt: g.endsAt,
    };
  },
};

function finish(ctx) {
  const g = ctx.g;
  g.over = true;
  const ranks = Object.entries(g.boards).map(([id, b]) => ({ id, score: b.solved ? b.guesses.length : 0, solved: b.solved, time: b.time, n: b.guesses.length }))
    .sort((a, b) => (b.solved - a.solved) || (a.n - b.n) || (a.time - b.time));
  ranks.forEach((r, i) => { r.won = r.solved && (ctx.seats.length === 1 || i === 0); });
  const solo = ctx.seats.length === 1;
  ctx.end({ mode: solo ? 'solo' : 'multi', title: solo ? (ranks[0].solved ? [`Giải được sau ${ranks[0].n} lượt`, `Cracked in ${ranks[0].n} guesses`] : ['Chưa giải được mã', 'Code not cracked']) : null, ranks });
}

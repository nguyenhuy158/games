import { newDeck, flip, done } from '../../public/nokia/pairs/logic.js';

const TURN_MS = 20_000, SHOW_MS = 1200;

// Pairs: cả phòng chung một bàn, lần lượt lật 2 lá; trúng cặp thì được điểm và lật tiếp.
// Hình các lá úp chỉ ở server; view chỉ lộ lá đã ăn + lá đang mở. Hết giờ thì mất lượt.
export default {
  page: '/nokia/pairs/',
  max: 6,
  cfg: {},
  tickMs: 250,
  start(ctx) {
    Object.assign(ctx.g, {
      deck: newDeck(ctx.rand), owner: new Array(24).fill(null), open: [], turn: 0, score: {}, moves: 0,
      hideAt: 0, deadline: Date.now() + TURN_MS,
    });
    for (const id of ctx.seats) ctx.g.score[id] = 0;
  },
  msg(ctx, p, m) {
    const g = ctx.g;
    if (g.hideAt || ctx.seats[g.turn] !== p.id) return false;
    const r = flip(g, m.i);
    if (!r) return false;
    if (r === 'match') {
      for (const i of g.open) g.owner[i] = p.id;
      g.open = [];
      g.score[p.id]++;
      g.moves++;
      g.deadline = Date.now() + TURN_MS;
      if (done(g)) finish(ctx);
    } else if (r === 'miss') {
      g.moves++;
      g.hideAt = Date.now() + SHOW_MS; // cho mọi người nhìn 2 lá rồi mới úp lại
    }
    return true;
  },
  tick(ctx) {
    const g = ctx.g;
    const now = Date.now();
    if (g.hideAt && now >= g.hideAt) { g.open = []; g.hideAt = 0; nextTurn(ctx); return true; }
    if (!g.hideAt && now >= g.deadline) { g.open = []; nextTurn(ctx); return true; }
    return false;
  },
  leave(ctx, id) {
    // Người đang tới lượt rời phòng: chuyển lượt luôn.
    if (ctx.g?.owner && ctx.seats[ctx.g.turn] === id) { ctx.g.open = []; ctx.g.hideAt = 0; nextTurn(ctx); }
  },
  view(ctx) {
    const g = ctx.g;
    return {
      cards: g.deck.map((v, i) => (g.owner[i] != null || g.open.includes(i) ? v : -1)),
      owner: g.owner, open: g.open, turn: ctx.seats[g.turn], score: g.score, moves: g.moves, deadline: g.hideAt ? 0 : g.deadline,
    };
  },
};

function nextTurn(ctx) {
  const g = ctx.g;
  const online = ctx.online();
  // Bỏ qua người đã rời phòng.
  for (let k = 1; k <= ctx.seats.length; k++) {
    const t = (g.turn + k) % ctx.seats.length;
    if (online.has(ctx.seats[t])) { g.turn = t; break; }
  }
  g.deadline = Date.now() + TURN_MS;
}

function finish(ctx) {
  const g = ctx.g;
  const solo = ctx.seats.length === 1;
  const ranks = ctx.seats.map((id) => ({ id, score: solo ? g.moves : g.score[id] })).sort((a, b) => (solo ? a.score - b.score : b.score - a.score));
  const top = ranks[0]?.score;
  ranks.forEach((r) => { r.won = !solo && r.score === top && ranks.filter((x) => x.score === top).length === 1; });
  ctx.end({ mode: solo ? 'solo' : 'multi', title: solo ? [`Xong trong ${g.moves} lượt`, `Done in ${g.moves} turns`] : null, ranks });
}

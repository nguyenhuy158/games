import { newCard, nextNumber, canMark, wonRow } from '../../public/loto/logic.js';

// Lô tô nhiều người (dùng chung phòng NokiaRoom, giao diện riêng ở /loto/). Mỗi người một phiếu, chỉ gửi cho chủ phiếu.
// Chủ phòng gọi số (ván bắt đầu thì tự gọi số đầu tiên); người chơi tự dò số đã gọi trên phiếu, server kiểm lại.
// Ai kín một hàng trước là KINH, hết ván. Gọi hết 90 số mà chưa ai kinh thì hết ván không ai thắng.
// Vào giữa ván vẫn được phát phiếu (còn ghế); rớt mạng vào lại thì giữ phiếu cũ.
const MAX = 12;

export default {
  slug: 'loto',
  page: '/loto/',
  max: MAX,
  cfg: {},
  start(ctx) {
    Object.assign(ctx.g, { called: [], cards: {}, marked: {} });
    for (const id of ctx.seats) deal(ctx, id);
    call(ctx);
  },
  join(ctx, p) {
    if (ctx.g.cards[p.id] || ctx.seats.length >= MAX) return;
    ctx.seats.push(p.id);
    deal(ctx, p.id);
  },
  msg(ctx, p, m) {
    const g = ctx.g;
    if (m.a === 'call') return ctx.host() === p.id && call(ctx);
    if (m.a !== 'mark' || !g.cards[p.id] || !canMark(g.cards[p.id], g.called, g.marked[p.id], m.i)) return false;
    g.marked[p.id].push(m.i);
    if (wonRow(g.cards[p.id], g.marked[p.id]) >= 0) finish(ctx, p.id);
    return true;
  },
  view(ctx, id) {
    const g = ctx.g;
    return {
      called: g.called, card: g.cards[id] ?? null, marked: g.marked[id] ?? [],
      counts: Object.fromEntries(Object.entries(g.marked).map(([k, v]) => [k, v.length])),
    };
  },
};

function deal(ctx, id) {
  ctx.g.cards[id] = newCard(ctx.rand);
  ctx.g.marked[id] = [];
}

function call(ctx) {
  const g = ctx.g;
  const n = nextNumber(g.called, ctx.rand);
  if (n == null) finish(ctx, null);
  else g.called.push(n);
  return true;
}

// Xếp hạng: người kinh trước, còn lại theo số ô đã dò. level = số số đã gọi.
function finish(ctx, winner) {
  const g = ctx.g;
  const name = winner && ctx.name(winner);
  ctx.end({
    level: g.called.length,
    title: winner ? [`${name} KINH!`, `${name} wins — KINH!`] : ['Gọi hết 90 số, không ai kinh', 'All 90 numbers called — no winner'],
    ranks: Object.keys(g.cards)
      .map((id) => ({ id, score: g.marked[id].length, won: id === winner }))
      .sort((a, b) => b.won - a.won || b.score - a.score),
  });
}

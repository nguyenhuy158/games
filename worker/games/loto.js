import { PER_ROW, COLOR_COUNT, MAX_CARDS, PACES, newCard, cardKey, nextNumber, canMark, cellsOf, kinhRows, bestRow, bestMarked } from '../../public/loto/logic.js';

// Lô tô nhiều người (dùng chung phòng NokiaRoom, giao diện riêng ở /loto/). Mỗi người cầm 1–6 tờ dò 9×9 riêng (chỉ gửi cho chủ tờ),
// các tờ trong phòng không trùng nhau. Đầu ván là lúc mua tờ: trước số đầu tiên, mỗi người chọn màu (mỗi màu một tờ) và đổi tờ khác
// được; lựa chọn giữ cho các ván sau (ctx.keep). Chủ phòng bấm "Bắt đầu hô": bốc một số 1–90 không lặp, cả phòng thấy cùng lúc;
// sau đó server tự hô mỗi `pace` giây (hẹn giờ bằng alarm của phòng nên tab chủ phòng ẩn / rớt mạng vẫn hô tiếp), chủ phòng đổi
// tốc độ hoặc tắt (0 = tự bấm) lúc nào cũng được. Người chơi tự dò (chạm ô để đặt hạt) hoặc bật "tự dò" (server đánh hộ mỗi lần
// hô). Hàng ngang nào đủ 5 số đã hô thì bấm KINH: server kiểm theo số đã hô — sai là "kinh láo" (báo cả phòng, không mất gì),
// đúng thì dừng hô, chờ KINH_MS cho ai cũng kinh lúc đó (cùng số thì chia giải) rồi hết ván. Hô hết 90 số mà chưa ai kinh thì hết
// ván không ai thắng. Vào giữa ván vẫn được phát tờ (còn ghế); rớt mạng vào lại thì giữ tờ cũ.
const MAX = 12;
const KINH_MS = 4000; // dừng hô để dò vé, ai cũng kinh trong lúc này thì chia giải
const LAO_MS = 1500; // chống bấm "kinh láo" liên tục

export default {
  slug: 'loto',
  page: '/loto/',
  max: MAX,
  cfg: { pace: 5 },
  config(cfg, m) {
    return PACES.includes(m.pace) ? { ...cfg, pace: m.pace } : null;
  },
  start(ctx) {
    Object.assign(ctx.g, { called: [], cards: {}, colors: {}, marked: {}, kinh: null, pace: ctx.cfg.pace ?? 0, next: 0 });
    for (const id of ctx.seats) deal(ctx, id);
  },
  join(ctx, p) {
    if (ctx.g.cards[p.id] || ctx.seats.length >= MAX) return;
    ctx.seats.push(p.id);
    deal(ctx, p.id);
  },
  msg(ctx, p, m) {
    const g = ctx.g, id = p.id;
    if (m.a === 'call') return ctx.host() === id && !g.kinh && call(ctx);
    if (m.a === 'pace') {
      if (ctx.host() !== id || !PACES.includes(m.s)) return false;
      g.pace = m.s;
      if (g.called.length && !g.kinh) schedule(ctx);
      return true;
    }
    if (!g.cards[id]) return false;
    if (m.a === 'pick') return !g.called.length && pick(ctx, id, m.colors);
    if (m.a === 'swap') {
      if (g.called.length || !Number.isInteger(m.k) || !g.cards[id][m.k]) return false;
      g.cards[id][m.k] = uniqueCard(ctx);
      return true;
    }
    if (m.a === 'mark') {
      if (!canMark(g.cards[id], g.called, g.marked[id], m.i)) return false;
      g.marked[id].push(m.i);
      return true;
    }
    if (m.a === 'auto') {
      if (typeof m.on !== 'boolean') return false;
      ctx.keep.auto ??= {};
      ctx.keep.auto[id] = m.on;
      if (m.on) autoMark(ctx, id, g.called);
      return true;
    }
    if (m.a === 'kinh') return kinh(ctx, id);
    return false;
  },
  // Tới giờ đã hẹn: hết giờ dò vé sau tiếng KINH đầu tiên thì hết ván, không thì tự hô số kế tiếp.
  tick(ctx) {
    const g = ctx.g, now = ctx.now();
    if (g.kinh) {
      if (now < g.kinh.until) return false;
      finish(ctx);
      return true;
    }
    if (!g.pace || !g.next || now < g.next) return false;
    return call(ctx);
  },
  view(ctx, id) {
    const g = ctx.g;
    return {
      called: g.called, cards: g.cards[id] ?? null, colors: g.colors[id] ?? [], marked: g.marked[id] ?? [], auto: !!ctx.keep.auto?.[id],
      best: Object.fromEntries(Object.keys(g.cards).map((k) => [k, bestMarked(g.cards[k], g.marked[k])])),
      kinh: g.kinh, pace: g.pace, next: g.next,
    };
  },
};

// Phát tờ cho một người: màu đã chọn ở ván trước, chưa chọn thì một tờ màu ít người dùng nhất; số không trùng tờ nào đang có.
function deal(ctx, id) {
  const g = ctx.g;
  const used = Array(COLOR_COUNT).fill(0);
  for (const cs of Object.values(g.colors)) for (const c of cs) used[c]++;
  const least = Math.min(...used), free = used.flatMap((n, c) => (n === least ? [c] : []));
  g.colors[id] = ctx.keep.picks?.[id] ?? [free[Math.floor(ctx.rand() * free.length)]];
  g.cards[id] = [];
  for (let k = 0; k < g.colors[id].length; k++) g.cards[id].push(uniqueCard(ctx));
  g.marked[id] = [];
  if (ctx.keep.auto?.[id]) autoMark(ctx, id, g.called);
}

// Mua tờ: 1–MAX_CARDS màu khác nhau theo thứ tự tờ; màu đã có giữ nguyên tờ đó, màu mới thì phát tờ mới.
function pick(ctx, id, colors) {
  if (!Array.isArray(colors) || !colors.length || colors.length > MAX_CARDS || new Set(colors).size !== colors.length
    || !colors.every((c) => Number.isInteger(c) && c >= 0 && c < COLOR_COUNT)) return false;
  const g = ctx.g, old = g.colors[id];
  const next = colors.map((c) => g.cards[id][old.indexOf(c)] ?? null);
  g.cards[id] = next.filter(Boolean); // tờ trả lại không còn tính trùng
  for (let k = 0; k < next.length; k++) {
    if (next[k]) continue;
    next[k] = uniqueCard(ctx);
    g.cards[id].push(next[k]);
  }
  g.cards[id] = next;
  g.colors[id] = [...colors];
  g.marked[id] = [];
  ctx.keep.picks ??= {};
  ctx.keep.picks[id] = g.colors[id];
  return true;
}

function uniqueCard(ctx) {
  const used = new Set(Object.values(ctx.g.cards).flat().map(cardKey));
  for (;;) {
    const card = newCard(ctx.rand);
    if (!used.has(cardKey(card))) return card;
  }
}

function autoMark(ctx, id, nums) {
  const g = ctx.g;
  for (const n of nums) for (const i of cellsOf(g.cards[id], n)) if (!g.marked[id].includes(i)) g.marked[id].push(i);
}

function call(ctx) {
  const g = ctx.g;
  const n = nextNumber(g.called, ctx.rand);
  if (n == null) finish(ctx);
  else {
    g.called.push(n);
    for (const id of Object.keys(g.cards)) if (ctx.keep.auto?.[id]) autoMark(ctx, id, [n]);
    schedule(ctx);
  }
  return true;
}

// Hẹn lần tự hô kế tiếp (tắt tự hô thì bỏ hẹn: alarm cũ tới vẫn chạy tick nhưng next = 0 nên không hô).
function schedule(ctx) {
  const g = ctx.g;
  g.next = g.pace ? ctx.now() + g.pace * 1000 : 0;
  if (g.next) ctx.wakeAt(g.next);
}

// KINH: có hàng đủ 5 số đã hô thì ghi tên (và hàng) vào danh sách thắng, tiếng kinh đầu tiên dừng hô và hẹn giờ hết ván.
function kinh(ctx, id) {
  const g = ctx.g;
  if (g.kinh?.wins.some((w) => w.id === id)) return false;
  const rows = kinhRows(g.cards[id], g.called);
  if (!rows.length) {
    if (ctx.allow(`${id}:kinh`, LAO_MS)) ctx.sendAll({ t: 'loto', e: 'lao', id });
    return false;
  }
  if (!g.kinh) {
    g.kinh = { n: g.called.at(-1), until: ctx.now() + KINH_MS, wins: [] };
    g.next = 0;
    ctx.wakeAt(g.kinh.until);
  }
  g.kinh.wins.push({ id, rows: rows.map(({ k, r, nums }) => ({ k, r, nums })) });
  return true;
}

// Xếp hạng: người kinh trước, còn lại theo hàng gần kinh nhất (số đã hô trên hàng đó). level = số số đã hô.
function finish(ctx) {
  const g = ctx.g, wins = g.kinh?.wins ?? [];
  const names = wins.map((w) => ctx.name(w.id)).join(', ');
  const row = wins.length === 1 ? ` (${wins[0].rows[0].nums.join(' · ')})` : '';
  ctx.end({
    level: g.called.length,
    title: !wins.length ? ['Hô hết 90 số, không ai kinh', 'All 90 numbers called — no winner']
      : wins.length === 1 ? [`${names} KINH!${row}`, `${names} wins — KINH!${row}`]
        : [`${names} cùng KINH — chia giải!`, `${names} share the win — KINH!`],
    ranks: Object.keys(g.cards)
      .map((id) => {
        const won = wins.some((w) => w.id === id);
        return { id, won, score: won ? PER_ROW : Math.min(PER_ROW - 1, bestRow(g.cards[id], g.called)) };
      })
      .sort((a, b) => b.won - a.won || b.score - a.score),
  });
}

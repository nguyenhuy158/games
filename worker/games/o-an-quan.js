import { newGame, move, legal, score, winner, botMove, MAX_PLAYERS } from '../../public/o-an-quan/logic.js';

// Ô ăn quan 2–5 người — dùng chung phòng NokiaRoom, giao diện riêng ở /o-an-quan/.
// Chủ phòng chọn số người (cfg.n); ghế còn trống do máy chơi (phòng 1 người = đấu với máy). Vào đông hơn cfg.n thì bàn nới ra.
// Hạn giờ mỗi nước tính thêm thời gian client diễn lại các bước rải (STEP_MS mỗi bước).
// Hết giờ: 2 người thì thua; 3+ người thì máy đi hộ (một ghế bỏ đi không làm cả bàn dừng), 2 lần liền thì máy đi luôn cho nhanh.
const TURN_MS = 30_000, BOT_MS = 900, STEP_MS = 170;
const DEPTH = [1, 3, 6];
const AFK = 2;
const isBot = (id) => id === 'bot' || id.startsWith('bot:'); // id thiết bị luôn dài >= 8 và không có ':' ('bot' = ván lưu từ bản cũ)

export default {
  max: MAX_PLAYERS,
  page: '/o-an-quan/',
  cfg: { quanNon: true, level: 1, n: 2 },
  config(cfg, m) {
    const next = { ...cfg };
    if (typeof m.quanNon === 'boolean') next.quanNon = m.quanNon;
    if (DEPTH[m.level] !== undefined) next.level = m.level;
    if (Number.isInteger(m.n) && m.n >= 2 && m.n <= MAX_PLAYERS) next.n = m.n;
    return next;
  },
  start(ctx) {
    const g = ctx.g;
    const n = Math.max(ctx.cfg.n ?? 2, ctx.seats.length);
    const all = [...ctx.seats, ...Array.from({ length: n - ctx.seats.length }, (_, i) => `bot:${i + 1}`)];
    // Mỗi ván người đi trước lùi một ghế.
    const rot = (ctx.keep.rot = ((ctx.keep.rot ?? -1) + 1) % n);
    Object.assign(g, { side: [...all.slice(rot), ...all.slice(0, rot)], s: newGame({ quanNon: ctx.cfg.quanNon, n }), last: null, afk: Array(n).fill(0) });
    arm(ctx, 0);
  },
  msg(ctx, p, m) {
    const g = ctx.g;
    const who = g.side.indexOf(p.id) + 1;
    if (!legal(g.s, who, m.k, m.d)) return false;
    (g.afk ??= Array(g.side.length).fill(0))[who - 1] = 0;
    play(ctx, m.k, m.d);
    return true;
  },
  tick(ctx) {
    const g = ctx.g;
    if (Date.now() < g.deadline) return false;
    const k = g.s.turn - 1;
    if (g.s.over) end(ctx, winner(g.s), false);
    else if (isBot(g.side[k])) play(ctx, ...botMove(g.s, g.side.length > 2 ? Math.min(4, DEPTH[ctx.cfg.level]) : DEPTH[ctx.cfg.level])); // 3+ người: cây to, giữ CPU của DO
    else if (g.side.length === 2) end(ctx, 3 - g.s.turn, true);
    else { (g.afk ??= Array(g.side.length).fill(0))[k]++; play(ctx, ...botMove(g.s, 1)); }
    return true;
  },
  view(ctx) {
    const g = ctx.g, s = g.s;
    const bots = g.side.filter(isBot).length;
    return {
      side: g.side, bot: g.side.map(isBot),
      names: g.side.map((id) => (isBot(id) ? (bots > 1 ? [`Máy ${id.slice(4)}`, `Bot ${id.slice(4)}`] : ['Máy', 'Bot']) : ctx.name(id))),
      b: s.b, big: s.big, cap: s.cap, debt: s.debt, turn: s.turn, over: s.over, moves: s.moves, last: g.last, deadline: g.deadline, quanNon: s.quanNon,
    };
  },
};

// Hạn nước hiện tại; adapter gọi tick() đúng lúc đó bằng alarm.
function arm(ctx, steps) {
  const g = ctx.g, k = g.s.turn - 1;
  const fast = isBot(g.side[k]) || g.afk?.[k] >= AFK;
  g.deadline = Date.now() + steps * STEP_MS + (fast ? BOT_MS : TURN_MS);
  ctx.wakeAt(g.deadline);
}

function play(ctx, k, d) {
  const g = ctx.g;
  const from = { b: g.s.b.slice(), big: g.s.big.slice() };
  const p = g.s.turn;
  const steps = move(g.s, k, d);
  g.last = { p, k, d, from, steps };
  // Hết ván: chờ client diễn xong nước cuối rồi mới hiện kết quả.
  if (g.s.over) ctx.wakeAt(g.deadline = Date.now() + steps.length * STEP_MS + 1200);
  else arm(ctx, steps.length);
}

function end(ctx, w, timeout) {
  const g = ctx.g;
  g.deadline = 0;
  const pts = [0, ...g.side.map((_, i) => score(g.s, i + 1))];
  const nm = (i) => (isBot(g.side[i - 1]) ? ['Máy', 'Bot'] : [ctx.name(g.side[i - 1]), ctx.name(g.side[i - 1])]);
  // Tỉ số: 2 người "thắng–thua"; đông hơn thì điểm cả bàn theo thứ tự ghế.
  const tally = pts.length === 3 ? (w ? `${pts[w]}–${pts[3 - w]}` : `${pts[1]}–${pts[2]}`) : pts.slice(1).join('–');
  const out = [timeout ? ' (hết giờ)' : '', timeout ? ' (time out)' : ''];
  const order = g.side.map((id, i) => ({ id, seat: i + 1 })).sort((a, b) => pts[b.seat] - pts[a.seat]);
  ctx.end({
    mode: g.side.some(isBot) ? 'bot' : 'pvp', level: ctx.cfg.level + 1,
    title: w ? [`${nm(w)[0]} thắng ${tally}${out[0]}`, `${nm(w)[1]} wins ${tally}${out[1]}`] : [`Hoà ${tally}`, `Draw ${tally}`],
    ranks: order.filter((x) => !isBot(x.id)).map(({ id, seat }) => ({
      id, score: pts[seat], won: w === seat, detail: { rank: order.findIndex((x) => x.seat === seat) + 1, of: g.side.length },
    })),
  });
}

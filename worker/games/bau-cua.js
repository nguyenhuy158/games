import { SYMBOLS, CHIPS, START_COINS, RESCUE, roll, settle, betTotal } from '../../public/bau-cua/logic.js';

// Bầu cua (chạy trong adapter phòng chung, không có sảnh chờ: ván chạy liên tục từ lúc mở phòng; giao thức cũ "phẳng").
// Cược công khai; xúc xắc chỉ tung lúc mở bát (cược đã khoá) nên không có gì để gian lận.
//   house (mặc định): máy làm cái, ai cũng được đặt · rotate: người làm cái xoay vòng mỗi ván (ăn/chung bằng xu của mình).
// Ở một mình thì luôn là máy làm cái. Lãi/lỗ cả buổi ghi vào lịch sử lúc rời phòng.
const SHAKE_MS = 2500; // client lắc bát trong lúc này rồi mới mở
const SHOW_MS = 7000; // từ lúc bấm mở bát tới ván mới
const AFK_MS = 30_000; // cái ngồi im quá lâu thì ai cũng mở bát được
const MODES = ['rotate', 'house'];

const purse = (g, id) => (g.purse[id] ??= { coins: START_COINS, net: 0, rounds: 0, rescues: 0 });

// Người làm cái ván này (null = máy). Cái rời phòng thì người kế tiếp lên thay.
function dealerId(ctx) {
  const g = ctx.g;
  if (g.phase === 'show') return g.dealer;
  const ids = ctx.online();
  const online = ctx.order().filter((id) => ids.has(id));
  if (g.mode === 'house' || online.length < 2) return null;
  return online[g.dealerIdx % online.length];
}

// Người vào/ra làm đổi cái giữa lúc cược: cái mới không được giữ cược (trả lại xu).
function dropDealerBets(ctx) {
  if (ctx.g.phase === 'bet') delete ctx.g.bets[dealerId(ctx)];
}

function doRoll(ctx, dealer) {
  const g = ctx.g;
  // Chỉ tính cược của người đang online và không phải cái.
  const online = ctx.online();
  const bets = Object.fromEntries(Object.entries(g.bets).filter(([id, b]) => id !== dealer && online.has(id) && betTotal(b)));
  if (!Object.keys(bets).length) return false;
  const dice = roll(ctx.rand);
  const deltas = settle(bets, dice);
  if (dealer) deltas[dealer] = -Object.values(deltas).reduce((a, x) => a + x, 0);
  for (const [id, d] of Object.entries(deltas)) {
    const p = purse(g, id);
    p.coins += d;
    p.net += d;
    p.rounds++;
  }
  Object.assign(g, { phase: 'show', phaseAt: Date.now(), dice, deltas, dealer, bets });
  ctx.wakeAt(g.phaseAt + SHOW_MS);
  return true;
}

export default {
  slug: 'bau-cua', page: '/bau-cua/', max: 10, maxOnline: 10, autostart: true, flat: true,
  messages: ['mode', 'bet', 'unbet', 'roll'],
  cfg: {},
  start(ctx) {
    Object.assign(ctx.g, { mode: 'house', dealerIdx: 0, phase: 'bet', phaseAt: Date.now(), round: 1, bets: {}, dice: null, deltas: null, dealer: null, purse: {} });
    for (const id of ctx.seats) purse(ctx.g, id);
  },
  join(ctx, p) {
    purse(ctx.g, p.id);
    dropDealerBets(ctx);
  },
  msg(ctx, p, m) {
    const g = ctx.g;
    const dealer = dealerId(ctx);
    const betting = g.phase === 'bet';
    switch (m.t) {
      case 'mode':
        if (!betting || ctx.host() !== p.id || !MODES.includes(m.mode)) return false;
        g.mode = m.mode;
        dropDealerBets(ctx); // sang xoay cái: cái mới được trả lại cược
        return true;
      case 'bet': {
        if (!betting || p.id === dealer || !Number.isInteger(m.s) || !SYMBOLS[m.s] || !CHIPS.includes(m.amt)) return false;
        const b = (g.bets[p.id] ??= SYMBOLS.map(() => 0));
        if (betTotal(b) + m.amt > purse(g, p.id).coins) return false;
        b[m.s] += m.amt;
        return true;
      }
      case 'unbet':
        if (!betting || !g.bets[p.id]) return false;
        if (Number.isInteger(m.s) && SYMBOLS[m.s]) g.bets[p.id][m.s] = 0;
        else delete g.bets[p.id];
        return true;
      case 'roll': {
        if (!betting) return false;
        const afk = Date.now() - g.phaseAt > AFK_MS;
        const may = dealer ? p.id === dealer : p.id === ctx.host();
        return (may || afk) && doRoll(ctx, dealer);
      }
      default:
        return false;
    }
  },
  // Hết giờ xem kết quả -> ván mới: xoay cái, xoá cược, cứu trợ người hết xu.
  tick(ctx) {
    const g = ctx.g;
    if (g.phase !== 'show' || Date.now() - g.phaseAt < SHOW_MS) return false;
    if (g.dealer) g.dealerIdx++;
    for (const p of Object.values(g.purse)) {
      if (p.coins < CHIPS[0]) { p.coins += RESCUE; p.rescues++; }
    }
    Object.assign(g, { phase: 'bet', phaseAt: Date.now(), round: g.round + 1, bets: {}, dice: null, deltas: null, dealer: null });
    return true;
  },
  // Rời phòng: lưu lãi/lỗ cả buổi (người đã đăng nhập), bỏ cược đang đặt. Vào lại thì tính buổi mới.
  leave(ctx, id) {
    const g = ctx.g;
    const p = g.purse[id], user = ctx.players[id]?.user;
    if (p && user && p.rounds) {
      ctx.record([{
        sub: user.sub, name: user.name, game: 'bau-cua', mode: g.mode, score: p.net, level: p.rounds, won: p.net > 0,
        detail: JSON.stringify({ coins: p.coins, rescues: p.rescues }),
      }]);
      p.net = 0;
      p.rounds = 0;
    }
    if (g.phase === 'bet') delete g.bets[id];
    dropDealerBets(ctx);
  },
  view(ctx) {
    const g = ctx.g;
    const online = ctx.online();
    return {
      mode: g.mode, phase: g.phase, phaseAt: g.phaseAt, round: g.round, shakeMs: SHAKE_MS, showMs: SHOW_MS, afkMs: AFK_MS,
      dealer: dealerId(ctx), bets: g.bets, dice: g.dice, deltas: g.deltas,
      players: ctx.order().filter((id) => online.has(id)).map((id) => {
        const p = purse(g, id);
        return { id, name: ctx.name(id), coins: p.coins, net: p.net, rescues: p.rescues };
      }),
    };
  },
};

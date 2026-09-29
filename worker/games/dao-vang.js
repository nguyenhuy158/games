import {
  MAX_PLAYERS, VERSUS_LEVELS, teamTarget, createWorld, step, shoot, dynamite, shopOffer, snapOf,
} from '../../public/dao-vang/logic.js';

// Đào Vàng nhiều người (chạy trong adapter phòng chung, giao thức cũ "phẳng"): server chạy vật lý thật (cùng hàm step()
// với bản 1 người), client chỉ gửi lệnh và vẽ lại theo tin riêng 'world' (mỏ mới) / 'snap' (20 lần/giây) / 'ev' (sự kiện).
//   coop:   quỹ tiền chung, mục tiêu x crowd(n), thua khi không đủ tiền.
//   versus: ví riêng, chơi VERSUS_LEVELS màn, nhiều tiền nhất thắng.
// Giữa các màn là tiệm (g.phase 'shop', client thấy status 'shop'); adapter vẫn coi là đang chơi.
const TICK_MS = 50;
const SHOP_MS = 20_000;
const SNAP_TAPE_MS = 90; // bản xem lại chỉ giữ ~10 snap/giây (client vẫn nội suy được, băng nhỏ một nửa)
const MODES = ['coop', 'versus'];

// Người ngoài 4 ghế (vào sau / vào giữa ván) là khán giả, ván sau được chơi. Chưa có ván nào thì xét theo thứ tự vào phòng.
function spec(ctx, id) {
  if (ctx.g?.pl) return !ctx.seats.includes(id);
  const online = ctx.online();
  return ctx.order().filter((i) => online.has(i)).indexOf(id) >= MAX_PLAYERS;
}
// Người đang chơi: cầm ghế và còn online hoặc còn thợ mỏ trong màn đang chạy.
const active = (ctx) => {
  const online = ctx.online();
  return ctx.seats.filter((id) => online.has(id) || ctx.g.world?.miners.some((m) => m.id === id));
};
const moneyState = (ctx) => ({ team: ctx.g.team, players: Object.fromEntries(active(ctx).map((id) => [id, ctx.g.pl[id].money])) });

function beginLevel(ctx) {
  const g = ctx.g;
  g.world = createWorld(g.level, active(ctx).map((id) => ({ id, dynamite: g.pl[id].dynamite, buffs: g.pl[id].buffs })));
  Object.assign(g, { phase: 'playing', last: Date.now() });
  ctx.sendAll({ t: 'world', world: g.world });
}

function endLevel(ctx) {
  const g = ctx.g, coop = ctx.cfg.mode === 'coop';
  // Thuốc nổ còn dư mang sang màn sau; đồ mua chỉ có tác dụng một màn.
  for (const m of g.world.miners) if (g.pl[m.id]) g.pl[m.id].dynamite = m.dynamite;
  const ids = active(ctx);
  const target = teamTarget(g.level, ids.length);
  if ((coop && g.team < target) || (!coop && g.level >= VERSUS_LEVELS)) {
    const ranking = ids.map((id) => ({ id, name: ctx.name(id), money: g.pl[id].money })).sort((a, b) => b.money - a.money);
    Object.assign(g, { phase: 'ended', world: null });
    // coop: màn đạt được là thành tích (luôn "thua" ở màn cuối).
    ctx.end({
      ...(coop ? { win: false, team: g.team, target } : { win: true, winner: ranking[0]?.id }), ranking, mode: ctx.cfg.mode, level: g.level,
      ranks: ranking.map((r, k) => ({ id: r.id, score: r.money, won: !coop && k === 0, detail: { team: coop ? g.team : undefined, rank: k + 1, of: ranking.length } })),
    });
    return;
  }
  Object.assign(g, { phase: 'shop', shopEndsAt: Date.now() + SHOP_MS });
  for (const id of ids) Object.assign(g.pl[id], { offer: shopOffer(g.level + 1, Math.random), bought: {}, ready: false });
}

function nextLevel(ctx) {
  const g = ctx.g;
  for (const id of active(ctx)) {
    const p = g.pl[id], b = p.bought ?? {};
    p.buffs = { strength: !!b.strength, clover: !!b.clover, rockBook: !!b.rockBook, polish: !!b.polish };
    if (b.dynamite) p.dynamite++;
    Object.assign(p, { offer: null, bought: null, ready: false });
  }
  g.level++;
  beginLevel(ctx);
}

const allReady = (ctx) => active(ctx).every((id) => ctx.g.pl[id].ready);

export default {
  slug: 'dao-vang', page: '/dao-vang/', max: MAX_PLAYERS, maxOnline: 8, flat: true, tickMs: TICK_MS,
  messages: ['shoot', 'dyn', 'buy', 'ready'],
  cfg: { mode: 'coop' },
  config: (cfg, m) => (MODES.includes(m.mode) ? { ...cfg, mode: m.mode } : null),
  start(ctx) {
    const pl = Object.fromEntries(ctx.seats.map((id) => [id, { money: 0, dynamite: 0, buffs: {}, offer: null, bought: null, ready: false }]));
    Object.assign(ctx.g, { level: 1, team: 0, pl, shopEndsAt: 0, tapeAt: 0 });
    ctx.send(ctx.seats[0], { t: 'me', id: ctx.seats[0] }); // đầu băng xem lại: xem theo góc người chơi đầu (client đang chơi bỏ qua)
    beginLevel(ctx);
  },
  hello(ctx, id) { if (ctx.g?.world) ctx.send(id, { t: 'world', world: ctx.g.world }); },
  msg(ctx, p, m) {
    const g = ctx.g, me = g?.pl?.[p.id];
    if (!me) return false;
    switch (m.t) {
      case 'shoot':
        if (g.phase === 'playing' && shoot(g.world, p.id)) ctx.sendAll({ t: 'ev', evs: [{ k: 'shoot', id: p.id }] });
        return false;
      case 'dyn': {
        const e = g.phase === 'playing' && dynamite(g.world, p.id);
        if (e) ctx.sendAll({ t: 'ev', evs: [e] });
        return false;
      }
      case 'buy': {
        const offer = g.phase === 'shop' && me.offer?.find((o) => o.key === m.key);
        if (!offer || me.bought?.[m.key]) return false;
        const coop = ctx.cfg.mode === 'coop';
        if ((coop ? g.team : me.money) < offer.price) return false;
        if (coop) g.team -= offer.price; else me.money -= offer.price;
        me.bought[m.key] = true;
        return true;
      }
      case 'ready':
        if (g.phase !== 'shop') return false;
        me.ready = true;
        if (allReady(ctx)) nextLevel(ctx);
        return true;
      default:
        return false;
    }
  },
  tick(ctx) {
    const g = ctx.g;
    if (g.phase === 'shop') {
      if (Date.now() < g.shopEndsAt) return false;
      nextLevel(ctx);
      return true;
    }
    if (g.phase !== 'playing') return false;
    const now = Date.now();
    const dt = Math.min(0.2, (now - g.last) / 1000);
    g.last = now;
    const evs = step(g.world, dt);
    for (const e of evs) {
      if (e.k !== 'collect') continue;
      // coop: tiền vào quỹ chung; money của từng người chỉ để xem ai đóng góp nhiều.
      if (ctx.cfg.mode === 'coop') g.team += e.value;
      if (g.pl[e.id]) g.pl[e.id].money += e.value;
    }
    const out = evs.filter((e) => e.k !== 'end');
    if (out.length) ctx.sendAll({ t: 'ev', evs: out, money: moneyState(ctx) });
    const tape = now - g.tapeAt >= SNAP_TAPE_MS;
    if (tape) g.tapeAt = now;
    ctx.sendAll(snapOf(g.world), { tape });
    if (!evs.some((e) => e.k === 'end')) return false;
    endLevel(ctx);
    return true;
  },
  // Rời phòng lúc ở tiệm mà người còn lại đều sẵn sàng thì đi tiếp luôn.
  leave(ctx) {
    if (ctx.g.phase === 'shop' && allReady(ctx)) nextLevel(ctx);
  },
  view(ctx) {
    const g = ctx.g ?? {};
    const online = ctx.online();
    const level = g.level ?? 1;
    const n = (g.pl ? active(ctx) : [...online].filter((id) => !spec(ctx, id))).length || 1;
    return {
      ...ctx.cfg, ...(g.phase === 'shop' ? { status: 'shop' } : {}), level, team: g.team ?? 0,
      target: ctx.cfg.mode === 'coop' ? teamTarget(level, n) : null,
      versusLevels: VERSUS_LEVELS, shopEndsAt: g.shopEndsAt ?? 0,
      players: ctx.order().map((id) => {
        const p = g.pl?.[id];
        return {
          id, name: ctx.name(id), money: p?.money ?? 0, spec: spec(ctx, id), online: online.has(id), dynamite: p?.dynamite ?? 0,
          offer: p?.offer ?? null, bought: p?.bought ?? null, ready: !!p?.ready,
        };
      }),
    };
  },
};

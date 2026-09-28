import { N, SUNK, randomFleet, validFleet, shoot, botShot } from '../../public/ban-tau/logic.js';

// Bắn tàu (chạy trong adapter phòng chung, giao thức cũ "phẳng" của client).
// 2 người đầu vào cầm hạm đội, còn lại xem; ở một mình thì đấu với máy.
// Mỗi ván: xếp tàu (ngẫu nhiên, xếp lại hoặc tự dời / xoay từng chiếc) -> cả hai sẵn sàng -> bắn luân phiên, trúng thì bắn tiếp.
// Vị trí tàu chỉ gửi cho chủ hạm đội (người xem / đối thủ chỉ thấy ô đã bắn) tới khi hết ván.
const PLACE_MS = 60_000; // hết giờ xếp tàu thì vào trận với cách xếp đang có
const TURN_MS = 30_000; // hết giờ một lượt: bắn giùm 1 phát ngẫu nhiên; 3 lượt liền như vậy = thua
const AFK_LIMIT = 3;
const BOT_MS = 700;
const BOT = 'bot';

const arm = (ctx, ms) => ctx.wakeAt((ctx.g.deadline = Date.now() + ms));
const armTurn = (ctx) => arm(ctx, ctx.g.seats[ctx.g.turn - 1] === BOT ? BOT_MS : TURN_MS);

function begin(ctx) {
  Object.assign(ctx.g, { phase: 'playing', ready: [true, true], shots: [new Array(N * N).fill(0), new Array(N * N).fill(0)], turn: 1 });
  armTurn(ctx);
}

// Người cầm lượt bắn ô i. Trúng thì bắn tiếp, trượt thì đổi lượt. false = ô không hợp lệ.
function fire(ctx, i) {
  const g = ctx.g;
  const k = g.turn - 1;
  const r = shoot(g.fleets[1 - k], g.shots[k], i);
  if (!r) return false;
  g.fired[k]++;
  g.last = { by: g.turn, i, hit: r.hit, sunk: r.sunk };
  if (r.done) finish(ctx, g.turn, 'sunk');
  else {
    if (!r.hit) g.turn = 3 - g.turn;
    armTurn(ctx);
  }
  return true;
}

function finish(ctx, winner, why) {
  const g = ctx.g, keep = ctx.keep;
  Object.assign(g, { phase: 'ended', winner, why, deadline: 0 });
  const w = g.seats[winner - 1];
  keep.score[w] = (keep.score[w] ?? 0) + 1;
  const vsBot = g.seats.includes(BOT);
  ctx.end({
    mode: vsBot ? 'bot' : 'pvp', level: 0,
    ranks: g.seats.map((id, k) => [id, k + 1]).filter(([id]) => id !== BOT).map(([id, seat]) => {
      const opp = g.seats[2 - seat];
      return { id, score: g.fired[seat - 1], won: winner === seat, detail: { vs: opp === BOT ? 'Máy' : ctx.name(opp), why } };
    }),
  });
}

export default {
  slug: 'ban-tau', page: '/ban-tau/', max: 2, persist: true, flat: true, emotes: 5,
  messages: ['reroll', 'place', 'ready', 'shoot'],
  cfg: {},
  start(ctx) {
    const keep = ctx.keep;
    const two = ctx.seats;
    const pair = [...two].sort().join('|') || BOT;
    if (keep.pair !== pair) Object.assign(keep, { score: {}, pair, swap: false });
    const seats = two.length === 2 ? [...two] : [two[0], BOT];
    // Ghế 1 bắn trước; mỗi ván đổi ghế để đổi người bắn trước.
    Object.assign(ctx.g, {
      phase: 'placing', seats: keep.swap ? [seats[1], seats[0]] : seats, fleets: [randomFleet(), randomFleet()], shots: [null, null],
      fired: [0, 0], afk: [0, 0], turn: 1, last: null, winner: 0, why: '',
    });
    ctx.g.ready = ctx.g.seats.map((id) => id === BOT);
    keep.swap = !keep.swap;
    arm(ctx, PLACE_MS);
  },
  msg(ctx, p, m) {
    const g = ctx.g;
    const seat = (g?.seats?.indexOf(p.id) ?? -1) + 1;
    if (!seat) return false;
    switch (m.t) {
      case 'reroll':
        if (g.phase !== 'placing' || g.ready[seat - 1] || !ctx.allow(`${p.id}:reroll`, 250)) return false;
        g.fleets[seat - 1] = randomFleet();
        return true;
      case 'place':
        // Tự xếp: client gửi cả hạm đội, server kiểm lại luật (không tin client).
        if (g.phase !== 'placing' || g.ready[seat - 1] || !validFleet(m.ships)) return false;
        g.fleets[seat - 1] = m.ships.map((ship) => [...ship]);
        return true;
      case 'ready':
        if (g.phase !== 'placing') return false;
        g.ready[seat - 1] = true;
        if (g.ready.every(Boolean)) begin(ctx);
        return true;
      case 'shoot':
        if (g.phase !== 'playing' || seat !== g.turn) return false;
        g.afk[seat - 1] = 0;
        return fire(ctx, m.i);
      default:
        return false;
    }
  },
  tick(ctx) {
    const g = ctx.g;
    if (!g?.phase || g.phase === 'ended' || Date.now() < g.deadline) return false;
    if (g.phase === 'placing') { begin(ctx); return true; }
    const k = g.turn - 1;
    if (g.seats[k] === BOT) return fire(ctx, botShot(g.shots[k]));
    if (++g.afk[k] >= AFK_LIMIT) { finish(ctx, 3 - g.turn, 'timeout'); return true; }
    const open = g.shots[k].flatMap((v, i) => (v ? [] : [i]));
    return fire(ctx, open[Math.floor(Math.random() * open.length)]);
  },
  // Mỗi người một bản: chỉ thấy hạm đội của mình (hết ván thì thấy hết).
  view(ctx, id) {
    const g = ctx.g ?? {};
    const seats = g.seats ?? [null, null];
    const fleets = g.fleets ?? [null, null], shots = g.shots ?? [null, null];
    const seat = seats.indexOf(id) + 1;
    const ended = g.phase === 'ended';
    return {
      ...(g.phase ? { status: g.phase } : {}), turn: g.turn ?? 1, last: g.last ?? null, winner: g.winner ?? 0, why: g.why ?? '', deadline: g.deadline ?? 0,
      turnMs: TURN_MS, placeMs: PLACE_MS, seats, score: ctx.keep.score ?? {}, ready: g.ready ?? [false, false], shots, fired: g.fired ?? [0, 0],
      // Tàu nào của mỗi bên đã chìm (theo thứ tự FLEET) — ai cũng biết, không lộ vị trí tàu còn nổi.
      sunk: fleets.map((f, k) => (f ?? []).map((ship) => !!shots[1 - k] && ship.every((i) => shots[1 - k][i] === SUNK))),
      names: seats.map((sid) => (sid === BOT ? 'Máy' : sid ? ctx.name(sid) : '')),
      fleets: fleets.map((f, k) => (ended || k === seat - 1 ? f : null)),
    };
  },
};

// Ô ăn quan — luật thuần dùng chung server + test.
// 12 ô xếp thành vòng: 0 = quan trái, 1..5 = dân người 1 (hàng dưới, trái -> phải), 6 = quan phải, 7..11 = dân người 2 (hàng trên, phải -> trái).
// Hướng rải d = +1 / -1 theo vòng. Mỗi dân = 1 điểm, mỗi quan = QUAN điểm.
export const QUAN = 10, DAN = 5, MAX_MOVES = 400;
export const side = (p) => (p === 1 ? [1, 2, 3, 4, 5] : [7, 8, 9, 10, 11]);
export const isQuan = (k) => k % 6 === 0;
export const owner = (k) => (isQuan(k) ? 0 : k < 6 ? 1 : 2);
const nx = (k, d) => (k + d + 12) % 12;
const has = (g, k) => g.b[k] + g.big[k] > 0;

export function newGame({ quanNon = true } = {}) {
  return {
    b: [0, DAN, DAN, DAN, DAN, DAN, 0, DAN, DAN, DAN, DAN, DAN], big: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    cap: [null, { small: 0, big: 0 }, { small: 0, big: 0 }], debt: [0, 0, 0], turn: 1, quanNon, over: false, moves: 0,
  };
}

export const clone = (g) => ({ ...g, b: g.b.slice(), big: g.big.slice(), cap: g.cap.map((c) => c && { ...c }), debt: g.debt.slice() });
export const score = (g, p) => g.cap[p].small + g.cap[p].big * QUAN;
export const legal = (g, p, k, d) => !g.over && g.turn === p && side(p).includes(k) && g.b[k] > 0 && (d === 1 || d === -1);
export const moves = (g) => side(g.turn).filter((k) => g.b[k]).flatMap((k) => [[k, 1], [k, -1]]);

// Quan non: ô quan còn quan mà dưới 5 dân thì chưa được ăn (ăn vào là mất lượt).
const edible = (g, k) => has(g, k) && !(g.quanNon && isQuan(k) && g.big[k] && g.b[k] < DAN);

// Đi nước (mutate g). Trả về các bước để client diễn lại: ['pick', k] bốc, ['drop', k] rải 1, ['cap', k] ăn, ['seed', k] rải lại khi hết dân.
export function move(g, k, d) {
  const p = g.turn, steps = [];
  let n = g.b[k];
  g.b[k] = 0;
  steps.push(['pick', k]);
  for (;;) {
    while (n) { k = nx(k, d); g.b[k]++; n--; steps.push(['drop', k]); }
    const e = nx(k, d);
    if (isQuan(e)) break; // gặp ô quan: dừng
    if (g.b[e]) { n = g.b[e]; g.b[e] = 0; k = e; steps.push(['pick', e]); continue; } // ô sau có dân: bốc rải tiếp
    // Ô sau trống: ăn ô kế tiếp; trống - có quân xen kẽ thì ăn tiếp (ăn dồn).
    let f = nx(e, d);
    while (edible(g, f)) {
      g.cap[p].small += g.b[f]; g.cap[p].big += g.big[f];
      g.b[f] = 0; g.big[f] = 0;
      steps.push(['cap', f]);
      const e2 = nx(f, d);
      if (has(g, e2)) break;
      f = nx(e2, d);
    }
    break;
  }
  g.moves++;
  g.turn = 3 - p;
  if ((!has(g, 0) && !has(g, 6)) || g.moves >= MAX_MOVES) finish(g); // hết quan, tàn dân: thu quân, kết thúc
  else steps.push(...refill(g));
  return steps;
}

// Tới lượt mà 5 ô mình trống: lấy 5 dân đã ăn rải lại (thiếu thì vay đối thủ, cuối ván trả). Không còn gì để rải: kết thúc.
function refill(g) {
  const p = g.turn, q = 3 - p;
  if (side(p).some((k) => g.b[k])) return [];
  const own = Math.min(DAN, g.cap[p].small);
  const lent = Math.min(DAN - own, g.cap[q].small);
  if (!own && !lent) { finish(g); return []; }
  g.cap[p].small -= own; g.cap[q].small -= lent; g.debt[p] += lent;
  return side(p).slice(0, own + lent).map((k) => { g.b[k]++; return ['seed', k]; });
}

// Kết thúc: dân còn trên ô thuộc về chủ hàng ô đó, trả nợ đã vay.
function finish(g) {
  for (const p of [1, 2]) for (const k of side(p)) { g.cap[p].small += g.b[k]; g.b[k] = 0; }
  for (const p of [1, 2]) { g.cap[p].small -= g.debt[p]; g.cap[3 - p].small += g.debt[p]; g.debt[p] = 0; }
  g.over = true;
}

export const winner = (g) => { const a = score(g, 1), b = score(g, 2); return a > b ? 1 : b > a ? 2 : 0; };

// Máy: minimax alpha-beta, điểm = chênh lệch điểm đã ăn (+ dân đang giữ bên mình cho nhẹ nhàng).
export function botMove(g, depth = 4, rand = Math.random) {
  const me = g.turn;
  const val = (s) => score(s, me) - score(s, 3 - me) + (s.over ? 0 : 0.1 * (side(me).reduce((a, k) => a + s.b[k], 0) - side(3 - me).reduce((a, k) => a + s.b[k], 0)));
  const search = (s, dep, a, b) => {
    if (dep === 0 || s.over) return val(s);
    const max = s.turn === me;
    let best = max ? -Infinity : Infinity;
    for (const [k, d] of moves(s)) {
      const t = clone(s);
      move(t, k, d);
      const v = search(t, dep - 1, a, b);
      if (max) { best = Math.max(best, v); a = Math.max(a, v); } else { best = Math.min(best, v); b = Math.min(b, v); }
      if (b <= a) break;
    }
    return best;
  };
  let best = null, bestV = -Infinity;
  for (const m of moves(g)) {
    const t = clone(g);
    move(t, ...m);
    const v = search(t, depth - 1, -Infinity, Infinity) + rand() * 0.01; // hoà điểm thì chọn ngẫu nhiên
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}

// Ô ăn quan — luật thuần dùng chung server + test. Chơi 2–5 người (n).
// 6n ô xếp thành vòng; người p (1..n) có ô quan 6(p-1) rồi 5 ô dân 6(p-1)+1 .. 6(p-1)+5 tiếp theo.
// 2 người: 0 = quan trái, 1..5 = dân người 1 (hàng dưới, trái -> phải), 6 = quan phải, 7..11 = dân người 2 (hàng trên, phải -> trái).
// Hướng rải d = +1 / -1 theo vòng. Mỗi dân = 1 điểm, mỗi quan = QUAN điểm. Lượt đi vòng 1 -> 2 -> ... -> n -> 1.
export const QUAN = 10, DAN = 5, MAX_PLAYERS = 5;
export const side = (p) => [1, 2, 3, 4, 5].map((i) => 6 * (p - 1) + i);
export const isQuan = (k) => k % 6 === 0;
export const owner = (k) => (isQuan(k) ? 0 : Math.floor(k / 6) + 1);
export const players = (g) => g.b.length / 6;
const nx = (g, k, d) => (k + d + g.b.length) % g.b.length;
const has = (g, k) => g.b[k] + g.big[k] > 0;
const next = (g, p) => (p % players(g)) + 1;
const others = (g, p) => Array.from({ length: players(g) }, (_, i) => i + 1).filter((q) => q !== p);

export function newGame({ quanNon = true, n = 2 } = {}) {
  const b = [], big = [];
  for (let k = 0; k < 6 * n; k++) { b.push(isQuan(k) ? 0 : DAN); big.push(isQuan(k) ? 1 : 0); }
  return {
    b, big, cap: [null, ...Array.from({ length: n }, () => ({ small: 0, big: 0 }))], debt: Array(n + 1).fill(0), loans: [],
    turn: 1, quanNon, over: false, moves: 0,
  };
}

export const clone = (g) => ({ ...g, b: g.b.slice(), big: g.big.slice(), cap: g.cap.map((c) => c && { ...c }), debt: g.debt.slice(), loans: (g.loans ?? []).map((l) => l.slice()) });
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
    while (n) { k = nx(g, k, d); g.b[k]++; n--; steps.push(['drop', k]); }
    const e = nx(g, k, d);
    if (isQuan(e)) break; // gặp ô quan: dừng
    if (g.b[e]) { n = g.b[e]; g.b[e] = 0; k = e; steps.push(['pick', e]); continue; } // ô sau có dân: bốc rải tiếp
    // Ô sau trống: ăn ô kế tiếp; trống - có quân xen kẽ thì ăn tiếp (ăn dồn).
    let f = nx(g, e, d);
    while (edible(g, f)) {
      g.cap[p].small += g.b[f]; g.cap[p].big += g.big[f];
      g.b[f] = 0; g.big[f] = 0;
      steps.push(['cap', f]);
      const e2 = nx(g, f, d);
      if (has(g, e2)) break;
      f = nx(g, e2, d);
    }
    break;
  }
  g.moves++;
  g.turn = next(g, p);
  // Hết quan, tàn dân (mọi ô quan đều trống): thu quân, kết thúc.
  if (g.b.every((_, q) => !isQuan(q) || !has(g, q)) || g.moves >= 200 * players(g)) finish(g);
  else steps.push(...refill(g));
  return steps;
}

// Tới lượt mà 5 ô mình trống: lấy 5 dân đã ăn rải lại (thiếu thì vay người đang có nhiều dân nhất, cuối ván trả).
// Không còn gì để rải: kết thúc.
function refill(g) {
  const p = g.turn;
  if (side(p).some((k) => g.b[k])) return [];
  let got = Math.min(DAN, g.cap[p].small);
  g.cap[p].small -= got;
  for (const q of others(g, p).sort((x, y) => g.cap[y].small - g.cap[x].small)) {
    const lent = Math.min(DAN - got, g.cap[q].small);
    if (!lent) continue;
    g.cap[q].small -= lent; g.debt[p] += lent; (g.loans ??= []).push([p, q, lent]); // loans: ván lưu từ bản cũ chưa có
    got += lent;
  }
  if (!got) { finish(g); return []; }
  return side(p).slice(0, got).map((k) => { g.b[k]++; return ['seed', k]; });
}

// Kết thúc: dân còn trên ô thuộc về chủ hàng ô đó, trả nợ đã vay.
function finish(g) {
  for (let p = 1; p <= players(g); p++) for (const k of side(p)) { g.cap[p].small += g.b[k]; g.b[k] = 0; }
  for (const [p, q, amt] of g.loans ?? []) { g.cap[p].small -= amt; g.cap[q].small += amt; }
  g.loans = [];
  g.debt.fill(0);
  g.over = true;
}

// Người điểm cao nhất; 0 = hoà ở ngôi đầu.
export function winner(g) {
  const s = Array.from({ length: players(g) }, (_, i) => score(g, i + 1));
  const top = Math.max(...s);
  return s.filter((x) => x === top).length > 1 ? 0 : s.indexOf(top) + 1;
}

// Máy: minimax alpha-beta ("mình với cả bàn": mọi người khác cùng chơi chống mình), điểm = mình trừ người mạnh nhất còn lại
// (+ dân đang giữ bên mình cho nhẹ nhàng). 2 người đúng là minimax thường.
export function botMove(g, depth = 4, rand = Math.random) {
  const me = g.turn;
  const held = (s, p) => side(p).reduce((a, k) => a + s.b[k], 0);
  const val = (s) => {
    const rest = others(s, me);
    const best = rest.reduce((a, q) => (score(s, q) > score(s, a) ? q : a), rest[0]);
    return score(s, me) - score(s, best) + (s.over ? 0 : 0.1 * (held(s, me) - held(s, best)));
  };
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

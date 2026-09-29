// Cờ tướng — luật thuần dùng chung server + test.
// Bàn 9 cột × 10 hàng giao điểm, ô i = r * 9 + c (r = 0 hàng trên = bên Đen, r = 9 = bên Đỏ). Đỏ (1) đi trước.
// Quân: số dương = Đỏ, âm = Đen; |v| = K tướng, A sĩ, E tượng, H mã, R xe, C pháo, P tốt.
// Luật: tướng / sĩ trong cửu cung; tượng đi chéo 2, bị cản mắt, không qua sông; mã đi chữ nhật, bị cản chân;
// pháo đi như xe, ăn phải nhảy qua đúng 1 ngòi; tốt đi thẳng, qua sông được đi ngang; hai tướng không được đối mặt;
// không được đi để tướng mình bị chiếu. Hết nước đi (bị chiếu bí hoặc hết nước) là thua. Quá MAX_MOVES nước: hoà.
export const COLS = 9, ROWS = 10, MAX_MOVES = 300;
export const K = 1, A = 2, E = 3, H = 4, R = 5, C = 6, P = 7;
export const sideOf = (v) => (v > 0 ? 1 : v < 0 ? 2 : 0);
const at = (r, c) => r * COLS + c;
const on = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const inPalace = (s, r, c) => c >= 3 && c <= 5 && (s === 1 ? r >= 7 : r <= 2);
const ownHalf = (s, r) => (s === 1 ? r >= 5 : r <= 4);

export function newGame() {
  const b = Array(COLS * ROWS).fill(0);
  const back = [R, H, E, A, K, A, E, H, R];
  back.forEach((t, c) => { b[at(0, c)] = -t; b[at(9, c)] = t; });
  for (const c of [1, 7]) { b[at(2, c)] = -C; b[at(7, c)] = C; }
  for (const c of [0, 2, 4, 6, 8]) { b[at(3, c)] = -P; b[at(6, c)] = P; }
  return { b, turn: 1, over: false, winner: 0, moves: 0 };
}
export const clone = (g) => ({ ...g, b: g.b.slice() });

// Nước "giả hợp lệ" của quân ở i (chưa xét tướng mình có bị chiếu sau khi đi). Tướng được "ăn" tướng đối diện qua cột trống
// (nhờ vậy nước để lộ mặt tướng bị bắt ngay ở lượt sau, tìm kiếm của máy tự tránh).
function pseudo(b, i, out) {
  const v = b[i], s = sideOf(v), t = Math.abs(v), r = Math.floor(i / COLS), c = i % COLS;
  const mine = (j) => sideOf(b[j]) === s;
  const add = (rr, cc) => { if (on(rr, cc) && !mine(at(rr, cc))) out.push([i, at(rr, cc)]); };
  if (t === K) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inPalace(s, r + dr, c + dc)) add(r + dr, c + dc);
    const dir = s === 1 ? -1 : 1;
    for (let rr = r + dir; on(rr, c); rr += dir) {
      const w = b[at(rr, c)];
      if (!w) continue;
      if (Math.abs(w) === K) out.push([i, at(rr, c)]); // lộ mặt tướng
      break;
    }
  } else if (t === A) {
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (inPalace(s, r + dr, c + dc)) add(r + dr, c + dc);
  } else if (t === E) {
    for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      if (on(r + dr, c + dc) && ownHalf(s, r + dr) && !b[at(r + dr / 2, c + dc / 2)]) add(r + dr, c + dc);
    }
  } else if (t === H) {
    for (const [dr, dc, lr, lc] of [[2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0], [1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1]]) {
      if (on(r + dr, c + dc) && !b[at(r + lr, c + lc)]) add(r + dr, c + dc);
    }
  } else if (t === R || t === C) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let rr = r + dr, cc = c + dc, jumped = false;
      for (; on(rr, cc); rr += dr, cc += dc) {
        const w = b[at(rr, cc)];
        if (t === R) {
          if (!w) { out.push([i, at(rr, cc)]); continue; }
          if (sideOf(w) !== s) out.push([i, at(rr, cc)]);
          break;
        }
        if (!jumped) {
          if (!w) { out.push([i, at(rr, cc)]); continue; }
          jumped = true; // ngòi
        } else if (w) {
          if (sideOf(w) !== s) out.push([i, at(rr, cc)]);
          break;
        }
      }
    }
  } else if (t === P) {
    const f = s === 1 ? -1 : 1;
    add(r + f, c);
    if (!ownHalf(s, r)) { add(r, c - 1); add(r, c + 1); }
  }
}
function pseudoAll(b, s) {
  const out = [];
  for (let i = 0; i < b.length; i++) if (b[i] && sideOf(b[i]) === s) pseudo(b, i, out);
  return out;
}
const kingOf = (b, s) => b.indexOf(s === 1 ? K : -K);

// Tướng bên s đang bị chiếu (kể cả lộ mặt tướng).
export function inCheck(b, s) {
  const k = kingOf(b, s);
  return k < 0 || pseudoAll(b, 3 - s).some(([, to]) => to === k);
}
function apply(b, from, to) {
  const cap = b[to];
  b[to] = b[from]; b[from] = 0;
  return cap;
}
// Nước hợp lệ của bên đang đi.
export function moves(g) {
  const s = g.turn;
  return pseudoAll(g.b, s).filter(([f, t]) => {
    const b = g.b.slice();
    apply(b, f, t);
    return !inCheck(b, s);
  });
}
export const legal = (g, p, from, to) => !g.over && g.turn === p && moves(g).some(([f, t]) => f === from && t === to);

// Đi nước (mutate g), trả về quân bị ăn (0 = không ăn).
export function move(g, from, to) {
  const cap = apply(g.b, from, to);
  g.moves++;
  g.turn = 3 - g.turn;
  if (!moves(g).length) Object.assign(g, { over: true, winner: 3 - g.turn });
  else if (g.moves >= MAX_MOVES) Object.assign(g, { over: true, winner: 0 });
  return cap;
}

// ---------- máy ----------
const VAL = [0, 100000, 200, 200, 400, 900, 450, 100];
// Điểm thế cờ theo góc nhìn bên s: quân + tốt qua sông / gần cung địch + mã, pháo lên giữa bàn.
function evalFor(b, s) {
  let v = 0;
  for (let i = 0; i < b.length; i++) {
    const w = b[i];
    if (!w) continue;
    const t = Math.abs(w), side = sideOf(w), r = Math.floor(i / COLS), c = i % COLS;
    let x = VAL[t];
    if (t === P && !ownHalf(side, r)) x += 90 - Math.abs(c - 4) * 10 + (side === 1 ? 4 - r : r - 5) * 5;
    if (t === H || t === C) x += 12 - Math.abs(c - 4) * 3;
    v += side === s ? x : -x;
  }
  return v;
}
// Xếp nước: ăn quân to bằng quân nhỏ trước (MVV-LVA).
const order = (b, ms) => ms.sort((x, y) => (VAL[Math.abs(b[y[1]])] * 8 - VAL[Math.abs(b[y[0]])] / 8) - (VAL[Math.abs(b[x[1]])] * 8 - VAL[Math.abs(b[x[0]])] / 8));
// Tìm yên (quiescence): ở lá chỉ xét tiếp các nước ăn quân, tránh "hiệu ứng chân trời" (ăn trước khi thấy bị ăn lại).
function quiet(b, s, a, beta, left) {
  const stand = evalFor(b, s);
  if (stand >= beta || !left) return stand;
  if (stand > a) a = stand;
  for (const [f, t] of order(b, pseudoAll(b, s).filter(([, t]) => b[t]))) {
    if (Math.abs(b[t]) === K) return 1e6;
    const cap = apply(b, f, t);
    const v = -quiet(b, 3 - s, -beta, -a, left - 1);
    b[f] = b[t]; b[t] = cap;
    if (v >= beta) return v;
    if (v > a) a = v;
  }
  return a;
}
// Negamax alpha-beta trên nước giả hợp lệ (ăn được tướng = thắng), nước ăn quân xét trước.
function search(b, s, depth, a, beta, stop) {
  if (depth === 0) return quiet(b, s, a, beta, 6);
  if (Date.now() > stop.at) { stop.hit = true; return 0; }
  const ms = order(b, pseudoAll(b, s));
  let best = -Infinity;
  for (const [f, t] of ms) {
    if (Math.abs(b[t]) === K) return 1e6 + depth; // ăn được tướng
    const cap = apply(b, f, t);
    const v = -search(b, 3 - s, depth - 1, -beta, -a, stop);
    b[f] = b[t]; b[t] = cap;
    if (stop.hit) return 0;
    if (v > best) best = v;
    if (v > a) a = v;
    if (a >= beta) break;
  }
  return best;
}
// Sâu dần tới maxDepth hoặc hết ms (giữ CPU của server gọn). Trả về [from, to] hợp lệ.
export function botMove(g, maxDepth = 3, ms = 400, rand = Math.random) {
  const s = g.turn, legalMoves = moves(g);
  if (!legalMoves.length) return null;
  const stop = { at: Date.now() + ms, hit: false };
  let best = legalMoves[Math.floor(rand() * legalMoves.length)];
  for (let d = 1; d <= maxDepth; d++) {
    let bestV = -Infinity, pick = null;
    for (const [f, t] of legalMoves) {
      const b = g.b.slice();
      apply(b, f, t);
      const v = -search(b, 3 - s, d - 1, -Infinity, -bestV, stop) + rand() * 5;
      if (stop.hit) break;
      if (v > bestV) { bestV = v; pick = [f, t]; }
    }
    if (stop.hit) break;
    best = pick;
    // Nước tốt nhất lần này xét trước ở độ sâu sau (cắt tỉa nhiều hơn).
    legalMoves.sort((x, y) => (x === pick ? -1 : y === pick ? 1 : 0));
  }
  return best;
}

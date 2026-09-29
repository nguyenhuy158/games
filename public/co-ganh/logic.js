// Cờ gánh — luật thuần dùng chung server + test.
// Bàn 5×5 giao điểm, ô i = r * 5 + c (r = 0 hàng trên). Đường ngang / dọc nối mọi điểm kề; đường chéo chỉ đi qua điểm (r + c) chẵn.
// Mỗi bên 8 quân quanh mép bàn; người 1 (đi trước) ở nửa dưới. Đi 1 bước theo đường kẻ tới điểm trống. Sau khi đi:
//   gánh: quân vừa đi đứng giữa 2 quân địch thẳng hàng (kề hai bên) -> 2 quân đó đổi màu thành của mình;
//   vây (chẹt): nhóm quân địch liền nhau không còn điểm trống kề -> cả nhóm đổi màu.
//   mở: nước vừa đi bỏ trống điểm mà bên kia đi vào đó là gánh được -> bên kia BẮT BUỘC đi vào đó gánh (g.open = điểm đó).
// Hết quân là thua. Quá MAX_MOVES nước: nhiều quân hơn thắng, bằng thì hoà.
export const N = 5, MAX_MOVES = 150;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const diag = (i) => (Math.floor(i / N) + (i % N)) % 2 === 0;
const on = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

// Các điểm kề theo đường kẻ.
export const ADJ = Array.from({ length: N * N }, (_, i) => {
  const r = Math.floor(i / N), c = i % N, out = [];
  for (const [dr, dc] of DIRS) {
    if (dr && dc && !diag(i)) continue;
    for (const s of [1, -1]) if (on(r + dr * s, c + dc * s)) out.push((r + dr * s) * N + c + dc * s);
  }
  return out;
});
// Các cặp điểm đối xứng qua i trên cùng một đường (để gánh).
const LINES = Array.from({ length: N * N }, (_, i) => {
  const r = Math.floor(i / N), c = i % N, out = [];
  for (const [dr, dc] of DIRS) {
    if (dr && dc && !diag(i)) continue;
    if (on(r - dr, c - dc) && on(r + dr, c + dc)) out.push([(r - dr) * N + c - dc, (r + dr) * N + c + dc]);
  }
  return out;
});

export function newGame() {
  const b = Array(N * N).fill(0);
  for (let c = 0; c < N; c++) { b[4 * N + c] = 1; b[c] = 2; }
  b[3 * N] = b[3 * N + 4] = b[2 * N + 4] = 1;
  b[1 * N] = b[1 * N + 4] = b[2 * N] = 2;
  return { b, turn: 1, over: false, winner: 0, moves: 0, open: -1 };
}

export const clone = (g) => ({ ...g, b: g.b.slice() });
export const count = (g, p) => g.b.filter((x) => x === p).length;
// Người p đi vào điểm trống `to` thì gánh được không.
const carries = (b, p, to) => LINES[to].some(([x, y]) => b[x] === 3 - p && b[y] === 3 - p);
const free = (g) => g.b.flatMap((x, i) => (x === g.turn ? ADJ[i].filter((j) => !g.b[j]).map((j) => [i, j]) : []));
// Nước hợp lệ; bị "mở" thì chỉ còn các nước đi vào điểm mở.
export const moves = (g) => {
  const all = free(g);
  return g.open >= 0 ? all.filter(([, to]) => to === g.open) : all;
};
export const legal = (g, p, from, to) => !g.over && g.turn === p && moves(g).some(([f, t]) => f === from && t === to);

// Đi nước (mutate g). Trả về các quân bị đổi màu: { ganh: [...], vay: [...] }.
export function move(g, from, to) {
  const p = g.turn, q = 3 - p, b = g.b;
  b[to] = p; b[from] = 0;
  const ganh = [];
  for (const [x, y] of LINES[to]) if (b[x] === q && b[y] === q) ganh.push(x, y);
  for (const i of ganh) b[i] = p;
  // Vây: nhóm quân địch (liền nhau theo đường kẻ) không còn điểm trống kề.
  const vay = [], seen = new Set();
  for (let i = 0; i < N * N; i++) {
    if (b[i] !== q || seen.has(i)) continue;
    const group = [i], free = { v: false };
    seen.add(i);
    for (let k = 0; k < group.length; k++) {
      for (const j of ADJ[group[k]]) {
        if (!b[j]) free.v = true;
        else if (b[j] === q && !seen.has(j)) { seen.add(j); group.push(j); }
      }
    }
    if (!free.v) vay.push(...group);
  }
  for (const i of vay) b[i] = p;
  g.moves++;
  g.turn = q;
  // Mở: điểm vừa bỏ trống, bên kia có quân kề đi vào đó mà gánh được.
  g.open = ADJ[from].some((j) => b[j] === q) && carries(b, q, from) ? from : -1;
  if (!count(g, q)) Object.assign(g, { over: true, winner: p });
  else if (!moves(g).length) Object.assign(g, { over: true, winner: p }); // không còn nước đi (thường đã bị vây hết)
  else if (g.moves >= MAX_MOVES) { const a = count(g, 1), c = count(g, 2); Object.assign(g, { over: true, winner: a > c ? 1 : c > a ? 2 : 0 }); }
  return { ganh, vay };
}

// Máy: minimax alpha-beta, điểm = chênh số quân (+ chút cơ động).
export function botMove(g, depth = 3, rand = Math.random) {
  const me = g.turn;
  const val = (s) => {
    if (s.over) return s.winner === me ? 1000 - s.moves : s.winner ? -1000 + s.moves : 0;
    const t = clone(s);
    const mob = moves(t).length * (t.turn === me ? 1 : -1);
    return (count(s, me) - count(s, 3 - me)) * 10 + mob * 0.1;
  };
  const search = (s, dep, a, b) => {
    if (dep === 0 || s.over) return val(s);
    const max = s.turn === me;
    let best = max ? -Infinity : Infinity;
    for (const [f, t] of moves(s)) {
      const n = clone(s);
      move(n, f, t);
      const v = search(n, dep - 1, a, b);
      if (max) { best = Math.max(best, v); a = Math.max(a, v); } else { best = Math.min(best, v); b = Math.min(b, v); }
      if (b <= a) break;
    }
    return best;
  };
  let best = null, bestV = -Infinity;
  for (const m of moves(g)) {
    const n = clone(g);
    move(n, ...m);
    const v = search(n, depth - 1, -Infinity, Infinity) + rand() * 0.01;
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}

// Bantumi (Nokia 3310) = Kalah: 6 hố mỗi bên + 1 kho. Chỉ số: 0..5 hố người 1, 6 kho người 1, 7..12 hố người 2, 13 kho người 2.
// Rải ngược chiều kim đồng hồ (tăng chỉ số), bỏ qua kho đối thủ. Hạt cuối vào kho mình: đi tiếp.
// Hạt cuối vào hố trống bên mình (đối diện còn sỏi): ăn cả hai vào kho. Một bên hết sỏi: bên kia gom hết, kho nhiều hơn thắng.
export const SEEDS = 4;
export const store = (p) => (p === 1 ? 6 : 13);
export const pits = (p) => (p === 1 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
export const opposite = (i) => 12 - i;

export const newBoard = (seeds = SEEDS) => Array.from({ length: 14 }, (_, i) => (i === 6 || i === 13 ? 0 : seeds));

export const legal = (b, p, i) => pits(p).includes(i) && b[i] > 0;

// Đi nước i của người p (mutate b). Trả về { again, path, captured, over }.
export function move(b, p, i) {
  let n = b[i];
  b[i] = 0;
  let k = i;
  const path = [];
  while (n > 0) {
    k = (k + 1) % 14;
    if (k === store(3 - p)) continue;
    b[k]++;
    path.push(k);
    n--;
  }
  let captured = 0;
  if (pits(p).includes(k) && b[k] === 1 && b[opposite(k)] > 0) {
    captured = b[k] + b[opposite(k)];
    b[store(p)] += captured;
    b[k] = 0;
    b[opposite(k)] = 0;
  }
  const again = k === store(p);
  const over = finishIfEmpty(b);
  return { again: again && !over, path, captured, over };
}

// Một bên hết sỏi -> dồn sỏi còn lại của mỗi bên về kho bên đó.
function finishIfEmpty(b) {
  if (!pits(1).every((i) => !b[i]) && !pits(2).every((i) => !b[i])) return false;
  for (const p of [1, 2]) for (const i of pits(p)) { b[store(p)] += b[i]; b[i] = 0; }
  return true;
}

export const winner = (b) => (b[6] > b[13] ? 1 : b[13] > b[6] ? 2 : 0);

// Máy: minimax cắt tỉa alpha-beta, điểm = chênh lệch kho (đi tiếp thì vẫn là lượt mình).
export function botMove(b, p, depth = 7) {
  const search = (board, who, d, alpha, beta) => {
    if (d === 0 || pits(1).every((i) => !board[i]) || pits(2).every((i) => !board[i])) return board[store(p)] - board[store(3 - p)];
    const moves = pits(who).filter((i) => board[i]);
    let best = who === p ? -Infinity : Infinity;
    for (const i of moves) {
      const nb = board.slice();
      const r = move(nb, who, i);
      const next = r.over ? who : r.again ? who : 3 - who;
      const v = r.over ? nb[store(p)] - nb[store(3 - p)] : search(nb, next, d - 1, alpha, beta);
      if (who === p) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
      if (beta <= alpha) break;
    }
    return best;
  };
  let bestI = -1, bestV = -Infinity;
  for (const i of pits(p).filter((x) => b[x])) {
    const nb = b.slice();
    const r = move(nb, p, i);
    const v = r.over ? nb[store(p)] - nb[store(3 - p)] : search(nb, r.again ? p : 3 - p, depth - 1, -Infinity, Infinity) + (r.again ? 0.5 : 0);
    if (v > bestV) { bestV = v; bestI = i; }
  }
  return bestI;
}

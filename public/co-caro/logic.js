// Luật Cờ caro (thuần, dùng chung server + test). Bàn = mảng n*n: 0 trống, 1 = X (đi trước), 2 = O.
export const SIZES = [15, 19];
export const WIN = 5;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// Dãy quân cùng màu đi qua ô i theo hướng (dr, dc): danh sách ô + 2 đầu (ô kế tiếp ngoài dãy, -1 nếu ra ngoài bàn).
function run(board, n, i, dr, dc) {
  const me = board[i], r = Math.floor(i / n), c = i % n;
  const cells = [i];
  const walk = (s) => {
    let rr = r + dr * s, cc = c + dc * s;
    while (rr >= 0 && rr < n && cc >= 0 && cc < n && board[rr * n + cc] === me) { cells.push(rr * n + cc); rr += dr * s; cc += dc * s; }
    return rr >= 0 && rr < n && cc >= 0 && cc < n ? rr * n + cc : -1;
  };
  return { cells, ends: [walk(1), walk(-1)] };
}

// Nước vừa đi ở ô i có tạo 5 quân không? Trả về các ô thắng hoặc null.
// block (luật "chặn 2 đầu"): dãy bị quân đối phương chặn cả 2 đầu thì không tính (mép bàn không tính là chặn).
export function winLine(board, n, i, block = false) {
  const me = board[i];
  if (!me) return null;
  for (const [dr, dc] of DIRS) {
    const { cells, ends } = run(board, n, i, dr, dc);
    if (cells.length < WIN) continue;
    if (block && ends.every((e) => e >= 0 && board[e] && board[e] !== me)) continue;
    return cells.sort((a, b) => a - b);
  }
  return null;
}

export const full = (board) => board.every((v) => v);

// Máy đánh: chấm điểm mọi ô trống gần quân đã có = điểm tấn công + điểm phòng thủ, lấy ô cao nhất.
// ponytail: heuristic 1 nước (không tìm sâu) — đủ vui, người chơi kỹ thắng được; muốn khó hơn thì thêm minimax 2-3 tầng.
const SCORE = [[0, 0, 0], [1, 5, 10], [10, 60, 200], [100, 800, 3000], [1000, 12000, 60000]]; // [độ dài][số đầu trống]
export function botMove(board, n, me, rand = Math.random) {
  if (board.every((v) => !v)) return Math.floor(n / 2) * n + Math.floor(n / 2);
  const opp = 3 - me;
  let best = -1, bestScore = -1;
  for (let i = 0; i < board.length; i++) {
    if (board[i] || !near(board, n, i)) continue;
    const s = value(board, n, i, me) * 1.1 + value(board, n, i, opp) + rand();
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

// Điểm nếu đặt quân `who` vào ô trống i.
function value(board, n, i, who) {
  board[i] = who;
  let s = 0;
  for (const [dr, dc] of DIRS) {
    const { cells, ends } = run(board, n, i, dr, dc);
    const open = ends.filter((e) => e >= 0 && !board[e]).length;
    s += cells.length >= WIN ? 1e6 : SCORE[cells.length][open];
  }
  board[i] = 0;
  return s;
}

function near(board, n, i) {
  const r = Math.floor(i / n), c = i % n;
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n && board[rr * n + cc]) return true;
  }
  return false;
}

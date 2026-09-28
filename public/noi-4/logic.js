// Luật Nối 4 (Connect 4) thuần, dùng chung server + test. Bàn = mảng ROWS*COLS, hàng 0 ở trên:
// 0 trống, 1 = đỏ (đi trước), 2 = vàng. Thả quân vào cột, quân rơi xuống ô trống thấp nhất.
export const ROWS = 6, COLS = 7;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// Ô quân rơi tới khi thả vào cột c, -1 nếu cột đầy.
export function drop(board, c) {
  for (let r = ROWS - 1; r >= 0; r--) if (!board[r * COLS + c]) return r * COLS + c;
  return -1;
}

// Nước vừa đi ở ô i có tạo 4 quân liền không? Trả về các ô thắng hoặc null.
export function winLine(board, i) {
  const me = board[i];
  if (!me) return null;
  const r = Math.floor(i / COLS), c = i % COLS;
  for (const [dr, dc] of DIRS) {
    const cells = [i];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr * COLS + cc] === me) { cells.push(rr * COLS + cc); rr += dr * s; cc += dc * s; }
    }
    if (cells.length >= 4) return cells.sort((a, b) => a - b);
  }
  return null;
}

export const full = (board) => board.every((v) => v);

// Máy: negamax cắt tỉa alpha-beta DEPTH tầng, xét cột giữa trước; lá chấm điểm theo mọi "cửa sổ" 4 ô.
// ponytail: độ sâu cố định 4 (vài ms CPU mỗi nước, hợp gói free) — người chơi kỹ thắng được; muốn khó hơn thì tăng DEPTH.
const DEPTH = 4;
const ORDER = [3, 2, 4, 1, 5, 0, 6];
export function botMove(board, me, rand = Math.random) {
  const b = [...board];
  let best = -Infinity, moves = [];
  for (const c of ORDER) {
    const i = drop(b, c);
    if (i < 0) continue;
    b[i] = me;
    const s = winLine(b, i) ? 1e6 : -negamax(b, 3 - me, DEPTH - 1, -Infinity, Infinity);
    b[i] = 0;
    if (s > best) { best = s; moves = [c]; } else if (s === best) moves.push(c);
  }
  return moves[Math.floor(rand() * moves.length)];
}

function negamax(b, who, depth, alpha, beta) {
  if (depth === 0 || full(b)) return evaluate(b, who);
  let best = -Infinity;
  for (const c of ORDER) {
    const i = drop(b, c);
    if (i < 0) continue;
    b[i] = who;
    // Thắng sớm điểm cao hơn thắng muộn (depth còn lại lớn).
    const s = winLine(b, i) ? 1e5 + depth : -negamax(b, 3 - who, depth - 1, -beta, -alpha);
    b[i] = 0;
    if (s > best) best = s;
    if (s > alpha) alpha = s;
    if (alpha >= beta) break;
  }
  return best;
}

// Điểm thế cờ nhìn từ phía `who`: cửa sổ 4 ô chỉ có quân một bên thì cộng cho bên đó, thêm điểm cột giữa.
const W = [0, 1, 8, 60];
function evaluate(b, who) {
  let s = 0;
  for (let r = 0; r < ROWS; r++) s += (b[r * COLS + 3] === who) * 3 - (b[r * COLS + 3] === 3 - who) * 3;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of DIRS) {
    const er = r + dr * 3, ec = c + dc * 3;
    if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
    let mine = 0, theirs = 0;
    for (let k = 0; k < 4; k++) { const v = b[(r + dr * k) * COLS + c + dc * k]; if (v === who) mine++; else if (v) theirs++; }
    if (!theirs) s += W[mine] ?? 0; else if (!mine) s -= W[theirs] ?? 0;
  }
  return s;
}

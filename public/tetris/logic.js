// Luật Xếp gạch (thuần, không DOM): bàn 10×20, ô trống = '', ô đã khoá = chữ loại khối ('I', 'J', ...).
// Khối rơi mỗi nhịp; chạm đáy / chạm khối thì khoá ở nhịp kế tiếp (thả nhanh chỉ đẩy khối xuống đáy, còn kịp xê dịch),
// hàng đầy thì xoá và cộng điểm theo số hàng xoá cùng lúc. Khối mới sinh mà chạm ngay thì hết ván.
export const W = 10;
export const H = 20;
export const TICK_MS = 800;
// Điểm theo số hàng xoá cùng lúc (0..4 hàng).
export const POINTS = [0, 40, 100, 300, 1200];

export const SHAPES = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]],
};
export const TYPES = Object.keys(SHAPES);

export const emptyBoard = () => Array.from({ length: H }, () => Array(W).fill(''));

export function collides(board, shape, x, y) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const bx = x + c, by = y + r;
      if (bx < 0 || bx >= W || by >= H || (by >= 0 && board[by][bx])) return true;
    }
  }
  return false;
}

// Xoay 90° theo chiều kim đồng hồ.
export const rotateShape = (shape) => shape[0].map((_, i) => shape.map((row) => row[i]).reverse());

// Trạng thái ván: { board, piece: { type, shape, x, y } | null, score, over }.
export const newGame = () => ({ board: emptyBoard(), piece: null, score: 0, over: false });

// Sinh khối ngẫu nhiên ở giữa đỉnh bàn; chạm ngay thì hết ván.
export function spawn(s, rand = Math.random) {
  const type = TYPES[Math.floor(rand() * TYPES.length)];
  const shape = SHAPES[type];
  const piece = { type, shape, x: Math.floor(W / 2) - Math.floor(shape[0].length / 2), y: 0 };
  if (collides(s.board, shape, piece.x, piece.y)) {
    s.piece = null;
    s.over = true;
    return false;
  }
  s.piece = piece;
  return true;
}

export function shift(s, dx) {
  const p = s.piece;
  if (!p || collides(s.board, p.shape, p.x + dx, p.y)) return false;
  p.x += dx;
  return true;
}

export function rotate(s) {
  const p = s.piece;
  if (!p) return false;
  const shape = rotateShape(p.shape);
  if (collides(s.board, shape, p.x, p.y)) return false;
  p.shape = shape;
  return true;
}

// Thả nhanh: đẩy khối xuống thấp nhất có thể (khoá ở nhịp sau).
export function hardDrop(s) {
  const p = s.piece;
  if (!p) return;
  while (!collides(s.board, p.shape, p.x, p.y + 1)) p.y++;
}

// Xoá hàng đầy, thêm hàng trống trên đỉnh; trả số hàng đã xoá.
export function clearLines(board) {
  const keep = board.filter((row) => row.some((v) => !v));
  const n = H - keep.length;
  board.splice(0, H, ...Array.from({ length: n }, () => Array(W).fill('')), ...keep);
  return n;
}

// Một nhịp rơi (hoặc bấm xuống): rơi 1 ô, không rơi được thì khoá, xoá hàng, cộng điểm, sinh khối mới.
// Trả số hàng vừa xoá (-1 nếu khối chỉ rơi).
export function tick(s, rand = Math.random) {
  const p = s.piece;
  if (!p || s.over) return -1;
  if (!collides(s.board, p.shape, p.x, p.y + 1)) {
    p.y++;
    return -1;
  }
  p.shape.forEach((row, r) => {
    row.forEach((v, c) => { if (v && p.y + r >= 0) s.board[p.y + r][p.x + c] = p.type; });
  });
  const n = clearLines(s.board);
  s.score += POINTS[n];
  spawn(s, rand);
  return n;
}

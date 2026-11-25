// Luật Sudoku (thuần, không DOM): bàn 9×9, mỗi hàng / cột / khối 3×3 có đủ 1–9 không trùng.
// Đề = một lời giải ngẫu nhiên (quay lui) rồi khoét bớt số theo độ khó; gợi ý lấy số từ lời giải đó.
// Ô: { value: số | null, given: số đề cho, error: trùng với ô khác, notes: [số bút chì] }.
export const N = 9;
export const BOX = 3;
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
// Số ô khoét theo độ khó (dễ còn 41 số, vừa 31, khó 21).
export const HOLES = { easy: 40, medium: 50, hard: 60 };
export const HINTS = 3;

/** Thời gian chơi dạng m:ss, vd 75 -> "1:15". */
export const formatTime = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// Số `num` đặt được ở (row, col) của bàn số (0 = trống) không.
export function isValid(b, row, col, num) {
  for (let k = 0; k < N; k++) {
    if (k !== col && b[row][k] === num) return false;
    if (k !== row && b[k][col] === num) return false;
  }
  const r0 = Math.floor(row / BOX) * BOX, c0 = Math.floor(col / BOX) * BOX;
  for (let r = r0; r < r0 + BOX; r++) {
    for (let c = c0; c < c0 + BOX; c++) if ((r !== row || c !== col) && b[r][c] === num) return false;
  }
  return true;
}

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fill(b, rand) {
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      if (b[row][col]) continue;
      for (const num of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand)) {
        if (!isValid(b, row, col, num)) continue;
        b[row][col] = num;
        if (fill(b, rand)) return true;
        b[row][col] = 0;
      }
      return false;
    }
  }
  return true;
}

export function solvedBoard(rand = Math.random) {
  const b = Array.from({ length: N }, () => Array(N).fill(0));
  fill(b, rand);
  return b;
}

// Đề mới: { board: ô[9][9], solution: số[9][9] }.
export function newPuzzle(difficulty, rand = Math.random) {
  const solution = solvedBoard(rand);
  const puzzle = solution.map((row) => [...row]);
  for (let removed = 0; removed < HOLES[difficulty];) {
    const r = Math.floor(rand() * N), c = Math.floor(rand() * N);
    if (puzzle[r][c]) { puzzle[r][c] = 0; removed++; }
  }
  const board = puzzle.map((row) => row.map((v) => ({ value: v || null, given: !!v, error: false, notes: [] })));
  return { board, solution };
}

// Đánh dấu error cho mọi ô trùng số trong cùng hàng / cột / khối (sửa tại chỗ, trả lại board).
export function markConflicts(board) {
  for (const row of board) for (const cell of row) cell.error = false;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = board[r][c].value;
      if (v == null) continue;
      const r0 = Math.floor(r / BOX) * BOX, c0 = Math.floor(c / BOX) * BOX;
      for (let k = 0; k < N; k++) {
        const peers = [[r, k], [k, c], [r0 + Math.floor(k / BOX), c0 + (k % BOX)]];
        for (const [pr, pc] of peers) {
          if ((pr !== r || pc !== c) && board[pr][pc].value === v) board[r][c].error = board[pr][pc].error = true;
        }
      }
    }
  }
  return board;
}

export const isFull = (board) => board.every((row) => row.every((cell) => cell.value != null));
export const isSolved = (board) => board.every((row) => row.every((cell) => cell.value != null && !cell.error));

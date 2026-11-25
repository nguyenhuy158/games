// Luật 2048 (thuần, không DOM): bàn 4×4 là mảng 16 số theo hàng (0 = ô trống).
// Trượt về một hướng: các ô dồn sát, hai ô cùng số chạm nhau thì gộp (mỗi ô chỉ gộp một lần mỗi lượt), điểm cộng = số mới.
// Mỗi lượt có ô đổi chỗ thì sinh một ô mới: 2 (90%) hoặc 4 (10%). Hết ô trống và không còn cặp kề nhau giống nhau là hết ván.
export const SIZE = 4;
export const CELLS = SIZE * SIZE;
export const DIRS = ['left', 'right', 'up', 'down'];
const FOUR_CHANCE = 0.1;
// Điểm lớn nhất có thể (ô 131072 cuối cùng) — server dùng để loại điểm vô lý ở bảng xếp hạng.
export const MAX_SCORE = 3_932_100;

export const emptyCells = (g) => g.flatMap((v, i) => (v ? [] : [i]));

// Thêm một ô mới vào ô trống ngẫu nhiên; trả bàn mới (bàn đầy thì trả nguyên).
export function addTile(g, rand = Math.random) {
  const free = emptyCells(g);
  if (!free.length) return g;
  const next = [...g];
  next[free[Math.floor(rand() * free.length)]] = rand() < FOUR_CHANCE ? 4 : 2;
  return next;
}

export const newGame = (rand = Math.random) => addTile(addTile(Array(CELLS).fill(0), rand), rand);

// Chỉ số các ô của từng đường theo thứ tự dồn (ô đầu = phía dồn tới).
const LINES = {
  left: (k) => [0, 1, 2, 3].map((c) => k * SIZE + c),
  right: (k) => [3, 2, 1, 0].map((c) => k * SIZE + c),
  up: (k) => [0, 1, 2, 3].map((r) => r * SIZE + k),
  down: (k) => [3, 2, 1, 0].map((r) => r * SIZE + k),
};

// Dồn một đường về đầu: [2, 2, 2, 0] -> { line: [4, 2, 0, 0], gain: 4 }.
export function mergeLine(line) {
  const nums = line.filter(Boolean);
  const out = [];
  let gain = 0;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] === nums[i + 1]) {
      out.push(nums[i] * 2);
      gain += nums[i] * 2;
      i++;
    } else out.push(nums[i]);
  }
  while (out.length < SIZE) out.push(0);
  return { line: out, gain };
}

// Trượt cả bàn: { grid, gain, moved }. Không sinh ô mới (game.js gọi addTile khi moved).
export function slide(g, dir) {
  const grid = [...g];
  let gain = 0;
  for (let k = 0; k < SIZE; k++) {
    const idx = LINES[dir](k);
    const r = mergeLine(idx.map((i) => g[i]));
    idx.forEach((i, j) => { grid[i] = r.line[j]; });
    gain += r.gain;
  }
  return { grid, gain, moved: grid.some((v, i) => v !== g[i]) };
}

export function isOver(g) {
  if (g.includes(0)) return false;
  for (let i = 0; i < CELLS; i++) {
    if (i % SIZE < SIZE - 1 && g[i] === g[i + 1]) return false;
    if (i + SIZE < CELLS && g[i] === g[i + SIZE]) return false;
  }
  return true;
}

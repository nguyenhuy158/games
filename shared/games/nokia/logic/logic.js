// Logic (Nokia 3210) = Mastermind: mã 4 ô, mỗi ô 1 trong 6 hình (được trùng). Luật thuần dùng chung server + test.
export const SLOTS = 4, KINDS = 6, MAX_GUESSES = 10, TIME_MS = 5 * 60_000;
// 6 hình 5×5: tròn, vuông, tam giác, chữ X, kim cương, dấu cộng.
export const SHAPES = [
  ['.###.', '#...#', '#...#', '#...#', '.###.'],
  ['#####', '#...#', '#...#', '#...#', '#####'],
  ['..#..', '.#.#.', '.#.#.', '#...#', '#####'],
  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  ['..#..', '..#..', '#####', '..#..', '..#..'],
];

export const newSecret = (rand = Math.random) => Array.from({ length: SLOTS }, () => Math.floor(rand() * KINDS));

export const valid = (guess) => Array.isArray(guess) && guess.length === SLOTS && guess.every((x) => Number.isInteger(x) && x >= 0 && x < KINDS);

// Chấm điểm: exact = đúng hình đúng chỗ, near = đúng hình sai chỗ (mỗi hình trong mã chỉ tính 1 lần).
export function score(secret, guess) {
  let exact = 0;
  const a = [], b = [];
  secret.forEach((s, i) => { if (s === guess[i]) exact++; else { a.push(s); b.push(guess[i]); } });
  let near = 0;
  for (const x of b) { const k = a.indexOf(x); if (k >= 0) { near++; a.splice(k, 1); } }
  return { exact, near };
}

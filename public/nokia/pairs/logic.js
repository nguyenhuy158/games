// Pairs (Nokia 3310 Pairs II): 6×4 lá = 12 cặp hình pixel 7×7. Luật thuần dùng chung server + test.
export const COLS = 6, ROWS = 4;
// 12 hình tự vẽ ('#' = sáng): tim, sao, nốt nhạc, mặt cười, mặt trời, trăng, nhà, cây, cá, cốc, chìa khoá, chuông.
export const ICONS = [
  ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...', '.......'],
  ['...#...', '..###..', '#######', '.#####.', '.##.##.', '##...##', '.......'],
  ['..####.', '..#..#.', '..#..#.', '..#..#.', '###.###', '###.###', '.......'],
  ['.#####.', '#.#.#.#', '#######', '#.###.#', '##...##', '.#####.', '.......'],
  ['#..#..#', '.#####.', '.#####.', '#######', '.#####.', '.#####.', '#..#..#'],
  ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
  ['...#...', '..###..', '.#####.', '#######', '.##.##.', '.##.##.', '.#####.'],
  ['...#...', '..###..', '.#####.', '..###..', '.#####.', '#######', '...#...'],
  ['.......', '.####.#', '######.', '#.####.', '######.', '.####.#', '.......'],
  ['.......', '#####..', '#####.#', '#####.#', '#####..', '.###...', '#####..'],
  ['.###...', '#...#..', '#...###', '.###.##', '.....#.', '.......', '.......'],
  ['...#...', '..###..', '.#####.', '.#####.', '.#####.', '#######', '...#...'],
];

export function newDeck(rand = Math.random) {
  const deck = [...ICONS.keys(), ...ICONS.keys()];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Lật lá i: trả về 'first' | 'match' | 'miss' | null (không lật được).
export function flip(g, i) {
  if (!Number.isInteger(i) || i < 0 || i >= g.deck.length || g.owner[i] != null || g.open.includes(i) || g.open.length >= 2) return null;
  g.open.push(i);
  if (g.open.length === 1) return 'first';
  const [a, b] = g.open;
  return g.deck[a] === g.deck[b] ? 'match' : 'miss';
}

export const done = (g) => g.owner.every((o) => o != null);

// Luật Bầu cua (thuần, dùng chung cho server + test).
// Đặt x xu vào một con: ra k mặt con đó (k = 1..3) thì ăn x*k, không ra thì mất x. Nhà cái chung/nhận phần ngược lại.
export const SYMBOLS = [
  { key: 'nai', name: 'Nai', emoji: '🦌' },
  { key: 'bau', name: 'Bầu', emoji: '🍐' },
  { key: 'ga', name: 'Gà', emoji: '🐓' },
  { key: 'ca', name: 'Cá', emoji: '🐟' },
  { key: 'cua', name: 'Cua', emoji: '🦀' },
  { key: 'tom', name: 'Tôm', emoji: '🦐' },
];
export const CHIPS = [10, 50, 100, 500];
export const START_COINS = 1000;
export const RESCUE = 500; // hết xu (< phỉnh nhỏ nhất) thì được cứu trợ, không tính vào lãi/lỗ

export const roll = (rand = Math.random) => Array.from({ length: 3 }, () => Math.floor(rand() * SYMBOLS.length));

// bets: { id: [6 số xu] } -> { id: lãi/lỗ } (chưa gồm nhà cái).
export function settle(bets, dice) {
  const hits = SYMBOLS.map((_, s) => dice.filter((d) => d === s).length);
  return Object.fromEntries(Object.entries(bets).map(([id, b]) => [id, b.reduce((sum, x, s) => sum + (x ? (hits[s] ? x * hits[s] : -x) : 0), 0)]));
}

export const betTotal = (b) => (b ? b.reduce((a, x) => a + x, 0) : 0);

// Luật Bắn tàu (Battleship) thuần, dùng chung server + test. Biển N×N, ô i = hàng * N + cột.
// Hạm đội: tàu dài 5, 4, 3, 3, 2 nằm ngang/dọc, không chạm nhau (kể cả chéo).
// Bản đồ bắn của một người (bắn sang biển đối thủ): 0 chưa bắn, 1 trượt, 2 trúng, 3 thuộc tàu đã chìm.
export const N = 10;
export const FLEET = [5, 4, 3, 3, 2];
export const MISS = 1, HIT = 2, SUNK = 3;

const around = (i) => {
  const r = Math.floor(i / N), c = i % N, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const rr = r + dr, cc = c + dc;
    if ((dr || dc) && rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc);
  }
  return out;
};

// Xếp ngẫu nhiên cả hạm đội. Trả về mảng tàu, mỗi tàu = danh sách ô (từ đầu tới đuôi).
export function randomFleet(rand = Math.random) {
  for (;;) {
    const taken = new Set(), ships = [];
    for (const len of FLEET) {
      let placed = null;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const down = rand() < 0.5;
        const r = Math.floor(rand() * (down ? N - len + 1 : N)), c = Math.floor(rand() * (down ? N : N - len + 1));
        const cells = Array.from({ length: len }, (_, k) => (r + (down ? k : 0)) * N + c + (down ? 0 : k));
        if (cells.every((i) => !taken.has(i) && around(i).every((j) => !taken.has(j) || cells.includes(j)))) placed = cells;
      }
      if (!placed) break; // hiếm: kẹt chỗ -> xếp lại từ đầu
      placed.forEach((i) => taken.add(i));
      ships.push(placed);
    }
    if (ships.length === FLEET.length) return ships;
  }
}

// Các ô của tàu dài len, đầu ở ô head, nằm dọc (down) hay ngang; null nếu tràn ra ngoài biển.
export function shipAt(head, len, down) {
  const r = Math.floor(head / N), c = head % N;
  if ((down ? r : c) + len > N) return null;
  return Array.from({ length: len }, (_, k) => head + k * (down ? N : 1));
}

// Hạm đội người chơi tự xếp có hợp lệ không: đúng số tàu + độ dài theo FLEET, mỗi tàu thẳng hàng liền nhau, không chạm nhau.
export function validFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
  const owner = new Map();
  for (let k = 0; k < ships.length; k++) {
    const s = ships[k];
    if (!Array.isArray(s) || s.length !== FLEET[k] || !s.every((i) => Number.isInteger(i) && i >= 0 && i < N * N)) return false;
    const down = s.length > 1 && s[1] - s[0] === N;
    const want = shipAt(s[0], s.length, down);
    if (!want || want.some((i, j) => i !== s[j])) return false;
    for (const i of s) owner.set(i, k);
  }
  if (owner.size !== FLEET.reduce((a, b) => a + b)) return false;
  for (const [i, k] of owner) if (around(i).some((j) => owner.has(j) && owner.get(j) !== k)) return false;
  return true;
}

// Bắn ô i vào hạm đội `ships`, ghi lên bản đồ bắn `shots` (sửa tại chỗ).
// Tàu chìm: đánh dấu SUNK cả tàu + các ô xung quanh thành trượt (luật không chạm nên chắc chắn trống).
// Trả về { hit, sunk (chỉ số tàu hoặc -1), done (hết tàu) } hoặc null nếu ô đã bắn / ngoài biển.
export function shoot(ships, shots, i) {
  if (!Number.isInteger(i) || i < 0 || i >= N * N || shots[i]) return null;
  const k = ships.findIndex((s) => s.includes(i));
  if (k < 0) { shots[i] = MISS; return { hit: false, sunk: -1, done: false }; }
  shots[i] = HIT;
  const ship = ships[k];
  if (!ship.every((j) => shots[j])) return { hit: true, sunk: -1, done: false };
  for (const j of ship) { shots[j] = SUNK; for (const a of around(j)) if (!shots[a]) shots[a] = MISS; }
  return { hit: true, sunk: k, done: ships.every((s) => s.every((j) => shots[j] === SUNK)) };
}

// Máy bắn: có ô trúng (chưa chìm) thì "săn" quanh nó — 2 ô trúng thẳng hàng thì bắn nối dài 2 đầu;
// không có thì bắn ngẫu nhiên ô chưa bắn theo ô bàn cờ (tàu ngắn nhất dài 2 nên chắc chắn đè ít nhất 1 ô đen).
export function botShot(shots, rand = Math.random) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const hits = shots.flatMap((v, i) => (v === HIT ? [i] : []));
  if (hits.length) {
    const free = (r, c) => r >= 0 && r < N && c >= 0 && c < N && !shots[r * N + c];
    const rs = hits.map((i) => Math.floor(i / N)), cs = hits.map((i) => i % N);
    const line = [];
    if (hits.length > 1 && rs.every((r) => r === rs[0])) {
      const lo = Math.min(...cs) - 1, hi = Math.max(...cs) + 1;
      if (free(rs[0], lo)) line.push(rs[0] * N + lo);
      if (free(rs[0], hi)) line.push(rs[0] * N + hi);
    } else if (hits.length > 1 && cs.every((c) => c === cs[0])) {
      const lo = Math.min(...rs) - 1, hi = Math.max(...rs) + 1;
      if (free(lo, cs[0])) line.push(lo * N + cs[0]);
      if (free(hi, cs[0])) line.push(hi * N + cs[0]);
    }
    if (line.length) return pick(line);
    const next = hits.flatMap((i) => {
      const r = Math.floor(i / N), c = i % N;
      return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([rr, cc]) => free(rr, cc)).map(([rr, cc]) => rr * N + cc);
    });
    if (next.length) return pick(next);
  }
  const open = shots.flatMap((v, i) => (v ? [] : [i]));
  const even = open.filter((i) => (Math.floor(i / N) + (i % N)) % 2 === 0);
  return pick(even.length ? even : open);
}

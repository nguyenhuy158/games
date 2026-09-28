// Luật Dò mìn dạng hàm thuần (server + test). Client KHÔNG giữ vị trí mìn — chỉ nhận ô đã mở.
// Ô đánh chỉ số i = r * C + c. Trạng thái nhìn thấy (vis) mỗi ô:
export const HIDDEN = -1, FLAG = -2, BOOM = -3; // 0..8 = đã mở, số mìn xung quanh

export const SIZES = [
  { name: 'Dễ', cols: 9, rows: 9, mines: 10 },
  { name: 'Vừa', cols: 16, rows: 16, mines: 40 },
  { name: 'Khó', cols: 30, rows: 16, mines: 99 },
];
export const LIVES = 3; // chơi chung: cả đội 3 mạng
export const BOOM_PENALTY_MS = 10_000; // đua: đạp mìn cộng 10 giây

export function neighbors(i, R, C) {
  const r = Math.floor(i / C), c = i % C, out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < R && cc >= 0 && cc < C) out.push(rr * C + cc);
    }
  }
  return out;
}

// Rải mìn chừa ô `safe` và 8 ô quanh nó (mở ra luôn là vùng trống, không ai đạp mìn nước đầu).
// Trả về { mines: 0/1 mỗi ô, counts: số mìn xung quanh }.
export function newField({ rows: R, cols: C, mines: n }, safe, rand = Math.random) {
  const banned = new Set([safe, ...neighbors(safe, R, C)]);
  const pool = [];
  for (let i = 0; i < R * C; i++) if (!banned.has(i)) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const mines = new Array(R * C).fill(0);
  for (const i of pool.slice(0, n)) mines[i] = 1;
  const counts = mines.map((_, i) => neighbors(i, R, C).reduce((s, j) => s + mines[j], 0));
  return { mines, counts };
}

export const newVis = (R, C) => new Array(R * C).fill(HIDDEN);

// Mở ô i (loang ô 0). Trả về { opened: [[i, v], ...], boom: bool }. Không đụng ô cờ.
export function reveal(field, vis, i, R, C) {
  if (vis[i] !== HIDDEN) return { opened: [], boom: false };
  if (field.mines[i]) { vis[i] = BOOM; return { opened: [[i, BOOM]], boom: true }; }
  const opened = [];
  const stack = [i];
  while (stack.length) {
    const k = stack.pop();
    if (vis[k] !== HIDDEN || field.mines[k]) continue;
    vis[k] = field.counts[k];
    opened.push([k, vis[k]]);
    if (vis[k] === 0) for (const j of neighbors(k, R, C)) if (vis[j] === HIDDEN) stack.push(j);
  }
  return { opened, boom: false };
}

// "Chord": bấm vào ô số đã đủ cờ -> mở hết ô chưa cờ xung quanh.
export function chord(field, vis, i, R, C) {
  const v = vis[i];
  if (!(v > 0)) return { opened: [], boom: false };
  const around = neighbors(i, R, C);
  const flags = around.filter((j) => vis[j] === FLAG || vis[j] === BOOM).length;
  if (flags !== v) return { opened: [], boom: false };
  const out = { opened: [], boom: false };
  for (const j of around) {
    const r = reveal(field, vis, j, R, C);
    out.opened.push(...r.opened);
    out.boom ||= r.boom;
  }
  return out;
}

export function toggleFlag(vis, i) {
  if (vis[i] === HIDDEN) vis[i] = FLAG;
  else if (vis[i] === FLAG) vis[i] = HIDDEN;
  else return null;
  return vis[i] === FLAG;
}

// Số ô an toàn đã mở / tổng ô an toàn.
export const openedCount = (vis) => vis.filter((v) => v >= 0).length;
export const safeTotal = ({ rows, cols, mines }) => rows * cols - mines;
export const cleared = (vis, size) => openedCount(vis) >= safeTotal(size);

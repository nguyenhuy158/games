// Snake (Nokia 3310 / Snake II) — luật thuần dùng chung server + test.
// Lưới COLS×ROWS ô 3px trên LCD 84×48 (hàng trên cùng để ghi điểm).
export const COLS = 27, ROWS = 13;
export const SPEEDS = [230, 190, 150, 120, 90]; // ms mỗi bước theo cấp 1..5
export const MAX = 4;
const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
export const BUG_EVERY = 5, BUG_LIFE = 24; // cứ 5 mồi ra 1 con bọ, sống 24 bước

// Vị trí xuất phát: các con nằm ngang, cách đều theo chiều dọc, quay hai hướng xen kẽ.
export function createGame(ids, { walls = false } = {}, rand = Math.random) {
  const snakes = ids.map((id, k) => {
    const y = Math.round(((k + 1) * ROWS) / (ids.length + 1)) - (ids.length === 1 ? 0 : 0);
    const right = k % 2 === 0;
    const x0 = right ? 6 : COLS - 7;
    const body = [0, 1, 2].map((i) => [right ? x0 - i : x0 + i, Math.min(ROWS - 1, y)]);
    return { id, body, dir: right ? 'right' : 'left', queue: [], alive: true, grow: 0, score: 0, diedAt: 0 };
  });
  const g = { snakes, walls, food: null, bug: null, eaten: 0, step: 0 };
  g.food = freeCell(g, rand);
  return g;
}

export const occupied = (g) => new Set(g.snakes.filter((s) => s.alive).flatMap((s) => s.body.map(([x, y]) => y * COLS + x)));

export function freeCell(g, rand = Math.random) {
  const used = occupied(g);
  if (g.food) used.add(g.food[1] * COLS + g.food[0]);
  if (g.bug) used.add(g.bug.at[1] * COLS + g.bug.at[0]);
  const free = [];
  for (let i = 0; i < COLS * ROWS; i++) if (!used.has(i)) free.push(i);
  if (!free.length) return null;
  const i = free[Math.floor(rand() * free.length)];
  return [i % COLS, Math.floor(i / COLS)];
}

// Đổi hướng: xếp hàng tối đa 2 lượt bấm (bấm nhanh 2 phím liên tiếp vẫn ăn), cấm quay đầu 180°.
export function turn(s, d) {
  if (!DIR[d] || !s.alive) return false;
  const last = s.queue.at(-1) ?? s.dir;
  if (d === last || d === OPP[last] || s.queue.length >= 2) return false;
  s.queue.push(d);
  return true;
}

// Một bước cho mọi con rắn. Trả về các sự kiện (ăn mồi / ăn bọ / chết) để client kêu bíp.
export function step(g, rand = Math.random) {
  g.step++;
  const events = [];
  const live = g.snakes.filter((s) => s.alive);
  const heads = new Map();
  for (const s of live) {
    if (s.queue.length) s.dir = s.queue.shift();
    const [dx, dy] = DIR[s.dir];
    let [x, y] = s.body[0];
    x += dx; y += dy;
    if (!g.walls) { x = (x + COLS) % COLS; y = (y + ROWS) % ROWS; }
    heads.set(s, [x, y]);
  }
  // Thân sau bước này: đuôi rụt đi (trừ khi đang dài ra), nên đâm vào ô đuôi vừa rời là không sao.
  const bodies = new Set();
  for (const s of live) {
    const keep = s.grow > 0 ? s.body.length : s.body.length - 1;
    for (const [x, y] of s.body.slice(0, keep)) bodies.add(y * COLS + x);
  }
  const headCount = new Map();
  for (const [x, y] of heads.values()) headCount.set(y * COLS + x, (headCount.get(y * COLS + x) ?? 0) + 1);
  const dead = [];
  for (const s of live) {
    const [x, y] = heads.get(s);
    const k = y * COLS + x;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || bodies.has(k) || headCount.get(k) > 1) dead.push(s);
  }
  for (const s of live) {
    if (dead.includes(s)) continue;
    const [x, y] = heads.get(s);
    s.body.unshift([x, y]);
    if (s.grow > 0) s.grow--; else s.body.pop();
    if (g.food && x === g.food[0] && y === g.food[1]) {
      s.grow++; s.score += 1; g.eaten++;
      events.push({ t: 'eat', id: s.id });
      g.food = null;
      if (g.eaten % BUG_EVERY === 0 && !g.bug) {
        const at = freeCell(g, rand);
        if (at) g.bug = { at, left: BUG_LIFE };
      }
      g.food = freeCell(g, rand);
    } else if (g.bug && x === g.bug.at[0] && y === g.bug.at[1]) {
      // Bọ: ăn càng sớm càng nhiều điểm (5..20).
      s.score += 5 + Math.round((15 * g.bug.left) / BUG_LIFE);
      s.grow += 2;
      g.bug = null;
      events.push({ t: 'bug', id: s.id });
    }
  }
  for (const s of dead) { s.alive = false; s.diedAt = g.step; events.push({ t: 'die', id: s.id }); }
  if (g.bug && --g.bug.left <= 0) g.bug = null;
  return events;
}

// Hết ván: chơi một mình -> khi chết; nhiều người -> còn ≤ 1 con sống.
export const over = (g) => {
  const alive = g.snakes.filter((s) => s.alive).length;
  return g.snakes.length === 1 ? alive === 0 : alive <= 1;
};

// Xếp hạng: sống lâu hơn trước, bằng nhau thì điểm cao hơn.
export const ranking = (g) => [...g.snakes].sort((a, b) => (b.alive - a.alive) || (b.diedAt - a.diedAt) || (b.score - a.score));

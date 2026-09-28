// Bounce (Nokia 6600) — mô phỏng thuần ở client, dùng chung test. Màn cao 8 ô (ô 6px = đúng cao LCD), dài nhiều màn hình.
// Ô: '#' gạch, '^' gai, 'o' vòng (chui qua để thu), 'E' cửa đích (mở khi đủ vòng), 'l' mạng, '.' trống.
export const T = 6, ROWS = 8, BALL = 6;
export const GRAV = 190, JUMP = 98, SPEED = 42, LIVES = 3;

// Dựng màn từ danh sách chi tiết (khỏi phải vẽ tay lưới ký tự dễ lệch hàng).
//   ['block', col, row, w, h] ['spike', col, w, row = 6] ['ring', col, row] (cao 2 ô: row, row+1) ['life', col, row]
function build(len, items) {
  const g = Array.from({ length: ROWS }, (_, r) => Array.from({ length: len }, (_, c) => (r === 0 || r === ROWS - 1 || c === 0 || c === len - 1 ? '#' : '.')));
  for (const [kind, c, a, b, h] of items) {
    if (kind === 'block') for (let y = a; y < a + h; y++) for (let x = c; x < c + b; x++) g[y][x] = '#';
    if (kind === 'spike') for (let x = c; x < c + a; x++) g[b ?? 6][x] = '^';
    if (kind === 'ring') { g[a][c] = 'o'; g[a + 1][c] = 'o'; }
    if (kind === 'life') g[a][c] = 'l';
  }
  g[5][len - 3] = 'E'; g[6][len - 3] = 'E';
  return g.map((r) => r.join(''));
}

export const LEVELS = [
  build(60, [
    ['block', 10, 6, 2, 1], ['ring', 15, 4], ['spike', 20, 2], ['block', 26, 5, 3, 2], ['ring', 27, 2],
    ['spike', 33, 3], ['block', 40, 4, 2, 3], ['ring', 46, 4], ['spike', 50, 2],
  ]),
  build(84, [
    ['ring', 8, 4], ['spike', 12, 3], ['block', 18, 5, 4, 2], ['spike', 22, 3], ['block', 25, 5, 4, 2], ['ring', 26, 2],
    ['block', 34, 1, 6, 3], ['ring', 37, 4], ['spike', 44, 2], ['block', 48, 4, 2, 3], ['life', 49, 3], ['spike', 52, 3],
    ['block', 58, 5, 3, 2], ['block', 61, 3, 3, 4], ['ring', 62, 1], ['spike', 66, 3], ['ring', 72, 4], ['spike', 76, 2],
  ]),
  build(108, [
    ['spike', 8, 2], ['ring', 12, 4], ['block', 16, 5, 2, 2], ['spike', 18, 3], ['block', 21, 5, 2, 2], ['ring', 22, 2],
    ['block', 28, 1, 8, 2], ['spike', 30, 3], ['ring', 38, 4], ['block', 42, 4, 3, 3], ['spike', 45, 3], ['block', 48, 3, 3, 4],
    ['ring', 49, 1], ['life', 55, 5], ['spike', 58, 4], ['block', 64, 5, 2, 2], ['block', 68, 4, 2, 3], ['block', 72, 3, 2, 4],
    ['ring', 73, 1], ['spike', 76, 4], ['block', 82, 1, 6, 3], ['ring', 85, 4], ['spike', 90, 3], ['ring', 96, 4], ['spike', 100, 2],
  ]),
];

export const tileAt = (lv, x, y) => {
  const c = Math.floor(x / T), r = Math.floor(y / T);
  return r < 0 || r >= ROWS || c < 0 || c >= lv[0].length ? '#' : lv[r][c];
};
const ringsOf = (lv) => new Set(lv.flatMap((row, r) => [...row].map((ch, c) => (ch === 'o' && lv[r - 1]?.[c] !== 'o' ? `${c}:${r}` : null)).filter(Boolean)));

export function createSim(level) {
  const lv = LEVELS[level] ?? LEVELS[0];
  const start = { x: 2 * T, y: 6 * T };
  return { level, lv, x: start.x, y: start.y, vx: 0, vy: 0, ground: false, lives: LIVES, rings: new Set(), total: ringsOf(lv).size, lifeTaken: new Set(),
    safe: { ...start }, safeT: 0, t: 0, dead: false, finished: false, jumpQueued: false, events: [] };
}

// Bóng chiếm [x, x + BALL) × [y, y + BALL): mép phải / dưới lấy x + BALL - ε để lún 0.01px cũng tính là chạm.
const E = 1e-6;
const solid = (sim, x, y, w = BALL, h = BALL) => {
  const r = x + w - E, b = y + h - E;
  for (const [px, py] of [[x, y], [r, y], [x, b], [r, b], [x + w / 2, b], [x + w / 2, y]]) {
    if (tileAt(sim.lv, px, py) === '#') return true;
  }
  return false;
};
// Các ô ball đang đè lên (thu nhỏ 1px để chạm gai công bằng).
const touching = (sim) => {
  const out = new Set();
  for (let py = sim.y + 1; py <= sim.y + BALL - 2; py += 2) for (let px = sim.x + 1; px <= sim.x + BALL - 2; px += 2) out.add(`${Math.floor(px / T)}:${Math.floor(py / T)}`);
  return [...out].map((k) => { const [c, r] = k.split(':').map(Number); return { c, r, ch: sim.lv[r]?.[c] }; });
};

export const jump = (sim) => { sim.jumpQueued = true; };

export function step(sim, dt, keys = {}) {
  if (sim.dead || sim.finished) return sim;
  sim.events = [];
  sim.t += dt;
  const want = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * SPEED;
  sim.vx += (want - sim.vx) * Math.min(1, dt * 10);
  if (sim.jumpQueued && sim.ground) { sim.vy = -JUMP; sim.ground = false; sim.events.push('jump'); }
  sim.jumpQueued = false;
  sim.vy = Math.min(160, sim.vy + GRAV * dt);
  // Trục x rồi trục y. Đâm gạch thì đặt khít mép ô (mỗi bước đi < 1 ô nên ô chạm luôn là ô ở mép trước).
  const nx = sim.x + sim.vx * dt;
  if (!solid(sim, nx, sim.y)) sim.x = nx;
  else { sim.x = sim.vx > 0 ? Math.floor((nx + BALL - E) / T) * T - BALL : (Math.floor(nx / T) + 1) * T; sim.vx = 0; }
  const ny = sim.y + sim.vy * dt;
  sim.ground = false;
  if (!solid(sim, sim.x, ny)) sim.y = ny;
  else {
    if (sim.vy > 0) { sim.y = Math.floor((ny + BALL - E) / T) * T - BALL; sim.ground = true; } else sim.y = (Math.floor(ny / T) + 1) * T;
    sim.vy = 0;
  }
  // Chỗ đứng an toàn gần nhất (để hồi sinh).
  if (sim.ground) { sim.safeT += dt; if (sim.safeT > 0.3) sim.safe = { x: sim.x, y: sim.y }; } else sim.safeT = 0;
  for (const { c, r, ch } of touching(sim)) {
    if (ch === '^') return hurt(sim);
    if (ch === 'o') {
      const top = sim.lv[r - 1]?.[c] === 'o' ? r - 1 : r;
      const key = `${c}:${top}`;
      if (!sim.rings.has(key)) { sim.rings.add(key); sim.events.push('ring'); }
    }
    if (ch === 'l' && !sim.lifeTaken.has(`${c}:${r}`)) { sim.lifeTaken.add(`${c}:${r}`); sim.lives++; sim.events.push('life'); }
    if (ch === 'E' && sim.rings.size >= sim.total) { sim.finished = true; sim.events.push('finish'); return sim; }
  }
  return sim;
}

function hurt(sim) {
  sim.lives--;
  sim.events.push('hurt');
  if (sim.lives <= 0) { sim.dead = true; sim.events.push('dead'); return sim; }
  Object.assign(sim, { x: sim.safe.x, y: sim.safe.y, vx: 0, vy: 0 });
  return sim;
}

export const timeScore = (sim) => Math.round(sim.t * 10) / 10;

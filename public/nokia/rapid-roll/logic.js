// Rapid Roll (Nokia 1110i) — mô phỏng thuần ở client (cùng hạt giống thì cùng đề). Toạ độ "thế giới": y tăng xuống dưới,
// màn hình cuộn xuống theo thời gian (các thanh trông như trôi lên). Chết khi chạm gai trên cùng, rơi khỏi đáy
// hoặc đậu lên thanh gai. Tim trên thanh: +1 mạng.
export const W = 84, H = 48, TOP = 9, BALL = 4, PW = 16, GAP = 12;
export const LIVES = 3, MAX_LIVES = 5, FALL = 36, MOVE = 46;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Quãng đường cuộn sau t giây: tốc độ 10 px/s tăng 0.5 px/s mỗi giây, tối đa 32.
export function scrollAt(t) {
  const cap = 44; // (32 - 10) / 0.5
  if (t <= cap) return 10 * t + 0.25 * t * t;
  return 10 * cap + 0.25 * cap * cap + 32 * (t - cap);
}

export function createSim(seed) {
  const sim = { rand: rng(seed), plats: [], next: 0, t: 0, x: 40, y: 0, on: null, lives: LIVES, dead: false, invul: 0, hearts: 0, events: [] };
  ensure(sim);
  const p = sim.plats[2];
  Object.assign(sim, { x: p.x + PW / 2 - BALL / 2, y: p.y - BALL, on: p });
  return sim;
}

// Sinh thanh tới dưới đáy màn một khoảng; bỏ thanh đã trôi quá gai.
function ensure(sim) {
  const s = scrollAt(sim.t);
  while (sim.next * GAP + 24 < s + H + 30) {
    const k = sim.next++;
    const x = Math.floor(sim.rand() * (W - PW));
    const r2 = sim.rand(), r3 = sim.rand();
    const spike = k > 4 && r2 < 0.18;
    sim.plats.push({ k, x, y: 24 + k * GAP, spike, heart: !spike && k > 6 && r3 < 0.07 });
  }
  while (sim.plats.length && sim.plats[0].y < s - 4) sim.plats.shift();
}

export const score = (sim) => Math.floor(scrollAt(sim.t) / 4);

// Một bước dt giây với phím đang giữ { left, right }.
export function step(sim, dt, keys = {}) {
  if (sim.dead) return sim;
  sim.events = [];
  sim.t += dt;
  ensure(sim);
  const s = scrollAt(sim.t);
  if (sim.invul > 0) sim.invul -= dt;
  sim.x = Math.max(0, Math.min(W - BALL, sim.x + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * MOVE * dt));
  if (sim.on && (sim.x + BALL <= sim.on.x || sim.x >= sim.on.x + PW)) sim.on = null; // lăn ra khỏi mép
  if (!sim.on) {
    const y0 = sim.y;
    sim.y += FALL * dt;
    for (const p of sim.plats) {
      if (y0 + BALL <= p.y && sim.y + BALL >= p.y && sim.x + BALL > p.x && sim.x < p.x + PW) {
        sim.y = p.y - BALL;
        sim.on = p;
        if (p.spike && sim.invul <= 0) return hurt(sim, 'spike');
        if (p.heart) { p.heart = false; sim.lives = Math.min(MAX_LIVES, sim.lives + 1); sim.hearts++; sim.events.push('heart'); }
        break;
      }
    }
  }
  const sy = sim.y - s;
  if (sy < TOP && sim.invul <= 0) return hurt(sim, 'top');
  if (sy > H) return hurt(sim, 'fall');
  return sim;
}

// Mất mạng: hồi sinh trên thanh an toàn ở giữa màn, bất tử 1.5 giây.
function hurt(sim, why) {
  sim.lives--;
  sim.events.push(why);
  if (sim.lives <= 0) { sim.dead = true; sim.events.push('dead'); return sim; }
  const s = scrollAt(sim.t);
  const p = sim.plats.find((q) => !q.spike && q.y - s > 20 && q.y - s < 40) ?? sim.plats.find((q) => q.y - s > TOP + 6) ?? sim.plats.at(-1);
  Object.assign(sim, { x: p.x + PW / 2 - BALL / 2, y: p.y - BALL, on: p, invul: 1.5 });
  return sim;
}

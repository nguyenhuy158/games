// Space Impact (Nokia 3310) — thế giới chơi chung, server chạy step() 20 lần/giây. Luật thuần dùng chung server + test.
// Tàu bay ở nửa trái, bắn sang phải; quái bay từ phải sang; hết đợt quái là trùm; hạ trùm sang màn sau (3 màn).
export const W = 84, H = 48, TOP = 7, DT = 0.05;
export const SHIP = ['##.....', '.####..', '#######', '.####..', '##.....'];
export const SHIP_W = 7, SHIP_H = 5, SHIP_SPEED = 42, FIRE_EVERY = 0.22, BULLET = 95, LIVES = 3, LEVELS = 3;
// Quái: sprite, máu, tốc độ, điểm, kiểu bay.
export const KINDS = {
  a: { rows: ['.###.', '##.##', '#####', '.#.#.', '#...#'], hp: 1, speed: 18, pts: 10, wave: 6 },
  b: { rows: ['..###..', '.#####.', '##.#.##', '#######', '.#...#.', '#.....#'], hp: 2, speed: 13, pts: 20, wave: 0, shoots: true },
  c: { rows: ['#....#', '.####.', '##..##', '.####.', '#....#'], hp: 1, speed: 27, pts: 15, wave: 12 },
};
export const BOSS = ['....######....', '..##########..', '.####.##.####.', '##############', '###.######.###', '##############',
  '.############.', '..##..##..##..', '.##...##...##.', '##....##....##'];
export const BOSS_W = 14, BOSS_H = 10;
const LEVEL_TIME = 36; // giây quái bay trước khi trùm ra

export function createWorld(ids, rand = Math.random) {
  const ships = ids.map((id, k) => ({ id, x: 4, y: TOP + 6 + k * 9, lives: LIVES, invul: 2, cool: 0, keys: {}, score: 0 }));
  return { ships, bullets: [], enemies: [], shots: [], items: [], boss: null, level: 1, t: 0, spawnAt: 1, phase: 'wave', score: 0, rand, events: [], won: false, over: false };
}

const hit = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
const clampY = (y, h) => Math.max(TOP, Math.min(H - h, y));

function spawn(w) {
  const r = w.rand;
  const pool = w.level === 1 ? 'aaac' : w.level === 2 ? 'aabcc' : 'abbcc';
  const kind = pool[Math.floor(r() * pool.length)];
  const k = KINDS[kind];
  // Đôi khi ra theo cụm 3 con xếp hàng (kiểu Space Impact).
  const n = r() < 0.3 ? 3 : 1;
  const y0 = TOP + Math.floor(r() * (H - TOP - 12));
  for (let i = 0; i < n; i++) {
    w.enemies.push({ kind, x: W + i * 9, y: y0 + (n > 1 ? i * 3 : 0), base: y0 + (n > 1 ? i * 3 : 0), hp: k.hp + (w.level - 1) * (kind === 'b' ? 1 : 0), phase: r() * 6, cool: 1 + r() * 2 });
  }
  w.spawnAt = w.t + Math.max(0.6, 1.8 - w.level * 0.3) + r() * 0.8;
}

// Một bước dt giây. Input đã nằm sẵn trong ship.keys.
export function step(w, dt = DT) {
  w.events = [];
  if (w.over) return w;
  w.t += dt;
  const alive = w.ships.filter((s) => s.lives > 0);
  // Tàu + đạn của tàu
  for (const s of alive) {
    const k = s.keys;
    s.x = Math.max(0, Math.min(42, s.x + ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * SHIP_SPEED * dt));
    s.y = clampY(s.y + ((k.down ? 1 : 0) - (k.up ? 1 : 0)) * SHIP_SPEED * dt, SHIP_H);
    if (s.invul > 0) s.invul -= dt;
    s.cool -= dt;
    if (k.fire && s.cool <= 0) { w.bullets.push({ x: s.x + SHIP_W, y: s.y + 2, by: s.id }); s.cool = FIRE_EVERY; w.events.push('fire'); }
  }
  for (const b of w.bullets) b.x += BULLET * dt;
  w.bullets = w.bullets.filter((b) => b.x < W);
  // Quái
  if (w.phase === 'wave') {
    if (w.t >= w.spawnAt) spawn(w);
    if (w.t > LEVEL_TIME * w.level + (w.level - 1) * 4 && !w.enemies.length) {
      w.phase = 'boss';
      w.boss = { x: W, y: TOP + 14, hp: 18 + w.level * 10, max: 18 + w.level * 10, dir: 1, cool: 1.5 };
      w.events.push('boss');
    }
  }
  for (const e of w.enemies) {
    const k = KINDS[e.kind];
    e.x -= k.speed * dt;
    e.phase += dt * 3;
    if (k.wave) e.y = clampY(e.base + Math.sin(e.phase) * k.wave * (e.kind === 'c' ? 0.6 : 0.5), k.rows.length);
    if (k.shoots && (e.cool -= dt) <= 0 && e.x < W - 4) { w.shots.push({ x: e.x - 2, y: e.y + 3, vx: -40, vy: 0 }); e.cool = 2 + w.rand() * 1.5; }
  }
  if (w.boss) {
    const B = w.boss;
    if (B.x > W - BOSS_W - 2) B.x -= 12 * dt;
    B.y += B.dir * (14 + w.level * 4) * dt;
    if (B.y < TOP || B.y > H - BOSS_H) { B.dir *= -1; B.y = clampY(B.y, BOSS_H); }
    if ((B.cool -= dt) <= 0) {
      for (const vy of w.level > 1 ? [-14, 0, 14] : [0]) w.shots.push({ x: B.x - 1, y: B.y + 5, vx: -44, vy });
      B.cool = Math.max(0.7, 1.6 - w.level * 0.25);
    }
  }
  for (const s of w.shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
  w.shots = w.shots.filter((s) => s.x > -3 && s.y > TOP - 2 && s.y < H + 2);
  for (const it of w.items) it.x -= 12 * dt;
  w.items = w.items.filter((it) => it.x > -5);
  // Đạn trúng quái / trùm
  for (const b of w.bullets) {
    for (const e of w.enemies) {
      const k = KINDS[e.kind];
      if (e.hp > 0 && hit(b.x, b.y, 3, 1, e.x, e.y, k.rows[0].length, k.rows.length)) {
        b.dead = true;
        if (--e.hp <= 0) {
          award(w, b.by, k.pts);
          w.events.push('kill');
          if (w.rand() < 0.05) w.items.push({ x: e.x, y: e.y });
        }
        break;
      }
    }
    if (!b.dead && w.boss && hit(b.x, b.y, 3, 1, w.boss.x, w.boss.y, BOSS_W, BOSS_H)) {
      b.dead = true;
      if (--w.boss.hp <= 0) {
        award(w, b.by, 200 * w.level);
        w.events.push('bossdown');
        w.boss = null;
        if (w.level >= LEVELS) { w.won = true; w.over = true; } else { w.level++; w.phase = 'wave'; w.spawnAt = w.t + 2; w.shots = []; }
      }
    }
  }
  w.bullets = w.bullets.filter((b) => !b.dead);
  w.enemies = w.enemies.filter((e) => e.hp > 0 && e.x > -10);
  // Tàu trúng đạn / đâm quái / nhặt tim
  for (const s of alive) {
    for (const it of w.items) if (!it.taken && hit(s.x, s.y, SHIP_W, SHIP_H, it.x, it.y, 5, 4)) { it.taken = true; s.lives = Math.min(5, s.lives + 1); w.events.push('life'); }
    if (s.invul > 0) continue;
    const touched = w.shots.some((q) => hit(s.x, s.y, SHIP_W, SHIP_H, q.x, q.y, 2, 2))
      || w.enemies.some((e) => hit(s.x, s.y, SHIP_W, SHIP_H, e.x, e.y, KINDS[e.kind].rows[0].length, KINDS[e.kind].rows.length))
      || (w.boss && hit(s.x, s.y, SHIP_W, SHIP_H, w.boss.x, w.boss.y, BOSS_W, BOSS_H));
    if (touched) {
      s.lives--;
      s.invul = 2;
      w.events.push(s.lives > 0 ? 'hurt' : 'down');
      w.shots = w.shots.filter((q) => !hit(s.x - 4, s.y - 4, SHIP_W + 8, SHIP_H + 8, q.x, q.y, 2, 2));
    }
  }
  w.items = w.items.filter((it) => !it.taken);
  if (!w.ships.some((s) => s.lives > 0)) w.over = true;
  return w;
}

function award(w, id, pts) {
  w.score += pts;
  const s = w.ships.find((x) => x.id === id);
  if (s) s.score += pts;
}

// Luật Đào Vàng dạng hàm thuần (không đụng DOM) để test được bằng node.
// Toạ độ logic 640x480; mỏ bắt đầu từ y = GROUND, móc treo ở PIVOT.

export const W = 640, H = 480, GROUND = 70;
export const PIVOT = [320, 58];
export const LEVEL_TIME = 60; // giây
export const SWING_MAX = 1.25; // rad (~72°), biên độ lắc móc
export const SWING_SPEED = 2.4; // rad/s của pha dao động
export const SHOOT_SPEED = 380; // px/s khi thả móc
export const EMPTY_SPEED = 520; // px/s khi kéo móc rỗng
export const PULL = 380; // tốc độ kéo = PULL / weight
export const STRENGTH = 1.8; // thuốc tăng lực nhân tốc độ kéo

// frame = tên khung trong assets/atlas.json. r = bán kính va chạm. weight càng lớn kéo càng chậm.
export const ITEMS = {
  goldTiny: { frame: 'sprite205', r: 8, value: 50, weight: 1.2 },
  goldSmall: { frame: 'sprite217', r: 13, value: 100, weight: 1.7 },
  goldMed: { frame: 'sprite316', r: 25, value: 250, weight: 3.2 },
  goldBig: { frame: 'sprite311', r: 32, value: 500, weight: 5.5 },
  rockSmall: { frame: 'sprite220', r: 17, value: 11, weight: 3.8, rock: true },
  rockBig: { frame: 'sprite210', r: 27, value: 20, weight: 7, rock: true, scale: 1.45 },
  diamond: { frame: 'sprite290', r: 9, value: 600, weight: 1.1, gem: true },
  bag: { frame: 'sprite215', r: 16, value: 0, weight: 1.6, bag: true },
  tnt: { frame: 'sprite332', r: 20, value: 0, weight: 1, tnt: true },
  mouse: { frame: 'sprite319', r: 12, value: 2, weight: 1.3, moves: true },
  mouseGem: { frame: 'sprite321', r: 12, value: 602, weight: 1.3, moves: true, gem: true },
  bone: { frame: 'sprite324', r: 12, value: 7, weight: 1.3 },
  skull: { frame: 'sprite326', r: 12, value: 20, weight: 1.5 },
};

export const TNT_RADIUS = 100;
export const MIN_LEN = 20; // độ dài dây lúc móc nằm yên
export const MAX_PLAYERS = 4;
export const VERSUS_LEVELS = 5; // "Tranh vàng" chơi cố định 5 màn

// Nhiều người chung mỏ: mục tiêu (chế độ chung) và số vật đều tăng theo số người.
export const crowd = (n) => 1 + 0.6 * (n - 1);
export const teamTarget = (lv, n) => Math.round(targetOf(lv) * crowd(n));

// Mục tiêu tiền (cộng dồn) như bản gốc: 650, 1195, 2010, 3095, ...
export const targetOf = (lv) => 650 + (lv - 1) * 545 + ((lv - 1) * (lv - 2) / 2) * 270;

const int = (rand, a, b) => a + Math.floor(rand() * (b - a + 1));

// Vật giá trị cao nằm sâu hơn: [yMin, yMax] theo tỉ lệ chiều sâu mỏ.
const DEPTH = {
  goldTiny: [0.1, 0.6], goldSmall: [0.1, 0.7], goldMed: [0.35, 0.9], goldBig: [0.55, 1],
  rockSmall: [0.1, 0.8], rockBig: [0.2, 0.9], diamond: [0.5, 1], bag: [0.2, 1], tnt: [0.3, 0.9],
  mouse: [0.3, 0.9], mouseGem: [0.5, 1], bone: [0.3, 1], skull: [0.4, 1],
};

export function recipe(lv, rand) {
  return {
    goldBig: Math.min(4, 1 + Math.floor((lv - 1) / 2)),
    goldMed: Math.min(5, 2 + Math.floor(lv / 3)),
    goldSmall: int(rand, 3, 5),
    goldTiny: int(rand, 2, 4),
    rockBig: Math.min(5, 1 + Math.floor(lv / 2)),
    rockSmall: Math.min(6, 2 + Math.floor(lv / 2)),
    diamond: lv >= 3 ? Math.min(4, int(rand, 1, 1 + Math.floor(lv / 3))) : 0,
    bag: int(rand, 1, 3),
    tnt: lv >= 4 ? int(rand, 1, 2) : 0,
    mouse: lv >= 2 ? int(rand, 1, 2 + Math.floor(lv / 4)) : 0,
    mouseGem: lv >= 5 ? int(rand, 0, 2) : 0,
    bone: lv >= 3 ? int(rand, 0, 1) : 0,
    skull: lv >= 3 ? int(rand, 0, 1) : 0,
  };
}

// Rải vật không chồng nhau. Bảo đảm tổng tiền (không tính túi) >= 1.3 x số tiền cần kiếm thêm màn này.
export function genLevel(lv, rand = Math.random, players = 1) {
  const items = [];
  const need = (targetOf(lv) - (lv > 1 ? targetOf(lv - 1) : 0)) * 1.3 * crowd(players);
  const place = (type) => {
    const def = ITEMS[type], [d0, d1] = DEPTH[type];
    const top = GROUND + 50, bottom = H - def.r - 6;
    for (let tries = 0; tries < 200; tries++) {
      const x = int(rand, 20 + def.r, W - 20 - def.r);
      const y = Math.round(top + (bottom - top) * (d0 + (d1 - d0) * rand()));
      if (items.every((o) => Math.hypot(o.x - x, o.y - y) > ITEMS[o.type].r + def.r + 6)) {
        const it = { id: items.length, type, x, y };
        // Chuột chạy qua lại theo hàm của thời gian (không cần lưu vận tốc) -> client tự tính được vị trí.
        if (def.moves) Object.assign(it, { x0: x, amp: Math.min(70, x - 20 - def.r, W - 20 - def.r - x), speed: int(rand, 30, 50), ph: rand() });
        items.push(it);
        return true;
      }
    }
    return false;
  };
  for (const [type, n] of Object.entries(recipe(lv, rand))) {
    for (let i = 0; i < Math.round(n * crowd(players)); i++) place(type);
  }
  const worth = () => items.reduce((s, o) => s + ITEMS[o.type].value, 0);
  for (let i = 0; i < 20 && worth() < need; i++) place('goldMed');
  return items;
}

// Túi bí ẩn: tiền ngẫu nhiên, thuốc nổ hoặc thuốc tăng lực. Cỏ 4 lá làm túi "đẹp" hơn.
export function bagOutcome(lv, rand, clover = false) {
  const x = rand();
  if (x < 0.2) return { dynamite: 1 };
  if (x < 0.3) return { strength: true };
  const hi = 300 + lv * 60;
  return { money: clover ? int(rand, 200, hi * 2) : int(rand, 30, hi) };
}

// Giá trị khi kéo lên, sau khi áp dụng đồ mua ở tiệm.
export function valueOf(type, buffs = {}) {
  const def = ITEMS[type];
  if (def.rock && buffs.rockBook) return def.value * 3;
  if (def.gem && buffs.polish) return Math.round(def.value * 1.5);
  return def.value;
}

export const SHOP = {
  dynamite: { frame: 'bonus1', name: 'Thuốc nổ', desc: 'Bấm ↑ để phá vật đang kéo', price: (lv, r) => int(r, 20, 60 + lv * 25) },
  strength: { frame: 'bonus2', name: 'Thuốc tăng lực', desc: 'Kéo nhanh hơn ở màn sau', price: (lv, r) => int(r, 100, 150 + lv * 60) },
  clover: { frame: 'bonus3', name: 'Cỏ 4 lá', desc: 'Túi bí ẩn ra nhiều tiền hơn', price: (lv, r) => int(r, 20, 40 + lv * 30) },
  rockBook: { frame: 'bonus4', name: 'Sách về đá', desc: 'Đá có giá gấp 3', price: (lv, r) => int(r, 5, 15 + lv * 8) },
  polish: { frame: 'bonus5', name: 'Nước đánh bóng', desc: 'Kim cương giá x1.5', price: (lv, r) => int(r, 200, 300 + lv * 80) },
};

// Mỗi lần vào tiệm: vài món ngẫu nhiên (ít nhất 1). Kim cương chỉ có từ màn 3 nên đánh bóng cũng vậy.
export function shopOffer(nextLv, rand) {
  const keys = Object.keys(SHOP).filter((k) => k !== 'polish' || nextLv >= 3);
  let pick = keys.filter(() => rand() < 0.6);
  if (!pick.length) pick = [keys[int(rand, 0, keys.length - 1)]];
  return pick.map((k) => ({ key: k, price: SHOP[k].price(nextLv, rand) }));
}

// Bộ sinh số ngẫu nhiên có seed (mulberry32) — cho test và (sau này) đề chung khi chơi nhiều người.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- thế giới: dùng chung cho chơi 1 người (client) và nhiều người (server) ----------

// Sóng tam giác chu kỳ 1, giá trị [-1, 1].
const tri = (u) => 1 - 4 * Math.abs((((u + 0.25) % 1) + 1) % 1 - 0.5);
export function mouseX(o, t) {
  return o.amp > 0 ? o.x0 + o.amp * tri(o.ph + (t * o.speed) / (4 * o.amp)) : o.x0;
}
export const mouseDir = (o, t) => Math.sign(mouseX(o, t + 0.01) - mouseX(o, t)) || 1;

// Thợ mỏ đứng cách đều trên mặt đất.
export const minerX = (i, n) => Math.round((W * (i + 1)) / (n + 1));
export const tipOf = (m) => [m.x + m.len * Math.sin(m.angle), PIVOT[1] + m.len * Math.cos(m.angle)];

// players: [{ id, dynamite, buffs: { strength, clover, rockBook, polish } }]
export function createWorld(lv, players, rand = Math.random) {
  const n = players.length;
  return {
    level: lv, time: LEVEL_TIME, t: 0,
    items: genLevel(lv, rand, n),
    miners: players.map((p, i) => ({
      id: p.id, x: minerX(i, n), phase: i * 1.3, angle: 0, len: MIN_LEN, mode: 'swing', held: null, anim: null,
      dynamite: p.dynamite ?? 0, buffs: { ...(p.buffs ?? {}) },
    })),
  };
}

export function shoot(world, id) {
  const m = world.miners.find((x) => x.id === id);
  if (!m || m.mode !== 'swing' || world.time <= 0) return false;
  m.mode = 'out';
  m.anim = { name: 'down', t: 0 };
  return true;
}

// Phá vật đang kéo. Trả về sự kiện nổ để phát hiệu ứng/âm thanh, hoặc null.
export function dynamite(world, id) {
  const m = world.miners.find((x) => x.id === id);
  if (!m || m.mode !== 'in' || !m.held || m.dynamite <= 0) return null;
  m.dynamite--;
  m.held = null;
  m.anim = { name: 'dyn', t: 0 };
  const [x, y] = tipOf(m);
  return { k: 'boom', id, x, y };
}

// Tiến thế giới dt giây. Trả về danh sách sự kiện: grab, collect, tnt, end.
// Tiền không nằm trong world: bên gọi cộng theo sự kiện collect (quỹ chung hay ví riêng).
export function step(world, dt, rand = Math.random) {
  const ev = [];
  world.t += dt;
  world.time = Math.max(0, world.time - dt);
  for (const o of world.items) if (ITEMS[o.type].moves) o.x = mouseX(o, world.t);

  for (const m of world.miners) {
    if (m.anim && (m.anim.t += dt) > 0.4) m.anim = null;
    if (m.mode === 'swing') {
      m.phase += SWING_SPEED * dt;
      m.angle = SWING_MAX * Math.sin(m.phase);
    } else if (m.mode === 'out') {
      m.len += SHOOT_SPEED * dt;
      const [x, y] = tipOf(m);
      const hit = world.items.find((o) => Math.hypot(o.x - x, o.y - y) < ITEMS[o.type].r * (ITEMS[o.type].scale ?? 1) + 5);
      if (hit && ITEMS[hit.type].tnt) {
        const removed = world.items.filter((o) => o === hit || Math.hypot(o.x - hit.x, o.y - hit.y) <= TNT_RADIUS).map((o) => o.id);
        world.items = world.items.filter((o) => !removed.includes(o.id));
        ev.push({ k: 'tnt', id: m.id, x: hit.x, y: hit.y, removed });
        m.mode = 'in';
      } else if (hit) {
        m.held = hit;
        world.items = world.items.filter((o) => o !== hit);
        ev.push({ k: 'grab', id: m.id, item: hit.id, type: hit.type });
        m.mode = 'in';
      } else if (x < 4 || x > W - 4 || y > H - 4) m.mode = 'in';
    } else if (m.mode === 'in') {
      const speed = m.held ? (PULL / ITEMS[m.held.type].weight) * (m.buffs.strength ? STRENGTH : 1) : EMPTY_SPEED;
      m.len -= speed * dt;
      if (m.len <= MIN_LEN) {
        m.len = MIN_LEN;
        m.mode = 'swing';
        if (m.held) {
          const type = m.held.type;
          const e = { k: 'collect', id: m.id, type, value: 0 };
          if (ITEMS[type].bag) {
            const o = bagOutcome(world.level, rand, m.buffs.clover);
            if (o.money) e.value = o.money;
            if (o.dynamite) { m.dynamite++; e.dynamite = 1; }
            if (o.strength) { m.buffs.strength = true; e.strength = true; }
          } else e.value = valueOf(type, m.buffs);
          ev.push(e);
          m.held = null;
        }
      }
    }
  }
  // Hết giờ, hoặc mỏ trống và mọi móc đã về -> hết màn.
  if (world.time <= 0 || (!world.items.length && world.miners.every((m) => m.mode === 'swing'))) ev.push({ k: 'end' });
  return ev;
}

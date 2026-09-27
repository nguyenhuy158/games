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
export function genLevel(lv, rand = Math.random) {
  const items = [];
  const need = (targetOf(lv) - (lv > 1 ? targetOf(lv - 1) : 0)) * 1.3;
  const place = (type) => {
    const def = ITEMS[type], [d0, d1] = DEPTH[type];
    const top = GROUND + 50, bottom = H - def.r - 6;
    for (let tries = 0; tries < 200; tries++) {
      const x = int(rand, 20 + def.r, W - 20 - def.r);
      const y = Math.round(top + (bottom - top) * (d0 + (d1 - d0) * rand()));
      if (items.every((o) => Math.hypot(o.x - x, o.y - y) > ITEMS[o.type].r + def.r + 6)) {
        const it = { id: items.length, type, x, y };
        if (def.moves) Object.assign(it, { x0: x, vx: (rand() < 0.5 ? -1 : 1) * int(rand, 30, 50) });
        items.push(it);
        return true;
      }
    }
    return false;
  };
  for (const [type, n] of Object.entries(recipe(lv, rand))) for (let i = 0; i < n; i++) place(type);
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

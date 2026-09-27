// Chạy chung với logic.test.mjs (được import ở cuối file đó).
import assert from 'node:assert/strict';
import { W, H, GROUND, ITEMS, targetOf, genLevel, bagOutcome, valueOf, shopOffer, seeded } from './public/dao-vang/logic.js';

assert.deepEqual([1, 2, 3].map(targetOf), [650, 1195, 2010]);
assert.ok(targetOf(10) > targetOf(9));

for (let lv = 1; lv <= 12; lv++) {
  for (let seed = 1; seed <= 20; seed++) {
    const items = genLevel(lv, seeded(lv * 1000 + seed));
    // trong mỏ, không chồng nhau
    for (const o of items) {
      const r = ITEMS[o.type].r;
      assert.ok(o.x - r >= 0 && o.x + r <= W && o.y - r >= GROUND && o.y + r <= H, `lv${lv} ${o.type} out of bounds`);
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > ITEMS[a.type].r + ITEMS[b.type].r, `lv${lv} overlap`);
      }
    }
    // đủ tiền để qua màn (không tính túi)
    const worth = items.reduce((s, o) => s + ITEMS[o.type].value, 0);
    assert.ok(worth >= targetOf(lv) - (lv > 1 ? targetOf(lv - 1) : 0), `lv${lv} seed${seed} worth ${worth}`);
    if (lv < 4) assert.ok(!items.some((o) => o.type === 'tnt'), 'no TNT before level 4');
    if (lv < 3) assert.ok(!items.some((o) => ITEMS[o.type].gem), 'no gems before level 3');
  }
}

// cùng seed -> cùng màn (để sau này làm đề chung)
assert.deepEqual(genLevel(5, seeded(42)), genLevel(5, seeded(42)));

// buff
assert.equal(valueOf('rockBig', { rockBook: true }), 60);
assert.equal(valueOf('diamond', { polish: true }), 900);
assert.equal(valueOf('goldBig', { rockBook: true, polish: true }), 500);

// túi: luôn ra đúng một loại phần thưởng hợp lệ
const r = seeded(7);
for (let i = 0; i < 500; i++) {
  const o = bagOutcome(3, r, i % 2 === 0);
  assert.equal(Object.keys(o).length, 1);
  if (o.money !== undefined) assert.ok(o.money > 0);
}

// tiệm: ít nhất 1 món, giá dương, không có đánh bóng trước màn 3
for (let i = 0; i < 200; i++) {
  const offer = shopOffer(2, r);
  assert.ok(offer.length >= 1 && offer.every((x) => x.price > 0 && x.key !== 'polish'));
}

console.log('dao-vang ok');

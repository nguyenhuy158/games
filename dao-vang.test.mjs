// Chạy chung với logic.test.mjs (được import ở cuối file đó).
import assert from 'node:assert/strict';
import { W, H, GROUND, ITEMS, targetOf, teamTarget, genLevel, bagOutcome, valueOf, shopOffer, seeded, createWorld, step, shoot, dynamite, mouseX } from './public/dao-vang/logic.js';

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

// ---------- thế giới / step ----------
{
  const run = (world, sec, rand = seeded(1)) => {
    const ev = [];
    for (let t = 0; t < sec; t += 1 / 60) ev.push(...step(world, 1 / 60, rand));
    return ev;
  };
  // Móc thả thẳng xuống (angle 0) phải trúng vật đặt ngay dưới, kéo lên và thu tiền.
  const aim = (type, y = 300) => {
    const w = createWorld(1, [{ id: 'a' }]);
    w.items = [{ id: 0, type, x: w.miners[0].x, y }];
    const m = w.miners[0];
    m.phase = 0; m.angle = 0;
    // khoá lắc: thả ngay khi góc 0
    assert.ok(shoot(w, 'a'));
    assert.ok(!shoot(w, 'a'), 'cannot shoot twice');
    return w;
  };
  let w = aim('goldBig');
  let ev = run(w, 10);
  assert.ok(ev.some((e) => e.k === 'grab' && e.type === 'goldBig'));
  const col = ev.find((e) => e.k === 'collect');
  assert.equal(col.value, 500);
  assert.ok(ev.some((e) => e.k === 'end'), 'mine empty -> end');

  // Vật nặng kéo lâu hơn vật nhẹ.
  const timeToCollect = (type) => {
    const ww = aim(type);
    let t = 0;
    while (t < 20 && !step(ww, 1 / 60).some((e) => e.k === 'collect')) t += 1 / 60;
    return t;
  };
  assert.ok(timeToCollect('rockBig') > timeToCollect('goldTiny') * 2);

  // Thuốc nổ phá vật đang kéo; không có thuốc thì không được.
  w = aim('rockBig');
  run(w, 0.8);
  assert.equal(dynamite(w, 'a'), null, 'no dynamite');
  w.miners[0].dynamite = 1;
  const boom = dynamite(w, 'a');
  assert.equal(boom.k, 'boom');
  assert.equal(w.miners[0].held, null);
  assert.equal(w.miners[0].dynamite, 0);
  ev = run(w, 5);
  assert.ok(!ev.some((e) => e.k === 'collect'), 'blown item not collected');

  // TNT nổ phá vật xung quanh, móc về rỗng.
  w = aim('tnt');
  w.items.push({ id: 1, type: 'goldBig', x: w.items[0].x + 60, y: 300 }, { id: 2, type: 'goldBig', x: 40, y: 450 });
  ev = run(w, 3);
  const tnt = ev.find((e) => e.k === 'tnt');
  assert.deepEqual(tnt.removed.sort(), [0, 1]);
  assert.deepEqual(w.items.map((o) => o.id), [2]);

  // Hết giờ -> end.
  w = createWorld(1, [{ id: 'a' }]);
  w.time = 0.01;
  assert.ok(step(w, 0.02).some((e) => e.k === 'end'));

  // Nhiều người: thợ mỏ cách đều, nhiều vật hơn, mục tiêu đội lớn hơn.
  const w4 = createWorld(3, ['a', 'b', 'c', 'd'].map((id) => ({ id })), seeded(3));
  assert.deepEqual(w4.miners.map((m) => m.x), [128, 256, 384, 512]);
  assert.ok(w4.items.length > createWorld(3, [{ id: 'a' }], seeded(3)).items.length);
  assert.ok(teamTarget(2, 3) > targetOf(2));

  // Chuột chạy trong biên, theo hàm thời gian (client tính lại được).
  const mouse = { x0: 300, amp: 70, speed: 40, ph: 0.3 };
  for (let t = 0; t < 30; t += 0.37) {
    const x = mouseX(mouse, t);
    assert.ok(x >= 230 - 1e-9 && x <= 370 + 1e-9);
  }
  assert.ok(Math.abs(mouseX(mouse, 1) - mouseX(mouse, 1.1) ) <= 40 * 0.1 + 1e-9, 'speed respected');
}

console.log('dao-vang ok');

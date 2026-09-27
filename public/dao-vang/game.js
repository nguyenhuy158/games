import {
  W, H, GROUND, PIVOT, LEVEL_TIME, SWING_MAX, SWING_SPEED, SHOOT_SPEED, EMPTY_SPEED, PULL, STRENGTH,
  ITEMS, TNT_RADIUS, SHOP, targetOf, genLevel, bagOutcome, valueOf, shopOffer,
} from './logic.js';
import { icon, hydrateIcons } from '../icons.js';

hydrateIcons();
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- tài nguyên ----------
const atlasImg = new Image();
atlasImg.src = 'assets/atlas.png';
const bgs = [1, 2, 3, 4].map((i) => Object.assign(new Image(), { src: `assets/bg${i}.jpg` }));
let FRAMES = {};
const ready = Promise.all([
  fetch('assets/atlas.json').then((r) => r.json()).then((a) => {
    // TexturePacker xuất dạng mảng [{filename, frame}] (hoặc object theo tên) -> map tên -> khung.
    const list = Array.isArray(a.frames) ? a.frames : Object.entries(a.frames).map(([filename, v]) => ({ filename, ...v }));
    FRAMES = Object.fromEntries(list.map((f) => [f.filename.replace('.png', ''), f.frame]));
  }),
  ...[atlasImg, ...bgs].map((img) => img.decode()),
]);

let soundOn = store.get('dv.sound') !== '0';
const SND = Object.fromEntries(['boom', 'down', 'goal', 'hvBad', 'hvCool', 'hvGood', 'scoreAdd', 'up', 'upfinish', 'win']
  .map((n) => [n, new Audio(`assets/audio/${n}.m4a`)]));
SND.up.loop = true;
function play(n) {
  if (!soundOn) return;
  const a = SND[n];
  a.currentTime = 0;
  a.play().catch(() => {});
}
const stop = (n) => SND[n].pause();
function renderSound() { $('#btnSound').innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); }
$('#btnSound').onclick = () => { soundOn = !soundOn; store.set('dv.sound', soundOn ? '1' : '0'); if (!soundOn) stop('up'); renderSound(); };
renderSound();

// Khung trong atlas dùng làm ảnh CSS (tiệm, nút).
function spriteEl(name, scale = 1) {
  const f = FRAMES[name];
  const d = el('span', { className: 'sprite' });
  d.style.cssText = `width:${f.w * scale}px;height:${f.h * scale}px;background-position:${-f.x * scale}px ${-f.y * scale}px;background-size:${1024 * scale}px ${2048 * scale}px`;
  return d;
}

// ---------- canvas ----------
const canvas = $('#game');
const ctx = canvas.getContext('2d');
function fit() {
  // Giữ tỉ lệ 4:3, nét theo devicePixelRatio; toạ độ vẽ luôn là 640x480 logic.
  const wrap = $('#stage');
  const cs = getComputedStyle(wrap); // clientWidth/Height gồm cả padding -> trừ ra kẻo canvas tràn
  const s = Math.min(
    (wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / W,
    (wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / H,
  );
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${W * s}px`;
  canvas.style.height = `${H * s}px`;
  canvas.width = Math.round(W * s * dpr);
  canvas.height = Math.round(H * s * dpr);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
addEventListener('resize', fit);

function draw(name, x, y, { scale = 1, rot = 0, flip = false, anchor = [0.5, 0.5] } = {}) {
  const f = FRAMES[name];
  if (!f) return;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(atlasImg, f.x, f.y, f.w, f.h, -f.w * scale * anchor[0], -f.h * scale * anchor[1], f.w * scale, f.h * scale);
  ctx.restore();
}

// ---------- trạng thái ----------
const game = {
  screen: 'menu', level: 1, money: 0, time: LEVEL_TIME, items: [], dynamite: 0,
  buffs: {}, // đồ mua cho màn hiện tại: strength, clover, rockBook, polish
  hook: { phase: 0, angle: 0, len: 20, mode: 'swing', held: null, strong: false },
  fx: [], // hiệu ứng: nổ, chữ bay
  anim: null, // hoạt ảnh thợ mỏ đặc biệt (ném thuốc nổ / thả móc)
};
window.dv = game; // cho test tự động / console, game 1 người nên không có gì để giấu
const best = () => Number(store.get('dv.best') || 0);
const MIN_LEN = 20;

function startGame() {
  Object.assign(game, { level: 1, money: 0, dynamite: 0, buffs: {} });
  startLevel();
}

function startLevel() {
  game.items = genLevel(game.level);
  game.time = LEVEL_TIME;
  Object.assign(game.hook, { phase: 0, angle: 0, len: MIN_LEN, mode: 'swing', held: null });
  game.fx = [];
  game.screen = 'play';
  showOverlay(null);
  $('#hud').hidden = false;
}

function endLevel() {
  stop('up');
  const target = targetOf(game.level);
  if (game.money >= target) {
    play('goal');
    game.screen = 'shop';
    openShop();
  } else {
    game.screen = 'over';
    const isBest = game.money > best();
    if (isBest) store.set('dv.best', String(game.money));
    play(isBest ? 'win' : 'hvBad');
    showOverlay(el('div', { className: 'card' },
      el('h2', { textContent: 'Hết giờ!' }),
      el('p', { textContent: `Bạn kiếm được $${game.money} / cần $${target} ở màn ${game.level}.` }),
      el('p', { className: 'muted', textContent: isBest ? '🏆 Kỷ lục mới!' : `Kỷ lục: $${best()}` }),
      el('button', { className: 'primary', textContent: 'Chơi lại', onclick: startGame }),
      el('a', { className: 'link', href: '/', textContent: 'Các game khác' }),
    ));
  }
}

// ---------- tiệm ----------
function openShop() {
  const next = game.level + 1;
  const offer = shopOffer(next, Math.random);
  const bought = {};
  const list = el('div', { className: 'shop-items' });
  const money = el('b', { textContent: `$${game.money}` });
  const renderItems = () => list.replaceChildren(...offer.map((o) => {
    const def = SHOP[o.key];
    const owned = bought[o.key];
    const btn = el('button', {
      className: 'shop-item',
      disabled: owned || game.money < o.price,
      onclick: () => {
        if (owned || game.money < o.price) return;
        game.money -= o.price;
        bought[o.key] = true;
        play('scoreAdd');
        money.textContent = `$${game.money}`;
        renderItems();
      },
    }, spriteEl(def.frame), el('strong', { textContent: def.name }), el('small', { textContent: def.desc }), el('em', { textContent: owned ? 'Đã mua' : `$${o.price}` }));
    return btn;
  }));
  renderItems();
  showOverlay(el('div', { className: 'card shop' },
    el('div', { className: 'shopkeeper' }, spriteEl('man0', 0.7), el('p', { textContent: `Qua màn ${game.level}! Mua gì cho màn ${next} không?` })),
    list,
    el('p', {}, 'Tiền: ', money, ` · Mục tiêu màn ${next}: $${targetOf(next)}`),
    el('button', {
      className: 'primary', textContent: `Vào màn ${next}`,
      onclick: () => {
        game.buffs = { strength: !!bought.strength, clover: !!bought.clover, rockBook: !!bought.rockBook, polish: !!bought.polish };
        if (bought.dynamite) game.dynamite++;
        game.level = next;
        startLevel();
      },
    }),
  ));
}

function showOverlay(node) {
  const ov = $('#overlay');
  ov.hidden = !node;
  ov.replaceChildren(...(node ? [node] : []));
}

// ---------- điều khiển ----------
function shoot() {
  if (game.screen !== 'play' || game.hook.mode !== 'swing') return;
  game.hook.mode = 'out';
  game.anim = { name: 'down', t: 0 };
  play('down');
}

function useDynamite() {
  const h = game.hook;
  if (game.screen !== 'play' || h.mode !== 'in' || !h.held || game.dynamite <= 0) return;
  game.dynamite--;
  const [x, y] = tip();
  game.fx.push({ kind: 'boom', x, y, t: 0 });
  h.held = null;
  game.anim = { name: 'dyn', t: 0 };
  stop('up');
  play('boom');
}

canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); shoot(); });
$('#btnDyn').onclick = useDynamite;
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); shoot(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); useDynamite(); }
});
$('#btnMenu').onclick = () => { if (game.screen === 'play') pause(); };

function pause() {
  game.screen = 'pause';
  stop('up');
  showOverlay(el('div', { className: 'card' },
    el('h2', { textContent: 'Tạm dừng' }),
    el('button', { className: 'primary', textContent: 'Chơi tiếp', onclick: () => { game.screen = 'play'; showOverlay(null); } }),
    el('button', { textContent: 'Chơi lại từ đầu', onclick: startGame }),
    el('a', { className: 'link', href: '/', textContent: 'Các game khác' }),
  ));
}
document.addEventListener('visibilitychange', () => { if (document.hidden && game.screen === 'play') pause(); });

// ---------- vật lý ----------
const tip = () => [PIVOT[0] + game.hook.len * Math.sin(game.hook.angle), PIVOT[1] + game.hook.len * Math.cos(game.hook.angle)];

function collect(held) {
  const def = ITEMS[held.type];
  let text, value = 0;
  if (def.bag) {
    const o = bagOutcome(game.level, Math.random, game.buffs.clover);
    if (o.money) { value = o.money; text = `+$${value}`; }
    if (o.dynamite) { game.dynamite++; text = '+1 thuốc nổ'; }
    if (o.strength) { game.buffs.strength = true; text = 'Tăng lực!'; }
  } else {
    value = valueOf(held.type, game.buffs);
    text = `+$${value}`;
  }
  game.money += value;
  game.fx.push({ kind: 'text', text, x: PIVOT[0] + 40, y: PIVOT[1], t: 0, big: value >= 300 });
  play(value >= 300 ? 'hvCool' : value >= 50 || def.bag ? 'hvGood' : 'hvBad');
}

function explode(tnt) {
  game.fx.push({ kind: 'boom', x: tnt.x, y: tnt.y, t: 0, scale: 5 });
  game.items = game.items.filter((o) => o !== tnt && Math.hypot(o.x - tnt.x, o.y - tnt.y) > TNT_RADIUS);
  play('boom');
}

function update(dt) {
  for (const f of game.fx) f.t += dt;
  game.fx = game.fx.filter((f) => f.t < (f.kind === 'boom' ? 0.45 : 1));
  if (game.anim) { game.anim.t += dt; if (game.anim.t > 0.4) game.anim = null; }
  if (game.screen !== 'play') return;

  game.time -= dt;
  if (game.time <= 0) { game.time = 0; return endLevel(); }

  for (const o of game.items) {
    if (!ITEMS[o.type].moves) continue;
    o.x += o.vx * dt;
    if (Math.abs(o.x - o.x0) > 70 || o.x < 20 || o.x > W - 20) { o.vx = -o.vx; o.x += o.vx * dt; }
  }

  const h = game.hook;
  if (h.mode === 'swing') {
    h.phase += SWING_SPEED * dt;
    h.angle = SWING_MAX * Math.sin(h.phase);
  } else if (h.mode === 'out') {
    h.len += SHOOT_SPEED * dt;
    const [x, y] = tip();
    const hit = game.items.find((o) => Math.hypot(o.x - x, o.y - y) < ITEMS[o.type].r * (ITEMS[o.type].scale ?? 1) + 5);
    if (hit) {
      if (ITEMS[hit.type].tnt) { explode(hit); h.mode = 'in'; }
      else {
        h.held = hit;
        game.items = game.items.filter((o) => o !== hit);
        h.mode = 'in';
        play('up');
      }
    } else if (x < 4 || x > W - 4 || y > H - 4) h.mode = 'in';
  } else if (h.mode === 'in') {
    const speed = h.held ? (PULL / ITEMS[h.held.type].weight) * (game.buffs.strength ? STRENGTH : 1) : EMPTY_SPEED;
    h.len -= speed * dt;
    if (h.len <= MIN_LEN) {
      h.len = MIN_LEN;
      h.mode = 'swing';
      stop('up');
      if (h.held) { collect(h.held); h.held = null; play('upfinish'); }
      // Mỏ trống thì kết thúc sớm, khỏi phải chờ hết giờ.
      if (!game.items.length) return endLevel();
    }
  }
}

// ---------- vẽ ----------
const MINER_UP = Array.from({ length: 17 }, (_, i) => `minerUp${String(i + 1).padStart(4, '0')}`);
const MINER_DOWN = ['minerDown0001', 'minerDown0002', 'minerDown0003', 'minerDown0004'];
const MINER_DYN = ['minerD1', 'minerD2', 'minerD3', 'minerD4', 'minerD5'];
const BOOM = Array.from({ length: 10 }, (_, i) => `dboom${i + 1}`);
let clock = 0;

function render() {
  ctx.clearRect(0, 0, W, H);
  // Trời + mặt đất
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#f7d98b');
  sky.addColorStop(1, '#f0b95a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND);
  const bg = bgs[(game.level - 1) % bgs.length];
  if (bg.complete) ctx.drawImage(bg, 0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#6b4a22';
  ctx.fillRect(0, GROUND - 4, W, 4);

  // Vật trong mỏ
  for (const o of game.items) {
    const def = ITEMS[o.type];
    draw(def.frame, o.x, o.y, { scale: def.scale ?? 1, flip: def.moves && o.vx > 0 });
  }

  // Dây + móc + vật đang kéo
  const h = game.hook;
  const [tx, ty] = tip();
  ctx.strokeStyle = '#3b2a1a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PIVOT[0], PIVOT[1]);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  if (h.held) {
    const def = ITEMS[h.held.type];
    const r = def.r * (def.scale ?? 1);
    draw(def.frame, tx + Math.sin(h.angle) * r * 0.8, ty + Math.cos(h.angle) * r * 0.8, { scale: def.scale ?? 1 });
  }
  draw('hv1', tx, ty, { rot: -h.angle, anchor: [0.5, 0.2] });

  // Thợ mỏ: quay tời khi đang kéo, cúi khi thả, ném khi dùng thuốc nổ
  let frame = MINER_UP[0];
  if (game.anim?.name === 'dyn') frame = MINER_DYN[Math.min(4, Math.floor(game.anim.t / 0.08))];
  else if (game.anim?.name === 'down') frame = MINER_DOWN[Math.min(3, Math.floor(game.anim.t / 0.1))];
  else if (h.mode === 'in' && h.held) frame = game.buffs.strength ? `minerStr000${1 + (Math.floor(clock * 8) % 2)}` : MINER_UP[Math.floor(clock * 20) % MINER_UP.length];
  draw(frame, PIVOT[0] + 18, GROUND - 2, { anchor: [0.5, 1] });

  // Thuốc nổ còn lại cạnh thợ mỏ
  for (let i = 0; i < Math.min(game.dynamite, 8); i++) draw('dyn', PIVOT[0] + 70 + i * 10, GROUND - 22);

  // Hiệu ứng
  for (const f of game.fx) {
    if (f.kind === 'boom') draw(BOOM[Math.min(9, Math.floor(f.t / 0.045))], f.x, f.y, { scale: f.scale ?? 3 });
    else {
      ctx.globalAlpha = 1 - f.t;
      ctx.font = `bold ${f.big ? 26 : 20}px system-ui, sans-serif`;
      ctx.fillStyle = f.big ? '#ffe14d' : '#fff';
      ctx.strokeStyle = '#3b2a1a';
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, f.x, f.y - f.t * 30);
      ctx.fillText(f.text, f.x, f.y - f.t * 30);
      ctx.globalAlpha = 1;
    }
  }
}

function renderHud() {
  const target = targetOf(game.level);
  $('#hMoney').textContent = `$${game.money}`;
  $('#hMoney').classList.toggle('ok', game.money >= target);
  $('#hTarget').textContent = `$${target}`;
  $('#hLevel').textContent = game.level;
  $('#hTime').textContent = Math.ceil(game.time);
  $('#hTime').classList.toggle('low', game.time <= 10);
  $('#dynCount').textContent = game.dynamite;
  $('#btnDyn').disabled = !(game.hook.mode === 'in' && game.hook.held && game.dynamite > 0);
}

let last = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); // tab bị treo lâu thì không nhảy cóc
  last = t;
  clock += dt;
  update(dt);
  render();
  renderHud();
  requestAnimationFrame(loop);
}

// ---------- menu ----------
function menu() {
  game.screen = 'menu';
  $('#hud').hidden = true;
  showOverlay(el('div', { className: 'card menu' },
    spriteEl('goldMiner', 0.8),
    spriteEl('goldBig_0001', 0.6),
    el('p', { className: 'muted', textContent: 'Bấm / chạm (hoặc ↓, Space) để thả móc. Kiếm đủ tiền trước khi hết 60 giây. Có thuốc nổ thì bấm ↑ để phá vật đang kéo.' }),
    el('button', { className: 'primary', textContent: 'Chơi', onclick: startGame }),
    el('p', { className: 'muted', textContent: best() ? `Kỷ lục: $${best()}` : '' }),
  ));
}

await ready;
fit();
menu();
requestAnimationFrame(loop);

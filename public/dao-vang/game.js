import {
  W, H, GROUND, PIVOT, LEVEL_TIME, ITEMS, SHOP,
  targetOf, shopOffer, createWorld, step, shoot, dynamite, tipOf, mouseX, mouseDir, snapOf,
} from './logic.js';
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, randomName, addReroll, loadDeviceId } from '../names.js';
import { createPanel } from '../panel.js';
import { t, tx, langToggle } from '../i18n.js';
import { roomClient, newRoomCode } from '../room-client.js';
import { publicSwitch } from '../public-switch.js';
import { Tape } from '../tape.js';
import { replayParam, playReplay, replayLinks, uploadReplay } from '../replay.js';
import { $, el, store } from '../dom.js';

hydrateIcons();

// Cùng danh tính thiết bị với Pikachu (pk.id / pk.name).
let deviceId = loadDeviceId();
const myName = () => deviceName();
const COLORS = ['#ffd23f', '#5cc8ff', '#ff7ab6', '#7dff9a'];
const MODE_NAMES = { coop: t('Chung mỏ', 'Shared Mine'), versus: t('Tranh vàng', 'Gold Rush') };
const SHOP_EN = {
  dynamite: { name: 'Dynamite', desc: 'Press ↑ to blow up what you\'re pulling' },
  strength: { name: 'Power potion', desc: 'Pull faster in later levels' },
  clover: { name: 'Four-leaf clover', desc: 'Mystery bags give more money' },
  rockBook: { name: 'Rock book', desc: 'Rocks worth 3x' },
  polish: { name: 'Polish', desc: 'Diamonds worth x1.5' },
};

// ---------- tài nguyên ----------
// Atlas (~376KB) là phần nặng nhất: tải bằng fetch để chạy thanh tiến độ theo byte (index.html đã
// preload cùng URL), rồi dùng blob URL cho cả canvas lẫn CSS (.sprite) -> không tải lại lần hai.
// Nền mỗi màn chỉ tải khi cần (màn 1 trước, màn kế tiếp tải sẵn trong lúc chơi).
const atlasImg = new Image();
const bgs = [];
const bgImg = (level) => {
  const i = (level - 1) % 4;
  return (bgs[i] ??= Object.assign(new Image(), { src: `assets/bg${i + 1}.jpg` }));
};
// onload thay vì decode(): Chrome hoãn decode() tới khi tab hiện -> mở ở tab nền là treo menu.
const loaded = (img) => (img.complete && img.naturalWidth ? null : new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; }));
async function loadAtlas() {
  const res = await fetch('assets/atlas.webp');
  if (!res.ok || !res.body) throw new Error(`atlas ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) $('#loadBar').style.width = `${Math.min(100, (got / total) * 100)}%`;
  }
  const url = URL.createObjectURL(new Blob(chunks, { type: 'image/webp' }));
  document.documentElement.style.setProperty('--atlas', `url("${url}")`);
  atlasImg.src = url;
  await loaded(atlasImg);
}
let FRAMES = {};
const ready = Promise.all([
  fetch('assets/atlas.json').then((r) => r.json()).then((a) => {
    // TexturePacker xuất dạng mảng [{filename, frame}] (hoặc object theo tên) -> map tên -> khung.
    const list = Array.isArray(a.frames) ? a.frames : Object.entries(a.frames).map(([filename, v]) => ({ filename, ...v }));
    FRAMES = Object.fromEntries(list.map((f) => [f.filename.replace('.png', ''), f.frame]));
  }),
  loadAtlas(),
  loaded(bgImg(1)),
]);

let soundOn = store.get('dv.sound') !== '0';
let muted = false; // tua bản xem lại: nạp nhanh từ đầu thì im
// preload none: ~100KB âm thanh không giành băng thông với atlas; nạp sau khi ảnh xong (await ready).
const SND = Object.fromEntries(['boom', 'down', 'goal', 'hvBad', 'hvCool', 'hvGood', 'scoreAdd', 'up', 'upfinish', 'win']
  .map((n) => [n, Object.assign(new Audio(), { preload: 'none', src: `assets/audio/${n}.m4a` })]));
SND.up.loop = true;
function play(n) {
  if (!soundOn || muted) return;
  const a = SND[n];
  a.currentTime = 0;
  a.play().catch(() => {});
}
const stop = (n) => SND[n].pause();
function renderSound() { $('#btnSound').innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); }
$('#btnSound').onclick = () => { soundOn = !soundOn; store.set('dv.sound', soundOn ? '1' : '0'); if (!soundOn) stop('up'); renderSound(); };
renderSound();

// Khung trong atlas dùng làm ảnh CSS (tiệm, menu). Nền tính theo % + aspect-ratio nên khung co theo
// max-width (màn hẹp) mà vẫn đủ hình; fit = cạnh dài nhất tối đa (px).
const ATLAS_W = 1024, ATLAS_H = 2048;
function spriteEl(name, scale = 1, fit = Infinity) {
  const f = FRAMES[name];
  const s = Math.min(scale, fit / f.w, fit / f.h);
  const d = el('span', { className: 'sprite' });
  d.style.cssText = `width:${f.w * s}px;aspect-ratio:${f.w}/${f.h};` +
    `background-size:${(ATLAS_W / f.w) * 100}% ${(ATLAS_H / f.h) * 100}%;` +
    `background-position:${(f.x / (ATLAS_W - f.w)) * 100}% ${(f.y / (ATLAS_H - f.h)) * 100}%`;
  return d;
}

function showOverlay(node) {
  const ov = $('#overlay');
  ov.hidden = !node;
  ov.replaceChildren(...(node ? [node] : []));
}

const panel = createPanel({ root: $('#panel'), toggle: $('#btnPanel'), storeKey: 'dv.panel' });

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
}
// Theo dõi khung chứa (không chỉ cửa sổ): HUD / bảng điểm hiện ra cũng làm khung đổi cỡ.
new ResizeObserver(fit).observe($('#stage'));

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

// ---------- hiệu ứng + âm thanh (dùng chung solo / mạng) ----------
let fx = [];
let clock = 0;
function onEvents(evs, minerById, mine) {
  for (const e of evs) {
    const m = minerById(e.id);
    const isMe = e.id === mine;
    if (e.k === 'shoot' && isMe) play('down');
    if (e.k === 'grab' && isMe) play('up');
    if (e.k === 'boom') { fx.push({ kind: 'boom', x: e.x, y: e.y, t: 0 }); play('boom'); if (isMe) stop('up'); }
    if (e.k === 'tnt') { fx.push({ kind: 'boom', x: e.x, y: e.y, t: 0, scale: 5 }); play('boom'); }
    if (e.k === 'collect') {
      const text = e.dynamite ? t('+1 thuốc nổ', '+1 dynamite') : e.strength ? t('Tăng lực!', 'Power up!') : `+$${e.value}`;
      fx.push({ kind: 'text', text, x: (m?.x ?? PIVOT[0]) + 30, y: PIVOT[1], t: 0, big: e.value >= 300, color: m?.color });
      if (isMe) {
        stop('up');
        play('upfinish');
        play(e.value >= 300 ? 'hvCool' : e.value >= 50 || ITEMS[e.type].bag ? 'hvGood' : 'hvBad');
      }
    }
  }
}

// ---------- vẽ ----------
const MINER_UP = Array.from({ length: 17 }, (_, i) => `minerUp${String(i + 1).padStart(4, '0')}`);
const MINER_DOWN = ['minerDown0001', 'minerDown0002', 'minerDown0003', 'minerDown0004'];
const MINER_DYN = ['minerD1', 'minerD2', 'minerD3', 'minerD4', 'minerD5'];
const BOOM = Array.from({ length: 10 }, (_, i) => `dboom${i + 1}`);

// view: { level, t, items, miners: [{ id, x, angle, len, mode, held: type|null, anim, strong, dynamite, name, color, me }] }
function render(view) {
  ctx.clearRect(0, 0, W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#f7d98b');
  sky.addColorStop(1, '#f0b95a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND);
  const level = view?.level ?? 1;
  const bg = bgImg(level);
  ctx.fillStyle = '#6b4a22';
  if (bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, GROUND, W, H - GROUND);
  else ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillRect(0, GROUND - 4, W, 4);
  if (!view) return;
  bgImg(level + 1); // đang chơi: tải sẵn nền màn sau

  for (const o of view.items) {
    const def = ITEMS[o.type];
    const x = def.moves ? mouseX(o, view.t) : o.x;
    draw(def.frame, x, o.y, { scale: def.scale ?? 1, flip: def.moves && mouseDir(o, view.t) > 0 });
  }

  for (const m of view.miners) {
    const [tx, ty] = tipOf(m);
    ctx.strokeStyle = '#3b2a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m.x, PIVOT[1]);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    if (m.held) {
      const def = ITEMS[m.held];
      const r = def.r * (def.scale ?? 1);
      draw(def.frame, tx + Math.sin(m.angle) * r * 0.8, ty + Math.cos(m.angle) * r * 0.8, { scale: def.scale ?? 1 });
    }
    draw('hv1', tx, ty, { rot: -m.angle, anchor: [0.5, 0.2] });

    let frame = MINER_UP[0];
    const at = m.anim ? (m.animT ?? 0) : 0;
    if (m.anim === 'dyn') frame = MINER_DYN[Math.min(4, Math.floor(at / 0.08))];
    else if (m.anim === 'down') frame = MINER_DOWN[Math.min(3, Math.floor(at / 0.1))];
    else if (m.mode === 'in' && m.held) frame = m.strong ? `minerStr000${1 + (Math.floor(clock * 8) % 2)}` : MINER_UP[Math.floor(clock * 20) % MINER_UP.length];
    draw(frame, m.x + 18, GROUND - 2, { anchor: [0.5, 1] });
    for (let i = 0; i < Math.min(m.dynamite, 5); i++) draw('dyn', m.x + 48 + i * 8, GROUND - 20, { scale: 0.8 });
    if (m.name) {
      ctx.font = 'bold 11px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(m.name).width + 10;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.roundRect(m.x + 18 - w / 2, 2, w, 15, 5);
      ctx.fill();
      ctx.fillStyle = '#2b1600';
      ctx.fillText(m.name, m.x + 18, 13);
      ctx.textAlign = 'start';
    }
  }

  for (const f of fx) {
    if (f.kind === 'boom') draw(BOOM[Math.min(9, Math.floor(f.t / 0.045))], f.x, f.y, { scale: f.scale ?? 3 });
    else {
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      ctx.font = `bold ${f.big ? 26 : 20}px "Be Vietnam Pro", system-ui, sans-serif`;
      ctx.fillStyle = f.big ? '#ffe14d' : f.color ?? '#fff';
      ctx.strokeStyle = '#3b2a1a';
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, f.x, f.y - f.t * 30);
      ctx.fillText(f.text, f.x, f.y - f.t * 30);
      ctx.globalAlpha = 1;
    }
  }
}

function hud({ money, target, level, levelText, time, dynamite: dyn, canDyn }) {
  $('#hud').hidden = false;
  $('#hMoney').textContent = `$${money}`;
  $('#hMoney').classList.toggle('ok', target != null && money >= target);
  $('#hTargetBox').hidden = target == null;
  if (target != null) $('#hTarget').textContent = `$${target}`;
  $('#hLevel').textContent = levelText ?? level;
  $('#hTime').textContent = Math.ceil(time);
  $('#hTime').classList.toggle('low', time <= 10);
  $('#dynCount').textContent = dyn;
  $('#btnDyn').disabled = !canDyn;
}

// ---------- driver: chơi 1 người (chạy step() ngay trên máy) ----------
const best = () => Number(store.get('dv.best') || 0);
const solo = {
  world: null, money: 0, level: 1, dynamite: 0, buffs: {}, screen: 'menu', tape: null, snapAt: 0,

  start() {
    Object.assign(this, { money: 0, level: 1, dynamite: 0, buffs: {} });
    // Bản xem lại: ghi y như tin server gửi ván nhiều người (world / snap / ev / state) -> phát lại bằng net.onMsg.
    this.tape = new Tape(100);
    this.rec({ t: 'me', id: 'me' });
    this.begin();
  },
  begin() {
    this.world = createWorld(this.level, [{ id: 'me', dynamite: this.dynamite, buffs: this.buffs }]);
    this.screen = 'play';
    this.snapAt = -1;
    fx = [];
    showOverlay(null);
    this.rec({ t: 'world', world: this.world });
    this.state('playing');
  },
  rec(msg) { this.tape?.push(msg); },
  state(status, { offer = null, bought = null, result = null } = {}) {
    this.rec({
      t: 'state', status, mode: 'solo', level: this.level, team: this.money, target: targetOf(this.level), shopEndsAt: 0, now: Date.now(), result, host: 'me',
      players: [{ id: 'me', name: myName(), money: this.money, spec: false, online: true, dynamite: this.dynamite, offer, bought, ready: false }],
    });
  },
  me() { return this.world?.miners[0]; },
  shoot() {
    if (this.screen !== 'play' || !shoot(this.world, 'me')) return;
    const e = { k: 'shoot', id: 'me' };
    onEvents([e], () => this.me(), 'me');
    this.rec({ t: 'ev', evs: [e] });
  },
  dyn() {
    const e = this.screen === 'play' && dynamite(this.world, 'me');
    if (!e) return;
    onEvents([e], () => this.me(), 'me');
    this.rec({ t: 'ev', evs: [e] });
  },
  update(dt) {
    if (this.screen !== 'play') return;
    const evs = step(this.world, dt);
    for (const e of evs) if (e.k === 'collect') this.money += e.value;
    onEvents(evs, () => this.me(), 'me');
    const out = evs.filter((e) => e.k !== 'end');
    if (out.length) this.rec({ t: 'ev', evs: out, money: { team: this.money, players: { me: this.money } } });
    const ended = evs.some((e) => e.k === 'end');
    // Snap 10/giây như băng ván nhiều người.
    if (ended || this.world.t - this.snapAt >= 0.1) { this.snapAt = this.world.t; this.rec(snapOf(this.world)); }
    if (ended) this.end();
  },
  end() {
    stop('up');
    this.dynamite = this.me().dynamite;
    const target = targetOf(this.level);
    if (this.money >= target) {
      play('goal');
      this.screen = 'shop';
      this.shop();
      return;
    }
    this.screen = 'over';
    const ranking = [{ id: 'me', name: myName(), money: this.money }];
    this.state('ended', { result: { win: false, level: this.level, team: this.money, target, ranking } });
    const frames = this.tape?.done();
    this.tape = null;
    const links = el('div');
    // Đã đăng nhập thì gửi bản xem lại + lưu vào lịch sử (khách: server trả 401, bỏ qua).
    (async () => {
      const rp = frames?.length ? await uploadReplay('dao-vang', '/dao-vang/', frames) : null;
      links.replaceWith(replayLinks(rp));
      fetch('/api/me/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'dao-vang', score: this.money, level: this.level, ...(rp ? { rp } : {}) }),
      }).catch(() => {});
    })();
    const isBest = this.money > best();
    if (isBest) store.set('dv.best', String(this.money));
    play(isBest ? 'win' : 'hvBad');
    showOverlay(el('div', { className: 'card' },
      el('h2', { textContent: t('Hết giờ!', 'Time\'s up!') }),
      el('p', { textContent: t(`Bạn kiếm được $${this.money} / cần $${target} ở màn ${this.level}.`, `You earned $${this.money} / needed $${target} at level ${this.level}.`) }),
      el('p', { className: 'muted' }, ...(isBest ? [iconEl('trophy'), t(' Kỷ lục mới!', ' New record!')] : [t(`Kỷ lục: $${best()}`, `Best: $${best()}`)])),
      links,
      el('button', { className: 'primary', textContent: t('Chơi lại', 'Play again'), onclick: () => this.start() }),
      el('button', { textContent: t('Về menu', 'Back to menu'), onclick: menu }),
    ));
  },
  shop() {
    const next = this.level + 1;
    const offer = shopOffer(next, Math.random);
    const bought = {};
    const moneyEl = el('b', { textContent: `$${this.money}` });
    const list = el('div', { className: 'shop-items' });
    const renderItems = () => list.replaceChildren(...offer.map((o) => shopItem(o, bought[o.key], this.money >= o.price, () => {
      if (bought[o.key] || this.money < o.price) return;
      this.money -= o.price;
      bought[o.key] = true;
      play('scoreAdd');
      moneyEl.textContent = `$${this.money}`;
      renderItems();
      this.state('shop', { offer, bought });
    })));
    renderItems();
    this.state('shop', { offer, bought });
    showOverlay(el('div', { className: 'card shop' },
      el('div', { className: 'shopkeeper' }, spriteEl('man0', 0.7), el('p', { textContent: t(`Qua màn ${this.level}! Mua gì cho màn ${next} không?`, `Cleared level ${this.level}! Buy something for level ${next}?`) })),
      list,
      el('p', {}, t('Tiền: ', 'Money: '), moneyEl, t(` · Mục tiêu màn ${next}: $${targetOf(next)}`, ` · Level ${next} target: $${targetOf(next)}`)),
      el('button', {
        className: 'primary', textContent: t(`Vào màn ${next}`, `Enter level ${next}`),
        onclick: () => {
          this.buffs = { strength: !!bought.strength, clover: !!bought.clover, rockBook: !!bought.rockBook, polish: !!bought.polish };
          if (bought.dynamite) this.dynamite++;
          this.level = next;
          this.begin();
        },
      }),
    ));
  },
  pause() {
    if (this.screen !== 'play') return;
    this.screen = 'pause';
    stop('up');
    showOverlay(el('div', { className: 'card' },
      el('h2', { textContent: t('Tạm dừng', 'Paused') }),
      el('button', { className: 'primary', textContent: t('Chơi tiếp', 'Resume'), onclick: () => { this.screen = 'play'; showOverlay(null); } }),
      el('button', { textContent: t('Chơi lại từ đầu', 'Restart'), onclick: () => this.start() }),
      el('button', { textContent: t('Về menu', 'Back to menu'), onclick: menu }),
    ));
  },
  view() {
    const m = this.me();
    if (!m) return null;
    return { level: this.level, t: this.world.t, items: this.world.items, miners: [{ ...m, held: m.held?.type ?? null, anim: m.anim?.name, animT: m.anim?.t, strong: m.buffs.strength }] };
  },
  hud() {
    const m = this.me();
    if (!m) return;
    hud({ money: this.money, target: targetOf(this.level), level: this.level, time: this.world.time, dynamite: m.dynamite, canDyn: m.mode === 'in' && m.held && m.dynamite > 0 });
  },
};

function shopItem(o, owned, affordable, onBuy) {
  const def = SHOP[o.key], enDef = SHOP_EN[o.key];
  return el('button', { className: 'shop-item', disabled: owned || !affordable, onclick: onBuy },
    spriteEl(def.frame, 1, 56), el('strong', { textContent: t(def.name, enDef.name) }), el('small', { textContent: t(def.desc, enDef.desc) }),
    el('em', { textContent: owned ? t('Đã mua', 'Bought') : `$${o.price}` }));
}

// ---------- driver: nhiều người (server chạy vật lý, mình vẽ theo snapshot) ----------
const INTERP = 0.1; // vẽ trễ 100 ms so với snapshot mới nhất để luôn có 2 mốc nội suy
const net = {
  sock: null, code: null, room: null, world: null, snaps: [], money: null, anims: {}, replay: false,

  join(code) {
    this.code = code.toUpperCase();
    history.replaceState(null, '', `?r=${this.code}`);
    Object.assign(this, { room: null, world: null, snaps: [], money: null });
    fx = [];
    showOverlay(el('div', { className: 'card' }, el('h2', { textContent: t('Đang kết nối…', 'Connecting…') })));
    this.sock ??= roomClient({
      path: () => `/api/dv/room/${this.code}`, query: () => ({ id: deviceId, name: myName() }),
      onMsg: (m) => this.onMsg(m), onLeave: (msg) => this.leave(msg),
    });
    this.sock.open();
  },
  leave(msg) {
    this.code = null;
    this.sock?.close();
    stop('up');
    history.replaceState(null, '', location.pathname);
    if (msg) toast(tx(msg));
    menu();
  },
  send(m) { if (!this.replay) this.sock?.send(m); },
  shoot() { this.send({ t: 'shoot' }); },
  dyn() { this.send({ t: 'dyn' }); },
  pause() { /* nhiều người không tạm dừng được */ },

  me() { return this.room?.players.find((p) => p.id === deviceId); },
  // Chữ "bạn": xem lại thì không có "bạn" (deviceId = người được ghi, chỉ dùng cho tiếng / HUD / tiệm).
  you(id) { return !this.replay && id === deviceId; },
  color(id) { return COLORS[Math.max(0, this.world?.miners.findIndex((m) => m.id === id) ?? 0) % COLORS.length]; },
  name(id) { return this.room?.players.find((p) => p.id === id)?.name ?? ''; },

  // Xem lại (public/replay.js): tin 'me' đầu băng = góc nhìn của ai; tua = reset() rồi nạp lại nhanh từ đầu (im tiếng, bỏ hiệu ứng dồn).
  feed(m) {
    if (m.t === 'me') deviceId = m.id;
    else this.onMsg(m);
  },
  reset() {
    Object.assign(this, { room: null, world: null, snaps: [], money: null, anims: {} });
    clearInterval(this.shopTick);
    stop('up');
    showOverlay(null);
    fx = [];
    muted = true;
    queueMicrotask(() => { muted = false; fx = []; });
  },

  onMsg(m) {
    if (m.t === 'error') return this.leave(m.msg);
    if (m.t === 'state') {
      const prev = this.room?.status;
      this.room = m;
      m.clockOffset = m.now - Date.now();
      if (prev === 'playing' && m.status === 'shop') { stop('up'); play('goal'); }
      if (prev === 'playing' && m.status === 'ended') { stop('up'); play(m.result?.winner === deviceId || m.result?.win ? 'win' : 'hvBad'); }
      this.renderOverlay();
    }
    if (m.t === 'world') { this.world = m.world; this.snaps = []; fx = []; }
    if (m.t === 'snap') {
      this.snaps.push({ ...m, recv: performance.now() });
      if (this.snaps.length > 6) this.snaps.shift();
    }
    if (m.t === 'ev') {
      if (m.money) this.money = m.money;
      for (const e of m.evs) {
        if (e.k === 'grab') this.world.items = this.world.items.filter((o) => o.id !== e.item);
        if (e.k === 'tnt') this.world.items = this.world.items.filter((o) => !e.removed.includes(o.id));
        if (e.k === 'shoot' || e.k === 'boom') this.anims[e.id] = { name: e.k === 'shoot' ? 'down' : 'dyn', at: clock };
      }
      onEvents(m.evs, (id) => {
        const x = this.world?.miners.find((mm) => mm.id === id)?.x;
        return x == null ? null : { x, color: this.color(id) };
      }, deviceId);
    }
  },

  // Nội suy giữa 2 snapshot quanh thời điểm "hiện tại - INTERP".
  interp() {
    const sn = this.snaps;
    if (!sn.length) return null;
    const last = sn.at(-1);
    const target = Math.min(last.wt, last.wt + (performance.now() - last.recv) / 1000 - INTERP);
    let a = sn[0], b = last;
    for (let i = 0; i < sn.length - 1; i++) if (sn[i].wt <= target && sn[i + 1].wt >= target) { a = sn[i]; b = sn[i + 1]; break; }
    const k = b.wt > a.wt ? Math.max(0, Math.min(1, (target - a.wt) / (b.wt - a.wt))) : 1;
    return { t: target, time: a.time + (b.time - a.time) * k, miners: b.miners.map((mb) => {
      const ma = a.miners.find((x) => x.id === mb.id) ?? mb;
      const same = ma.m === mb.m;
      return { ...mb, a: same ? ma.a + (mb.a - ma.a) * k : mb.a, l: same ? ma.l + (mb.l - ma.l) * k : mb.l };
    }) };
  },

  view() {
    if (!this.world || this.room?.status !== 'playing') return this.world ? { level: this.world.level, t: 0, items: this.world.items, miners: [] } : null;
    const it = this.interp();
    const miners = (it?.miners ?? []).map((s) => {
      const base = this.world.miners.find((m) => m.id === s.id);
      const an = this.anims[s.id];
      const animT = an ? clock - an.at : 0;
      return {
        id: s.id, x: base?.x ?? PIVOT[0], angle: s.a, len: s.l, mode: s.m, held: s.h,
        anim: an && animT < 0.4 ? an.name : null, animT, strong: s.s, dynamite: s.d,
        name: this.name(s.id), color: this.color(s.id), me: s.id === deviceId,
      };
    });
    return { level: this.world.level, t: it?.t ?? 0, items: this.world.items, miners, time: it?.time ?? LEVEL_TIME };
  },

  hud(view) {
    const r = this.room;
    if (!r || (r.status !== 'playing' && r.status !== 'shop')) { $('#hud').hidden = true; $('#scores').hidden = true; panel.update([]); return; }
    const mine = view?.miners.find((m) => m.me);
    const coop = r.mode !== 'versus'; // 'solo' = bản xem lại chơi 1 người, tính như chung mỏ
    const myMoney = this.money?.players?.[deviceId] ?? this.me()?.money ?? 0;
    hud({
      money: coop ? (this.money?.team ?? r.team) : myMoney,
      target: coop ? r.target : null,
      levelText: coop ? `${r.level}` : `${r.level}/${r.versusLevels}`,
      time: view?.time ?? LEVEL_TIME,
      dynamite: mine?.dynamite ?? this.me()?.dynamite ?? 0,
      canDyn: mine && mine.mode === 'in' && mine.held && mine.dynamite > 0,
    });
    this.renderScores(coop);
    this.renderPanel(view);
  },

  // Khung kiểu Google Meet: thẻ từng thợ mỏ khác (chung một mỏ nên không cần bàn thu nhỏ).
  renderPanel(view) {
    const r = this.room;
    if (!r || r.status !== 'playing') return panel.update([]);
    const live = Object.fromEntries((view?.miners ?? []).map((m) => [m.id, m]));
    panel.update(r.players.filter((p) => !p.spec && p.id !== deviceId).map((p) => {
      const m = live[p.id];
      return {
        key: p.id, name: p.name, color: this.color(p.id), off: !p.online,
        sub: t(`$${this.money?.players?.[p.id] ?? p.money} · nổ ${m?.dynamite ?? p.dynamite}`, `$${this.money?.players?.[p.id] ?? p.money} · ${m?.dynamite ?? p.dynamite} dynamite`),
        badge: m?.mode === 'in' && m.held ? { icon: 'pickaxe' } : m?.mode === 'out' ? { icon: 'arrow-down' } : '',
      };
    }));
  },

  renderScores(coop) {
    const box = $('#scores');
    const r = this.room;
    const show = r && r.status === 'playing' && r.mode !== 'solo';
    box.hidden = !show;
    if (!show) return;
    const ps = r.players.filter((p) => !p.spec).map((p) => ({ ...p, money: this.money?.players?.[p.id] ?? p.money }));
    if (!coop) ps.sort((a, b) => b.money - a.money);
    const key = ps.map((p) => `${p.id}:${p.money}:${p.online}`).join('|') + coop;
    if (box.dataset.key === key) return; // khỏi dựng lại DOM mỗi khung hình
    box.dataset.key = key;
    box.replaceChildren(...ps.map((p) => {
      const li = el('li', {}, el('i', { className: 'dot' }), `${p.name}${this.you(p.id) ? t(' (bạn)', ' (you)') : ''} `, el('b', { textContent: `$${p.money}` }));
      li.style.setProperty('--c', this.color(p.id));
      if (!p.online) li.classList.add('off');
      return li;
    }), ...(this.me()?.spec ? [el('li', { className: 'spec' }, iconEl('eye'), t(' Bạn đang xem', ' You are spectating'))] : []));
  },

  // Thẻ kết quả ván (sảnh sau ván, bản xem lại).
  resultEl(r) {
    const x = r.result;
    return el('div', { className: 'result' },
      el('h2', {}, ...(x.winner ? [iconEl('trophy'), this.you(x.winner) ? t(' Bạn thắng!', ' You win!') : t(` ${this.name(x.winner)} thắng`, ` ${this.name(x.winner)} wins`)] : [t(`Thua ở màn ${x.level}`, `Lost at level ${x.level}`)])),
      x.target ? el('p', { className: 'muted', textContent: r.mode === 'solo' ? t(`Kiếm được $${x.team} / cần $${x.target}`, `Earned $${x.team} / needed $${x.target}`) : t(`Quỹ chung $${x.team} / cần $${x.target}`, `Team fund $${x.team} / needed $${x.target}`) }) : '',
      el('ol', {}, ...x.ranking.map((p) => el('li', { textContent: `${p.name}: $${p.money}` }))),
      replayLinks(x.rp),
    );
  },

  renderOverlay() {
    const r = this.room;
    const me = this.me();
    // Xem lại: chỉ thẻ kết quả / tiệm, không nút điều khiển phòng.
    if (this.replay && r.status !== 'shop') return showOverlay(r.status === 'ended' && r.result ? el('div', { className: 'card' }, this.resultEl(r)) : null);
    const isHost = r.host === deviceId;
    // Công tắc "Công khai" (hiện ở /phong/): tạo một lần, thẻ sảnh dựng lại mỗi lần vẽ thì gắn lại.
    const pub = (this.pub ??= publicSwitch((m) => this.send(m)));
    pub.update(r, isHost);
    const players = r.players.filter((p) => !p.spec);
    const playerList = el('ul', { className: 'plist' }, ...r.players.map((p) => el('li', { className: p.online ? '' : 'off' },
      p.id === r.host ? iconEl('crown') : '', p.spec ? iconEl('eye') : '', ` ${p.name}${p.id === deviceId ? t(' (bạn)', ' (you)') : ''}`)));
    const copy = el('button', {
      onclick: () => invite(`${location.origin}/dao-vang/?r=${this.code}`, this.code),
    }, iconEl('qr-code'), t(` Mời: phòng ${this.code}`, ` Invite: room ${this.code}`));
    const leave = el('button', { textContent: t('Rời phòng', 'Leave room'), onclick: () => this.leave() });

    if (r.status === 'playing') return showOverlay(null);
    if (r.status === 'lobby' || r.status === 'ended') {
      const modes = el('div', { className: 'seg' }, ...Object.entries(MODE_NAMES).map(([k, v]) => el('button', {
        textContent: v, className: r.mode === k ? 'on' : '', disabled: !isHost, onclick: () => this.send({ t: 'config', mode: k }),
      })));
      const desc = r.mode === 'coop'
        ? t('Cả phòng chung một mỏ, gom chung tiền. Mục tiêu tăng theo số người — không đủ là thua cả đội.', 'Everyone shares one mine and one purse. The target grows with more players — falling short loses for the whole team.')
        : t(`Chung một mỏ, ví riêng. Tranh nhau vàng trong ${r.versusLevels} màn, ai nhiều tiền nhất thắng.`, `Shared mine, separate wallets. Race for gold over ${r.versusLevels} levels — whoever has the most money wins.`);
      const result = r.status === 'ended' && r.result ? this.resultEl(r) : '';
      return showOverlay(el('div', { className: 'card' },
        result,
        el('h2', { textContent: t(`Phòng ${this.code}`, `Room ${this.code}`) }),
        modes, el('p', { className: 'muted', textContent: desc }),
        playerList,
        pub.el,
        el('p', { className: 'muted', textContent: t(`${players.length}/4 thợ mỏ.`, `${players.length}/4 miners.`) + (isHost ? '' : t(' Chờ chủ phòng bắt đầu.', ' Waiting for the host to start.')) }),
        isHost ? el('button', { className: 'primary', textContent: r.status === 'ended' ? t('Chơi ván mới', 'Play again') : t('Bắt đầu', 'Start'), onclick: () => this.send({ t: 'start' }) }) : '',
        el('div', { className: 'row' }, copy, leave),
      ));
    }
    if (r.status === 'shop') {
      const coop = r.mode === 'coop';
      const wallet = coop ? r.team : me?.money ?? 0;
      const offer = me?.offer ?? [];
      const left = el('span');
      const tickLeft = () => { left.textContent = Math.max(0, Math.ceil((r.shopEndsAt - (Date.now() + r.clockOffset)) / 1000)); };
      clearInterval(this.shopTick);
      // Xem lại: khoảng chờ ở tiệm bị rút ngắn nên không hiện đồng hồ đếm ngược.
      const timer = !this.replay && r.shopEndsAt;
      if (timer) { tickLeft(); this.shopTick = setInterval(tickLeft, 500); }
      const readyList = el('p', { className: 'muted', textContent: t(`Sẵn sàng: ${players.filter((p) => p.ready).map((p) => p.name).join(', ') || '—'}`, `Ready: ${players.filter((p) => p.ready).map((p) => p.name).join(', ') || '—'}`) });
      const whose = coop ? t('Quỹ chung', 'Team fund') : this.replay ? t(`Ví của ${me?.name ?? ''}`, `${me?.name ?? ''}'s wallet`) : t('Ví của bạn', 'Your wallet');
      return showOverlay(el('div', { className: 'card shop' },
        el('div', { className: 'shopkeeper' }, spriteEl('man0', 0.7), el('p', { textContent: t(`Qua màn ${r.level}! ${whose}: $${wallet}`, `Cleared level ${r.level}! ${whose}: $${wallet}`) })),
        me?.spec ? el('p', { textContent: t('Bạn đang xem — ván sau được chơi.', 'You are spectating — you\'ll play next round.') }) : el('div', { className: 'shop-items', inert: this.replay },
          ...offer.map((o) => shopItem(o, me.bought?.[o.key], wallet >= o.price, () => { play('scoreAdd'); this.send({ t: 'buy', key: o.key }); }))),
        timer ? el('p', {}, t('Màn tiếp theo bắt đầu sau ', 'Next level starts in '), left, t(' giây', ' sec')) : '',
        r.mode === 'solo' ? '' : readyList,
        me && !me.spec && !this.replay ? el('button', { className: 'primary', textContent: me.ready ? t('Đã sẵn sàng', 'Ready') : t('Sẵn sàng', 'Ready up'), disabled: me.ready, onclick: () => this.send({ t: 'ready' }) }) : '',
      ));
    }
  },
};

// ---------- menu ----------
let driver = null;
function menu() {
  driver = null;
  $('#hud').hidden = true;
  $('#scores').hidden = true;
  panel.update([]);
  stop('up');
  const name = el('input', { value: myName(), maxLength: 20, placeholder: t('Tên của bạn', 'Your name') });
  const saveName = () => store.set('pk.name', name.value.trim() || randomName());
  const code = el('input', { maxLength: 4, placeholder: t('MÃ PHÒNG', 'ROOM CODE'), className: 'code' });
  const joinCode = () => {
    const c = code.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(c)) return toast.warning(t('Mã phòng gồm 4 ký tự', 'Room code is 4 characters'));
    saveName();
    startNet(c);
  };
  code.onkeydown = (e) => { if (e.key === 'Enter') joinCode(); };
  showOverlay(el('div', { className: 'card menu' },
    el('div', { className: 'row', style: 'justify-content:flex-end' }, langToggle()),
    spriteEl('goldMiner', 0.8),
    spriteEl('goldBig_0001', 0.5),
    el('p', { className: 'muted', textContent: t('Bấm / chạm (hoặc ↓, Space) để thả móc. Có thuốc nổ thì bấm ↑ để phá vật đang kéo.', 'Click / tap (or ↓, Space) to drop the hook. With dynamite, press ↑ to blow up what you\'re pulling.') }),
    el('button', { className: 'primary', textContent: t('Chơi một mình', 'Play solo'), onclick: () => { saveName(); driver = solo; solo.start(); } }),
    el('label', { className: 'field' }, t('Tên của bạn', 'Your name'), addReroll(name)),
    el('button', { onclick: () => { saveName(); startNet(newRoomCode()); } }, iconEl('users'), t(' Tạo phòng chơi nhiều người', ' Create a multiplayer room')),
    el('div', { className: 'row' }, code, el('button', { textContent: t('Vào phòng', 'Join room'), onclick: joinCode })),
    el('p', { className: 'muted', textContent: best() ? t(`Kỷ lục chơi một mình: $${best()}`, `Solo best: $${best()}`) : '' }),
    el('a', { className: 'link', href: '/', textContent: t('← Các game khác', '← Other games') }),
  ));
}
function startNet(c) {
  driver = net;
  net.join(c);
}

// ---------- điều khiển ----------
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); driver?.shoot(); });
$('#btnDyn').onclick = () => driver?.dyn();
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); driver?.shoot(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); driver?.dyn(); }
});
$('#btnMenu').onclick = () => (driver === net ? net.leave() : driver?.pause());
document.addEventListener('visibilitychange', () => { if (document.hidden && driver === solo) solo.pause(); });
window.dv = { solo, net }; // cho test tự động / console

// ---------- vòng lặp ----------
let last = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); // tab bị treo lâu thì không nhảy cóc
  last = t;
  clock += dt;
  for (const f of fx) f.t += dt;
  fx = fx.filter((f) => f.t < (f.kind === 'boom' ? 0.45 : 1));
  if (driver === solo) solo.update(dt);
  const view = driver?.view() ?? null;
  render(view);
  if (driver === solo && solo.world) solo.hud();
  if (driver === net) net.hud(view);
  requestAnimationFrame(loop);
}

try {
  await ready;
} catch (err) {
  // Mất mạng giữa chừng: báo lỗi + nút tải lại thay vì treo ở thanh tiến độ.
  $('#loading').replaceChildren(
    el('p', { textContent: t('Không tải được hình ảnh trò chơi.', 'Could not load the game images.') }),
    el('button', { className: 'primary', textContent: t('Thử lại', 'Retry'), onclick: () => location.reload() }),
  );
  throw err;
}
$('#loading').remove();
for (const a of Object.values(SND)) { a.preload = 'auto'; a.load(); }
fit();
const initial = new URLSearchParams(location.search).get('r');
const rp = replayParam();
if (rp) {
  // Xem lại (?replay=<id>): không mở WebSocket, không nhận lệnh; vẽ bằng net.onMsg theo băng (cả ván 1 người lẫn nhiều người).
  driver = net;
  net.replay = true;
  $('#btnMenu').hidden = true;
  showOverlay(null);
  playReplay(rp, { feed: (m) => net.feed(m), reset: () => net.reset() });
} else if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) startNet(initial);
else menu();
requestAnimationFrame(loop);

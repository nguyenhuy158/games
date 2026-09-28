import {
  W, H, GROUND, PIVOT, LEVEL_TIME, ITEMS, SHOP,
  targetOf, shopOffer, createWorld, step, shoot, dynamite, tipOf, mouseX, mouseDir,
} from './logic.js';
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, randomName } from '../names.js';
import { createPanel } from '../panel.js';

hydrateIcons();
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// Cùng danh tính thiết bị với Pikachu (pk.id / pk.name).
let deviceId = store.get('pk.id');
if (!deviceId) { deviceId = crypto.randomUUID(); store.set('pk.id', deviceId); }
const myName = () => deviceName();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COLORS = ['#ffd23f', '#5cc8ff', '#ff7ab6', '#7dff9a'];
const MODE_NAMES = { coop: 'Chung mỏ', versus: 'Tranh vàng' };

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
  // onload thay vì decode(): Chrome hoãn decode() tới khi tab hiện -> mở ở tab nền là treo menu.
  ...[atlasImg, ...bgs].map((img) => (img.complete ? null : new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; }))),
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

// Khung trong atlas dùng làm ảnh CSS (tiệm, menu).
function spriteEl(name, scale = 1) {
  const f = FRAMES[name];
  const d = el('span', { className: 'sprite' });
  d.style.cssText = `width:${f.w * scale}px;height:${f.h * scale}px;background-position:${-f.x * scale}px ${-f.y * scale}px;background-size:${1024 * scale}px ${2048 * scale}px`;
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
      const text = e.dynamite ? '+1 thuốc nổ' : e.strength ? 'Tăng lực!' : `+$${e.value}`;
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
  const bg = bgs[((view?.level ?? 1) - 1) % bgs.length];
  ctx.drawImage(bg, 0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#6b4a22';
  ctx.fillRect(0, GROUND - 4, W, 4);
  if (!view) return;

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
  world: null, money: 0, level: 1, dynamite: 0, buffs: {}, screen: 'menu',

  start() {
    Object.assign(this, { money: 0, level: 1, dynamite: 0, buffs: {} });
    this.begin();
  },
  begin() {
    this.world = createWorld(this.level, [{ id: 'me', dynamite: this.dynamite, buffs: this.buffs }]);
    this.screen = 'play';
    fx = [];
    showOverlay(null);
  },
  me() { return this.world?.miners[0]; },
  shoot() { if (this.screen === 'play' && shoot(this.world, 'me')) onEvents([{ k: 'shoot', id: 'me' }], () => this.me(), 'me'); },
  dyn() {
    const e = this.screen === 'play' && dynamite(this.world, 'me');
    if (e) onEvents([e], () => this.me(), 'me');
  },
  update(dt) {
    if (this.screen !== 'play') return;
    const evs = step(this.world, dt);
    for (const e of evs) if (e.k === 'collect') this.money += e.value;
    onEvents(evs, () => this.me(), 'me');
    if (evs.some((e) => e.k === 'end')) this.end();
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
    // Đã đăng nhập thì lưu vào lịch sử (khách: server trả 401, bỏ qua).
    fetch('/api/me/history', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'dao-vang', score: this.money, level: this.level }),
    }).catch(() => {});
    const isBest = this.money > best();
    if (isBest) store.set('dv.best', String(this.money));
    play(isBest ? 'win' : 'hvBad');
    showOverlay(el('div', { className: 'card' },
      el('h2', { textContent: 'Hết giờ!' }),
      el('p', { textContent: `Bạn kiếm được $${this.money} / cần $${target} ở màn ${this.level}.` }),
      el('p', { className: 'muted' }, ...(isBest ? [iconEl('trophy'), ' Kỷ lục mới!'] : [`Kỷ lục: $${best()}`])),
      el('button', { className: 'primary', textContent: 'Chơi lại', onclick: () => this.start() }),
      el('button', { textContent: 'Về menu', onclick: menu }),
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
    })));
    renderItems();
    showOverlay(el('div', { className: 'card shop' },
      el('div', { className: 'shopkeeper' }, spriteEl('man0', 0.7), el('p', { textContent: `Qua màn ${this.level}! Mua gì cho màn ${next} không?` })),
      list,
      el('p', {}, 'Tiền: ', moneyEl, ` · Mục tiêu màn ${next}: $${targetOf(next)}`),
      el('button', {
        className: 'primary', textContent: `Vào màn ${next}`,
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
      el('h2', { textContent: 'Tạm dừng' }),
      el('button', { className: 'primary', textContent: 'Chơi tiếp', onclick: () => { this.screen = 'play'; showOverlay(null); } }),
      el('button', { textContent: 'Chơi lại từ đầu', onclick: () => this.start() }),
      el('button', { textContent: 'Về menu', onclick: menu }),
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
  const def = SHOP[o.key];
  return el('button', { className: 'shop-item', disabled: owned || !affordable, onclick: onBuy },
    spriteEl(def.frame), el('strong', { textContent: def.name }), el('small', { textContent: def.desc }),
    el('em', { textContent: owned ? 'Đã mua' : `$${o.price}` }));
}

// ---------- driver: nhiều người (server chạy vật lý, mình vẽ theo snapshot) ----------
const INTERP = 0.1; // vẽ trễ 100 ms so với snapshot mới nhất để luôn có 2 mốc nội suy
const net = {
  ws: null, code: null, room: null, world: null, snaps: [], money: null, anims: {},

  join(code) {
    this.code = code.toUpperCase();
    history.replaceState(null, '', `?r=${this.code}`);
    Object.assign(this, { room: null, world: null, snaps: [], money: null });
    fx = [];
    showOverlay(el('div', { className: 'card' }, el('h2', { textContent: 'Đang kết nối…' })));
    this.connect();
  },
  connect() {
    const q = new URLSearchParams({ id: deviceId, name: myName() });
    const sock = (this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/dv/room/${this.code}?${q}`));
    sock.onmessage = (e) => this.onMsg(JSON.parse(e.data));
    sock.onclose = (e) => {
      if (this.ws !== sock) return;
      if (e.code === 4000) return this.leave('Bạn đã mở phòng này ở tab khác');
      if (this.code && e.code !== 4001) setTimeout(() => this.ws === sock && this.code && this.connect(), 1000);
    };
  },
  leave(msg) {
    this.code = null;
    this.ws?.close();
    stop('up');
    history.replaceState(null, '', location.pathname);
    if (msg) toast(msg);
    menu();
  },
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); },
  shoot() { this.send({ t: 'shoot' }); },
  dyn() { this.send({ t: 'dyn' }); },
  pause() { /* nhiều người không tạm dừng được */ },

  me() { return this.room?.players.find((p) => p.id === deviceId); },
  color(id) { return COLORS[Math.max(0, this.world?.miners.findIndex((m) => m.id === id) ?? 0) % COLORS.length]; },
  name(id) { return this.room?.players.find((p) => p.id === id)?.name ?? ''; },

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
    const coop = r.mode === 'coop';
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
        sub: `$${this.money?.players?.[p.id] ?? p.money} · nổ ${m?.dynamite ?? p.dynamite}`,
        badge: m?.mode === 'in' && m.held ? { icon: 'pickaxe' } : m?.mode === 'out' ? { icon: 'arrow-down' } : '',
      };
    }));
  },

  renderScores(coop) {
    const box = $('#scores');
    const r = this.room;
    const show = r && r.status === 'playing';
    box.hidden = !show;
    if (!show) return;
    const ps = r.players.filter((p) => !p.spec).map((p) => ({ ...p, money: this.money?.players?.[p.id] ?? p.money }));
    if (!coop) ps.sort((a, b) => b.money - a.money);
    const key = ps.map((p) => `${p.id}:${p.money}:${p.online}`).join('|') + coop;
    if (box.dataset.key === key) return; // khỏi dựng lại DOM mỗi khung hình
    box.dataset.key = key;
    box.replaceChildren(...ps.map((p) => {
      const li = el('li', {}, el('i', { className: 'dot' }), `${p.name}${p.id === deviceId ? ' (bạn)' : ''} `, el('b', { textContent: `$${p.money}` }));
      li.style.setProperty('--c', this.color(p.id));
      if (!p.online) li.classList.add('off');
      return li;
    }), ...(this.me()?.spec ? [el('li', { className: 'spec' }, iconEl('eye'), ' Bạn đang xem')] : []));
  },

  renderOverlay() {
    const r = this.room;
    const me = this.me();
    const isHost = r.host === deviceId;
    const players = r.players.filter((p) => !p.spec);
    const playerList = el('ul', { className: 'plist' }, ...r.players.map((p) => el('li', { className: p.online ? '' : 'off' },
      p.id === r.host ? iconEl('crown') : '', p.spec ? iconEl('eye') : '', ` ${p.name}${p.id === deviceId ? ' (bạn)' : ''}`)));
    const copy = el('button', {
      onclick: () => invite(`${location.origin}/dao-vang/?r=${this.code}`, this.code),
    }, iconEl('qr-code'), ` Mời: phòng ${this.code}`);
    const leave = el('button', { textContent: 'Rời phòng', onclick: () => this.leave() });

    if (r.status === 'playing') return showOverlay(null);
    if (r.status === 'lobby' || r.status === 'ended') {
      const modes = el('div', { className: 'seg' }, ...Object.entries(MODE_NAMES).map(([k, v]) => el('button', {
        textContent: v, className: r.mode === k ? 'on' : '', disabled: !isHost, onclick: () => this.send({ t: 'config', mode: k }),
      })));
      const desc = r.mode === 'coop'
        ? 'Cả phòng chung một mỏ, gom chung tiền. Mục tiêu tăng theo số người — không đủ là thua cả đội.'
        : `Chung một mỏ, ví riêng. Tranh nhau vàng trong ${r.versusLevels} màn, ai nhiều tiền nhất thắng.`;
      const result = r.status === 'ended' && r.result ? el('div', { className: 'result' },
        el('h2', {}, ...(r.result.winner ? [iconEl('trophy'), r.result.winner === deviceId ? ' Bạn thắng!' : ` ${this.name(r.result.winner)} thắng`] : [`Thua ở màn ${r.result.level}`])),
        r.result.target ? el('p', { className: 'muted', textContent: `Quỹ chung $${r.result.team} / cần $${r.result.target}` }) : '',
        el('ol', {}, ...r.result.ranking.map((x) => el('li', { textContent: `${x.name}: $${x.money}` }))),
      ) : '';
      return showOverlay(el('div', { className: 'card' },
        result,
        el('h2', { textContent: `Phòng ${this.code}` }),
        modes, el('p', { className: 'muted', textContent: desc }),
        playerList,
        el('p', { className: 'muted', textContent: `${players.length}/4 thợ mỏ.` + (isHost ? '' : ' Chờ chủ phòng bắt đầu.') }),
        isHost ? el('button', { className: 'primary', textContent: r.status === 'ended' ? 'Chơi ván mới' : 'Bắt đầu', onclick: () => this.send({ t: 'start' }) }) : '',
        el('div', { className: 'row' }, copy, leave),
      ));
    }
    if (r.status === 'shop') {
      const coop = r.mode === 'coop';
      const wallet = coop ? r.team : me?.money ?? 0;
      const offer = me?.offer ?? [];
      const left = el('span');
      const tickLeft = () => { left.textContent = Math.max(0, Math.ceil((r.shopEndsAt - (Date.now() + r.clockOffset)) / 1000)); };
      tickLeft();
      clearInterval(this.shopTick);
      this.shopTick = setInterval(tickLeft, 500);
      const readyList = el('p', { className: 'muted', textContent: `Sẵn sàng: ${players.filter((p) => p.ready).map((p) => p.name).join(', ') || '—'}` });
      return showOverlay(el('div', { className: 'card shop' },
        el('div', { className: 'shopkeeper' }, spriteEl('man0', 0.7), el('p', { textContent: `Qua màn ${r.level}! ${coop ? 'Quỹ chung' : 'Ví của bạn'}: $${wallet}` })),
        me?.spec ? el('p', { textContent: 'Bạn đang xem — ván sau được chơi.' }) : el('div', { className: 'shop-items' },
          ...offer.map((o) => shopItem(o, me.bought?.[o.key], wallet >= o.price, () => { play('scoreAdd'); this.send({ t: 'buy', key: o.key }); }))),
        el('p', {}, 'Màn tiếp theo bắt đầu sau ', left, ' giây'),
        readyList,
        me && !me.spec ? el('button', { className: 'primary', textContent: me.ready ? 'Đã sẵn sàng' : 'Sẵn sàng', disabled: me.ready, onclick: () => this.send({ t: 'ready' }) }) : '',
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
  const name = el('input', { value: myName(), maxLength: 20, placeholder: 'Tên của bạn' });
  const saveName = () => store.set('pk.name', name.value.trim() || randomName());
  const code = el('input', { maxLength: 4, placeholder: 'MÃ PHÒNG', className: 'code' });
  const joinCode = () => {
    const c = code.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(c)) return toast.warning('Mã phòng gồm 4 ký tự');
    saveName();
    startNet(c);
  };
  code.onkeydown = (e) => { if (e.key === 'Enter') joinCode(); };
  showOverlay(el('div', { className: 'card menu' },
    spriteEl('goldMiner', 0.8),
    spriteEl('goldBig_0001', 0.5),
    el('p', { className: 'muted', textContent: 'Bấm / chạm (hoặc ↓, Space) để thả móc. Có thuốc nổ thì bấm ↑ để phá vật đang kéo.' }),
    el('button', { className: 'primary', textContent: 'Chơi một mình', onclick: () => { saveName(); driver = solo; solo.start(); } }),
    el('label', { className: 'field' }, 'Tên của bạn', name),
    el('button', { onclick: () => { saveName(); startNet(Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')); } }, iconEl('users'), ' Tạo phòng chơi nhiều người'),
    el('div', { className: 'row' }, code, el('button', { textContent: 'Vào phòng', onclick: joinCode })),
    el('p', { className: 'muted', textContent: best() ? `Kỷ lục chơi một mình: $${best()}` : '' }),
    el('a', { className: 'link', href: '/', textContent: '← Các game khác' }),
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

await ready;
fit();
const initial = new URLSearchParams(location.search).get('r');
if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) startNet(initial);
else menu();
requestAnimationFrame(loop);

// Khung chung cho các game Nokia: trang vào phòng, header (mời QR, âm thanh), máy Nokia (LCD + bàn phím),
// sảnh chờ / kết quả. Mỗi game chỉ cần vẽ LCD và xử lý phím:
//   nokiaApp({ game, title, help, lobby?(box, room, isHost, setCfg), draw(lcd, room, now), onKey?(k, down, room),
//              onState?(room, prev), onMsg?(m), badge?(player, room), onTap?(x, y, room, app) })
// Server: /api/nk/<game>/room/CODE (worker/nokia.js). Tin game gửi qua app.send({...}) -> { t: 'g', ... }.
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, addReroll } from '../names.js';
import { createLCD, bindKeys } from './lcd.js';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const COLORS = ['#5cc8ff', '#ff7ab6', '#7dff9a', '#ffb454', '#c49bff', '#ffe66b'];

export function nokiaApp(opt) {
  let deviceId = store.get('pk.id');
  if (!deviceId) { deviceId = crypto.randomUUID(); store.set('pk.id', deviceId); }
  let ws, code = null, room = null, clockOffset = 0;

  // ---------- DOM ----------
  const name = el('input', { maxLength: 20, autocomplete: 'off', value: deviceName() });
  const codeIn = el('input', { maxLength: 4, placeholder: 'MÃ PHÒNG', autocomplete: 'off', className: 'code' });
  const home = el('section', { id: 'home' }, el('div', { className: 'card' },
    el('h1', {}, el('a', { href: '/', className: 'back', title: 'Các game khác', innerHTML: icon('arrow-left') }),
      el('img', { className: 'logo', src: `/logos/${opt.game}.svg`, alt: '' }), opt.title),
    el('p', { className: 'sub', textContent: opt.sub }),
    el('label', {}, 'Tên của bạn', name),
    el('button', { className: 'primary', textContent: 'Tạo phòng mới', onclick: () => enter(Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')) }),
    el('div', { className: 'join' }, codeIn, el('button', { textContent: 'Vào phòng', onclick: joinCode })),
    el('p', { className: 'muted', textContent: opt.help }),
  ));
  addReroll(name);
  codeIn.onkeydown = (e) => e.key === 'Enter' && joinCode();

  const roomCode = el('b');
  const conn = el('span', { className: 'dot', title: 'Kết nối' });
  const btnSound = el('button', { title: 'Âm thanh' });
  const players = el('ul', { id: 'players' });
  const canvas = el('canvas');
  const pad = el('div', { className: 'pad' });
  const ov = el('div', { id: 'overlay', hidden: true });
  const roomEl = el('section', { id: 'room', hidden: true },
    el('header', {},
      el('button', { title: 'Rời phòng', innerHTML: icon('arrow-left'), onclick: () => leave() }),
      el('button', { title: 'Mời bạn: mã QR / link', onclick: () => invite(`${location.origin}/nokia/${opt.game}/?r=${code}`, code) },
        el('span', { className: 'lbl', textContent: 'Phòng ' }), roomCode, iconEl('qr-code')),
      conn, el('span', { className: 'grow' }), btnSound),
    players,
    el('main', { className: 'stage' },
      el('div', { className: 'phone' }, el('div', { className: 'brand', textContent: 'NOKIA' }), el('div', { className: 'screen' }, canvas), pad),
      ov),
  );
  document.body.append(home, roomEl);
  hydrateIcons();
  const lcd = createLCD(canvas);

  // ---------- âm thanh: tiếng bíp kiểu Nokia (WebAudio, không cần file) ----------
  let soundOn = store.get('nk.sound') !== '0';
  let audio;
  const beep = (freq = 880, ms = 60, type = 'square') => {
    if (!soundOn) return;
    try {
      audio ??= new AudioContext();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = 0.05;
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + ms / 1000);
    } catch {}
  };
  const renderSound = () => { btnSound.innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); };
  btnSound.onclick = () => { soundOn = !soundOn; store.set('nk.sound', soundOn ? '1' : '0'); renderSound(); };
  renderSound();

  // ---------- vào / rời phòng ----------
  function joinCode() {
    const c = codeIn.value.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(c)) enter(c); else toast.warning('Mã phòng gồm 4 ký tự');
  }
  function enter(c) {
    code = c.toUpperCase();
    store.set('pk.name', name.value.trim() || deviceName());
    history.replaceState(null, '', `?r=${code}`);
    roomCode.textContent = code;
    home.hidden = true;
    roomEl.hidden = false;
    room = null;
    render();
    connect();
  }
  function leave(msg) {
    code = null;
    ws?.close();
    history.replaceState(null, '', location.pathname);
    roomEl.hidden = true;
    home.hidden = false;
    if (msg) toast.error(msg);
  }
  function connect() {
    const q = new URLSearchParams({ id: deviceId, name: name.value.trim() || deviceName() });
    const sock = (ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/nk/${opt.game}/room/${code}?${q}`));
    sock.onopen = () => conn.classList.add('on');
    sock.onmessage = (e) => onMsg(JSON.parse(e.data));
    sock.onclose = (e) => {
      if (ws !== sock) return;
      conn.classList.remove('on');
      if (e.code === 4000) return leave('Bạn đã mở phòng này ở tab/thiết bị khác');
      if (code && e.code !== 4001) setTimeout(() => ws === sock && code && connect(), 1000);
    };
  }
  const raw = (m) => ws?.readyState === 1 && ws.send(JSON.stringify(m));

  function onMsg(m) {
    if (m.t === 'error') return leave(m.msg);
    if (m.t !== 'state') return opt.onMsg?.(m, app);
    const prev = room;
    room = m;
    clockOffset = m.now - Date.now();
    if (m.status === 'playing' && prev?.status !== 'playing') beep(1320, 120);
    if (m.status === 'ended' && prev?.status === 'playing') {
      const me = m.result?.ranks?.find((r) => r.id === deviceId);
      if (me?.won) { toast.success('Bạn thắng!', { icon: 'trophy' }); beep(1760, 250); }
      else if (m.result?.ranks?.length > 1) toast(`${m.result.ranks[0].name} thắng`, { icon: 'trophy' });
    }
    opt.onState?.(m, prev, app);
    render();
  }

  bindKeys(pad, (k, down) => opt.onKey?.(k, down, room, app), () => !!room && roomEl.hidden === false);
  canvas.onpointerdown = (e) => { if (room && opt.onTap) { e.preventDefault(); opt.onTap(...app.lcdPoint(e), room, app); } };

  // ---------- vẽ ----------
  const colorOf = (id) => COLORS[Math.max(0, room?.seats.indexOf(id) ?? 0) % COLORS.length];
  function render() {
    const r = room;
    players.replaceChildren(...(r?.players ?? []).map((p) => {
      const li = el('li', { className: p.id === deviceId ? 'me' : '' });
      li.style.setProperty('--c', r.seats.includes(p.id) ? colorOf(p.id) : 'transparent');
      li.append(p.id === r.host ? iconEl('crown') : '', ` ${p.name}${p.id === deviceId ? ' (bạn)' : ''}`);
      const b = opt.badge?.(p, r);
      if (b != null && b !== '') li.append(' · ', el('b', { textContent: b }));
      if (r.status === 'playing' && !r.seats.includes(p.id)) li.append(' ', iconEl('eye'));
      return li;
    }));
    const isHost = r?.host === deviceId;
    if (!r || r.status === 'playing') { ov.hidden = !!r; if (!r) ov.replaceChildren(el('div', { className: 'card' }, el('h2', { textContent: 'Đang kết nối…' }))); return; }
    ov.hidden = false;
    const box = el('div', { className: 'cfg' });
    opt.lobby?.(box, r, isHost, (cfg) => raw({ t: 'config', cfg }));
    const res = r.status === 'ended' && r.result;
    ov.replaceChildren(el('div', { className: 'card' },
      el('h2', {}, ...(res ? [iconEl('trophy'), ` ${res.title ?? (res.ranks.length > 1 ? `${res.ranks[0].name} thắng` : 'Hết ván')}`] : [`Phòng ${code}`])),
      res ? el('ol', { className: 'ranks' }, ...res.ranks.map((x) => el('li', {}, el('span', { textContent: x.name }), el('b', { textContent: opt.scoreText?.(x.score, res) ?? x.score })))) : '',
      box,
      el('p', { className: 'sub', textContent: `${r.players.length} người trong phòng. ${opt.lobbyText?.(r) ?? ''}${isHost ? '' : ' Chờ chủ phòng bắt đầu.'}` }),
      isHost ? el('button', { className: 'primary', textContent: res ? 'Chơi lại' : 'Bắt đầu', onclick: () => raw({ t: 'start' }) }) : '',
    ));
  }

  function frame() {
    if (room && !roomEl.hidden) {
      lcd.clear();
      opt.draw(lcd, room, Date.now() + clockOffset, app);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const app = {
    get id() { return deviceId; }, get room() { return room; }, lcd, canvas, beep, toast, colorOf,
    // Toạ độ LCD (0..83, 0..47) của một lần chạm/bấm chuột lên màn hình.
    lcdPoint(e) { const r = canvas.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * 84), Math.floor(((e.clientY - r.top) / r.height) * 48)]; },
    send: (m) => raw({ t: 'g', ...m }), now: () => Date.now() + clockOffset,
  };
  window.nk = app; // cho test tự động
  const initial = new URLSearchParams(location.search).get('r');
  if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);
  return app;
}

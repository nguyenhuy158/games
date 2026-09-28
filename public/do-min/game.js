import { SIZES, HIDDEN, FLAG, BOOM, LIVES } from './logic.js';
import { icon, hydrateIcons } from '../icons.js';
import { createPanel } from '../panel.js';

hydrateIcons();
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// Cùng danh tính thiết bị với các game khác (pk.id / pk.name).
let deviceId = store.get('pk.id');
if (!deviceId) { deviceId = crypto.randomUUID(); store.set('pk.id', deviceId); }
$('#name').value = store.get('pk.name') || `Người chơi ${Math.floor(100 + Math.random() * 900)}`;
const myName = () => $('#name').value.trim() || 'Người chơi';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COLORS = ['#5cc8ff', '#ff7ab6', '#7dff9a', '#ffb454', '#c49bff', '#ffe66b', '#6bf0e0', '#ff9b9b'];
const LONG_PRESS_MS = 400;

let ws, code = null, room = null, grids = {}, mines = null, clockOffset = 0, flagMode = false;
let cursors = {};
const panel = createPanel({ root: $('#panel'), toggle: $('#btnPanel'), storeKey: 'ms.panel' });

const me = () => room?.players.find((p) => p.id === deviceId);
const view = () => me()?.unit ?? Object.keys(grids)[0] ?? null;
const size = () => SIZES[room?.size ?? 0];
const playing = () => room?.status === 'playing' && me()?.unit && !room.units[me().unit]?.done;
const colorOf = (id) => COLORS[Math.max(0, room?.players.findIndex((p) => p.id === id) ?? 0) % COLORS.length];
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? '';

// ---------- âm thanh (dùng lại bộ âm của Pikachu) ----------
let soundOn = store.get('ms.sound') !== '0';
const SND = Object.fromEntries(Object.entries({ open: 'sound2', boom: 'sound1', start: 'sound4', win: 'sound5' })
  .map(([k, f]) => [k, new Audio(`../pikachu/sound/${f}.mp3`)]));
function play(k) { if (!soundOn) return; SND[k].currentTime = 0; SND[k].play().catch(() => {}); }
function renderSound() { $('#btnSound').innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); }
$('#btnSound').onclick = () => { soundOn = !soundOn; store.set('ms.sound', soundOn ? '1' : '0'); renderSound(); };
renderSound();

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}

// ---------- vào / rời phòng ----------
function enter(c) {
  code = c.toUpperCase();
  store.set('pk.name', myName());
  history.replaceState(null, '', `?r=${code}`);
  $('#roomCode').textContent = code;
  $('#home').hidden = true;
  $('#room').hidden = false;
  room = mines = null;
  grids = {}; cursors = {};
  render();
  connect();
}
function leave(msg) {
  code = null;
  ws?.close();
  history.replaceState(null, '', location.pathname);
  $('#room').hidden = true;
  $('#home').hidden = false;
  if (msg) toast(msg);
}
function connect() {
  const q = new URLSearchParams({ id: deviceId, name: myName() });
  const sock = (ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ms/room/${code}?${q}`));
  sock.onopen = () => $('#conn').classList.add('on');
  sock.onmessage = (e) => onMsg(JSON.parse(e.data));
  sock.onclose = (e) => {
    if (ws !== sock) return;
    $('#conn').classList.remove('on');
    if (e.code === 4000) return leave('Bạn đã mở phòng này ở tab/thiết bị khác');
    if (code && e.code !== 4001) setTimeout(() => ws === sock && code && connect(), 1000);
  };
}
const send = (m) => ws?.readyState === 1 && ws.send(JSON.stringify(m));

function onMsg(m) {
  switch (m.t) {
    case 'error': return leave(m.msg);
    case 'state': {
      const was = room?.status;
      room = m;
      clockOffset = m.now - Date.now();
      if (m.status === 'playing' && was !== 'playing') { mines = null; play('start'); }
      if (was === 'playing' && m.status === 'ended') {
        const won = m.mode === 'coop' ? !!m.winner : m.winner === me()?.unit;
        play(won ? 'win' : 'boom');
        cursors = {};
      }
      break;
    }
    case 'grid':
      grids = { ...grids, ...m.grids };
      break;
    case 'open': {
      const g = grids[m.unit];
      if (!g) return;
      for (const [i, v] of m.cells) g[i] = v;
      if (m.unit === view()) {
        if (m.boom) { play('boom'); shake(); if (m.by !== deviceId) toast(`${nameOf(m.by)} đạp mìn!`); }
        else if (m.by === deviceId && m.cells.some(([, v]) => v >= 0)) play('open');
      }
      break;
    }
    case 'reveal':
      mines = new Set(m.mines);
      break;
    case 'cur':
      if (m.p) cursors[m.id] = m.p; else delete cursors[m.id];
      return renderCursors();
    case 'ping':
      return pingFx(m.i, colorOf(m.id), nameOf(m.id));
    default:
      return;
  }
  render();
}

// ---------- nút ----------
$('#btnCreate').onclick = () => enter(Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''));
$('#btnJoin').onclick = () => {
  const c = $('#code').value.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(c)) enter(c); else toast('Mã phòng gồm 4 ký tự');
};
$('#code').onkeydown = (e) => { if (e.key === 'Enter') $('#btnJoin').click(); };
$('#btnLeave').onclick = () => leave();
$('#btnStart').onclick = () => send({ t: 'start' });
$('#btnCopy').onclick = async () => {
  const link = `${location.origin}/do-min/?r=${code}`;
  try { await navigator.clipboard.writeText(link); toast('Đã sao chép link mời'); } catch { toast(link); }
};
$('#btnFlag').onclick = () => { flagMode = !flagMode; $('#btnFlag').classList.toggle('on', flagMode); toast(flagMode ? 'Chạm để cắm cờ' : 'Chạm để mở ô'); };
for (const b of document.querySelectorAll('#modePick button')) b.onclick = () => send({ t: 'config', mode: b.dataset.mode });
$('#sizePick').replaceChildren(...SIZES.map((z, i) => el('button', {
  textContent: `${z.name} ${z.cols}×${z.rows}`, title: `${z.mines} mìn`, onclick: () => send({ t: 'config', size: i }),
})));

// ---------- bàn ----------
let geo = { s: 24, portrait: false, R: 9, C: 9 };
// Bàn ngang (Khó 30x16) trên màn dọc thì xoay cho ô đỡ bé, giống Pikachu.
function layout() {
  const wrap = $('#boardWrap');
  const { rows: R, cols: C } = size();
  const portrait = wrap.clientHeight > wrap.clientWidth && C > R;
  const gc = portrait ? R : C, gr = portrait ? C : R;
  const s = Math.max(14, Math.floor(Math.min((wrap.clientWidth - (gc - 1) * 2) / gc, (wrap.clientHeight - (gr - 1) * 2) / gr, 44)));
  geo = { s, portrait, R, C };
  const b = $('#board');
  b.style.width = `${gc * s + (gc - 1) * 2}px`;
  b.style.height = `${gr * s + (gr - 1) * 2}px`;
  b.style.setProperty('--s', `${s}px`);
  $('#cells').style.gridTemplateColumns = `repeat(${gc}, ${s}px)`;
  $('#cells').style.gridTemplateRows = `repeat(${gr}, ${s}px)`;
}
// Ô logic i -> vị trí hiển thị (có xoay).
const disp = (i) => { const r = Math.floor(i / geo.C), c = i % geo.C; return geo.portrait ? [c, r] : [r, c]; }; // [hàng, cột] hiển thị
const cellPx = (i) => { const [dr, dc] = disp(i); return [dc * (geo.s + 2), dr * (geo.s + 2)]; };

let builtFor = '';
function renderBoard() {
  const g = grids[view()];
  const cells = $('#cells');
  if (!g || !room || room.status === 'lobby') { cells.replaceChildren(); builtFor = ''; return; }
  layout();
  const key = `${view()}|${room.size}|${geo.portrait}|${geo.s}`;
  if (builtFor !== key) {
    // Dựng lưới 1 lần; sau đó chỉ đổi class từng ô (bàn Khó có 480 ô).
    const nodes = new Array(g.length);
    for (let i = 0; i < g.length; i++) {
      const [dr, dc] = disp(i);
      nodes[i] = el('div', { className: 'm' });
      nodes[i].dataset.i = i;
      nodes[i].style.gridRow = dr + 1;
      nodes[i].style.gridColumn = dc + 1;
    }
    cells.replaceChildren(...nodes);
    builtFor = key;
  }
  for (let i = 0; i < g.length; i++) {
    const v = g[i], n = cells.children[i];
    let cls = 'm';
    if (v >= 0) cls += ` o${v ? ` n${v}` : ''}`;
    else if (v === FLAG) cls += mines && !mines.has(i) ? ' f wf' : ' f';
    else if (v === BOOM) cls += ' b';
    else if (mines?.has(i)) cls += ' x';
    if (n.className !== cls) n.className = cls;
    const t = v > 0 ? String(v) : '';
    if (n.textContent !== t) n.textContent = t;
  }
  renderCursors();
}

function shake() {
  const b = $('#board');
  b.classList.remove('shake');
  void b.offsetWidth;
  b.classList.add('shake');
}

function fx(node, ms) { $('#fx').append(node); setTimeout(() => node.remove(), ms); }
function pingFx(i, color, who) {
  if (!grids[view()]) return;
  const [x, y] = cellPx(i);
  const n = el('div', { className: 'ping' }, el('span', { textContent: who }));
  n.style.cssText = `left:${x}px;top:${y}px;width:${geo.s}px;height:${geo.s}px;--c:${color}`;
  fx(n, 1600);
}

// Chuột đồng đội (chơi chung): toạ độ theo ô logic nên đúng cả khi bàn bị xoay.
function renderCursors() {
  const layer = $('#fx');
  const alive = new Set();
  for (const [id, [r, c]] of Object.entries(cursors)) {
    const p = room?.players.find((x) => x.id === id);
    if (!p?.online) continue;
    alive.add(id);
    let n = layer.querySelector(`.cursor[data-id="${CSS.escape(id)}"]`);
    if (!n) {
      n = el('div', { className: 'cursor', innerHTML: icon('mouse-pointer-2') });
      n.dataset.id = id;
      n.append(el('span', { textContent: p.name }));
      layer.append(n);
    }
    n.style.setProperty('--c', colorOf(id));
    const [dr, dc] = geo.portrait ? [c, r] : [r, c];
    n.style.left = `${dc * (geo.s + 2)}px`;
    n.style.top = `${dr * (geo.s + 2)}px`;
  }
  for (const n of layer.querySelectorAll('.cursor')) if (!alive.has(n.dataset.id)) n.remove();
}

const shared = () => room?.mode === 'coop';
let lastCur = 0, curTimer = null;
$('#boardWrap').addEventListener('pointermove', (e) => {
  if (!shared() || !playing()) return;
  const rect = $('#board').getBoundingClientRect();
  const x = (e.clientX - rect.left) / (geo.s + 2), y = (e.clientY - rect.top) / (geo.s + 2);
  const p = (geo.portrait ? [x, y] : [y, x]).map((v) => Math.round(v * 100) / 100);
  const wait = 50 - (Date.now() - lastCur);
  clearTimeout(curTimer);
  const go = () => { lastCur = Date.now(); send({ t: 'cur', p }); };
  if (wait <= 0) go(); else curTimer = setTimeout(go, wait);
});
$('#boardWrap').addEventListener('pointerleave', () => { clearTimeout(curTimer); if (shared() && playing()) send({ t: 'cur', p: null }); });

// Mở ô: bấm vào ô số đã mở = "chord" (mở nhanh xung quanh khi đủ cờ).
function act(i, flag) {
  const g = grids[view()];
  if (!playing() || !g) return;
  if (flag) return send({ t: 'flag', i });
  if (g[i] > 0) return send({ t: 'chord', i });
  if (g[i] === HIDDEN) send({ t: 'open', i });
}
function ping(i) {
  if (!shared() || !playing()) return;
  send({ t: 'ping', i });
  pingFx(i, colorOf(deviceId), 'Bạn');
}

let press = null;
$('#cells').addEventListener('contextmenu', (e) => e.preventDefault());
$('#cells').addEventListener('pointerdown', (e) => {
  const i = Number(e.target.dataset?.i);
  if (!Number.isInteger(i)) return;
  if (e.pointerType === 'mouse') {
    if (e.shiftKey) return ping(i);
    if (e.button === 2) return act(i, true);
    if (e.button === 0) return act(i, flagMode);
    return;
  }
  // Cảm ứng: chạm = mở (hoặc cắm cờ nếu bật chế độ cờ), giữ = cắm cờ.
  clearTimeout(press?.timer);
  press = { i, timer: setTimeout(() => { press = null; act(i, true); navigator.vibrate?.(20); }, LONG_PRESS_MS) };
});
addEventListener('pointerup', () => {
  if (!press) return;
  clearTimeout(press.timer);
  const { i } = press;
  press = null;
  act(i, flagMode);
});
addEventListener('pointercancel', () => { clearTimeout(press?.timer); press = null; });
new ResizeObserver(() => render()).observe($('#boardWrap'));

// ---------- HUD + khung người chơi ----------
// Thời gian của bàn (đã gồm phạt đạp mìn khi đua): xong bàn thì cố định, ván xong thì dừng ở lúc kết thúc.
function elapsed(u) {
  if (!room?.startedAt) return 0;
  if (u?.done === 'clear') return u.time;
  const end = room.status === 'ended' ? room.endedAt : Date.now() + clockOffset;
  return Math.max(0, end - room.startedAt + (u?.penalty ?? 0));
}
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function renderPanel() {
  if (room?.status !== 'playing') return panel.update([]);
  const mine = view();
  const tiles = [];
  for (const p of room.players) {
    if (p.spec || p.id === deviceId) continue;
    const u = room.units[p.unit];
    if (p.unit !== mine && u) {
      // Đua: chỉ hiện tiến độ (thấy bàn đối thủ là chép được ô an toàn).
      const pct = Math.floor((u.opened / u.total) * 100);
      tiles.push({
        key: p.id, name: p.name, color: colorOf(p.id), off: !p.online,
        sub: `${pct}% · 💥${u.booms}`, badge: u.done === 'clear' ? '🏆' : '',
        version: `${pct}|${u.booms}`,
        draw: (ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          const r = Math.min(w, h) * 0.36, cx = w / 2, cy = h / 2;
          ctx.lineWidth = r * 0.22;
          ctx.strokeStyle = '#ffffff22';
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = colorOf(p.id);
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100); ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `800 ${Math.round(r * 0.6)}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${pct}%`, cx, cy);
        },
      });
    } else {
      tiles.push({ key: p.id, name: p.name, color: colorOf(p.id), off: !p.online, sub: `mở ${p.opened} · 💥${p.booms}` });
    }
  }
  panel.update(tiles);
}

function render() {
  renderBoard();
  renderPanel();
  const r = room, u = r?.units[view()], z = size();
  const g = grids[view()];
  const flags = g ? g.filter((v) => v === FLAG || v === BOOM).length : 0;
  $('#minesLeft').querySelector('b').textContent = z.mines - flags;
  $('#lives').hidden = !(r?.status === 'playing' && r.mode === 'coop');
  if (u) $('#lives').textContent = '❤️'.repeat(Math.max(0, u.lives)) + '🖤'.repeat(Math.max(0, LIVES - u.lives));

  const players = [...(r?.players ?? [])].filter((p) => !p.spec);
  $('#players').replaceChildren(...players.map((p) => {
    const li = el('li', { className: `${p.id === deviceId ? 'me' : ''} ${p.online ? '' : 'off'}` });
    li.style.setProperty('--c', colorOf(p.id));
    if (p.id === r.host) li.innerHTML = icon('crown');
    li.append(`${p.name}${p.id === deviceId ? ' (bạn)' : ''} · `, el('b', { textContent: `mở ${p.opened}` }), p.booms ? ` · 💥${p.booms}` : '');
    return li;
  }));

  const isHost = r?.host === deviceId;
  const ov = $('#overlay');
  const lobbyish = r && r.status !== 'playing';
  $('#modePick').hidden = $('#sizePick').hidden = !lobbyish;
  for (const b of document.querySelectorAll('#modePick button')) { b.classList.toggle('on', b.dataset.mode === r?.mode); b.disabled = !isHost; }
  [...$('#sizePick').children].forEach((b, i) => { b.classList.toggle('on', i === r?.size); b.disabled = !isHost; });
  $('#ovScore').hidden = true;
  if (!r) {
    ov.hidden = false;
    $('#ovTitle').textContent = 'Đang kết nối…';
    $('#ovText').textContent = '';
    $('#btnStart').hidden = true;
  } else if (r.status === 'playing') {
    ov.hidden = !me()?.spec && !u?.done;
    if (!ov.hidden) {
      $('#ovTitle').textContent = me()?.spec ? 'Bạn đang xem' : '🏆 Xong bàn!';
      $('#ovText').textContent = me()?.spec ? 'Ván sau bạn sẽ được chơi.' : 'Chờ những người khác…';
      $('#btnStart').hidden = true;
      if (me()?.spec) ov.hidden = true;
    }
  } else {
    ov.hidden = false;
    const coop = r.mode === 'coop';
    if (r.status === 'lobby') {
      $('#ovTitle').textContent = `Phòng ${code}`;
      $('#ovText').textContent = `${players.length}/4 người. ` + (coop
        ? `Cả phòng chung một bàn, chung ${LIVES} mạng — thấy chuột nhau, Shift+bấm để ping ô nghi có mìn.`
        : 'Cùng một đề mìn, mỗi người một bàn. Đạp mìn +10 giây. Ai mở hết trước thắng.') + (isHost ? '' : ' Chờ chủ phòng bắt đầu.');
    } else {
      const wu = r.units[r.winner];
      $('#ovTitle').textContent = coop ? (r.winner ? '🏆 Cả đội dò sạch mìn!' : '💥 Hết mạng rồi…') : r.winner === me()?.unit ? '🏆 Bạn thắng!' : `🏆 ${nameOf(r.winner)} thắng`;
      $('#ovScore').hidden = false;
      $('#ovScore').textContent = wu ? `Thời gian ${fmt(wu.time)}${wu.penalty ? ` (gồm phạt ${wu.penalty / 1000}s)` : ''}` : `Đã mở ${u?.opened ?? 0}/${u?.total ?? 0} ô`;
      $('#ovText').textContent = isHost ? 'Ván mới?' : 'Chờ chủ phòng mở ván mới.';
    }
    $('#btnStart').hidden = !isHost;
    $('#btnStart').textContent = r.status === 'lobby' ? 'Bắt đầu' : 'Chơi ván mới';
  }
}

setInterval(() => {
  if (!room || room.status === 'lobby') { $('#clock').textContent = '0:00'; return; }
  $('#clock').textContent = fmt(elapsed(room.units[view()]));
}, 250);
window.ms = { get room() { return room; }, get grids() { return grids; }, view }; // cho test tự động

const initial = new URLSearchParams(location.search).get('r');
if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);

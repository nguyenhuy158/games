import { N, FLEET, shipAt, validFleet } from './logic.js';
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, addReroll } from '../names.js';

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
$('#name').value = deviceName();
addReroll($('#name'));
const myName = () => $('#name').value.trim() || 'Người chơi';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHIP_COLORS = ['#e8716f', '#7c83d6', '#4fb3ea', '#4aa89a', '#b06ad6'];
// Cảm xúc = icon lucide + màu; số lượng khớp EMO_COUNT ở worker (gửi theo chỉ số).
const EMOS = [['thumbs-up', '#1f6fd6'], ['laugh', '#e0a100'], ['frown', '#8a5cd6'], ['flame', '#ff7a3d'], ['heart', '#e0312f']];

let ws, code = null, room = null, clockOffset = 0, peek = false, sel = -1;
const mySeat = () => (room?.seats.indexOf(deviceId) ?? -1) + 1;
const myTurn = () => room?.status === 'playing' && mySeat() === room.turn;
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? '';

// ---------- âm thanh (dùng lại âm của Pikachu / Đào Vàng) ----------
let soundOn = store.get('bt.sound') !== '0';
const SND = Object.fromEntries(Object.entries({
  miss: '../pikachu/sound/sound2.mp3', hit: '../dao-vang/assets/audio/boom.m4a', start: '../pikachu/sound/sound4.mp3',
  win: '../pikachu/sound/sound5.mp3', lose: '../pikachu/sound/sound1.mp3',
}).map(([k, f]) => [k, new Audio(f)]));
function play(k) { if (!soundOn) return; SND[k].currentTime = 0; SND[k].play().catch(() => {}); }
function renderSound() { $('#btnSound').innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); }
$('#btnSound').onclick = () => { soundOn = !soundOn; store.set('bt.sound', soundOn ? '1' : '0'); renderSound(); };
renderSound();

// ---------- vào / rời phòng ----------
function enter(c) {
  code = c.toUpperCase();
  store.set('pk.name', myName());
  history.replaceState(null, '', `?r=${code}`);
  $('#roomCode').textContent = code;
  $('#home').hidden = true;
  $('#room').hidden = false;
  room = null;
  render();
  connect();
}
function leave(msg) {
  code = null;
  ws?.close();
  history.replaceState(null, '', location.pathname);
  $('#room').hidden = true;
  $('#home').hidden = false;
  if (msg) toast.error(msg);
}
function connect() {
  const q = new URLSearchParams({ id: deviceId, name: myName() });
  const sock = (ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/bt/room/${code}?${q}`));
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
  if (m.t === 'error') return leave(m.msg);
  if (m.t === 'emo') return emoFx(m.id, m.e);
  if (m.t !== 'state') return;
  const was = room;
  room = m;
  clockOffset = m.now - Date.now();
  if (m.status === 'placing' && was?.status !== 'placing') peek = false;
  if (m.status === 'playing' && was?.status !== 'playing') play('start');
  const shot = m.last && JSON.stringify(m.last) !== JSON.stringify(was?.last) ? m.last : null;
  if (shot && m.status !== 'placing') {
    play(shot.hit ? 'hit' : 'miss');
    if (shot.sunk >= 0) {
      const mine = shot.by !== mySeat() && mySeat();
      toast(mine ? `Tàu ${FLEET[shot.sunk]} ô của bạn bị đánh chìm!` : `Đánh chìm tàu ${FLEET[shot.sunk]} ô!`, { icon: 'flame' });
    }
  }
  if (was?.status === 'playing' && m.status === 'ended') {
    const seat = mySeat();
    const who = m.names[m.winner - 1];
    if (seat === m.winner) { play('win'); toast.success(m.why === 'timeout' ? 'Đối thủ bỏ lượt quá lâu — bạn thắng!' : 'Bạn đánh chìm hết tàu — thắng rồi!', { icon: 'trophy' }); }
    else if (seat) { play('lose'); toast.error(m.why === 'timeout' ? 'Bỏ lượt 3 lần — bạn thua' : `${who} thắng`); }
    else { play('win'); toast(`${who} thắng`, { icon: 'trophy' }); }
  }
  render();
}

// ---------- nút ----------
$('#btnCreate').onclick = () => enter(Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''));
$('#btnJoin').onclick = () => {
  const c = $('#code').value.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(c)) enter(c); else toast.warning('Mã phòng gồm 4 ký tự');
};
$('#code').onkeydown = (e) => e.key === 'Enter' && $('#btnJoin').click();
$('#btnLeave').onclick = () => leave();
$('#btnCopy').onclick = () => invite(`${location.origin}/ban-tau/?r=${code}`, code);
$('#btnStart').onclick = () => send({ t: 'start' });
$('#btnReroll').onclick = () => { sel = -1; send({ t: 'reroll' }); };
$('#btnRotate').onclick = () => rotate(sel);
$('#btnReady').onclick = () => send({ t: 'ready' });
$('#btnPeek').onclick = () => { peek = true; render(); };
$('#btnResult').onclick = () => { peek = false; render(); };
$('#emoBar').append(...EMOS.map(([name, color], i) => {
  const b = el('button', { title: 'Gửi cảm xúc', onclick: () => send({ t: 'emo', e: i }) }, iconEl(name));
  b.style.color = color;
  return b;
}));

// 2 biển: A = của mình (người xem: người cầm ghế 1), B = của đối thủ — chỗ để bắn.
for (const g of document.querySelectorAll('.grid')) {
  g.append(...Array.from({ length: N * N }, (_, i) => {
    const c = el('div', { className: 'c' });
    c.dataset.i = i;
    return c;
  }));
}
// Tự xếp tàu (biển của mình, lúc xếp): chạm tàu để chọn, chạm lại để xoay, chạm ô trống để dời tàu đang chọn tới đó (ô chạm = đầu tàu).
const canEdit = () => room?.status === 'placing' && mySeat() && !room.ready[mySeat() - 1];
const myFleet = () => room.fleets[mySeat() - 1];
const isDown = (ship) => ship.length > 1 && ship[1] - ship[0] === N;
function tryPlace(k, cells) {
  const ships = myFleet().map((s, j) => (j === k ? cells : s));
  if (cells && validFleet(ships)) return send({ t: 'place', ships });
  toast.warning('Không đặt được — tàu phải nằm trong biển và không sát tàu khác');
}
function rotate(k) {
  if (!canEdit() || k < 0) return;
  const ship = myFleet()[k], down = !isDown(ship), len = ship.length;
  // Xoay quanh đầu tàu; chạm mép thì lùi đầu tàu vào trong cho vừa.
  const r = Math.floor(ship[0] / N), c = ship[0] % N;
  tryPlace(k, shipAt(down ? Math.min(r, N - len) * N + c : r * N + Math.min(c, N - len), len, down));
}
$('#seaA .grid').onclick = (e) => {
  const c = e.target.closest('.c');
  if (!c || !canEdit()) return;
  const i = Number(c.dataset.i);
  const k = myFleet().findIndex((s) => s.includes(i));
  if (k >= 0) { if (k === sel) rotate(k); else { sel = k; render(); } return; }
  if (sel >= 0) tryPlace(sel, shipAt(i, FLEET[sel], isDown(myFleet()[sel])));
};
$('#seaB .grid').onclick = (e) => {
  const c = e.target.closest('.c');
  const me = mySeat();
  if (!c || !myTurn() || room.shots[me - 1][c.dataset.i]) return;
  send({ t: 'shoot', i: Number(c.dataset.i) });
};

// Cảm xúc bay lên từ tên người gửi (người xem thì bay từ thanh cảm xúc).
function emoFx(id, e) {
  if (!EMOS[e]) return;
  const seat = (room?.seats.indexOf(id) ?? -1) + 1;
  const from = (seat ? $(`.side[data-seat="${seat}"]`) : $('#emoBar')).getBoundingClientRect();
  const n = el('div', { className: 'emo-fly' }, iconEl(EMOS[e][0]));
  n.style.cssText = `left:${from.left + from.width / 2}px;top:${from.bottom + 40}px;color:${EMOS[e][1]}`;
  if (!seat) n.append(el('small', { textContent: ` ${nameOf(id)}` }));
  document.body.append(n);
  setTimeout(() => n.remove(), 1600);
}

// ---------- vẽ ----------
// Cỡ ô: xếp tàu thì chỉ 1 biển to; ngang thì 2 biển bằng nhau; dọc thì biển bắn to, biển mình nhỏ.
const CAP = 22 + 14 + 12; // chú thích + hàng tàu + khoảng cách mỗi biển
function fit() {
  const w = $('#wrap');
  const W = w.clientWidth - 8, H = w.clientHeight - 8;
  let a, b;
  if (room?.status === 'placing') { a = Math.min(W, H - CAP) / N; b = a; }
  else if (W > H) { a = b = Math.min((W - 16) / 2, H - CAP) / N; }
  else { b = Math.min(W, (H - 2 * CAP) * 0.62) / N; a = Math.min(W, H - 2 * CAP - b * N) / N; }
  $('#seaA .grid').style.setProperty('--s', `${Math.floor(Math.min(a, 48))}px`);
  $('#seaB .grid').style.setProperty('--s', `${Math.floor(Math.min(b, 48))}px`);
}
new ResizeObserver(fit).observe($('#wrap'));

// Vẽ biển của ghế `seat`: tàu (nếu được thấy) + các phát đối thủ đã bắn vào.
function drawSea(root, seat) {
  const r = room;
  const fleet = r?.fleets?.[seat - 1] ?? null;
  const incoming = r?.shots?.[2 - seat] ?? [];
  const owner = new Map();
  fleet?.forEach((ship, k) => ship.forEach((i) => owner.set(i, k)));
  const last = r?.last && r.last.by !== seat ? r.last.i : -1;
  for (const c of $(`${root} .grid`).children) {
    const i = Number(c.dataset.i), v = incoming[i] ?? 0;
    if (v) c.dataset.v = v; else delete c.dataset.v;
    const k = owner.get(i);
    c.classList.toggle('ship', k !== undefined);
    c.classList.toggle('hitme', k !== undefined && v === 2);
    c.style.setProperty('--ship', k !== undefined ? SHIP_COLORS[k] : '');
    c.classList.toggle('last', i === last);
    c.classList.toggle('sel', sel >= 0 && k === sel && seat === mySeat() && canEdit());
  }
  // Hàng tàu: tàu nào đã chìm (ai cũng biết, không lộ vị trí).
  const sunk = r?.sunk?.[seat - 1] ?? [];
  $(`${root} .fleet`).replaceChildren(...(r && r.status !== 'lobby' ? FLEET.map((len, k) => {
    const pip = el('span', { className: `pip${sunk[k] ? ' sunk' : ''}`, title: `Tàu ${len} ô${sunk[k] ? ' — đã chìm' : ''}` },
      ...Array.from({ length: len }, () => el('i')));
    pip.style.setProperty('--ship', SHIP_COLORS[k]);
    return pip;
  }) : []));
}

function render() {
  const r = room;
  const me = mySeat();
  const a = me || 1, b = 3 - a;
  const placing = r?.status === 'placing';
  document.body.classList.toggle('placing', placing);
  drawSea('#seaA', a);
  drawSea('#seaB', b);
  const nm = (k) => r?.names?.[k - 1] || '…';
  $('#seaA figcaption').textContent = me ? 'Biển của bạn' : `Biển của ${nm(a)}`;
  $('#seaB figcaption').replaceChildren(...(me
    ? [iconEl('swords'), myTurn() ? 'Biển đối thủ — chạm để bắn' : `Biển của ${nm(b)}`]
    : [`Biển của ${nm(b)}`]));
  $('#seaB').hidden = placing;
  $('#seaB').classList.toggle('target', myTurn());
  $('#seaB').classList.toggle('aim', myTurn());

  // Xếp tàu
  $('#placeBar').hidden = !placing;
  if (!canEdit()) sel = -1;
  $('#seaA').classList.toggle('edit', canEdit());
  $('#btnRotate').disabled = sel < 0;
  if (placing) {
    const ready = me && r.ready[me - 1];
    const other = r.ready[(me || 1) % 2];
    $('#btnReroll').hidden = $('#btnReady').hidden = $('#btnRotate').hidden = !me || ready;
    $('#placeText').textContent = !me ? 'Hai bên đang xếp tàu…' : ready ? (other ? '' : `Chờ ${nm(3 - me)} xếp tàu…`)
      : 'Chạm tàu để chọn · chạm ô trống để dời · chạm lại để xoay';
  }

  // Thanh đối đầu
  for (const side of document.querySelectorAll('.side')) {
    const k = Number(side.dataset.seat);
    const lobby = r?.status === 'lobby';
    const id = lobby ? r.players[k - 1]?.id : r?.seats[k - 1];
    side.querySelector('b').textContent = lobby ? r.players[k - 1]?.name ?? 'Máy' : r?.names?.[k - 1] ?? '';
    side.querySelector('.sc').textContent = id ? r.score[id] ?? 0 : '';
    side.classList.toggle('turn', r?.status === 'playing' && r.turn === k);
    side.classList.toggle('me', !!id && id === deviceId);
  }

  const isHost = r?.host === deviceId;
  const ov = $('#overlay');
  const players = r?.players ?? [];
  if (!r) {
    ov.hidden = false;
    $('#ovTitle').textContent = 'Đang kết nối…';
    $('#ovText').textContent = '';
    $('#btnStart').hidden = true;
  } else if (r.status === 'playing' || placing) {
    ov.hidden = true;
  } else {
    ov.hidden = peek && r.status === 'ended';
    if (r.status === 'lobby') {
      $('#ovTitle').textContent = `Phòng ${code}`;
      const two = players.slice(0, 2).map((p) => p.name);
      $('#ovText').textContent = (two.length < 2 ? 'Chỉ có mình bạn — sẽ đấu với máy. Mời bạn bè bằng mã QR ở trên nhé.' : `${two[0]} đấu ${two[1]}.`)
        + (players.length > 2 ? ` ${players.length - 2} người xem.` : '') + (isHost ? '' : ' Chờ chủ phòng bắt đầu.');
    } else {
      const who = r.names[r.winner - 1];
      $('#ovTitle').replaceChildren(iconEl('trophy'), r.seats[r.winner - 1] === deviceId ? 'Bạn thắng!' : `${who} thắng`);
      const shots = r.fired[r.winner - 1];
      $('#ovText').textContent = `${r.why === 'timeout' ? 'Đối thủ bỏ lượt quá lâu. ' : `Đánh chìm hết tàu sau ${shots} phát. `}`
        + (isHost ? 'Ván mới đổi người bắn trước.' : 'Chờ chủ phòng mở ván mới.');
    }
    $('#btnStart').hidden = !isHost;
    $('#btnStart').textContent = r.status === 'lobby' ? 'Bắt đầu' : 'Ván mới';
  }
  $('#btnPeek').hidden = r?.status !== 'ended';
  $('#btnResult').hidden = !(r?.status === 'ended' && peek);
  fit();
}

// Đồng hồ lượt / xếp tàu (server là chuẩn, client chỉ hiển thị).
setInterval(() => {
  const r = room;
  const live = r?.status === 'playing' || r?.status === 'placing';
  const left = live ? Math.max(0, Math.ceil((r.deadline - Date.now() - clockOffset) / 1000)) : null;
  const bot = r?.status === 'playing' && r.seats[r.turn - 1] === 'bot';
  $('#clock').textContent = left == null ? 'VS' : bot ? '…' : `${left}s`;
  $('#clock').classList.toggle('low', left != null && !bot && left <= 5);
}, 250);
window.bt = { get room() { return room; } }; // cho test tự động

const initial = new URLSearchParams(location.search).get('r');
if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);

import { SIZES } from './logic.js';
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, addReroll } from '../names.js';
import { t, tx } from '../i18n.js';

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
const myName = () => $('#name').value.trim() || t('Người chơi', 'Player');
const botName = (n) => (n === 'Máy' ? t('Máy', 'Bot') : n);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PIECE = ['', 'x', 'circle'];
// Cảm xúc = icon lucide + màu; số lượng khớp EMO_COUNT ở worker (gửi theo chỉ số).
const EMOS = [['thumbs-up', '#1f6fd6'], ['laugh', '#e0a100'], ['frown', '#8a5cd6'], ['flame', '#ff7a3d'], ['heart', '#e0312f']];

let ws, code = null, room = null, clockOffset = 0, peek = false, built = '', seenLast = null;
const mySeat = () => (room?.seats.indexOf(deviceId) ?? -1) + 1;
const myTurn = () => room?.status === 'playing' && mySeat() === room.turn;
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? '';

// ---------- âm thanh (dùng lại bộ âm của Pikachu) ----------
let soundOn = store.get('cc.sound') !== '0';
const SND = Object.fromEntries(Object.entries({ move: 'sound2', start: 'sound4', win: 'sound5', lose: 'sound1' })
  .map(([k, f]) => [k, new Audio(`../pikachu/sound/${f}.mp3`)]));
function play(k) { if (!soundOn) return; SND[k].currentTime = 0; SND[k].play().catch(() => {}); }
function renderSound() { $('#btnSound').innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); }
$('#btnSound').onclick = () => { soundOn = !soundOn; store.set('cc.sound', soundOn ? '1' : '0'); renderSound(); };
renderSound();

// Kiểu quân (riêng từng máy): giấy X/O hoặc "đá" tròn kiểu papergames.
const applySkin = (s) => document.body.classList.toggle('skin-stone', s === 'stone');
applySkin(store.get('cc.skin'));
$('#btnSkin').onclick = () => {
  const s = document.body.classList.contains('skin-stone') ? 'paper' : 'stone';
  store.set('cc.skin', s);
  applySkin(s);
  toast(s === 'stone' ? t('Quân tròn', 'Round pieces') : t('Quân X / O trên giấy', 'Paper X / O pieces'), { icon: 'layers' });
};

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
  if (msg) toast.error(tx(msg));
}
function connect() {
  const q = new URLSearchParams({ id: deviceId, name: myName() });
  const sock = (ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/cc/room/${code}?${q}`));
  sock.onopen = () => $('#conn').classList.add('on');
  sock.onmessage = (e) => onMsg(JSON.parse(e.data));
  sock.onclose = (e) => {
    if (ws !== sock) return;
    $('#conn').classList.remove('on');
    if (e.code === 4000) return leave(t('Bạn đã mở phòng này ở tab/thiết bị khác', 'You opened this room on another tab/device'));
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
  if (m.status === 'playing' && was?.status !== 'playing') { peek = false; play('start'); }
  else if (m.status === 'playing' && was && m.moves > was.moves) play('move');
  if (was?.status === 'playing' && m.status === 'ended') {
    const seat = mySeat();
    const who = m.winner ? botName(m.names[m.winner - 1]) : '';
    if (!m.winner) toast(t('Hoà — kín bàn rồi!', 'Draw — board is full!'));
    else if (seat === m.winner) { play('win'); toast.success(m.why === 'timeout' ? t('Đối thủ hết giờ — bạn thắng!', "Opponent ran out of time — you win!") : t('Bạn thắng!', 'You win!'), { icon: 'trophy' }); }
    else if (seat) { play('lose'); toast.error(m.why === 'timeout' ? t('Hết giờ — bạn thua', 'Out of time — you lose') : t(`${who} thắng`, `${who} wins`)); }
    else { play('win'); toast(t(`${who} thắng`, `${who} wins`), { icon: 'trophy' }); }
  }
  render();
}

// ---------- nút ----------
$('#btnCreate').onclick = () => enter(Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''));
$('#btnJoin').onclick = () => {
  const c = $('#code').value.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(c)) enter(c); else toast.warning(t('Mã phòng gồm 4 ký tự', 'Room code is 4 characters'));
};
$('#code').onkeydown = (e) => e.key === 'Enter' && $('#btnJoin').click();
$('#btnLeave').onclick = () => leave();
$('#btnCopy').onclick = () => invite(`${location.origin}/co-caro/?r=${code}`, code);
$('#btnStart').onclick = () => send({ t: 'start' });
$('#btnPeek').onclick = () => { peek = true; render(); };
$('#btnResult').onclick = () => { peek = false; render(); };
// Nút chọn bàn: XO 3×3 đứng đầu (chỉ số trong SIZES giữ nguyên để khớp server).
const SIZE_ORDER = [2, 0, 1];
$('#sizePick').append(...SIZE_ORDER.map((i) => el('button', {
  textContent: SIZES[i] === 3 ? t('XO 3×3', 'Tic-tac-toe 3×3') : `${SIZES[i]}×${SIZES[i]}`, onclick: () => send({ t: 'config', size: i }),
})));
$('#blockPick input').onchange = (e) => send({ t: 'config', block: e.target.checked });
$('#emoBar').append(...EMOS.map(([name, color], i) => {
  const b = el('button', { title: t('Gửi cảm xúc', 'Send reaction'), onclick: () => send({ t: 'emo', e: i }) }, iconEl(name));
  b.style.color = color;
  return b;
}));
$('#board').onclick = (e) => {
  const c = e.target.closest('.c');
  if (!c || !myTurn() || room.board[c.dataset.i]) return;
  send({ t: 'move', i: Number(c.dataset.i) });
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
const MIN_CELL = 34; // nhỏ hơn thì khó chạm trúng trên điện thoại; bàn tràn thì kéo (#wrap cuộn)
function fit() {
  const n = SIZES[room?.size ?? 0];
  const w = $('#wrap');
  const s = Math.max(MIN_CELL, Math.min(120, Math.floor((Math.min(w.clientWidth, w.clientHeight) - 4) / n)));
  $('#board').style.gridTemplateColumns = `repeat(${n}, ${s}px)`;
  $('#board').style.gridAutoRows = `${s}px`;
}
const center = () => { const w = $('#wrap'); w.scrollTo((w.scrollWidth - w.clientWidth) / 2, (w.scrollHeight - w.clientHeight) / 2); };
new ResizeObserver(fit).observe($('#wrap'));

function render() {
  const r = room;
  const n = SIZES[r?.size ?? 0];
  const board = $('#board');
  if (built !== `${n}`) {
    built = `${n}`;
    board.replaceChildren(...Array.from({ length: n * n }, (_, i) => {
      const c = el('div', { className: 'c' });
      Object.assign(c.dataset, { i, v: 0 });
      return c;
    }));
    fit();
    center();
  }
  const cells = board.children;
  const cur = r?.board ?? [];
  const win = new Set(r?.line ?? []);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i], v = cur[i] ?? 0;
    if (c.dataset.v !== String(v)) {
      c.dataset.v = v;
      c.className = `c${v === 1 ? ' x' : v === 2 ? ' o' : ''}`;
      c.innerHTML = v ? icon(PIECE[v]) : '';
    }
    c.classList.toggle('last', i === r?.last && !win.size);
    c.classList.toggle('win', win.has(i));
  }
  const seat = mySeat();
  board.classList.toggle('mine', myTurn());
  board.classList.toggle('as-x', seat === 1);
  board.classList.toggle('as-o', seat === 2);
  // Nước mới nằm ngoài vùng đang xem (bàn to hơn màn) thì kéo tới.
  if (r?.last != null && r.last !== seenLast) cells[r.last]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  seenLast = r?.last;

  // Thanh đối đầu
  for (const side of document.querySelectorAll('.side')) {
    const k = Number(side.dataset.seat);
    // Sảnh chờ: hiện 2 người sẽ đấu (thiếu người thì là máy).
    const lobby = r?.status === 'lobby';
    const id = lobby ? r.players[k - 1]?.id : r?.seats[k - 1];
    if (!side.querySelector('.pc').firstChild) side.querySelector('.pc').append(iconEl(PIECE[k]));
    side.querySelector('b').textContent = lobby ? r.players[k - 1]?.name ?? t('Máy', 'Bot') : botName(r?.names?.[k - 1]) ?? '';
    side.querySelector('.sc').textContent = id ? r.score[id] ?? 0 : '';
    side.classList.toggle('turn', r?.status === 'playing' && r.turn === k);
    side.classList.toggle('me', !!id && id === deviceId);
  }

  const isHost = r?.host === deviceId;
  const ov = $('#overlay');
  const lobbyish = r && r.status !== 'playing';
  $('#sizePick').hidden = $('#blockPick').hidden = !lobbyish;
  [...$('#sizePick').children].forEach((b, k) => { b.classList.toggle('on', SIZE_ORDER[k] === r?.size); b.disabled = !isHost; });
  if (SIZES[r?.size] === 3) $('#blockPick').hidden = true; // luật chặn 2 đầu chỉ cho bàn lớn
  $('#blockPick input').checked = !!r?.block;
  $('#blockPick input').disabled = !isHost;
  const players = r?.players ?? [];
  if (!r) {
    ov.hidden = false;
    $('#ovTitle').textContent = t('Đang kết nối…', 'Connecting…');
    $('#ovText').textContent = '';
    $('#btnStart').hidden = true;
  } else if (r.status === 'playing') {
    ov.hidden = true;
  } else {
    ov.hidden = peek && r.status === 'ended';
    if (r.status === 'lobby') {
      $('#ovTitle').textContent = t(`Phòng ${code}`, `Room ${code}`);
      const two = players.slice(0, 2).map((p) => p.name);
      $('#ovText').textContent = (two.length < 2 ? t('Chỉ có mình bạn — sẽ đánh với máy. Mời bạn bè bằng mã QR ở trên nhé.', "Just you here — you'll play the bot. Invite friends with the QR code above.") : t(`${two[0]} đấu ${two[1]}.`, `${two[0]} vs ${two[1]}.`))
        + (players.length > 2 ? t(` ${players.length - 2} người xem.`, ` ${players.length - 2} watching.`) : '') + (isHost ? '' : t(' Chờ chủ phòng bắt đầu.', ' Waiting for the host to start.'));
    } else {
      const who = botName(r.names[r.winner - 1]);
      $('#ovTitle').replaceChildren(...(r.winner ? [iconEl('trophy'), r.seats[r.winner - 1] === deviceId ? t('Bạn thắng!', 'You win!') : t(`${who} thắng`, `${who} wins`)] : [t('Hoà!', 'Draw!')]));
      $('#ovText').textContent = `${r.why === 'timeout' ? t('Đối thủ hết giờ. ', 'Opponent ran out of time. ') : ''}${t(`${r.moves} nước.`, `${r.moves} moves.`)}` + (isHost ? t(' Ván mới đổi người đi trước.', ' New round, starting player alternates.') : t(' Chờ chủ phòng mở ván mới.', ' Waiting for the host to start a new round.'));
    }
    $('#btnStart').hidden = !isHost;
    $('#btnStart').textContent = r.status === 'lobby' ? t('Bắt đầu', 'Start') : t('Ván mới', 'New round');
  }
  $('#btnPeek').hidden = r?.status !== 'ended';
  $('#btnResult').hidden = !(r?.status === 'ended' && peek);
}

// Đồng hồ nước đi (server là chuẩn, client chỉ hiển thị).
setInterval(() => {
  const r = room;
  const left = r?.status === 'playing' ? Math.max(0, Math.ceil((r.deadline - Date.now() - clockOffset) / 1000)) : null;
  const bot = r && r.seats[r.turn - 1] === 'bot';
  $('#clock').textContent = left == null ? 'VS' : bot ? '…' : `${left}s`;
  $('#clock').classList.toggle('low', left != null && !bot && left <= 5);
}, 250);
window.cc = { get room() { return room; } }; // cho test tự động

const initial = new URLSearchParams(location.search).get('r');
if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);

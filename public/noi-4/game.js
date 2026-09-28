import { ROWS, COLS, drop, LEVELS } from './logic.js';
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, addReroll } from '../names.js';
import { t, tx } from '../i18n.js';
import { publicSwitch } from '../public-switch.js';

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
const LEVEL_EN = ['Easy', 'Normal', 'Hard'];

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Cảm xúc = icon lucide + màu; số lượng khớp EMO_COUNT ở worker (gửi theo chỉ số).
const EMOS = [['thumbs-up', '#1f6fd6'], ['laugh', '#e0a100'], ['frown', '#8a5cd6'], ['flame', '#ff7a3d'], ['heart', '#e0312f']];

let ws, code = null, room = null, clockOffset = 0, peek = false;
const mySeat = () => (room?.seats.indexOf(deviceId) ?? -1) + 1;
const myTurn = () => room?.status === 'playing' && mySeat() === room.turn;
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? '';

// ---------- âm thanh (dùng lại bộ âm của Pikachu) ----------
let soundOn = store.get('c4.sound') !== '0';
const SND = Object.fromEntries(Object.entries({ move: 'sound2', start: 'sound4', win: 'sound5', lose: 'sound1' })
  .map(([k, f]) => [k, new Audio(`../pikachu/sound/${f}.mp3`)]));
function play(k) { if (!soundOn) return; SND[k].currentTime = 0; SND[k].play().catch(() => {}); }
function renderSound() { $('#btnSound').innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); }
$('#btnSound').onclick = () => { soundOn = !soundOn; store.set('c4.sound', soundOn ? '1' : '0'); renderSound(); };
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
  if (msg) toast.error(tx(msg));
}
function connect() {
  const q = new URLSearchParams({ id: deviceId, name: myName() });
  const sock = (ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/c4/room/${code}?${q}`));
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
// Công tắc "Công khai" (hiện ở /phong/) trong thẻ sảnh chờ, ngay trên nút Bắt đầu.
const pub = publicSwitch(send);
$('#btnStart').before(pub.el);

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
  render(was);
}

// ---------- nút ----------
$('#btnCreate').onclick = () => enter(Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''));
$('#btnJoin').onclick = () => {
  const c = $('#code').value.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(c)) enter(c); else toast.warning(t('Mã phòng gồm 4 ký tự', 'Room code is 4 characters'));
};
$('#code').onkeydown = (e) => { if (e.key === 'Enter') $('#btnJoin').click(); };
$('#btnLeave').onclick = () => leave();
$('#btnCopy').onclick = () => invite(`${location.origin}/noi-4/?r=${code}`, code);
$('#btnStart').onclick = () => send({ t: 'start' });
$('#btnPeek').onclick = () => { peek = true; render(); };
$('#btnResult').onclick = () => { peek = false; render(); };
$('#levelPick').append(...LEVELS.map((l, i) => el('button', { textContent: t(`Máy ${l.name.toLowerCase()}`, `Bot ${LEVEL_EN[i].toLowerCase()}`), onclick: () => send({ t: 'config', level: i }) })));
$('#emoBar').append(...EMOS.map(([name, color], i) => {
  const b = el('button', { title: t('Gửi cảm xúc', 'Send reaction'), onclick: () => send({ t: 'emo', e: i }) }, iconEl(name));
  b.style.color = color;
  return b;
}));

// Bàn: bấm ô nào trong cột cũng là thả vào cột đó.
const board = $('#board');
board.append(...Array.from({ length: ROWS * COLS }, (_, i) => {
  const c = el('div', { className: 'c' });
  Object.assign(c.dataset, { i, c: i % COLS });
  return c;
}));
const cells = board.children;
board.onclick = (e) => {
  const c = e.target.closest('.c');
  if (!c || !myTurn() || drop(room.board, Number(c.dataset.c)) < 0) return;
  send({ t: 'move', i: Number(c.dataset.c) });
};
// Rê chuột: sáng cả cột (chỉ để nhìn, điện thoại thì chạm là thả luôn).
board.onpointermove = (e) => {
  const col = e.target.closest('.c')?.dataset.c;
  for (const c of cells) c.classList.toggle('hl', c.dataset.c === col);
};
board.onpointerleave = () => { for (const c of cells) c.classList.remove('hl'); };

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
function fit() {
  const w = $('#wrap');
  const s = Math.max(34, Math.min(88, Math.floor(Math.min((w.clientWidth - 16) / COLS, (w.clientHeight - 32) / ROWS))));
  board.style.gridTemplateColumns = `repeat(${COLS}, ${s}px)`;
  board.style.gridAutoRows = `${s}px`;
}
new ResizeObserver(fit).observe($('#wrap'));

function render(was) {
  const r = room;
  const cur = r?.board ?? [];
  const win = new Set(r?.line ?? []);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i], v = cur[i] ?? 0;
    if (c.dataset.v !== String(v)) {
      c.dataset.v = v;
      c.classList.remove('p1', 'p2');
      c.replaceChildren();
      if (v) {
        c.classList.add(`p${v}`);
        const d = el('div', { className: 'disc' });
        // Chỉ nước vừa đi mới rơi từ trên xuống; vào phòng giữa ván thì hiện luôn.
        if (i === r.last && was?.board && !was.board[i]) {
          const row = Math.floor(i / COLS) + 1;
          d.classList.add('drop');
          d.style.cssText = `--from:calc(-${row} * 100% - ${row * 22}%);--t:${0.18 + row * 0.06}s`;
        }
        c.append(d);
      }
    }
    c.classList.toggle('last', i === r?.last && !win.size);
    c.classList.toggle('win', win.has(i));
  }
  board.classList.toggle('mine', myTurn());

  // Thanh đối đầu
  for (const side of document.querySelectorAll('.side')) {
    const k = Number(side.dataset.seat);
    // Sảnh chờ: hiện 2 người sẽ đấu (thiếu người thì là máy).
    const lobby = r?.status === 'lobby';
    const id = lobby ? r.players[k - 1]?.id : r?.seats[k - 1];
    side.querySelector('b').textContent = lobby ? r.players[k - 1]?.name ?? t('Máy', 'Bot') : botName(r?.names?.[k - 1]) ?? '';
    side.querySelector('.sc').textContent = id ? r.score[id] ?? 0 : '';
    side.classList.toggle('turn', r?.status === 'playing' && r.turn === k);
    side.classList.toggle('me', !!id && id === deviceId);
  }

  const isHost = r?.host === deviceId;
  pub.update(r, isHost);
  const ov = $('#overlay');
  const players = r?.players ?? [];
  // Độ khó chỉ có nghĩa khi đánh với máy (phòng 1 người), chủ phòng chọn ở sảnh.
  const vsBot = r?.status === 'lobby' ? players.length < 2 : !!r?.seats?.includes('bot');
  $('#levelPick').hidden = !r || r.status === 'playing' || !vsBot;
  [...$('#levelPick').children].forEach((b, k) => { b.classList.toggle('on', k === (r?.level ?? 1)); b.disabled = !isHost; });
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
      $('#ovText').textContent = (two.length < 2 ? t('Chỉ có mình bạn — sẽ đánh với máy. Mời bạn bè bằng mã QR ở trên nhé.', "Just you here — you'll play the bot. Invite friends with the QR code above.") : t(`${two[0]} (đỏ) đấu ${two[1]} (vàng).`, `${two[0]} (red) vs ${two[1]} (yellow).`))
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
window.c4 = { get room() { return room; } }; // cho test tự động

const initial = new URLSearchParams(location.search).get('r');
if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);

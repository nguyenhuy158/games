import { ROWS, COLS, drop, LEVELS } from './logic.js';
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, addReroll, loadDeviceId } from '../names.js';
import { t, tx } from '../i18n.js';
import { roomClient, newRoomCode } from '../room-client.js';
import { publicSwitch } from '../public-switch.js';
import { replayParam, playReplay, replayLinks } from '../replay.js';
import { $, el, store } from '../dom.js';
import { mountHelp } from '../help.js';

hydrateIcons();

// Cùng danh tính thiết bị với các game khác (pk.id / pk.name).
let deviceId = loadDeviceId();
// Xem lại (?replay=<id>): xem như người ngoài, không vào phòng, không gửi gì.
const replay = replayParam();
if (replay) deviceId = 'replay';
$('#name').value = deviceName();
addReroll($('#name'));
const myName = () => $('#name').value.trim() || t('Người chơi', 'Player');
const botName = (n) => (n === 'Máy' ? t('Máy', 'Bot') : n);
const LEVEL_EN = ['Easy', 'Normal', 'Hard'];

// Cảm xúc = icon lucide + màu; số lượng khớp EMO_COUNT ở worker (gửi theo chỉ số).
const EMOS = [['thumbs-up', '#1f6fd6'], ['laugh', '#e0a100'], ['frown', '#8a5cd6'], ['flame', '#ff7a3d'], ['heart', '#e0312f']];

let code = null, room = null, clockOffset = 0, peek = false;
let quiet = false; // đang tua bản xem lại: không kêu, không toast, không bay cảm xúc
const mySeat = () => (room?.seats.indexOf(deviceId) ?? -1) + 1;
const myTurn = () => room?.status === 'playing' && mySeat() === room.turn;
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? '';

// ---------- âm thanh (dùng lại bộ âm của Pikachu) ----------
let soundOn = store.get('c4.sound') !== '0';
const SND = Object.fromEntries(Object.entries({ move: 'sound2', start: 'sound4', win: 'sound5', lose: 'sound1' })
  .map(([k, f]) => [k, new Audio(`../pikachu/sound/${f}.mp3`)]));
function play(k) { if (!soundOn || quiet) return; SND[k].currentTime = 0; SND[k].play().catch(() => {}); }
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
  net.open();
}
function leave(msg) {
  code = null;
  net.close();
  history.replaceState(null, '', location.pathname);
  $('#room').hidden = true;
  $('#home').hidden = false;
  if (msg) toast.error(tx(msg));
}
const net = roomClient({
  path: () => `/api/c4/room/${code}`, query: () => ({ id: deviceId, name: myName() }), onMsg, onLeave: leave, conn: $('#conn'),
});
const send = (m) => net.send(m);
// Công tắc "Công khai" (hiện ở /phong/) trong thẻ sảnh chờ, ngay trên nút Bắt đầu.
const pub = publicSwitch(send);
$('#btnStart').before(pub.el);
// Nút Xem lại / Chia sẻ ván vừa xong (server gắn result.rp vào tin state lúc kết thúc).
const links = el('div');
$('#ovText').after(links);
let linksRp = null;

function onMsg(m) {
  if (m.t === 'error') return leave(m.msg);
  if (m.t === 'emo') return quiet || emoFx(m.id, m.e);
  if (m.t !== 'state') return;
  const was = room;
  room = m;
  clockOffset = m.now - Date.now();
  if (m.status === 'playing' && was?.status !== 'playing') { peek = false; play('start'); }
  else if (m.status === 'playing' && was && m.moves > was.moves) play('move');
  if (!quiet && was?.status === 'playing' && m.status === 'ended') {
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
$('#btnCreate').onclick = () => enter(newRoomCode());
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
  pub.update(replay ? null : r, isHost);
  const ov = $('#overlay');
  const players = r?.players ?? [];
  // Độ khó chỉ có nghĩa khi đánh với máy (phòng 1 người), chủ phòng chọn ở sảnh.
  const vsBot = r?.status === 'lobby' ? players.length < 2 : !!r?.seats?.includes('bot');
  $('#levelPick').hidden = !r || r.status === 'playing' || !vsBot || !!replay;
  [...$('#levelPick').children].forEach((b, k) => { b.classList.toggle('on', k === (r?.level ?? 1)); b.disabled = !isHost; });
  if (!r) {
    ov.hidden = false;
    $('#ovTitle').textContent = replay ? t('Đang tải bản xem lại…', 'Loading replay…') : t('Đang kết nối…', 'Connecting…');
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
      $('#ovText').textContent = `${r.why === 'timeout' ? t('Đối thủ hết giờ. ', 'Opponent ran out of time. ') : ''}${t(`${r.moves} nước.`, `${r.moves} moves.`)}` + (isHost ? t(' Ván mới đổi người đi trước.', ' New round, starting player alternates.') : replay ? '' : t(' Chờ chủ phòng mở ván mới.', ' Waiting for the host to start a new round.'));
    }
    $('#btnStart').hidden = !isHost;
    $('#btnStart').textContent = r.status === 'lobby' ? t('Bắt đầu', 'Start') : t('Ván mới', 'New round');
  }
  const rp = !replay && r?.status === 'ended' ? r.result?.rp ?? null : null;
  if (rp !== linksRp) { linksRp = rp; links.replaceChildren(replayLinks(rp)); }
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
if (replay) {
  // Chỉ để xem: hiện bàn như người xem, bỏ mời / cảm xúc; nút quay lại về trang chủ game.
  $('#home').hidden = true;
  $('#room').hidden = false;
  $('#btnCopy').hidden = $('#emoBar').hidden = $('#conn').hidden = true;
  $('#btnLeave').onclick = () => { location.href = location.pathname; };
  render();
  playReplay(replay, {
    feed: onMsg,
    // Tua = dọn bàn rồi nạp lại từ đầu (đồng bộ), nên chỉ cần im lặng tới hết lượt JS này.
    reset: () => { quiet = true; setTimeout(() => { quiet = false; }); room = null; peek = false; render(); },
  }).then((rec) => { if (!rec?.frames?.length) $('#ovTitle').textContent = t('Không tìm thấy bản xem lại', 'Replay not found'); });
} else if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);

// Hộp "Cách chơi": nút ở trang chủ + trên thanh đầu phòng; lần đầu vào tự mở.
mountHelp({
  game: 'noi-4',
  button: '#btnHelpHome, #btnHelp',
  auto: !replay,
  content: {
    vi: {
      goal: 'Nối 4 quân cùng màu liền nhau theo hàng ngang, dọc hoặc chéo trước đối thủ.',
      play: [
        'Tạo phòng rồi mời bạn bằng mã 4 ký tự / mã QR; ở một mình thì bấm Bắt đầu để đánh với máy.',
        'Đánh với máy: chủ phòng chọn Máy dễ / thường / khó ở sảnh chờ.',
        '2 người vào đầu cầm quân, người sau chỉ xem. Đỏ luôn đi trước; ván mới hai bên đổi màu.',
        'Bàn 7 cột × 6 hàng: thả quân vào một cột, quân rơi xuống ô trống thấp nhất; cột đầy thì không thả được.',
        'Mỗi nước tối đa 30 giây — hết giờ là thua ván.',
        'Kín bàn mà chưa ai nối được 4 thì hoà.',
      ],
      keys: [
        'Tới lượt: bấm vào ô bất kỳ trong một cột để thả quân vào cột đó (rê chuột thì cả cột sáng lên).',
        'Hết ván: Xem bàn để nhìn lại thế cờ, Kết quả để quay về bảng kết quả.',
      ],
      touch: [
        'Chạm vào ô bất kỳ của một cột là thả quân luôn.',
        'Thanh dưới cùng: chạm để gửi cảm xúc cho cả phòng.',
      ],
      tips: [
        'Giành cột giữa: nhiều đường nối 4 đi qua nó nhất.',
        'Trước mỗi nước, xem đối thủ có sắp nối 4 không để chặn.',
        'Tạo 2 đường doạ thắng cùng lúc, đối thủ chỉ chặn được một.',
        'Cẩn thận ô ngay phía trên nước bạn đi: có thể đang mở chỗ thắng cho đối thủ.',
      ],
    },
    en: {
      goal: 'Connect 4 of your pieces in a row — horizontal, vertical or diagonal — before your opponent.',
      play: [
        'Create a room and invite a friend with the 4-character code / QR; alone, press Start to play the bot.',
        'Against the bot, the host picks Bot easy / normal / hard in the lobby.',
        'The first 2 people in hold the pieces, the rest watch. Red always moves first; colours swap each round.',
        '7 columns × 6 rows: drop a piece into a column and it falls to the lowest empty cell; full columns are blocked.',
        'Each move has 30 seconds max — run out of time and you lose the round.',
        'If the board fills up with no 4 in a row, it is a draw.',
      ],
      keys: [
        'On your turn, click any cell in a column to drop into that column (hovering highlights the column).',
        'After a round: View board to look at the final position, Result to return to the result card.',
      ],
      touch: [
        'Tap any cell of a column to drop a piece there right away.',
        'Bottom bar: tap to send a reaction to the room.',
      ],
      tips: [
        'Take the centre column: the most lines of 4 pass through it.',
        'Before every move, check whether your opponent is about to connect 4 and block it.',
        'Set up 2 winning threats at once — your opponent can only block one.',
        'Watch the cell right above your move: you may be opening a winning spot for your opponent.',
      ],
    },
  },
});

import { SIZES } from './logic.js';
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

const PIECE = ['', 'x', 'circle'];
// Cảm xúc = icon lucide + màu; số lượng khớp EMO_COUNT ở worker (gửi theo chỉ số).
const EMOS = [['thumbs-up', '#1f6fd6'], ['laugh', '#e0a100'], ['frown', '#8a5cd6'], ['flame', '#ff7a3d'], ['heart', '#e0312f']];

let code = null, room = null, clockOffset = 0, peek = false, built = '', seenLast = null;
let quiet = false; // đang tua bản xem lại: không kêu, không toast, không bay cảm xúc
const mySeat = () => (room?.seats.indexOf(deviceId) ?? -1) + 1;
const myTurn = () => room?.status === 'playing' && mySeat() === room.turn;
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? '';

// ---------- âm thanh (dùng lại bộ âm của Pikachu) ----------
let soundOn = store.get('cc.sound') !== '0';
const SND = Object.fromEntries(Object.entries({ move: 'sound2', start: 'sound4', win: 'sound5', lose: 'sound1' })
  .map(([k, f]) => [k, new Audio(`../pikachu/sound/${f}.mp3`)]));
function play(k) { if (!soundOn || quiet) return; SND[k].currentTime = 0; SND[k].play().catch(() => {}); }
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
  path: () => `/api/cc/room/${code}`, query: () => ({ id: deviceId, name: myName() }), onMsg, onLeave: leave, conn: $('#conn'),
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
  render();
}

// ---------- nút ----------
$('#btnCreate').onclick = () => enter(newRoomCode());
$('#btnJoin').onclick = () => {
  const c = $('#code').value.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(c)) enter(c); else toast.warning(t('Mã phòng gồm 4 ký tự', 'Room code is 4 characters'));
};
$('#code').onkeydown = (e) => { if (e.key === 'Enter') $('#btnJoin').click(); };
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
  pub.update(replay ? null : r, isHost);
  const ov = $('#overlay');
  const lobbyish = r && r.status !== 'playing';
  $('#sizePick').hidden = $('#blockPick').hidden = !lobbyish || !!replay;
  [...$('#sizePick').children].forEach((b, k) => { b.classList.toggle('on', SIZE_ORDER[k] === r?.size); b.disabled = !isHost; });
  if (SIZES[r?.size] === 3) $('#blockPick').hidden = true; // luật chặn 2 đầu chỉ cho bàn lớn
  $('#blockPick input').checked = !!r?.block;
  $('#blockPick input').disabled = !isHost;
  const players = r?.players ?? [];
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
      $('#ovText').textContent = (two.length < 2 ? t('Chỉ có mình bạn — sẽ đánh với máy. Mời bạn bè bằng mã QR ở trên nhé.', "Just you here — you'll play the bot. Invite friends with the QR code above.") : t(`${two[0]} đấu ${two[1]}.`, `${two[0]} vs ${two[1]}.`))
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
window.cc = { get room() { return room; } }; // cho test tự động

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
  game: 'co-caro',
  button: '#btnHelpHome, #btnHelp',
  auto: !replay,
  content: {
    vi: {
      goal: 'Xếp 5 quân của mình liền nhau theo hàng ngang, dọc hoặc chéo (XO 3×3: chỉ cần 3).',
      play: [
        'Tạo phòng rồi mời bạn bằng mã 4 ký tự / mã QR; ở một mình thì bấm Bắt đầu để đánh với máy.',
        'Ở sảnh chờ chủ phòng chọn bàn: XO 3×3, 15×15 (mặc định) hoặc 19×19.',
        'Luật chặn 2 đầu (tuỳ chọn, bàn 15×15 / 19×19): dãy bị quân đối thủ chặn cả 2 đầu không tính thắng.',
        '2 người vào đầu cầm quân, người sau chỉ xem. X luôn đi trước; ván mới hai bên đổi quân.',
        'Dãy từ 5 quân trở lên là thắng. Mỗi nước tối đa 30 giây — hết giờ là thua.',
        'Kín bàn mà chưa ai thắng thì hoà.',
      ],
      keys: [
        'Tới lượt: bấm ô trống để đặt quân (rê chuột thấy mờ quân của bạn).',
        'Nút lớp trên thanh đầu: đổi kiểu quân X/O giấy hoặc quân tròn, chỉ trên máy bạn.',
      ],
      touch: [
        'Chạm ô trống để đặt quân.',
        'Bàn to hơn màn hình (như 19×19 trên điện thoại): vuốt để kéo bàn; nước mới tự cuộn tới.',
      ],
      tips: [
        'Dãy 4 hở cả 2 đầu là thắng chắc: đối thủ chỉ chặn được một đầu.',
        'Thấy đối thủ có dãy 3 hở 2 đầu thì chặn ngay.',
        'Luật chặn 2 đầu: dãy cần ít nhất 1 đầu không bị quân đối thủ chặn (sát mép bàn vẫn tính).',
        'XO 3×3: máy đánh không bao giờ thua, giỏi lắm là hoà.',
      ],
    },
    en: {
      goal: 'Line up 5 of your pieces in a row — horizontal, vertical or diagonal (Tic-tac-toe 3×3: just 3).',
      play: [
        'Create a room and invite a friend with the 4-character code / QR; alone, press Start to play the bot.',
        'In the lobby the host picks the board: Tic-tac-toe 3×3, 15×15 (default) or 19×19.',
        "Blocked-ends rule (optional, 15×15 / 19×19): a line capped by opponent pieces at both ends doesn't win.",
        'The first 2 people in hold the pieces, the rest watch. X always moves first; pieces swap each round.',
        'A line of 5 or more wins. Each move has 30 seconds max — run out of time and you lose.',
        'If the board fills up with no winner, it is a draw.',
      ],
      keys: [
        'On your turn, click an empty cell to place a piece (hovering previews your piece).',
        'Layers button in the header: switch between paper X/O and round pieces, on your device only.',
      ],
      touch: [
        'Tap an empty cell to place a piece.',
        'Board bigger than the screen (e.g. 19×19 on a phone): swipe to pan; new moves scroll into view.',
      ],
      tips: [
        'An open four (both ends empty) is a sure win: your opponent can block only one end.',
        'Block any open three (both ends empty) from your opponent right away.',
        'Blocked-ends rule: a line needs at least one end not capped by an opponent piece (a board edge is fine).',
        'Tic-tac-toe 3×3: the bot never loses — a draw is the best you can get.',
      ],
    },
  },
});

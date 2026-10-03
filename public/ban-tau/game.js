import { N, FLEET, shipAt, validFleet } from './logic.js';
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
$('#name').value = deviceName();
addReroll($('#name'));
const myName = () => $('#name').value.trim() || t('Người chơi', 'Player');

const SHIP_COLORS = ['#e8716f', '#7c83d6', '#4fb3ea', '#4aa89a', '#b06ad6'];
// Cảm xúc = icon lucide + màu; số lượng khớp EMO_COUNT ở worker (gửi theo chỉ số).
const EMOS = [['thumbs-up', '#1f6fd6'], ['laugh', '#e0a100'], ['frown', '#8a5cd6'], ['flame', '#ff7a3d'], ['heart', '#e0312f']];

let code = null, room = null, clockOffset = 0, peek = false, sel = -1;
// Xem lại (?replay=<id>): chỉ xem (góc nhìn ghế 1), không mở WebSocket; quiet = đang tua thì tắt tiếng + toast.
const rp = replayParam();
let quiet = false;
const mySeat = () => (room?.seats.indexOf(deviceId) ?? -1) + 1;
const myTurn = () => room?.status === 'playing' && mySeat() === room.turn;
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? '';
// Tên máy do server gửi cố định 'Máy' (dùng chung với logic/test) — dịch lúc hiển thị.
const showName = (n) => (n === 'Máy' ? t('Máy', 'Bot') : n);

// ---------- âm thanh (dùng lại âm của Pikachu / Đào Vàng) ----------
let soundOn = store.get('bt.sound') !== '0';
const SND = Object.fromEntries(Object.entries({
  miss: '../pikachu/sound/sound2.mp3', hit: '../dao-vang/assets/audio/boom.m4a', start: '../pikachu/sound/sound4.mp3',
  win: '../pikachu/sound/sound5.mp3', lose: '../pikachu/sound/sound1.mp3',
}).map(([k, f]) => [k, new Audio(f)]));
function play(k) { if (!soundOn || quiet) return; SND[k].currentTime = 0; SND[k].play().catch(() => {}); }
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
  net.open();
}
function leave(msg) {
  code = null;
  net.close();
  history.replaceState(null, '', location.pathname);
  $('#room').hidden = true;
  $('#home').hidden = false;
  if (msg) toast.error(msg);
}
const net = roomClient({
  path: () => `/api/bt/room/${code}`, query: () => ({ id: deviceId, name: myName() }), onMsg, onLeave: leave, conn: $('#conn'),
});
const send = (m) => !rp && net.send(m);
// Công tắc "Công khai" (hiện ở /phong/) trong thẻ sảnh chờ, ngay trên nút Bắt đầu.
const pub = publicSwitch(send);
$('#btnStart').before(pub.el);
// Nút "Xem lại / Chia sẻ" ở thẻ kết quả: giữ nguyên phần tử giữa các lần vẽ (khỏi mất chữ "Đã chép link").
const rpHold = el('div');
$('#ovText').after(rpHold);
let links = null;
const linksOf = (id) => {
  if (links?.dataset.rp !== id) { links = replayLinks(id); links.dataset.rp = id; }
  return links;
};

function onMsg(m) {
  if (m.t === 'error') return leave(tx(m.msg));
  if (m.t === 'emo') return emoFx(m.id, m.e);
  if (m.t !== 'state') return;
  const was = room;
  room = m;
  clockOffset = m.now - Date.now();
  if (m.status === 'placing' && was?.status !== 'placing') peek = false;
  if (m.status === 'playing' && was?.status !== 'playing') play('start');
  const shot = m.last && JSON.stringify(m.last) !== JSON.stringify(was?.last) ? m.last : null;
  if (shot && m.status !== 'placing' && !quiet) {
    play(shot.hit ? 'hit' : 'miss');
    if (shot.sunk >= 0) {
      const mine = shot.by !== mySeat() && mySeat();
      toast(mine ? t(`Tàu ${FLEET[shot.sunk]} ô của bạn bị đánh chìm!`, `Your ${FLEET[shot.sunk]}-cell ship was sunk!`)
        : t(`Đánh chìm tàu ${FLEET[shot.sunk]} ô!`, `Sunk a ${FLEET[shot.sunk]}-cell ship!`), { icon: 'flame' });
    }
  }
  if (was?.status === 'playing' && m.status === 'ended' && !quiet) {
    const seat = mySeat();
    const who = showName(m.names[m.winner - 1]);
    if (seat === m.winner) { play('win'); toast.success(m.why === 'timeout' ? t('Đối thủ bỏ lượt quá lâu — bạn thắng!', 'Opponent took too long — you win!') : t('Bạn đánh chìm hết tàu — thắng rồi!', 'You sank the whole fleet — you win!'), { icon: 'trophy' }); }
    else if (seat) { play('lose'); toast.error(m.why === 'timeout' ? t('Bỏ lượt 3 lần — bạn thua', 'Skipped 3 turns — you lose') : t(`${who} thắng`, `${who} wins`)); }
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
$('#btnCopy').onclick = () => invite(`${location.origin}/ban-tau/?r=${code}`, code);
$('#btnStart').onclick = () => send({ t: 'start' });
$('#btnReroll').onclick = () => { sel = -1; send({ t: 'reroll' }); };
$('#btnRotate').onclick = () => rotate(sel);
$('#btnReady').onclick = () => send({ t: 'ready' });
$('#btnPeek').onclick = () => { peek = true; render(); };
$('#btnResult').onclick = () => { peek = false; render(); };
$('#emoBar').append(...EMOS.map(([name, color], i) => {
  const b = el('button', { title: t('Gửi cảm xúc', 'Send reaction'), onclick: () => send({ t: 'emo', e: i }) }, iconEl(name));
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
  toast.warning(t('Không đặt được — tàu phải nằm trong biển và không sát tàu khác', "Can't place there — ship must stay in the sea and not touch another ship"));
}
function rotate(k) {
  if (!canEdit() || k < 0) return;
  const ship = myFleet()[k], down = !isDown(ship), len = ship.length, step = down ? N : 1;
  // Xoay quanh đầu tàu trước; tràn mép / sát tàu khác thì thử lấy lần lượt từng ô của tàu làm trục, chỗ nào hợp lệ đầu tiên thì lấy.
  for (const pivot of ship) for (let o = 0; o < len; o++) {
    const head = pivot - o * step;
    if (head < 0 || (!down && Math.floor(head / N) !== Math.floor(pivot / N))) continue;
    const cells = shipAt(head, len, down);
    if (cells && validFleet(myFleet().map((s, j) => (j === k ? cells : s)))) return tryPlace(k, cells);
  }
  tryPlace(k, null);
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
    const pip = el('span', { className: `pip${sunk[k] ? ' sunk' : ''}`, title: t(`Tàu ${len} ô${sunk[k] ? ' — đã chìm' : ''}`, `${len}-cell ship${sunk[k] ? ' — sunk' : ''}`) },
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
  const nm = (k) => showName(r?.names?.[k - 1]) || '…';
  $('#seaA figcaption').textContent = me ? t('Biển của bạn', 'Your sea') : t(`Biển của ${nm(a)}`, `${nm(a)}'s sea`);
  $('#seaB figcaption').replaceChildren(...(me
    ? [iconEl('swords'), myTurn() ? t('Biển đối thủ — chạm để bắn', "Opponent's sea — tap to fire") : t(`Biển của ${nm(b)}`, `${nm(b)}'s sea`)]
    : [t(`Biển của ${nm(b)}`, `${nm(b)}'s sea`)]));
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
    $('#placeText').textContent = !me ? t('Hai bên đang xếp tàu…', 'Both sides are placing ships…') : ready ? (other ? '' : t(`Chờ ${nm(3 - me)} xếp tàu…`, `Waiting for ${nm(3 - me)} to place ships…`))
      : t('Chạm tàu để chọn · chạm ô trống để dời · chạm lại để xoay', 'Tap a ship to select · tap an empty cell to move it · tap again to rotate');
  }

  // Thanh đối đầu
  for (const side of document.querySelectorAll('.side')) {
    const k = Number(side.dataset.seat);
    const lobby = r?.status === 'lobby';
    const id = lobby ? r.players[k - 1]?.id : r?.seats[k - 1];
    side.querySelector('b').textContent = showName(lobby ? r.players[k - 1]?.name ?? 'Máy' : r?.names?.[k - 1] ?? '');
    side.querySelector('.sc').textContent = id ? r.score[id] ?? 0 : '';
    side.classList.toggle('turn', r?.status === 'playing' && r.turn === k);
    side.classList.toggle('me', !!id && id === deviceId);
  }

  const isHost = r?.host === deviceId;
  pub.update(r, isHost);
  const ov = $('#overlay');
  const players = r?.players ?? [];
  if (!r) {
    ov.hidden = false;
    $('#ovTitle').textContent = t('Đang kết nối…', 'Connecting…');
    $('#ovText').textContent = '';
    $('#btnStart').hidden = true;
  } else if (r.status === 'playing' || placing) {
    ov.hidden = true;
  } else {
    ov.hidden = peek && r.status === 'ended';
    if (r.status === 'lobby') {
      $('#ovTitle').textContent = t(`Phòng ${code}`, `Room ${code}`);
      const two = players.slice(0, 2).map((p) => p.name);
      $('#ovText').textContent = (two.length < 2 ? t('Chỉ có mình bạn — sẽ đấu với máy. Mời bạn bè bằng mã QR ở trên nhé.', "It's just you — you'll play the bot. Invite friends with the QR code above.") : t(`${two[0]} đấu ${two[1]}.`, `${two[0]} vs ${two[1]}.`))
        + (players.length > 2 ? t(` ${players.length - 2} người xem.`, ` ${players.length - 2} watching.`) : '') + (isHost ? '' : t(' Chờ chủ phòng bắt đầu.', ' Waiting for the host to start.'));
      rpHold.replaceChildren();
    } else {
      const who = showName(r.names[r.winner - 1]);
      $('#ovTitle').replaceChildren(iconEl('trophy'), r.seats[r.winner - 1] === deviceId ? t('Bạn thắng!', 'You win!') : t(`${who} thắng`, `${who} wins`));
      const shots = r.fired[r.winner - 1];
      $('#ovText').textContent = (r.why === 'timeout' ? t('Đối thủ bỏ lượt quá lâu. ', 'Opponent took too long. ') : t(`Đánh chìm hết tàu sau ${shots} phát. `, `Sank the whole fleet in ${shots} shots. `))
        + (rp ? '' : isHost ? t('Ván mới đổi người bắn trước.', 'New game — the first shot swaps sides.') : t('Chờ chủ phòng mở ván mới.', 'Waiting for the host to start a new game.'));
      rpHold.replaceChildren(...(r.result?.rp && !rp ? [linksOf(r.result.rp)] : []));
    }
    $('#btnStart').hidden = !isHost;
    $('#btnStart').textContent = r.status === 'lobby' ? t('Bắt đầu', 'Start') : t('Ván mới', 'New game');
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

if (rp) {
  // Người xem: không cầm ghế nào (biển trái = ghế 1), ẩn nút rời / mời / cảm xúc; bấm biển không gửi gì.
  deviceId = '';
  $('#home').hidden = true;
  $('#room').hidden = false;
  for (const s of ['#btnLeave', '#btnCopy', '#conn']) $(s).hidden = true;
  $('#emoBar').style.visibility = 'hidden'; // giữ chỗ cho thanh tua của replay.js
  pub.el.remove();
  render();
  playReplay(rp, {
    feed: onMsg,
    reset: () => { quiet = true; setTimeout(() => { quiet = false; }); room = null; peek = false; render(); },
  });
} else {
  const initial = new URLSearchParams(location.search).get('r');
  if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);
}

// Hộp "Cách chơi": nút ở trang chủ + trên thanh đầu phòng; lần đầu vào tự mở.
mountHelp({
  game: 'ban-tau',
  button: '#btnHelpHome, #btnHelp',
  auto: !rp,
  content: {
    vi: {
      goal: 'Đánh chìm cả 5 tàu của đối thủ trước khi họ đánh chìm hết tàu của bạn.',
      play: [
        'Tạo phòng rồi mời bạn bằng mã 4 ký tự / mã QR; ở một mình thì bấm Bắt đầu để đấu với máy.',
        '2 người vào đầu cầm hạm đội, người sau chỉ xem. Chủ phòng bấm Bắt đầu.',
        'Biển 10×10, 5 tàu dài 5, 4, 3, 3, 2 ô, nằm ngang hoặc dọc, không sát nhau (kể cả chéo).',
        'Có 60 giây xếp tàu: tàu xếp sẵn ngẫu nhiên, đổi tuỳ ý rồi bấm Sẵn sàng; hết giờ thì vào trận luôn.',
        'Thay phiên bắn vào biển đối thủ: trúng thì được bắn tiếp, trượt thì mất lượt.',
        'Mỗi lượt 30 giây; hết giờ sẽ bị bắn giùm 1 phát ngẫu nhiên, 3 lần liền như vậy là thua.',
        'Ván mới đổi người bắn trước; tỉ số tính theo cặp đấu.',
      ],
      keys: [
        'Xếp tàu: bấm tàu để chọn, bấm lại (hoặc nút Xoay) để xoay, bấm ô trống để dời tàu tới đó.',
        'Xếp lại = xếp ngẫu nhiên mới. Đánh: bấm ô chưa bắn trên biển đối thủ (có viền màu).',
      ],
      touch: [
        'Như chuột: chạm tàu để chọn / xoay, chạm ô trống để dời, chạm biển đối thủ để bắn.',
        'Thanh dưới cùng: chạm để gửi cảm xúc cho cả phòng.',
      ],
      tips: [
        'Trúng rồi thì bắn 4 ô kề bên để lần ra hướng tàu, rồi bắn nối dài theo hướng đó.',
        'Tàu chìm thì các ô quanh nó tự đánh dấu trượt, vì tàu không bao giờ sát nhau.',
        'Tìm tàu: bắn cách ô kiểu bàn cờ, tàu ngắn nhất 2 ô không lọt được.',
      ],
    },
    en: {
      goal: "Sink all 5 of your opponent's ships before they sink all of yours.",
      play: [
        'Create a room and invite a friend with the 4-character code / QR; alone, press Start to play the bot.',
        'The first 2 people in hold fleets, the rest watch. The host presses Start.',
        '10×10 sea, 5 ships of 5, 4, 3, 3, 2 cells, horizontal or vertical, never touching (even diagonally).',
        'You get 60 seconds to place: ships start shuffled, adjust them, then press Ready; at time-out play begins.',
        "Take turns firing at the opponent's sea: a hit lets you fire again, a miss passes the turn.",
        'Each turn is 30 seconds; time out and a random shot is fired for you — 3 in a row and you lose.',
        'Each new game swaps who fires first; the score is kept per pair of players.',
      ],
      keys: [
        'Placing: click a ship to select it, click it again (or Rotate) to rotate, click an empty cell to move it.',
        "Reshuffle = new random layout. Battle: click an unfired cell on the opponent's (outlined) sea.",
      ],
      touch: [
        "Same as mouse: tap a ship to select / rotate, tap an empty cell to move, tap the opponent's sea to fire.",
        'Bottom bar: tap to send a reaction to the room.',
      ],
      tips: [
        "After a hit, try the 4 neighbouring cells to find the ship's direction, then follow that line.",
        'A sunk ship marks its surrounding cells as misses, since ships never touch.',
        'Hunting: fire in a checkerboard pattern — the smallest ship (2 cells) cannot slip through.',
      ],
    },
  },
});
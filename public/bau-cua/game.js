import { SYMBOLS, CHIPS, betTotal } from './logic.js';
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, addReroll, loadDeviceId } from '../names.js';
import { t, tx, en } from '../i18n.js';
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

const COLORS = ['#5cc8ff', '#ff7ab6', '#7dff9a', '#ffb454', '#c49bff', '#ffe66b', '#6bf0e0', '#ff9b9b', '#b8f07a', '#f0a6ff'];
const CHIP_COLORS = { 10: '#2f7de1', 50: '#1d9a55', 100: '#d6452f', 500: '#1b1b1b' };
const MODE_TEXT = { rotate: ['crown', t(' Xoay cái', ' Rotating dealer')], house: ['bot', t(' Máy làm cái', ' Bot dealer')] };
// Tên con vật: logic.js dùng chung với server nên dịch lúc hiện.
const NAME_EN = { nai: 'Deer', bau: 'Gourd', ga: 'Rooster', ca: 'Fish', cua: 'Crab', tom: 'Shrimp' };
const nm = (s) => t(s.name, NAME_EN[s.key]);

let code = null, room = null, clockOffset = 0, shown = 0;
// Xem lại (?replay=<id>): chỉ xem, không mở WebSocket; quiet = đang tua (feed dồn dập) thì tắt tiếng + toast.
const rp = replayParam();
let quiet = false;
let chip = Number(store.get('bc.chip')) || CHIPS[1];
if (!CHIPS.includes(chip)) chip = CHIPS[1];

// Hình cắt từ tờ bầu cua in dân gian (xem README).
const pic = (s, cls = '') => {
  const img = el('img', { className: cls, src: `assets/${s.key}.webp`, alt: nm(s), draggable: false });
  // Ảnh không tải được (mất mạng, chưa cache): thay bằng huy hiệu chữ cùng cỡ thay vì icon ảnh vỡ.
  img.onerror = () => img.replaceWith(el('span', { className: `${cls} pic-fb`, textContent: nm(s) }));
  return img;
};
const now = () => Date.now() + clockOffset;
const me = () => room?.players.find((p) => p.id === deviceId);
const colorOf = (id) => COLORS[Math.max(0, room?.players.findIndex((p) => p.id === id) ?? 0) % COLORS.length];
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? t('Người cũ', 'Former player');
const revealed = () => room?.phase === 'show' && now() - room.phaseAt >= room.shakeMs;
const canRoll = () => room?.phase === 'bet' && (room.dealer ? room.dealer === deviceId : room.host === deviceId) || afk();
const afk = () => room?.phase === 'bet' && now() - room.phaseAt > room.afkMs;
const anyBet = () => Object.entries(room?.bets ?? {}).some(([id, b]) => id !== room.dealer && betTotal(b));
const LOCALE = en ? 'en-US' : 'vi-VN';
const xu = (n) => `${n.toLocaleString(LOCALE)} ${t('xu', 'coins')}`;
const signed = (n) => (n > 0 ? `+${n.toLocaleString(LOCALE)}` : n.toLocaleString(LOCALE));

// ---------- âm thanh (dùng lại bộ âm của Pikachu) ----------
let soundOn = store.get('bc.sound') !== '0';
const SND = Object.fromEntries(Object.entries({ chip: 'sound2', shake: 'sound4', win: 'sound5', lose: 'sound1' })
  .map(([k, f]) => [k, new Audio(`../pikachu/sound/${f}.mp3`)]));
function play(k) { if (!soundOn || quiet) return; SND[k].currentTime = 0; SND[k].play().catch(() => {}); }
function renderSound() { $('#btnSound').innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); }
$('#btnSound').onclick = () => { soundOn = !soundOn; store.set('bc.sound', soundOn ? '1' : '0'); renderSound(); };
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
  if (msg) toast(tx(msg));
}
const net = roomClient({
  path: () => `/api/bc/room/${code}`, query: () => ({ id: deviceId, name: myName() }), onMsg, onLeave: leave, conn: $('#conn'),
});
const send = (m) => !rp && net.send(m);
// Công tắc "Công khai" (hiện ở /phong/): Bầu cua không có sảnh chờ nên để trên thanh đầu, cạnh nút làm cái.
const pub = publicSwitch(send);
$('#btnMode').after(pub.el);

function onMsg(m) {
  if (m.t === 'error') return leave(m.msg);
  if (m.t !== 'state') return;
  if (room && room.mode !== m.mode && !quiet) toast(m.mode === 'house' ? t('Chủ phòng đổi: máy làm cái, ai cũng được đặt', 'Host switched: the bot is dealer, everyone can bet') : t('Chủ phòng đổi: làm cái xoay vòng', 'Host switched: dealer rotates'), { icon: m.mode === 'house' ? 'bot' : 'crown' });
  room = m;
  clockOffset = m.now - Date.now();
  // Ván vừa mở bát: lắc bát, hết giờ lắc thì lật bát + báo thắng thua.
  if (m.phase === 'show' && shown !== m.phaseAt) {
    shown = m.phaseAt;
    const wait = m.shakeMs - (now() - m.phaseAt);
    if (wait > 0) play('shake');
    setTimeout(() => {
      render();
      const d = m.deltas?.[deviceId];
      if (d) { play(d > 0 ? 'win' : 'lose'); d > 0 ? toast.success(t(`Bạn ăn ${xu(d)}`, `You won ${xu(d)}`), { icon: 'party-popper' }) : toast.error(t(`Bạn mất ${xu(-d)}`, `You lost ${xu(-d)}`), { icon: 'frown' }); }
    }, Math.max(0, wait));
  }
  render();
}

// ---------- nút ----------
$('#btnCreate').onclick = () => enter(newRoomCode());
$('#btnJoin').onclick = () => {
  const c = $('#code').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(c)) return toast.warning(t('Mã phòng gồm 4 ký tự', 'Room codes have 4 characters'));
  enter(c);
};
$('#code').onkeydown = (e) => { if (e.key === 'Enter') $('#btnJoin').click(); };
$('#btnLeave').onclick = () => leave();
$('#btnCopy').onclick = () => invite(`${location.origin}/bau-cua/?r=${code}`, code);
$('#btnMode').onclick = () => send({ t: 'mode', mode: room?.mode === 'rotate' ? 'house' : 'rotate' });
$('#btnClear').onclick = () => send({ t: 'unbet' });
$('#btnRoll').onclick = () => send({ t: 'roll' });

$('#chips').append(...CHIPS.map((c) => {
  const b = el('button', { className: 'chip', textContent: c, title: t(`Phỉnh ${c} xu`, `${c}-coin chip`) });
  b.style.setProperty('--cc', CHIP_COLORS[c]);
  b.onclick = () => { chip = c; store.set('bc.chip', c); render(); };
  return b;
}));
$('#board').append(...SYMBOLS.map((s, i) => {
  const c = el('div', { className: 'cell', title: t(`Đặt vào ${s.name} (chuột phải / giữ để bỏ)`, `Bet on ${nm(s)} (right-click / hold to remove)`) },
    pic(s, 'em'), el('span', { className: 'nm', textContent: nm(s).toUpperCase() }),
    el('span', { className: 'x' }), el('div', { className: 'stack' }));
  c.onclick = () => bet(i);
  c.oncontextmenu = (e) => { e.preventDefault(); send({ t: 'unbet', s: i }); };
  return c;
}));

function bet(i) {
  if (!room || rp) return;
  if (room.phase !== 'bet') return toast(t('Đang mở bát, chờ ván sau nhé', 'Bowl is open — wait for the next round'));
  if (room.dealer === deviceId) return toast(t('Bạn đang làm cái — ngồi chờ ăn tiền thôi', 'You are the dealer — sit back and collect'), { icon: 'crown' });
  const left = (me()?.coins ?? 0) - betTotal(room.bets[deviceId]);
  if (left < chip) return toast.warning(t(`Không đủ xu (còn ${xu(left)})`, `Not enough coins (${xu(left)} left)`));
  play('chip');
  send({ t: 'bet', s: i, amt: chip });
}

// ---------- vẽ ----------
function render() {
  const r = room;
  const m = me();
  const open = revealed();
  // Server cộng/trừ xu ngay lúc mở bát; đang lắc thì hiện số cũ để khỏi lộ kết quả.
  const coinsOf = (p) => (open ? p.coins : p.coins - (r.deltas?.[p.id] ?? 0) - betTotal(r.bets[p.id]));
  $('#myCoins').replaceChildren(...(m ? [iconEl('coins'), ` ${xu(coinsOf(m))}`] : []));
  const isHost = r?.host === deviceId;
  pub.update(r, isHost);
  const [emo, txt] = MODE_TEXT[r?.mode ?? 'rotate'];
  $('#btnMode').replaceChildren(iconEl(emo), el('span', { className: 'lbl', textContent: txt }));
  $('#btnMode').disabled = !isHost || r.phase !== 'bet';
  $('#btnMode').title = isHost ? t('Đổi: máy làm cái ⇄ xoay vòng', 'Switch: bot dealer ⇄ rotating dealer') : t('Chỉ chủ phòng đổi được', 'Only the host can switch');

  $('#players').replaceChildren(...(r?.players ?? []).map((p) => {
    const li = el('li', { className: [p.id === deviceId && 'me', p.id === r.dealer && 'dealer'].filter(Boolean).join(' ') });
    li.style.setProperty('--c', colorOf(p.id));
    const d = open ? r.deltas?.[p.id] : 0;
    li.append(p.id === r.dealer ? iconEl('crown') : '', `${p.name}${p.id === deviceId ? t(' (bạn)', ' (you)') : ''} · `, el('b', { textContent: xu(coinsOf(p)) }));
    if (d) li.append(' ', el('span', { className: `d ${d > 0 ? 'up' : 'down'}`, textContent: signed(d) }));
    return li;
  }));

  // Xúc xắc: chỉ hiện khi đã lật bát. Lật rồi thì có nút xem lại / chia sẻ ván này (trừ lúc đang xem lại).
  rpHold.replaceChildren(...(open && r.rp && !rp ? [linksOf(r.rp)] : []));
  const bowl = $('#bowl');
  bowl.classList.toggle('shake', r?.phase === 'show' && !open);
  bowl.classList.toggle('open', open);
  const diceKey = open ? `${r.phaseAt}` : '';
  if ($('#dice').dataset.k !== diceKey) {
    $('#dice').dataset.k = diceKey;
    $('#dice').replaceChildren(...(open ? r.dice.map((d) => el('div', { className: 'die' }, pic(SYMBOLS[d]))) : []));
  }
  const hits = SYMBOLS.map((_, s) => (open ? r.dice.filter((d) => d === s).length : 0));
  [...$('#board').children].forEach((c, s) => {
    c.classList.toggle('hit', hits[s] > 0);
    c.classList.toggle('miss', open && !hits[s]);
    c.querySelector('.x').hidden = !hits[s];
    c.querySelector('.x').textContent = `×${hits[s]}`;
    c.querySelector('.stack').replaceChildren(...Object.entries(r?.bets ?? {}).filter(([, b]) => b[s]).map(([id, b]) => {
      const sp = el('span', { className: id === deviceId ? 'me' : '', textContent: `${nameOf(id)} ${b[s]}`, title: nameOf(id) });
      sp.style.setProperty('--c', colorOf(id));
      return sp;
    }));
  });
  for (const b of $('#chips').children) b.classList.toggle('on', Number(b.textContent) === chip);

  const dealerName = r?.dealer ? (r.dealer === deviceId ? t('bạn', 'you') : nameOf(r.dealer)) : t('máy', 'bot');
  const st = $('#status');
  const betting = r?.phase === 'bet';
  $('#btnRoll').hidden = !r || !betting || !canRoll();
  $('#btnRoll').disabled = !anyBet();
  $('#btnRoll').replaceChildren(...(anyBet() ? [iconEl('dices'), t(' Mở bát', ' Reveal')] : [t('Chờ đặt cược…', 'Waiting for bets…')]));
  $('#btnClear').disabled = !betting || !betTotal(r?.bets[deviceId]);
  $('#chips').style.visibility = $('#btnClear').style.visibility = r?.dealer === deviceId ? 'hidden' : '';
  if (!r) st.textContent = t('Đang kết nối…', 'Connecting…');
  else if (!betting && !open) st.replaceChildren(iconEl('dices'), t(' Đang lắc…', ' Shaking…'));
  else if (open) {
    const won = Object.values(r.deltas ?? {}).filter((d) => d > 0).length;
    st.replaceChildren(t('Ra ', 'Rolled '), el('b', { textContent: r.dice.map((d) => nm(SYMBOLS[d])).join(' · ') }), won ? t(` — ${won} người ăn`, ` — ${won} won`) : t(' — không ai ăn', ' — nobody won'));
  } else if (r.dealer === deviceId) st.replaceChildren(t(`Ván ${r.round}: `, `Round ${r.round}: `), el('b', { textContent: t('bạn làm cái', 'you are the dealer') }), anyBet() ? t(' — mở bát khi mọi người đặt xong.', ' — reveal when everyone has bet.') : t(' — chờ mọi người đặt cược.', ' — waiting for bets.'));
  else st.replaceChildren(t(`Ván ${r.round} · Cái: `, `Round ${r.round} · Dealer: `), el('b', { textContent: dealerName }), canRoll() ? '' : t(` — đặt cược rồi chờ ${r.dealer ? dealerName : 'chủ phòng'} mở bát.`, ` — place bets, then wait for ${r.dealer ? dealerName : 'the host'} to reveal.`));
}
// Nút "Xem lại / Chia sẻ" của ván vừa mở bát: giữ nguyên phần tử (render mỗi giây không làm mất chữ "Đã chép link").
const rpHold = el('div');
$('#status').after(rpHold);
let links = null;
const linksOf = (id) => {
  if (links?.dataset.rp !== id) { links = replayLinks(id); links.dataset.rp = id; }
  return links;
};

// Nhắc lại khi hết giờ lắc / quá hạn AFK (mở bát được) mà không có tin mới.
setInterval(() => room && render(), 1000);
window.bc = { get room() { return room; } }; // cho test tự động

// Hộp "Cách chơi": số liệu theo logic.js (phỉnh, xu đầu, cứu trợ) và worker/games/bau-cua.js (lắc 2,5s, 7s, AFK 30s).
mountHelp({
  game: 'bau-cua',
  button: '#btnHelpHome, #btnHelp',
  auto: !rp,
  content: {
    vi: {
      goal: 'Đoán con vật trên 3 viên xúc xắc để ăn thêm xu ảo (xu chỉ để vui, không có giá trị thật).',
      play: [
        'Mỗi người bắt đầu với 1000 xu, phòng tối đa 10 người. Bàn có 6 con: Nai, Bầu, Gà, Cá, Cua, Tôm.',
        'Đặt x xu vào một con: ra k viên con đó (1–3) thì ăn x×k, không ra thì mất x. Được đặt nhiều con.',
        'Mặc định máy làm cái, ai cũng được đặt; chủ phòng mở bát. Ở một mình thì luôn là máy làm cái.',
        'Chủ phòng đổi sang "Xoay cái" lúc đang đặt cược: mỗi ván một người làm cái, không đặt, chung/ăn bằng xu mình.',
        'Cái bấm "Mở bát" (cần có người đặt). Quá 30 giây chưa mở thì ai cũng mở được.',
        'Bát lắc khoảng 2,5 giây rồi lật; 7 giây sau khi mở bát thì sang ván mới. Còn dưới 10 xu được cứu trợ 500 xu.',
      ],
      keys: [
        'Bấm phỉnh 10 / 50 / 100 / 500 để chọn mức, bấm con vật để đặt thêm một phỉnh.',
        'Chuột phải vào con vật: bỏ cược con đó. Nút "Bỏ cược": bỏ hết cược của bạn.',
        'Nút máy / vương miện trên thanh trên (chủ phòng): đổi máy làm cái ⇄ xoay cái.',
      ],
      touch: [
        'Chạm phỉnh để chọn mức, chạm con vật để đặt thêm một phỉnh.',
        'Giữ lâu con vật để bỏ cược con đó, hoặc chạm "Bỏ cược" để bỏ hết.',
      ],
      tips: [
        'Cược công khai: tên và số xu mọi người hiện ngay trên từng con.',
        'Xúc xắc chỉ tung lúc mở bát (cược đã khoá) nên không ai biết trước kết quả.',
      ],
    },
    en: {
      goal: 'Guess which animals show on the 3 dice to win virtual coins (just for fun, no real value).',
      play: [
        'Everyone starts with 1000 coins, up to 10 players. 6 animals: Deer, Gourd, Rooster, Fish, Crab, Shrimp.',
        'Bet x coins on an animal: if k dice show it (1–3) you win x×k; if none do, you lose x. You may bet on several.',
        'By default the bot is the dealer and everyone bets; the host reveals. Playing alone, the bot always deals.',
        'While betting, the host can switch to "Rotating dealer": each round one player deals, skips betting, pays/collects.',
        'The dealer taps "Reveal" (needs at least one bet). If nobody reveals within 30 seconds, anyone can.',
        'The bowl shakes ~2.5 s, then opens; a new round starts 7 s after the reveal. Under 10 coins? You get 500 free.',
      ],
      keys: [
        'Click a 10 / 50 / 100 / 500 chip to pick the amount, click an animal to add one chip.',
        'Right-click an animal: remove your bet on it. "Clear bets": remove all your bets.',
        'Bot / crown button in the top bar (host): switch bot dealer ⇄ rotating dealer.',
      ],
      touch: [
        'Tap a chip to pick the amount, tap an animal to add one chip.',
        'Long-press an animal to remove your bet on it, or tap "Clear bets" to remove all.',
      ],
      tips: [
        'Bets are public: every player\'s name and amount shows on each animal.',
        'Dice are only rolled when the bowl is revealed (bets locked), so nobody knows the result in advance.',
      ],
    },
  },
});

if (rp) {
  // Người xem: không phải ai trong ván (không hiện "bạn"), ẩn nút chơi / mời / đổi cái / đặt cược.
  deviceId = '';
  $('#home').hidden = true;
  $('#room').hidden = false;
  for (const s of ['#btnLeave', '#btnCopy', '#conn', '#btnMode']) $(s).hidden = true;
  $('#bar').style.visibility = 'hidden'; // giữ chỗ cho thanh tua của replay.js
  pub.el.remove();
  render();
  playReplay(rp, {
    feed: onMsg,
    reset: () => { quiet = true; setTimeout(() => { quiet = false; }); room = null; shown = 0; render(); },
  });
} else {
  const initial = new URLSearchParams(location.search).get('r');
  if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);
}

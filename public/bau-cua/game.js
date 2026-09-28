import { SYMBOLS, CHIPS, betTotal } from './logic.js';
import { icon, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';

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
const COLORS = ['#5cc8ff', '#ff7ab6', '#7dff9a', '#ffb454', '#c49bff', '#ffe66b', '#6bf0e0', '#ff9b9b', '#b8f07a', '#f0a6ff'];
const CHIP_COLORS = { 10: '#2f7de1', 50: '#1d9a55', 100: '#d6452f', 500: '#1b1b1b' };
const MODE_TEXT = { rotate: ['👑', ' Xoay cái'], house: ['🤖', ' Máy làm cái'] };

let ws, code = null, room = null, clockOffset = 0, shown = 0;
let chip = Number(store.get('bc.chip')) || CHIPS[1];
if (!CHIPS.includes(chip)) chip = CHIPS[1];

// Hình cắt từ tờ bầu cua in dân gian (xem README); emoji chỉ để làm chữ thay thế.
const pic = (s, cls) => el('img', { className: cls, src: `assets/${s.key}.webp`, alt: s.emoji, draggable: false });
const now = () => Date.now() + clockOffset;
const me = () => room?.players.find((p) => p.id === deviceId);
const colorOf = (id) => COLORS[Math.max(0, room?.players.findIndex((p) => p.id === id) ?? 0) % COLORS.length];
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? 'Người cũ';
const revealed = () => room?.phase === 'show' && now() - room.phaseAt >= room.shakeMs;
const canRoll = () => room?.phase === 'bet' && (room.dealer ? room.dealer === deviceId : room.host === deviceId) || afk();
const afk = () => room?.phase === 'bet' && now() - room.phaseAt > room.afkMs;
const anyBet = () => Object.entries(room?.bets ?? {}).some(([id, b]) => id !== room.dealer && betTotal(b));
const xu = (n) => `${n.toLocaleString('vi-VN')} xu`;
const signed = (n) => (n > 0 ? `+${n.toLocaleString('vi-VN')}` : n.toLocaleString('vi-VN'));

// ---------- âm thanh (dùng lại bộ âm của Pikachu) ----------
let soundOn = store.get('bc.sound') !== '0';
const SND = Object.fromEntries(Object.entries({ chip: 'sound2', shake: 'sound4', win: 'sound5', lose: 'sound1' })
  .map(([k, f]) => [k, new Audio(`../pikachu/sound/${f}.mp3`)]));
function play(k) { if (!soundOn) return; SND[k].currentTime = 0; SND[k].play().catch(() => {}); }
function renderSound() { $('#btnSound').innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); }
$('#btnSound').onclick = () => { soundOn = !soundOn; store.set('bc.sound', soundOn ? '1' : '0'); renderSound(); };
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
  if (msg) toast(msg);
}
function connect() {
  const q = new URLSearchParams({ id: deviceId, name: myName() });
  const sock = (ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/bc/room/${code}?${q}`));
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
  if (m.t !== 'state') return;
  if (room && room.mode !== m.mode) toast(m.mode === 'house' ? '🤖 Chủ phòng đổi: máy làm cái, ai cũng được đặt' : '👑 Chủ phòng đổi: làm cái xoay vòng');
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
      if (d) { play(d > 0 ? 'win' : 'lose'); toast(d > 0 ? `🎉 Bạn ăn ${xu(d)}` : `😢 Bạn mất ${xu(-d)}`); }
    }, Math.max(0, wait));
  }
  render();
}

// ---------- nút ----------
$('#btnCreate').onclick = () => enter(Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''));
$('#btnJoin').onclick = () => {
  const c = $('#code').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(c)) return toast('Mã phòng gồm 4 ký tự');
  enter(c);
};
$('#code').onkeydown = (e) => e.key === 'Enter' && $('#btnJoin').click();
$('#btnLeave').onclick = () => leave();
$('#btnCopy').onclick = () => invite(`${location.origin}/bau-cua/?r=${code}`, code, toast);
$('#btnMode').onclick = () => send({ t: 'mode', mode: room?.mode === 'rotate' ? 'house' : 'rotate' });
$('#btnClear').onclick = () => send({ t: 'unbet' });
$('#btnRoll').onclick = () => send({ t: 'roll' });

$('#chips').append(...CHIPS.map((c) => {
  const b = el('button', { className: 'chip', textContent: c, title: `Phỉnh ${c} xu` });
  b.style.setProperty('--cc', CHIP_COLORS[c]);
  b.onclick = () => { chip = c; store.set('bc.chip', c); render(); };
  return b;
}));
$('#board').append(...SYMBOLS.map((s, i) => {
  const c = el('div', { className: 'cell', title: `Đặt vào ${s.name} (chuột phải / giữ để bỏ)` },
    pic(s, 'em'), el('span', { className: 'nm', textContent: s.name.toUpperCase() }),
    el('span', { className: 'x' }), el('div', { className: 'stack' }));
  c.onclick = () => bet(i);
  c.oncontextmenu = (e) => { e.preventDefault(); send({ t: 'unbet', s: i }); };
  return c;
}));

function bet(i) {
  if (!room) return;
  if (room.phase !== 'bet') return toast('Đang mở bát, chờ ván sau nhé');
  if (room.dealer === deviceId) return toast('Bạn đang làm cái — ngồi chờ ăn tiền thôi 😎');
  const left = (me()?.coins ?? 0) - betTotal(room.bets[deviceId]);
  if (left < chip) return toast(`Không đủ xu (còn ${xu(left)})`);
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
  $('#myCoins').textContent = m ? `🪙 ${xu(coinsOf(m))}` : '';
  const isHost = r?.host === deviceId;
  const [emo, txt] = MODE_TEXT[r?.mode ?? 'rotate'];
  $('#btnMode').replaceChildren(emo, el('span', { className: 'lbl', textContent: txt }));
  $('#btnMode').disabled = !isHost || r.phase !== 'bet';
  $('#btnMode').title = isHost ? 'Đổi: máy làm cái ⇄ xoay vòng' : 'Chỉ chủ phòng đổi được';

  $('#players').replaceChildren(...(r?.players ?? []).map((p) => {
    const li = el('li', { className: [p.id === deviceId && 'me', p.id === r.dealer && 'dealer'].filter(Boolean).join(' ') });
    li.style.setProperty('--c', colorOf(p.id));
    const d = open ? r.deltas?.[p.id] : 0;
    li.append(p.id === r.dealer ? '👑 ' : '', `${p.name}${p.id === deviceId ? ' (bạn)' : ''} · `, el('b', { textContent: xu(coinsOf(p)) }));
    if (d) li.append(' ', el('span', { className: `d ${d > 0 ? 'up' : 'down'}`, textContent: signed(d) }));
    return li;
  }));

  // Xúc xắc: chỉ hiện khi đã lật bát.
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
      const sp = el('span', { className: id === deviceId ? 'me' : '', textContent: `${nameOf(id).split(' ').pop()} ${b[s]}` });
      sp.style.setProperty('--c', colorOf(id));
      return sp;
    }));
  });
  for (const b of $('#chips').children) b.classList.toggle('on', Number(b.textContent) === chip);

  const dealerName = r?.dealer ? (r.dealer === deviceId ? 'bạn' : nameOf(r.dealer)) : 'máy';
  const st = $('#status');
  const betting = r?.phase === 'bet';
  $('#btnRoll').hidden = !r || !betting || !canRoll();
  $('#btnRoll').disabled = !anyBet();
  $('#btnRoll').textContent = anyBet() ? '🥣 Mở bát' : 'Chờ đặt cược…';
  $('#btnClear').disabled = !betting || !betTotal(r?.bets[deviceId]);
  $('#chips').style.visibility = $('#btnClear').style.visibility = r?.dealer === deviceId ? 'hidden' : '';
  if (!r) st.textContent = 'Đang kết nối…';
  else if (!betting && !open) st.replaceChildren('Đang lắc… 🎲');
  else if (open) {
    const won = Object.values(r.deltas ?? {}).filter((d) => d > 0).length;
    st.replaceChildren('Ra ', el('b', { textContent: r.dice.map((d) => SYMBOLS[d].name).join(' · ') }), won ? ` — ${won} người ăn` : ' — không ai ăn');
  } else if (r.dealer === deviceId) st.replaceChildren(`Ván ${r.round}: `, el('b', { textContent: 'bạn làm cái' }), anyBet() ? ' — mở bát khi mọi người đặt xong.' : ' — chờ mọi người đặt cược.');
  else st.replaceChildren(`Ván ${r.round} · Cái: `, el('b', { textContent: dealerName }), canRoll() ? '' : ` — đặt cược rồi chờ ${r.dealer ? dealerName : 'chủ phòng'} mở bát.`);
}

// Nhắc lại khi hết giờ lắc / quá hạn AFK (mở bát được) mà không có tin mới.
setInterval(() => room && render(), 1000);
window.bc = { get room() { return room; } }; // cho test tự động

const initial = new URLSearchParams(location.search).get('r');
if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);

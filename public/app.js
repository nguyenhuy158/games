import { ROWS, COLS, findPath, findPair } from './logic.js';
import { icon, hydrateIcons } from './icons.js';

hydrateIcons();

const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// Ẩn danh: mỗi thiết bị một UUID cố định, dùng để vào lại đúng chỗ của mình.
let deviceId = store.get('pk.id');
if (!deviceId) { deviceId = crypto.randomUUID(); store.set('pk.id', deviceId); }
$('#name').value = store.get('pk.name') || `Pika${Math.floor(1000 + Math.random() * 9000)}`;
const myName = () => $('#name').value.trim() || 'Pika';

const HINTS = 3;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let ws, code = null, room = null, board = null, sel = null, hints = HINTS, clockOffset = 0;
let peers = {}; // coop: id đồng đội -> ô họ đang chọn

// ---------- âm thanh ----------
let soundOn = store.get('pk.sound') !== '0';
const SOUNDS = { select: 'sound2', match: 'sound5', miss: 'sound1', start: 'sound4' };
const audio = Object.fromEntries(Object.entries(SOUNDS).map(([k, f]) => [k, new Audio(`sound/${f}.mp3`)]));
function play(k) {
  if (!soundOn) return;
  audio[k].currentTime = 0;
  audio[k].play().catch(() => {});
}
function renderSound() { $('#btnSound').innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); }
$('#btnSound').onclick = () => { soundOn = !soundOn; store.set('pk.sound', soundOn ? '1' : '0'); renderSound(); };
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
  room = board = sel = null;
  peers = {};
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
  const sock = (ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${code}?${q}`));
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
  if (m.t === 'state') {
    const wasPlaying = room?.status === 'playing';
    room = m;
    clockOffset = m.now - Date.now();
    if (wasPlaying && m.status === 'ended') play(m.winner && (m.mode === 'coop' || m.winner === deviceId) ? 'match' : 'miss');
  } else if (m.t === 'match') {
    // coop: đồng đội vừa ăn một cặp trên bàn chung.
    if (!board) return;
    board[m.a[0]][m.a[1]] = board[m.b[0]][m.b[1]] = 0;
    if (sel && !board[sel[0]][sel[1]]) sel = null;
    delete peers[m.id];
    play('match');
    render();
    drawPath(m.path);
    return;
  } else if (m.t === 'sel') {
    if (m.a) peers[m.id] = m.a; else delete peers[m.id];
  } else if (m.t === 'board') {
    board = m.board;
    sel = null;
    peers = {};
    $('#shuffleLeft').textContent = m.shuffles;
    if (m.isNew) { hints = HINTS; play('start'); }
  }
  render();
}

$('#btnCreate').onclick = () => enter(Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''));
$('#btnJoin').onclick = () => {
  const c = $('#code').value.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(c)) enter(c); else toast('Mã phòng gồm 4 ký tự');
};
$('#code').onkeydown = (e) => { if (e.key === 'Enter') $('#btnJoin').click(); };
$('#btnLeave').onclick = () => leave();
$('#btnStart').onclick = () => send({ t: 'start' });
for (const b of document.querySelectorAll('#modePick button')) b.onclick = () => send({ t: 'mode', mode: b.dataset.mode });
$('#btnCopy').onclick = async () => {
  const link = `${location.origin}/?r=${code}`;
  try { await navigator.clipboard.writeText(link); toast('Đã sao chép link mời'); } catch { toast(link); }
};
$('#btnShuffle').onclick = () => send({ t: 'shuffle' });
$('#btnHint').onclick = () => {
  if (!playing() || hints <= 0) return;
  const p = findPair(board);
  if (!p) return;
  hints--;
  render();
  for (const [r, c] of p) cellEl(r, c)?.classList.add('hint');
};

// ---------- bàn chơi ----------
const playing = () => room?.status === 'playing' && board;
let geo = { w: 40, h: 50, portrait: false };

// Màn hình dọc thì xoay bàn (đổi hàng <-> cột) cho icon đỡ bé.
function layout() {
  const wrap = $('#boardWrap');
  const portrait = wrap.clientHeight > wrap.clientWidth;
  const gw = (portrait ? ROWS : COLS) + 2, gh = (portrait ? COLS : ROWS) + 2;
  const w = Math.max(12, Math.floor(Math.min(wrap.clientWidth / gw, wrap.clientHeight / gh / 1.25)));
  geo = { w, h: Math.floor(w * 1.25), portrait };
  const b = $('#board');
  b.style.width = `${gw * geo.w}px`;
  b.style.height = `${gh * geo.h}px`;
}
const xy = (r, c) => (geo.portrait ? [r, c] : [c, r]);
const cellEl = (r, c) => $(`#board [data-k="${r}-${c}"]`);

function renderBoard() {
  const b = $('#board');
  b.replaceChildren();
  if (!board) return;
  layout();
  const { w, h } = geo;
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const t = board[r][c];
      if (!t) continue;
      const [x, y] = xy(r, c);
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.k = `${r}-${c}`;
      d.style.cssText = `left:${x * w}px;top:${y * h}px;width:${w - 1}px;height:${h - 1}px;` +
        `background-size:${36 * w}px ${h}px;background-position:${-(t - 1) * w}px 0`;
      if (sel && sel[0] === r && sel[1] === c) d.classList.add('sel');
      else if (Object.values(peers).some((p) => p[0] === r && p[1] === c)) d.classList.add('peer');
      b.append(d);
    }
  }
}

function drawPath(path) {
  const pts = path.map(([r, c]) => { const [x, y] = xy(r, c); return `${x * geo.w + geo.w / 2},${y * geo.h + geo.h / 2}`; });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts.join(' '));
  svg.append(line);
  $('#board').append(svg);
  setTimeout(() => svg.remove(), 300);
}

function setSel(v) {
  sel = v;
  if (room?.mode === 'coop') send({ t: 'sel', a: v });
}

$('#board').onpointerdown = (e) => {
  const k = e.target.dataset?.k;
  if (!k || !playing()) return;
  const [r, c] = k.split('-').map(Number);
  if (!sel) { setSel([r, c]); play('select'); return renderBoard(); }
  if (sel[0] === r && sel[1] === c) { setSel(null); return renderBoard(); }
  const a = sel;
  if (board[a[0]][a[1]] !== board[r][c]) { setSel([r, c]); play('select'); return renderBoard(); }
  setSel(null);
  const path = findPath(board, a, [r, c]);
  if (!path) {
    play('miss');
    renderBoard();
    const b = $('#board');
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
    return;
  }
  // Ăn ngay ở client cho mượt; server kiểm lại, lệch thì gửi bàn chuẩn về.
  board[a[0]][a[1]] = board[r][c] = 0;
  send({ t: 'pick', a, b: [r, c] });
  play('match');
  renderBoard();
  drawPath(path);
};
addEventListener('resize', () => renderBoard());

// ---------- HUD ----------
function render() {
  renderBoard();
  $('#hintLeft').textContent = hints;
  $('#btnHint').disabled = !playing() || hints <= 0;
  $('#btnShuffle').disabled = !playing() || $('#shuffleLeft').textContent === '0';

  const players = [...(room?.players ?? [])].sort((a, b) => b.score - a.score);
  $('#players').replaceChildren(...players.map((p) => {
    const li = document.createElement('li');
    li.className = `${p.id === deviceId ? 'me' : ''} ${p.online ? '' : 'off'} ${peers[p.id] ? 'peer-on' : ''}`;
    if (p.id === room.host) li.innerHTML = icon('crown');
    li.append(`${p.name}${p.id === deviceId ? ' (bạn)' : ''} · `);
    const b = document.createElement('b');
    b.textContent = p.score;
    li.append(b, room.status === 'lobby' || room.mode === 'coop' ? '' : ` · còn ${p.left} cặp`);
    return li;
  }));

  const isHost = room?.host === deviceId;
  const coop = room?.mode === 'coop';
  const ov = $('#overlay');
  const setTitle = (ic, text) => { $('#ovTitle').innerHTML = ic ? icon(ic) : ''; $('#ovTitle').append(text); };
  $('#modePick').hidden = !room || room.status === 'playing';
  for (const b of document.querySelectorAll('#modePick button')) {
    b.classList.toggle('on', b.dataset.mode === room?.mode);
    b.disabled = !isHost;
  }
  if (!room) {
    ov.hidden = false;
    setTitle(null, 'Đang kết nối…');
    $('#ovText').textContent = '';
    $('#btnStart').hidden = true;
  } else if (room.status === 'playing') {
    ov.hidden = true;
  } else {
    ov.hidden = false;
    const winner = room.players.find((p) => p.id === room.winner);
    if (room.status === 'lobby') setTitle(null, `Phòng ${code}`);
    else if (coop) setTitle(room.winner ? 'trophy' : null, room.winner ? 'Cả đội dọn sạch bàn!' : 'Hết giờ mất rồi…');
    else setTitle('trophy', winner?.id === deviceId ? 'Bạn thắng!' : `${winner?.name ?? '—'} thắng`);
    $('#ovText').textContent = (room.status === 'lobby'
      ? `${room.players.length}/4 người. ${coop ? 'Cả phòng chung một bàn, cùng dọn trước khi hết giờ.' : 'Mỗi người một bàn cùng đề, ai dọn xong trước thắng.'} `
      : 'Ván mới? ') + (isHost ? '' : 'Chờ chủ phòng bắt đầu.');
    $('#btnStart').hidden = !isHost;
    $('#btnStart').textContent = room.status === 'lobby' ? 'Bắt đầu' : 'Chơi ván mới';
  }
}

setInterval(() => {
  if (room?.status !== 'playing') { $('#clock').textContent = '--:--'; $('#timebar').style.width = '0'; return; }
  const left = Math.max(0, room.endAt - (Date.now() + clockOffset));
  const s = Math.ceil(left / 1000);
  $('#clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const pct = (left / room.duration) * 100;
  const bar = $('#timebar');
  bar.style.width = `${pct}%`;
  bar.style.background = pct < 20 ? 'var(--bad)' : pct < 50 ? 'var(--accent)' : 'var(--good)';
}, 250);

const initial = new URLSearchParams(location.search).get('r');
if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);

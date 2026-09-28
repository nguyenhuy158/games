import { SIZES, LEVELS, SLIDES, SLIDE_ICON, slide, findPath, findPair } from './logic.js';
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, addReroll } from '../names.js';
import { createPanel, drawGrid } from '../panel.js';
import { t, tx } from '../i18n.js';

hydrateIcons();

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// Ẩn danh: mỗi thiết bị một UUID cố định, dùng để vào lại đúng chỗ của mình.
let deviceId = store.get('pk.id');
if (!deviceId) { deviceId = crypto.randomUUID(); store.set('pk.id', deviceId); }
$('#name').value = deviceName();
addReroll($('#name'));
const myName = () => $('#name').value.trim() || 'Pika';

const HINTS = 3;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Cảm xúc = icon lucide + màu; số lượng khớp EMOJI_COUNT ở worker (gửi theo chỉ số).
const EMOJIS = [['thumbs-up', '#5cc8ff'], ['laugh', '#ffd23f'], ['frown', '#c49bff'], ['flame', '#ff7a3d'], ['heart', '#ff5d7a']];
const MODE_NAMES = { coop: t('Chơi chung', 'Together'), race: t('Đua nhau', 'Race'), team: t('Đội 2v2', 'Team 2v2') };
const MODE_ICONS = { coop: 'users', race: 'swords', team: 'flag' };
const TEAM_COLORS = { A: '#ff7a59', B: '#5cc8ff' };
const PEER_COLORS = ['#5cc8ff', '#ff7ab6', '#7dff9a', '#ffb454', '#c49bff', '#ffe66b', '#6bf0e0', '#ff9b9b'];
const SPRITES = { poke: 'images/pieces-sprite.png', animal: 'images/animals-sprite.png' };
const LONG_PRESS_MS = 450;

let ws, code = null, room = null, board = null, sel = null, hints = HINTS, clockOffset = 0;
let watchUnit = null; // khán giả: bàn đang xem
let peers = {}; // id đồng đội -> ô họ đang chọn
let cursors = {}; // id đồng đội -> [r, c] chuột (đơn vị ô, số thực)
let minis = {}, miniVer = {}; // bàn thu nhỏ của các đơn vị khác (khung kiểu Google Meet)
const panel = createPanel({ root: $('#panel'), toggle: $('#btnPanel'), storeKey: 'pk.panel' });
const spriteImgs = {};
const spriteImg = () => {
  const src = SPRITES[room?.tiles] ?? SPRITES.poke;
  if (!spriteImgs[src]) { spriteImgs[src] = new Image(); spriteImgs[src].src = src; spriteImgs[src].onload = () => render(); }
  return spriteImgs[src];
};

const me = () => room?.players.find((p) => p.id === deviceId);
const view = () => me()?.unit ?? (room?.units[watchUnit] ? watchUnit : Object.keys(room?.units ?? {})[0] ?? null);
const unit = () => room?.units[view()];
const shared = () => room?.mode !== 'race'; // có đồng đội cùng bàn
const playing = () => room?.status === 'playing' && board && unit() && !unit().done && me()?.unit;
const colorOf = (id) => {
  const p = room?.players.find((x) => x.id === id);
  if (room?.mode === 'team' && p) return TEAM_COLORS[p.team];
  return PEER_COLORS[Math.max(0, room?.players.findIndex((x) => x.id === id) ?? 0) % PEER_COLORS.length];
};
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? '—';
const unitName = (uid) => (uid === 'all' ? t('Cả phòng', 'Whole room') : uid === 'A' || uid === 'B' ? t(`Đội ${uid}`, `Team ${uid}`) : nameOf(uid));

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

// ---------- vào / rời phòng ----------
function enter(c) {
  code = c.toUpperCase();
  store.set('pk.name', myName());
  history.replaceState(null, '', `?r=${code}`);
  $('#roomCode').textContent = code;
  $('#home').hidden = true;
  $('#room').hidden = false;
  room = board = sel = watchUnit = null;
  peers = {};
  cursors = {};
  minis = {};
  miniVer = {};
  render();
  connect();
}

function leave(msg) {
  code = null;
  ws?.close();
  history.replaceState(null, '', location.pathname);
  $('#room').hidden = true;
  $('#home').hidden = false;
  loadTop();
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
    if (e.code === 4000) return leave(t('Bạn đã mở phòng này ở tab/thiết bị khác', 'You opened this room in another tab/device'));
    if (code && e.code !== 4001) setTimeout(() => ws === sock && code && connect(), navigator.onLine ? 1000 : 3000);
  };
}
const send = (m) => ws?.readyState === 1 && ws.send(JSON.stringify(m));
addEventListener('offline', () => toast.error(t('Mất mạng — sẽ tự kết nối lại', 'Offline — will reconnect automatically')));

function onMsg(m) {
  switch (m.t) {
    case 'error':
      return leave(tx(m.msg));
    case 'state': {
      const was = room;
      room = m;
      clockOffset = m.now - Date.now();
      if (was?.status === 'playing' && m.status === 'ended') {
        const won = m.mode === 'coop' ? !!m.winner : m.winner === me()?.unit;
        play(won ? 'match' : 'miss');
        cursors = {};
      }
      if (m.status !== 'playing') board = null;
      break;
    }
    case 'board':
      // Chưa có state (vừa vào lại phòng) thì vẫn nhận: server chỉ gửi board của bàn mình xem.
      if (room && m.unit !== view()) return;
      board = m.board;
      sel = null;
      peers = {};
      if (m.why === 'start') { hints = HINTS; play('start'); }
      if (m.why === 'level') {
        const lv = (unit()?.level ?? 1) + 1; // state với màn mới tới ngay sau
        banner(t(`Màn ${lv}/${LEVELS}`, `Level ${lv}/${LEVELS}`), SLIDE_ICON[SLIDES[lv - 1]] ? t(`Ô dồn ${SLIDE_ICON[SLIDES[lv - 1]]}`, `Tiles shift ${SLIDE_ICON[SLIDES[lv - 1]]}`) : '');
        play('start');
      }
      if (m.why === 'stuck') toast.warning(t('Hết nước — tự xáo lại, +10 giây', 'No moves — auto-shuffled, +10 seconds'), { icon: 'shuffle' });
      if (m.why === 'shuffle' && m.by !== deviceId) toast(t(`${nameOf(m.by)} vừa đổi vị trí`, `${nameOf(m.by)} just shuffled`), { icon: 'shuffle' });
      break;
    case 'match': {
      if (m.unit !== view()) return;
      const mine = m.id === deviceId;
      if (!mine) {
        // Mình đã tự vẽ hiệu ứng lúc bấm; đây là của đồng đội.
        pop([m.a, m.b].map(([r, c]) => [r, c, board?.[r]?.[c]]));
        drawPath(m.path, colorOf(m.id));
        play('match');
        delete peers[m.id];
        if (SLIDES[(unit()?.level ?? 1) - 1] && sel) setSel(null); // bàn vừa trượt, ô đang chọn có thể đã đổi
      }
      board = m.board;
      if (sel && !board[sel[0]][sel[1]]) sel = null;
      floatText(m.b, `+${m.pts}`, m.combo > 1 ? `x${m.combo}` : '', colorOf(m.id));
      break;
    }
    case 'minis':
      minis = m.boards;
      for (const k of Object.keys(minis)) miniVer[k] = (miniVer[k] ?? 0) + 1;
      break;
    case 'mini':
      minis[m.unit] = m.board;
      miniVer[m.unit] = (miniVer[m.unit] ?? 0) + 1;
      return renderPanel();
    case 'cur':
      if (m.p) cursors[m.id] = m.p; else delete cursors[m.id];
      return renderCursors();
    case 'sel':
      if (m.a) peers[m.id] = m.a; else delete peers[m.id];
      break;
    case 'ping':
      return pingFx(m.a, colorOf(m.id), nameOf(m.id));
    case 'emo':
      return EMOJIS[m.e] && emoFx(m.id, m.e);
    default:
      return;
  }
  render();
}

// ---------- nút ----------
$('#btnCreate').onclick = () => enter(Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''));
$('#btnJoin').onclick = () => {
  const c = $('#code').value.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(c)) enter(c); else toast.warning(t('Mã phòng gồm 4 ký tự', 'Room code is 4 characters'));
};
$('#code').onkeydown = (e) => { if (e.key === 'Enter') $('#btnJoin').click(); };
$('#btnLeave').onclick = () => leave();
$('#btnStart').onclick = () => send({ t: 'start' });
for (const b of document.querySelectorAll('#modePick button')) b.onclick = () => send({ t: 'config', mode: b.dataset.mode });
for (const b of document.querySelectorAll('#tilesPick button')) b.onclick = () => send({ t: 'config', tiles: b.dataset.tiles });
$('#sizePick').replaceChildren(...SIZES.map(([c, r], i) => el('button', {
  textContent: `${c}×${r}`, title: t(`${(c * r) / 2} cặp`, `${(c * r) / 2} pairs`), onclick: () => send({ t: 'config', size: i }),
})));
$('#btnCopy').onclick = () => invite(`${location.origin}/pikachu/?r=${code}`, code);
$('#btnShuffle').onclick = () => send({ t: 'shuffle' });
$('#btnHint').onclick = () => {
  if (!playing() || hints <= 0) return;
  const p = findPair(board);
  if (!p) return;
  hints--;
  render();
  for (const [r, c] of p) cellEl(r, c)?.classList.add('hint');
};
$('#emoBar').replaceChildren(...EMOJIS.map(([name, color], i) => {
  const b = el('button', { title: t('Gửi cảm xúc', 'Send reaction'), onclick: () => { send({ t: 'emo', e: i }); emoFx(deviceId, i); } }, iconEl(name));
  b.style.color = color;
  return b;
}));

// ---------- bàn chơi ----------
let geo = { w: 40, h: 50, portrait: false };

// Màn hình dọc thì xoay bàn (đổi hàng <-> cột) cho icon đỡ bé.
function layout() {
  const wrap = $('#boardWrap');
  const portrait = wrap.clientHeight > wrap.clientWidth;
  const H = board.length, W = board[0].length; // đã gồm viền
  const gw = portrait ? H : W, gh = portrait ? W : H;
  const w = Math.max(12, Math.floor(Math.min(wrap.clientWidth / gw, wrap.clientHeight / gh / 1.25)));
  geo = { w, h: Math.floor(w * 1.25), portrait };
  const b = $('#board');
  b.style.width = `${gw * geo.w}px`;
  b.style.height = `${gh * geo.h}px`;
  b.style.setProperty('--sprite', `url("${SPRITES[room?.tiles] ?? SPRITES.poke}")`);
}
const xy = (r, c) => (geo.portrait ? [r, c] : [c, r]);
const px = (r, c) => { const [x, y] = xy(r, c); return [x * geo.w, y * geo.h]; };
const cellEl = (r, c) => $(`#cells [data-k="${r}-${c}"]`);

function tile(r, c, t) {
  const [x, y] = px(r, c);
  const d = el('div', { className: 'cell' });
  d.style.cssText = `left:${x}px;top:${y}px;width:${geo.w - 1}px;height:${geo.h - 1}px;` +
    `background-size:${36 * geo.w}px ${geo.h}px;background-position:${-(t - 1) * geo.w}px 0`;
  return d;
}

function renderBoard() {
  const cells = $('#cells');
  cells.replaceChildren();
  if (!board) { $('#fx').replaceChildren(); return; }
  layout();
  for (let r = 1; r < board.length - 1; r++) {
    for (let c = 1; c < board[0].length - 1; c++) {
      const t = board[r][c];
      if (!t) continue;
      const d = tile(r, c, t);
      d.dataset.k = `${r}-${c}`;
      if (sel && sel[0] === r && sel[1] === c) d.classList.add('sel');
      else {
        const peer = Object.keys(peers).find((id) => peers[id][0] === r && peers[id][1] === c);
        if (peer) { d.classList.add('peer'); d.style.setProperty('--peer', colorOf(peer)); }
      }
      cells.append(d);
    }
  }
  renderCursors();
}

// Hiệu ứng nằm ở #fx (không bị renderBoard xoá).
function fx(node, ms) {
  $('#fx').append(node);
  setTimeout(() => node.remove(), ms);
}

function pop(list) {
  if (!board) return;
  for (const [r, c, t] of list) if (t) fx(Object.assign(tile(r, c, t), { className: 'cell popping' }), 350);
}

function drawPath(path, color) {
  const pts = path.map(([r, c]) => { const [x, y] = px(r, c); return `${x + geo.w / 2},${y + geo.h / 2}`; });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('path');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts.join(' '));
  if (color) line.style.stroke = color;
  svg.append(line);
  fx(svg, 300);
}

function floatText([r, c], text, combo, color) {
  const [x, y] = px(r, c);
  const n = el('div', { className: 'float' }, text, combo ? el('b', { textContent: ` ${combo}` }) : '');
  n.style.cssText = `left:${x + geo.w / 2}px;top:${y}px;--c:${color}`;
  if (combo) n.classList.add('combo');
  fx(n, 900);
}

function pingFx([r, c], color, who) {
  const [x, y] = px(r, c);
  const n = el('div', { className: 'ping' }, el('span', { textContent: who }));
  n.style.cssText = `left:${x}px;top:${y}px;width:${geo.w}px;height:${geo.h}px;--c:${color}`;
  fx(n, 1600);
  play('select');
}

function banner(title, sub) {
  fx(el('div', { className: 'banner' }, el('b', { textContent: title }), sub ? el('span', { textContent: sub }) : ''), 1800);
}

// Cảm xúc bay lên từ chip tên người gửi (luôn thấy được kể cả khác bàn).
function emoFx(id, i) {
  const chip = $(`#players [data-id="${CSS.escape(id)}"]`);
  if (!chip) return;
  const r = chip.getBoundingClientRect();
  const [name, color] = EMOJIS[i];
  const n = el('div', { className: 'emo-fly' }, iconEl(name));
  n.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top}px;color:${color}`;
  document.body.append(n);
  setTimeout(() => n.remove(), 1600);
}

// Chuột đồng đội: toạ độ theo ô nên đúng trên mọi cỡ màn hình / khi bàn bị xoay.
function renderCursors() {
  const layer = $('#fx');
  const alive = new Set();
  for (const [id, [r, c]] of Object.entries(cursors)) {
    const p = room?.players.find((x) => x.id === id);
    if (!p?.online || !board) continue;
    alive.add(id);
    let n = layer.querySelector(`.cursor[data-id="${CSS.escape(id)}"]`);
    if (!n) {
      n = el('div', { className: 'cursor', innerHTML: icon('mouse-pointer-2') });
      n.dataset.id = id;
      n.append(el('span', { textContent: p.name }));
      layer.append(n);
    }
    n.style.setProperty('--c', colorOf(id));
    const [x, y] = geo.portrait ? [r, c] : [c, r];
    n.style.left = `${x * geo.w}px`;
    n.style.top = `${y * geo.h}px`;
  }
  for (const n of layer.querySelectorAll('.cursor')) if (!alive.has(n.dataset.id)) n.remove();
}

let lastCur = 0, curTimer = null;
$('#boardWrap').addEventListener('pointermove', (e) => {
  if (!shared() || !playing()) return;
  const rect = $('#board').getBoundingClientRect();
  const x = (e.clientX - rect.left) / geo.w, y = (e.clientY - rect.top) / geo.h;
  const p = (geo.portrait ? [x, y] : [y, x]).map((v) => Math.round(v * 100) / 100);
  // ~20 lần/giây là đủ mượt (CSS transition nội suy phần còn lại).
  const wait = 50 - (Date.now() - lastCur);
  clearTimeout(curTimer);
  const go = () => { lastCur = Date.now(); send({ t: 'cur', p }); };
  if (wait <= 0) go(); else curTimer = setTimeout(go, wait);
});
$('#boardWrap').addEventListener('pointerleave', () => {
  clearTimeout(curTimer);
  if (shared() && playing()) send({ t: 'cur', p: null });
});

function setSel(v) {
  sel = v;
  if (shared()) send({ t: 'sel', a: v });
}

function ping(r, c) {
  if (!shared() || !playing()) return;
  send({ t: 'ping', a: [r, c] });
  pingFx([r, c], colorOf(deviceId), t('Bạn', 'You'));
}

function pick(r, c) {
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
  // Ăn ngay ở client cho mượt (cùng luật trượt với server); server gửi bàn chuẩn về sau.
  const t = board[r][c];
  board[a[0]][a[1]] = board[r][c] = 0;
  slide(board, SLIDES[unit().level - 1]);
  send({ t: 'pick', a, b: [r, c] });
  play('match');
  renderBoard();
  pop([[...a, t], [r, c, t]]);
  drawPath(path);
}

// Chuột: bấm trái = chọn, bấm phải = ping. Cảm ứng: chạm = chọn, giữ = ping.
let press = null;
$('#cells').addEventListener('contextmenu', (e) => e.preventDefault());
$('#cells').addEventListener('pointerdown', (e) => {
  const k = e.target.dataset?.k;
  if (!k || !playing()) return;
  const [r, c] = k.split('-').map(Number);
  if (e.pointerType === 'mouse') return e.button === 2 ? ping(r, c) : e.button === 0 && pick(r, c);
  clearTimeout(press?.timer);
  press = { r, c, timer: setTimeout(() => { press = null; ping(r, c); }, LONG_PRESS_MS) };
});
addEventListener('pointerup', () => {
  if (!press) return;
  clearTimeout(press.timer);
  const { r, c } = press;
  press = null;
  if (playing() && board[r]?.[c]) pick(r, c);
});
addEventListener('pointercancel', () => { clearTimeout(press?.timer); press = null; });
// Theo dõi khung bàn (không chỉ cửa sổ): ẩn/hiện khung người chơi cũng làm bàn đổi cỡ.
new ResizeObserver(() => { renderBoard(); renderPanel(); }).observe($('#boardWrap'));

// Khung kiểu Google Meet: bàn thu nhỏ của đơn vị khác (đua / đội đối thủ) + thẻ đồng đội cùng bàn.
function renderPanel() {
  if (room?.status !== 'playing') return panel.update([]);
  const mine = view();
  const tiles = [];
  for (const [uid, u] of Object.entries(room.units)) {
    if (uid === mine) continue;
    const members = room.players.filter((p) => p.unit === uid);
    tiles.push({
      key: `u:${uid}`, name: unitName(uid), color: colorOf(members[0]?.id ?? uid),
      sub: t(`${u.score}đ · M${u.level} · còn ${u.left}`, `${u.score}pt · L${u.level} · ${u.left} left`),
      badge: u.done === 'clear' ? { icon: 'trophy' } : u.done ? { icon: 'hourglass' } : u.combo > 1 ? `x${u.combo}` : '',
      off: members.length > 0 && members.every((p) => !p.online),
      version: `${miniVer[uid] ?? 0}|${room.tiles}|${spriteImg().complete}`, // sprite tải xong -> vẽ lại
      draw: (ctx, w, h) => drawGrid(ctx, w, h, minis[uid], spriteImg()),
    });
  }
  // Đồng đội cùng bàn với mình (chơi chung / cùng đội): thẻ avatar.
  for (const p of room.players) {
    if (p.spec || p.id === deviceId || p.unit !== mine) continue;
    tiles.push({
      key: `p:${p.id}`, name: p.name, color: colorOf(p.id), off: !p.online,
      sub: t(`${p.score}đ${peers[p.id] ? ' · đang chọn' : ''}`, `${p.score}pt${peers[p.id] ? ' · selecting' : ''}`),
    });
  }
  panel.update(tiles);
}

// ---------- HUD ----------
function render() {
  renderBoard();
  renderPanel();
  const u = unit(), mine = me(), isHost = room?.host === deviceId;
  const lobby = room && room.status !== 'playing';
  $('#hintLeft').textContent = hints;
  $('#shuffleLeft').textContent = u?.shuffles ?? 0;
  $('#btnHint').disabled = !playing() || hints <= 0;
  $('#btnShuffle').disabled = !playing() || !u?.shuffles;

  $('#modeTag').hidden = !room;
  if (room) $('#modeTag').innerHTML = icon(MODE_ICONS[room.mode]) + `<span class="lbl">${MODE_NAMES[room.mode]}</span>`;
  $('#levelTag').hidden = !(room?.status === 'playing' && u);
  if (u) {
    $('#levelTag').replaceChildren(el('span', { className: 'lbl', textContent: t('Màn ', 'Level ') }), `${u.level}/${LEVELS}${SLIDE_ICON[SLIDES[u.level - 1]] ? ' ' + SLIDE_ICON[SLIDES[u.level - 1]] : ''}`);
  }

  // Chip người chơi
  const byTeam = (a, b) => (room.mode !== 'team' || a.team === b.team ? 0 : a.team > b.team ? 1 : -1);
  const players = [...(room?.players ?? [])].sort((a, b) => (a.spec - b.spec) || byTeam(a, b) || b.score - a.score);
  $('#players').replaceChildren(...players.map((p) => {
    const li = el('li');
    li.dataset.id = p.id;
    li.className = `${p.id === deviceId ? 'me' : ''} ${p.online ? '' : 'off'} ${peers[p.id] ? 'peer-on' : ''}`;
    li.style.setProperty('--peer', colorOf(p.id));
    if (shared() && !p.spec) li.classList.add('mate');
    if (p.spec) li.innerHTML = icon('eye');
    else if (p.id === room.host) li.innerHTML = icon('crown');
    if (room.mode === 'team' && !p.spec) li.append(el('i', { className: 'team', textContent: p.team }));
    li.append(`${p.name}${p.id === deviceId ? t(' (bạn)', ' (you)') : ''}`);
    if (!p.spec) li.append(' · ', el('b', { textContent: p.score }));
    const pu = room.units[p.unit];
    if (room.mode === 'race' && pu && room.status !== 'lobby') li.append(t(` · M${pu.level} còn ${pu.left}`, ` · L${pu.level}, ${pu.left} left`));
    return li;
  }));

  // Khán giả chọn bàn để xem
  const units = Object.keys(room?.units ?? {});
  $('#specBar').hidden = !(room?.status === 'playing' && mine?.spec);
  if (!$('#specBar').hidden) {
    $('#specBar').replaceChildren(el('span', { innerHTML: icon('eye') + t(' Đang xem', ' Watching') }), ...units.map((uid) => el('button', {
      textContent: t(`${unitName(uid)} · M${room.units[uid].level}`, `${unitName(uid)} · L${room.units[uid].level}`),
      className: uid === view() ? 'on' : '',
      onclick: () => { watchUnit = uid; send({ t: 'watch', unit: uid }); render(); },
    })));
  }

  // Overlay sảnh chờ / kết quả
  const ov = $('#overlay');
  const setTitle = (ic, text) => { $('#ovTitle').innerHTML = ic ? icon(ic) : ''; $('#ovTitle').append(text); };
  for (const id of ['#modePick', '#sizePick', '#tilesPick']) $(id).hidden = !lobby;
  const pickOn = (sel, attr, value) => {
    for (const b of document.querySelectorAll(`${sel} button`)) { b.classList.toggle('on', b.dataset[attr] === value); b.disabled = !isHost; }
  };
  pickOn('#modePick', 'mode', room?.mode);
  pickOn('#tilesPick', 'tiles', room?.tiles);
  [...$('#sizePick').children].forEach((b, i) => { b.classList.toggle('on', i === room?.size); b.disabled = !isHost; });
  renderTeams(lobby && room.mode === 'team');
  $('#ovScore').hidden = true;

  if (!room) {
    ov.hidden = false;
    setTitle(null, t('Đang kết nối…', 'Connecting…'));
    $('#ovText').textContent = '';
    $('#btnStart').hidden = true;
  } else if (room.status === 'playing') {
    ov.hidden = !!mine?.unit && !u?.done;
    if (!ov.hidden) {
      // Bàn mình đã xong (phá đảo / hết giờ) nhưng bàn khác còn chơi, hoặc là khán giả.
      setTitle(u?.done === 'clear' ? 'trophy' : null, mine?.spec ? t('Bạn đang xem', 'You are watching') : u?.done === 'clear' ? t('Phá đảo!', 'Cleared!') : t('Hết giờ rồi…', 'Time is up…'));
      $('#ovText').textContent = mine?.spec ? t('Ván sau bạn sẽ được chơi.', 'You will play next round.') : t('Chờ các bàn khác chơi xong nhé.', 'Wait for the other boards to finish.');
      $('#btnStart').hidden = true;
      if (mine?.spec) ov.hidden = true;
    }
  } else {
    ov.hidden = false;
    const n = room.players.filter((p) => !p.spec).length;
    if (room.status === 'lobby') {
      setTitle(null, t(`Phòng ${code}`, `Room ${code}`));
      $('#ovText').textContent = t(`${n}/4 người. `, `${n}/4 players. `) + t({
        coop: 'Cả phòng chung một bàn, cùng qua 5 màn.',
        race: 'Mỗi người một bàn cùng đề, ai qua 5 màn trước thắng.',
        team: 'Chia 2 đội, mỗi đội chung một bàn, đội nào qua 5 màn trước thắng.',
      }[room.mode], {
        coop: 'Whole room shares one board, clear 5 levels together.',
        race: 'Everyone has their own board with the same layout, first to clear 5 levels wins.',
        team: 'Split into 2 teams, each team shares one board, first team to clear 5 levels wins.',
      }[room.mode]) + (isHost ? '' : t(' Chờ chủ phòng bắt đầu.', ' Waiting for host to start.'));
    } else {
      const w = room.winner, wu = room.units[w];
      if (room.mode === 'coop') setTitle(w ? 'trophy' : null, w ? t(`Cả đội phá đảo ${LEVELS} màn!`, `Team cleared all ${LEVELS} levels!`) : t(`Hết giờ ở màn ${room.units.all?.level ?? 1}`, `Time's up at level ${room.units.all?.level ?? 1}`));
      else if (w === mine?.unit) setTitle('trophy', room.mode === 'team' ? t(`Đội ${w} (đội bạn) thắng!`, `Team ${w} (your team) wins!`) : t('Bạn thắng!', 'You win!'));
      else setTitle('trophy', t(`${unitName(w)} thắng`, `${unitName(w)} wins`));
      const scores = Object.entries(room.units).map(([uid, x]) => t(`${unitName(uid)}: ${x.score} điểm, màn ${x.level}`, `${unitName(uid)}: ${x.score} pts, level ${x.level}`));
      $('#ovScore').hidden = false;
      $('#ovScore').textContent = scores.join(' · ');
      $('#ovText').textContent = (wu?.done === 'clear' || !w ? '' : t('Không ai phá đảo — xét màn rồi điểm. ', 'No one cleared it — ranked by level then score. ')) + (isHost ? t('Ván mới?', 'New round?') : t('Chờ chủ phòng mở ván mới.', 'Waiting for host to start a new round.'));
    }
    $('#btnStart').hidden = !isHost;
    $('#btnStart').textContent = room.status === 'lobby' ? t('Bắt đầu', 'Start') : t('Chơi ván mới', 'New round');
  }
}

function renderTeams(show) {
  const box = $('#teamPick');
  box.hidden = !show;
  if (!show) return;
  box.replaceChildren(...['A', 'B'].map((team) => {
    const members = room.players.filter((p) => !p.spec && p.team === team);
    const col = el('div', { className: 'team-col' }, el('b', { textContent: t(`Đội ${team}`, `Team ${team}`) }));
    col.style.setProperty('--c', TEAM_COLORS[team]);
    for (const p of members) col.append(el('span', { textContent: p.name + (p.id === deviceId ? t(' (bạn)', ' (you)') : '') }));
    if (me()?.team !== team) col.append(el('button', { textContent: t('Vào đội này', 'Join this team'), onclick: () => send({ t: 'team', team }) }));
    return col;
  }));
}

setInterval(() => {
  const u = unit();
  if (room?.status !== 'playing' || !u || u.done) { $('#clock').textContent = '--:--'; $('#timebar').style.width = '0'; return; }
  const left = Math.max(0, u.endAt - (Date.now() + clockOffset));
  const s = Math.ceil(left / 1000);
  $('#clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const pct = Math.min(100, (left / room.duration) * 100);
  const bar = $('#timebar');
  bar.style.width = `${pct}%`;
  bar.style.background = pct < 20 ? 'var(--bad)' : pct < 50 ? 'var(--accent)' : 'var(--good)';
}, 250);

// ---------- bảng xếp hạng (trang chủ) ----------
let topMode = 'coop', topSize = 0;
function renderTopPickers() {
  $('#topMode').replaceChildren(...Object.keys(MODE_NAMES).map((m) => el('button', {
    textContent: MODE_NAMES[m], className: m === topMode ? 'on' : '', onclick: () => { topMode = m; loadTop(); },
  })));
  $('#topSize').replaceChildren(...SIZES.map(([c, r], i) => el('button', {
    textContent: `${c}×${r}`, className: i === topSize ? 'on' : '', onclick: () => { topSize = i; loadTop(); },
  })));
}
async function loadTop() {
  renderTopPickers();
  const list = $('#topList');
  try {
    const r = await fetch(`/api/top?mode=${topMode}&size=${topSize}`);
    const rows = await r.json();
    list.replaceChildren(...(rows.length ? rows.map((x) => el('li', {},
      el('span', { textContent: x.names }),
      el('b', { textContent: x.score }),
      el('small', { textContent: x.cleared ? t(` phá đảo`, ` cleared`) : t(` màn ${x.level}`, ` level ${x.level}`) }),
    )) : [el('p', { className: 'muted', textContent: t('Chưa có ai — chơi ván đầu đi!', 'No one yet — play the first round!') })]));
  } catch {
    list.replaceChildren(el('p', { className: 'muted', textContent: t('Không tải được (mất mạng?)', "Couldn't load (offline?)") }));
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

const initial = new URLSearchParams(location.search).get('r');
if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);
else loadTop();

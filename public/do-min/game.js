import { SIZES, HIDDEN, FLAG, BOOM, LIVES } from './logic.js';
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, addReroll, loadDeviceId } from '../names.js';
import { createPanel } from '../panel.js';
import { t, tx } from '../i18n.js';
import { roomClient, newRoomCode } from '../room-client.js';
import { publicSwitch } from '../public-switch.js';
import { replayParam, playReplay, replayLinks } from '../replay.js';
import { $, el, store } from '../dom.js';

hydrateIcons();

// Cùng danh tính thiết bị với các game khác (pk.id / pk.name).
let deviceId = loadDeviceId();
// Xem lại ván (?replay=<id>): không vào phòng, chỉ phát lại tin đã ghi (góc nhìn ghế 1). Người xem không phải người chơi
// (deviceId rỗng) nên bàn hiện là bàn ghế 1 (view() lấy bàn đầu tiên), không bấm / gửi được gì.
const rp = replayParam();
if (rp) deviceId = '';
$('#name').value = deviceName();
addReroll($('#name'));
const myName = () => $('#name').value.trim() || t('Người chơi', 'Player');

const COLORS = ['#5cc8ff', '#ff7ab6', '#7dff9a', '#ffb454', '#c49bff', '#ffe66b', '#6bf0e0', '#ff9b9b'];
const LONG_PRESS_MS = 400;
// Giao diện là lựa chọn riêng từng máy (không đổi màn hình người khác).
const SKINS = { modern: t('Hiện đại', 'Modern'), xp: 'Windows XP', choco: t('Socola', 'Chocolate') };
let skin = SKINS[store.get('ms.skin')] ? store.get('ms.skin') : 'modern';
const gap = () => (skin === 'modern' ? 2 : 0); // skin cổ điển: ô sát nhau như bản gốc
function applySkin() {
  for (const k of Object.keys(SKINS)) document.body.classList.toggle(`skin-${k}`, k === skin);
  builtFor = '';
}

let code = null, room = null, grids = {}, mines = null, clockOffset = 0, flagMode = false;
let peek = false; // hết ván: ẩn bảng kết quả để xem mìn nằm đâu
let quiet = false; // đang tua bản xem lại (phát nhanh cả loạt tin): tắt âm, rung, toast, hiệu ứng ping
let cursors = {};
// Ván xong: nút "Xem lại / Chia sẻ" dưới dòng chữ của bảng kết quả (render() thay theo result.rp).
let rpLinks = replayLinks(null), shownRp = null;
$('#ovText').after(rpLinks);
const panel = createPanel({ root: $('#panel'), toggle: $('#btnPanel'), storeKey: 'ms.panel' });

const me = () => room?.players.find((p) => p.id === deviceId);
const view = () => me()?.unit ?? Object.keys(grids)[0] ?? null;
const size = () => SIZES[room?.size ?? 0];
const playing = () => room?.status === 'playing' && me()?.unit && !room.units[me().unit]?.done;
const colorOf = (id) => COLORS[Math.max(0, room?.players.findIndex((p) => p.id === id) ?? 0) % COLORS.length];
const nameOf = (id) => room?.players.find((p) => p.id === id)?.name ?? '';

// ---------- âm thanh (dùng lại bộ âm của Pikachu) ----------
let soundOn = store.get('ms.sound') !== '0';
const SND = Object.fromEntries(Object.entries({ open: 'sound2', boom: 'sound1', start: 'sound4', win: 'sound5' })
  .map(([k, f]) => [k, new Audio(`../pikachu/sound/${f}.mp3`)]));
function play(k) { if (!soundOn || quiet) return; SND[k].currentTime = 0; SND[k].play().catch(() => {}); }
function renderSound() { $('#btnSound').innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); }
$('#btnSound').onclick = () => { soundOn = !soundOn; store.set('ms.sound', soundOn ? '1' : '0'); renderSound(); };
renderSound();

// ---------- vào / rời phòng ----------
function enter(c) {
  code = c.toUpperCase();
  store.set('pk.name', myName());
  history.replaceState(null, '', `?r=${code}`);
  $('#roomCode').textContent = code;
  $('#home').hidden = true;
  $('#room').hidden = false;
  room = mines = null;
  grids = {}; cursors = {};
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
  path: () => `/api/ms/room/${code}`, query: () => ({ id: deviceId, name: myName() }), onMsg, onLeave: leave, conn: $('#conn'),
});
const send = (m) => net.send(m);
// Công tắc "Công khai" (hiện ở /phong/) trong thẻ sảnh chờ, ngay trên nút Bắt đầu.
const pub = publicSwitch(send);
$('#btnStart').before(pub.el);

function onMsg(m) {
  switch (m.t) {
    case 'error': return leave(m.msg);
    case 'state': {
      const was = room?.status;
      room = m;
      clockOffset = m.now - Date.now();
      if (m.status === 'playing' && was !== 'playing') { mines = null; peek = false; play('start'); }
      if (was === 'playing' && m.status === 'ended') {
        const won = m.mode === 'coop' ? !!m.winner : m.winner === me()?.unit;
        play(won ? 'win' : 'boom');
        cursors = {};
      }
      break;
    }
    case 'grid':
      // Chép mảng: 'open' sửa bàn tại chỗ, còn tin xem lại được phát lại nhiều lần (tua) nên không được đụng vào tin gốc.
      grids = { ...grids, ...Object.fromEntries(Object.entries(m.grids).map(([uid, g]) => [uid, [...g]])) };
      break;
    case 'open': {
      const g = grids[m.unit];
      if (!g) return;
      for (const [i, v] of m.cells) g[i] = v;
      if (m.unit === view() && !quiet) {
        if (m.boom) { play('boom'); shake(); if (m.by !== deviceId) toast.error(t(`${nameOf(m.by)} đạp mìn!`, `${nameOf(m.by)} hit a mine!`), { icon: 'bomb' }); }
        else if (m.by === deviceId && m.cells.some(([, v]) => v >= 0)) play('open');
      }
      break;
    }
    case 'reveal':
      mines = new Set(m.mines);
      break;
    case 'cur':
      if (m.p) cursors[m.id] = m.p; else delete cursors[m.id];
      return renderCursors();
    case 'ping':
      return quiet || pingFx(m.i, colorOf(m.id), nameOf(m.id));
    default:
      return;
  }
  if (!quiet) render();
}

// ---------- nút ----------
$('#btnCreate').onclick = () => enter(newRoomCode());
$('#btnJoin').onclick = () => {
  const c = $('#code').value.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(c)) enter(c); else toast.warning(t('Mã phòng gồm 4 ký tự', 'Room code is 4 characters'));
};
$('#code').onkeydown = (e) => { if (e.key === 'Enter') $('#btnJoin').click(); };
$('#btnLeave').onclick = () => leave();
$('#btnStart').onclick = () => send({ t: 'start' });
$('#btnCopy').onclick = () => invite(`${location.origin}/do-min/?r=${code}`, code);
$('#btnSkin').onclick = () => {
  const keys = Object.keys(SKINS);
  skin = keys[(keys.indexOf(skin) + 1) % keys.length];
  store.set('ms.skin', skin);
  applySkin();
  toast(t(`Giao diện: ${SKINS[skin]}`, `Theme: ${SKINS[skin]}`));
  render();
};
$('#btnPeek').onclick = () => { peek = true; render(); };
$('#btnResult').onclick = () => { peek = false; render(); };
$('#face').onclick = () => { if (room?.status === 'ended' && room.host === deviceId) send({ t: 'start' }); };
$('#btnFlag').onclick = () => { flagMode = !flagMode; $('#btnFlag').classList.toggle('on', flagMode); toast(flagMode ? t('Chạm để cắm cờ', 'Tap to flag') : t('Chạm để mở ô', 'Tap to open'), { icon: 'flag' }); };
for (const b of document.querySelectorAll('#modePick button')) b.onclick = () => send({ t: 'config', mode: b.dataset.mode });
const SIZE_NAMES = { 'Dễ': 'Easy', 'Vừa': 'Medium', 'Khó': 'Hard' };
$('#sizePick').replaceChildren(...SIZES.map((z, i) => el('button', {
  textContent: t(`${z.name} ${z.cols}×${z.rows}`, `${SIZE_NAMES[z.name]} ${z.cols}×${z.rows}`),
  title: t(`${z.mines} mìn`, `${z.mines} mines`), onclick: () => send({ t: 'config', size: i }),
})));

// ---------- bàn ----------
let geo = { s: 24, portrait: false, R: 9, C: 9, g: 2 };
// Bàn ngang (Khó 30x16) trên màn dọc thì xoay cho ô đỡ bé, giống Pikachu.
function layout() {
  const wrap = $('#boardWrap');
  const { rows: R, cols: C } = size();
  const portrait = wrap.clientHeight > wrap.clientWidth && C > R;
  const gc = portrait ? R : C, gr = portrait ? C : R;
  const g = gap();
  const s = Math.max(14, Math.floor(Math.min((wrap.clientWidth - (gc - 1) * g - 20) / gc, (wrap.clientHeight - (gr - 1) * g - 20) / gr, 44)));
  geo = { s, portrait, R, C, g };
  const b = $('#board');
  b.style.width = `${gc * s + (gc - 1) * g}px`;
  b.style.height = `${gr * s + (gr - 1) * g}px`;
  $('#cells').style.gap = `${g}px`;
  b.style.setProperty('--s', `${s}px`);
  $('#cells').style.gridTemplateColumns = `repeat(${gc}, ${s}px)`;
  $('#cells').style.gridTemplateRows = `repeat(${gr}, ${s}px)`;
}
// Ô logic i -> vị trí hiển thị (có xoay).
const disp = (i) => { const r = Math.floor(i / geo.C), c = i % geo.C; return geo.portrait ? [c, r] : [r, c]; }; // [hàng, cột] hiển thị
const cellPx = (i) => { const [dr, dc] = disp(i); return [dc * (geo.s + geo.g), dr * (geo.s + geo.g)]; };

let builtFor = '';
function renderBoard() {
  const g = grids[view()];
  const cells = $('#cells');
  if (!g || !room || room.status === 'lobby') { cells.replaceChildren(); builtFor = ''; return; }
  layout();
  const key = `${view()}|${room.size}|${geo.portrait}|${geo.s}`;
  if (builtFor !== key) {
    // Dựng lưới 1 lần; sau đó chỉ đổi class từng ô (bàn Khó có 480 ô).
    const nodes = new Array(g.length);
    for (let i = 0; i < g.length; i++) {
      const [dr, dc] = disp(i);
      nodes[i] = el('div', { className: 'm' });
      nodes[i].dataset.i = i;
      nodes[i].style.gridRow = dr + 1;
      nodes[i].style.gridColumn = dc + 1;
    }
    cells.replaceChildren(...nodes);
    builtFor = key;
  }
  for (let i = 0; i < g.length; i++) {
    const v = g[i], n = cells.children[i];
    let cls = 'm';
    if (v >= 0) cls += ` o${v ? ` n${v}` : ''}`;
    else if (v === FLAG) cls += mines && !mines.has(i) ? ' f wf' : ' f';
    else if (v === BOOM) cls += ' b';
    else if (mines?.has(i)) cls += ' x';
    if (n.className !== cls) n.className = cls;
    const t = v > 0 ? String(v) : '';
    if (n.textContent !== t) n.textContent = t;
  }
  renderCursors();
}

function shake() {
  const b = $('#board');
  b.classList.remove('shake');
  void b.offsetWidth;
  b.classList.add('shake');
}

function fx(node, ms) { $('#fx').append(node); setTimeout(() => node.remove(), ms); }
function pingFx(i, color, who) {
  if (!grids[view()]) return;
  const [x, y] = cellPx(i);
  const n = el('div', { className: 'ping' }, el('span', { textContent: who }));
  n.style.cssText = `left:${x}px;top:${y}px;width:${geo.s}px;height:${geo.s}px;--c:${color}`;
  fx(n, 1600);
}

// Chuột đồng đội (chơi chung): toạ độ theo ô logic nên đúng cả khi bàn bị xoay.
function renderCursors() {
  const layer = $('#fx');
  const alive = new Set();
  for (const [id, [r, c]] of Object.entries(cursors)) {
    const p = room?.players.find((x) => x.id === id);
    if (!p?.online) continue;
    alive.add(id);
    let n = layer.querySelector(`.cursor[data-id="${CSS.escape(id)}"]`);
    if (!n) {
      n = el('div', { className: 'cursor', innerHTML: icon('mouse-pointer-2') });
      n.dataset.id = id;
      n.append(el('span', { textContent: p.name }));
      layer.append(n);
    }
    n.style.setProperty('--c', colorOf(id));
    const [dr, dc] = geo.portrait ? [c, r] : [r, c];
    n.style.left = `${dc * (geo.s + geo.g)}px`;
    n.style.top = `${dr * (geo.s + geo.g)}px`;
  }
  for (const n of layer.querySelectorAll('.cursor')) if (!alive.has(n.dataset.id)) n.remove();
}

const shared = () => room?.mode === 'coop';
let lastCur = 0, curTimer = null;
$('#boardWrap').addEventListener('pointermove', (e) => {
  if (!shared() || !playing()) return;
  const rect = $('#board').getBoundingClientRect();
  const x = (e.clientX - rect.left) / (geo.s + geo.g), y = (e.clientY - rect.top) / (geo.s + geo.g);
  const p = (geo.portrait ? [x, y] : [y, x]).map((v) => Math.round(v * 100) / 100);
  const wait = 50 - (Date.now() - lastCur);
  clearTimeout(curTimer);
  const go = () => { lastCur = Date.now(); send({ t: 'cur', p }); };
  if (wait <= 0) go(); else curTimer = setTimeout(go, wait);
});
$('#boardWrap').addEventListener('pointerleave', () => { clearTimeout(curTimer); if (shared() && playing()) send({ t: 'cur', p: null }); });

// Mở ô: bấm vào ô số đã mở = "chord" (mở nhanh xung quanh khi đủ cờ).
function act(i, flag) {
  const g = grids[view()];
  if (!playing() || !g) return;
  if (flag) return send({ t: 'flag', i });
  if (g[i] > 0) return send({ t: 'chord', i });
  if (g[i] === HIDDEN) send({ t: 'open', i });
}
function ping(i) {
  if (!shared() || !playing()) return;
  send({ t: 'ping', i });
  pingFx(i, colorOf(deviceId), t('Bạn', 'You'));
}

let press = null;
$('#cells').addEventListener('contextmenu', (e) => e.preventDefault());
$('#cells').addEventListener('pointerdown', (e) => {
  const i = Number(e.target.dataset?.i);
  if (!Number.isInteger(i)) return;
  if (e.pointerType === 'mouse') {
    if (e.shiftKey) return ping(i);
    if (e.button === 2) return act(i, true);
    if (e.button === 0) return act(i, flagMode);
    return;
  }
  // Cảm ứng: chạm = mở (hoặc cắm cờ nếu bật chế độ cờ), giữ = cắm cờ.
  clearTimeout(press?.timer);
  press = { i, timer: setTimeout(() => { press = null; act(i, true); navigator.vibrate?.(20); }, LONG_PRESS_MS) };
});
addEventListener('pointerup', () => {
  if (!press) return;
  clearTimeout(press.timer);
  const { i } = press;
  press = null;
  act(i, flagMode);
});
addEventListener('pointercancel', () => { clearTimeout(press?.timer); press = null; });
new ResizeObserver(() => render()).observe($('#boardWrap'));

// ---------- HUD + khung người chơi ----------
// Thời gian của bàn (đã gồm phạt đạp mìn khi đua): xong bàn thì cố định, ván xong thì dừng ở lúc kết thúc.
function elapsed(u) {
  if (!room?.startedAt) return 0;
  if (u?.done === 'clear') return u.time;
  const end = room.status === 'ended' ? room.endedAt : rp ? room.now : Date.now() + clockOffset; // xem lại: giờ của khung đang phát
  return Math.max(0, end - room.startedAt + (u?.penalty ?? 0));
}
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function renderPanel() {
  if (room?.status !== 'playing') return panel.update([]);
  const mine = view();
  const tiles = [];
  for (const p of room.players) {
    if (p.spec || p.id === deviceId) continue;
    const u = room.units[p.unit];
    if (p.unit !== mine && u) {
      // Đua: chỉ hiện tiến độ (thấy bàn đối thủ là chép được ô an toàn).
      const pct = Math.floor((u.opened / u.total) * 100);
      tiles.push({
        key: p.id, name: p.name, color: colorOf(p.id), off: !p.online,
        sub: t(`${pct}% · nổ ${u.booms}`, `${pct}% · boom ${u.booms}`), badge: u.done === 'clear' ? { icon: 'trophy' } : '',
        version: `${pct}|${u.booms}`,
        draw: (ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          const r = Math.min(w, h) * 0.36, cx = w / 2, cy = h / 2;
          ctx.lineWidth = r * 0.22;
          ctx.strokeStyle = '#ffffff22';
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = colorOf(p.id);
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100); ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `800 ${Math.round(r * 0.6)}px "Be Vietnam Pro", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${pct}%`, cx, cy);
        },
      });
    } else {
      tiles.push({ key: p.id, name: p.name, color: colorOf(p.id), off: !p.online, sub: t(`mở ${p.opened} · nổ ${p.booms}`, `opened ${p.opened} · boom ${p.booms}`) });
    }
  }
  panel.update(tiles);
}

function render() {
  renderBoard();
  renderPanel();
  const r = room, u = r?.units[view()], z = size();
  const g = grids[view()];
  const flags = g ? g.filter((v) => v === FLAG || v === BOOM).length : 0;
  $('#minesLeft').querySelector('b').textContent = z.mines - flags;
  led($('#ledMines'), z.mines - flags);
  renderFace();
  $('#lives').hidden = !(r?.status === 'playing' && r.mode === 'coop');
  if (u) $('#lives').replaceChildren(...Array.from({ length: LIVES }, (_, i) => iconEl(i < u.lives ? 'heart' : 'heart-off')));

  const players = [...(r?.players ?? [])].filter((p) => !p.spec);
  $('#players').replaceChildren(...players.map((p) => {
    const li = el('li', { className: `${p.id === deviceId ? 'me' : ''} ${p.online ? '' : 'off'}` });
    li.style.setProperty('--c', colorOf(p.id));
    if (p.id === r.host) li.innerHTML = icon('crown');
    li.append(`${p.name}${p.id === deviceId ? t(' (bạn)', ' (you)') : ''} · `, el('b', { textContent: t(`mở ${p.opened}`, `opened ${p.opened}`) }), p.booms ? t(` · nổ ${p.booms}`, ` · boom ${p.booms}`) : '');
    return li;
  }));

  const isHost = r?.host === deviceId;
  pub.update(r, isHost);
  const ov = $('#overlay');
  const lobbyish = r && r.status !== 'playing';
  $('#modePick').hidden = $('#sizePick').hidden = !lobbyish || !!rp;
  for (const b of document.querySelectorAll('#modePick button')) { b.classList.toggle('on', b.dataset.mode === r?.mode); b.disabled = !isHost; }
  [...$('#sizePick').children].forEach((b, i) => { b.classList.toggle('on', i === r?.size); b.disabled = !isHost; });
  $('#ovScore').hidden = true;
  if (!r) {
    ov.hidden = false;
    $('#ovTitle').textContent = rp ? t('Đang tải bản xem lại…', 'Loading replay…') : t('Đang kết nối…', 'Connecting…');
    $('#ovText').textContent = '';
    $('#btnStart').hidden = true;
  } else if (r.status === 'playing') {
    ov.hidden = !me()?.spec && !u?.done;
    if (!ov.hidden) {
      $('#ovTitle').textContent = me()?.spec ? t('Bạn đang xem', 'You are watching') : t('Xong bàn!', 'Board done!');
      $('#ovText').textContent = me()?.spec ? t('Ván sau bạn sẽ được chơi.', 'You will play next round.') : t('Chờ những người khác…', 'Waiting for others…');
      $('#btnStart').hidden = true;
      if (me()?.spec) ov.hidden = true;
    }
  } else {
    ov.hidden = false;
    const coop = r.mode === 'coop';
    if (r.status === 'lobby') {
      $('#ovTitle').textContent = t(`Phòng ${code}`, `Room ${code}`);
      $('#ovText').textContent = t(`${players.length}/4 người. `, `${players.length}/4 players. `) + (coop
        ? t(`Cả phòng chung một bàn, chung ${LIVES} mạng — thấy chuột nhau, Shift+bấm để ping ô nghi có mìn.`, `The whole room shares one board and ${LIVES} lives — see each other's cursors, Shift+click to ping a suspected mine.`)
        : t('Cùng một đề mìn, mỗi người một bàn. Đạp mìn +10 giây. Ai mở hết trước thắng.', 'Same mine layout, one board each. Hitting a mine adds 10 seconds. First to clear it wins.')) + (isHost ? '' : t(' Chờ chủ phòng bắt đầu.', ' Waiting for the host to start.'));
    } else {
      const wu = r.units[r.winner];
      const title = coop ? (r.winner ? t('Cả đội dò sạch mìn!', 'The team cleared the mines!') : t('Hết mạng rồi…', 'Out of lives…'))
        : r.winner === me()?.unit ? t('Bạn thắng!', 'You win!') : t(`${nameOf(r.winner)} thắng`, `${nameOf(r.winner)} wins`);
      $('#ovTitle').replaceChildren(iconEl(r.winner ? 'trophy' : 'bomb'), ' ', title);
      $('#ovScore').hidden = false;
      $('#ovScore').textContent = wu
        ? t(`Thời gian ${fmt(wu.time)}${wu.penalty ? ` (gồm phạt ${wu.penalty / 1000}s)` : ''}`, `Time ${fmt(wu.time)}${wu.penalty ? ` (incl. ${wu.penalty / 1000}s penalty)` : ''}`)
        : t(`Đã mở ${u?.opened ?? 0}/${u?.total ?? 0} ô`, `Opened ${u?.opened ?? 0}/${u?.total ?? 0} cells`);
      $('#ovText').textContent = rp ? '' : isHost ? t('Ván mới?', 'New round?') : t('Chờ chủ phòng mở ván mới.', 'Waiting for the host to start a new round.');
    }
    $('#btnStart').hidden = !isHost;
    $('#btnStart').textContent = r.status === 'lobby' ? t('Bắt đầu', 'Start') : t('Chơi ván mới', 'New round');
    if (r.status === 'ended' && peek) ov.hidden = true;
  }
  // Ván xong: nút "Xem lại / Chia sẻ" (đang xem lại thì thanh phát đã có nút chia sẻ).
  const rid = (!rp && r?.status === 'ended' && r.result?.rp) || null;
  if (rid !== shownRp) { const n = replayLinks(rid); rpLinks.replaceWith(n); rpLinks = n; shownRp = rid; }
  $('#btnPeek').hidden = r?.status !== 'ended';
  $('#btnResult').hidden = !(r?.status === 'ended' && peek);
}

setInterval(() => {
  const ms = !room || room.status === 'lobby' ? 0 : elapsed(room.units[view()]);
  $('#clock').textContent = fmt(ms);
  led($('#ledTime'), Math.min(999, Math.floor(ms / 1000)));
}, 250);

// Bộ đếm LED 3 chữ số (skin cổ điển). Chỉ dựng lại khi số đổi.
function led(box, n) {
  const v = n < 0 ? `-${String(Math.min(99, -n)).padStart(2, '0')}` : String(Math.min(999, n)).padStart(3, '0');
  if (box.dataset.v === v) return;
  box.dataset.v = v;
  box.replaceChildren(...[...v].map((d) => el('img', { src: `skins/led/counter${d}.svg`, alt: d })));
}

// Mặt cười: đang bấm -> "ô", thắng -> kính râm, thua -> x_x.
let pressing = false;
function renderFace() {
  const r = room, u = r?.units[view()];
  let f = 'smileface';
  if (r?.status === 'ended') f = (r.mode === 'coop' ? r.winner : r.winner === me()?.unit) ? 'winface' : 'lostface';
  else if (u?.done === 'clear') f = 'winface';
  else if (pressing && playing()) f = 'clickface';
  const src = `skins/face/${f}.svg`;
  const img = $('#face img');
  if (!img.src.endsWith(src)) img.src = src;
}
addEventListener('pointerdown', (e) => { if (e.target.closest?.('#cells')) { pressing = true; renderFace(); } });
addEventListener('pointerup', () => { if (pressing) { pressing = false; setTimeout(renderFace, 60); } });
applySkin();
window.ms = { get room() { return room; }, get grids() { return grids; }, view }; // cho test tự động

const initial = new URLSearchParams(location.search).get('r');
if (rp) {
  $('#home').hidden = true;
  $('#room').hidden = false;
  $('#room').style.paddingBottom = '72px'; // chừa chỗ thanh phát
  for (const s of ['#btnCopy', '#conn', '#btnFlag']) $(s).hidden = true;
  $('#btnLeave').onclick = () => { location.href = location.pathname; };
  render();
  playReplay(rp, {
    feed: onMsg,
    // Tua: dọn sạch rồi phát lại nhanh từ đầu (cùng lượt JS), xong lượt đó mới vẽ + bật lại âm thanh.
    reset: () => {
      room = mines = null;
      grids = {}; cursors = {}; peek = false;
      quiet = true;
      setTimeout(() => { quiet = false; render(); });
    },
  });
} else if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);

import { nokiaApp } from '../nokia/room.js';
import { COLS, BLOCK, CELLS, PER_ROW, MAX_NUMBER, COLOR_COUNT, MAX_CARDS, PACES, numberAt, rowsOf, waitRows, numberWords, numberWordsEn, callLine } from './logic.js';
import { createVoice, VOICE_MODES } from './voice.js';
import { t, en } from '../i18n.js';
import { iconEl } from '../icons.js';
import { el } from '../dom.js';

// Lô tô nhiều người (server: worker/games/loto.js, phòng /api/nk/loto/room/CODE). Màn chơi: số vừa hô + nút hô / tốc độ tự hô
// của chủ phòng (vạch đếm ngược tới số kế tiếp), bảng 90 số đã hô (đầu ván là chỗ mua tờ: chọn màu, mỗi màu một tờ, đổi tờ
// khác), các tờ dò 9×9 của mình (tab / vuốt ngang để đổi tờ; chạm số đã hô để đặt hạt), dòng CHỜ, nút "Tự dò" và nút KINH.
// Bảng màu tờ theo COLOR_COUNT ở logic.js: [màu nền, tên vi, tên en].
const PALETTE = [['#c62828', 'đỏ', 'red'], ['#1e8a4a', 'xanh lá', 'green'], ['#1f5fbf', 'xanh dương', 'blue'], ['#d99a00', 'vàng', 'yellow'],
  ['#7b3bb8', 'tím', 'purple'], ['#e0640f', 'cam', 'orange'], ['#d23f7c', 'hồng', 'pink'], ['#0b8a8a', 'xanh ngọc', 'teal']];
const NOT_CALLED_MS = 1500; // nhắc "số này chưa hô" thưa thôi
const SWIPE_PX = 40; // vuốt ngang tối thiểu để sang tờ khác
const VE_PACE = 5; // tự hô chậm từ chừng này giây (hoặc hô tay) thì đọc cả câu vè, nhanh hơn thì chỉ đọc số

let ball, count, paceEl, callBtn, paceBtn, waitEl, timer, veEl, pop, voiceBtn, board, shop, swatches, shopNote, sheet, tabs, ticket, strip, kinhBtn, autoBtn, status;
let cells = [], nums = [], sel = 0, seen = -1, nagAt = 0, timerAt = 0;

const voice = createVoice({
  lang: en ? 'en' : 'vi',
  onMissing: (m) => app.toast.warning(m === 'vi' ? t('Máy không có giọng tiếng Việt — chỉ hiện số trên màn hình', 'No Vietnamese voice on this device — numbers are shown on screen only')
    : t('Máy không có giọng tiếng Anh — chỉ hiện số trên màn hình', 'No English voice on this device — numbers are shown on screen only'), { icon: 'megaphone-off', duration: 5000 }),
});

const nameOf = (r, id) => r?.players.find((p) => p.id === id)?.name ?? '?';

const app = nokiaApp({
  game: 'loto',
  path: '/loto/',
  title: t('Lô tô', 'Lo To'),
  sub: t('Lô tô hội chợ chơi cùng bạn bè: mỗi người một tờ dò, chủ phòng hô số, hàng nào đủ 5 số thì hô KINH!', 'Vietnamese fair-style bingo with friends: everyone gets a card, the host calls numbers, fill a row of 5 and shout KINH!'),
  help: t('Tờ dò có 9 hàng (3 khối), mỗi hàng 5 số; cột 1: 1–9, cột 2: 10–19, ..., cột 9: 80–90. Đầu ván chọn màu tờ (1–6 tờ, đổi tờ khác được). Chủ phòng bấm "Bắt đầu hô", sau đó số tự hô đều đặn (đổi tốc độ hoặc tắt để tự bấm "Hô số"). Số có trên tờ thì chạm để đặt hạt (hoặc bật "Tự dò"). Hàng còn thiếu 1 số là CHỜ. Hàng ngang đủ 5 số đã hô thì bấm KINH — kinh sai là "kinh láo"! Nhiều người kinh cùng lúc thì chia giải.',
    'Each card has 9 rows (3 blocks) of 5 numbers; column 1: 1–9, column 2: 10–19, ..., column 9: 80–90. At the start pick card colours (1–6 cards, swap for another if you like). The host taps "Start calling", then numbers are called automatically (change the speed, or turn it off and tap "Call"). Tap a called number on your card to place a chip (or turn on "Auto mark"). A row missing one number is WAITING. When a row has all 5 numbers called, tap KINH — a false claim is announced to everyone! Simultaneous claims share the win.'),
  lobbyText: (r) => (r.players.length > 1 ? t('Đầu ván mỗi người chọn tờ (1–6 tờ, theo màu); chủ phòng bắt đầu hô.', 'At the start everyone picks cards (1–6, by colour); the host starts calling.')
    : t('Chơi một mình: chọn tờ, tự hô, tự dò.', 'Playing alone: pick cards, call and mark the numbers yourself.')),
  lobby(box, r, isHost, setCfg) {
    box.append(el('div', { className: 'seg' }, t('Tự hô ', 'Auto call '), ...PACES.map((s) => el('button', {
      textContent: paceName(s), className: (r.cfg.pace ?? 0) === s ? 'on' : '', disabled: !isHost, onclick: () => setCfg({ pace: s }),
    }))));
  },
  badge: (p, r) => {
    const v = r.view;
    if (r.status !== 'playing' || v?.best?.[p.id] == null) return '';
    if (v.kinh?.wins.some((w) => w.id === p.id)) return 'KINH';
    return v.best[p.id] === PER_ROW - 1 ? t('CHỜ', 'WAIT') : `${v.best[p.id]}/${PER_ROW}`;
  },
  scoreText: (v) => (v >= PER_ROW ? 'KINH' : v === PER_ROW - 1 ? t('chờ', 'one away') : `${v}/${PER_ROW}`),
  mount(stage) {
    ball = el('div', { className: 'ball' });
    count = el('b', { className: 'count' });
    callBtn = el('button', { className: 'primary call', hidden: true, onclick: () => app.send({ a: 'call' }) });
    paceBtn = el('button', { className: 'pace', hidden: true, title: t('Tự hô: bấm để đổi tốc độ / tắt', 'Auto call: tap to change speed / turn off'), onclick: nextPace });
    waitEl = el('span', { className: 'wait', hidden: true });
    paceEl = el('small', { className: 'pace-note' });
    timer = el('i', { className: 'timer', hidden: true });
    veEl = el('p', { className: 've' });
    pop = el('div', { className: 'pop' }, el('b'), el('span'));
    voiceBtn = el('button', { className: 'voice', onclick: nextVoice });
    const header = stage.closest('#room').querySelector('header');
    header.insertBefore(voiceBtn, header.lastElementChild);
    renderVoice();
    nums = Array.from({ length: MAX_NUMBER }, (_, k) => el('span', { textContent: k + 1 }));
    board = el('div', { className: 'board', title: t('Bảng số đã hô', 'Called numbers') }, ...nums);
    swatches = Array.from({ length: COLOR_COUNT }, (_, c) => el('button', { title: t(`Tờ ${PALETTE[c][1]}`, `${PALETTE[c][2]} card`), onclick: () => toggleColor(c) }));
    swatches.forEach((b, c) => { b.style.setProperty('--c', PALETTE[c][0]); });
    shopNote = el('span', { className: 'note' });
    shop = el('div', { className: 'shop' },
      el('p', { textContent: t(`Mua tờ: chạm màu để lấy thêm / trả bớt (1–${MAX_CARDS} tờ)`, `Buy cards: tap a colour to add / return one (1–${MAX_CARDS})`) }),
      el('div', { className: 'swatches' }, ...swatches),
      el('div', { className: 'row' }, el('button', { className: 'swap', onclick: () => app.send({ a: 'swap', k: sel }) }, iconEl('shuffle'), t(' Đổi tờ này', ' Swap this card')), shopNote));
    cells = Array.from({ length: CELLS }, (_, j) => el('button', { className: 'cell', onclick: () => mark(j) }));
    strip = el('div', { className: 'strip' });
    ticket = el('div', { className: 'ticket' }, strip, el('div', { className: 'grid' }, ...cells));
    tabs = el('div', { className: 'tabs' });
    const wrap = el('div', { className: 'wrap' }, ticket);
    swipe(wrap);
    sheet = el('div', { className: 'sheet' }, tabs, wrap);
    status = el('p', { className: 'status' });
    autoBtn = el('button', { className: 'auto', onclick: () => app.send({ a: 'auto', on: !app.room?.view?.auto }) }, iconEl('sparkles'), t(' Tự dò', ' Auto mark'));
    kinhBtn = el('button', { className: 'kinh', textContent: 'KINH!', onclick: () => app.send({ a: 'kinh' }) });
    stage.append(el('div', { className: 'lt' },
      el('div', { className: 'now' }, ball, el('div', { className: 'meta' }, el('small', { textContent: t('Số vừa hô', 'Just called') }), count, paceEl), paceBtn, callBtn, waitEl, veEl, timer),
      board, shop, sheet, el('div', { className: 'bar' }, status, autoBtn, kinhBtn)), pop);
  },
  render(r) {
    const v = r.view;
    if (!v) return;
    // Số mới (kể cả số đầu tiên của ván); lần đầu vào phòng / vào lại thì không đọc lại số cũ.
    if (seen >= 0 && v.called.length > seen && r.status === 'playing') announce(v);
    seen = v.called.length;
    paint(r);
  },
  onState(m, prev) {
    const wins = m.view?.kinh?.wins ?? [], before = prev?.view?.kinh?.wins.length ?? 0;
    if (m.status !== 'playing' || wins.length <= before) return;
    for (const w of wins.slice(before)) app.toast.success(t(`${nameOf(m, w.id)} KINH! Đang dò vé…`, `${nameOf(m, w.id)} shouts KINH! Checking…`), { icon: 'party-popper' });
    app.beep(1568, 220, 'triangle');
  },
  onMsg(m) {
    if (m.t === 'loto' && m.e === 'lao') app.toast.warning(t(`${nameOf(app.room, m.id)} kinh láo! Phạt hát một bài.`, `${nameOf(app.room, m.id)} made a false KINH! Sing a song as a forfeit.`), { icon: 'triangle-alert' });
  },
});

function mark(j) {
  const r = app.room, v = r?.view;
  if (app.replay || r?.status !== 'playing' || !v?.cards) return;
  const i = sel * CELLS + j, n = numberAt(v.cards, i);
  if (n == null || v.marked.includes(i)) return;
  if (v.called.includes(n)) return app.send({ a: 'mark', i });
  if (Date.now() - nagAt > NOT_CALLED_MS) { nagAt = Date.now(); app.toast(t(`Số ${n} chưa hô`, `${n} has not been called`), { icon: 'info' }); }
}

// Số mới: bóng số to giữa màn ~1,5 giây + câu vè, tiếng bíp, người hô đọc số (giọng đã chọn).
function announce(v) {
  const n = v.called.at(-1), line = callLine(n, v.called.length);
  const [num, text] = pop.children;
  num.textContent = n;
  text.textContent = t(line.text, `Number ${n}!`);
  pop.classList.remove('show');
  pop.getBoundingClientRect();
  pop.classList.add('show');
  app.beep(980, 90, 'sine');
  voice.speak({ vi: !v.pace || v.pace >= VE_PACE ? line.say : `Số ${numberWords(n)}!`, en: `Number ${numberWordsEn(n)}!` });
}

// Giọng người hô: Tiếng Việt -> English -> tắt. Đổi giọng thì đọc thử (cũng mở khoá đọc trên iOS vì đang trong lần chạm).
function nextVoice() {
  voice.mode = VOICE_MODES[(VOICE_MODES.indexOf(voice.mode) + 1) % VOICE_MODES.length];
  renderVoice();
  voice.speak({ vi: 'Lô tô xin chào bà con!', en: 'Lo to, hello everyone!' });
  app.toast(voice.mode === 'off' ? t('Tắt giọng đọc số', 'Number voice off') : voice.mode === 'vi' ? t('Đọc số bằng tiếng Việt', 'Numbers read in Vietnamese') : t('Đọc số bằng tiếng Anh', 'Numbers read in English'),
    { icon: voice.mode === 'off' ? 'megaphone-off' : 'megaphone' });
}

function renderVoice() {
  const m = voice.mode;
  voiceBtn.hidden = !voice.supported;
  voiceBtn.title = t('Giọng đọc số: Tiếng Việt / English / tắt', 'Number voice: Vietnamese / English / off');
  voiceBtn.replaceChildren(iconEl(m === 'off' ? 'megaphone-off' : 'megaphone'), m === 'off' ? '' : ` ${m.toUpperCase()}`);
}

function paceName(s) {
  return s ? `${s}s` : t('Tắt', 'Off');
}

// Chủ phòng đổi tốc độ tự hô: 5s -> 8s -> tắt -> 3s -> 5s ...
function nextPace() {
  const v = app.room?.view;
  if (!v) return;
  const s = PACES[(PACES.indexOf(v.pace ?? 0) + 1) % PACES.length];
  app.send({ a: 'pace', s });
  app.toast(s ? t(`Tự hô mỗi ${s} giây`, `Auto call every ${s}s`) : t('Tắt tự hô — bấm "Hô số" để hô', 'Auto call off — tap "Call"'), { icon: s ? 'timer' : 'pause' });
}

// Mua tờ: chạm màu chưa có thì thêm một tờ màu đó (nhảy tới tờ mới), màu đang có thì trả tờ đó; giữ ít nhất một tờ.
function toggleColor(c) {
  const v = app.room?.view;
  if (!v?.cards || v.called.length) return;
  const cs = v.colors, has = cs.includes(c);
  if (has && cs.length === 1) return app.toast(t('Phải cầm ít nhất một tờ', 'Keep at least one card'), { icon: 'info' });
  if (!has && cs.length >= MAX_CARDS) return app.toast(t(`Tối đa ${MAX_CARDS} tờ`, `At most ${MAX_CARDS} cards`), { icon: 'info' });
  const next = has ? cs.filter((x) => x !== c) : [...cs, c];
  sel = has ? Math.max(0, next.indexOf(cs[sel])) : next.length - 1;
  app.send({ a: 'pick', colors: next });
}

// Vuốt ngang trên tờ để sang tờ bên cạnh.
function swipe(area) {
  let from = null;
  area.addEventListener('pointerdown', (e) => { from = [e.clientX, e.clientY]; });
  area.addEventListener('pointercancel', () => { from = null; });
  area.addEventListener('pointerup', (e) => {
    const n = app.room?.view?.cards?.length ?? 0;
    if (!from || n < 2) return;
    const dx = e.clientX - from[0], dy = e.clientY - from[1];
    from = null;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    sel = (sel + (dx < 0 ? 1 : n - 1)) % n;
    paint(app.room);
  });
}
function paint(r) {
  const v = r.view, cur = v.called.at(-1);
  const playing = r.status === 'playing', live = playing && !app.replay;
  ball.textContent = cur ?? '–';
  ball.classList.remove('pulse');
  if (playing && cur != null) requestAnimationFrame(() => ball.classList.add('pulse'));
  count.textContent = `${v.called.length}/${MAX_NUMBER}`;
  veEl.textContent = cur != null && playing ? t(callLine(cur, v.called.length).text, `Number ${cur}!`) : '';
  veEl.hidden = !veEl.textContent;
  const host = r.host === app.id && !app.replay;
  const pace = v.pace ?? 0, started = v.called.length > 0;
  callBtn.replaceChildren(iconEl('dices'), started ? t(' Hô số', ' Call') : t(' Bắt đầu hô', ' Start calling'));
  callBtn.hidden = !host || !playing || (started && !!pace);
  callBtn.disabled = !!v.kinh;
  paceBtn.hidden = !host || !playing;
  paceBtn.replaceChildren(iconEl(pace ? 'timer' : 'pause'), ` ${paceName(pace)}`);
  paceBtn.classList.toggle('on', !!pace);
  paceEl.hidden = host;
  paceEl.textContent = !playing ? '' : pace ? t(`Tự hô mỗi ${pace} giây`, `Auto call every ${pace}s`) : t('Chủ phòng bấm hô', 'Host calls by hand');
  waitEl.textContent = v.kinh ? t('Dừng hô, đang dò vé…', 'Paused — checking…') : !started ? t('Chờ chủ phòng bắt đầu hô…', 'Waiting for the host to start…')
    : pace ? '' : t('Chờ chủ phòng hô…', 'Waiting for the host…');
  waitEl.hidden = host || !playing || !waitEl.textContent;
  // Vạch đếm ngược tới lần tự hô kế tiếp (giờ server); vào giữa chừng thì vạch bắt đầu từ chỗ đang chạy.
  const next = playing && !v.kinh && pace ? v.next : 0;
  timer.hidden = !next;
  if (next && next !== timerAt) {
    const ms = Math.max(0, next - app.now());
    timer.style.animation = 'none';
    timer.getBoundingClientRect();
    timer.style.setProperty('--from', Math.max(0, 1 - ms / (pace * 1000)));
    timer.style.animation = `countdown ${ms}ms linear forwards`;
  }
  timerAt = next;
  const called = new Set(v.called);
  nums.forEach((s, k) => { s.className = `${called.has(k + 1) ? 'on' : ''}${k + 1 === cur ? ' cur' : ''}`; });
  const buying = live && !!v.cards && !v.called.length;
  board.hidden = buying;
  shop.hidden = !buying;

  sheet.hidden = !v.cards;
  autoBtn.hidden = kinhBtn.hidden = !v.cards || !live;
  if (!v.cards) {
    status.textContent = t('Bạn đang xem (hết ghế).', 'You are watching (no seats left).');
    return;
  }
  sel = Math.min(sel, v.cards.length - 1);
  const total = v.cards.length, grid = v.cards[sel], color = PALETTE[v.colors[sel] ?? 0];
  ticket.style.setProperty('--tc', color[0]);
  strip.textContent = `LÔ TÔ · ${total > 1 ? `${sel + 1}/${total} · ` : ''}${t(`Tờ ${color[1]}`, `${color[2]} card`)}`;
  const marked = new Set(v.marked), base = sel * CELLS;
  const waits = waitRows(v.cards, v.called, v.marked);
  const mine = v.kinh?.wins.find((w) => w.id === app.pov);
  const winRows = new Set((mine?.rows ?? []).filter((w) => w.k === sel).map((w) => w.r));
  const waitNums = new Set(waits.filter((w) => w.k === sel).map((w) => w.n));
  tabs.hidden = total < 2;
  tabs.replaceChildren(...v.cards.map((_, k) => {
    const b = el('button', { className: `${k === sel ? 'on' : ''}${mine?.rows.some((w) => w.k === k) ? ' win' : ''}`, textContent: k + 1, onclick: () => { sel = k; paint(app.room); } });
    b.style.setProperty('--c', PALETTE[v.colors[k] ?? 0][0]);
    if (waits.some((w) => w.k === k)) b.append(el('small', { textContent: t('CHỜ', 'WAIT') }));
    return b;
  }));
  swatches.forEach((b, c) => {
    const at = v.colors.indexOf(c);
    b.className = at >= 0 ? 'on' : '';
    b.textContent = at >= 0 ? at + 1 : '';
  });
  shopNote.textContent = t(`Đang cầm ${total} tờ`, `Holding ${total} card${total > 1 ? 's' : ''}`);
  cells.forEach((c, j) => {
    const row = Math.floor(j / COLS), n = grid[row][j % COLS], hit = marked.has(base + j);
    c.textContent = n ?? '';
    c.disabled = n == null || !live;
    c.className = `cell${n == null ? ' blank' : ''}${hit ? ' hit' : ''}${n != null && n === cur && !hit ? ' cur' : ''}${waitNums.has(n) ? ' wait' : ''}`
      + `${row % BLOCK === 0 && row ? ' bt' : ''}${winRows.has(row) ? ' win' : ''}`;
  });
  autoBtn.classList.toggle('on', !!v.auto);
  const full = rowsOf(v.cards).some((row) => row.cells.every((i) => marked.has(i)));
  kinhBtn.disabled = !!mine;
  kinhBtn.classList.toggle('ready', full && !mine);
  const waitList = [...new Set(waits.map((w) => w.n))];
  status.className = `status${waitList.length ? ' cho' : ''}`;
  const winners = v.kinh?.wins.map((w) => nameOf(r, w.id)).join(', ');
  status.textContent = v.kinh ? (playing ? t(`${winners} KINH! Đang dò vé…`, `${winners}: KINH! Checking…`) : `${winners} KINH!`)
    : !playing ? ''
      : waitList.length ? t(`CHỜ ${waitList.join(' · ')}`, `WAITING ${waitList.join(' · ')}`)
        : full ? t('Đủ hàng rồi — bấm KINH!', 'Row complete — tap KINH!')
          : v.called.length ? t(`Hàng nào đủ ${PER_ROW} số thì KINH`, `Fill a row of ${PER_ROW} to win`) : t('Chờ hô số đầu tiên…', 'Waiting for the first number…');
}

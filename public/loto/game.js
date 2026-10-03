import { nokiaApp } from '../nokia/room.js';
import { COLS, BLOCK, CELLS, PER_ROW, MAX_NUMBER, PACES, numberAt, rowsOf, waitRows } from './logic.js';
import { t } from '../i18n.js';
import { iconEl } from '../icons.js';
import { el } from '../dom.js';

// Lô tô nhiều người (server: worker/games/loto.js, phòng /api/nk/loto/room/CODE). Màn chơi: số vừa hô + nút hô / tốc độ tự hô
// của chủ phòng (vạch đếm ngược tới số kế tiếp), bảng 90 số đã hô, tờ dò 9×9 của mình (chạm số đã hô để đặt hạt), dòng CHỜ,
// nút "Tự dò" và nút KINH.
// Bảng màu tờ theo COLOR_COUNT ở logic.js: [màu nền, tên vi, tên en].
const PALETTE = [['#c62828', 'đỏ', 'red'], ['#1e8a4a', 'xanh lá', 'green'], ['#1f5fbf', 'xanh dương', 'blue'], ['#d99a00', 'vàng', 'yellow'],
  ['#7b3bb8', 'tím', 'purple'], ['#e0640f', 'cam', 'orange'], ['#d23f7c', 'hồng', 'pink'], ['#0b8a8a', 'xanh ngọc', 'teal']];
const NOT_CALLED_MS = 1500; // nhắc "số này chưa hô" thưa thôi

let ball, count, paceEl, callBtn, paceBtn, waitEl, timer, board, sheet, ticket, strip, kinhBtn, autoBtn, status;
let cells = [], nums = [], sel = 0, seen = 0, nagAt = 0, timerAt = 0;

const nameOf = (r, id) => r?.players.find((p) => p.id === id)?.name ?? '?';

const app = nokiaApp({
  game: 'loto',
  path: '/loto/',
  title: t('Lô tô', 'Lo To'),
  sub: t('Lô tô hội chợ chơi cùng bạn bè: mỗi người một tờ dò, chủ phòng hô số, hàng nào đủ 5 số thì hô KINH!', 'Vietnamese fair-style bingo with friends: everyone gets a card, the host calls numbers, fill a row of 5 and shout KINH!'),
  help: t('Tờ dò có 9 hàng (3 khối), mỗi hàng 5 số; cột 1: 1–9, cột 2: 10–19, ..., cột 9: 80–90. Chủ phòng bấm "Bắt đầu hô", sau đó số tự hô đều đặn (đổi tốc độ hoặc tắt để tự bấm "Hô số"). Số có trên tờ thì chạm để đặt hạt (hoặc bật "Tự dò"). Hàng còn thiếu 1 số là CHỜ. Hàng ngang đủ 5 số đã hô thì bấm KINH — kinh sai là "kinh láo"! Nhiều người kinh cùng lúc thì chia giải.',
    'Each card has 9 rows (3 blocks) of 5 numbers; column 1: 1–9, column 2: 10–19, ..., column 9: 80–90. The host taps "Start calling", then numbers are called automatically (change the speed, or turn it off and tap "Call"). Tap a called number on your card to place a chip (or turn on "Auto mark"). A row missing one number is WAITING. When a row has all 5 numbers called, tap KINH — a false claim is announced to everyone! Simultaneous claims share the win.'),
  lobbyText: (r) => (r.players.length > 1 ? t('Mỗi người một tờ dò; chủ phòng bắt đầu hô.', 'One card each; the host starts calling.') : t('Chơi một mình: tự hô, tự dò.', 'Playing alone: call and mark the numbers yourself.')),
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
    nums = Array.from({ length: MAX_NUMBER }, (_, k) => el('span', { textContent: k + 1 }));
    board = el('div', { className: 'board', title: t('Bảng số đã hô', 'Called numbers') }, ...nums);
    cells = Array.from({ length: CELLS }, (_, j) => el('button', { className: 'cell', onclick: () => mark(j) }));
    strip = el('div', { className: 'strip' });
    ticket = el('div', { className: 'ticket' }, strip, el('div', { className: 'grid' }, ...cells));
    sheet = el('div', { className: 'sheet' }, el('div', { className: 'wrap' }, ticket));
    status = el('p', { className: 'status' });
    autoBtn = el('button', { className: 'auto', onclick: () => app.send({ a: 'auto', on: !app.room?.view?.auto }) }, iconEl('sparkles'), t(' Tự dò', ' Auto mark'));
    kinhBtn = el('button', { className: 'kinh', textContent: 'KINH!', onclick: () => app.send({ a: 'kinh' }) });
    stage.append(el('div', { className: 'lt' },
      el('div', { className: 'now' }, ball, el('div', { className: 'meta' }, el('small', { textContent: t('Số vừa hô', 'Just called') }), count, paceEl), paceBtn, callBtn, waitEl, timer),
      board, sheet, el('div', { className: 'bar' }, status, autoBtn, kinhBtn)));
  },
  render(r) {
    const v = r.view;
    if (!v) return;
    if (v.called.length > seen && seen) app.beep(980, 90, 'sine');
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

function paint(r) {
  const v = r.view, cur = v.called.at(-1);
  const playing = r.status === 'playing', live = playing && !app.replay;
  ball.textContent = cur ?? '–';
  ball.classList.remove('pulse');
  if (playing && cur != null) requestAnimationFrame(() => ball.classList.add('pulse'));
  count.textContent = `${v.called.length}/${MAX_NUMBER}`;
  const host = r.host === app.id && !app.replay;
  const pace = v.pace ?? 0, started = v.called.length > 0;
  callBtn.replaceChildren(iconEl('dices'), started ? t(' Hô số', ' Call') : t(' Bắt đầu hô', ' Start calling'));
  callBtn.hidden = !host || !playing || (started && !!pace);
  callBtn.disabled = !!v.kinh;
  paceBtn.hidden = !host || !playing;
  paceBtn.replaceChildren(iconEl(pace ? 'timer' : 'pause'), ` ${paceName(pace)}`);
  paceBtn.classList.toggle('on', !!pace);
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

  sheet.hidden = !v.cards;
  autoBtn.hidden = kinhBtn.hidden = !v.cards || !live;
  if (!v.cards) {
    status.textContent = t('Bạn đang xem (hết ghế).', 'You are watching (no seats left).');
    return;
  }
  sel = Math.min(sel, v.cards.length - 1);
  const grid = v.cards[sel], color = PALETTE[v.colors[sel] ?? 0];
  ticket.style.setProperty('--tc', color[0]);
  strip.textContent = `LÔ TÔ · ${t(`Tờ ${color[1]}`, `${color[2]} card`)}`;
  const marked = new Set(v.marked), base = sel * CELLS;
  const waits = waitRows(v.cards, v.called, v.marked);
  const mine = v.kinh?.wins.find((w) => w.id === app.pov);
  const winRows = new Set((mine?.rows ?? []).filter((w) => w.k === sel).map((w) => w.r));
  const waitNums = new Set(waits.filter((w) => w.k === sel).map((w) => w.n));
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

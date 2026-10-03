import { nokiaApp } from '../nokia/room.js';
import { ROWS, COLS, PER_ROW, MAX_NUMBER, canMark, wonRow } from './logic.js';
import { t } from '../i18n.js';
import { iconEl } from '../icons.js';
import { el } from '../dom.js';

// Lô tô nhiều người (server: worker/games/loto.js, phòng /api/nk/loto/room/CODE). Màn chơi: số vừa gọi + nút "Gọi số" của
// chủ phòng, dãy số đã gọi theo thứ tự, phiếu của mình (chạm số đã gọi để đánh dấu). Kín một hàng là KINH.
const CARD_NUMBERS = ROWS * PER_ROW;

let ball, count, callBtn, waitEl, calledEl, cardEl, hint, cells = [], seen = 0;

const app = nokiaApp({
  game: 'loto',
  path: '/loto/',
  title: t('Lô tô', 'Lo To'),
  sub: t('Lô tô Việt Nam chơi cùng bạn bè: mỗi người một phiếu, chủ phòng gọi số, ai kín một hàng trước là KINH!', 'Vietnamese bingo with friends: everyone gets a card, the host calls numbers, first to fill a row shouts KINH!'),
  help: t('Phiếu có 3 hàng, mỗi hàng 5 số (cột 1: 1–9, cột 2: 10–19, ..., cột 9: 80–90). Chủ phòng bấm "Gọi số" để rút ngẫu nhiên một số 1–90; số đó có trên phiếu thì chạm để đánh dấu. Kín đủ 5 số trên một hàng là thắng. Vào phòng giữa ván vẫn được phát phiếu.',
    'Each card has 3 rows of 5 numbers (column 1: 1–9, column 2: 10–19, ..., column 9: 80–90). The host taps "Call" to draw a random number from 1–90; if it is on your card, tap it to mark it. Fill all 5 numbers in one row to win. Joining mid-game still gets you a card.'),
  lobbyText: (r) => (r.players.length > 1 ? t('Mỗi người một phiếu; chủ phòng gọi số.', 'One card each; the host calls the numbers.') : t('Chơi một mình: tự gọi số, tự dò.', 'Playing alone: call and mark the numbers yourself.')),
  badge: (p, r) => (r.status === 'playing' && r.view?.counts?.[p.id] != null ? `${r.view.counts[p.id]}/${CARD_NUMBERS}` : ''),
  scoreText: (v) => t(`${v}/${CARD_NUMBERS} số`, `${v}/${CARD_NUMBERS} marked`),
  mount(stage) {
    ball = el('div', { className: 'ball' });
    count = el('span', { className: 'count' });
    callBtn = el('button', { className: 'primary call', onclick: () => app.send({ a: 'call' }) }, iconEl('dices'), t(' Gọi số', ' Call'));
    waitEl = el('span', { className: 'wait', textContent: t('Chờ chủ phòng gọi số…', 'Waiting for the host to call…') });
    calledEl = el('div', { className: 'called' });
    cells = Array.from({ length: ROWS * COLS }, (_, i) => el('button', { className: 'cell', onclick: () => mark(i) }));
    cardEl = el('div', { className: 'ticket' }, ...cells);
    hint = el('p', { className: 'hint' });
    stage.append(el('div', { className: 'lt' },
      el('div', { className: 'now' }, ball, el('div', { className: 'meta' }, el('small', { textContent: t('Số vừa gọi', 'Current number') }), count), callBtn, waitEl),
      calledEl, cardEl, hint));
  },
  render(r) {
    const v = r.view;
    if (!v) return;
    if (v.called.length > seen && seen) app.beep(980, 90, 'sine');
    seen = v.called.length;
    paint(r);
  },
});

function mark(i) {
  const v = app.room?.view;
  if (app.replay || app.room?.status !== 'playing' || !v?.card || !canMark(v.card, v.called, v.marked, i)) return;
  app.send({ a: 'mark', i });
}

function paint(r) {
  const v = r.view, cur = v.called.at(-1);
  const playing = r.status === 'playing';
  ball.textContent = cur ?? '–';
  ball.classList.toggle('pulse', playing && cur != null);
  count.textContent = `${v.called.length}/${MAX_NUMBER}`;
  const host = r.host === app.id && !app.replay;
  callBtn.hidden = !host || !playing;
  waitEl.hidden = host || !playing;
  calledEl.replaceChildren(...(v.called.length
    ? v.called.map((n) => el('span', { className: n === cur ? 'cur' : '', textContent: n }))
    : [el('em', { textContent: t('Chưa gọi số nào', 'No numbers called yet') })]));
  calledEl.scrollTop = calledEl.scrollHeight;
  cardEl.hidden = !v.card;
  if (!v.card) {
    hint.textContent = t('Bạn đang xem (hết phiếu).', 'You are watching (no cards left).');
    return;
  }
  const marked = new Set(v.marked), win = wonRow(v.card, v.marked);
  cells.forEach((c, i) => {
    const r0 = Math.floor(i / COLS), n = v.card[r0][i % COLS];
    const can = playing && !app.replay && canMark(v.card, v.called, v.marked, i);
    c.textContent = n ?? '';
    c.disabled = !can;
    c.className = `cell${n == null ? ' blank' : ''}${marked.has(i) ? ' hit' : ''}${can ? ' can' : ''}${n != null && n === cur ? ' cur' : ''}${r0 === win ? ' win' : ''}`;
  });
  const waiting = v.card.flat().filter((n, i) => n != null && v.called.includes(n) && !marked.has(i)).length;
  hint.textContent = !playing ? ''
    : waiting ? t(`Có ${waiting} số đã gọi chưa đánh trên phiếu — chạm để đánh dấu!`, `${waiting} called number(s) on your card — tap to mark!`)
      : t(`Đã đánh ${marked.size}/${CARD_NUMBERS} số. Kín một hàng 5 số là KINH!`, `Marked ${marked.size}/${CARD_NUMBERS}. Fill a row of 5 to win!`);
}

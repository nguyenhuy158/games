import { nokiaApp } from '../nokia/room.js';
import { iconEl } from '../icons.js';
import { COLS, ROWS, K, moves, sideOf } from './logic.js';
import { t, tx } from '../i18n.js';
import { el } from '../dom.js';

// Bàn gỗ 9×10, sông "Sở hà – Hán giới", cửu cung kẻ chéo; quân tròn chữ Hán (Đỏ: 帥仕相傌俥炮兵, Đen: 將士象馬車砲卒).
// Mình luôn ở dưới (cầm Đen thì bàn xoay 180°). Nước vừa đi: đánh dấu điểm đi + điểm đến, quân trượt tới; bị chiếu: tướng nháy đỏ.
const LEVELS = [t('Dễ', 'Easy'), t('Vừa', 'Normal'), t('Khó', 'Hard')];
const GLYPH = { 1: ['帥', '將'], 2: ['仕', '士'], 3: ['相', '象'], 4: ['傌', '馬'], 5: ['俥', '車'], 6: ['炮', '砲'], 7: ['兵', '卒'] };
const NAMES = { 1: t('Tướng', 'General'), 2: t('Sĩ', 'Advisor'), 3: t('Tượng', 'Elephant'), 4: t('Mã', 'Horse'), 5: t('Xe', 'Chariot'), 6: t('Pháo', 'Cannon'), 7: t('Tốt', 'Soldier') };

let seat = 1, sel = null, lastMoves = -1, animKey = '';
let boardEl, riverEl, dots = [], pieces = [], marks = [], bars, hint, timerId;

const disp = (i) => (seat === 2 ? COLS * ROWS - 1 - i : i);
// Toạ độ % trên bàn (viewBox -60 -60 920 1020, 1 ô = 100).
const pos = (i) => { const j = disp(i); return [(((j % COLS) * 100 + 60) / 920) * 100, ((Math.floor(j / COLS) * 100 + 60) / 1020) * 100]; };

// Nét kẻ: 10 ngang; dọc: 2 mép liền, 7 cột giữa đứt ở sông; chéo 2 cửu cung; khung ngoài.
const LINES = (() => {
  let d = '';
  for (let r = 0; r < ROWS; r++) d += `M0 ${r * 100}H800`;
  for (let c = 0; c < COLS; c++) d += c === 0 || c === 8 ? `M${c * 100} 0V900` : `M${c * 100} 0V400M${c * 100} 500V900`;
  return `${d}M300 0L500 200M500 0L300 200M300 700L500 900M500 700L300 900`;
})();

const app = nokiaApp({
  game: 'co-tuong',
  path: '/co-tuong/',
  title: t('Cờ tướng', 'Xiangqi'),
  sub: t('Cờ tướng đủ luật — pháo cách ngòi, mã cản chân, tượng không qua sông, lộ mặt tướng. 1v1 hoặc với máy.', 'Full-rules Chinese chess — cannon screens, blocked horses, elephants stay home, flying general. 1v1 or vs the bot.'),
  help: t('Chạm một quân của mình, các điểm đi được hiện chấm xanh, chạm điểm để đi. Xe đi thẳng; Pháo đi như xe, ăn phải nhảy qua đúng 1 quân; Mã đi chữ nhật, bị cản chân; Tượng đi chéo 2 ô, không qua sông; Sĩ và Tướng ở trong cửu cung; Tốt qua sông được đi ngang. Hai tướng không được đối mặt trên cùng cột trống, không được đi để tướng mình bị chiếu. Chiếu bí (đối phương hết nước) là thắng; mỗi nước có 60 giây.',
    'Tap one of your pieces; green dots show where it can go, tap one to move. Chariot moves straight; Cannon moves like a chariot but captures by jumping exactly one piece; Horse moves in an L and can be blocked; Elephant moves 2 diagonally and cannot cross the river; Advisor and General stay in the palace; Soldiers move sideways after crossing the river. The two generals may not face each other on an open file, and you may not leave your general in check. Checkmate (no legal moves) wins; 60 seconds per move.'),
  lobbyText: (r) => (r.players.length > 1 ? t(`${r.players[0].name} đấu ${r.players[1].name} — mỗi ván đổi bên cầm Đỏ.`, `${r.players[0].name} vs ${r.players[1].name} — sides swap every game.`) : t('Chỉ có mình bạn — sẽ đấu với máy.', 'Just you — you will play the bot.')),
  lobby(bx, r, isHost, setCfg) {
    if (r.players.length > 1) return;
    bx.append(el('div', { className: 'seg' }, t('Máy ', 'Bot '), ...LEVELS.map((name, i) => el('button', {
      textContent: name, className: r.cfg.level === i ? 'on' : '', disabled: !isHost, onclick: () => setCfg({ level: i }),
    }))));
  },
  scoreText: (v) => t(`${v} nước`, `${v} moves`),
  mount(stage) {
    boardEl = el('div', { className: 'board' });
    boardEl.innerHTML = `<svg viewBox="-60 -60 920 1020" aria-hidden="true"><rect x="-60" y="-60" width="920" height="1020" rx="30" class="wood"/><rect x="-14" y="-14" width="828" height="928" class="frame"/><path d="${LINES}"/></svg>`;
    riverEl = el('div', { className: 'river' }, el('span', { textContent: t('Sở hà', 'Chu River') }), el('span', { textContent: t('Hán giới', 'Han Border') }));
    boardEl.append(riverEl);
    marks = [el('i', { className: 'mark' }), el('i', { className: 'mark' })];
    boardEl.append(...marks);
    dots = Array.from({ length: COLS * ROWS }, (_, i) => {
      const d = el('button', { className: 'pt' });
      d.onclick = () => tap(i);
      boardEl.append(d);
      return d;
    });
    pieces = Array.from({ length: COLS * ROWS }, (_, i) => {
      const p = el('button', { className: 'pc' });
      p.onclick = () => tap(i);
      boardEl.append(p);
      return p;
    });
    bars = [el('div', { className: 'bar' }), el('div', { className: 'bar' })];
    hint = el('p', { className: 'hint' });
    stage.append(el('div', { className: 'ct' }, bars[0], boardEl, bars[1], hint));
    timerId ??= setInterval(() => app.room && drawHint(app.room), 1000);
  },
  render(r) {
    const v = r.view;
    if (!v) return;
    seat = v.side.indexOf(app.pov) + 1 || 1; // xem lại / người xem: Đỏ ở dưới
    if (v.moves !== lastMoves) {
      const fresh = v.last && lastMoves >= 0 && v.moves === lastMoves + 1;
      lastMoves = v.moves;
      sel = null;
      if (fresh) { app.beep(v.last.cap ? 900 : 520, v.last.cap ? 90 : 40, v.last.cap ? 'triangle' : 'sine'); if (v.check) setTimeout(() => app.beep(1500, 160, 'square'), 150); }
      animKey = fresh ? `${v.moves}` : '';
    }
    paint(r);
  },
});

// Điểm quân ở `from` đi được (đã lọc nước để tướng mình bị chiếu).
let legalCache = { key: '', list: [] };
function legalOf(v) {
  const key = `${v.moves}:${v.turn}`;
  if (legalCache.key !== key) legalCache = { key, list: moves({ b: v.b, turn: v.turn }) };
  return legalCache.list;
}
const targetsOf = (v, from) => new Set(legalOf(v).filter(([f]) => f === from).map(([, to]) => to));

function myTurn(r = app.room) {
  return r?.status === 'playing' && r.view && !r.view.over && r.view.side[r.view.turn - 1] === app.id;
}
function tap(i) {
  const r = app.room, v = r?.view;
  if (!myTurn(r)) return;
  if (sideOf(v.b[i]) === seat) { sel = sel === i ? null : i; return paint(r); }
  if (sel != null && targetsOf(v, sel).has(i)) {
    app.send({ from: sel, to: i });
    sel = null;
    paint(r);
  }
}

function paint(r) {
  const v = r.view;
  const mine = myTurn(r);
  const targets = sel != null ? targetsOf(v, sel) : new Set();
  const king = v.check ? v.b.indexOf(v.turn === 1 ? K : -K) : -1;
  // Sông: chữ luôn đọc xuôi (bàn xoay thì hai vế đổi chỗ cũng không sao).
  riverEl.style.top = `${((450 + 60) / 1020) * 100}%`;
  marks.forEach((m, k) => {
    const i = v.last ? (k ? v.last.to : v.last.from) : -1;
    m.hidden = i < 0;
    if (i >= 0) { const [x, y] = pos(i); Object.assign(m.style, { left: `${x}%`, top: `${y}%` }); }
  });
  for (let i = 0; i < COLS * ROWS; i++) {
    const [x, y] = pos(i);
    Object.assign(dots[i].style, { left: `${x}%`, top: `${y}%` });
    const to = targets.has(i);
    dots[i].className = `pt${to ? ' to' : ''}${to && v.b[i] ? ' hit' : ''}`;
    dots[i].disabled = !to;
    const p = pieces[i], w = v.b[i];
    p.hidden = !w;
    if (!w) { p.className = 'pc'; continue; }
    const s = sideOf(w), type = Math.abs(w);
    Object.assign(p.style, { left: `${x}%`, top: `${y}%` });
    const can = mine && s === seat;
    p.className = `pc s${s}${sel === i ? ' sel' : ''}${can ? ' can' : ''}${i === king ? ' check' : ''}${to ? ' target' : ''}`;
    p.textContent = GLYPH[type][s - 1];
    p.title = `${NAMES[type]} ${s === 1 ? t('đỏ', 'red') : t('đen', 'black')}`;
    // Ăn quân: bấm vào quân địch nằm trên điểm đích thì vẫn phải đi được.
    p.disabled = !(can || to);
    if (animKey && v.last?.to === i && p.dataset.anim !== animKey) {
      p.dataset.anim = animKey;
      const [fx, fy] = pos(v.last.from);
      p.style.setProperty('--dx', `${((fx - x) / 100) * boardEl.clientWidth}px`);
      p.style.setProperty('--dy', `${((fy - y) / 100) * boardEl.clientHeight}px`);
      p.classList.add('slide');
    }
  }
  [3 - seat, seat].forEach((s, k) => {
    const turn = r.status === 'playing' && v.turn === s;
    bars[k].className = `bar${turn ? ' turn' : ''}`;
    bars[k].replaceChildren(
      el('span', { className: 'who' }, el('i', { className: `chip s${s}`, textContent: GLYPH[1][s - 1] }), v.side[s - 1] === 'bot' ? iconEl('bot') : '', ` ${tx(v.names[s - 1])}${v.side[s - 1] === app.id ? t(' (bạn)', ' (you)') : ''}`),
      el('b', { textContent: s === 1 ? t('Đỏ', 'Red') : t('Đen', 'Black') }),
    );
  });
  drawHint(r);
}

function drawHint(r) {
  const v = r.view;
  if (!v || r.status !== 'playing') { hint.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((v.deadline - app.now()) / 1000));
  const who = v.side[v.turn - 1];
  const check = v.check ? t(' — đang bị chiếu!', ' — in check!') : '';
  hint.textContent = v.over ? t('Hết ván!', 'Game over!')
    : who === app.id ? (sel == null ? t(`Lượt bạn${check} · ${left}s`, `Your turn${check} · ${left}s`) : t(`Chạm điểm muốn đi · ${left}s`, `Tap where to move · ${left}s`))
      : who === 'bot' ? t(`Máy đang nghĩ…${check}`, `Bot is thinking…${check}`) : t(`Lượt ${tx(v.names[v.turn - 1])}${check} · ${left}s`, `${tx(v.names[v.turn - 1])}'s turn${check} · ${left}s`);
}

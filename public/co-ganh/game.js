import { nokiaApp } from '../nokia/room.js';
import { iconEl } from '../icons.js';
import { N, ADJ } from './logic.js';
import { t, tx } from '../i18n.js';

// Bàn gỗ kẻ mực 5×5 (đường chéo qua điểm chẵn), quân tròn kiểu cờ tướng: người 1 đỏ, người 2 đen.
// Mình luôn ở dưới (người 2 thấy bàn xoay 180°). Nước vừa đi: quân trượt từ điểm cũ, quân bị gánh / vây lật màu.
const LEVELS = [t('Dễ', 'Easy'), t('Vừa', 'Normal'), t('Khó', 'Hard')];
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

let seat = 1, sel = null, lastMoves = -1, animKey = '';
let boardEl, dots = [], pieces = [], bars, hint, timerId;

const disp = (i) => (seat === 2 ? N * N - 1 - i : i);
const pos = (i) => { const j = disp(i); return [((j % N) * 100 + 60) / 520 * 100, (Math.floor(j / N) * 100 + 60) / 520 * 100]; };

// Nét kẻ: 5 ngang, 5 dọc, 2 đường chéo lớn + hình thoi nối trung điểm các cạnh (đường chéo qua điểm chẵn).
const LINES = (() => {
  let d = '';
  for (let k = 0; k < N; k++) d += `M0 ${k * 100}H400M${k * 100} 0V400`;
  return `${d}M0 0L400 400M400 0L0 400M200 0L400 200L200 400L0 200Z`;
})();

const app = nokiaApp({
  game: 'co-ganh',
  path: '/co-ganh/',
  title: t('Cờ gánh', 'Co Ganh'),
  sub: t('Cờ dân gian Việt Nam trên bàn 5×5 — đi vào giữa hai quân địch là gánh cả hai, vây kín là bắt. 1v1 hoặc với máy.', 'A Vietnamese folk board game on a 5×5 grid — step between two enemy pieces to carry both, trap a group to take it. 1v1 or vs the bot.'),
  help: t('Chạm một quân của mình rồi chạm điểm trống kề nó (theo đường kẻ; đường chéo chỉ có ở các điểm nối chéo). Gánh: quân vừa đi đứng giữa hai quân địch thẳng hàng thì cả hai đổi thành quân mình. Vây: nhóm quân địch không còn đường đi thì cả nhóm thành quân mình. Bắt hết quân đối thủ là thắng; mỗi nước có 30 giây.',
    'Tap one of your pieces, then an empty point next to it (along a line; diagonals exist only at the points they pass through). Carry: when your piece lands between two enemy pieces in a line, both become yours. Trap: an enemy group with nowhere to move becomes yours. Take every enemy piece to win; 30 seconds per move.'),
  lobbyText: (r) => (r.players.length > 1 ? t(`${r.players[0].name} đấu ${r.players[1].name}.`, `${r.players[0].name} vs ${r.players[1].name}.`) : t('Chỉ có mình bạn — sẽ đấu với máy.', 'Just you — you will play the bot.')),
  lobby(bx, r, isHost, setCfg) {
    if (r.players.length > 1) return;
    bx.append(el('div', { className: 'seg' }, t('Máy ', 'Bot '), ...LEVELS.map((name, i) => el('button', {
      textContent: name, className: r.cfg.level === i ? 'on' : '', disabled: !isHost, onclick: () => setCfg({ level: i }),
    }))));
  },
  scoreText: (v) => t(`${v} quân`, `${v} pieces`),
  mount(stage) {
    boardEl = el('div', { className: 'board' });
    boardEl.innerHTML = `<svg viewBox="-60 -60 520 520" aria-hidden="true"><rect x="-60" y="-60" width="520" height="520" rx="26" class="wood"/><path d="${LINES}"/></svg>`;
    dots = Array.from({ length: N * N }, (_, i) => {
      const d = el('button', { className: 'pt', title: '' });
      d.onclick = () => tap(i);
      boardEl.append(d);
      return d;
    });
    pieces = Array.from({ length: N * N }, (_, i) => {
      const p = el('button', { className: 'pc' });
      p.onclick = () => tap(i);
      boardEl.append(p);
      return p;
    });
    bars = [el('div', { className: 'bar' }), el('div', { className: 'bar' })];
    hint = el('p', { className: 'hint' });
    stage.append(el('div', { className: 'cg' }, bars[0], boardEl, bars[1], hint));
    timerId ??= setInterval(() => app.room && drawHint(app.room), 1000);
  },
  render(r) {
    const v = r.view;
    if (!v) return;
    seat = v.side.indexOf(app.pov) + 1 || 1; // xem lại / người xem: phía người 1 ở dưới
    if (v.moves !== lastMoves) {
      const fresh = v.last && lastMoves >= 0 && v.moves === lastMoves + 1;
      lastMoves = v.moves;
      sel = null;
      if (fresh) sound(v.last);
      animKey = fresh ? `${v.moves}` : '';
    }
    paint(r);
  },
});

function myTurn(r = app.room) {
  return r?.status === 'playing' && r.view && !r.view.over && r.view.side[r.view.turn - 1] === app.id;
}
function tap(i) {
  const r = app.room, v = r?.view;
  if (!myTurn(r)) return;
  if (v.b[i] === seat) { sel = sel === i ? null : i; return paint(r); }
  if (sel != null && !v.b[i] && ADJ[sel].includes(i)) {
    app.send({ from: sel, to: i });
    sel = null;
    paint(r);
  }
}
function sound(last) {
  app.beep(520, 40, 'sine');
  const n = last.ganh.length + last.vay.length;
  if (n) setTimeout(() => app.beep(last.vay.length ? 1500 : 1200, 140, 'triangle'), 180);
}

function paint(r) {
  const v = r.view;
  const mine = myTurn(r);
  const targets = sel != null ? new Set(ADJ[sel].filter((j) => !v.b[j])) : new Set();
  const flipped = new Set(animKey && v.last ? [...v.last.ganh, ...v.last.vay] : []);
  for (let i = 0; i < N * N; i++) {
    const [x, y] = pos(i);
    Object.assign(dots[i].style, { left: `${x}%`, top: `${y}%` });
    dots[i].classList.toggle('to', targets.has(i));
    dots[i].disabled = !targets.has(i);
    const p = pieces[i], who = v.b[i];
    p.hidden = !who;
    if (!who) { p.className = 'pc'; continue; }
    Object.assign(p.style, { left: `${x}%`, top: `${y}%` });
    p.className = `pc p${who}${sel === i ? ' sel' : ''}${mine && who === seat ? ' can' : ''}${v.last && v.last.to === i ? ' last' : ''}`;
    p.disabled = !(mine && who === seat);
    // Quân vừa đi trượt từ điểm cũ; quân bị gánh / vây lật (chỉ lần đầu vẽ nước đó).
    if (animKey && p.dataset.anim !== animKey) {
      p.dataset.anim = animKey;
      if (v.last.to === i) {
        const [fx, fy] = pos(v.last.from);
        p.style.setProperty('--dx', `${((fx - x) / 100) * boardEl.clientWidth}px`);
        p.style.setProperty('--dy', `${((fy - y) / 100) * boardEl.clientHeight}px`);
        p.classList.add('slide');
      } else if (flipped.has(i)) p.classList.add('flip');
    }
  }
  const cnt = (s) => v.b.filter((x) => x === s).length;
  [3 - seat, seat].forEach((s, k) => {
    const turn = r.status === 'playing' && v.turn === s;
    bars[k].className = `bar${turn ? ' turn' : ''}`;
    bars[k].replaceChildren(
      el('span', { className: 'who' }, el('i', { className: `chip p${s}` }), v.side[s - 1] === 'bot' ? iconEl('bot') : '', ` ${tx(v.names[s - 1])}${v.side[s - 1] === app.id ? t(' (bạn)', ' (you)') : ''}`),
      el('b', { textContent: t(`${cnt(s)} quân`, `${cnt(s)} pieces`) }),
    );
  });
  drawHint(r);
}

function drawHint(r) {
  const v = r.view;
  if (!v || r.status !== 'playing') { hint.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((v.deadline - app.now()) / 1000));
  const who = v.side[v.turn - 1];
  const got = v.last && v.last.ganh.length + v.last.vay.length ? (v.last.vay.length ? t(' — vây!', ' — trapped!') : t(' — gánh!', ' — carried!')) : '';
  hint.textContent = v.over ? t('Hết ván!', 'Game over!')
    : who === app.id ? (sel == null ? t(`Lượt bạn — chạm một quân của mình · ${left}s${got}`, `Your turn — tap one of your pieces · ${left}s${got}`) : t(`Chạm điểm muốn đi · ${left}s`, `Tap where to move · ${left}s`))
      : who === 'bot' ? t('Máy đang nghĩ…', 'Bot is thinking…') : t(`Lượt ${tx(v.names[v.turn - 1])} · ${left}s${got}`, `${tx(v.names[v.turn - 1])}'s turn · ${left}s${got}`);
}

import { nokiaApp } from '../nokia/room.js';
import { iconEl } from '../icons.js';
import { QUAN } from './logic.js';
import { t, tx } from '../i18n.js';

// Bàn vẽ phấn trên sân gạch: 2 hàng × 5 ô dân, hai đầu là ô quan hình bán nguyệt.
// Mình luôn ở hàng dưới (người 2 thấy bàn xoay 180°). Mỗi nước server gửi kèm các bước rải để diễn lại từng viên.
const STEP_MS = 170;
const PEBBLES = ['#d9d3c4', '#b8b0a0', '#8f8b83', '#ebe5d6', '#a8957c', '#75706a', '#c9b99c'];
const LEVELS = [t('Dễ', 'Easy'), t('Vừa', 'Normal'), t('Khó', 'Hard')];
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const pts = (c) => c.small + c.big * QUAN;
const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 2 ** 32; };

let seat = 1, sel = null, playing = false, anim = 0, lastMoves = -1, shown = null, cap = null;
const cells = [], painted = Array(12).fill(0);
let boardEl, handEl, dirsEl, bars, hint, timerId;

// Ô k (chỉ số vòng) -> vị trí hiển thị j (người 2 xoay 180°) -> hộp trên bàn (đơn vị ô; bàn rộng 7, cao 2).
const disp = (k) => (seat === 2 ? (k + 6) % 12 : k);
function box(j) {
  if (j === 0) return [0, 0, 1, 2];
  if (j === 6) return [6, 0, 1, 2];
  return j < 6 ? [j, 1, 1, 1] : [12 - j, 0, 1, 1];
}
// Bàn SVG viewBox -8 -8 716 216 (1 ô = 100).
const pct = (v, total) => `${((8 + v * 100) / total) * 100}%`;

const app = nokiaApp({
  game: 'o-an-quan',
  path: '/o-an-quan/',
  title: t('Ô ăn quan', 'O An Quan'),
  sub: t('Trò chơi dân gian vẽ phấn trên sân gạch — rải sỏi, ăn dân, bắt quan. Đấu 1v1 hoặc với máy.', 'The Vietnamese folk game chalked on a brick yard — sow pebbles, capture citizens, take the mandarins. 1v1 or vs the bot.'),
  help: t('Chạm một ô dân bên mình rồi chọn hướng rải. Rải hết mà ô kế có sỏi thì bốc rải tiếp; ô kế trống thì ăn ô sau nó (trống – có xen kẽ thì ăn dồn); gặp ô quan hoặc hai ô trống thì mất lượt. Quan = 10 dân. Hết dân bên mình thì lấy 5 dân đã ăn rải lại (thiếu thì vay). Hết hai quan là hết ván, dân còn lại về chủ hàng ô.',
    'Tap a citizen square on your side, then pick a direction to sow. If the next square has pebbles, pick them up and keep sowing; if it is empty, capture the square after it (alternating empty – full squares capture in a chain); hitting a mandarin square or two empty squares ends your turn. A mandarin = 10 citizens. With no citizens left on your side, re-seed 5 from your captures (borrow if short). The game ends when both mandarins are taken; remaining citizens go to their row owner.'),
  lobbyText: (r) => (r.players.length > 1 ? t(`${r.players[0].name} đấu ${r.players[1].name}.`, `${r.players[0].name} vs ${r.players[1].name}.`) : t('Chỉ có mình bạn — sẽ đấu với máy.', 'Just you — you will play the bot.')),
  lobby(bx, r, isHost, setCfg) {
    const seg = (label, items, on, pick) => el('div', { className: 'seg' }, label, ...items.map((t, i) => el('button', {
      textContent: t, className: on === i ? 'on' : '', disabled: !isHost, onclick: () => pick(i),
    })));
    bx.append(seg(t('Quan non ', 'Young mandarin '), [t('Không ăn', 'Protected'), t('Ăn được', 'Capturable')], r.cfg.quanNon ? 0 : 1, (i) => setCfg({ quanNon: i === 0 })));
    if (r.players.length < 2) bx.append(seg(t('Máy ', 'Bot '), LEVELS, r.cfg.level, (i) => setCfg({ level: i })));
  },
  scoreText: (v) => t(`${v} điểm`, `${v} pts`),
  mount(stage) {
    boardEl = el('div', { className: 'board' });
    boardEl.innerHTML = `<svg viewBox="-8 -8 716 216" aria-hidden="true"><g filter="url(#chalk)">
      <path d="M100 0H600V200H100Z M100 100H600 M200 0V200 M300 0V200 M400 0V200 M500 0V200 M100 0A100 100 0 0 0 100 200 M600 0A100 100 0 0 1 600 200"/></g></svg>`;
    for (let k = 0; k < 12; k++) {
      const c = el('div', { className: `cell${k % 6 ? '' : ' quan'}` });
      c.onclick = () => pickCell(k);
      cells.push(c);
      boardEl.append(c);
    }
    handEl = el('div', { className: 'hand', hidden: true });
    dirsEl = el('div', { className: 'dirs', hidden: true },
      el('button', { title: t('Rải sang trái', 'Sow left'), onclick: () => go(-1) }, iconEl('arrow-left')),
      el('button', { title: t('Rải sang phải', 'Sow right'), onclick: () => go(1) }, iconEl('arrow-right')));
    boardEl.append(handEl, dirsEl);
    bars = [el('div', { className: 'bar' }), el('div', { className: 'bar' })];
    hint = el('p', { className: 'hint' });
    stage.append(el('div', { className: 'oaq' }, bars[0], boardEl, bars[1], hint));
    timerId ??= setInterval(() => app.room && drawHint(app.room), 1000);
  },
  render(r) {
    const v = r.view;
    if (!v) return;
    seat = v.side.indexOf(app.id) + 1 || 1;
    for (let k = 0; k < 12; k++) {
      const [x, y, w, h] = box(disp(k));
      Object.assign(cells[k].style, { left: pct(x, 716), top: pct(y, 216), width: `${(w * 100 / 716) * 100}%`, height: `${(h * 100 / 216) * 100}%` });
      cells[k].classList.toggle('left', disp(k) === 0);
    }
    if (v.moves !== lastMoves) {
      const replay = v.last && lastMoves >= 0 && v.moves === lastMoves + 1;
      lastMoves = v.moves;
      sel = null;
      if (replay) return play(v);
      anim++;
      playing = false;
      showHand(null);
      shown = { b: v.b.slice(), big: v.big.slice() };
      cap = v.cap;
    }
    paint();
  },
});

function myTurn(r = app.room) {
  return r?.status === 'playing' && r.view && !r.view.over && r.view.side[r.view.turn - 1] === app.id && !playing;
}
function pickCell(k) {
  const v = app.room?.view;
  if (!myTurn() || !v || !(k >= 1 && (seat === 1 ? k <= 5 : k >= 7)) || !v.b[k]) return;
  sel = sel === k ? null : k;
  paint();
}
function go(d) {
  if (sel == null || !myTurn()) return;
  app.send({ k: sel, d });
  sel = null;
  paint();
}

// Diễn lại nước vừa đi từ bàn trước đó: bốc, rải từng viên, ăn, rải lại khi hết dân.
function play(v) {
  const id = ++anim;
  playing = true;
  const b = v.last.from.b.slice(), big = v.last.from.big.slice();
  shown = { b, big };
  let hand = 0;
  v.last.steps.forEach(([t, k], i) => setTimeout(() => {
    if (id !== anim) return;
    if (t === 'pick') { hand = b[k]; b[k] = 0; app.beep(420, 40, 'sine'); }
    if (t === 'drop') { b[k]++; hand--; app.beep(760 + hand * 12, 22, 'sine'); }
    if (t === 'seed') { b[k]++; app.beep(900, 22, 'sine'); }
    if (t === 'cap') {
      b[k] = 0; big[k] = 0;
      cells[k].classList.remove('eaten'); void cells[k].offsetWidth; cells[k].classList.add('eaten');
      app.beep(k % 6 ? 1300 : 1700, 120, 'triangle');
    }
    showHand(t === 'seed' || t === 'cap' ? null : k, hand);
    paint();
  }, i * STEP_MS));
  setTimeout(() => {
    if (id !== anim) return;
    playing = false;
    showHand(null);
    const now = app.room?.view ?? v;
    shown = { b: now.b.slice(), big: now.big.slice() };
    cap = now.cap;
    paint();
  }, v.last.steps.length * STEP_MS + 120);
}

function showHand(k, n) {
  handEl.hidden = k == null || !n;
  if (handEl.hidden) return;
  const [x, y, w] = box(disp(k));
  Object.assign(handEl.style, { left: pct(x + w / 2, 716), top: pct(y, 216) });
  handEl.replaceChildren(iconEl('hand'), ` ${n}`);
}

function paint() {
  const r = app.room, v = r?.view;
  if (!v || !shown) return;
  const mine = myTurn(r);
  for (let k = 0; k < 12; k++) paintCell(k, shown.b[k], shown.big[k], mine && (seat === 1 ? k >= 1 && k <= 5 : k >= 7) && shown.b[k] > 0);
  dirsEl.hidden = sel == null;
  if (sel != null) {
    const [x, , w] = box(disp(sel));
    dirsEl.style.left = pct(x + w / 2, 716);
  }
  // Thanh trên: đối thủ, dưới: mình (người xem: người 1 ở dưới).
  const c = cap ?? v.cap;
  [3 - seat, seat].forEach((p, i) => {
    const turn = r.status === 'playing' && v.turn === p;
    bars[i].className = `bar${turn ? ' turn' : ''}`;
    bars[i].replaceChildren(
      el('span', { className: 'who' }, v.side[p - 1] === 'bot' ? iconEl('bot') : '', ` ${tx(v.names[p - 1])}${v.side[p - 1] === app.id ? t(' (bạn)', ' (you)') : ''}`),
      el('span', { className: 'got' },
        ...Array.from({ length: c[p].big }, () => el('i', { className: 'q', title: t('Quan', 'Mandarin') })),
        el('i', { className: 'd' }), ` ${c[p].small}`, v.debt[p] ? el('small', { textContent: t(` nợ ${v.debt[p]}`, ` owes ${v.debt[p]}`) }) : '',
        el('b', { textContent: pts(c[p]) })),
    );
  });
  drawHint(r);
}

function drawHint(r) {
  const v = r.view;
  if (!v || r.status !== 'playing') { hint.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((v.deadline - app.now()) / 1000));
  const who = v.side[v.turn - 1];
  hint.textContent = playing ? t('Đang rải…', 'Sowing…') : v.over ? t('Hết quan, tàn dân — thu quân!', 'Both mandarins gone — collect the rest!')
    : who === app.id ? (sel == null ? t(`Lượt bạn — chạm một ô bên mình · ${left}s`, `Your turn — tap a square on your side · ${left}s`) : t(`Chọn hướng rải · ${left}s`, `Pick a direction · ${left}s`))
      : who === 'bot' ? t('Máy đang nghĩ…', 'Bot is thinking…') : t(`Lượt ${tx(v.names[v.turn - 1])} · ${left}s`, `${tx(v.names[v.turn - 1])}'s turn · ${left}s`);
}

// Sỏi xếp xoắn ốc theo thứ tự (thêm viên không làm xê dịch viên cũ), màu/góc cố định theo ô + số thứ tự.
function paintCell(k, n, big, can) {
  const c = cells[k];
  c.classList.toggle('can', can);
  c.classList.toggle('sel', sel === k);
  const quan = k % 6 === 0;
  const old = painted[k];
  if (old === n * 2 + big && c.childElementCount) return;
  const before = Math.floor(old / 2);
  painted[k] = n * 2 + big;
  const kids = [];
  const left = disp(k) === 0;
  const cx = quan ? (left ? 62 : 38) : 50;
  if (big) kids.push(el('span', { className: 'qs', style: `left:${cx}%;top:50%` }));
  const show = Math.min(n, 30);
  for (let i = 0; i < show; i++) {
    // Ô quan còn quan: sỏi chia hai cụm trên / dưới hòn quan cho khỏi đè lên nhau.
    const j = big ? i >> 1 : i;
    const cy = big ? 50 + (i % 2 ? 27 : -27) : 50;
    const r = Math.min(40, (big ? 8 : 10) * Math.sqrt(j + 0.35));
    const a = j * 2.39996 + k * 1.7 + (i % 2);
    const s = el('span', { className: `st${i >= before ? ' new' : ''}` });
    const x = cx + r * Math.cos(a) * (quan ? 1.1 : 1), y = cy + r * Math.sin(a) * (quan ? 0.5 : 1);
    s.style.cssText = `left:${x}%;top:${y}%;--c:${PEBBLES[Math.floor(hash(k * 97 + i) * PEBBLES.length)]};--r:${Math.floor(hash(k * 13 + i * 7) * 360)}deg`;
    kids.push(s);
  }
  kids.push(el('span', { className: 'n', textContent: n || '' }));
  c.replaceChildren(...kids);
}

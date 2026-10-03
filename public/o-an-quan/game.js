import { nokiaApp } from '../nokia/room.js';
import { iconEl } from '../icons.js';
import { QUAN, MAX_PLAYERS, side, isQuan } from './logic.js';
import { t, tx } from '../i18n.js';
import { el } from '../dom.js';

// Bàn vẽ phấn trên sân gạch. 2 người: 2 hàng × 5 ô dân, hai đầu là ô quan hình bán nguyệt.
// 3–5 người: đa giác, mỗi cạnh 5 ô dân của một người, ô quan tròn ở mỗi đỉnh.
// Mình luôn ở cạnh dưới (bàn xoay theo ghế). Mỗi nước server gửi kèm các bước rải để diễn lại từng viên.
const STEP_MS = 170;
const PEBBLES = ['#d9d3c4', '#b8b0a0', '#8f8b83', '#ebe5d6', '#a8957c', '#75706a', '#c9b99c'];
const LEVELS = [t('Dễ', 'Easy'), t('Vừa', 'Normal'), t('Khó', 'Hard')];
const pts = (c) => c.small + c.big * QUAN;
const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 2 ** 32; };

let seat = 1, sel = null, playing = false, anim = 0, lastMoves = -1, shown = null, cap = null;
let cells = [], painted = [], G = null;
let boardEl, svgEl, handEl, dirsEl, barsTop, barMe, hint, timerId;

// Hình học bàn (đơn vị SVG, 1 ô = 100): mỗi ô k -> tâm, cỡ, góc xoay; quan: lệch cụm sỏi (qx %) cho ô bán nguyệt.
function geometry(n, seat) {
  const cellsG = [];
  if (n === 2) {
    // Chữ nhật cũ: người 2 thấy bàn xoay 180° (chỉ số hiển thị j).
    for (let k = 0; k < 12; k++) {
      const j = seat === 2 ? (k + 6) % 12 : k;
      const [x, y, w, h] = j === 0 ? [0, 0, 1, 2] : j === 6 ? [6, 0, 1, 2] : j < 6 ? [j, 1, 1, 1] : [12 - j, 0, 1, 1];
      cellsG.push({ x: (x + w / 2) * 100, y: (y + h / 2) * 100, w: w * 100, h: h * 100, rot: 0, qx: j === 0 ? 62 : j === 6 ? 38 : 50 });
    }
    const path = 'M100 0H600V200H100Z M100 100H600 M200 0V200 M300 0V200 M400 0V200 M500 0V200 M100 0A100 100 0 0 0 100 200 M600 0A100 100 0 0 1 600 200';
    return { vb: [-8, -8, 716, 216], cells: cellsG, path };
  }
  // Đa giác đều n cạnh: cạnh j (0 = dưới cùng, đi ngược chiều kim đồng hồ trên màn hình) là của người ((j + seat - 1) % n) + 1.
  // Dải 5 ô dân sâu 100 nằm trong cạnh, chừa a ở hai đầu để dải hai cạnh kề không chồng nhau; ô quan tròn ở đỉnh.
  const half = Math.PI / n, theta = Math.PI - 2 * half; // góc trong
  const a = 100 / Math.tan(theta / 2), S = 500 + 2 * a, R = S / (2 * Math.sin(half));
  const V = Array.from({ length: n }, (_, i) => { const al = Math.PI / 2 + half - i * 2 * half; return [R * Math.cos(al), R * Math.sin(al)]; });
  const U = V.map((v, i) => { const w = V[(i + 1) % n]; return [(w[0] - v[0]) / S, (w[1] - v[1]) / S]; });
  const N = U.map(([ux, uy]) => [uy, -ux]); // pháp tuyến vào trong
  const at = (v, u, s, nn, d) => [v[0] + u[0] * s + nn[0] * d, v[1] + u[1] * s + nn[1] * d];
  // Ô quan tròn bán kính rq, tâm trên phân giác cách đỉnh t: vừa chạm đầu dải dân hai bên (khoảng cách tới đầu dải = a - t·cos(θ/2)).
  const rq = Math.min(a, 95), t = (a - rq) / Math.cos(theta / 2);
  let path = '';
  const pts = [];
  for (let j = 0; j < n; j++) {
    const p = ((j + seat - 1) % n) + 1, v = V[j], u = U[j], nn = N[j];
    const deg = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
    for (let i = 0; i < 5; i++) {
      const [x, y] = at(v, u, a + 50 + 100 * i, nn, 50);
      cellsG[6 * (p - 1) + 1 + i] = { x, y, w: 100, h: 100, rot: deg, qx: 50 };
    }
    const c = [at(v, u, a, nn, 0), at(v, u, a + 500, nn, 0), at(v, u, a + 500, nn, 100), at(v, u, a, nn, 100)];
    pts.push(...c);
    path += `M${c.map((q) => q.map((z) => z.toFixed(1)).join(' ')).join('L')}Z`;
    for (let i = 1; i < 5; i++) path += `M${at(v, u, a + 100 * i, nn, 0).map((z) => z.toFixed(1)).join(' ')}L${at(v, u, a + 100 * i, nn, 100).map((z) => z.toFixed(1)).join(' ')}`;
    // Ô quan ở đỉnh j (đầu cạnh j).
    const pn = N[(j + n - 1) % n], bl = Math.hypot(nn[0] + pn[0], nn[1] + pn[1]);
    const bis = [(nn[0] + pn[0]) / bl, (nn[1] + pn[1]) / bl];
    const q = [v[0] + bis[0] * t, v[1] + bis[1] * t];
    cellsG[6 * (p - 1)] = { x: q[0], y: q[1], w: 2 * rq, h: 2 * rq, rot: 0, qx: 50 };
    path += `M${(q[0] - rq).toFixed(1)} ${q[1].toFixed(1)}a${rq.toFixed(1)} ${rq.toFixed(1)} 0 1 0 ${(2 * rq).toFixed(1)} 0a${rq.toFixed(1)} ${rq.toFixed(1)} 0 1 0 ${(-2 * rq).toFixed(1)} 0`;
    pts.push([q[0] - rq, q[1] - rq], [q[0] + rq, q[1] + rq]);
  }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.min(...xs) - 10, y0 = Math.min(...ys) - 10;
  return { vb: [x0, y0, Math.max(...xs) + 10 - x0, Math.max(...ys) + 10 - y0], cells: cellsG, path };
}

const app = nokiaApp({
  game: 'o-an-quan',
  path: '/o-an-quan/',
  title: t('Ô ăn quan', 'O An Quan'),
  sub: t('Trò chơi dân gian vẽ phấn trên sân gạch — rải sỏi, ăn dân, bắt quan. 2–5 người, thiếu người thì máy vào chơi.', 'The Vietnamese folk game chalked on a brick yard — sow pebbles, capture citizens, take the mandarins. 2–5 players; bots fill empty seats.'),
  help: t('Chạm một ô dân bên mình rồi chọn hướng rải. Rải hết mà ô kế có sỏi thì bốc rải tiếp; ô kế trống thì ăn ô sau nó (trống – có xen kẽ thì ăn dồn); gặp ô quan hoặc hai ô trống thì mất lượt. Quan = 10 dân. Hết dân bên mình thì lấy 5 dân đã ăn rải lại (thiếu thì vay người nhiều dân nhất). Hết mọi quan là hết ván, dân còn lại về chủ hàng ô. 3–5 người: bàn đa giác, đi lần lượt vòng quanh.',
    'Tap a citizen square on your side, then pick a direction to sow. If the next square has pebbles, pick them up and keep sowing; if it is empty, capture the square after it (alternating empty – full squares capture in a chain); hitting a mandarin square or two empty squares ends your turn. A mandarin = 10 citizens. With no citizens left on your side, re-seed 5 from your captures (borrow from the richest player if short). The game ends when every mandarin is taken; remaining citizens go to their row owner. 3–5 players: a polygon board, turns go round.'),
  lobbyText: (r) => {
    const n = Math.max(r.cfg.n ?? 2, r.players.length), bots = n - r.players.length;
    if (r.players.length === 1 && n === 2) return t('Chỉ có mình bạn — sẽ đấu với máy.', 'Just you — you will play the bot.');
    if (r.players.length === 2 && n === 2) return t(`${r.players[0].name} đấu ${r.players[1].name}.`, `${r.players[0].name} vs ${r.players[1].name}.`);
    return t(`Bàn ${n} người: ${r.players.length} người chơi${bots ? ` + ${bots} máy` : ''}.`, `${n}-player board: ${r.players.length} player${r.players.length > 1 ? 's' : ''}${bots ? ` + ${bots} bot${bots > 1 ? 's' : ''}` : ''}.`);
  },
  lobby(bx, r, isHost, setCfg) {
    const seg = (label, items, on, pick) => el('div', { className: 'seg' }, label, ...items.map((t, i) => el('button', {
      textContent: t, className: on === i ? 'on' : '', disabled: !isHost, onclick: () => pick(i),
    })));
    const ns = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2);
    const n = Math.max(r.cfg.n ?? 2, r.players.length);
    bx.append(seg(t('Số người ', 'Players '), ns.map(String), ns.indexOf(n), (i) => setCfg({ n: ns[i] })));
    bx.append(seg(t('Quan non ', 'Young mandarin '), [t('Không ăn', 'Protected'), t('Ăn được', 'Capturable')], r.cfg.quanNon ? 0 : 1, (i) => setCfg({ quanNon: i === 0 })));
    if (r.players.length < n) bx.append(seg(t('Máy ', 'Bot '), LEVELS, r.cfg.level, (i) => setCfg({ level: i })));
  },
  scoreText: (v) => t(`${v} điểm`, `${v} pts`),
  mount(stage) {
    boardEl = el('div', { className: 'board' });
    boardEl.innerHTML = '<svg aria-hidden="true"><g filter="url(#chalk)"><path/></g></svg>';
    svgEl = boardEl.firstChild;
    handEl = el('div', { className: 'hand', hidden: true });
    dirsEl = el('div', { className: 'dirs', hidden: true },
      el('button', { title: t('Rải sang trái', 'Sow left'), onclick: () => go(-1) }, iconEl('arrow-left')),
      el('button', { title: t('Rải sang phải', 'Sow right'), onclick: () => go(1) }, iconEl('arrow-right')));
    boardEl.append(handEl, dirsEl);
    barsTop = el('div', { className: 'bars' });
    barMe = el('div', { className: 'bar' });
    hint = el('p', { className: 'hint' });
    stage.append(el('div', { className: 'oaq' }, barsTop, boardEl, barMe, hint));
    timerId ??= setInterval(() => app.room && drawHint(app.room), 1000);
  },
  render(r) {
    const v = r.view;
    if (!v) return;
    seat = v.side.indexOf(app.pov) + 1 || 1; // xem lại: bàn theo phía người 1
    layout(v.side.length);
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

// Dựng ô + nét phấn theo số người và ghế (chỉ khi đổi).
function layout(n) {
  const key = `${n}:${seat}`;
  if (G?.key === key) return;
  G = { key, n, ...geometry(n, seat) };
  const [x0, y0, w, h] = G.vb;
  svgEl.setAttribute('viewBox', G.vb.join(' '));
  svgEl.querySelector('path').setAttribute('d', G.path);
  boardEl.style.aspectRatio = `${w} / ${h}`;
  boardEl.parentNode.style.setProperty('--ar', (w / h).toFixed(3));
  boardEl.classList.toggle('poly', n > 2);
  if (cells.length !== 6 * n) {
    for (const c of cells) c.remove();
    cells = Array.from({ length: 6 * n }, (_, k) => {
      const c = el('div', { className: `cell${isQuan(k) ? ' quan' : ''}` });
      c.onclick = () => pickCell(k);
      boardEl.insertBefore(c, handEl);
      return c;
    });
    painted = Array(6 * n).fill(-1);
  }
  G.cells.forEach((g, k) => {
    Object.assign(cells[k].style, {
      left: `${((g.x - g.w / 2 - x0) / w) * 100}%`, top: `${((g.y - g.h / 2 - y0) / h) * 100}%`,
      width: `${(g.w / w) * 100}%`, height: `${(g.h / h) * 100}%`, transform: g.rot ? `rotate(${g.rot}deg)` : '',
    });
    // Cỡ sỏi theo đơn vị bàn (ô dân = 100) để ô quan to / nhỏ thì sỏi vẫn bằng nhau; bàn 2 người giữ tỉ lệ cũ.
    const quan = isQuan(k), two = n === 2;
    cells[k].style.setProperty('--qx', `${g.qx}%`);
    cells[k].style.setProperty('--rot', `${-g.rot}deg`); // số đếm luôn đứng thẳng
    cells[k].style.setProperty('--st', `${two ? (quan ? 34 : 17) : 1700 / g.w}%`);
    cells[k].style.setProperty('--qs', `${two ? 64 : 5600 / g.w}%`);
  });
  painted.fill(-1);
}
const at = (k, dy = 0) => { const g = G.cells[k], [x0, y0, w, h] = G.vb; return [`${((g.x - x0) / w) * 100}%`, `${((g.y + dy * g.h - y0) / h) * 100}%`]; };

function myTurn(r = app.room) {
  return r?.status === 'playing' && r.view && !r.view.over && r.view.side[r.view.turn - 1] === app.id && !playing;
}
function pickCell(k) {
  const v = app.room?.view;
  if (!myTurn() || !v || !side(seat).includes(k) || !v.b[k]) return;
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
      app.beep(isQuan(k) ? 1700 : 1300, 120, 'triangle');
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
  const [left, top] = at(k, -0.5);
  Object.assign(handEl.style, { left, top });
  handEl.replaceChildren(iconEl('hand'), ` ${n}`);
}

function bar(v, p, r, c) {
  const turn = r.status === 'playing' && v.turn === p;
  const bot = v.bot?.[p - 1] ?? v.side[p - 1] === 'bot';
  return el('div', { className: `bar${turn ? ' turn' : ''}` },
    el('span', { className: 'who' }, bot ? iconEl('bot') : '', ` ${tx(v.names[p - 1])}${v.side[p - 1] === app.id ? t(' (bạn)', ' (you)') : ''}`),
    el('span', { className: 'got' },
      ...Array.from({ length: c[p].big }, () => el('i', { className: 'q', title: t('Quan', 'Mandarin') })),
      el('i', { className: 'd' }), ` ${c[p].small}`, v.debt[p] ? el('small', { textContent: t(` nợ ${v.debt[p]}`, ` owes ${v.debt[p]}`) }) : '',
      el('b', { textContent: pts(c[p]) })));
}

function paint() {
  const r = app.room, v = r?.view;
  if (!v || !shown || !G) return;
  const mine = myTurn(r), my = side(seat);
  for (let k = 0; k < cells.length; k++) paintCell(k, shown.b[k], shown.big[k], mine && my.includes(k) && shown.b[k] > 0);
  dirsEl.hidden = sel == null;
  if (sel != null) dirsEl.style.left = at(sel)[0];
  // Trên: những người khác theo thứ tự lượt sau mình; dưới: mình (người xem: người 1 ở dưới).
  const c = cap ?? v.cap, n = v.side.length;
  barsTop.replaceChildren(...Array.from({ length: n - 1 }, (_, i) => bar(v, ((seat + i) % n) + 1, r, c)));
  barMe.replaceWith((barMe = bar(v, seat, r, c)));
  drawHint(r);
}

function drawHint(r) {
  const v = r.view;
  if (!v || r.status !== 'playing') { hint.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((v.deadline - app.now()) / 1000));
  const who = v.side[v.turn - 1], bot = v.bot?.[v.turn - 1] ?? who === 'bot';
  hint.textContent = playing ? t('Đang rải…', 'Sowing…') : v.over ? t('Hết quan, tàn dân — thu quân!', 'All mandarins gone — collect the rest!')
    : who === app.id ? (sel == null ? t(`Lượt bạn — chạm một ô bên mình · ${left}s`, `Your turn — tap a square on your side · ${left}s`) : t(`Chọn hướng rải · ${left}s`, `Pick a direction · ${left}s`))
      : bot ? t(`${tx(v.names[v.turn - 1])} đang nghĩ…`, `${tx(v.names[v.turn - 1])} is thinking…`) : t(`Lượt ${tx(v.names[v.turn - 1])} · ${left}s`, `${tx(v.names[v.turn - 1])}'s turn · ${left}s`);
}

// Sỏi xếp xoắn ốc theo thứ tự (thêm viên không làm xê dịch viên cũ), màu/góc cố định theo ô + số thứ tự.
function paintCell(k, n, big, can) {
  const c = cells[k];
  c.classList.toggle('can', can);
  c.classList.toggle('sel', sel === k);
  const quan = isQuan(k);
  const old = painted[k];
  if (old === n * 2 + big && c.childElementCount) return;
  const before = old < 0 ? 0 : Math.floor(old / 2);
  painted[k] = n * 2 + big;
  const kids = [];
  const cx = G.cells[k].qx, round = quan && G.n > 2;
  if (big) kids.push(el('span', { className: 'qs', style: `left:${cx}%;top:50%` }));
  const show = Math.min(n, 30);
  for (let i = 0; i < show; i++) {
    // Ô quan còn quan: sỏi chia hai cụm trên / dưới hòn quan cho khỏi đè lên nhau.
    const j = big ? i >> 1 : i;
    const cy = big ? 50 + (i % 2 ? 27 : -27) : 50;
    const r = Math.min(40, (big ? 8 : 10) * Math.sqrt(j + 0.35));
    const a = j * 2.39996 + k * 1.7 + (i % 2);
    const s = el('span', { className: `st${i >= before ? ' new' : ''}` });
    const x = cx + r * Math.cos(a) * (quan && !round ? 1.1 : 1), y = cy + r * Math.sin(a) * (quan && !round ? 0.5 : 1);
    s.style.cssText = `left:${x}%;top:${y}%;--c:${PEBBLES[Math.floor(hash(k * 97 + i) * PEBBLES.length)]};--r:${Math.floor(hash(k * 13 + i * 7) * 360)}deg`;
    kids.push(s);
  }
  kids.push(el('span', { className: 'n', textContent: n || '' }));
  c.replaceChildren(...kids);
}

import { W, H, LEVELS, DEFAULT_LEVEL, tickMs, newGame, spawn, shift, rotate, hardDrop, tick } from './logic.js';
import { t } from '../i18n.js';
import { hydrateIcons, icon } from '../icons.js';
import { swipe } from '../swipe.js';
import { $, el, store } from '../dom.js';

// Xếp gạch một người, chạy hết ở client. Kỷ lục lưu trong máy theo từng độ khó (localStorage 'tetris.best', 'tetris.best.hard', ...).
// Phím: ← → di chuyển, ↑ xoay, ↓ rơi nhanh, Cách thả xuống đáy, P tạm dừng (Cách lúc chưa chơi = bắt đầu).
// Cảm ứng: vuốt trái / phải / xuống, vuốt lên hoặc chạm = xoay; hoặc 4 nút dưới bàn.
// Độ khó (Thường / Khó / Siêu khó) chọn trên màn bắt đầu / hết ván, nhớ ở 'tetris.level'.
const BEST_KEY = 'tetris.best';
const LEVEL_KEY = 'tetris.level';
const bestKey = (lv) => (lv === DEFAULT_LEVEL ? BEST_KEY : `${BEST_KEY}.${lv}`);

hydrateIcons();
const cells = Array.from({ length: W * H }, () => el('div'));
$('#cells').append(...cells);
let s = newGame(), playing = false, paused = false, timer = 0;
let level = Object.hasOwn(LEVELS, store.get(LEVEL_KEY) ?? '') ? store.get(LEVEL_KEY) : DEFAULT_LEVEL;
let best = Number(store.get(bestKey(level))) || 0;

function setLevel(lv) {
  if (playing || !Object.hasOwn(LEVELS, lv)) return;
  level = lv;
  store.set(LEVEL_KEY, lv);
  best = Number(store.get(bestKey(lv))) || 0;
  draw();
}

function start() {
  s = newGame();
  spawn(s);
  playing = true;
  paused = false;
  loop();
  draw();
}

// Nhịp rơi đều chỉ chạy lúc đang chơi và không tạm dừng.
function loop() {
  clearInterval(timer);
  if (playing && !paused) timer = setInterval(step, tickMs(level));
}

function step() {
  if (!playing || paused) return;
  tick(s);
  if (s.score > best) { best = s.score; store.set(bestKey(level), String(best)); }
  if (s.over) { playing = false; loop(); }
  draw();
}

function act(a) {
  if (a === 'start') return start();
  if (a === 'pause') {
    if (!playing) return;
    paused = !paused;
    loop();
    return draw();
  }
  if (!playing || paused) return;
  if (a === 'left') shift(s, -1);
  else if (a === 'right') shift(s, 1);
  else if (a === 'rotate') rotate(s);
  else if (a === 'drop') hardDrop(s);
  else if (a === 'down') return step();
  draw();
}

function draw() {
  const p = s.piece;
  cells.forEach((c, i) => {
    const x = i % W, y = Math.floor(i / W);
    let type = s.board[y][x];
    if (!type && p) {
      const py = y - p.y, px = x - p.x;
      if (p.shape[py]?.[px]) type = p.type;
    }
    c.className = type ? `blk c${type}` : '';
  });
  $('#score').textContent = s.score;
  $('#best').textContent = best;
  $('#final').textContent = s.score;
  $('#ovStart').hidden = playing || s.over;
  $('#ovOver').hidden = !s.over;
  $('#ovPause').hidden = !(playing && paused);
  const bp = $('#btnPause');
  bp.disabled = !playing;
  bp.innerHTML = `${icon(paused ? 'play' : 'pause')} <span>${paused ? t('Chơi tiếp', 'Resume') : t('Tạm dừng', 'Pause')}</span>`;
  for (const b of document.querySelectorAll('.moves button')) b.disabled = !playing || paused;
  for (const b of document.querySelectorAll('[data-level]')) b.classList.toggle('on', b.dataset.level === level);
  $('#lvlName').textContent = document.querySelector(`[data-level="${level}"]`).textContent;
}

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'down', ' ': 'drop' };
addEventListener('keydown', (e) => {
  if (KEYS[e.key]) e.preventDefault();
  if (e.key === ' ' && !playing) return start();
  if (e.key === 'p' || e.key === 'P') return act('pause');
  if (KEYS[e.key]) act(KEYS[e.key]);
});
swipe($('#board'), {
  onSwipe: (dir) => act({ left: 'left', right: 'right', down: 'down', up: 'rotate' }[dir]),
  onTap: () => act('rotate'),
});
// Bỏ focus khỏi nút vừa bấm: phím Cách (thả khối) không được bấm lại nút đó.
for (const b of document.querySelectorAll('[data-act]')) b.onclick = () => { b.blur(); act(b.dataset.act); };
for (const b of document.querySelectorAll('[data-level]')) b.onclick = () => { b.blur(); setLevel(b.dataset.level); };
draw();

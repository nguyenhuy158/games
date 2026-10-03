import { W, H, LEVELS, DEFAULT_LEVEL, tickMs, newGame, spawn, shift, rotate, hardDrop, tick } from './logic.js';
import { t } from '../i18n.js';
import { hydrateIcons, icon } from '../icons.js';
import { swipe } from '../swipe.js';
import { $, el, store } from '../dom.js';
import { mountHelp } from '../help.js';

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
// Mở hướng dẫn giữa ván thì tạm dừng (người chơi tự bấm Chơi tiếp); đóng thì bỏ focus khỏi nút (i) để phím Cách không mở lại.
mountHelp({
  game: 'tetris',
  button: '#btnHelp',
  onOpen: () => { if (playing && !paused) act('pause'); },
  onClose: () => document.activeElement?.blur(),
  content: {
    vi: {
      goal: 'Xếp các khối đang rơi cho kín hàng ngang để xoá hàng, ghi điểm cao nhất trước khi gạch chạm đỉnh.',
      play: [
        'Bàn 10×20; khối rơi xuống từng nhịp, chạm đáy hoặc chạm gạch thì khoá ở nhịp kế tiếp.',
        'Hàng nào đầy thì xoá. Xoá 1 / 2 / 3 / 4 hàng cùng lúc: 40 / 100 / 300 / 1200 điểm.',
        'Khối mới vừa xuất hiện đã chạm gạch là hết ván.',
        'Độ khó Thường / Khó / Siêu khó (chọn ở màn bắt đầu) = tốc độ rơi; kỷ lục lưu riêng từng độ khó.',
      ],
      keys: ['← →: sang trái / phải; ↑: xoay.', '↓: rơi nhanh một ô; phím Cách: thả xuống đáy (chưa chơi thì Cách = bắt đầu).', 'P: tạm dừng / chơi tiếp.'],
      touch: ['Vuốt trái / phải để dịch, vuốt xuống để rơi nhanh, vuốt lên hoặc chạm bàn để xoay.', 'Hoặc dùng 4 nút dưới bàn: trái, xoay, phải, thả.'],
      tips: ['Thả xuống đáy vẫn còn kịp dịch khối trước khi nó khoá.', 'Chừa một cột trống để chờ khối I xoá 4 hàng một lúc: 1200 điểm.'],
    },
    en: {
      goal: 'Fit the falling pieces into full rows to clear them and score as high as you can before the stack reaches the top.',
      play: [
        '10×20 board; pieces fall one row per tick and lock on the next tick after landing.',
        'Full rows are cleared. Clearing 1 / 2 / 3 / 4 rows at once: 40 / 100 / 300 / 1200 points.',
        'If a new piece collides as soon as it appears, the game is over.',
        'Normal / Hard / Expert (picked on the start screen) set the fall speed; best scores are kept per difficulty.',
      ],
      keys: ['← →: move left / right; ↑: rotate.', '↓: soft drop one row; Space: hard drop (before a game, Space starts).', 'P: pause / resume.'],
      touch: ['Swipe left / right to move, swipe down to drop faster, swipe up or tap the board to rotate.', 'Or use the 4 buttons below the board: left, rotate, right, drop.'],
      tips: ['After a hard drop you can still slide the piece before it locks.', 'Keep one column open for an I piece and clear 4 rows at once for 1200 points.'],
    },
  },
});

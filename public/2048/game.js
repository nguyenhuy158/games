import { CELLS, newGame, slide, addTile, isOver } from './logic.js';
import { t, en } from '../i18n.js';
import { hydrateIcons } from '../icons.js';
import { toast } from '../toast.js';
import { deviceName } from '../names.js';
import { swipe } from '../swipe.js';
import { $, el, store } from '../dom.js';

// 2048 một người, chạy hết ở client: phím mũi tên, vuốt hoặc phím trên màn. Hết ván thì ghi tên + điểm lên
// bảng xếp hạng chung (top 10, /api/board?game=2048 — ai cũng ghi được, như bản cũ ở mytools).
const API = '/api/board?game=2048';
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const BIGGEST = 2048; // ô lớn hơn dùng chung một màu
const UNDO_MAX = 10; // nhớ tối đa 10 nước để đi lại

hydrateIcons();
const cells = Array.from({ length: CELLS }, () => el('div', { className: 'tile' }));
$('#tiles').append(...cells);
const over = $('#over'), btnSave = $('#btnSave'), nameIn = $('#name'), btnUndo = $('#btnUndo');
let grid, score, saved, history;

function start() {
  grid = newGame();
  score = 0;
  history = [];
  over.hidden = true;
  draw(-1);
}

// Đi lại nước trước (tối đa UNDO_MAX nước). Đã lưu điểm lên bảng xếp hạng thì không đi lại được nữa.
function undo() {
  if (saved || !history.length) return;
  ({ grid, score } = history.pop());
  over.hidden = true;
  draw(-1);
}

function move(dir) {
  if (!over.hidden) return;
  const r = slide(grid, dir);
  if (!r.moved) return;
  history.push({ grid, score });
  if (history.length > UNDO_MAX) history.shift();
  grid = addTile(r.grid);
  score += r.gain;
  draw(grid.findIndex((v, i) => v && !r.grid[i]));
  if (isOver(grid)) gameOver();
}

// fresh = ô vừa sinh (nảy lên).
function draw(fresh) {
  cells.forEach((c, i) => {
    const v = grid[i];
    c.textContent = v || '';
    c.className = `tile${v ? ` v${v > BIGGEST ? 'big' : v}` : ''}${i === fresh ? ' new' : ''}`;
    c.dataset.len = v ? String(v).length : '';
  });
  $('#score').textContent = score;
  btnUndo.disabled = saved || !history.length;
}

function gameOver() {
  saved = false;
  $('#final').textContent = score;
  nameIn.value = store.get('pk.name') || deviceName();
  btnSave.disabled = false;
  over.hidden = false;
}

$('#saveForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = nameIn.value.trim();
  if (!name || saved) return;
  btnSave.disabled = true;
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, score }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saved = true;
    btnUndo.disabled = true;
    store.set('pk.name', name);
    toast.success(t('Đã lưu điểm thành công!', 'Score saved successfully!'));
    renderBoard(await res.json());
  } catch {
    btnSave.disabled = false;
    toast.error(t('Không lưu được điểm, thử lại nhé', 'Could not save the score, please retry'));
  }
};

function renderBoard(rows) {
  $('#lbEmpty').hidden = rows.length > 0;
  $('#lb').replaceChildren(...rows.map((r, i) => el('li', { className: `r${i + 1}` },
    el('span', { className: 'rank', textContent: i + 1 }),
    el('span', { className: 'who' }, el('b', { textContent: r.name }), el('small', { textContent: new Date(r.at).toLocaleDateString(en ? 'en-US' : 'vi-VN') })),
    el('strong', { textContent: r.score }),
  )));
}
fetch(API, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then(renderBoard).catch(() => renderBoard([]));

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if ((k === 'z' && mod) || (k === 'u' && !mod && !e.altKey)) {
    e.preventDefault();
    undo();
    return;
  }
  const dir = KEYS[e.key];
  if (!dir) return;
  e.preventDefault();
  move(dir);
});
swipe($('#board'), { onSwipe: move });
for (const b of document.querySelectorAll('.pad [data-dir]')) b.onclick = () => move(b.dataset.dir);
$('#btnNew').onclick = start;
btnUndo.onclick = undo;
$('#btnRetry').onclick = start;
$('#btnBoard').onclick = () => $('#side').classList.toggle('open');
start();

import { N, BOX, HINTS, DIFFICULTIES, formatTime, newPuzzle, markConflicts, isFull, isSolved } from './logic.js';
import { t } from '../i18n.js';
import { hydrateIcons, icon } from '../icons.js';
import { toast } from '../toast.js';
import { $, el, store } from '../dom.js';

// Sudoku một người, chạy hết ở client: chọn ô rồi điền bằng bàn phím hoặc dãy số; ghi chú bút chì (N), xoá, 3 gợi ý mỗi ván,
// đồng hồ (dừng khi tạm dừng / giải xong). Kỷ lục thời gian theo độ khó lưu trong máy (localStorage 'sudoku.best').
const BEST_KEY = 'sudoku.best';
const DIFF_NAMES = { easy: t('Dễ', 'Easy'), medium: t('Vừa', 'Medium'), hard: t('Khó', 'Hard') };
const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

hydrateIcons();
let board, solution, difficulty = 'easy', sel = null, timer = 0, paused = false, hints = HINTS, noteMode = false, done = false;
const readBest = () => { try { return JSON.parse(store.get(BEST_KEY)) ?? {}; } catch { return {}; } };

const diff = $('#diff');
diff.append(...DIFFICULTIES.map((d) => el('option', { value: d, textContent: DIFF_NAMES[d] })));
diff.onchange = () => startNew(diff.value);

const cellEls = Array.from({ length: N * N }, (_, i) => {
  const r = Math.floor(i / N), c = i % N;
  const d = el('div');
  d.onclick = () => { if (!paused) { sel = { r, c }; render(); } };
  return d;
});
$('#grid').append(...cellEls);
$('#pad').append(...Array.from({ length: N }, (_, k) => el('button', { textContent: k + 1, onclick: () => input(k + 1) })));

function startNew(d = difficulty) {
  ({ board, solution } = newPuzzle(d));
  difficulty = d;
  diff.value = d;
  timer = 0;
  paused = false;
  hints = HINTS;
  sel = null;
  done = false;
  render();
}

function input(num) {
  if (!sel || paused) return;
  const cell = board[sel.r][sel.c];
  if (cell.given) return;
  if (noteMode) {
    cell.notes = cell.notes.includes(num) ? cell.notes.filter((n) => n !== num) : [...cell.notes, num].sort((a, b) => a - b);
  } else {
    if (cell.value === num) return;
    cell.value = num;
    markConflicts(board);
    checkWin();
  }
  render();
}

function erase() {
  if (!sel || paused) return;
  const cell = board[sel.r][sel.c];
  if (cell.given) return;
  cell.value = null;
  markConflicts(board);
  render();
}

// Gợi ý: điền đúng số vào một ô trống ngẫu nhiên và chọn ô đó.
function hint() {
  if (hints <= 0 || paused) return;
  const empty = board.flatMap((row, r) => row.flatMap((cell, c) => (cell.value == null ? [{ r, c }] : [])));
  if (!empty.length) return;
  const { r, c } = empty[Math.floor(Math.random() * empty.length)];
  board[r][c].value = solution[r][c];
  markConflicts(board);
  hints--;
  sel = { r, c };
  checkWin();
  render();
}

function checkWin() {
  if (done || !isFull(board) || !isSolved(board)) return;
  done = true;
  toast.success(t(`Giải xong trong ${formatTime(timer)}!`, `Puzzle completed in ${formatTime(timer)}!`), { icon: 'party-popper' });
  const best = readBest();
  if (!best[difficulty] || timer < best[difficulty]) {
    best[difficulty] = timer;
    store.set(BEST_KEY, JSON.stringify(best));
    toast(t('Kỷ lục mới!', 'New best time!'), { icon: 'trophy' });
  }
}

function render() {
  const sv = sel && board[sel.r][sel.c].value;
  cellEls.forEach((d, i) => {
    const r = Math.floor(i / N), c = i % N, cell = board[r][c];
    const isSel = sel?.r === r && sel?.c === c;
    const related = sel && !isSel && (r === sel.r || c === sel.c
      || (Math.floor(r / BOX) === Math.floor(sel.r / BOX) && Math.floor(c / BOX) === Math.floor(sel.c / BOX))
      || (sv != null && cell.value === sv));
    d.className = [cell.given ? 'given' : 'user', cell.error && 'err', isSel && 'sel', related && 'rel',
      c % BOX === BOX - 1 && c < N - 1 && 'br', r % BOX === BOX - 1 && r < N - 1 && 'bb'].filter(Boolean).join(' ');
    if (cell.value != null) d.textContent = cell.value;
    else if (cell.notes.length) d.replaceChildren(el('div', { className: 'notes' }, ...Array.from({ length: N }, (_, k) => el('i', { textContent: cell.notes.includes(k + 1) ? k + 1 : '' }))));
    else d.textContent = '';
  });
  $('#ovPause').hidden = !paused;
  $('#btnPause').innerHTML = icon(paused ? 'play' : 'pause');
  $('#btnPause').title = paused ? t('Chơi tiếp', 'Resume') : t('Tạm dừng', 'Pause');
  $('#hints').textContent = hints || '';
  $('#btnHint').disabled = hints <= 0 || paused;
  for (const b of document.querySelectorAll('#pad button, #btnErase, #btnNote')) b.disabled = paused;
  $('#btnNote').classList.toggle('on', noteMode);
  $('#noteLbl').textContent = noteMode ? t('Ghi chú: BẬT', 'Notes: ON') : t('Ghi chú: TẮT', 'Notes: OFF');
  drawClock();
  const best = readBest();
  $('#bests').replaceChildren(...DIFFICULTIES.map((d) => el('div', { className: 'kv' }, el('span', { textContent: DIFF_NAMES[d] }), el('b', { textContent: best[d] ? formatTime(best[d]) : '–' }))));
}
const drawClock = () => { $('#clock').textContent = formatTime(timer); };

setInterval(() => {
  if (paused || done || !board) return;
  timer++;
  drawClock();
}, 1000);

addEventListener('keydown', (e) => {
  if (paused || e.target instanceof HTMLSelectElement) return;
  if (e.key >= '1' && e.key <= '9') return input(Number(e.key));
  if (e.key === 'Backspace' || e.key === 'Delete') return erase();
  const d = ARROWS[e.key];
  if (d) {
    e.preventDefault();
    sel = sel ? { r: Math.min(N - 1, Math.max(0, sel.r + d[0])), c: Math.min(N - 1, Math.max(0, sel.c + d[1])) } : { r: 0, c: 0 };
  } else if (e.key === 'n' || e.key === 'N') noteMode = !noteMode;
  else if (e.key === 'Escape') sel = null;
  else return;
  render();
});

$('#btnPause').onclick = () => { paused = !paused; render(); };
$('#btnResume').onclick = () => { paused = false; render(); };
$('#btnNew').onclick = () => startNew();
$('#btnHint').onclick = hint;
$('#btnErase').onclick = erase;
$('#btnNote').onclick = () => { noteMode = !noteMode; render(); };
$('#btnSide').onclick = () => $('#side').classList.toggle('open');
// Làm lại: hỏi trước, rồi xoá mọi số đã điền + ghi chú, đồng hồ về 0.
$('#btnReset').onclick = () => { $('#ovReset').hidden = false; };
$('#btnResetNo').onclick = () => { $('#ovReset').hidden = true; };
$('#btnResetYes').onclick = () => {
  for (const row of board) for (const cell of row) Object.assign(cell, { value: cell.given ? cell.value : null, error: false, notes: [] });
  timer = 0;
  done = false;
  $('#ovReset').hidden = true;
  render();
};
startNew();

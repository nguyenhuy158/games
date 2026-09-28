import { icon } from '../icons.js';

// Màn hình LCD kiểu Nokia 3310: 84×48 điểm, 2 màu (+ màu mờ cho "bóng ma" người khác), font pixel 3×5 tự vẽ.
export const W = 84, H = 48;
export const BG = '#c7f0d8', INK = '#43523d', DIM = '#8fae8f';

// Font 3×5: mỗi ký tự 5 hàng × 3 cột ('#' = sáng). Chỉ chữ in hoa không dấu (text() tự bỏ dấu).
const GLYPHS = {
  0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '###|..#|###|#..|###', 3: '###|..#|###|..#|###', 4: '#.#|#.#|###|..#|..#',
  5: '###|#..|###|..#|###', 6: '###|#..|###|#.#|###', 7: '###|..#|.#.|.#.|.#.', 8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|###',
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.', E: '###|#..|##.|#..|###',
  F: '###|#..|##.|#..|#..', G: '.##|#..|#.#|#.#|.##', H: '#.#|#.#|###|#.#|#.#', I: '###|.#.|.#.|.#.|###', J: '..#|..#|..#|#.#|.#.',
  K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###', M: '#.#|###|###|#.#|#.#', N: '##.|#.#|#.#|#.#|#.#', O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..', Q: '.#.|#.#|#.#|##.|.##', R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.', T: '###|.#.|.#.|.#.|.#.',
  U: '#.#|#.#|#.#|#.#|###', V: '#.#|#.#|#.#|#.#|.#.', W: '#.#|#.#|###|###|#.#', X: '#.#|#.#|.#.|#.#|#.#', Y: '#.#|#.#|.#.|.#.|.#.',
  Z: '###|..#|.#.|#..|###', ' ': '...|...|...|...|...', ':': '...|.#.|...|.#.|...', '-': '...|...|###|...|...', '!': '.#.|.#.|.#.|...|.#.',
  '.': '...|...|...|...|.#.', '/': '..#|..#|.#.|#..|#..', '?': '##.|..#|.#.|...|.#.', '+': '...|.#.|###|.#.|...', '>': '#..|.#.|..#|.#.|#..',
  '<': '..#|.#.|#..|.#.|..#', x: '...|#.#|.#.|#.#|...',
};
const FONT = Object.fromEntries(Object.entries(GLYPHS).map(([k, v]) => [k, v.split('|').map((r) => [...r].map((c) => c === '#'))]));
const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'D').toUpperCase();
export const textWidth = (s) => plain(s).length * 4 - 1;

export function createLCD(canvas) {
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  const lcd = {
    clear() { c.fillStyle = BG; c.fillRect(0, 0, W, H); },
    px(x, y, color = INK) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), 1, 1); },
    rect(x, y, w, h, color = INK) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); },
    frame(x, y, w, h, color = INK) { lcd.rect(x, y, w, 1, color); lcd.rect(x, y + h - 1, w, 1, color); lcd.rect(x, y, 1, h, color); lcd.rect(x + w - 1, y, 1, h, color); },
    // Vẽ sprite dạng mảng chuỗi ('#' = sáng), có thể lật ngang.
    sprite(x, y, rows, color = INK, flip = false) {
      rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') lcd.px(x + (flip ? r.length - 1 - i : i), y + j, color); }));
    },
    text(x, y, s, color = INK) {
      [...plain(s)].forEach((ch, k) => {
        const g = FONT[ch] ?? FONT['?'];
        g.forEach((row, j) => row.forEach((on, i) => on && lcd.px(x + k * 4 + i, y + j, color)));
      });
    },
    center(y, s, color = INK) { lcd.text(Math.floor((W - textWidth(s)) / 2), y, s, color); },
    // Hộp chữ giữa màn (GAME OVER, PAUSE...) có viền.
    banner(lines) {
      const w = Math.max(...lines.map(textWidth)) + 6, h = lines.length * 7 + 3;
      const x = Math.floor((W - w) / 2), y = Math.floor((H - h) / 2);
      lcd.rect(x, y, w, h, BG);
      lcd.frame(x, y, w, h);
      lines.forEach((l, i) => lcd.center(y + 3 + i * 7, l));
    },
  };
  lcd.clear();
  return lcd;
}

// Phím: 'up' | 'down' | 'left' | 'right' | 'ok'. onKey(key, down) gọi cả lúc nhấn và nhả (game giữ phím dùng được).
const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right',
  2: 'up', 8: 'down', 4: 'left', 6: 'right', 5: 'ok', Enter: 'ok', ' ': 'ok',
};
export function bindKeys(pad, onKey, enabled = () => true) {
  addEventListener('keydown', (e) => {
    const k = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!k || !enabled() || e.target.closest?.('input')) return;
    e.preventDefault();
    if (!e.repeat) onKey(k, true);
  });
  addEventListener('keyup', (e) => {
    const k = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (k && enabled()) onKey(k, false);
  });
  // Bàn phím trên màn: 2/4/5/6/8 như máy Nokia, giữ được (pointer events).
  const KEYS = [['', ''], ['2', 'up'], ['', ''], ['4', 'left'], ['5', 'ok'], ['6', 'right'], ['', ''], ['8', 'down'], ['', '']];
  pad.replaceChildren(...KEYS.map(([label, k]) => {
    const b = document.createElement('button');
    b.type = 'button';
    if (!k) { b.className = 'blank'; b.disabled = true; return b; }
    b.dataset.k = k;
    b.innerHTML = `<b>${label}</b><small>${k === 'ok' ? 'OK' : icon(`chevron-${k}`)}</small>`;
    const up = () => { if (b.classList.contains('on')) { b.classList.remove('on'); onKey(k, false); } };
    b.onpointerdown = (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); if (enabled()) onKey(k, true); };
    b.onpointerup = up;
    b.onpointercancel = up;
    b.oncontextmenu = (e) => e.preventDefault();
    return b;
  }));
}

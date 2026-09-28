import { nokiaApp } from '../room.js';
import { COLS, ROWS } from './logic.js';

// Ô 3px, sân bắt đầu từ y = 8 (hàng trên ghi điểm). Rắn của mình tô đặc, rắn người khác chỉ viền (LCD 2 màu).
const CELL = 3, X0 = 1, Y0 = 8;
const SPEED_NAMES = ['1', '2', '3', '4', '5'];
let lastStep = -1;

nokiaApp({
  game: 'snake',
  title: 'Rắn săn mồi',
  sub: 'Snake huyền thoại của Nokia — một mình, đua điểm mỗi người một sân, hoặc chung sân tranh mồi.',
  help: 'Phím mũi tên / WASD / 2-4-6-8 hoặc bàn phím trên máy. Ăn mồi để dài ra, con bọ thưởng biến mất sau vài giây. Đâm tường (nếu bật) hoặc đâm thân rắn là thua. Chung sân: đâm vào rắn khác là chết, con sống sót cuối cùng thắng. Sân riêng: ai cũng chơi tới khi chết, điểm cao nhất thắng.',
  lobbyText: (r) => (r.players.length < 2 ? 'Chơi một mình — mời bạn bè để đua điểm hoặc chung sân.'
    : r.cfg.mode === 'solo' ? `${Math.min(4, r.players.length)} người, mỗi người một sân — so điểm.` : `${Math.min(4, r.players.length)} con rắn chung một sân — tranh mồi, đâm nhau là thua.`),
  lobby(box, r, isHost, setCfg) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.append('Tốc độ ', ...SPEED_NAMES.map((n, i) => Object.assign(document.createElement('button'), {
      textContent: n, className: r.cfg.speed === i ? 'on' : '', disabled: !isHost, onclick: () => setCfg({ speed: i }),
    })));
    const walls = Object.assign(document.createElement('button'), {
      textContent: r.cfg.walls ? 'Có tường (đâm là chết)' : 'Không tường (đi xuyên)', disabled: !isHost, onclick: () => setCfg({ walls: !r.cfg.walls }),
    });
    const mode = document.createElement('div');
    mode.className = 'seg';
    mode.append('Chế độ ', ...[['arena', 'Chung sân'], ['solo', 'Sân riêng']].map(([m, n]) => Object.assign(document.createElement('button'), {
      textContent: n, className: (r.cfg.mode ?? 'arena') === m ? 'on' : '', disabled: !isHost, onclick: () => setCfg({ mode: m }),
    })));
    box.append(mode, seg, walls);
  },
  badge: (p, r) => (r.view?.board ?? r.view?.snakes)?.find((s) => s.id === p.id)?.score ?? '',
  scoreText: (v) => `${v} điểm`,
  onKey(k, down, r, app) {
    if (down && k !== 'ok' && r?.status === 'playing') app.send({ d: k });
  },
  onState(r, prev, app) {
    const v = r.view;
    if (!v || v.step === lastStep) return;
    lastStep = v.step;
    for (const e of v.events ?? []) {
      if (e.t === 'eat') app.beep(e.id === app.id ? 1200 : 700, 40);
      if (e.t === 'bug') app.beep(1600, 90);
      if (e.t === 'die') app.beep(180, 300, 'sawtooth');
    }
  },
  draw(lcd, r, now, app) {
    const v = r.view;
    if (!v) {
      lcd.center(10, 'SNAKE');
      drawSnakeArt(lcd);
      return;
    }
    const me = v.snakes.find((s) => s.id === app.id);
    lcd.text(1, 1, String(me?.score ?? v.snakes[0].score).padStart(4, '0'));
    if (v.bug) { lcd.sprite(58, 1, ['#.#', '.#.', '###', '.#.', '#.#']); lcd.text(64, 1, String(v.bug.left).padStart(2, '0')); }
    const board = v.board ?? v.snakes;
    if (board.length > 1) lcd.text(38, 1, `${board.filter((s) => s.alive).length}/${board.length}`);
    // Viền sân (có tường thì viền đậm 2px trên/dưới cho dễ thấy).
    lcd.frame(X0 - 1, Y0 - 1, COLS * CELL + 2, ROWS * CELL + 2);
    if (v.walls) lcd.frame(X0 - 1, Y0 - 2, COLS * CELL + 2, ROWS * CELL + 4);
    const at = ([x, y]) => [X0 + x * CELL, Y0 + y * CELL];
    if (v.food) { const [x, y] = at(v.food); lcd.sprite(x, y, ['.#.', '#.#', '.#.']); }
    if (v.bug && Math.floor(now / 250) % 2) { const [x, y] = at(v.bug.at); lcd.sprite(x, y, ['#.#', '.#.', '#.#']); }
    for (const s of v.snakes) {
      if (!s.alive && Math.floor(now / 300) % 2) continue; // rắn chết nhấp nháy
      const mine = s.id === app.id;
      s.body.forEach((c, i) => {
        const [x, y] = at(c);
        if (mine || i === 0) lcd.rect(x, y, CELL, CELL);
        else lcd.frame(x, y, CELL, CELL);
      });
      // Mắt: 1 điểm sáng trên đầu theo hướng đi.
      const [hx, hy] = at(s.body[0]);
      const eye = { up: [1, 0], down: [1, 2], left: [0, 1], right: [2, 1] }[s.dir];
      if (eye) lcd.px(hx + eye[0], hy + eye[1], '#c7f0d8');
    }
    if (r.status === 'playing' && !me && r.seats.length) lcd.banner(['DANG XEM']);
    else if (r.status === 'playing' && v.solo && me && !me.alive) lcd.banner(['HET VAN', 'CHO BAN BE']);
  },
});

// Hình rắn trang trí ở sảnh chờ.
function drawSnakeArt(lcd) {
  lcd.sprite(22, 22, [
    '..........................####......',
    '.........................#.#..#.....',
    '###############..........#....##....',
    '#.............#..........######.....',
    '#..##########.#...........#.........',
    '#..#........#.##############........',
    '####........#...............#.......',
    '............#################.......',
  ]);
}

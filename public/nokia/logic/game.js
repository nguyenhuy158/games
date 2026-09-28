import { nokiaApp } from '../room.js';
import { t } from '../../i18n.js';
import { SHAPES, SLOTS, KINDS, MAX_GUESSES } from './logic.js';

// Mỗi hàng 7px: 4 ô hình 5×5 (cách 7px) + phản hồi bên phải (chấm đặc = đúng chỗ, chấm rỗng = đúng hình sai chỗ).
// Hiện 5 lượt gần nhất + hàng đang nhập ở dưới cùng; cột phải: số lượt, đồng hồ, tiến độ người khác.
const ROW = 7, X0 = 2;
let pick = [0, 0, 0, 0], slot = 0, sentAt = -1;

nokiaApp({
  game: 'logic',
  title: 'Logic',
  sub: t('Logic của Nokia 3210 (Mastermind) — đoán mã 4 hình, đua cùng một mã với bạn bè.', 'Logic from the Nokia 3210 (Mastermind) — crack a 4-shape code, racing friends on the same code.'),
  help: t('Trái / phải chọn ô, lên / xuống đổi hình, OK (5) để đoán — hoặc chạm vào ô để đổi hình. Chấm đặc: đúng hình đúng chỗ; chấm rỗng: đúng hình nhưng sai chỗ. Tối đa 10 lượt, 5 phút.',
    'Left / right to pick a slot, up / down to change shape, OK (5) to guess — or tap a slot. Filled dot: right shape, right place; hollow dot: right shape, wrong place. Up to 10 guesses, 5 minutes.'),
  lobbyText: (r) => (r.players.length > 1 ? t(`${r.players.length} người đua giải cùng một mã.`, `${r.players.length} players race to crack the same code.`) : t('Một mình: giải mã trong ít lượt nhất.', 'Solo: crack it in as few guesses as possible.')),
  badge: (p, r) => { const o = r.view?.others?.[p.id]; return o ? (o.solved ? t(`xong ${o.n}`, `done ${o.n}`) : `${o.n}/10`) : ''; },
  scoreText: (v) => (v ? t(`${v} lượt`, `${v} guesses`) : t('chưa giải', 'unsolved')),
  onState(r, prev, app) {
    const n = r.view?.mine?.guesses.length ?? 0;
    if (r.status === 'playing' && prev?.status !== 'playing') { pick = [0, 0, 0, 0]; slot = 0; }
    if (n !== sentAt && n > 0) { const last = r.view.mine.guesses.at(-1); app.beep(last.exact === SLOTS ? 1800 : 700 + last.exact * 200, last.exact === SLOTS ? 300 : 70); }
    sentAt = n;
  },
  onKey(k, down, r, app) {
    if (!down || r?.status !== 'playing' || !r.view?.mine || r.view.mine.solved) return;
    if (k === 'left') slot = (slot + SLOTS - 1) % SLOTS;
    if (k === 'right') slot = (slot + 1) % SLOTS;
    if (k === 'up') pick[slot] = (pick[slot] + 1) % KINDS;
    if (k === 'down') pick[slot] = (pick[slot] + KINDS - 1) % KINDS;
    if (k === 'ok') { if (r.view.mine.guesses.length < MAX_GUESSES) app.send({ guess: [...pick] }); }
    else app.beep(1000, 15);
  },
  onTap(x, y, r, app) {
    if (r?.status !== 'playing' || !r.view?.mine || y < 40) return;
    const k = Math.floor((x - X0) / 7);
    if (k >= 0 && k < SLOTS) { slot = k; pick[k] = (pick[k] + 1) % KINDS; app.beep(1000, 15); }
    else if (x > 32 && x < 50) app.send({ guess: [...pick] });
  },
  draw(lcd, r, now, app) {
    const v = r.view;
    if (!v) { lcd.center(6, 'LOGIC'); SHAPES.forEach((s, i) => lcd.sprite(15 + i * 10, 22, s)); return; }
    const mine = v.mine ?? { guesses: [], solved: false };
    const rows = mine.guesses.slice(-5);
    rows.forEach((gss, k) => {
      const y = 1 + k * ROW;
      gss.guess.forEach((s, i) => lcd.sprite(X0 + i * 7, y, SHAPES[s]));
      // Phản hồi: 4 chấm 2×2 xếp 2×2 cạnh hàng.
      const dots = [...Array(gss.exact).fill('x'), ...Array(gss.near).fill('o')];
      dots.forEach((d, j) => {
        const dx = 31 + (j % 2) * 3, dy = y + Math.floor(j / 2) * 3;
        if (d === 'x') lcd.rect(dx, dy, 2, 2); else { lcd.px(dx, dy); lcd.px(dx + 1, dy + 1); }
      });
    });
    // Hàng đang nhập (hoặc mã thật khi hết ván); xem lại không biết người chơi đang xếp gì nên để trống.
    lcd.rect(0, 38, 40, 1);
    const cur = v.secret ?? (app.replay ? [] : pick);
    cur.forEach((s, i) => {
      lcd.sprite(X0 + i * 7, 41, SHAPES[s]);
      if (!v.secret && !mine.solved && i === slot && Math.floor(now / 350) % 2) lcd.rect(X0 + i * 7, 47, 5, 1);
    });
    // Cột phải
    lcd.rect(41, 0, 1, 48);
    lcd.text(44, 1, `${mine.guesses.length}/10`);
    const left = Math.max(0, Math.ceil((v.endsAt - now) / 1000));
    lcd.text(44, 8, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    if (mine.solved) lcd.text(44, 16, t('DUNG!', 'YES!'));
    else if (v.secret) lcd.text(44, 16, t('MA LA', 'CODE'));
    // Tiến độ người khác: mỗi người 1 hàng "1st chữ cái + số lượt".
    Object.entries(v.others).filter(([id]) => id !== app.pov).slice(0, 3).forEach(([id, o], k) => {
      const n = (r.players.find((p) => p.id === id)?.name ?? '?').slice(0, 3);
      lcd.text(44, 24 + k * 7, `${n} ${o.solved ? 'OK' : o.n}`);
    });
  },
});

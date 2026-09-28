import { nokiaApp } from '../room.js';
import { t } from '../../i18n.js';
import { ICONS, COLS } from './logic.js';

// Lưới 6×4 lá 12×10px bắt đầu (6, 7); hàng trên cùng ghi lượt / điểm.
const CX = 6, CY = 7, CW = 12, CH = 10;
let cursor = 0, lastSig = '';

nokiaApp({
  game: 'pairs',
  title: t('Lật hình', 'Pairs'),
  sub: t('Pairs II của Nokia 3310 — lật 2 lá tìm cặp, chơi một mình hoặc cả nhóm.', 'Pairs II from the Nokia 3310 — flip 2 cards to find a match, solo or with a group.'),
  help: t('Mũi tên / 2-4-6-8 để chọn lá, OK (5) để lật — hoặc chạm thẳng vào lá. Trúng cặp được 1 điểm và lật tiếp; trượt thì 2 lá úp lại, tới lượt người sau. Mỗi lượt 20 giây.',
    'Arrows / 2-4-6-8 to pick a card, OK (5) to flip — or tap a card. A match scores 1 and you flip again; a miss turns both back and passes the turn. 20 seconds per turn.'),
  lobbyText: (r) => (r.players.length > 1 ? t(`${r.players.length} người thay phiên lật, ai nhiều cặp nhất thắng.`, `${r.players.length} players take turns; most pairs wins.`) : t('Một mình: lật hết trong ít lượt nhất.', 'Solo: clear the board in as few turns as possible.')),
  badge: (p, r) => r.view?.score?.[p.id] ?? '',
  scoreText: (v, res) => (res.mode === 'solo' ? t(`${v} lượt`, `${v} turns`) : t(`${v} cặp`, `${v} pairs`)),
  onState(r, prev, app) {
    const v = r.view;
    if (!v) return;
    const sig = `${v.open.join(',')}|${v.owner.filter((o) => o).length}`;
    if (sig === lastSig) return;
    const matched = v.owner.filter((o) => o).length > (lastSig.split('|')[1] ?? 0);
    lastSig = sig;
    app.beep(matched ? 1500 : v.open.length === 2 ? 300 : 900, matched ? 160 : 50);
  },
  onKey(k, down, r, app) {
    if (!down || r?.status !== 'playing') return;
    const x = cursor % COLS, y = Math.floor(cursor / COLS);
    if (k === 'left') cursor = y * COLS + ((x + COLS - 1) % COLS);
    if (k === 'right') cursor = y * COLS + ((x + 1) % COLS);
    if (k === 'up') cursor = ((y + 3) % 4) * COLS + x;
    if (k === 'down') cursor = ((y + 1) % 4) * COLS + x;
    if (k === 'ok') open(r, app, cursor);
  },
  onTap(x, y, r, app) {
    const cx = Math.floor((x - CX) / CW), cy = Math.floor((y - CY) / CH);
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= 4) return;
    cursor = cy * COLS + cx;
    open(r, app, cursor);
  },
  draw(lcd, r, now, app) {
    const v = r.view;
    if (!v) { lcd.center(4, 'PAIRS II'); ICONS.slice(0, 6).forEach((ic, k) => lcd.sprite(8 + k * 12, 22, ic)); return; }
    const mine = v.turn === app.id;
    const left = v.deadline ? Math.max(0, Math.ceil((v.deadline - now) / 1000)) : '';
    const solo = r.seats.length === 1;
    lcd.text(1, 1, solo ? t(`LUOT ${v.moves}`, `TURN ${v.moves}`) : mine ? t(`LUOT BAN ${left}`, `YOUR TURN ${left}`) : `${(r.players.find((p) => p.id === v.turn)?.name ?? '').split(' ')[0].slice(0, 8)} ${left}`);
    if (!solo) lcd.text(84 - 4 * String(v.score[app.pov] ?? 0).length, 1, String(v.score[app.pov] ?? 0));
    v.cards.forEach((c, i) => {
      const x = CX + (i % COLS) * CW, y = CY + Math.floor(i / COLS) * CH;
      const sel = i === cursor && mine && r.status === 'playing';
      if (v.owner[i]) {
        // Lá đã ăn: chỉ còn hình, của mình thì có khung chấm.
        lcd.sprite(x + 2, y + 1, ICONS[c]);
        if (v.owner[i] === app.pov && !solo) lcd.px(x + 10, y + 8);
      } else if (c >= 0) {
        lcd.frame(x, y, CW - 1, CH - 1);
        lcd.sprite(x + 2, y + 1, ICONS[c]);
      } else {
        lcd.rect(x, y, CW - 1, CH - 1);
        lcd.rect(x + 2, y + 2, CW - 5, CH - 5, '#8fae8f');
      }
      if (sel && Math.floor(now / 300) % 2) lcd.frame(x - 1, y - 1, CW + 1, CH + 1);
    });
  },
});

function open(r, app, i) {
  const v = r.view;
  if (!v || v.turn !== app.id || v.cards[i] >= 0 || v.open.length >= 2) return app.beep(200, 40);
  app.send({ i });
}

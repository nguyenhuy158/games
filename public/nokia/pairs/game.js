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
  help: {
    vi: {
      goal: 'Lật tìm các cặp hình giống nhau; nhiều người thì ai ăn nhiều cặp nhất thắng.',
      play: [
        'Bàn 24 lá úp (6 × 4) gồm 12 cặp hình; mỗi lượt lật 2 lá.',
        'Trúng cặp: +1 điểm, 2 lá ở lại ngửa và bạn lật tiếp.',
        'Trượt: cả phòng xem 2 lá khoảng 1 giây rồi úp lại, tới lượt người sau.',
        'Mỗi lượt 20 giây, hết giờ là mất lượt.',
        'Tối đa 6 người thay phiên; bằng điểm ở vị trí cao nhất thì không ai thắng.',
        'Một mình: lật hết bàn trong ít lượt nhất.',
      ],
      keys: [
        'Mũi tên / WASD / 2-4-6-8: dời ô chọn (đi quá mép thì vòng lại).',
        'OK (Enter, Space hoặc 5): lật lá đang chọn.',
      ],
      touch: [
        'Chạm thẳng vào lá để lật.',
        'Hoặc dùng 2 / 4 / 6 / 8 và 5 trên bàn phím ảo; vuốt quanh màn hình để dời ô chọn.',
      ],
      tips: [
        'Nhớ cả những lá người khác vừa lật trượt.',
        'Nhiều người: lá bạn đã ăn có một chấm nhỏ ở góc dưới bên phải.',
      ],
    },
    en: {
      goal: 'Flip cards to find matching pairs; with friends, whoever collects the most pairs wins.',
      play: [
        '24 face-down cards (6 × 4) hold 12 pairs; you flip 2 cards per turn.',
        'Match: +1 point, both cards stay up and you flip again.',
        'Miss: everyone sees both cards for about a second, then they flip back and the turn passes.',
        '20 seconds per turn; run out of time and you lose the turn.',
        'Up to 6 players take turns; a tie for first place means no winner.',
        'Solo: clear the board in as few turns as possible.',
      ],
      keys: [
        'Arrows / WASD / 2-4-6-8: move the cursor (it wraps around the edges).',
        'OK (Enter, Space or 5): flip the selected card.',
      ],
      touch: [
        'Tap a card to flip it.',
        'Or use 2 / 4 / 6 / 8 and 5 on the on-screen keypad; swipe around the screen to move the cursor.',
      ],
      tips: [
        'Remember the cards other players just missed.',
        'With friends: cards you won have a small dot in the bottom-right corner.',
      ],
    },
  },
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

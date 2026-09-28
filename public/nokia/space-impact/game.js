import { nokiaApp } from '../room.js';
import { t } from '../../i18n.js';
import { SHIP, KINDS, BOSS, SHIP_SPEED, TOP, H, SHIP_H } from './logic.js';

// Server là chuẩn; tàu của mình được "đoán trước" theo phím đang giữ từ lúc nhận trạng thái (bớt cảm giác trễ mạng).
const keys = { up: false, down: false, left: false, right: false, fire: false };
let stateAt = 0, lastT = -1;

const app = nokiaApp({
  game: 'space-impact',
  title: 'Space Impact',
  sub: t('Space Impact của Nokia 3310 — bắn quái vũ trụ, hạ trùm cuối màn. Chơi chung tối đa 4 phi thuyền.', 'Space Impact from the Nokia 3310 — blast aliens and beat each level\'s boss. Up to 4 ships co-op.'),
  help: t('Giữ mũi tên / 2-4-6-8 để bay, giữ OK (5) hoặc Space để bắn liên tục. 3 màn, cuối mỗi màn có trùm. Mỗi tàu 3 mạng, trúng đạn thì nhấp nháy 2 giây không chết. Tim rơi ra: +1 mạng.',
    'Hold arrows / 2-4-6-8 to fly, hold OK (5) or Space to keep firing. 3 levels, each ends with a boss. 3 lives per ship; after a hit you blink invulnerable for 2 seconds. Dropped heart: +1 life.'),
  lobbyText: (r) => (r.players.length > 1 ? t(`${Math.min(4, r.players.length)} phi thuyền cùng chiến đấu.`, `${Math.min(4, r.players.length)} ships fighting together.`) : t('Một mình chiến đấu — mời bạn bè để chơi chung.', 'Flying solo — invite friends to play co-op.')),
  badge: (p, r) => r.view?.ships?.find((s) => s.id === p.id)?.score ?? '',
  scoreText: (v) => t(`${v} điểm`, `${v} pts`),
  onState(r) {
    const v = r.view;
    if (!v || v.t === lastT) return;
    lastT = v.t;
    stateAt = performance.now();
    for (const e of v.events ?? []) app.beep({ fire: 1400, kill: 500, hurt: 160, down: 110, boss: 300, bossdown: 1800, life: 1600 }[e] ?? 700, { fire: 15, kill: 60, boss: 400, bossdown: 500 }[e] ?? 120, e === 'fire' ? 'square' : 'sawtooth');
  },
  onKey(k, down, r) {
    const key = k === 'ok' ? 'fire' : k;
    if (keys[key] === down) return;
    keys[key] = down;
    if (r?.status === 'playing') app.send({ keys });
  },
  onTap() {},
  draw(lcd, r, now) {
    const v = r.view;
    if (!v) { lcd.center(4, 'SPACE IMPACT'); lcd.sprite(10, 22, SHIP); lcd.sprite(60, 20, KINDS.a.rows); lcd.sprite(70, 28, KINDS.c.rows); lcd.rect(20, 24, 3, 1); return; }
    const blink = Math.floor(now / 100) % 2;
    // HUD
    const me = v.ships.find((s) => s.id === app.id);
    for (let k = 0; k < (me?.lives ?? 0); k++) lcd.sprite(1 + k * 5, 0, ['#.#', '###', '.#.']);
    lcd.text(84 - 4 * 5, 0, String(v.score).padStart(5, '0'));
    lcd.text(30, 0, `M${v.level}`);
    lcd.rect(0, TOP - 1, 84, 1);
    // Quái, trùm, đạn
    for (const [kind, x, y] of v.enemies) lcd.sprite(x, y, KINDS[kind].rows);
    if (v.boss) {
      lcd.sprite(v.boss.x, v.boss.y, BOSS);
      lcd.rect(44, 2, Math.round((36 * v.boss.hp) / v.boss.max), 2); // thanh máu trùm
    }
    for (const [x, y] of v.bullets) lcd.rect(x, y, 3, 1);
    for (const [x, y] of v.shots) lcd.rect(x, y, 2, 2);
    for (const [x, y] of v.items) lcd.sprite(x, y, ['#.#.', '####', '.##.', '..#.']);
    // Tàu: của mình đoán trước theo phím, người khác vẽ mờ
    const dt = Math.min(0.12, (performance.now() - stateAt) / 1000);
    for (const s of v.ships) {
      if (s.lives <= 0 || (s.invul && blink)) continue;
      let { x, y } = s;
      if (s.id === app.id && r.status === 'playing') {
        x = Math.max(0, Math.min(42, x + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * SHIP_SPEED * dt));
        y = Math.max(TOP, Math.min(H - SHIP_H, y + ((keys.down ? 1 : 0) - (keys.up ? 1 : 0)) * SHIP_SPEED * dt));
      }
      lcd.sprite(x, y, SHIP, s.id === app.id ? undefined : '#8fae8f');
    }
    if (v.phase === 'boss' && v.boss && v.boss.x > 70 && blink) lcd.center(24, 'BOSS!');
    if (r.status === 'playing' && me && me.lives <= 0) lcd.banner([t('HET MANG', 'NO LIVES'), t('DANG XEM', 'WATCHING')]);
    else if (r.status === 'playing' && !me) lcd.banner([t('DANG XEM', 'WATCHING')]);
  },
});

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
  help: {
    vi: {
      goal: 'Bắn hạ quái vũ trụ và trùm cuối của cả 3 màn.',
      play: [
        'Tàu bay ở nửa trái màn hình và bắn sang phải; quái bay từ phải sang.',
        'Hạ quái được 10 / 15 / 20 điểm; trùm cuối màn được 200 × số màn.',
        'Mỗi màn: hết đợt quái thì trùm xuất hiện (thanh máu ở trên); hạ trùm màn 3 là phá đảo.',
        'Trúng đạn hoặc đâm vào quái / trùm: mất 1 mạng, nhấp nháy bất tử 2 giây.',
        'Mỗi tàu 3 mạng; quái bị hạ đôi khi rơi tim: +1 mạng (tối đa 5).',
        'Chơi chung tối đa 4 tàu, điểm cộng chung; hết ván khi mọi tàu hết mạng.',
      ],
      keys: [
        'Giữ mũi tên / WASD / 2-4-6-8 để bay 4 hướng.',
        'Giữ OK (Space, Enter hoặc 5) để bắn liên tục.',
      ],
      touch: [
        'Giữ 2 / 4 / 6 / 8 trên bàn phím ảo để bay, giữ 5 để bắn.',
        'Dùng 2 ngón để vừa bay vừa bắn cùng lúc.',
      ],
      tips: [
        'Từ màn 2, trùm bắn 3 tia toả ra; né theo chiều dọc.',
        'Hết mạng thì bạn vẫn xem đồng đội chơi tiếp.',
      ],
    },
    en: {
      goal: 'Shoot down the aliens and the boss of all 3 levels.',
      play: [
        'Your ship flies in the left half of the screen and fires right; aliens come from the right.',
        'Aliens are worth 10 / 15 / 20 points; a level boss gives 200 × the level number.',
        'Each level: a wave of aliens, then the boss (health bar on top); beat the level-3 boss to win.',
        'Getting shot or touching an alien / the boss costs 1 life, then you blink invulnerable for 2 seconds.',
        'Each ship has 3 lives; downed aliens sometimes drop a heart: +1 life (max 5).',
        'Up to 4 ships co-op with a shared score; the game ends when every ship is out of lives.',
      ],
      keys: [
        'Hold arrows / WASD / 2-4-6-8 to fly in 4 directions.',
        'Hold OK (Space, Enter or 5) to keep firing.',
      ],
      touch: [
        'Hold 2 / 4 / 6 / 8 on the on-screen keypad to fly, hold 5 to fire.',
        'Use two fingers to fly and fire at the same time.',
      ],
      tips: [
        'From level 2 the boss fires a 3-way spread; dodge vertically.',
        'Out of lives, you can keep watching your teammates.',
      ],
    },
  },
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
    const me = v.ships.find((s) => s.id === app.pov);
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
      lcd.sprite(x, y, SHIP, s.id === app.pov ? undefined : '#8fae8f');
    }
    if (v.phase === 'boss' && v.boss && v.boss.x > 70 && blink) lcd.center(24, 'BOSS!');
    if (r.status === 'playing' && me && me.lives <= 0) lcd.banner([t('HET MANG', 'NO LIVES'), t('DANG XEM', 'WATCHING')]);
    else if (r.status === 'playing' && !me) lcd.banner([t('DANG XEM', 'WATCHING')]);
  },
});

import { nokiaApp } from '../room.js';
import { t } from '../../i18n.js';
import { createSim, step, score, scrollAt, TOP, PW, BALL } from './logic.js';

// Máy mình tự chạy mô phỏng (cùng hạt giống với cả phòng), gửi vị trí 5 lần/giây; người khác hiện bóng mờ.
const BALL_ROWS = ['.##.', '####', '####', '.##.'];
let sim = null, simSeed = null, keys = {}, lastT = 0, lastSent = 0, sentDone = false;

const app = nokiaApp({
  game: 'rapid-roll',
  title: 'Rapid Roll',
  sub: t('Rapid Roll của Nokia 1110i — lăn bóng xuống giữa các thanh đang trôi lên, đua cùng đề với bạn bè.', 'Rapid Roll from the Nokia 1110i — roll down between rising platforms, racing friends on the same course.'),
  help: t('Giữ trái / phải (4 / 6 hoặc mũi tên) để lăn bóng. Đừng để bị đẩy lên chạm gai trên cùng, đừng rơi khỏi đáy và tránh thanh có gai. Tim: +1 mạng. Càng lâu càng nhanh; ai trụ xa nhất thắng.',
    'Hold left / right (4 / 6 or arrows) to roll. Don\'t get pushed into the spikes on top, don\'t fall off the bottom, avoid spiked platforms. Heart: +1 life. It speeds up over time; whoever lasts longest wins.'),
  lobbyText: (r) => (r.players.length > 1 ? t(`${r.players.length} người đua cùng một đề.`, `${r.players.length} players race the same course.`) : t('Một mình: trụ càng xa càng tốt.', 'Solo: go as far as you can.')),
  badge: (p, r) => r.view?.runners?.[p.id]?.score ?? '',
  scoreText: (v) => `${v} m`,
  onState(r) {
    const v = r.view;
    if (r.status === 'playing' && v && v.seed !== simSeed) { sim = createSim(v.seed); simSeed = v.seed; sentDone = false; lastT = 0; keys = {}; }
    if (r.status !== 'playing') simSeed = null;
  },
  onKey(k, down) { if (k === 'left' || k === 'right') keys[k] = down; },
  onTap() {},
  draw(lcd, r, now) {
    const v = r.view;
    if (!v || !sim) { lcd.center(8, 'RAPID ROLL'); lcd.sprite(40, 22, BALL_ROWS); lcd.rect(30, 26, PW, 2); lcd.rect(50, 36, PW, 2); return; }
    const t = Math.max(0, (now - v.startAt) / 1000);
    const mine = v.runners[app.id];
    // Chạy mô phỏng tới thời điểm hiện tại (bước nhỏ 1/60 giây cho ổn định).
    if (mine && !sim.dead && t > 0) {
      while (sim.t + 1 / 60 <= t) {
        step(sim, 1 / 60, keys);
        for (const e of sim.events) app.beep({ heart: 1600, spike: 200, top: 200, fall: 150, dead: 100 }[e] ?? 600, e === 'dead' ? 400 : 90);
      }
      if (now - lastSent > 200) { lastSent = now; app.send({ at: [sim.x, sim.y], score: score(sim) }); }
    }
    if (mine && sim.dead && !sentDone) { sentDone = true; app.send({ done: true, score: score(sim) }); }
    const s = scrollAt(mine ? sim.t : t);
    // Gai trên cùng + HUD
    for (let x = 0; x < 84; x += 4) lcd.sprite(x, TOP - 3, ['.#..', '###.', '####'].map((row) => row));
    lcd.text(1, 1, String(score(sim)).padStart(5, '0'));
    if (mine) for (let k = 0; k < sim.lives; k++) lcd.sprite(80 - k * 6, 1, ['#.#.', '###.', '.#..']);
    // Thanh
    for (const p of sim.plats) {
      const y = Math.round(p.y - s);
      if (y < TOP - 1 || y > 48) continue;
      if (p.spike) { for (let x = 0; x < PW; x += 2) lcd.px(p.x + x, y - 1); lcd.rect(p.x, y, PW, 2); }
      else lcd.rect(p.x, y, PW, 2);
      if (p.heart) lcd.sprite(p.x + 6, y - 4, ['#.#', '###', '.#.']);
    }
    // Bóng mờ người khác
    for (const [id, o] of Object.entries(v.runners)) {
      if (id === app.id || !o.at || o.done) continue;
      lcd.sprite(o.at[0], o.at[1] - s, BALL_ROWS, '#8fae8f');
    }
    if (mine && !(sim.invul > 0 && Math.floor(now / 120) % 2)) lcd.sprite(sim.x, sim.y - s, BALL_ROWS);
    if (t <= 0) lcd.banner([String(Math.ceil((v.startAt - now) / 1000))]);
    else if (mine && sim.dead) lcd.banner(['GAME OVER', `${score(sim)} M`]);
    else if (!mine) lcd.banner([t('DANG XEM', 'WATCHING')]);
  },
});

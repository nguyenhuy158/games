import { nokiaApp } from '../room.js';
import { t } from '../../i18n.js';
import { createSim, step, rollTo, score, scrollAt, TOP, PW, BALL } from './logic.js';

// Máy mình tự chạy mô phỏng (cùng hạt giống với cả phòng), gửi vị trí 5 lần/giây; người khác hiện bóng mờ.
const BALL_ROWS = ['.##.', '####', '####', '.##.'];
let sim = null, simSeed = null, keys = {}, lastT = 0, lastSent = 0, sentDone = false;

const app = nokiaApp({
  game: 'rapid-roll',
  title: 'Rapid Roll',
  sub: t('Rapid Roll của Nokia 1110i — lăn bóng xuống giữa các thanh đang trôi lên, đua cùng đề với bạn bè.', 'Rapid Roll from the Nokia 1110i — roll down between rising platforms, racing friends on the same course.'),
  help: {
    vi: {
      goal: 'Lăn bóng xuống giữa các thanh đang trôi lên và trụ được xa nhất.',
      play: [
        'Màn cuộn liên tục: đứng yên trên thanh thì bóng bị đẩy dần lên dãy gai trên cùng.',
        'Mất mạng khi chạm gai trên cùng, rơi khỏi đáy màn hoặc đậu lên thanh có gai.',
        '3 mạng (tối đa 5); tim trên thanh: +1 mạng. Hồi sinh xong được bất tử 1,5 giây.',
        'Tốc độ tăng dần trong khoảng 44 giây đầu rồi giữ ở mức cao nhất.',
        'Điểm = quãng đường (m). Cả phòng chơi cùng một đề, bóng người khác hiện mờ; xa nhất thắng.',
        'Đếm ngược 3 giây trước khi chạy; mỗi ván tối đa 4 phút.',
      ],
      keys: [
        'Giữ trái / phải (mũi tên, A / D hoặc 4 / 6) để lăn bóng.',
      ],
      touch: [
        'Giữ phím 4 / 6 trên bàn phím ảo để lăn bóng.',
      ],
      tips: [
        'Lăn khỏi mép thanh để rơi xuống thanh dưới, đừng đứng lâu trên một thanh.',
        'Thanh có gai có hàng chấm phía trên; lăn né ngay lúc đang rơi.',
      ],
    },
    en: {
      goal: 'Roll down between rising platforms and survive as far as you can.',
      play: [
        'The screen keeps scrolling: stay on a platform and you get pushed up toward the top spikes.',
        'You lose a life touching the top spikes, falling off the bottom or landing on a spiked platform.',
        '3 lives (max 5); a heart on a platform gives +1 life. After respawning you are safe for 1.5 seconds.',
        'Speed rises over roughly the first 44 seconds, then stays at its maximum.',
        'Score = distance (m). Everyone plays the same course, others show as faint balls; farthest wins.',
        '3-second countdown before the start; each game lasts at most 4 minutes.',
      ],
      keys: [
        'Hold left / right (arrows, A / D or 4 / 6) to roll.',
      ],
      touch: [
        'Hold 4 / 6 on the on-screen keypad to roll.',
      ],
      tips: [
        'Roll off a platform edge to drop to the next one; don\'t linger on one platform.',
        'Spiked platforms have a dotted row on top; steer away while you fall.',
      ],
    },
  },
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
    const sec = Math.max(0, (now - v.startAt) / 1000); // không đặt tên t: đè mất t() dịch chữ
    const mine = v.runners[app.id];
    // Người xem / bản xem lại: theo dõi người 1 qua vị trí đã gửi lên, đề tự cuộn theo giờ (tua lùi thì dựng lại đề).
    const fid = mine ? app.id : r.seats[0], focus = mine ? null : v.runners[fid];
    if (!mine) { if (sec < sim.t) sim = createSim(v.seed); rollTo(sim, sec); }
    // Chạy mô phỏng tới thời điểm hiện tại (bước nhỏ 1/60 giây cho ổn định).
    if (mine && !sim.dead && sec > 0) {
      while (sim.t + 1 / 60 <= sec) {
        step(sim, 1 / 60, keys);
        for (const e of sim.events) app.beep({ heart: 1600, spike: 200, top: 200, fall: 150, dead: 100 }[e] ?? 600, e === 'dead' ? 400 : 90);
      }
      if (now - lastSent > 200) { lastSent = now; app.send({ at: [sim.x, sim.y], score: score(sim) }); }
    }
    if (mine && sim.dead && !sentDone) { sentDone = true; app.send({ done: true, score: score(sim) }); }
    const s = scrollAt(sim.t);
    // Gai trên cùng + HUD
    for (let x = 0; x < 84; x += 4) lcd.sprite(x, TOP - 3, ['.#..', '###.', '####'].map((row) => row));
    lcd.text(1, 1, String(focus ? focus.score : score(sim)).padStart(5, '0'));
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
      if (id === fid || !o.at || o.done) continue;
      lcd.sprite(o.at[0], o.at[1] - s, BALL_ROWS, '#8fae8f');
    }
    if (mine && !(sim.invul > 0 && Math.floor(now / 120) % 2)) lcd.sprite(sim.x, sim.y - s, BALL_ROWS);
    else if (focus && !focus.done) { const [x, y] = focus.at ?? [sim.x, sim.y]; lcd.sprite(x, y - s, BALL_ROWS); }
    if (sec <= 0) lcd.banner([String(Math.ceil((v.startAt - now) / 1000))]);
    else if (mine && sim.dead) lcd.banner(['GAME OVER', `${score(sim)} M`]);
    else if (!mine && !app.replay) lcd.banner([t('DANG XEM', 'WATCHING')]);
    else if (focus?.done) lcd.banner(['GAME OVER', `${focus.score} M`]);
  },
});

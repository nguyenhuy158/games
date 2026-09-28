import { nokiaApp } from '../room.js';
import { t } from '../../i18n.js';
import { LEVELS, createSim, step, jump, timeScore, T, BALL } from './logic.js';

// Mô phỏng chạy ở máy mình (cùng màn với cả phòng); camera cuộn ngang theo bóng; người khác hiện bóng mờ.
const BALL_ROWS = ['.####.', '##..##', '#....#', '#....#', '##..##', '.####.'];
const BRICK = ['######', '#..#..', '######', '..#..#', '######', '#..#..'];
const SPIKE = ['......', '..#...', '..#...', '.###..', '.###..', '#####.'];
let sim = null, simKey = null, keys = {}, lastSent = 0, sentDone = false;

const app = nokiaApp({
  game: 'bounce',
  title: 'Bounce',
  sub: t('Bounce của Nokia 6600 — quả bóng nhảy qua các màn, chui qua hết vòng rồi về cửa đích. Đua cùng màn với bạn bè.', 'Bounce from the Nokia 6600 — hop through every ring, then reach the exit. Race friends on the same level.'),
  help: t('Giữ trái / phải để lăn, lên (2) hoặc OK (5) để nhảy. Chui qua mọi vòng thì cửa đích mới mở. Tránh gai; mất mạng thì hồi sinh chỗ đứng gần nhất. Về đích nhanh nhất thắng.',
    'Hold left / right to roll, up (2) or OK (5) to jump. The exit opens after every ring. Avoid spikes; losing a life respawns you at the last safe spot. Fastest to the exit wins.'),
  lobbyText: (r) => (r.players.length > 1 ? t(`${r.players.length} người đua cùng màn ${r.cfg.level + 1}.`, `${r.players.length} players race level ${r.cfg.level + 1}.`) : t(`Một mình: về đích màn ${r.cfg.level + 1} nhanh nhất có thể.`, `Solo: finish level ${r.cfg.level + 1} as fast as you can.`)),
  lobby(box, r, isHost, setCfg) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.append(t('Màn ', 'Level '), ...LEVELS.map((_, i) => Object.assign(document.createElement('button'), {
      textContent: i + 1, className: r.cfg.level === i ? 'on' : '', disabled: !isHost, onclick: () => setCfg({ level: i }),
    })));
    box.append(seg);
  },
  badge: (p, r) => { const o = r.view?.runners?.[p.id]; return o ? (o.done ? (o.finished ? `${o.score}s` : t('thua', 'out')) : '') : ''; },
  scoreText: (v) => t(`${v} giây`, `${v} s`),
  onState(r) {
    const v = r.view;
    const key = v && `${v.seed}:${v.level}`;
    if (r.status === 'playing' && v && key !== simKey) { sim = createSim(v.level); simKey = key; sentDone = false; keys = {}; }
    if (r.status !== 'playing') simKey = null;
  },
  onKey(k, down) {
    if (k === 'left' || k === 'right') keys[k] = down;
    if ((k === 'up' || k === 'ok') && down && sim) jump(sim);
  },
  onTap(x, y) { if (sim) jump(sim); },
  draw(lcd, r, now) {
    const v = r.view;
    if (!v || !sim) { lcd.center(8, 'BOUNCE'); lcd.sprite(39, 20, BALL_ROWS); for (let x = 0; x < 84; x += 6) lcd.sprite(x, 36, BRICK); return; }
    const sec = (now - v.startAt) / 1000; // không đặt tên t: đè mất t() dịch chữ
    const mine = v.runners[app.id];
    // Người xem / bản xem lại: camera theo người 1 (vị trí đã gửi lên); vòng họ đã thu không biết nên vẫn vẽ đủ.
    const fid = mine ? app.id : r.seats[0], focus = mine ? null : v.runners[fid];
    if (mine && sec > 0 && !sim.dead && !sim.finished) {
      while (sim.t + 1 / 60 <= sec) {
        step(sim, 1 / 60, keys);
        for (const e of sim.events) app.beep({ jump: 900, ring: 1500, life: 1700, hurt: 200, dead: 120, finish: 1900 }[e] ?? 600, e === 'finish' || e === 'dead' ? 350 : 50);
        if (sim.dead || sim.finished) break;
      }
      if (now - lastSent > 200) { lastSent = now; app.send({ at: [sim.x, sim.y], score: timeScore(sim) }); }
    }
    if (mine && (sim.dead || sim.finished) && !sentDone) { sentDone = true; app.send({ done: true, finished: sim.finished, score: timeScore(sim) }); }
    const [bx, by] = mine ? [sim.x, sim.y] : focus?.at ?? [sim.x, sim.y];
    // Camera
    const lv = sim.lv, width = lv[0].length * T;
    const cam = Math.max(0, Math.min(width - 84, Math.round(bx - 39)));
    const c0 = Math.floor(cam / T);
    const open = mine ? sim.rings.size >= sim.total : !!focus?.finished;
    for (let r = 0; r < lv.length; r++) for (let c = c0; c <= c0 + 15 && c < lv[0].length; c++) {
      const ch = lv[r][c], x = c * T - cam, y = r * T;
      if (ch === '#') lcd.sprite(x, y, BRICK);
      else if (ch === '^') lcd.sprite(x, y, SPIKE);
      else if (ch === 'o' && lv[r - 1]?.[c] !== 'o' && !sim.rings.has(`${c}:${r}`)) lcd.sprite(x + 1, y, ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.']);
      else if (ch === 'l' && !sim.lifeTaken.has(`${c}:${r}`)) lcd.sprite(x + 1, y + 1, ['#.#.', '####', '.##.', '..#.']);
      else if (ch === 'E' && lv[r - 1]?.[c] !== 'E') { lcd.frame(x, y, T, T * 2); if (open) lcd.rect(x + 1, y + 1, T - 2, T * 2 - 2); else for (let k = 2; k < 11; k += 3) lcd.rect(x + 1, y + k, T - 2, 1); }
    }
    for (const [id, o] of Object.entries(v.runners)) {
      if (id === fid || !o.at || o.done) continue;
      lcd.sprite(o.at[0] - cam, o.at[1], BALL_ROWS, '#8fae8f');
    }
    if (mine || !focus?.done) lcd.sprite(bx - cam, by, BALL_ROWS);
    // HUD trên hàng gạch trên cùng
    lcd.rect(0, 0, 84, 6, '#c7f0d8');
    if (mine) lcd.text(1, 0, `O${sim.rings.size}/${sim.total}`);
    lcd.text(30, 0, `${Math.floor(mine ? sim.t : focus?.score ?? Math.max(0, sec))}S`);
    if (mine) for (let k = 0; k < Math.min(5, sim.lives); k++) lcd.sprite(80 - k * 5, 1, ['#.#', '###', '.#.']);
    const done = mine ? sim.finished || sim.dead : focus?.done, won = mine ? sim.finished : focus?.finished;
    const sc = mine ? timeScore(sim) : focus?.score;
    if (sec <= 0) lcd.banner([String(Math.ceil((v.startAt - now) / 1000))]);
    else if (!mine && !app.replay) lcd.banner([t('DANG XEM', 'WATCHING')]);
    else if (won) lcd.banner([t('VE DICH!', 'FINISH!'), t(`${sc} GIAY`, `${sc} SEC`)]);
    else if (done) lcd.banner(['GAME OVER']);
  },
});

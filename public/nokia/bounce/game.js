import { nokiaApp } from '../room.js';
import { LEVELS, createSim, step, jump, timeScore, T, BALL } from './logic.js';

// Mô phỏng chạy ở máy mình (cùng màn với cả phòng); camera cuộn ngang theo bóng; người khác hiện bóng mờ.
const BALL_ROWS = ['.####.', '##..##', '#....#', '#....#', '##..##', '.####.'];
const BRICK = ['######', '#..#..', '######', '..#..#', '######', '#..#..'];
const SPIKE = ['......', '..#...', '..#...', '.###..', '.###..', '#####.'];
let sim = null, simKey = null, keys = {}, lastSent = 0, sentDone = false;

const app = nokiaApp({
  game: 'bounce',
  title: 'Bounce',
  sub: 'Bounce của Nokia 6600 — quả bóng nhảy qua các màn, chui qua hết vòng rồi về cửa đích. Đua cùng màn với bạn bè.',
  help: 'Giữ trái / phải để lăn, lên (2) hoặc OK (5) để nhảy. Chui qua mọi vòng thì cửa đích mới mở. Tránh gai; mất mạng thì hồi sinh chỗ đứng gần nhất. Về đích nhanh nhất thắng.',
  lobbyText: (r) => (r.players.length > 1 ? `${r.players.length} người đua cùng màn ${r.cfg.level + 1}.` : `Một mình: về đích màn ${r.cfg.level + 1} nhanh nhất có thể.`),
  lobby(box, r, isHost, setCfg) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.append('Màn ', ...LEVELS.map((_, i) => Object.assign(document.createElement('button'), {
      textContent: i + 1, className: r.cfg.level === i ? 'on' : '', disabled: !isHost, onclick: () => setCfg({ level: i }),
    })));
    box.append(seg);
  },
  badge: (p, r) => { const o = r.view?.runners?.[p.id]; return o ? (o.done ? (o.finished ? `${o.score}s` : 'thua') : '') : ''; },
  scoreText: (v, res) => `${v} giây`,
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
    const t = (now - v.startAt) / 1000;
    const mine = v.runners[app.id];
    if (mine && t > 0 && !sim.dead && !sim.finished) {
      while (sim.t + 1 / 60 <= t) {
        step(sim, 1 / 60, keys);
        for (const e of sim.events) app.beep({ jump: 900, ring: 1500, life: 1700, hurt: 200, dead: 120, finish: 1900 }[e] ?? 600, e === 'finish' || e === 'dead' ? 350 : 50);
        if (sim.dead || sim.finished) break;
      }
      if (now - lastSent > 200) { lastSent = now; app.send({ at: [sim.x, sim.y], score: timeScore(sim) }); }
    }
    if (mine && (sim.dead || sim.finished) && !sentDone) { sentDone = true; app.send({ done: true, finished: sim.finished, score: timeScore(sim) }); }
    // Camera
    const lv = sim.lv, width = lv[0].length * T;
    const cam = Math.max(0, Math.min(width - 84, Math.round(sim.x - 39)));
    const c0 = Math.floor(cam / T);
    const open = sim.rings.size >= sim.total;
    for (let r = 0; r < lv.length; r++) for (let c = c0; c <= c0 + 15 && c < lv[0].length; c++) {
      const ch = lv[r][c], x = c * T - cam, y = r * T;
      if (ch === '#') lcd.sprite(x, y, BRICK);
      else if (ch === '^') lcd.sprite(x, y, SPIKE);
      else if (ch === 'o' && lv[r - 1]?.[c] !== 'o' && !sim.rings.has(`${c}:${r}`)) lcd.sprite(x + 1, y, ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.']);
      else if (ch === 'l' && !sim.lifeTaken.has(`${c}:${r}`)) lcd.sprite(x + 1, y + 1, ['#.#.', '####', '.##.', '..#.']);
      else if (ch === 'E' && lv[r - 1]?.[c] !== 'E') { lcd.frame(x, y, T, T * 2); if (open) lcd.rect(x + 1, y + 1, T - 2, T * 2 - 2); else for (let k = 2; k < 11; k += 3) lcd.rect(x + 1, y + k, T - 2, 1); }
    }
    for (const [id, o] of Object.entries(v.runners)) {
      if (id === app.id || !o.at || o.done) continue;
      lcd.sprite(o.at[0] - cam, o.at[1], BALL_ROWS, '#8fae8f');
    }
    lcd.sprite(sim.x - cam, sim.y, BALL_ROWS);
    // HUD trên hàng gạch trên cùng
    lcd.rect(0, 0, 84, 6, '#c7f0d8');
    lcd.text(1, 0, `O${sim.rings.size}/${sim.total}`);
    lcd.text(30, 0, `${Math.floor(sim.t)}S`);
    for (let k = 0; k < Math.min(5, sim.lives); k++) lcd.sprite(80 - k * 5, 1, ['#.#', '###', '.#.']);
    if (t <= 0) lcd.banner([String(Math.ceil((v.startAt - now) / 1000))]);
    else if (sim.finished) lcd.banner(['VE DICH!', `${timeScore(sim)} GIAY`]);
    else if (sim.dead) lcd.banner(['GAME OVER']);
    else if (!mine) lcd.banner(['DANG XEM']);
  },
});

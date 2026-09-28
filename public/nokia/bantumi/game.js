import { nokiaApp } from '../room.js';
import { t, tx } from '../../i18n.js';
import { pits, store } from './logic.js';

// LCD: kho đối thủ bên trái, kho mình bên phải; hàng dưới là 6 hố của mình (trái -> phải theo chiều rải),
// hàng trên là hố đối thủ (ngược lại). Người xem thấy theo phía người 1.
const PX = 12, PW = 10, TOP = 8, BOT = 23, PH = 12, NAMES = 41;
let cursor = 0, lastMoves = -1;

const seatOf = (r, id) => (r.view?.side.indexOf(id) ?? -1) + 1;
const layout = (r, id) => {
  const me = seatOf(r, id) || 1;
  return { me, bottom: pits(me), top: [...pits(3 - me)].reverse(), right: store(me), left: store(3 - me) };
};

nokiaApp({
  game: 'bantumi',
  title: 'Bantumi',
  sub: t('Trò rải sỏi của Nokia 3310 (Kalah) — đấu 1v1 hoặc với máy.', 'The Nokia 3310 seed-sowing game (Kalah) — 1v1 or vs the bot.'),
  help: t('Trái / phải để chọn hố, OK (5) để rải — hoặc chạm thẳng vào hố. Hạt cuối vào kho mình: đi tiếp. Hạt cuối vào hố trống bên mình: ăn luôn sỏi hố đối diện. Hết sỏi một bên thì kho nhiều hơn thắng. Mỗi nước 30 giây.',
    'Left / right to pick a pit, OK (5) to sow — or tap a pit. Last seed in your store: go again. Last seed in an empty pit on your side: capture the opposite pit too. When one side runs out, the bigger store wins. 30 seconds per move.'),
  lobbyText: (r) => (r.players.length > 1 ? t(`${r.players[0].name} đấu ${r.players[1].name}.`, `${r.players[0].name} vs ${r.players[1].name}.`) : t('Chỉ có mình bạn — sẽ đấu với máy.', 'Just you — you will play the bot.')),
  lobby(box, r, isHost, setCfg) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.append(t('Sỏi mỗi hố ', 'Seeds per pit '), ...[3, 4, 5, 6].map((n) => Object.assign(document.createElement('button'), {
      textContent: n, className: r.cfg.seeds === n ? 'on' : '', disabled: !isHost, onclick: () => setCfg({ seeds: n }),
    })));
    box.append(seg);
  },
  badge: (p, r) => { const k = seatOf(r, p.id); return k ? r.view.board[store(k)] : ''; },
  scoreText: (v) => t(`${v} sỏi`, `${v} seeds`),
  onState(r, prev, app) {
    const v = r.view;
    if (!v || v.moves === lastMoves) return;
    if (lastMoves >= 0 && v.last) app.beep(v.last.captured ? 1500 : v.last.again ? 1200 : 800, v.last.captured ? 160 : 60);
    lastMoves = v.moves;
    // Con trỏ nhảy về hố còn sỏi gần nhất.
    const { me, bottom } = layout(r, app.id);
    if (v.turn === me && !v.board[bottom[cursor]]) cursor = Math.max(0, bottom.findIndex((i) => v.board[i]));
  },
  onKey(k, down, r, app) {
    if (!down || r?.status !== 'playing') return;
    if (k === 'left') cursor = (cursor + 5) % 6;
    if (k === 'right') cursor = (cursor + 1) % 6;
    if (k === 'ok') sow(r, app, layout(r, app.id).bottom[cursor]);
  },
  onTap(x, y, r, app) {
    if (r?.status !== 'playing' || y < BOT || y > BOT + PH || x < PX || x >= PX + 6 * PW) return;
    cursor = Math.floor((x - PX) / PW);
    sow(r, app, layout(r, app.id).bottom[cursor]);
  },
  draw(lcd, r, now, app) {
    const v = r.view;
    if (!v) { lcd.center(8, 'BANTUMI'); art(lcd); return; }
    const L = layout(r, app.pov); // xem lại: bàn theo phía người 1
    const mine = seatOf(r, app.id) === v.turn;
    const left = Math.max(0, Math.ceil((v.deadline - now) / 1000));
    const bot = v.side[v.turn - 1] === 'bot';
    lcd.text(1, 1, r.status !== 'playing' ? t('HET VAN', 'GAME OVER') : mine ? t(`LUOT BAN ${left}`, `YOUR TURN ${left}`) : bot ? t('MAY NGHI...', 'BOT...') : t(`DOI ${left}`, `WAIT ${left}`));
    // Kho
    for (const [x, i] of [[0, L.left], [74, L.right]]) {
      lcd.frame(x, TOP, 10, BOT + PH - TOP);
      num(lcd, x, TOP + 12, v.board[i]);
    }
    // Hố
    const lastSet = new Set(v.last?.path ?? []);
    const rowDraw = (row, y, isMe) => row.forEach((i, k) => {
      const x = PX + k * PW;
      const sel = isMe && mine && k === cursor;
      if (sel) lcd.rect(x, y, PW - 1, PH); else lcd.frame(x, y, PW - 1, PH);
      num(lcd, x - 0.5, y + 3.5, v.board[i], sel ? '#c7f0d8' : undefined);
      // Đánh dấu nước vừa đi: chấm ở hố xuất phát, gạch dưới hố hạt cuối rơi vào.
      if (v.last?.from === i) lcd.px(x + 4, isMe ? y + PH + 1 : y - 2);
      if (v.last?.path.at(-1) === i && lastSet.size) lcd.rect(x + 2, isMe ? y + PH + 1 : y - 2, 5, 1);
    });
    rowDraw(L.top, TOP, false);
    rowDraw(L.bottom, BOT, true);
    // Tên 2 bên (chữ nhỏ ở giữa)
    const n = (s) => (tx(s) ?? '').split(' ')[0].slice(0, 5);
    // Tên: đối thủ bên trái (cạnh kho của họ), mình bên phải.
    lcd.text(0, NAMES, n(v.names[2 - L.me]));
    const mn = n(v.names[L.me - 1]);
    lcd.text(84 - 4 * mn.length + 1, NAMES, mn);
  },
});

function sow(r, app, i) {
  const v = r.view;
  if (seatOf(r, app.id) !== v.turn) return app.beep(200, 40);
  if (!v.board[i]) return app.beep(200, 40);
  app.send({ i });
}

// Số 1-2 chữ số căn giữa ô rộng 9px.
function num(lcd, x, y, n, color) {
  const s = String(n);
  lcd.text(Math.round(x + (10 - (s.length * 4 - 1)) / 2), Math.round(y), s, color);
}

function art(lcd) {
  for (let k = 0; k < 6; k++) {
    lcd.frame(12 + k * 10, 18, 9, 9);
    lcd.frame(12 + k * 10, 30, 9, 9);
    lcd.rect(15 + k * 10, 21, 3, 3);
    lcd.rect(15 + k * 10, 33, 3, 3);
  }
  lcd.frame(1, 18, 9, 21);
  lcd.frame(74, 18, 9, 21);
}

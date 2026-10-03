// Khung chung cho các game Nokia: trang vào phòng, header (mời QR, âm thanh), máy Nokia (LCD + bàn phím),
// sảnh chờ / kết quả. Mỗi game chỉ cần vẽ LCD và xử lý phím:
//   nokiaApp({ game, title, sub, help: { vi, en } (nội dung mountHelp, xem public/help.js), lobby?(box, room, isHost, setCfg), draw(lcd, room, now), onKey?(k, down, room),
//              onState?(room, prev), onMsg?(m), badge?(player, room), onTap?(x, y, room, app) })
// Game không dùng LCD (vd Ô ăn quan): truyền mount(stage, app) + render(room, app) thay cho draw, path = đường dẫn trang.
// Server: /api/nk/<game>/room/CODE (worker/adapters/game-room.js; kết nối qua public/room-client.js). Tin game gửi qua app.send({...}) -> { t: 'g', ... }.
// Xem lại (?replay=<id>): không vào phòng, nạp tin server đã ghi (view của ghế 1) qua cùng onMsg; mình là người xem
// (app.id = 'replay', app.replay = true, app.pov = ghế 1), phím / chạm tắt; app.now() / now của draw theo giờ trong bản ghi.
import { icon, iconEl, hydrateIcons } from '../icons.js';
import { invite } from '../invite.js';
import { toast } from '../toast.js';
import { deviceName, addReroll, loadDeviceId } from '../names.js';
import { createLCD, bindKeys } from './lcd.js';
import { t, tx, langToggle } from '../i18n.js';
import { roomClient, newRoomCode } from '../room-client.js';
import { publicSwitch } from '../public-switch.js';
import { replayParam, playReplay, replayLinks } from '../replay.js';
import { el, store } from '../dom.js';
import { mountHelp } from '../help.js';

export const COLORS = ['#5cc8ff', '#ff7ab6', '#7dff9a', '#ffb454', '#c49bff', '#ffe66b'];

export function nokiaApp(opt) {
  const rp = replayParam();
  let deviceId = rp ? 'replay' : loadDeviceId();
  let code = null, room = null, clockOffset = 0;
  let quiet = false; // đang tua bản xem lại (nạp dồn dập): không kêu, không toast, vẽ một lần lúc xong

  // ---------- DOM ----------
  const name = el('input', { maxLength: 20, autocomplete: 'off', value: deviceName() });
  const codeIn = el('input', { maxLength: 4, placeholder: t('MÃ PHÒNG', 'ROOM CODE'), autocomplete: 'off', className: 'code' });
  const home = el('section', { id: 'home' }, el('div', { className: 'card' },
    el('h1', {}, el('a', { href: '/', className: 'back', title: t('Các game khác', 'More games'), innerHTML: icon('arrow-left') }),
      el('img', { className: 'logo', src: `/logos/${opt.game}.svg`, alt: '' }), opt.title),
    el('p', { className: 'sub', textContent: opt.sub }),
    el('label', {}, t('Tên của bạn', 'Your name'), name),
    el('button', { className: 'primary', textContent: t('Tạo phòng mới', 'Create room'), onclick: () => enter(newRoomCode()) }),
    el('div', { className: 'join' }, codeIn, el('button', { textContent: t('Vào phòng', 'Join'), onclick: joinCode })),
    el('div', { className: 'lang' }, el('button', { type: 'button', className: 'help-home' }, iconEl('info'), t('Cách chơi', 'How to play')), langToggle()),
  ));
  addReroll(name);
  codeIn.onkeydown = (e) => { if (e.key === 'Enter') joinCode(); };

  const roomCode = el('b');
  const conn = el('span', { className: 'dot', title: t('Kết nối', 'Connection') });
  const btnSound = el('button', { title: t('Âm thanh', 'Sound') });
  const players = el('ul', { id: 'players' });
  const canvas = el('canvas');
  const pad = el('div', { className: 'pad' });
  const ov = el('div', { id: 'overlay', hidden: true });
  const btnLeave = el('button', { title: t('Rời phòng', 'Leave room'), innerHTML: icon('arrow-left'), onclick: () => leave() });
  // Cách chơi (opt.help): nút (i) trên thanh trên trong phòng + nút ở trang vào phòng, cùng một hộp (public/help.js).
  const btnHelp = el('button', { innerHTML: icon('info') });
  const btnInvite = el('button', { title: t('Mời bạn: mã QR / link', 'Invite: QR code / link'), onclick: () => invite(`${location.origin}${opt.path ?? `/nokia/${opt.game}/`}?r=${code}`, code) },
    el('span', { className: 'lbl', textContent: t('Phòng ', 'Room ') }), roomCode, iconEl('qr-code'));
  const hint = el('div', { className: 'hint' },
    el('span', { className: 'touch', textContent: t('Vuốt ở đây hoặc bấm phím bên dưới', 'Swipe here or use the keys below') }),
    el('span', { className: 'keys', textContent: t('Phím mũi tên / WASD · Enter hoặc 5 = OK', 'Arrow keys / WASD · Enter or 5 = OK') }));
  const roomEl = el('section', { id: 'room', hidden: true },
    el('header', {}, btnLeave, btnInvite, conn, el('span', { className: 'grow' }), btnHelp, btnSound),
    players,
    el('main', { className: 'stage' },
      opt.mount ? el('div', { className: 'board-stage' })
        : el('div', { className: 'phone' }, el('div', { className: 'screen' }, canvas), hint, pad),
      ov),
  );
  document.body.append(home, roomEl);
  hydrateIcons();
  // Xem lại thì không tự mở hướng dẫn (người xem chỉ xem).
  const help = mountHelp({ game: opt.game, button: [home.querySelector('.help-home'), btnHelp], content: opt.help, auto: !rp });
  const lcd = opt.draw && createLCD(canvas);

  // ---------- âm thanh: tiếng bíp kiểu Nokia (WebAudio, không cần file) ----------
  let soundOn = store.get('nk.sound') !== '0';
  let audio;
  const beep = (freq = 880, ms = 60, type = 'square') => {
    if (!soundOn || quiet) return;
    try {
      audio ??= new AudioContext();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = 0.05;
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + ms / 1000);
    } catch {}
  };
  const renderSound = () => { btnSound.innerHTML = icon(soundOn ? 'volume-2' : 'volume-x'); };
  btnSound.onclick = () => { soundOn = !soundOn; store.set('nk.sound', soundOn ? '1' : '0'); renderSound(); };
  renderSound();

  // ---------- vào / rời phòng ----------
  function joinCode() {
    const c = codeIn.value.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(c)) enter(c); else toast.warning(t('Mã phòng gồm 4 ký tự', 'Room codes have 4 characters'));
  }
  function enter(c) {
    code = c.toUpperCase();
    store.set('pk.name', name.value.trim() || deviceName());
    history.replaceState(null, '', `?r=${code}`);
    roomCode.textContent = code;
    home.hidden = true;
    roomEl.hidden = false;
    room = null;
    render();
    net.open();
  }
  function leave(msg) {
    code = null;
    net.close();
    history.replaceState(null, '', location.pathname);
    roomEl.hidden = true;
    home.hidden = false;
    if (msg) toast.error(tx(msg));
  }
  const net = roomClient({
    path: () => `/api/nk/${opt.game}/room/${code}`, query: () => ({ id: deviceId, name: name.value.trim() || deviceName() }), onMsg, onLeave: leave, conn,
  });
  const raw = (m) => net.send(m);
  // Công tắc "Công khai" (hiện ở /phong/) trong thẻ sảnh chờ.
  const pub = publicSwitch(raw);

  // Xem lại: giờ trong bản ghi, chạy theo nhịp tin phát lại (tua nhanh thì nhanh); không có tin mới quá một khoảng giữa hai
  // tin trước (dừng / chờ nước đi, tối đa 1 giây) thì đứng lại, khỏi chạy lố.
  let rc = null;
  const now = () => (!rp ? Date.now() + clockOffset : rc ? rc.now + Math.min((performance.now() - rc.at) * rc.rate, rc.span) : 0);

  function onMsg(m) {
    if (m.t === 'error') return leave(m.msg);
    if (m.t !== 'state') return opt.onMsg?.(m, app);
    const prev = room;
    room = m;
    clockOffset = m.now - Date.now();
    if (rp) {
      const at = performance.now(), span = rc ? m.now - rc.now : 0, wall = rc ? at - rc.at : 0;
      rc = { now: m.now, at, span: Math.min(1000, Math.max(0, span)), rate: wall > 4 && span > 0 ? Math.min(50, Math.max(0.1, span / wall)) : rc?.rate ?? 1 };
    }
    if (m.status === 'playing' && prev?.status !== 'playing') beep(1320, 120);
    if (m.status === 'ended' && prev?.status === 'playing' && !quiet) {
      const me = m.result?.ranks?.find((r) => r.id === deviceId);
      if (me?.won) { toast.success(t('Bạn thắng!', 'You win!'), { icon: 'trophy' }); beep(1760, 250); }
      else if (m.result?.ranks?.length > 1) toast(t(`${m.result.ranks[0].name} thắng`, `${m.result.ranks[0].name} wins`), { icon: 'trophy' });
    }
    opt.onState?.(m, prev, app);
    if (!quiet) render();
  }

  if (opt.draw) bindKeys(pad, (k, down) => opt.onKey?.(k, down, room, app), () => !rp && !!room && roomEl.hidden === false && !help.isOpen());
  canvas.onpointerdown = (e) => { if (!rp && room && opt.onTap) { e.preventDefault(); opt.onTap(...app.lcdPoint(e), room, app); } };
  // Vuốt = bấm 1 mũi tên (nhấn + nhả). Vùng trống quanh màn luôn vuốt được; trên màn LCD thì chỉ khi game không dùng chạm
  // (Lật hình, Logic, Bantumi, Bounce chạm thẳng lên màn nên vuốt ở đó sẽ lẫn với chạm).
  if (opt.draw) {
    let from = null;
    const stage = roomEl.querySelector('.stage');
    stage.addEventListener('pointerdown', (e) => {
      from = rp || !room || e.target.closest('.pad, #overlay') || (opt.onTap && e.target === canvas) ? null : [e.clientX, e.clientY];
    });
    stage.addEventListener('pointercancel', () => { from = null; });
    stage.addEventListener('pointerup', (e) => {
      if (!from) return;
      const dx = e.clientX - from[0], dy = e.clientY - from[1];
      from = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      const k = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      opt.onKey?.(k, true, room, app);
      setTimeout(() => opt.onKey?.(k, false, room, app), 60);
    });
  }

  // ---------- vẽ ----------
  const colorOf = (id) => COLORS[Math.max(0, room?.seats.indexOf(id) ?? 0) % COLORS.length];
  function render() {
    const r = room;
    if (r) opt.render?.(r, app);
    players.replaceChildren(...(r?.players ?? []).map((p) => {
      const li = el('li', { className: p.id === deviceId ? 'me' : '' });
      li.style.setProperty('--c', r.seats.includes(p.id) ? colorOf(p.id) : 'transparent');
      li.append(p.id === r.host ? iconEl('crown') : '', ` ${p.name}${p.id === deviceId ? t(' (bạn)', ' (you)') : ''}`);
      const b = opt.badge?.(p, r);
      if (b != null && b !== '') li.append(' · ', el('b', { textContent: b }));
      if (r.status === 'playing' && !r.seats.includes(p.id)) li.append(' ', iconEl('eye'));
      return li;
    }));
    const isHost = r?.host === deviceId;
    pub.update(r, isHost);
    if (!r || r.status === 'playing') {
      ov.hidden = !!r;
      if (!r) ov.replaceChildren(el('div', { className: 'card' }, el('h2', { textContent: rp ? t('Đang tải bản xem lại…', 'Loading replay…') : t('Đang kết nối…', 'Connecting…') })));
      return;
    }
    ov.hidden = false;
    const res = r.status === 'ended' && r.result;
    const head = [
      el('h2', {}, ...(res ? [iconEl('trophy'), ` ${tx(res.title) ?? (res.ranks.length > 1 ? t(`${res.ranks[0].name} thắng`, `${res.ranks[0].name} wins`) : t('Hết ván', 'Game over'))}`] : [t(`Phòng ${code}`, `Room ${code}`)])),
      res ? el('ol', { className: 'ranks' }, ...res.ranks.map((x) => el('li', {}, el('span', { textContent: x.name }), el('b', { textContent: opt.scoreText?.(x.score, res) ?? x.score })))) : '',
    ];
    // Xem lại: chỉ bảng kết quả (thanh phát lại đã có Chia sẻ / Chơi).
    if (rp) return ov.replaceChildren(el('div', { className: 'card' }, ...head));
    const box = el('div', { className: 'cfg' });
    opt.lobby?.(box, r, isHost, (cfg) => raw({ t: 'config', cfg }));
    ov.replaceChildren(el('div', { className: 'card' }, ...head,
      res?.rp ? replayLinks(res.rp) : '',
      box,
      pub.el,
      el('p', { className: 'sub', textContent: `${t(`${r.players.length} người trong phòng.`, `${r.players.length} in the room.`)} ${opt.lobbyText?.(r) ?? ''}${isHost ? '' : t(' Chờ chủ phòng bắt đầu.', ' Waiting for the host to start.')}` }),
      isHost ? el('button', { className: 'primary', textContent: res ? t('Chơi lại', 'Play again') : t('Bắt đầu', 'Start'), onclick: () => raw({ t: 'start' }) }) : '',
    ));
  }

  function frame() {
    if (room && !roomEl.hidden) {
      lcd.clear();
      opt.draw(lcd, room, now(), app);
    }
    requestAnimationFrame(frame);
  }
  if (opt.draw) requestAnimationFrame(frame);

  const app = {
    get id() { return deviceId; }, get room() { return room; }, replay: !!rp, lcd, canvas, beep, toast, colorOf,
    // Người mà view đang thể hiện: mình; xem lại thì ghế 1 (server ghi view của người đó).
    get pov() { return rp ? room?.seats[0] ?? deviceId : deviceId; },
    // Toạ độ LCD (0..83, 0..47) của một lần chạm/bấm chuột lên màn hình.
    lcdPoint(e) { const r = canvas.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * 84), Math.floor(((e.clientY - r.top) / r.height) * 48)]; },
    send: (m) => raw({ t: 'g', ...m }), now,
  };
  window.nk = app; // cho test tự động
  if (opt.mount) opt.mount(roomEl.querySelector('.board-stage'), app);
  const initial = new URLSearchParams(location.search).get('r');
  if (rp) {
    // Chỉ để xem: không mời / không kết nối, ẩn phím trên màn; nút quay lại về trang chủ game.
    home.hidden = true;
    roomEl.hidden = false;
    btnInvite.hidden = conn.hidden = hint.hidden = pad.hidden = true;
    btnLeave.title = t('Chơi game này', 'Play this game');
    btnLeave.onclick = () => { location.href = location.pathname; };
    render();
    playReplay(rp, {
      feed: onMsg,
      // Tua = dọn rồi nạp lại từ đầu (đồng bộ, cùng lượt JS): im lặng tới hết lượt đó rồi mới vẽ một lần.
      reset: () => { quiet = true; setTimeout(() => { quiet = false; render(); }); room = null; rc = null; },
    }).then((rec) => { if (!rec?.frames?.length) ov.replaceChildren(el('div', { className: 'card' }, el('h2', { textContent: t('Không tìm thấy bản xem lại', 'Replay not found') }))); });
  } else if (initial && /^[A-Za-z0-9]{4}$/.test(initial)) enter(initial);
  return app;
}

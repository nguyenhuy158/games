// Phạt kinh láo ở client: thẻ phạt cả phòng cùng thấy (phạt trong game + vòng quay phạt vui ~2 giây, kèm tiếng "oái oăm"),
// lựa chọn kiểu phạt ở sảnh chờ, và bảng sửa danh sách phạt vui của chủ phòng (lưu trên máy chủ phòng, tự đưa vào cấu hình
// phòng mỗi khi người đó làm chủ phòng). Server (worker/games/loto.js) bốc phạt và thi hành phạt trong game.
import { PENALTY_MODES, LOCK_MS, AFTER_CALLS, PARTY, PARTY_MAX, PARTY_LEN, validParty } from './logic.js';
import { t, tx } from '../i18n.js';
import { iconEl } from '../icons.js';
import { el, store } from '../dom.js';

const KEY = 'loto.party';
const SPIN_MS = 2000; // vòng quay phạt vui
const SHOW_MS = 4500; // thẻ phạt tự đóng sau chừng này (tính từ lúc dừng quay)
const WAH = [392, 370, 349, 311]; // tiếng kèn "oái oăm" đi xuống
const MODE_NAMES = { off: ['Tắt', 'Off'], game: ['Trong game', 'In game'], party: ['Phạt vui', 'Party'], both: ['Cả hai', 'Both'] };
// Phạt trong game: icon + chữ (m = tin 'lao' của server; chip = số bị mất hạt).
const GAME = {
  lock: ['timer', () => t(`Khoá nút KINH ${LOCK_MS / 1000} giây`, `KINH button locked for ${LOCK_MS / 1000}s`)],
  chip: ['eraser', (m) => t(`Mất 1 hạt: số ${m.chip}`, `Loses a chip: ${m.chip}`)],
  freeze: ['pause', () => t('Đóng băng Tự dò 1 phút', 'Auto mark frozen for 1 minute')],
  liar: ['flag', () => t('Mang nhãn "Kinh láo" tới hết ván', 'Labelled "False KINH" until the game ends')],
  after: ['hourglass', () => t(`Chờ thêm ${AFTER_CALLS} số mới được KINH`, `Must wait ${AFTER_CALLS} more numbers to KINH`)],
};

const saved = () => {
  try {
    const list = JSON.parse(store.get(KEY) || 'null');
    return validParty(list) ? list : null;
  } catch {
    return null;
  }
};

export function penaltyCard(stage, beep) {
  const title = el('h3'), game = el('p', { className: 'g' }), reel = el('b');
  const party = el('div', { className: 'reel' }, el('small', { textContent: t('Phạt vui', 'Party penalty') }), reel);
  const card = el('div', { className: 'pen-card', onclick: () => hide() }, title, game, party, el('small', { className: 'tap', textContent: t('Chạm để đóng', 'Tap to close') }));
  const root = el('div', { className: 'pen', hidden: true }, card);
  stage.append(root);
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  function hide() {
    for (const id of timers) clearTimeout(id);
    timers = [];
    root.hidden = true;
  }
  // m = { id, game?, chip?, party? } từ server; list = danh sách phạt vui của phòng (để quay).
  function show(m, name, list) {
    hide();
    root.hidden = false;
    title.replaceChildren(iconEl('triangle-alert'), ` ${t(`${name} KINH LÁO!`, `${name}: FALSE KINH!`)}`);
    game.hidden = !GAME[m.game];
    if (GAME[m.game]) game.replaceChildren(iconEl(GAME[m.game][0]), ` ${GAME[m.game][1](m)}`);
    party.hidden = !m.party;
    party.classList.remove('landed');
    WAH.forEach((f, i) => { later(() => beep(f, i === WAH.length - 1 ? 450 : 200, 'sawtooth'), i * 220); });
    if (!m.party) return later(hide, SHOW_MS);
    // Quay: chữ chạy nhanh rồi chậm dần trong SPIN_MS, dừng đúng câu server đã bốc.
    const items = list.map(tx);
    let at = 0, delay = 45, k = Math.floor(Math.random() * items.length);
    const step = () => {
      if (at >= SPIN_MS) {
        reel.textContent = tx(m.party);
        party.classList.add('landed');
        beep(1568, 160, 'triangle');
        return later(hide, SHOW_MS);
      }
      reel.textContent = items[k++ % items.length];
      beep(1300, 12, 'square');
      at += delay;
      delay *= 1.16;
      later(step, delay);
    };
    step();
  }
  return { show };
}

// Sảnh chờ: kiểu phạt (chủ phòng chọn) + nút sửa danh sách phạt vui.
let synced = null;
export function penaltyLobby(box, r, isHost, setCfg) {
  // Chủ phòng đã có danh sách riêng trên máy: đưa vào cấu hình phòng (một lần cho mỗi phòng / mỗi danh sách).
  const mine = saved(), want = JSON.stringify(mine) + location.search;
  if (isHost && mine && JSON.stringify(mine) !== JSON.stringify(r.cfg.party) && synced !== want) {
    synced = want;
    setCfg({ party: mine });
  }
  const mode = r.cfg.penalty ?? 'off';
  box.append(el('div', { className: 'seg' }, t('Phạt kinh láo ', 'False KINH penalty '), ...PENALTY_MODES.map((m) => el('button', {
    textContent: tx(MODE_NAMES[m]), className: mode === m ? 'on' : '', disabled: !isHost, onclick: () => setCfg({ penalty: m }),
  }))));
  if (isHost && (mode === 'party' || mode === 'both')) {
    box.append(el('button', { className: 'party-edit', onclick: () => editParty(r, setCfg) }, iconEl('pencil'), t(' Sửa danh sách phạt vui', ' Edit party penalties')));
  }
}

// Bảng sửa danh sách phạt vui (hộp thoại ngoài sảnh chờ để không bị vẽ lại mỗi lần phòng đổi trạng thái).
function editParty(r, setCfg) {
  const items = saved() ?? (r.cfg.party ?? PARTY).map(tx);
  const list = el('ul', { className: 'plist' });
  const input = el('input', { maxLength: PARTY_LEN, placeholder: t('Thêm hình phạt…', 'Add a penalty…') });
  const dlg = el('dialog', { className: 'card party-dlg' });
  const draw = () => list.replaceChildren(...items.map((s, i) => el('li', {}, el('span', { textContent: s }),
    el('button', { className: 'rm', title: t('Bỏ', 'Remove'), disabled: items.length < 2, onclick: () => { items.splice(i, 1); draw(); } }, iconEl('x')))));
  const add = () => {
    const s = input.value.trim();
    if (!s || items.length >= PARTY_MAX) return;
    items.push(s);
    input.value = '';
    draw();
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') add(); };
  const save = (next) => {
    store.set(KEY, next ? JSON.stringify(next) : '');
    setCfg({ party: next });
    dlg.close();
  };
  dlg.append(el('h2', { textContent: t('Phạt vui khi kinh láo', 'Party penalties') }), list,
    el('div', { className: 'join' }, input, el('button', { onclick: add }, t('Thêm', 'Add'))),
    el('div', { className: 'seg' },
      el('button', { onclick: () => save(null) }, t('Mặc định', 'Defaults')),
      el('button', { onclick: () => dlg.close() }, t('Đóng', 'Close')),
      el('button', { className: 'primary', onclick: () => save([...items]) }, t('Lưu', 'Save'))));
  dlg.onclose = () => dlg.remove();
  document.body.append(dlg);
  draw();
  dlg.showModal();
}

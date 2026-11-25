// Công tắc "Công khai" cho sảnh chờ mọi game: bật thì phòng hiện ở /phong/ (danh sách phòng của mọi game).
// Chỉ chủ phòng bấm được; chỉ hiện khi server đã hỗ trợ (state có trường `pub`). Gửi { t: 'public', on }.
//   const pub = publicSwitch(send);  card.append(pub.el);  ...  pub.update(room, isHost);
import { t } from './i18n.js';

let styled = false;
export function publicSwitch(send) {
  if (!styled) {
    styled = true;
    document.head.append(Object.assign(document.createElement('style'), { textContent: `
      label.pub-switch { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; cursor: pointer; color: var(--text, inherit); }
      /* Công tắc trượt (giống input.switch của Cờ caro) làm từ checkbox gốc: vẫn dùng bàn phím / trình đọc màn hình. */
      .pub-switch input { --off: #d6d3d1; appearance: none; -webkit-appearance: none; flex: none; width: 44px; height: 24px; margin: 0; padding: 0; border: 0; border-radius: 999px; cursor: inherit;
        background: radial-gradient(circle, #fff 9px, #0000 10px) left 2px center / 20px 20px no-repeat, var(--off);
        box-shadow: inset 0 1px 2px #0002; transition: background-position .2s, background-color .2s; }
      .pub-switch input:checked { --off: var(--accent, #ffd23f); background-position: right 2px center, 0 0; }
      .pub-switch input:focus-visible { outline: 2px solid var(--accent, #ffd23f); outline-offset: 2px; }
      .pub-switch small { opacity: .7; }
      .pub-switch:has(input:disabled) { cursor: default; opacity: .75; }
      header .pub-switch small { display: none; }` }));
  }
  const box = Object.assign(document.createElement('input'), { type: 'checkbox', role: 'switch' });
  const note = document.createElement('small');
  const label = document.createElement('label');
  label.className = 'pub-switch';
  label.hidden = true;
  label.append(box, t('Công khai', 'Public'), note);
  box.onchange = () => send({ t: 'public', on: box.checked });
  return {
    el: label,
    update(room, isHost) {
      label.hidden = !room || !('pub' in room);
      if (label.hidden) return;
      box.checked = !!room.pub;
      box.disabled = !isHost;
      note.textContent = room.pub ? t('— hiện ở trang Phòng đang mở', '— listed on Open rooms') : '';
    },
  };
}

// Công tắc "Công khai" cho sảnh chờ mọi game: bật thì phòng hiện ở /phong/ (danh sách phòng của mọi game).
// Chỉ chủ phòng bấm được; chỉ hiện khi server đã hỗ trợ (state có trường `pub`). Gửi { t: 'public', on }.
//   const pub = publicSwitch(send);  card.append(pub.el);  ...  pub.update(room, isHost);
import { t } from './i18n.js';

let styled = false;
export function publicSwitch(send) {
  if (!styled) {
    styled = true;
    document.head.append(Object.assign(document.createElement('style'), { textContent: `
      .pub-switch { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .pub-switch input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent, #ffd23f); cursor: inherit; }
      .pub-switch small { opacity: .7; }
      .pub-switch:has(input:disabled) { cursor: default; opacity: .75; }
      header .pub-switch small { display: none; }` }));
  }
  const box = Object.assign(document.createElement('input'), { type: 'checkbox' });
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

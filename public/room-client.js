// Kết nối WebSocket tới phòng chơi, dùng chung mọi game nhiều người (server: worker/adapters/game-room.js).
//   const net = roomClient({ path: () => `/api/ms/room/${code}`, query: () => ({ id, name }), onMsg, onLeave, conn: $('#conn') });
//   net.open() khi vào phòng · net.close() khi rời · net.send({ t: ... }) (chưa kết nối thì bỏ qua).
// Rớt mạng thì tự nối lại (1 giây, mất mạng hẳn 3 giây). Server đóng 4000 = thiết bị này vừa mở phòng ở tab khác -> onLeave(chữ báo);
// 4001 = bị từ chối (tin 'error' tới trước, game tự xử) -> không nối lại.
import { t } from './i18n.js';

export function roomClient({ path, query, onMsg, onLeave, conn }) {
  let ws = null;
  let want = false;
  const open = () => {
    const sock = (ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path()}?${new URLSearchParams(query())}`));
    sock.onopen = () => conn?.classList.add('on');
    sock.onmessage = (e) => onMsg(JSON.parse(e.data));
    sock.onclose = (e) => {
      if (ws !== sock) return;
      conn?.classList.remove('on');
      if (e.code === 4000) { want = false; return onLeave(t('Bạn đã mở phòng này ở tab/thiết bị khác', 'You opened this room in another tab/device')); }
      if (want && e.code !== 4001) setTimeout(() => ws === sock && want && open(), navigator.onLine ? 1000 : 3000);
    };
  };
  return {
    open() { want = true; open(); },
    close() { want = false; ws?.close(); },
    send(m) { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); },
  };
}

// Mã phòng mới: 4 ký tự, bỏ chữ/số dễ nhầm (I, O, 0, 1).
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

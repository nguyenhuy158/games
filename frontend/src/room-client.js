// Kết nối WebSocket tới phòng chơi, dùng chung mọi game nhiều người (server: worker/adapters/game-room.js).
//   const net = roomClient({ path: () => `/api/ms/room/${code}`, query: () => ({ id, name }), onMsg, onLeave, conn: $('#conn') });
//   net.open() khi vào phòng · net.close() khi rời · net.send({ t: ... }) (chưa kết nối thì bỏ qua).
// Rớt mạng thì tự nối lại (1 giây, mất mạng hẳn 3 giây). Server đóng 4000 = thiết bị này vừa mở phòng ở tab khác -> onLeave(chữ báo);
// 4001 = bị từ chối (tin 'error' tới trước, game tự xử) -> không nối lại.
// Nhịp tim: TCP có thể đứt im lặng (onclose không bao giờ tới), nên cứ PING_MS gửi chuỗi 'ping' (server tự trả 'pong', không
// đánh thức DO); PONG_MS sau lần ping mà chưa nhận được tin nào thì coi như đứt: đóng và nối lại. Mất kết nối thì hiện băng báo.
import { t } from './i18n.js';

export const PING = 'ping';
export const PONG = 'pong';
const PING_MS = 20_000;
const PONG_MS = 10_000; // tính từ lúc ping: tối đa PING_MS + PONG_MS = 30 giây không nghe gì từ server
const RETRY_MS = 1000;
const RETRY_OFFLINE_MS = 3000;

// Băng "Mất kết nối" dùng chung: một phần tử cố định trên đầu trang, tạo khi cần lần đầu.
let banner = null;
let bannerText = null;
function showBanner(on) {
  if (!on) { if (banner) banner.style.display = 'none'; return; }
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'netLost';
    banner.setAttribute('role', 'status');
    Object.assign(banner.style, {
      position: 'fixed', top: 'calc(env(safe-area-inset-top) + 8px)', left: '50%', transform: 'translateX(-50%)', zIndex: '9999',
      alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '999px', background: '#fff1f2',
      color: '#be123c', border: '2px solid #fecdd3', boxShadow: '0 6px 18px rgba(190, 18, 60, .22)', fontFamily: 'inherit',
      fontSize: '14px', fontWeight: '700', lineHeight: '1.3', whiteSpace: 'nowrap', pointerEvents: 'none',
    });
    const dot = document.createElement('span');
    Object.assign(dot.style, { width: '10px', height: '10px', borderRadius: '50%', background: '#f43f5e', flex: 'none' });
    dot.animate?.([{ opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }], { duration: 1200, iterations: Infinity });
    bannerText = document.createElement('span');
    banner.append(dot, bannerText);
    document.body.append(banner);
  }
  banner.style.display = 'flex'; // style inline thắng thuộc tính hidden, nên bật/tắt bằng display
  bannerText.textContent = t('Mất kết nối, đang kết nối lại…', 'Connection lost, reconnecting…');
}

export function roomClient({ path, query, onMsg, onLeave, conn }) {
  let ws = null;
  let want = false;
  let lost = false; // đã từng vào phòng rồi rớt: hiện băng tới khi nối lại được
  let ping = 0;
  let pong = 0;
  const stopBeat = () => { clearInterval(ping); clearTimeout(pong); ping = pong = 0; };
  const retry = (sock) => setTimeout(() => ws === sock && want && open(), navigator.onLine ? RETRY_MS : RETRY_OFFLINE_MS);
  // Socket chết (đóng hoặc im quá lâu): bỏ hẳn socket cũ, báo mất kết nối, hẹn nối lại.
  const drop = (sock) => {
    stopBeat();
    conn?.classList.remove('on');
    lost = true;
    showBanner(true);
    retry(sock);
  };
  const open = () => {
    const sock = (ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path()}?${new URLSearchParams(query())}`));
    sock.onopen = () => {
      if (ws !== sock) return;
      conn?.classList.add('on');
      if (lost) { lost = false; showBanner(false); }
      ping = setInterval(() => {
        if (sock.readyState !== 1) return;
        sock.send(PING);
        clearTimeout(pong);
        pong = setTimeout(() => {
          if (ws !== sock) return;
          sock.onclose = null;
          sock.close();
          drop(sock);
        }, PONG_MS);
      }, PING_MS);
    };
    sock.onmessage = (e) => {
      if (ws !== sock) return;
      clearTimeout(pong); // tin nào tới cũng chứng tỏ đường còn sống
      if (e.data !== PONG) onMsg(JSON.parse(e.data));
    };
    sock.onclose = (e) => {
      if (ws !== sock) return;
      stopBeat();
      conn?.classList.remove('on');
      if (e.code === 4000) { want = false; showBanner(false); return onLeave(t('Bạn đã mở phòng này ở tab/thiết bị khác', 'You opened this room in another tab/device')); }
      if (!want || e.code === 4001) return showBanner(false);
      drop(sock);
    };
  };
  return {
    open() { want = true; open(); },
    close() { want = false; lost = false; stopBeat(); showBanner(false); ws?.close(); },
    send(m) { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); },
  };
}

// Mã phòng mới: 4 ký tự, bỏ chữ/số dễ nhầm (I, O, 0, 1).
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

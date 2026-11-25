// Rời trang (bấm Quay lại, bấm link) thì trình duyệt có thể cất trang vào back/forward cache mà KHÔNG đóng
// WebSocket -> phòng tưởng người đó vẫn ở đây ("người ma": bị ghép cặp rồi thua vì hết giờ).
// Nên: trang bị cất vào cache thì đóng mọi socket; quay lại trang thì tải lại (trình duyệt không giao sự kiện close
// cho trang đang nằm trong cache nên game không tự nối lại được; URL còn ?r=CODE nên tải lại là vào đúng phòng).
const socks = new Set();
let closed = false;
const Native = window.WebSocket;
window.WebSocket = class extends Native {
  constructor(...args) {
    super(...args);
    socks.add(this);
    this.addEventListener('close', () => socks.delete(this));
  }
};
addEventListener('pagehide', (e) => {
  if (!e.persisted || !socks.size) return;
  closed = true;
  for (const s of socks) s.close();
});
addEventListener('pageshow', (e) => { if (e.persisted && closed) location.reload(); });

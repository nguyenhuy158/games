// Nhịp tim của public/room-client.js: ping định kỳ, im quá lâu thì đóng + nối lại + hiện băng "Mất kết nối".
// Chạy với WebSocket / document giả và đồng hồ giả của node:test.
import assert from 'node:assert/strict';
import { mock } from 'node:test';

const saved = Object.fromEntries(['location', 'WebSocket', 'document', 'navigator'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const define = (k, value) => Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });

const socks = [];
class FakeSocket {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.closed = false; socks.push(this); }
  send(x) { this.sent.push(x); }
  close() { this.closed = true; this.readyState = 3; }
  // phía "server"
  up() { this.readyState = 1; this.onopen?.(); }
  recv(data) { this.onmessage?.({ data }); }
  down(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}
const body = { kids: [], append(x) { this.kids.push(x); } };
define('location', { protocol: 'https:', host: 'games.test', search: '' });
define('WebSocket', FakeSocket);
define('navigator', { onLine: true });
define('document', {
  body, documentElement: {}, querySelectorAll: () => [],
  createElement: () => ({ style: {}, textContent: '', setAttribute() {}, animate() {}, append(...k) { this.kids = k; } }),
});

mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
try {
  const { roomClient, PING, PONG } = await import('./public/room-client.js');
  const got = [];
  const conn = { on: false, classList: { add() { conn.on = true; }, remove() { conn.on = false; } } };
  const net = roomClient({ path: () => '/api/c4/room/ABCD', query: () => ({ id: 'device-1' }), onMsg: (m) => got.push(m), onLeave: () => {}, conn });
  const banner = () => body.kids[0];

  net.open();
  const a = socks.at(-1);
  a.up();
  assert.ok(conn.on);
  assert.equal(banner(), undefined, 'no banner on first connect');

  // Ping mỗi 20s; pong không lọt tới game, tin thường vẫn tới.
  mock.timers.tick(19_999);
  assert.deepEqual(a.sent, []);
  mock.timers.tick(1);
  assert.deepEqual(a.sent, [PING]);
  a.recv(PONG);
  a.recv(JSON.stringify({ t: 'state' }));
  assert.deepEqual(got, [{ t: 'state' }]);
  mock.timers.tick(15_000);
  assert.ok(!a.closed, 'answered ping keeps the socket');

  // Ping lần 2 không ai trả: 10s sau đóng, hiện băng, nối lại.
  mock.timers.tick(5_000);
  assert.equal(a.sent.length, 2);
  mock.timers.tick(9_999);
  assert.ok(!a.closed);
  mock.timers.tick(1);
  assert.ok(a.closed, 'silent socket is closed');
  assert.ok(!conn.on);
  assert.equal(banner().style.display, 'flex', 'banner shown');
  assert.match(banner().kids[1].textContent, /Mất kết nối/);
  mock.timers.tick(1000);
  const b = socks.at(-1);
  assert.notEqual(b, a, 'reconnects');
  a.recv(JSON.stringify({ t: 'stale' }));
  assert.equal(got.length, 1, 'old socket is ignored');
  b.up();
  assert.equal(banner().style.display, 'none', 'banner hidden after reconnect');

  // Đứt thường (onclose) cũng hiện băng rồi nối lại; 4001 = bị từ chối thì thôi.
  b.down();
  assert.equal(banner().style.display, 'flex');
  mock.timers.tick(1000);
  const c = socks.at(-1);
  assert.notEqual(c, b);
  c.down(4001);
  assert.equal(banner().style.display, 'none');
  mock.timers.tick(5000);
  assert.equal(socks.at(-1), c, 'rejected: no reconnect');

  // Rời phòng: không ping, không nối lại.
  net.open();
  const d = socks.at(-1);
  d.up();
  net.close();
  d.down(1000);
  mock.timers.tick(60_000);
  assert.deepEqual(d.sent, []);
  assert.equal(socks.at(-1), d);
} finally {
  mock.timers.reset();
  for (const [k, desc] of Object.entries(saved)) {
    if (desc) Object.defineProperty(globalThis, k, desc);
    else delete globalThis[k];
  }
}

console.log('room-client ok');

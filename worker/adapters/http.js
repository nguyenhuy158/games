import { userFrom } from '../sso.js';
import { REPLAY_ID, REPLAY_MAX, replayId } from './top.js';
import { SIZES } from '../../public/pikachu/logic.js';
import { MODES } from '../games/pikachu.js';

// Adapter HTTP: domain cũ -> mới, file tĩnh, /api/* (tài khoản, lịch sử, bảng xếp hạng, phòng công khai) và nối WebSocket vào DO phòng.
const HOME = 'games.huyab.click';
const OLD_HOSTS = ['pikachu.huyab.click'];
// Phòng chạy trên adapter phòng chung: tiền tố URL -> key game (header X-Game). Nokia / Ô ăn quan lấy key từ URL.
const ADAPTER_GAME = { '': 'pikachu', 'cc/': 'caro', 'c4/': 'c4', 'bt/': 'ban-tau', 'bc/': 'bau-cua', 'ms/': 'do-min', 'dv/': 'dao-vang' };

// Chuyển WebSocket vào DO. Phòng tin header X-User / X-Game / X-Room vì chỉ Worker gọi được DO; header client tự gửi luôn bị xoá trước.
async function forward(req, ns, name, game, code) {
  const headers = new Headers(req.headers);
  for (const h of ['X-User', 'X-Game', 'X-Room']) headers.delete(h);
  if (game) { headers.set('X-Game', game); headers.set('X-Room', code); }
  const user = await userFrom(req);
  if (user) headers.set('X-User', JSON.stringify({ sub: user.sub, name: user.name }));
  return ns.get(ns.idFromName(name)).fetch(new Request(req, { headers }));
}

export const http = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const api = url.pathname.startsWith('/api/');
    // Domain cũ: đổi sang domain mới, giữ nguyên đường dẫn + query (hub tự đưa ?r= cũ về /pikachu/).
    // /api/* vẫn phục vụ để tab đang mở không rớt WebSocket.
    if (OLD_HOSTS.includes(url.hostname) && !api) {
      url.hostname = HOME;
      return Response.redirect(url.toString(), 301);
    }
    // Link chia sẻ gọn /replay/<id> -> trang game ?replay=<id> (trang game tự phát lại, xem public/replay.js).
    const short = url.pathname.match(/^\/replay\/([A-Za-z0-9]{12})\/?$/);
    if (short) {
      const page = await env.TOP.get(env.TOP.idFromName('global')).replayPage(short[1]);
      if (!page) return new Response('Không tìm thấy bản xem lại (có thể đã hết hạn) · Replay not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return Response.redirect(`${url.origin}${page}?replay=${short[1]}`, 302);
    }
    if (!api) return env.ASSETS.fetch(req);
    const top = () => env.TOP.get(env.TOP.idFromName('global'));
    if (url.pathname === '/api/me') {
      const user = await userFrom(req);
      const body = user ? { user, stats: await top().stats(user.sub) } : { user: null };
      return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
    }
    // Xem lại ván: GET công khai (ai có link đều xem). POST = game chạy ở client (chơi 1 người) tự gửi bản ghi, cần đăng nhập.
    const rp = url.pathname.match(/^\/api\/replay\/([^/]+)$/);
    if (rp && req.method === 'GET') {
      const r = REPLAY_ID.test(rp[1]) ? await top().replay(rp[1]) : null;
      return r ? Response.json(r, { headers: { 'Cache-Control': 'public, max-age=86400' } }) : Response.json({ error: 'not found' }, { status: 404 });
    }
    if (url.pathname === '/api/replay' && req.method === 'POST') {
      if (!(await userFrom(req))) return Response.json({ error: 'login' }, { status: 401 });
      if (!req.headers.get('Content-Type')?.startsWith('application/json')) return new Response('Unsupported', { status: 415 });
      const text = await req.text();
      if (text.length > REPLAY_MAX) return new Response('Too large', { status: 413 });
      let b;
      try { b = JSON.parse(text); } catch { return new Response('Bad request', { status: 400 }); }
      if (typeof b?.game !== 'string' || typeof b.page !== 'string' || !b.page.startsWith('/') || !Array.isArray(b.frames)) return new Response('Bad request', { status: 400 });
      const id = replayId();
      await top().saveReplay({ id, game: b.game.slice(0, 32), page: b.page.slice(0, 64), frames: b.frames });
      return Response.json({ id });
    }
    if (url.pathname === '/api/me/history') {
      const user = await userFrom(req);
      if (!user) return Response.json({ error: 'login' }, { status: 401 });
      if (req.method === 'POST') {
        // Bắt buộc JSON: trang lạ muốn gửi kiểu này phải qua CORS preflight (Worker không cho) -> chặn CSRF.
        if (!req.headers.get('Content-Type')?.startsWith('application/json')) return new Response('Unsupported', { status: 415 });
        // Chỉ Đào Vàng chơi 1 người (chạy hết ở client) mới tự gửi kết quả lên; ván nhiều người
        // do server ghi. Kết quả tự báo nên chỉ là lịch sử cá nhân, không vào bảng xếp hạng.
        let b;
        try { b = await req.json(); } catch { return new Response('Bad request', { status: 400 }); }
        const score = Number(b?.score), level = Number(b?.level);
        if (b?.game !== 'dao-vang' || !Number.isInteger(score) || score < 0 || score > 1e7 || !Number.isInteger(level) || level < 1 || level > 999) {
          return new Response('Bad request', { status: 400 });
        }
        const detail = typeof b.rp === 'string' && REPLAY_ID.test(b.rp) ? JSON.stringify({ rp: b.rp }) : '';
        await top().addPlays([{ sub: user.sub, name: user.name, game: 'dao-vang', mode: 'solo', score, level, won: false, detail }]);
        return Response.json({ ok: true });
      }
      const before = Number(url.searchParams.get('before'));
      return Response.json(await top().history(user.sub, before > 0 ? before : undefined), { headers: { 'Cache-Control': 'no-store' } });
    }
    // Bản đang chạy: CI (.github/workflows/ci.yml) chờ timestamp mới hơn commit rồi chạy scripts/smoke.mjs vào web thật.
    if (url.pathname === '/api/version') return Response.json({ id: env.CF_VERSION?.id ?? null, at: env.CF_VERSION?.timestamp ?? null }, { headers: { 'Cache-Control': 'no-store' } });
    if (url.pathname === '/api/fun') {
      const period = url.searchParams.get('period') === 'week' ? 'week' : 'all';
      return Response.json(await top().fun(period), { headers: { 'Cache-Control': 'public, max-age=60' } });
    }
    // Phòng đang mở mà chủ phòng bật "Công khai" (trang /phong/).
    if (url.pathname === '/api/rooms') {
      return Response.json({ rooms: await top().rooms(), now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/top') {
      const mode = url.searchParams.get('mode');
      const size = Number(url.searchParams.get('size'));
      if (!MODES.includes(mode) || !SIZES[size]) return new Response('Bad request', { status: 400 });
      const rows = await top().list(mode, size);
      return Response.json(rows, { headers: { 'Cache-Control': 'public, max-age=30' } });
    }
    // /api/nk/<game>/room/CODE = các game Nokia: một class NokiaRoom, mỗi phòng là DO tên "<game>:<CODE>" (adapter worker/adapters/game-room.js).
    const nk = url.pathname.match(/^\/api\/nk\/([a-z-]+)\/room\/([A-Z0-9]{4})$/);
    if (nk && req.headers.get('Upgrade') === 'websocket') return forward(req, env.NOKIA, `${nk[1]}:${nk[2]}`, nk[1], nk[2]);
    // /api/room/CODE = Pikachu, /api/dv/room/CODE = Đào Vàng, /api/ms/room/CODE = Dò mìn, /api/bc/room/CODE = Bầu cua,
    // /api/cc/room/CODE = Cờ caro, /api/c4/room/CODE = Nối 4 (chung class phòng với caro), /api/bt/room/CODE = Bắn tàu.
    const m = url.pathname.match(/^\/api\/(dv\/|ms\/|bc\/|cc\/|c4\/|bt\/)?room\/([A-Z0-9]{4})$/);
    if (!m || req.headers.get('Upgrade') !== 'websocket') return new Response('Not found', { status: 404 });
    const ns = { 'dv/': env.MINER, 'ms/': env.MINES, 'bc/': env.DICE, 'cc/': env.CARO, 'c4/': env.CARO, 'bt/': env.SHIPS }[m[1]] ?? env.ROOM;
    return forward(req, ns, m[1] === 'c4/' ? `c4:${m[2]}` : m[2], ADAPTER_GAME[m[1] ?? ''], m[2]);
  },
};

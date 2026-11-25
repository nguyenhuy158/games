import { userFrom } from './sso.js';
import { REPLAY_ID, REPLAY_MAX, replayId, BOARDS } from './top.js';
import { SIZES } from '../../../shared/games/pikachu/logic.js';
import { MODES } from '../application/games/pikachu.js';
import { GUEST_HEADER, USER_HEADER, GAME_HEADER, ROOM_HEADER, PRIVATE_CACHE, guestSession, resultOwner, withGuestCookie } from './guest.js';
import { AI_PATH, AI_ERROR, AI_STATUS, AI_LIMIT, aiFailure } from '../application/spy-ai.js';
import { routeAi } from './spy-ai-http.js';

const METHOD = { GET: 'GET', POST: 'POST' };
const STATUS = { BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, METHOD_NOT_ALLOWED: 405, CONFLICT: 409, TOO_LARGE: 413, UNSUPPORTED: 415 };
const HEADER = { CONTENT_TYPE: 'Content-Type', CACHE: 'Cache-Control', ORIGIN: 'Origin', FETCH_SITE: 'Sec-Fetch-Site', UPGRADE: 'Upgrade' };
const JSON_TYPE = 'application/json';
const MEDIA_TYPE_SEPARATOR = ';';
const HTML_TYPE = 'text/html';
const WEBSOCKET = 'websocket';
const SAME_ORIGIN = 'same-origin';
const ME_PATH = '/api/me';
const HISTORY_PATH = '/api/me/history';
const CLAIM_PATH = '/api/me/history/claim';
const HISTORY_BODY_LIMIT = 2_048;
const SOLO_MODE = 'solo';
const RESULT_EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESULT_FIELDS = new Set(['game', 'score', 'level', 'won', 'eventId', 'resultOwner', 'rp']);
const SOLO_LIMITS = {
  'dao-vang': { score: 10_000_000, level: 999, won: false },
  2048: { score: BOARDS[2048], level: 1 },
  tetris: { score: 10_000_000, level: 3, won: false },
  sudoku: { score: 604_800, level: 3, won: true },
};
const privateJson = (value, status) => Response.json(value, { status, headers: { [HEADER.CACHE]: PRIVATE_CACHE } });
const badRequest = () => privateJson({ error: 'invalid_result' }, STATUS.BAD_REQUEST);

async function readHistoryBody(req, bodyLimit = HISTORY_BODY_LIMIT) {
  const site = req.headers.get(HEADER.FETCH_SITE);
  if (req.headers.get(HEADER.ORIGIN) !== new URL(req.url).origin || (site && site !== SAME_ORIGIN)) {
    return privateJson({ error: 'origin' }, STATUS.FORBIDDEN);
  }
  if (req.headers.get(HEADER.CONTENT_TYPE)?.split(MEDIA_TYPE_SEPARATOR)[0].trim().toLowerCase() !== JSON_TYPE) {
    return privateJson({ error: 'content_type' }, STATUS.UNSUPPORTED);
  }
  const reader = req.body?.getReader();
  if (!reader) return badRequest();
  let size = 0, text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > bodyLimit) {
        await reader.cancel();
        return privateJson({ error: 'too_large' }, STATUS.TOO_LARGE);
      }
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    return body && typeof body === 'object' && !Array.isArray(body) ? body : badRequest();
  } catch { return badRequest(); }
  finally { reader.releaseLock(); }
}

function validSoloResult(body) {
  const limits = typeof body.game === 'string' && Object.hasOwn(SOLO_LIMITS, body.game) && SOLO_LIMITS[body.game];
  return limits && Object.keys(body).every((key) => RESULT_FIELDS.has(key))
    && Number.isSafeInteger(body.score) && body.score >= 0 && body.score <= limits.score
    && Number.isSafeInteger(body.level) && body.level >= 1 && body.level <= limits.level
    && typeof body.won === 'boolean' && (limits.won === undefined || body.won === limits.won)
    && typeof body.eventId === 'string' && RESULT_EVENT_ID.test(body.eventId)
    && typeof body.resultOwner === 'string'
    && (body.rp === undefined || (typeof body.rp === 'string' && REPLAY_ID.test(body.rp)));
}

// Adapter HTTP: domain cũ -> mới, file tĩnh, /api/* (tài khoản, lịch sử, bảng xếp hạng, phòng công khai) và nối WebSocket vào DO phòng.
const HOME = 'games.huyab.cfd';
const OLD_HOSTS = ['pikachu.huyab.cfd'];
// Tên miền ngắn của một game: vào là chuyển sang game đó trên domain chính (302, giữ query như ?r=MÃ).
const GAME_HOSTS = { 'soi.huyab.cfd': '/soi/' };
// Phòng chạy trên adapter phòng chung: tiền tố URL -> key game (header X-Game). Nokia / Ô ăn quan lấy key từ URL.
const ADAPTER_GAME = { '': 'pikachu', 'cc/': 'caro', 'c4/': 'c4', 'bt/': 'ban-tau', 'bc/': 'bau-cua', 'ms/': 'do-min', 'dv/': 'dao-vang' };

async function forward(req, ns, name, game, code, guest) {
  const origin = req.headers.get(HEADER.ORIGIN);
  if (origin && origin !== new URL(req.url).origin) return privateJson({ error: 'origin' }, STATUS.FORBIDDEN);
  const headers = new Headers(req.headers);
  for (const header of [USER_HEADER, GAME_HEADER, ROOM_HEADER, GUEST_HEADER]) headers.delete(header);
  if (game) { headers.set(GAME_HEADER, game); headers.set(ROOM_HEADER, code); }
  const user = await userFrom(req);
  if (user) headers.set(USER_HEADER, JSON.stringify({ sub: user.sub, name: user.name }));
  headers.set(GUEST_HEADER, guest.id);
  return ns.get(ns.idFromName(name)).fetch(new Request(req, { headers }));
}

async function route(req, env, guest) {
    const url = new URL(req.url);
    const api = url.pathname.startsWith('/api/');
    // Domain cũ: đổi sang domain mới, giữ nguyên đường dẫn + query (hub tự đưa ?r= cũ về /pikachu/).
    // /api/* vẫn phục vụ để tab đang mở không rớt WebSocket.
    if (OLD_HOSTS.includes(url.hostname) && !api) {
      url.hostname = HOME;
      return Response.redirect(url.toString(), 301);
    }
    if (GAME_HOSTS[url.hostname] && !api) {
      if (url.pathname === '/') url.pathname = GAME_HOSTS[url.hostname];
      url.hostname = HOME;
      return Response.redirect(url.toString(), 302);
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
    if (url.pathname === AI_PATH) {
      const respond = (result) => {
        const { status = AI_STATUS.OK, ...body } = result;
        return privateJson(body, status);
      };
      if (req.method !== METHOD.POST) return respond(aiFailure(AI_ERROR.REQUEST, AI_STATUS.METHOD));
      const body = await readHistoryBody(req, AI_LIMIT.BODY);
      if (body instanceof Response) return respond(aiFailure(AI_ERROR.REQUEST, body.status));
      return respond(await routeAi(body, env, guest.id));
    }
    if (url.pathname === ME_PATH) {
      if (req.method !== METHOD.GET) return privateJson({ error: 'method' }, STATUS.METHOD_NOT_ALLOWED);
      const user = await userFrom(req);
      const profile = await top().profile(user?.sub ?? null, guest.id);
      return privateJson({ user, ...profile, resultOwner: await resultOwner(user, guest.id) });
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
    if (url.pathname === CLAIM_PATH) {
      if (req.method !== METHOD.POST) return privateJson({ error: 'method' }, STATUS.METHOD_NOT_ALLOWED);
      const user = await userFrom(req);
      if (!user) return privateJson({ error: 'login' }, STATUS.UNAUTHORIZED);
      const body = await readHistoryBody(req);
      if (body instanceof Response) return body;
      if (Object.keys(body).length) return badRequest();
      const claim = await top().claimGuest(guest.id, user.sub, user.name);
      if (!claim.ok) return privateJson({ error: 'already_claimed' }, STATUS.CONFLICT);
      return withGuestCookie(privateJson(claim), guestSession(new Request(req.url)).id);
    }
    if (url.pathname === HISTORY_PATH) {
      const user = await userFrom(req);
      if (req.method === METHOD.POST) {
        const body = await readHistoryBody(req);
        if (body instanceof Response) return body;
        if (!validSoloResult(body)) return badRequest();
        if (body.resultOwner !== await resultOwner(user, guest.id)) return privateJson({ error: 'owner_changed' }, STATUS.CONFLICT);
        const detail = body.rp ? JSON.stringify({ rp: body.rp }) : '';
        await top().addPlays([{
          ...(user ? { sub: user.sub, name: user.name } : { guest: guest.id }),
          game: body.game, mode: SOLO_MODE, score: body.score, level: body.level, won: body.won, eventId: body.eventId, detail,
        }]);
        return privateJson({ ok: true });
      }
      if (req.method !== METHOD.GET) return privateJson({ error: 'method' }, STATUS.METHOD_NOT_ALLOWED);
      const rawBefore = url.searchParams.get('before');
      const before = rawBefore === null ? undefined : Number(rawBefore);
      if (before !== undefined && (!Number.isSafeInteger(before) || before <= 0)) return badRequest();
      return privateJson(await top().historyFor(user?.sub ?? null, guest.id, before));
    }
    // Bản đang chạy: CI (.github/workflows/ci.yml) chờ timestamp mới hơn commit rồi chạy scripts/smoke.mjs vào web thật.
    if (url.pathname === '/api/version') return Response.json({ id: env.CF_VERSION?.id ?? null, at: env.CF_VERSION?.timestamp ?? null }, { headers: { 'Cache-Control': 'no-store' } });
    if (url.pathname === '/api/fun') {
      const period = url.searchParams.get('period') === 'week' ? 'week' : 'all';
      return Response.json(await top().fun(period), { headers: { 'Cache-Control': 'public, max-age=60' } });
    }
    // Bảng điểm tự báo của game chạy ở client (2048): GET top 10, POST { name, score } (không cần đăng nhập, như bản cũ ở mytools).
    if (url.pathname === '/api/board') {
      const game = url.searchParams.get('game');
      if (!Object.hasOwn(BOARDS, game)) return new Response('Bad request', { status: 400 });
      if (req.method === 'POST') {
        if (!req.headers.get('Content-Type')?.startsWith('application/json')) return new Response('Unsupported', { status: 415 });
        let b;
        try { b = await req.json(); } catch { return new Response('Bad request', { status: 400 }); }
        const name = typeof b?.name === 'string' ? b.name.trim().slice(0, 20) : '';
        const score = Number(b?.score);
        if (!name || !Number.isInteger(score) || score < 0 || score > BOARDS[game]) return new Response('Bad request', { status: 400 });
        return Response.json(await top().boardAdd(game, name, score));
      }
      return Response.json(await top().board(game), { headers: { 'Cache-Control': 'no-store' } });
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
    if (nk && req.headers.get(HEADER.UPGRADE) === WEBSOCKET) return forward(req, env.NOKIA, `${nk[1]}:${nk[2]}`, nk[1], nk[2], guest);
    // /api/room/CODE = Pikachu, /api/dv/room/CODE = Đào Vàng, /api/ms/room/CODE = Dò mìn, /api/bc/room/CODE = Bầu cua,
    // /api/cc/room/CODE = Cờ caro, /api/c4/room/CODE = Nối 4 (chung class phòng với caro), /api/bt/room/CODE = Bắn tàu.
    const m = url.pathname.match(/^\/api\/(dv\/|ms\/|bc\/|cc\/|c4\/|bt\/)?room\/([A-Z0-9]{4})$/);
    if (!m || req.headers.get('Upgrade') !== 'websocket') return new Response('Not found', { status: 404 });
    const ns = { 'dv/': env.MINER, 'ms/': env.MINES, 'bc/': env.DICE, 'cc/': env.CARO, 'c4/': env.CARO, 'bt/': env.SHIPS }[m[1]] ?? env.ROOM;
    return forward(req, ns, m[1] === 'c4/' ? `c4:${m[2]}` : m[2], ADAPTER_GAME[m[1] ?? ''], m[2], guest);
}

export const http = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const privatePath = [ME_PATH, HISTORY_PATH, CLAIM_PATH, AI_PATH].includes(url.pathname);
    const websocket = req.headers.get(HEADER.UPGRADE) === WEBSOCKET;
    let guest = privatePath || websocket ? guestSession(req) : null;
    const response = await route(req, env, guest);
    if (url.pathname === CLAIM_PATH) return response;
    const document = response.headers.get(HEADER.CONTENT_TYPE)?.includes(HTML_TYPE);
    if (document) guest ??= guestSession(req);
    return guest?.fresh && (privatePath || websocket || document) ? withGuestCookie(response, guest.id) : response;
  },
};

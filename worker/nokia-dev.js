// Chỉ để chạy thử game Nokia ở máy (wrangler.nokia.toml) mà không đụng worker/index.js. Không deploy file này.
export { NokiaRoom } from './nokia.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/api\/nk\/([a-z-]+)\/room\/([A-Z0-9]{4})$/);
    if (!m) return env.ASSETS.fetch(req);
    const u = new URL(req.url);
    u.searchParams.set('game', m[1]);
    return env.NOKIA.get(env.NOKIA.idFromName(`${m[1]}:${m[2]}`)).fetch(new Request(u, req));
  },
};

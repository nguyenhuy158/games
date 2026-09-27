# Pikachu Online

Game nối thú cổ điển, multiplayer ẩn danh (định danh theo thiết bị). https://pikachu.huyab.click

- `public/` — client tĩnh; `public/logic.js` là luật chơi dùng chung client + server.
- `worker/index.js` — Worker + Durable Object `Room` (1 phòng = 1 DO, WebSocket).

```bash
pnpm install
pnpm dev     # http://localhost:8787
pnpm test    # node logic.test.mjs
```

**Deploy:** push lên `main` → Cloudflare Workers Builds tự chạy `node logic.test.mjs` rồi `npx wrangler deploy`.

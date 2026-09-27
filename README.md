# Pikachu Online

Game nối thú cổ điển, multiplayer ẩn danh (định danh theo thiết bị). https://pikachu.huyab.click

- `public/` — client tĩnh; `public/logic.js` là luật chơi dùng chung client + server.
- 2 chế độ (chủ phòng chọn ở sảnh): **Đua nhau** — mỗi người một bàn cùng đề; **Chơi chung** — cả phòng một bàn, thấy ô đồng đội đang chọn.
- Icon: lucide (giống chia-keo), trích riêng icon cần dùng vào `public/icons.js` bằng `pnpm icons` (sửa danh sách trong `scripts/icons.mjs`).
- `worker/index.js` — Worker + Durable Object `Room` (1 phòng = 1 DO, WebSocket).

```bash
pnpm install
pnpm dev     # http://localhost:8787
pnpm test    # node logic.test.mjs
```

**Deploy:** push lên `main` → Cloudflare Workers Builds tự chạy `node logic.test.mjs` rồi `npx wrangler deploy`.

# Game Cổ Điển

Bộ game cổ điển chơi trên trình duyệt. https://pikachu.huyab.click

| Game | Đường dẫn | Ghi chú |
|---|---|---|
| Pikachu nối thú | `/pikachu/` | Multiplayer ẩn danh (định danh theo thiết bị) |
| Đào Vàng | `/dao-vang/` | 1 người, canvas; luật thuần ở `public/dao-vang/logic.js` |

Thêm game mới: tạo `public/<ten-game>/`, thêm thẻ vào `public/index.html`, thêm file vào `CORE` trong `public/sw.js` (và tăng `CACHE`), test vào `<ten-game>.test.mjs` rồi import ở cuối `logic.test.mjs`.

## Pikachu

- **3 chế độ** (chủ phòng chọn ở sảnh): **Chơi chung** — cả phòng một bàn; **Đua nhau** — mỗi người một bàn cùng đề; **Đội 2v2** — mỗi đội một bàn, đua giữa hai đội.
- **5 màn** như bản gốc: màn 1 đứng yên, màn 2–5 ô dồn ↓ ← ↑ →. Mỗi màn có đồng hồ riêng.
- **4 cỡ bàn** 16×9 / 12×9 / 10×8 / 8×6, **2 bộ hình**: Pokémon / Động vật (Twemoji).
- Chơi cùng bàn: thấy **chuột + ô đang chọn** của đồng đội, **ping** ô (chuột phải / giữ ngón tay), **emoji** nhanh.
- **Combo**: ăn liên tiếp trong 3 giây nhân điểm (tối đa x5). Hết nước tự xáo **+10 giây**.
- **Khán giả**: vào phòng đang chơi (hoặc người thứ 5+) được xem, chọn bàn để xem, ván sau được chơi.
- **Bảng xếp hạng** theo chế độ + cỡ bàn. **PWA**: cài lên màn hình chính, mất mạng vẫn mở được app.

## Code

- `public/pikachu/` — client tĩnh, không build. `public/pikachu/logic.js` là luật chơi (tìm đường, trượt ô) dùng chung client + server.
- `worker/index.js` — Worker + Durable Object `Room` (1 phòng = 1 DO, WebSocket) + DO `Top` (bảng xếp hạng, SQLite trong DO vì gói free đã hết quota D1).
- Mô hình "bàn chơi" (unit): coop = 1 unit, race = 1 unit/người, team = unit A/B. Màn, đồng hồ, combo, lượt xáo nằm trên unit nên mọi luật viết một lần cho cả 3 chế độ.
- Icon: lucide, trích riêng icon cần dùng vào `public/icons.js` bằng `pnpm icons` (sửa danh sách trong `scripts/icons.mjs`).
- Ảnh sinh bằng Chrome headless: `node scripts/render-assets.mjs` (sprite động vật + icon PWA), rồi commit PNG.

## Đào Vàng

- Canvas 640x480 logic, co giãn theo màn hình. Assets (atlas, nền, âm thanh) lấy từ daovangcodien.com cho mục đích học tập; bản gốc để tham khảo nằm ở `reference/dao-vang/` (không commit).
- Móc lắc qua lại, bấm để thả; vật càng nặng kéo càng chậm. 60 giây/màn, đủ tiền mục tiêu (cộng dồn) mới qua màn, giữa các màn có tiệm (thuốc nổ, tăng lực, cỏ 4 lá, sách đá, nước đánh bóng).
- `seeded()` trong logic.js để sau này làm chế độ nhiều người cùng đề.

## Chạy

```bash
pnpm install
pnpm dev     # http://localhost:8787
pnpm test    # node logic.test.mjs
```

**Deploy:** push lên `main` → Cloudflare Workers Builds tự chạy `node logic.test.mjs` rồi `npx wrangler deploy`.

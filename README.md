# Game Cổ Điển

Bộ game cổ điển chơi trên trình duyệt. https://games.huyab.click — mỗi game một đường dẫn con. Domain cũ `pikachu.huyab.click` tự 301 sang (xem `OLD_HOSTS` ở `worker/index.js`).

| Game | Đường dẫn | Ghi chú |
|---|---|---|
| Pikachu nối thú | `/pikachu/` | Multiplayer ẩn danh (định danh theo thiết bị) |
| Đào Vàng | `/dao-vang/` | 1 người hoặc 2–4 người chung mỏ; luật thuần ở `public/dao-vang/logic.js` |
| Bầu cua | `/bau-cua/` | 2–10 người đặt xu ảo, máy làm cái (mặc định) hoặc xoay vòng |
| Cờ caro | `/co-caro/` | 1v1 hoặc với máy, người khác xem; XO 3×3; luật chặn 2 đầu tuỳ chọn |
| Dò mìn | `/do-min/` | Nhiều người: chơi chung một bàn (3 mạng, thấy chuột, ping) hoặc đua cùng đề; mìn chỉ ở server |

Thêm game mới: tạo `public/<ten-game>/`, thêm thẻ vào `public/index.html`, thêm file vào `CORE` trong `public/sw.js` (và tăng `CACHE`), test vào `<ten-game>.test.mjs` rồi import ở cuối `logic.test.mjs`.

Giao diện không dùng emoji: icon lấy từ lucide (`public/icons.js`, sinh bởi `scripts/icons.mjs`; `iconEl(tên)` cho DOM), toast dùng chung `public/toast.js` bắt chước sonner như chia-keo (`toast()`, `toast.success/.error/.warning`, `{ icon }`).

Tên khách: lần đầu bốc ngẫu nhiên "con vật + tính cách" (`public/names.js`, vd "Mèo Lười", 900 kiểu), dùng chung mọi game. Server chống trùng trong phòng: tên đã có thì thêm số ("Mèo Lười 2", `worker/names.js`).

Mời bạn: nút mã phòng mở hộp **QR** (`public/invite.js`, lib [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) MIT chép ở `public/vendor/`) — quét bằng camera là vào phòng; kèm sao chép / chia sẻ link.

## Tài khoản & lịch sử

- Đăng nhập Google qua SSO dùng chung `auth.huyab.click` (giống chia-keo): cookie `huyab_sso` (Domain=.huyab.click), JWT RS256 kiểm bằng JWKS ở `worker/sso.js`. Không đăng nhập vẫn chơi bình thường (khách theo thiết bị).
- Worker xác thực rồi gắn `X-User` khi chuyển WebSocket vào phòng; header client tự gửi luôn bị xoá trước.
- Lịch sử lưu ở bảng `plays` trong DO `Top` (chỉ `sub` + tên, không lưu email). Ván nhiều người do server ghi; Đào Vàng 1 người do client gửi `POST /api/me/history` (tự báo nên chỉ là lịch sử cá nhân).
- `GET /api/me` (user + thống kê), `GET /api/me/history` (30 ván gần nhất). Trang chủ hiển thị cả hai.
- **Bảng xếp hạng vui** `GET /api/fun?period=week|all`: 10 hạng mục (cày nhiều, thắng nhiều, đại gia Đào Vàng, đại gia Bầu cua, kỳ thủ caro, thánh dò mìn, thánh nối thú, thợ mỏ lì đòn, đồng đội quốc dân, cú đêm 0–5h giờ VN), top 5 mỗi mục, chỉ người đã đăng nhập. Tên lấy từ bảng `users` (tên SSO mới nhất).

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
- **Nhiều người** (`worker/dao-vang.js`, DO `MinerRoom`, WebSocket `/api/dv/room/CODE`): 2–4 thợ mỏ đứng cạnh nhau, chung một mỏ, ai móc trúng trước được. **Chung mỏ** = quỹ chung, mục tiêu x(1 + 0.6·(n−1)), thua khi thiếu tiền; **Tranh vàng** = ví riêng, 5 màn, nhiều tiền nhất thắng. Tiệm giữa màn 20 giây hoặc khi mọi người sẵn sàng. Người vào giữa ván được xem.
- Server chạy vật lý thật 20 lần/giây bằng **cùng hàm `step()`** với bản 1 người; client chỉ gửi `shoot`/`dyn` và vẽ theo snapshot (nội suy trễ 100 ms). Chuột chạy theo hàm của thời gian nên client tự tính vị trí, snapshot chỉ cần trạng thái móc.

## Dò mìn

- `worker/do-min.js` (DO `MineRoom`, WebSocket `/api/ms/room/CODE`), luật ở `public/do-min/logic.js`.
- Vị trí mìn **chỉ ở server**; client nhận ô đã mở. Đua cùng đề thì mỗi người chỉ nhận bàn của mình (thấy bàn đối thủ là chép được ô an toàn) — khung người chơi chỉ hiện % tiến độ. Hết ván mới lộ hết mìn.
- Xuất phát: server chọn 1 ô, rải mìn chừa 3x3 quanh nó rồi mở sẵn cho mọi bàn (không ai đạp mìn nước đầu, đua công bằng).
- 3 giao diện (riêng từng máy, lưu `ms.skin`): Hiện đại, **Windows XP**, **Socola** — ảnh từ [MS-Texture](https://github.com/Minesweeper-World/MS-Texture) (MIT, `public/do-min/skins/LICENSE`), có mặt cười + đồng hồ LED. Socola thu nhỏ còn 96px (`sips -Z 96`).
- Chung: 3 mạng cả đội. Đua: đạp mìn +10 giây, ai mở hết trước thắng. Lịch sử lưu thời gian (giây); bảng vui có "💣 Thánh dò mìn" (thắng nhanh nhất).

## Bầu cua

- `worker/bau-cua.js` (DO `DiceRoom`, WebSocket `/api/bc/room/CODE`), luật ở `public/bau-cua/logic.js`.
- Mỗi người 1000 xu ảo/phòng, phỉnh 10/50/100/500. Ra k mặt ăn x·k, không ra mất x; cái chung/nhận phần ngược lại (xu cái có thể âm).
- Mặc định **máy làm cái** (ai cũng đặt, chủ phòng mở bát). Chủ phòng đổi sang **xoay cái** lúc nào cũng được khi đang đặt cược (cái mới được trả lại cược); ở một mình thì luôn là máy. Cái ngồi im quá 30 giây thì ai cũng mở bát được.
- Xúc xắc chỉ tung (crypto) lúc mở bát, sau khi cược đã khoá → không có gì để gian lận. Client lắc bát 2,5 giây rồi mới lật; xu hiển thị giữ số cũ tới lúc lật.
- Hình 6 con (`public/bau-cua/assets/*.webp`, 256px, ~14KB/hình) cắt tròn từ ảnh chụp tờ bầu cua in dân gian trong [bài của Bách Hóa Xanh](https://www.bachhoaxanh.com/kinh-nghiem-hay/luat-choi-bau-cua-tom-ca-huong-dan-toan-tap-tu-a-z-cho-nguoi-moi-1589468) (mục đích học tập); ảnh gốc ở `reference/bau-cua/` (không commit). Cắt bằng canvas trong Chrome headless rồi `cwebp -q 85`.
- Hết xu được cứu trợ 500 (không tính vào lãi). Lãi/lỗ cả buổi ghi vào lịch sử khi rời phòng (người đã đăng nhập); bảng vui có "🦀 Đại gia Bầu cua" (tổng lãi).

## Cờ caro

- `worker/co-caro.js` (DO `CaroRoom`, WebSocket `/api/cc/room/CODE`), luật + máy đánh ở `public/co-caro/logic.js`.
- Bàn 15×15 / 19×19 nối 5 là thắng, hoặc **XO 3×3** (tic-tac-toe) nối 3 — máy dùng minimax cả cây nên không bao giờ thua (đánh đúng thì hoà). Luật **chặn 2 đầu** (tuỳ chọn): 5 quân bị quân đối phương chặn cả 2 đầu thì không tính; mép bàn không tính là chặn.
- 2 người vào đầu cầm X / O (X đi trước), còn lại xem + thả cảm xúc. Một mình thì đánh với máy (heuristic chấm điểm 1 nước: tấn công ×1.1 + phòng thủ). Ván mới đổi người đi trước; tỉ số tính theo cặp đấu.
- Mỗi nước 30 giây, hết giờ thua (server hẹn giờ; `tick()` kiểm lại nếu DO bị tắt). Lịch sử lưu số nước; bảng vui có "Kỳ thủ caro" (số ván thắng người thật).

## Ảnh chụp màn hình

[`screenshots/`](screenshots/README.md): mỗi game một thư mục, trong đó mỗi thiết bị một thư mục con (desktop / tablet / phone / iPhone dọc, ngang). README trong đó có ảnh nhỏ để xem nhanh; chụp lại xong chạy `node scripts/screenshots-readme.mjs`.

## Chạy

```bash
pnpm install
pnpm dev     # http://localhost:8787
pnpm test    # node logic.test.mjs
```

**Deploy:** push lên `main` → Cloudflare Workers Builds tự chạy `node logic.test.mjs` rồi `npx wrangler deploy`.

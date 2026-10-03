# Game Cổ Điển

Bộ game cổ điển chơi trên trình duyệt. https://games.huyab.click — mỗi game một đường dẫn con. Domain cũ `pikachu.huyab.click` tự 301 sang (xem `OLD_HOSTS` ở `worker/adapters/http.js`).

| Game | Đường dẫn | Ghi chú |
|---|---|---|
| Pikachu nối thú | `/pikachu/` | Multiplayer ẩn danh (định danh theo thiết bị) |
| Đào Vàng | `/dao-vang/` | 1 người hoặc 2–4 người chung mỏ; luật thuần ở `public/dao-vang/logic.js` |
| Bầu cua | `/bau-cua/` | 2–10 người đặt xu ảo, máy làm cái (mặc định) hoặc xoay vòng |
| Cờ caro | `/co-caro/` | 1v1 hoặc với máy, người khác xem; XO 3×3; luật chặn 2 đầu tuỳ chọn |
| Ô ăn quan | `/o-an-quan/` | 2–5 người (3+ người: bàn đa giác, đi vòng), thiếu người thì máy (3 mức) vào chơi, người khác xem; quan non tuỳ chọn, vay dân khi hết quân |
| Nối 4 | `/noi-4/` | Connect 4: 1v1 hoặc với máy, người khác xem |
| Bắn tàu | `/ban-tau/` | Battleship: 1v1 hoặc với máy; tàu chỉ gửi cho chủ hạm đội |
| Cờ tướng | `/co-tuong/` | Đủ luật (cản mắt / cản chân, pháo cách ngòi, lộ mặt tướng, không tự chiếu); 1v1 hoặc với máy (alpha-beta + tìm yên, có hạn giờ), người khác xem |
| Cờ gánh | `/co-ganh/` | Cờ dân gian 5×5: gánh (đi vào giữa 2 quân địch), vây và mở (bắt buộc vào gánh); 1v1 hoặc với máy (3 mức), người khác xem |
| Dò mìn | `/do-min/` | Nhiều người: chơi chung một bàn (3 mạng, thấy chuột, ping) hoặc đua cùng đề; mìn chỉ ở server |
| Lô tô | `/loto/` | 1–12 người, mỗi người một phiếu 3×9 (chỉ chủ phiếu thấy), chủ phòng gọi số 1–90, server kiểm số đã gọi; kín một hàng là KINH; vào giữa ván vẫn có phiếu |
| 2048 | `/2048/` | 1 người, chạy hết ở client: phím mũi tên / vuốt / phím trên màn; bảng xếp hạng tên + điểm (top 10, `/api/board?game=2048`) |
| Xếp gạch | `/tetris/` | 1 người, chạy hết ở client: phím / vuốt / chạm / 4 nút; tạm dừng (P); kỷ lục lưu trên máy |
| Sudoku | `/sudoku/` | 1 người, chạy hết ở client: 3 mức, ghi chú bút chì (N), 3 gợi ý, đồng hồ + tạm dừng, kỷ lục thời gian theo mức lưu trên máy |

Kiểm tra nhiều người qua WebSocket thật (bot chơi từng game): `node scripts/smoke.mjs [url] [game ...]`, mặc định `http://localhost:8789` (`wrangler dev --port 8789`). Chạy trước / sau mỗi bước refactor (kế hoạch: `docs/hexagon-plan.md`). CI (`.github/workflows/ci.yml`, job `smoke-prod`) tự chạy vào web thật sau mỗi lần deploy (chờ `/api/version` mới hơn commit); bot smoke (id `smoke-...`) không lên bảng xếp hạng.

Thêm game mới: tạo `public/<ten-game>/`, thêm thẻ vào `public/index.html`, thêm file vào `CORE` trong `public/sw.js` (và tăng `CACHE`), test vào `<ten-game>.test.mjs` rồi import ở cuối `logic.test.mjs`.

Song ngữ vi / en (mặc định vi): `public/i18n.js`. JS viết cặp ngay tại chỗ `t('Tạo phòng', 'Create room')`; HTML tĩnh dùng `data-en` / `data-en-html` / `data-en-title` / `data-en-placeholder`; chữ server gửi cho người chơi (lỗi, tiêu đề kết quả) là cặp `['vi', 'en']`, client hiện bằng `tx()`. Chọn bằng nút VI | EN (`langToggle()` hoặc `<span data-lang-toggle>`) hoặc `?lang=en`, nhớ trong localStorage `lang` cho mọi game. Dữ liệu dùng chung server + test (tên con vật, cấp độ, đồ trong tiệm...) giữ tiếng Việt, dịch lúc hiện.

Giao diện không dùng emoji: icon lấy từ lucide (`public/icons.js`, sinh bởi `scripts/icons.mjs`; `iconEl(tên)` cho DOM), toast dùng chung `public/toast.js` bắt chước sonner như chia-keo (`toast()`, `toast.success/.error/.warning`, `{ icon }`).

Tên khách: lần đầu bốc ngẫu nhiên "con vật + tính cách" (`public/names.js`, vd "Mèo Lười", 900 kiểu), dùng chung mọi game. Server chống trùng trong phòng: tên đã có thì thêm số ("Mèo Lười 2", `worker/names.js`).

Mời bạn: nút mã phòng mở hộp **QR** (`public/invite.js`, lib [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) MIT chép ở `public/vendor/`) — quét bằng camera là vào phòng; kèm sao chép / chia sẻ link.

## Tài khoản & lịch sử

- Đăng nhập Google qua SSO dùng chung `auth.huyab.click` (giống chia-keo): cookie `huyab_sso` (Domain=.huyab.click), JWT RS256 kiểm bằng JWKS ở `worker/sso.js`. Không đăng nhập vẫn chơi bình thường (khách theo thiết bị).
- Worker xác thực rồi gắn `X-User` khi chuyển WebSocket vào phòng; header client tự gửi luôn bị xoá trước.
- Lịch sử lưu ở bảng `plays` trong DO `Top` (chỉ `sub` + tên, không lưu email). Ván nhiều người do server ghi; Đào Vàng 1 người do client gửi `POST /api/me/history` (tự báo nên chỉ là lịch sử cá nhân).
- `GET /api/me` (user + thống kê), `GET /api/me/history` (30 ván gần nhất). Trang chủ hiển thị cả hai.
- **Bảng điểm tự báo** `GET /api/board?game=2048` (top 10 tên + điểm), `POST` `{ name, score }` (JSON, không cần đăng nhập, như bản cũ ở mytools; điểm chặn trên bằng `MAX_SCORE` của game). Bảng `boards` trong DO `Top`, chỉ giữ 10 dòng mỗi game.
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
- `worker/index.js` — chỉ nối dây: Worker = `worker/adapters/http.js` (router `/api/*`, nối WebSocket vào DO kèm header tin cậy); DO `Top` = `worker/adapters/top.js` (bảng xếp hạng, lịch sử, phòng công khai; SQLite trong DO vì gói free đã hết quota D1; hạng mục bảng vui là mảng `FUN`); mỗi class phòng = `gameRoom({...})`. Mọi phòng (kể cả Pikachu, Đào Vàng, Dò mìn) chạy trên adapter; luật mỗi game ở `worker/games/<game>.js`. Phía client mọi game nối phòng qua `public/room-client.js` (tự nối lại, mở ở tab khác thì tab cũ rời phòng).
- Mô hình "bàn chơi" (unit): coop = 1 unit, race = 1 unit/người, team = unit A/B. Màn, đồng hồ, combo, lượt xáo nằm trên unit nên mọi luật viết một lần cho cả 3 chế độ.
- Icon: lucide, trích riêng icon cần dùng vào `public/icons.js` bằng `pnpm icons` (sửa danh sách trong `scripts/icons.mjs`).
- Ảnh sinh bằng Chrome headless: `node scripts/render-assets.mjs` (sprite động vật + icon PWA), rồi commit PNG.

## Đào Vàng

- Canvas 640x480 logic, co giãn theo màn hình. Assets (atlas, nền, âm thanh) lấy từ daovangcodien.com cho mục đích học tập; bản gốc để tham khảo nằm ở `reference/dao-vang/` (không commit).
- Móc lắc qua lại, bấm để thả; vật càng nặng kéo càng chậm. 60 giây/màn, đủ tiền mục tiêu (cộng dồn) mới qua màn, giữa các màn có tiệm (thuốc nổ, tăng lực, cỏ 4 lá, sách đá, nước đánh bóng).
- **Nhiều người** (`worker/games/dao-vang.js`, DO `MinerRoom`, WebSocket `/api/dv/room/CODE`): 2–4 thợ mỏ đứng cạnh nhau, chung một mỏ, ai móc trúng trước được. **Chung mỏ** = quỹ chung, mục tiêu x(1 + 0.6·(n−1)), thua khi thiếu tiền; **Tranh vàng** = ví riêng, 5 màn, nhiều tiền nhất thắng. Tiệm giữa màn 20 giây hoặc khi mọi người sẵn sàng. Người vào giữa ván được xem.
- Server chạy vật lý thật 20 lần/giây bằng **cùng hàm `step()`** với bản 1 người; client chỉ gửi `shoot`/`dyn` và vẽ theo snapshot (nội suy trễ 100 ms). Chuột chạy theo hàm của thời gian nên client tự tính vị trí, snapshot chỉ cần trạng thái móc.

## Dò mìn

- `worker/games/do-min.js` (DO `MineRoom`, WebSocket `/api/ms/room/CODE`), luật ở `public/do-min/logic.js`.
- Vị trí mìn **chỉ ở server**; client nhận ô đã mở. Đua cùng đề thì mỗi người chỉ nhận bàn của mình (thấy bàn đối thủ là chép được ô an toàn) — khung người chơi chỉ hiện % tiến độ. Hết ván mới lộ hết mìn.
- Xuất phát: server chọn 1 ô, rải mìn chừa 3x3 quanh nó rồi mở sẵn cho mọi bàn (không ai đạp mìn nước đầu, đua công bằng).
- 3 giao diện (riêng từng máy, lưu `ms.skin`): Hiện đại, **Windows XP**, **Socola** — ảnh từ [MS-Texture](https://github.com/Minesweeper-World/MS-Texture) (MIT, `public/do-min/skins/LICENSE`), có mặt cười + đồng hồ LED. Socola thu nhỏ còn 96px (`sips -Z 96`).
- Chung: 3 mạng cả đội. Đua: đạp mìn +10 giây, ai mở hết trước thắng. Lịch sử lưu thời gian (giây); bảng vui có "💣 Thánh dò mìn" (thắng nhanh nhất).
- Chơi một mình: bấm mặt cười lúc nào cũng làm lại ván mới (tin `{ t: 'restart' }`, server chỉ nhận khi phòng có đúng 1 người chơi).

## Bầu cua

- `worker/games/bau-cua.js` (module trong adapter phòng chung, DO `DiceRoom`, WebSocket `/api/bc/room/CODE`), luật ở `public/bau-cua/logic.js`.
- Mỗi người 1000 xu ảo/phòng, phỉnh 10/50/100/500. Ra k mặt ăn x·k, không ra mất x; cái chung/nhận phần ngược lại (xu cái có thể âm).
- Mặc định **máy làm cái** (ai cũng đặt, chủ phòng mở bát). Chủ phòng đổi sang **xoay cái** lúc nào cũng được khi đang đặt cược (cái mới được trả lại cược); ở một mình thì luôn là máy. Cái ngồi im quá 30 giây thì ai cũng mở bát được.
- Xúc xắc chỉ tung (crypto) lúc mở bát, sau khi cược đã khoá → không có gì để gian lận. Client lắc bát 2,5 giây rồi mới lật; xu hiển thị giữ số cũ tới lúc lật.
- Hình 6 con (`public/bau-cua/assets/*.webp`, 256px, ~14KB/hình) cắt tròn từ ảnh chụp tờ bầu cua in dân gian trong [bài của Bách Hóa Xanh](https://www.bachhoaxanh.com/kinh-nghiem-hay/luat-choi-bau-cua-tom-ca-huong-dan-toan-tap-tu-a-z-cho-nguoi-moi-1589468) (mục đích học tập); ảnh gốc ở `reference/bau-cua/` (không commit). Cắt bằng canvas trong Chrome headless rồi `cwebp -q 85`.
- Hết xu được cứu trợ 500 (không tính vào lãi). Lãi/lỗ cả buổi ghi vào lịch sử khi rời phòng (người đã đăng nhập); bảng vui có "🦀 Đại gia Bầu cua" (tổng lãi).

## Cờ caro

- `worker/games/caro.js` (module trong adapter phòng chung, DO `CaroRoom`, WebSocket `/api/cc/room/CODE`), luật + máy đánh ở `public/co-caro/logic.js`.
- Bàn 15×15 / 19×19 nối 5 là thắng, hoặc **XO 3×3** (tic-tac-toe) nối 3 — máy dùng minimax cả cây nên không bao giờ thua (đánh đúng thì hoà). Luật **chặn 2 đầu** (tuỳ chọn): 5 quân bị quân đối phương chặn cả 2 đầu thì không tính; mép bàn không tính là chặn.
- 2 người vào đầu cầm X / O (X đi trước), còn lại xem + thả cảm xúc. Một mình thì đánh với máy (heuristic chấm điểm 1 nước: tấn công ×1.1 + phòng thủ). Ván mới đổi người đi trước; tỉ số tính theo cặp đấu.
- Mỗi nước 30 giây, hết giờ thua (server hẹn giờ; `tick()` kiểm lại nếu DO bị tắt). Lịch sử lưu số nước; bảng vui có "Kỳ thủ caro" (số ván thắng người thật).

## Nối 4 & Bắn tàu

Làm theo lối chơi của papergames.io (tham khảo cách bố trí / luật để học), hình vẽ tự làm bằng CSS + logo trong `scripts/logos.mjs`, không lấy ảnh của họ.

- **Nối 4** (`public/noi-4/`): dùng chung DO `CaroRoom` với caro — bảng `RULES` trong `worker/games/caro.js` giữ phần khác nhau (cỡ bàn, nước đi hợp lệ, thắng, máy). Worker gửi `/api/c4/room/CODE` tới id `c4:CODE` kèm header `X-Game: c4`. Bàn 7×6, bấm ô nào trong cột là thả vào cột đó; máy dùng negamax alpha-beta 4 tầng (~2.5 ms/nước).
- **Ô ăn quan** (`public/o-an-quan/`): luật + máy (minimax) ở `logic.js`, server là module `worker/games/o-an-quan.js` chạy trong DO `NokiaRoom` (`/api/nk/o-an-quan/room/CODE`), giao diện DOM qua `nokiaApp({ mount, render })` thay cho LCD. Mỗi nước server gửi kèm các bước rải (`last.steps`) để client diễn lại từng viên; hạn giờ cộng thêm thời gian diễn.
- **Bắn tàu** (`worker/games/ban-tau.js`, DO `ShipRoom`, `/api/bt/room/CODE`, luật ở `public/ban-tau/logic.js`): biển 10×10, tàu 5-4-3-3-2 không chạm nhau. Xếp ngẫu nhiên (*Xếp lại*) hoặc tự xếp — chạm tàu để chọn, chạm ô trống để dời, chạm lại / *Xoay* để đổi chiều; server kiểm lại bằng `validFleet` (60 giây) → cả hai *Sẵn sàng* → bắn luân phiên, trúng được bắn tiếp; chìm tàu thì tự đánh dấu các ô xung quanh. Server gửi mỗi người một bản state: chỉ thấy hạm đội của mình tới khi hết ván. Hết 30 giây thì bắn giùm 1 phát ngẫu nhiên, 3 lượt liền như vậy thì thua. Máy: săn quanh ô trúng, không có thì bắn ô "bàn cờ" ngẫu nhiên. Dưới mỗi biển có hàng tàu (chìm thì mờ) — server gửi `sunk` theo thứ tự FLEET, không lộ vị trí.
- Bảng vui: "Vua Nối 4" (ván thắng người thật), "Xạ thủ Bắn tàu" (thắng bằng ít phát nhất).

## Góc Nokia

Game điện thoại Nokia ngày xưa ở `/nokia/<game>/`: **Rắn săn mồi** (snake), **Bantumi**, **Lật hình** (pairs), **Logic**, **Rapid Roll**, **Space Impact**, **Bounce**. Hình pixel tự vẽ, không dùng ảnh của Nokia.

- Kiến trúc hexagonal (`docs/hexagon-plan.md`): luật thuần (domain) ở `public/<game>/logic.js`; module game (application) ở `worker/games/<game>.js` (`start` / `msg` / `tick` / `view`, hợp đồng trong `worker/ports.js`, mọi I/O qua `ctx`: `now`, `rand`, `wakeAt`, `end`, `send`); adapter phòng chung `worker/adapters/game-room.js` (Durable Object + WebSocket: người chơi, chủ phòng, sảnh chờ, view riêng từng người, lưu, hẹn giờ bằng alarm, lịch sử, phòng công khai). `scripts/check-deps.mjs` (chạy trong test) chặn import sai chiều.
- DO `NokiaRoom` = `gameRoom({ snake, bantumi, ... })` ở `worker/index.js`, WebSocket `/api/nk/<game>/room/CODE`, mỗi phòng là DO tên `<game>:<CODE>`; Worker gửi kèm header tin cậy `X-Game` / `X-Room` / `X-User`.
- Phòng công khai: chủ phòng gửi `{ t: 'public', on }`, state có `pub`; phòng báo lên DO `Top` (`roomUpsert` / `roomDrop`, mỗi 30s bằng alarm), `GET /api/rooms` trả phòng còn sống trong 90s (trang `/phong/`).
- Client chung `public/nokia/room.js` (trang vào phòng, mời QR, sảnh chờ, kết quả) + `public/nokia/lcd.js`: LCD 84×48 hai màu, font pixel 3×5 tự vẽ, bàn phím 2/4/5/6/8 (bàn phím thật, WASD, mũi tên, nút trên màn — giữ được), tiếng bíp WebAudio.
- Snake: server bước theo tốc độ (5 cấp), có / không tường, 1–4 con; con sống cuối cùng thắng. Bantumi: luật Kalah, máy minimax alpha-beta. Lật hình: 6×4 lá, hình lá úp chỉ ở server. Logic: mọi người đoán cùng một mã (chỉ ở server), 10 lượt / 5 phút.
- Snake: kỷ lục của máy (`localStorage` `nk.best.snake`) hiện mờ cạnh điểm trên LCD và ở sảnh chờ.
- Rapid Roll + Bounce: "đua cùng đề" (`worker/games/race.js`) — server phát hạt giống / màn + giờ xuất phát, máy mỗi người tự chạy mô phỏng (`public/nokia/<game>/logic.js`), gửi vị trí 5 lần/giây để người khác thấy bóng mờ. Bounce có 3 màn dựng bằng hàm `build()`; sửa màn xong chạy `node scripts/bounce-solve.mjs` (beam search trên chính mô phỏng) để chắc còn qua được.
- Space Impact: server chạy thế giới 20 lần/giây, client chỉ gửi phím đang giữ; tàu của mình được đoán trước theo phím cho đỡ trễ. 3 màn, mỗi màn một trùm.
- Logo: `node scripts/nokia-logos.mjs`.
- Lô tô (`/loto/`) dùng chung khung `public/nokia/room.js` (chế độ `mount` / `render`, không có LCD) và DO `NokiaRoom` (`/api/nk/loto/room/CODE`); module `worker/games/loto.js`, luật ở `public/loto/logic.js`.

## Ảnh chụp màn hình

[`screenshots/`](screenshots/README.md): mỗi game một thư mục, trong đó mỗi thiết bị một thư mục con (desktop / tablet / phone / iPhone dọc, ngang). README trong đó có ảnh nhỏ để xem nhanh; chụp lại xong chạy `node scripts/screenshots-readme.mjs`.

## Chạy

```bash
pnpm install
pnpm dev     # http://localhost:8787
pnpm test    # node logic.test.mjs
```

**Deploy:** push lên `main` → Cloudflare Workers Builds tự chạy `node logic.test.mjs` rồi `npx wrangler deploy`.

# Game Cổ Điển

Bộ game cổ điển chơi trên trình duyệt. https://games.huyab.cfd — mỗi game một đường dẫn con. Domain cũ `pikachu.huyab.cfd` tự 301 sang (xem `OLD_HOSTS` ở `backend/src/adapters/http.js`).

| Game | Đường dẫn | Ghi chú |
|---|---|---|
| Pikachu nối thú | `/pikachu/` | Multiplayer ẩn danh (định danh theo thiết bị) |
| Đào Vàng | `/dao-vang/` | 1 người hoặc 2–4 người chung mỏ; luật thuần ở `shared/games/dao-vang/logic.js` |
| Bầu cua | `/bau-cua/` | 2–10 người đặt xu ảo, máy làm cái (mặc định) hoặc xoay vòng |
| Cờ caro | `/co-caro/` | 1v1 hoặc với máy, người khác xem; XO 3×3; luật chặn 2 đầu tuỳ chọn |
| Ô ăn quan | `/o-an-quan/` | 2–5 người (3+ người: bàn đa giác, đi vòng), thiếu người thì máy (3 mức) vào chơi, người khác xem; quan non tuỳ chọn, vay dân khi hết quân |
| Nối 4 | `/noi-4/` | Connect 4: 1v1 hoặc với máy, người khác xem |
| Bắn tàu | `/ban-tau/` | Battleship: 1v1 hoặc với máy; tàu chỉ gửi cho chủ hạm đội |
| Cờ tướng | `/co-tuong/` | Đủ luật (cản mắt / cản chân, pháo cách ngòi, lộ mặt tướng, không tự chiếu); 1v1 hoặc với máy (alpha-beta + tìm yên, có hạn giờ), người khác xem |
| Cờ gánh | `/co-ganh/` | Cờ dân gian 5×5: gánh (đi vào giữa 2 quân địch), vây và mở (bắt buộc vào gánh); 1v1 hoặc với máy (3 mức), người khác xem |
| Dò mìn | `/do-min/` | Nhiều người: chơi chung một bàn (3 mạng, thấy chuột, ping) hoặc đua cùng đề; mìn chỉ ở server |
| Sói | `/soi/` | 3–12 người, chia vai bí mật và lật bài. Cách chơi nhúng [video Bắt Sói 1:12:33–1:13:24](https://www.youtube.com/watch?v=Mzjtwf0FbW0&t=4353s), không tự phát, dừng khi đóng hướng dẫn; có luật chữ song ngữ. Nháy mắt, loại dân, đoán Sói và ghi điểm thực hiện trực tiếp, web chưa tự xử lý. Hướng dẫn tự mở lần đầu, mở lại bằng Cách chơi. |
| Ai là gián điệp | `/gian-diep/` | 3–20 người; chuyền một thiết bị hoặc vào phòng riêng, bỏ phiếu kín và Mũ Trắng. [Luật, UI kit và kiểm thử](gian-diep.md). |
| Lô tô | `/loto/` | 1–12 người, lô tô hội chợ: tờ dò 9×9 (3 khối, mỗi hàng 5 số, cột theo chục, có màu; chỉ chủ tờ thấy, không trùng tờ nào trong phòng); đầu ván mua 1–6 tờ theo màu, đổi tờ khác (tab / vuốt giữa các tờ); chủ phòng bắt đầu hô rồi server tự hô 3/5/8 giây (alarm, tắt được), bảng 90 số đã hô; tự dò hoặc bật "Tự dò"; hàng thiếu 1 số hiện CHỜ; số mới hiện bóng số to + câu vè, đọc số bằng giọng của máy (Tiếng Việt / English / tắt, Web Speech); bấm KINH, server kiểm số đã hô — sai là "kinh láo": phạt trong game (khoá KINH 30s, mất 1 hạt, đóng băng Tự dò, nhãn "Kinh láo", chờ 3 số) và/hoặc vòng quay phạt vui (chủ phòng chọn kiểu phạt, sửa danh sách); kinh cùng lúc thì chia giải; vào giữa ván vẫn có tờ |
| 2048 | `/2048/` | 1 người, chạy hết ở client: phím mũi tên / vuốt / phím trên màn; bảng xếp hạng tên + điểm (top 10, `/api/board?game=2048`) |
| Xếp gạch | `/tetris/` | 1 người, chạy hết ở client: phím / vuốt / chạm / 4 nút; tạm dừng (P); kỷ lục lưu trên máy |
| Sudoku | `/sudoku/` | 1 người, chạy hết ở client: 3 mức, ghi chú bút chì (N), 3 gợi ý, đồng hồ + tạm dừng, kỷ lục thời gian theo mức lưu trên máy |

Kiểm tra nhiều người qua WebSocket thật (bot chơi từng game): `node scripts/smoke.mjs [url] [game ...]`, mặc định `http://localhost:8789` (`wrangler dev --port 8789`). Chạy trước / sau mỗi bước refactor (kế hoạch: `hexagon-plan.md`). CI (`.github/workflows/ci.yml`, job `smoke-prod`) tự chạy vào web thật sau mỗi lần deploy (chờ `/api/version` mới hơn commit); bot smoke (id `smoke-...`) không lên bảng xếp hạng.

`pnpm e2e` chạy đồng thời tối đa 3 game WebSocket và 1 trang browser, ưu tiên game chậm trước. PR chọn game theo diff qua `e2e/selection.mjs` và dùng smoke nhanh (nước đi được server xác nhận, không chờ kết thúc game dài); code chung/file lạ/diff lỗi kiểm mọi game ở chế độ nhanh. `main` và production giữ toàn bộ bài kiểm tra hết ván, không giảm timeout. API chung, hub và sảnh luôn được kiểm.
Sảnh `/phong/` được kiểm trong trang browser riêng, không dùng response `/api/rooms` từ polling của hub trước khi chuyển trang.

Local mặc định full: `pnpm e2e`; thử PR nhanh: `E2E_SMOKE_MODE=fast pnpm e2e`. Kiểm riêng trang: `E2E_BASE_URL=http://localhost:8789 node e2e/readonly-smoke.mjs /soi/ /gian-diep/`. CI cache pnpm và Chromium theo OS/kiến trúc/phiên bản; cache hit vẫn cài thư viện hệ thống cần thiết.

`pnpm e2e` còn chơi trọn một ván Cờ caro 3×3 với máy bằng thao tác UI trong context mới. Kết quả hiển thị, bàn cờ, lịch sử khách và từng nước đi trong replay phải khớp cùng ID ván; không chấp nhận hết giờ thay cho kết thúc ván. Bài kiểm tra chỉ cho phép server loopback, không ghi production. Có thể chạy riêng khi dev server đang mở: `E2E_BASE_URL=http://127.0.0.1:8789 node e2e/round-evidence.mjs`.

CI lưu artifact `e2e-videos-<SHA>` trong 14 ngày, kể cả khi test lỗi. Thư mục `readonly/` chứa video mở trang, đóng/mở hướng dẫn, hub và sảnh; đây không phải video chơi hết mọi game. File `co-caro-3x3-bot-round-<ID>.webm` và ảnh cùng tên là bằng chứng ván UI hoàn chỉnh. Quay local: `pnpm exec playwright-core install ffmpeg`, rồi `E2E_VIDEO_DIR=e2e-videos pnpm e2e`. Không đặt biến này thì chỉ lưu ảnh kết quả/lỗi ván UI vào `e2e-artifacts/`, không quay video.

`pnpm test:coverage` gộp coverage Istanbul của unit/integration test và browser thật, rồi yêu cầu **100% statements, branches, functions, lines**. Phạm vi gồm toàn bộ JavaScript trong `backend/src/`, `frontend/src/`, `shared/` và script nội tuyến trong HTML (tách vào `.coverage-sources/` khi đo); file chưa chạy vẫn có trong mẫu số, không loại vendor/QR hay nhánh lỗi. Báo cáo HTML/LCOV/JSON ở `coverage/`, artifact CI `coverage-<SHA>`. Context coverage dùng fixture HTTP/WebSocket tại biên I/O để kiểm render, quyền và tương tác; không thay thế bài Cờ caro dùng server, lịch sử và replay thật. Mã đo chỉ thêm vào `dist/` khi `E2E_COVERAGE=1`, build thường không có instrumentation. Chạy test trước khi mở dev server: test kiến trúc dựng lại `dist/`, nên server đang mở có thể giữ manifest asset cũ.

Thêm game mới: tạo `frontend/src/<ten-game>/`, thêm thẻ vào `index.html`, thêm file vào `CORE` trong `frontend/src/sw.js` (và tăng `CACHE`), test vào `<ten-game>.test.mjs` rồi import ở cuối `logic.test.mjs`.

Song ngữ vi / en (mặc định vi): `frontend/src/i18n.js`. JS viết cặp ngay tại chỗ `t('Tạo phòng', 'Create room')`; HTML tĩnh dùng `data-en` / `data-en-html` / `data-en-title` / `data-en-placeholder`; chữ server gửi cho người chơi (lỗi, tiêu đề kết quả) là cặp `['vi', 'en']`, client hiện bằng `tx()`. Chọn ngôn ngữ trong **Cài đặt** ở đáy sidebar (`setLang()`) hoặc `?lang=en`, nhớ trong localStorage `lang` cho mọi game. Dữ liệu dùng chung server + test (tên con vật, cấp độ, đồ trong tiệm...) giữ tiếng Việt, dịch lúc hiện.

Giao diện dùng token dark của [ui-kit](https://github.com/nguyenhuy158/ui-kit/blob/978ff7c2444e094342b5005e5a6879c2bae34c9b/src/styles/tokens.css) trong `frontend/src/ui-kit.css`, cùng primitive DOM chính thức trong `frontend/src/ui/feedback.mjs` và `feedback.css`. Giữ CSS/JS thuần, không thêm React/Tailwind; build chỉ ghép static assets; bàn game, LCD và skin giữ màu riêng. Mọi game dùng chung `notifications.show(TOAST_TONE.SUCCESS, message)` từ `frontend/src/ui/notifications.js`; icon dùng Lucide (`frontend/src/icons.js`, sinh bởi `pnpm icons`). [Chi tiết tích hợp DOM và ngoại lệ React](gian-diep.md#ui-kit).

Tên khách: lần đầu bốc ngẫu nhiên "con vật + tính cách" (`frontend/src/names.js`, vd "Mèo Lười", 900 kiểu), dùng chung mọi game. Server chống trùng trong phòng: tên đã có thì thêm số ("Mèo Lười 2", `backend/src/domain/names.js`).

Mời bạn: nút mã phòng mở hộp **QR** (`frontend/src/invite.js`, lib [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) MIT chép ở `frontend/src/vendor/`) — quét bằng camera là vào phòng; kèm sao chép / chia sẻ link.

## Tài khoản & lịch sử

- Không đăng nhập vẫn chơi bình thường; trình duyệt nhận mã khách riêng bằng cookie bảo mật và lưu lịch sử trên server theo mã đó.
- Đăng nhập Google sau khi chơi sẽ chuyển lịch sử khách trên trình duyệt đó vào tài khoản, giữ nguyên lịch sử đã có. Lịch sử ván cũ chưa từng lưu không thể khôi phục.
- Cookie khách bị xóa/đổi hoặc dùng trình duyệt khác thì lịch sử khách không đi theo; đăng xuất tạo phiên khách mới.
- Lịch sử nhiều người và thống kê: bảng `plays` trong DO `Top`; lịch sử cá nhân solo do client gửi `POST /api/me/history` (tự báo nên chỉ là lịch sử cá nhân).
- `GET /api/me` (tài khoản/thống kê), `GET /api/me/history` (30 ván gần nhất), `POST /api/me/history/claim` (chuyển lịch sử khách sau đăng nhập). Trang chủ hiển thị lịch sử và thống kê.
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

- `frontend/src/pikachu/` — client tĩnh, ghép vào `dist/` khi build. `shared/games/pikachu/logic.js` là luật chơi (tìm đường, trượt ô) dùng chung client + server.
- `backend/src/index.js` — chỉ nối dây: Worker = `backend/src/adapters/http.js` (router `/api/*`, nối WebSocket vào DO kèm header tin cậy); DO `Top` = `backend/src/adapters/top.js` (bảng xếp hạng, lịch sử, phòng công khai; SQLite trong DO vì gói free đã hết quota D1; hạng mục bảng vui là mảng `FUN`); mỗi class phòng = `gameRoom({...})`. Mọi phòng (kể cả Pikachu, Đào Vàng, Dò mìn) chạy trên adapter; luật mỗi game ở `backend/src/application/games/<game>.js`. Phía client mọi game nối phòng qua `frontend/src/room-client.js` (tự nối lại, mở ở tab khác thì tab cũ rời phòng).
- Mô hình "bàn chơi" (unit): coop = 1 unit, race = 1 unit/người, team = unit A/B. Màn, đồng hồ, combo, lượt xáo nằm trên unit nên mọi luật viết một lần cho cả 3 chế độ.
- Icon: lucide, trích riêng icon cần dùng vào `frontend/src/icons.js` bằng `pnpm icons` (sửa danh sách trong `scripts/icons.mjs`).
- Ảnh sinh bằng Chrome headless: `node scripts/render-assets.mjs` (sprite động vật + icon PWA), rồi commit PNG.

## Đào Vàng

- Canvas 640x480 logic, co giãn theo màn hình. Assets (atlas, nền, âm thanh) lấy từ daovangcodien.com cho mục đích học tập; bản gốc để tham khảo nằm ở `reference/dao-vang/` (không commit).
- Móc lắc qua lại, bấm để thả; vật càng nặng kéo càng chậm. 60 giây/màn, đủ tiền mục tiêu (cộng dồn) mới qua màn, giữa các màn có tiệm (thuốc nổ, tăng lực, cỏ 4 lá, sách đá, nước đánh bóng).
- **Nhiều người** (`backend/src/application/games/dao-vang.js`, DO `MinerRoom`, WebSocket `/api/dv/room/CODE`): 2–4 thợ mỏ đứng cạnh nhau, chung một mỏ, ai móc trúng trước được. **Chung mỏ** = quỹ chung, mục tiêu x(1 + 0.6·(n−1)), thua khi thiếu tiền; **Tranh vàng** = ví riêng, 5 màn, nhiều tiền nhất thắng. Tiệm giữa màn 20 giây hoặc khi mọi người sẵn sàng. Người vào giữa ván được xem.
- Server chạy vật lý thật 20 lần/giây bằng **cùng hàm `step()`** với bản 1 người; client chỉ gửi `shoot`/`dyn` và vẽ theo snapshot (nội suy trễ 100 ms). Chuột chạy theo hàm của thời gian nên client tự tính vị trí, snapshot chỉ cần trạng thái móc.

## Dò mìn

- `backend/src/application/games/do-min.js` (DO `MineRoom`, WebSocket `/api/ms/room/CODE`), luật ở `shared/games/do-min/logic.js`.
- Vị trí mìn **chỉ ở server**; client nhận ô đã mở. Đua cùng đề thì mỗi người chỉ nhận bàn của mình (thấy bàn đối thủ là chép được ô an toàn) — khung người chơi chỉ hiện % tiến độ. Hết ván mới lộ hết mìn.
- Xuất phát: server chọn 1 ô, rải mìn chừa 3x3 quanh nó rồi mở sẵn cho mọi bàn (không ai đạp mìn nước đầu, đua công bằng).
- 3 giao diện (riêng từng máy, lưu `ms.skin`): Hiện đại, **Windows XP**, **Socola** — ảnh từ [MS-Texture](https://github.com/Minesweeper-World/MS-Texture) (MIT, `public/do-min/skins/LICENSE`), có mặt cười + đồng hồ LED. Socola thu nhỏ còn 96px (`sips -Z 96`).
- Chung: 3 mạng cả đội. Đua: đạp mìn +10 giây, ai mở hết trước thắng. Lịch sử lưu thời gian (giây); bảng vui có "💣 Thánh dò mìn" (thắng nhanh nhất).
- Chơi một mình: bấm mặt cười lúc nào cũng làm lại ván mới (tin `{ t: 'restart' }`, server chỉ nhận khi phòng có đúng 1 người chơi).

## Bầu cua

- `backend/src/application/games/bau-cua.js` (module trong adapter phòng chung, DO `DiceRoom`, WebSocket `/api/bc/room/CODE`), luật ở `shared/games/bau-cua/logic.js`.
- Mỗi người 1000 xu ảo/phòng, phỉnh 10/50/100/500. Ra k mặt ăn x·k, không ra mất x; cái chung/nhận phần ngược lại (xu cái có thể âm).
- Mặc định **máy làm cái** (ai cũng đặt, chủ phòng mở bát). Chủ phòng đổi sang **xoay cái** lúc nào cũng được khi đang đặt cược (cái mới được trả lại cược); ở một mình thì luôn là máy. Cái ngồi im quá 30 giây thì ai cũng mở bát được.
- Xúc xắc chỉ tung (crypto) lúc mở bát, sau khi cược đã khoá → không có gì để gian lận. Client lắc bát 2,5 giây rồi mới lật; xu hiển thị giữ số cũ tới lúc lật.
- Hình 6 con (`public/bau-cua/assets/*.webp`, 256px, ~14KB/hình) cắt tròn từ ảnh chụp tờ bầu cua in dân gian trong [bài của Bách Hóa Xanh](https://www.bachhoaxanh.com/kinh-nghiem-hay/luat-choi-bau-cua-tom-ca-huong-dan-toan-tap-tu-a-z-cho-nguoi-moi-1589468) (mục đích học tập); ảnh gốc ở `reference/bau-cua/` (không commit). Cắt bằng canvas trong Chrome headless rồi `cwebp -q 85`.
- Hết xu được cứu trợ 500 (không tính vào lãi). Lãi/lỗ cả buổi ghi vào lịch sử khi rời phòng (người đã đăng nhập); bảng vui có "🦀 Đại gia Bầu cua" (tổng lãi).

## Cờ caro

- `backend/src/application/games/caro.js` (module trong adapter phòng chung, DO `CaroRoom`, WebSocket `/api/cc/room/CODE`), luật + máy đánh ở `shared/games/co-caro/logic.js`.
- Bàn 15×15 / 19×19 nối 5 là thắng, hoặc **XO 3×3** (tic-tac-toe) nối 3 — máy dùng minimax cả cây nên không bao giờ thua (đánh đúng thì hoà). Luật **chặn 2 đầu** (tuỳ chọn): 5 quân bị quân đối phương chặn cả 2 đầu thì không tính; mép bàn không tính là chặn.
- 2 người vào đầu cầm X / O (X đi trước), còn lại xem + thả cảm xúc. Một mình thì đánh với máy (heuristic chấm điểm 1 nước: tấn công ×1.1 + phòng thủ). Ván mới đổi người đi trước; tỉ số tính theo cặp đấu.
- Mỗi nước 30 giây, hết giờ thua (server hẹn giờ; `tick()` kiểm lại nếu DO bị tắt). Lịch sử lưu số nước; bảng vui có "Kỳ thủ caro" (số ván thắng người thật).

## Nối 4 & Bắn tàu

Làm theo lối chơi của papergames.io (tham khảo cách bố trí / luật để học), hình vẽ tự làm bằng CSS + logo trong `scripts/logos.mjs`, không lấy ảnh của họ.

- **Nối 4** (`frontend/src/noi-4/`): dùng chung DO `CaroRoom` với caro — bảng `RULES` trong `backend/src/application/games/caro.js` giữ phần khác nhau (cỡ bàn, nước đi hợp lệ, thắng, máy). Worker gửi `/api/c4/room/CODE` tới id `c4:CODE` kèm header `X-Game: c4`. Bàn 7×6, bấm ô nào trong cột là thả vào cột đó; máy dùng negamax alpha-beta 4 tầng (~2.5 ms/nước).
- **Ô ăn quan** (`frontend/src/o-an-quan/`): luật + máy (minimax) ở `logic.js`, server là module `backend/src/application/games/o-an-quan.js` chạy trong DO `NokiaRoom` (`/api/nk/o-an-quan/room/CODE`), giao diện DOM qua `nokiaApp({ mount, render })` thay cho LCD. Mỗi nước server gửi kèm các bước rải (`last.steps`) để client diễn lại từng viên; hạn giờ cộng thêm thời gian diễn.
- **Bắn tàu** (`backend/src/application/games/ban-tau.js`, DO `ShipRoom`, `/api/bt/room/CODE`, luật ở `shared/games/ban-tau/logic.js`): biển 10×10, tàu 5-4-3-3-2 không chạm nhau. Xếp ngẫu nhiên (*Xếp lại*) hoặc tự xếp — chạm tàu để chọn, chạm ô trống để dời, chạm lại / *Xoay* để đổi chiều; server kiểm lại bằng `validFleet` (60 giây) → cả hai *Sẵn sàng* → bắn luân phiên, trúng được bắn tiếp; chìm tàu thì tự đánh dấu các ô xung quanh. Server gửi mỗi người một bản state: chỉ thấy hạm đội của mình tới khi hết ván. Hết 30 giây thì bắn giùm 1 phát ngẫu nhiên, 3 lượt liền như vậy thì thua. Máy: săn quanh ô trúng, không có thì bắn ô "bàn cờ" ngẫu nhiên. Dưới mỗi biển có hàng tàu (chìm thì mờ) — server gửi `sunk` theo thứ tự FLEET, không lộ vị trí.
- Bảng vui: "Vua Nối 4" (ván thắng người thật), "Xạ thủ Bắn tàu" (thắng bằng ít phát nhất).

## Góc Nokia

Game điện thoại Nokia ngày xưa ở `/nokia/<game>/`: **Rắn săn mồi** (snake), **Bantumi**, **Lật hình** (pairs), **Logic**, **Rapid Roll**, **Space Impact**, **Bounce**. Hình pixel tự vẽ, không dùng ảnh của Nokia.

- Kiến trúc hexagonal (`hexagon-plan.md`): luật thuần (domain) ở `shared/games/<game>/logic.js`; module game (application) ở `backend/src/application/games/<game>.js` (`start` / `msg` / `tick` / `view`, hợp đồng trong `backend/src/ports.js`, mọi I/O qua `ctx`: `now`, `rand`, `wakeAt`, `end`, `send`); adapter phòng chung `backend/src/adapters/game-room.js` (Durable Object + WebSocket: người chơi, chủ phòng, sảnh chờ, view riêng từng người, lưu, hẹn giờ bằng alarm, lịch sử, phòng công khai). `scripts/check-deps.mjs` (chạy trong test) chặn import sai chiều.
- DO `NokiaRoom` = `gameRoom({ snake, bantumi, ... })` ở `backend/src/index.js`, WebSocket `/api/nk/<game>/room/CODE`, mỗi phòng là DO tên `<game>:<CODE>`; Worker gửi kèm header tin cậy `X-Game` / `X-Room` / `X-User`.
- Phòng công khai: chủ phòng gửi `{ t: 'public', on }`, state có `pub`; phòng báo lên DO `Top` (`roomUpsert` / `roomDrop`, mỗi 30s bằng alarm), `GET /api/rooms` trả phòng còn sống trong 90s (trang `/phong/`).
- Client chung `frontend/src/nokia/room.js` (trang vào phòng, mời QR, sảnh chờ, kết quả) + `frontend/src/nokia/lcd.js`: LCD 84×48 hai màu, font pixel 3×5 tự vẽ, bàn phím 2/4/5/6/8 (bàn phím thật, WASD, mũi tên, nút trên màn — giữ được), tiếng bíp WebAudio.
- Snake: server bước theo tốc độ (5 cấp), có / không tường, 1–4 con; con sống cuối cùng thắng. Bantumi: luật Kalah, máy minimax alpha-beta. Lật hình: 6×4 lá, hình lá úp chỉ ở server. Logic: mọi người đoán cùng một mã (chỉ ở server), 10 lượt / 5 phút.
- Snake: kỷ lục của máy (`localStorage` `nk.best.snake`) hiện mờ cạnh điểm trên LCD và ở sảnh chờ.
- Rapid Roll + Bounce: "đua cùng đề" (`backend/src/application/games/race.js`) — server phát hạt giống / màn + giờ xuất phát, máy mỗi người tự chạy mô phỏng (`shared/games/nokia/<game>/logic.js`), gửi vị trí 5 lần/giây để người khác thấy bóng mờ. Bounce có 3 màn dựng bằng hàm `build()`; sửa màn xong chạy `node scripts/bounce-solve.mjs` (beam search trên chính mô phỏng) để chắc còn qua được.
- Rapid Roll dừng vòng mô phỏng bù frame ngay khi hết mạng; gửi kết quả một lần, không lặp vô hạn khi tab bị trễ. `node rapid-roll-frame.test.mjs` kiểm callback vẽ với vật lý thật và frame bị trễ; `RAPID_ROLL_FRAME_REVISION=origin/main` chỉ dùng khi đối chiếu một bản trước sửa còn lỗi.
- Space Impact: server chạy thế giới 20 lần/giây, client chỉ gửi phím đang giữ; tàu của mình được đoán trước theo phím cho đỡ trễ. 3 màn, mỗi màn một trùm.
- Logo: `node scripts/nokia-logos.mjs`.
- Lô tô (`/loto/`) dùng chung khung `frontend/src/nokia/room.js` (chế độ `mount` / `render`, không có LCD) và DO `NokiaRoom` (`/api/nk/loto/room/CODE`); module `backend/src/application/games/loto.js`, luật ở `shared/games/loto/logic.js`.

## Ảnh chụp màn hình

[`screenshots/`](../screenshots/README.md): mỗi game một thư mục, trong đó mỗi thiết bị một thư mục con (desktop / tablet / phone / iPhone dọc, ngang). README trong đó có ảnh nhỏ để xem nhanh; chụp lại xong chạy `node scripts/screenshots-readme.mjs`.

## Chạy

```bash
pnpm install
pnpm dev     # http://localhost:8787
pnpm test    # node logic.test.mjs
```

**Deploy:** push lên `main` → Cloudflare Workers Builds tự chạy `node logic.test.mjs` rồi `pnpm exec wrangler deploy`.

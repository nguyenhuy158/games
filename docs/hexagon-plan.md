# Kế hoạch refactor: kiến trúc hexagonal (ports & adapters)

## Hiện trạng

- **Domain đã có sẵn:** luật 15 game là hàm thuần ở `public/<game>/logic.js` (không I/O), dùng chung server + client + test.
- **Trùng lặp lớn nhất ở "phòng chơi":** 7 class Durable Object (`Room`, `MinerRoom`, `MineRoom`, `DiceRoom`, `CaroRoom`, `ShipRoom`, `NokiaRoom`)
  mỗi class tự viết lại ~80–120 dòng hạ tầng: nhận WebSocket, định danh thiết bị, chống trùng tên, X-User, online / chủ phòng,
  broadcast, lưu trạng thái, hẹn giờ, ghi kết quả vào bảng xếp hạng.
- **Mẫu hexagon nhỏ đã có:** `NokiaRoom` = adapter chung; mỗi game là module `{max, cfg, config, start, msg, tick, view, leave}`
  nhận `ctx` (`now`, `rand`, `end`, `send`…) nên không đụng I/O.
- **`worker/index.js` (572 dòng)** gộp 4 việc: router HTTP, SSO, DO bảng xếp hạng `Top` (SQLite) và phòng Pikachu.
- **Client:** mỗi game tự viết kết nối / nối lại / vào-rời phòng; chỉ Nokia + Ô ăn quan dùng chung `public/nokia/room.js`.

=> Hướng đi: đưa mọi phòng về mẫu `NokiaRoom`, không làm hexagon "sách giáo khoa" (không interface / class / DI container cho từng port).

## Cấu trúc đích

```
public/<game>/logic.js        DOMAIN: luật thuần. Giữ nguyên chỗ (client phải tải được -> nằm trong public/)
worker/
  games/<game>.js             APPLICATION: module game, chỉ import domain, mọi I/O qua ctx
  ports.js                    JSDoc typedef: GameModule, Ctx { now, rand, end, send, sendAll, wakeAt, name, online }, Recorder, Identity
  adapters/
    game-room.js              DO chung: WebSocket hibernation, online, chủ phòng, lưu, hẹn giờ (interval hoặc alarm),
                              view riêng từng người, người xem, emote, ghi kết quả qua Recorder
    top.js                    DO Top (SQLite): addPlays / stats / history / fun / list — giữ nguyên schema
    http.js                   router /api/*, gắn X-User, chuyển domain cũ
    sso.js                    kiểm tra JWT (file hiện có)
  index.js                    chỉ nối dây: export default http;
                              export class CaroRoom extends gameRoom({ caro, c4 }) {} … (giữ nguyên tên class)
public/room-client.js         ADAPTER CLIENT: kết nối, nối lại, lệch giờ, vào / rời phòng, lỗi server qua tx()
                              (tách phần mạng khỏi public/nokia/room.js; khung giao diện Nokia vẫn ở nokia/)
```

**Chiều phụ thuộc:** domain không import gì → application chỉ import domain → adapter import application.
Kiểm bằng `scripts/check-deps.mjs` (đọc dòng import), gọi trong `logic.test.mjs` nên build Cloudflare fail nếu có file import sai chiều.

**Không đổi:** URL `/api/...`, tên class DO (không cần migration mới), schema SQLite bảng xếp hạng. Không thêm thư viện, không TypeScript.

## Giai đoạn (mỗi giai đoạn = 1 commit, test xanh, deploy được)

Tiến độ: 0 xong (`scripts/smoke.mjs`) · 1 xong (`worker/adapters/game-room.js`, `worker/ports.js`, `worker/games/*`, `scripts/check-deps.mjs`, phòng công khai) · 2 xong (Caro + Nối 4, Bắn tàu, Bầu cua chạy trên adapter; giữ nguyên giao thức client) · 3 xong (`adapters/http.js`, `adapters/top.js` + mảng `FUN`, `worker/pikachu.js`; `index.js` chỉ nối dây) · 4a xong (Dò mìn = `worker/games/do-min.js`; adapter thêm hook `hello` gửi bàn riêng khi vào / vào lại)

| # | Việc | File | Rủi ro |
|---|---|---|---|
| 0 | Lưới an toàn: `scripts/smoke.mjs <url>` (bot WebSocket chơi 1 ván với máy + 1 ván 2 người mỗi game); test mức module cho game chưa có | scripts, *.test.mjs | thấp |
| 1 | Tách `worker/nokia.js` → `adapters/game-room.js` + `ports.js`; thêm `ctx.wakeAt(ms)` dùng alarm (game theo lượt khỏi giữ `setInterval`, DO được ngủ) | worker/nokia* | thấp |
| 2 | Game theo lượt thành module: Cờ caro + Nối 4, Bắn tàu, Bầu cua (adapter thêm người xem, emote, view ẩn thông tin) | worker/co-caro, ban-tau, bau-cua | trung bình |
| 3 | Tách `index.js` → `http.js` + `top.js`; danh sách hạng mục bảng xếp hạng vui thành cấu hình | worker/index.js | thấp |
| 4 | Game thời gian thực: Dò mìn, Đào Vàng, Pikachu (~360 dòng, lớn nhất) | worker/do-min, dao-vang, index | cao |
| 5 | Client dùng `room-client.js` cho các game còn tự viết kết nối (Bầu cua, Caro, Nối 4, Bắn tàu, Dò mìn, Đào Vàng, Pikachu) | public/*/game.js | trung bình |

Ước tính bỏ ~600–900 dòng hạ tầng lặp. Thêm game mới sau đó chỉ cần `logic.js` + `worker/games/<x>.js` + giao diện.

## Rủi ro & cách giữ

- **Phòng đang chơi lúc deploy:** phòng là trạng thái tạm (hết người là xoá); adapter bỏ qua trạng thái cũ không đọc được (như `NokiaRoom`) → tệ nhất phòng đang chơi bị reset.
- **Đổi hành vi âm thầm:** chạy `scripts/smoke.mjs` trên local + prod trước / sau mỗi giai đoạn.
- **Hai phiên cùng sửa:** báo trước khi đụng file của phiên kia (`co-caro.js`, `ban-tau.js`, `noi-4/`…); chỉ stage file của mình.

## Đề xuất

Làm 0 → 1 → 2 → 3 (lợi nhiều, rủi ro thấp). Giai đoạn 4 chỉ khi sắp sửa nhiều Pikachu / Đào Vàng / Dò mìn.
Giai đoạn 5 làm được ngay (giao diện Nokia mới đã xong ở `c8b518f`).

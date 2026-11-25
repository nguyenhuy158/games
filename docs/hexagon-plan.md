# Kiến trúc frontend/backend và hexagonal

## Cấu trúc hiện tại

Theo layout của [kit v0.5.0](https://github.com/nguyenhuy158/kit/blob/v0.5.0/docs/AGENTS-SKELETON.md):

```text
index.html                         Trang chủ
frontend/src/                      HTML, CSS, ES modules của trình duyệt
  <game>/                          Giao diện từng game
  ui/                              DOM primitives từ ui-kit và notifications
  room-client.js                   Adapter WebSocket phía client
backend/src/
  index.js                         Composition root: nối adapter với game, export DO
  ports.js                         Hợp đồng GameModule, Ctx, Recorder, Identity
  domain/names.js                   Luật chống trùng tên trong phòng
  application/games/               Điều phối từng game qua ctx
  application/spy-ai.js            Dịch vụ bộ từ AI, nhận storage/provider
  adapters/                        HTTP, SSO, guest, Durable Object, SQLite, WebSocket
shared/
  games/<game>/logic.js             Luật dùng chung client/server/test
  games/nokia/<game>/logic.js       Luật các game Nokia
  tape.js                          Bản ghi replay dùng chung
public/                            Ảnh, âm thanh, logo, manifest và giấy phép
scripts/build-assets.mjs            Ghép static assets vào dist/
dist/                              Đầu ra sinh tự động, không commit
```

## Ranh giới phụ thuộc

- `shared` chỉ import `shared`; không phụ thuộc trình duyệt, Node, Cloudflare hay network/storage.
- Backend domain chỉ dùng domain/shared. Application chỉ dùng application/domain/shared và hợp đồng ports; I/O của game qua `ctx`.
- Adapter dùng application/domain/shared và hạ tầng, không import composition root hoặc frontend.
- `backend/src/index.js` nối các lớp. Frontend chỉ dùng frontend/shared, không import backend.
- `scripts/check-deps.mjs` phân tích AST bằng Acorn: import tĩnh/động, re-export, script HTML, module thiếu và các global runtime bị cấm trong shared. `architecture.test.mjs` kiểm các chiều phụ thuộc sai.

Đây là hexagonal thực dụng, không DI container hay interface cho từng hàm. `shared` độc lập runtime, không đồng nghĩa thuần toán học: replay và deadline tìm kiếm Cờ tướng vẫn dùng `Date.now()`, nhiều hàm giữ RNG mặc định `Math.random()`. Refactor không đổi đồng hồ hoặc thuật toán chơi.

Adapter `room-ai.js` giữ quyền truy cập DO namespace, kiểm quyền chủ phòng và cập nhật phòng sau khi tạo từ. Application `SpyAiService` nhận storage/provider từ adapter; không biết room Durable Object.

## Build và URL

`pnpm build` xóa đầu ra cũ trong `dist/`, chép `public/` và nội dung `frontend/src/` vào đó, thêm `index.html` gốc và `shared/`. Không bundler, React hay TypeScript. Wrangler chạy cùng build khi dev/deploy và theo dõi nguồn frontend/shared/static.

URL trang game và client vẫn như cũ (`/co-caro/`, `/co-caro/game.js`). Luật dùng chung được phục vụ tại `/shared/games/co-caro/logic.js`; replay tại `/shared/tape.js`. Import tương đối được dùng chung bởi Node test và trình duyệt. Service worker cache các URL đầu ra mới; không giữ bản sao luật ở đường dẫn cũ.

Không đổi `/api/*`, tên class/binding/namespace Durable Object, migration hay schema SQLite. `public/` không còn chứa mã nguồn ứng dụng; backend không được chép vào static assets.

## Kiểm thử và thêm game

- `pnpm test`: luật game, application/adapter, quyền/lịch sử/AI, ranh giới kiến trúc và service worker trên `dist/` thực sự được build.
- `node scripts/smoke.mjs <url>`: WebSocket thật, bot chơi và kiểm state server; CI chạy toàn bộ trên main/production.
- `pnpm e2e`: browser và WebSocket; PR chọn game từ cả frontend, backend, shared và public assets. Thay đổi code chung chạy toàn bộ.
- Game mới: thêm luật trong `shared/games/<game>/`, UI trong `frontend/src/<game>/`, module nhiều người trong `backend/src/application/games/` nếu cần; nối ở composition root.
- Thêm thẻ ở `index.html`, cập nhật `CORE` và tăng `CACHE` trong `frontend/src/sw.js`, thêm test hành vi và khai báo lựa chọn E2E.

# Game Cổ Điển

Bộ game cổ điển trên trình duyệt tại https://games.huyab.cfd. Chơi solo hoặc nhiều người, không bắt buộc đăng nhập. Tiếng Việt/English, PWA và lịch sử ván chơi.

## Chạy

Cần Make, Node >=22 và phiên bản pnpm ghi trong `package.json`.

```bash
make install
make dev
make test
make coverage
make lint
make build
```

`make dev` phục vụ tại http://localhost:8787. Build ghép HTML/CSS/ES modules và static assets vào `dist/`; Wrangler tự chạy build khi dev/deploy.

```bash
node tests/smoke.mjs http://localhost:8787
make e2e
```

## Cấu trúc

- `frontend/src/`: giao diện game và DOM primitives của ui-kit.
- `backend/src/`: composition root, application, domain và infrastructure adapters.
- `shared/`: luật game và replay dùng chung client/server/test.
- `public/`: ảnh, âm thanh, manifest, logo và giấy phép; `index.html` gốc là trang chủ.
- `tests/`: unit, E2E, smoke và công cụ coverage; các lệnh `pnpm test`, `pnpm e2e`, `pnpm test:coverage` giữ nguyên.

Theo layout của kit v0.5.0. Hexagonal giữ I/O trong adapter; game nhận các port qua `ctx`. Không chuyển sang React hay TypeScript, không đổi URL game/API hoặc dữ liệu Durable Object.

## Tài liệu

- [Kiến trúc, ranh giới phụ thuộc, build và thêm game](docs/hexagon-plan.md)
- [Danh sách game, luật chơi, tài khoản, i18n và kiểm thử](docs/games.md)
- [Gián điệp, AI và tích hợp ui-kit](docs/gian-diep.md)
- [Ảnh chụp màn hình](screenshots/README.md)

Deploy qua PR vào `main`; Cloudflare Workers Builds chạy test và Wrangler deploy. CI kiểm WebSocket và browser trên bản production mới.

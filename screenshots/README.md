# Ảnh chụp mobile + PC

Chụp 2026-09-28 bằng browser-use (Chrome CDP) trên `wrangler dev`, commit `55fef44`.

| Profile | Viewport CSS | DPR | Giả lập |
|---|---|---|---|
| `iphone14plus-portrait` | 428×926 | 3 | UA iOS 17 Safari, touch, `mobile=true` |
| `iphone14plus-landscape` | 926×428 | 3 | như trên, xoay ngang |
| `desktop-1440` | 1440×900 | 1 | UA Chrome macOS, chuột |

Tên file: `<profile>-<game>-<bước>[-<cỡ bàn>][-scrollN].webp` — bước `1-lobby`, `2-room`, `3-play`, `4-touch-*`. `-scrollN` là các màn khi trang dài hơn viewport. Ảnh WebP q72, iPhone thu về 1.5x.

## Kết quả

- Không trang nào tràn ngang (`scrollWidth - innerWidth = 0`) ở cả 3 profile.
- Chạm thật (`Input.dispatchTouchEvent`): caro chạm 1 ô → đặt X, máy đáp O (`iphone14plus-portrait-co-caro-4-touch-tap`); dò mìn giữ 0.8s → cắm cờ, mìn còn 10 → 9 (`iphone14plus-portrait-do-min-4-touch-longpress-flag`).
- Pikachu tự xoay bàn khi màn dọc; khung người chơi chuyển hàng trên khi dọc.

## Chỗ còn chưa ổn

- ~~Trang chủ, iPhone dọc: nút "Đăng nhập Google" đè lên tiêu đề~~ — đã sửa: màn ≤640px nút nằm hàng riêng (`iphone14plus-portrait-home-scroll1`).
- ~~Bầu cua, iPhone ngang: phải cuộn mới thấy Cá/Cua/Tôm, chip, Mở bát~~ — đã sửa: màn ngang thấp thì đĩa bên trái, bàn + phỉnh bên phải, vừa 1 màn (`iphone14plus-landscape-bau-cua-3-play`).
- Caro 19×19 trên iPhone dọc: ô 21px (dưới mức 44px Apple khuyên), dễ bấm nhầm.
- Nút giọt nước bên phải mọi ảnh là extension của trình duyệt, không phải của app.

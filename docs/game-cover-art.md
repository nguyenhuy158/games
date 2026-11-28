# Ảnh bìa game V2

Dùng prompt này trong Codex ImageGen. Thay `{SUBJECT}` bằng hình ảnh gợi đúng cơ chế hoặc chủ đề của game mới.

```text
Original game cover illustration for a Vietnamese classic games website.
Subject: {SUBJECT}.
Cute, polished 3D clay toy diorama, rounded tactile forms, soft studio
lighting and stylized shadows, saturated harmonious background with no clutter.
Wide landscape suitable for center 3:1 banner crop, place all important
objects in its middle horizontal third and favor a single focal point.
Full-bleed, no headings, no trademarks, no game screenshot, original design.
```

Ví dụ chủ đề Sói dùng trong bộ V2.

```text
Tiny friendly gray werewolf with big ears peeking out of a midnight blue
forest with warm lantern and full moon.
```

Đối chiếu phong cách với [Sói](../public/covers-v2/soi.webp) và [Cờ caro](../public/covers-v2/co-caro.webp).

1. Xuất WebP rộng 480 px, giữ tỷ lệ khung hình, mục tiêu khoảng 10 KB. Xem lại chất lượng sau nén.
2. Lưu tại `public/covers-v2/<game>.webp`. Dùng `data-preview-src="/covers-v2/<game>.webp"` trên `img.thumb-cover` trong thẻ `.thumb` để dùng lazy-load hiện tại. Tránh preload hoặc precache ảnh bìa.
3. Mở trang chủ local ở mobile và desktop với cache tắt. Kiểm tra ảnh đang thấy hiển thị và thẻ ngoài khung nhìn chỉ yêu cầu ảnh khi cuộn tới.

## Icon trên thẻ game

Dùng ảnh bìa V2 làm ảnh tham chiếu. Giữ chủ thể, chất liệu đất sét 3D và bảng màu của ảnh bìa. Dùng khung vuông, chủ thể lớn ở giữa, nền gọn và không thêm chữ. Kiểm tra hình ở cỡ 24 px và 32 px.

Xuất WebP vuông 96 px tại `public/card-icons-v2/<game>.webp`. Gắn vào `img.logo` trên thẻ tương ứng với `loading="lazy"`, `decoding="async"` và `alt=""`.

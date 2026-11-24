# Ai là gián điệp

Mở `/gian-diep/`, chọn **Chuyền một máy** hoặc **Mỗi người một máy**. Host cũng chơi; thẻ của host không có đặc quyền xem từ hay vai người khác. Thảo luận trực tiếp hoặc qua cuộc gọi riêng, không tích hợp thoại/chat.

## Luật

- 3–20 người, mặc định 1 gián điệp và 0 Mũ Trắng. Gián điệp tối đa lần lượt là 1/2/3/4/5/6/7 cho nhóm 3–4/5–6/7–9/10–12/13–15/16–18/19–20.
- Mũ Trắng tối đa 0 với 3–5 người, 1 với 6 người, 2 với 7–20 người. Tổng gián điệp + Mũ Trắng không quá `ceil(n / 3)` và phải còn ít nhất 2 dân thường. Cài đặt không hợp lệ chặn bắt đầu ở cả client và server.
- Dân nhận cùng một từ; gián điệp nhận từ liên quan khác và **không biết vai**; Mũ Trắng không nhận từ. Mỗi cặp từ được đảo ngẫu nhiên bên dân/gián điệp. Có ba gói từ tiếng Việt: Ẩm thực, Địa điểm, Đời sống.
- Phát thẻ trước, host mới bắt đầu đồng hồ mô tả 10/15 giây hoặc 5 giây chớp nhoáng. Mỗi người đưa một gợi ý, không đọc nguyên từ. Đổi người nói đầu tiên sau mỗi lượt loại.
- Sau thảo luận, host mở đếm ngược 3 giây. Mỗi người còn sống bỏ đúng một phiếu cho người khác, không sửa được. Chỉ chốt khi mọi người đã bỏ; không công bố người nào bầu ai.
- Hòa: những người hòa nói thêm gợi ý, host mở lượt bầu lại. Tất cả người còn sống bầu, nhưng chỉ được chọn trong nhóm hòa; có thể bầu lại nhiều lần.
- Host có thể loại trực tiếp sau khi bắt đầu mô tả, có hộp xác nhận. Host bị loại vẫn điều hành nhưng không bỏ phiếu.
- Mũ Trắng bị loại bằng phiếu hay trực tiếp đều được **một lần đoán** trước khi xét thắng thua. Đúng từ dân thì thắng một mình; sai tiếp tục. Bỏ qua dấu, hoa/thường và khoảng trắng thừa khi so đáp án; không chấp nhận từ đồng nghĩa.
- Dân thắng khi hết mọi vai ẩn; phe ẩn thắng khi chỉ còn một dân. Chỉ kết thúc mới công bố đầy đủ từ và vai.

Không bật biến thể hai gián điệp biết nhau vì trái với luật đã chốt: gián điệp không biết vai. Phiên bản viết có thể dùng giấy để mô tả; luồng bỏ phiếu không đổi. Không cần tài liệu in hay PDF.

## Riêng tư và kết nối

**Một máy:** nhập tên nhóm, lần lượt mở thẻ rồi ẩn trước khi chuyển máy; phiếu cũng chuyền từng người. Ván chỉ nằm trong bộ nhớ trang, tải lại hoặc rời trang sẽ mất ván. Đây là cơ chế riêng tư khi chuyền máy, không bảo vệ trước người dùng DevTools trên máy đó.

**Nhiều máy:** dùng phòng `NokiaRoom`, WebSocket `/api/nk/gian-diep/room/CODE`. Server lưu trạng thái qua mất kết nối, gửi mỗi người đúng thẻ của họ; người vào giữa ván chỉ xem. Cùng thiết bị vào lại bằng mã phòng để tiếp tục. Đợi người đang mất mạng quay lại bỏ phiếu/đoán, hoặc host loại trực tiếp khi luật cho phép. Không ghi replay chứa từ bí mật. Thẻ đang mở tự che khi chuyển tab, ẩn trang hoặc bấm Escape.

Luật dùng chung trong `public/gian-diep/logic.js`; server chỉ điều phối thời gian, quyền, kết quả và lưu trạng thái qua `worker/games/gian-diep.js`. Không thêm schema hay migration Durable Object.

## UI kit

Dùng đường tích hợp DOM tĩnh chính thức của [nguyenhuy158/ui-kit](https://github.com/nguyenhuy158/ui-kit), pin commit `978ff7c2444e094342b5005e5a6879c2bae34c9b`:

- `src/dom/feedback.mjs` và `feedback.css` → `public/gian-diep/ui-kit/`: nút, trạng thái chờ, khóa thao tác và toast.
- `src/styles/tokens.css` → cùng thư mục: giữ token, base CSS, màu sáng/tối và chuyển động; bỏ `@import tailwindcss`, `@custom-variant`, `@theme` vì trang không dùng build/Tailwind runtime.
- UI riêng dùng biến `--ui-*`, danh sách chia trang, khu vực chạm 44px và input 16px. Không tải CSS Nokia, React hay CDN runtime. Không lấy thay đổi chưa commit từ checkout UI kit.

Trang tải `public/ui-kit.css` dùng chung trước token sáng/tối của game. Icon dùng cùng Lucide 0.468.0 như UI kit qua `public/icons.js`; nút phụ dùng icon kèm nhãn truy cập, luật đầy đủ nằm trong Cách chơi.

## Kiểm thử

```sh
pnpm test
pnpm check
pnpm exec wrangler dev --ip 127.0.0.1 --port 8797
node scripts/smoke.mjs http://127.0.0.1:8797 gian-diep soi
```

`gian-diep.test.mjs` kiểm giới hạn mọi quy mô, phân vai, quyền, dữ liệu riêng, đồng hồ, hòa, lượt đoán và kết quả. Smoke WebSocket thật chơi sáu người: Mũ Trắng đoán sai, hòa và bầu lại dân thắng, ván tiếp Mũ Trắng đoán đúng thắng ngay. Chỉ chạy smoke tạo phòng trên local; production để CI post-deploy kiểm theo quy ước repo.

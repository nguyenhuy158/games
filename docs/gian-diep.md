# Ai là gián điệp

Mở `/gian-diep/`, chọn **Chuyền một máy** hoặc **Mỗi người một máy**. Host cũng chơi; thẻ của host không có đặc quyền xem từ hay vai người khác. Thảo luận trực tiếp hoặc qua cuộc gọi riêng, không tích hợp thoại/chat.

## Nhập nhóm và thứ tự

- **Một máy:** dùng ngay ba tên mẫu hoặc dán tối đa 20 tên, mỗi dòng một tên (hỗ trợ LF/CRLF). Mặc định **Thay cả nhóm · tên đầu làm chủ** để không phải xóa tên mẫu; sau khi nhập thành công chuyển sang **Thêm vào nhóm**. Enter áp dụng danh sách, Shift+Enter xuống dòng.
- Bấm tên để sửa ngay trên hàng; Enter lưu, Escape hủy. Tên trống, trùng (không phân biệt hoa/thường), dài hơn 20 ký tự hoặc nhóm quá 20 người đều bị từ chối và giữ nguyên bản nháp. Chia từ bị khóa khi chưa lưu tên hoặc nhóm chưa đủ 3–20 người.
- Mũi tên lên/xuống và **Xáo thứ tự** chỉ đổi thứ tự nhận thẻ/mô tả trước ván. ID người chơi và chủ phòng giữ nguyên khi sửa tên hoặc đổi chỗ. Không xóa trực tiếp chủ phòng; thay cả nhóm cần xác nhận rõ tên đầu tiên làm chủ mới.
- **Nhiều máy:** mỗi người tự nhập tên. Chỉ chủ phòng được đổi thứ tự tại sảnh; khách chỉ xem. `cfg.order` chứa ID, không sửa `room.order` hay quyền chủ phòng. Server kiểm tra cấu trúc và đối chiếu thành viên khi chia: bỏ ID đã rời, thêm người mới cuối danh sách, không bỏ sót hoặc nhân đôi người chơi.
- Danh sách cuộn bên trong, nút có nhãn truy cập và vùng chạm 44px. Không có nút sửa nhóm/đổi chỗ trong ván đang chơi.


## Luật

- 3–20 người, mặc định 1 gián điệp và 0 Mũ Trắng. Gián điệp tối đa lần lượt là 1/2/3/4/5/6/7 cho nhóm 3–4/5–6/7–9/10–12/13–15/16–18/19–20.
- Mũ Trắng tối đa 0 với 3–5 người, 1 với 6 người, 2 với 7–20 người. Tổng gián điệp + Mũ Trắng không quá `ceil(n / 3)` và phải còn ít nhất 2 dân thường. Cài đặt không hợp lệ chặn bắt đầu ở cả client và server.
- Dân nhận cùng một từ; gián điệp nhận từ liên quan khác và **không biết vai**; Mũ Trắng không nhận từ. Mỗi cặp từ được đảo ngẫu nhiên bên dân/gián điệp. Có 18 gói từ tiếng Việt để chọn trong Cài đặt ván, từ Ẩm thực và Đời sống đến Thể thao, Âm nhạc Việt và AI & công nghệ.
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

Luật dùng chung trong `shared/games/gian-diep/logic.js`; server điều phối thời gian, quyền, kết quả và lưu trạng thái qua `backend/src/application/games/gian-diep.js`.

## Bộ từ AI

Vào **Cài đặt → Tạo bộ từ AI**, nhập chủ đề tiếng Việt tối đa 100 ký tự hoặc chọn một trong 3–5 gợi ý AI. Sau khi tạo chỉ hiện chủ đề và số cặp từ, không có xem trước từ. Chọn lại bộ từ có sẵn nếu không muốn dùng AI; lỗi AI không tự thay bằng bộ từ cố định.

- **Một máy:** `POST /api/gian-diep/ai` với `{action:"generate",topic}` trả `{packId,title,count}`. Khi chia thẻ, `{action:"deal",packId}` chỉ trả một cặp ngẫu nhiên cho đúng chủ cookie đã tạo bộ từ. Trình duyệt giữ cặp vừa chia như chế độ một máy hiện có, không nhận toàn bộ bộ từ.
- **Nhiều máy:** thêm `room` (mã 4 ký tự) và `deviceId` vào yêu cầu tạo. Server kiểm tra chủ phòng đang trực tuyến, cookie trùng người chơi và phòng ở sảnh/đã kết thúc **trước** khi gọi AI; sau khi chờ AI còn kiểm tra lại chủ phòng, trạng thái, cấu hình và ván. Bộ từ nằm riêng trong `keep.aiPack`; WebSocket chỉ phát metadata `cfg.pack`, `cfg.aiPackId`, `cfg.aiTopic`. Endpoint chia cặp một máy không đọc được bộ từ phòng.
- Mọi yêu cầu phải là POST JSON cùng origin, body tối đa 2.048 byte. Owner là cookie bearer ngẫu nhiên 256-bit `__Host-games_guest` hiện có (`HttpOnly`, `Secure`, `SameSite=Lax`), **không phải cookie có chữ ký**. Không tin header `X-Guest` từ client; không gửi tên người chơi cho model.

### Provider và hạn mức

`wrangler.toml` thêm binding Workers AI `AI`, Durable Object `SPY_AI` (class `SpyAi`, singleton `global`) và migration SQLite **v9**, giữ nguyên v1–v8. Không cần API key, SDK hay secret mới. Model thật là [`@cf/meta/llama-3.3-70b-instruct-fp8-fast`](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/), dùng [JSON Schema mode](https://developers.cloudflare.com/workers-ai/features/json-mode/).

| Giới hạn | Giá trị |
| --- | --- |
| Lượt gọi provider | Tối đa **60/ngày UTC toàn ứng dụng**, **5/ngày UTC mỗi guest**; gợi ý chủ đề cũng tính lượt |
| Đầu ra | Yêu cầu 12 cặp, nhận tối thiểu 10 cặp hợp lệ; tối đa 1.400 token, hoặc 240 token cho gợi ý |
| Chờ provider | 20 giây; không tự retry, không hoàn lượt khi provider lỗi/đầu ra sai |
| Cache và bộ từ | 24 giờ từ lúc tạo thành công, chủ đề cùng tên sau chuẩn hóa dùng chung cache; đọc cache không tính lượt |
| Bộ từ một máy lưu đồng thời | Tối đa 1.000 grant chủ sở hữu trong 24 giờ |

DO nạp snapshot một lần rồi dùng bộ nhớ; reservation được ghi bền vững và tuần tự **trước** suy luận. Yêu cầu trùng chủ đề đang chờ được gộp thành một lần gọi. Sau DO reset, reservation chưa hoàn tất chặn gọi trùng tối đa 24 giờ; hạn mức không mất khi restart. Cache/grant được kiểm tra hạn bằng thời gian hiện tại mỗi lần dùng. Không giữ khóa chung của phòng trong lúc suy luận.

Model không được quyết định schema: server kiểm lại trường, kiểu, độ dài, ký tự Latin/Vietnamese, chuỗi đã chuẩn hóa và tính khác nhau; loại cặp trùng hoặc dùng lại từ, từ chối nếu còn dưới 10 cặp. Mỗi từ tối đa 48 ký tự; gợi ý tối đa 60. Không thể bảo đảm chất lượng ngữ nghĩa chỉ bằng schema, nên model còn nhận hướng dẫn danh từ tiếng Việt phổ biến, gần nghĩa và phù hợp gia đình.

Lỗi phân biệt `ai_unavailable`, `ai_quota`, `ai_invalid_topic`, `ai_invalid_output`, `ai_forbidden`, `ai_room_changed`, `ai_pack_expired`, `ai_invalid_request`; response lỗi có `error` và `msg` Việt/Anh. Bộ từ hết hạn phải tạo lại trước khi chia ván mới, không đổi từ của ván đang chơi.


## UI kit

Dùng đường tích hợp DOM tĩnh chính thức của [nguyenhuy158/ui-kit](https://github.com/nguyenhuy158/ui-kit), pin commit `978ff7c2444e094342b5005e5a6879c2bae34c9b`:

- `src/dom/feedback.mjs` và `feedback.css` → `frontend/src/ui/`: nút, trạng thái chờ, khóa thao tác và toast dùng chung toàn bộ game; không giữ bản sao riêng cho Gián điệp.
- `src/ui/Listbox.tsx` (React, chưa có bản `src/dom/`) → chép hành vi sang `frontend/src/ui/listbox.mjs`: `listbox(select)` bọc một `<select>` có sẵn thành nút + danh sách kiểu ui-kit (bàn phím ↑ ↓ Home End Enter Esc, dấu ✓, mục tắt mờ, mở trong dialog không bị cắt). `<select>` vẫn giữ giá trị và phát `change`, nên code gán `.value` / `.disabled` / thay `<option>` không đổi. Dùng ở Gián điệp (cách thêm tên, Cài đặt ván) và Sudoku (độ khó). Khi ui-kit có `src/dom/listbox`, thay file này bằng bản chép.
- `src/styles/tokens.css` → `frontend/src/gian-diep/ui-kit/tokens.css`: giữ token, base CSS, màu sáng/tối và chuyển động; bỏ `@import tailwindcss`, `@custom-variant`, `@theme` vì trang không biên dịch CSS bằng Tailwind.
- UI riêng dùng biến `--ui-*`, danh sách thiết lập cuộn bên trong và danh sách trong ván chia trang, khu vực chạm 44px và input 16px. Không tải CSS Nokia, React hay CDN runtime. Không lấy thay đổi chưa commit từ checkout UI kit.

Trang tải `frontend/src/ui-kit.css` dùng chung trước token sáng/tối của game. Icon dùng cùng Lucide 0.468.0 như UI kit qua `frontend/src/icons.js`; nút phụ dùng icon kèm nhãn truy cập, luật đầy đủ nằm trong Cách chơi.

`frontend/src/ui/notifications.js` giữ một instance `createToasts` dùng chung; gọi trực tiếp `notifications.show(tone, message, options)`. Bản DOM thêm nhãn đóng Việt/Anh và renderer Lucide để giữ icon của game. Toast gộp thông báo trùng, tối đa ba thông báo; mặc định 4 giây, lỗi 8 giây, dừng đếm khi hover/focus, `duration: 0` giữ tới khi đóng. Trong dialog đang mở, toast nằm trong dialog để không bị backdrop che.

Ngoại lệ áp dụng ui-kit: giữ HTML/CSS/ES modules và bố cục game hiện có, không chuyển sang React `Screen`, `PagedList` hay `ConfirmProvider`. Các game dùng dialog native có giao diện riêng, không gọi `alert`/`confirm`/`prompt`. Token dark dùng chung đã khớp commit trên; token sáng/tối đầy đủ của Gián điệp vẫn giữ riêng để không đổi màu các game khác. Không coi đây là chuyển đổi toàn bộ màn hình sang chuẩn một-viewport.

Kit pin `v0.5.0` cho config, SSO, E2E và reusable CI. `pnpm lint` và `pnpm check` đều chạy lint; định dạng toàn repo không phải gate vì source hiện có chưa đồng nhất. Auth cookie, giao thức WebSocket, lưu trữ và luật game không đổi.


## Kiểm thử

```sh
pnpm test
pnpm check
pnpm exec wrangler dev --local --ip 127.0.0.1 --port 8797
node tests/smoke.mjs http://127.0.0.1:8797 gian-diep soi
```

`tests/unit/gian-diep.test.mjs` kiểm parser tên, trùng/giới hạn, thứ tự/ID/chủ phòng, thành viên vào/rời giữa cấu hình và chia bài, giới hạn mọi quy mô, phân vai, quyền, dữ liệu riêng, đồng hồ, hòa, lượt đoán và kết quả. Smoke WebSocket thật chơi sáu người: Mũ Trắng đoán sai, hòa và bầu lại dân thắng, ván tiếp Mũ Trắng đoán đúng thắng ngay. Chỉ chạy smoke tạo phòng trên local; production để CI post-deploy kiểm theo quy ước repo.

`tests/unit/spy-ai.test.mjs` kiểm quyền owner, quota qua reset, reservation/gộp đồng thời, cache/TTL, đầu ra sai, quyền chủ phòng trước provider, race trong lúc chờ, và không lộ cặp trong HTTP/broadcast. Test dùng provider fixture, không gọi AI tính phí; xác minh inference thật cần binding Workers AI remote trong môi trường kiểm tra riêng.

`pnpm e2e` luôn chạy Wrangler với `--local`: không kết nối provider hay yêu cầu Cloudflare token trong CI. Để kiểm AI thật, chạy lệnh Wrangler trên nhưng bỏ `--local`; binding AI truy cập dịch vụ remote và có tính usage. Không coi provider fixture hoặc E2E không có remote là bằng chứng inference thật.

import { MAX_PLAYERS, MIN_PLAYERS, ROUND_TTL_MS, pickWolf, roleOf } from '../../public/soi/logic.js';

// Sói — dùng chung phòng NokiaRoom, giao diện riêng ở /soi/. Server chọn Sói bằng ctx.rand; view() chỉ gửi vai của chính người nhận,
// nên không ai biết ai là Sói trước khi chủ phòng lật bài. Không có người thắng / thua (nên ranks rỗng: không ghi lịch sử, không có bản xem lại).
export default {
  max: MAX_PLAYERS,
  slug: 'soi',
  page: '/soi/',
  cfg: {},
  // Điện thoại ngủ / rớt mạng giữa ván là chuyện thường: giữ ván và vai (không có leave()), cả phòng rớt mạng cũng không xoá phòng.
  persist: true,
  // Không ghi bản xem lại: ván chơi chỉ có vai bí mật, link chia sẻ vô nghĩa.
  replay: false,
  start(ctx) {
    const g = ctx.g;
    g.round = ctx.keep.round = (ctx.keep.round ?? 0) + 1;
    if (ctx.seats.length < MIN_PLAYERS) {
      // Nút Bắt đầu của khung chung không khoá được: chặn ở server, nói rõ lý do ở bảng kết quả.
      ctx.end({ title: [`Cần ít nhất ${MIN_PLAYERS} người`, `Need at least ${MIN_PLAYERS} players`], ranks: [] });
      return;
    }
    g.wolf = pickWolf(ctx.seats, ctx.rand);
    // Hẹn giờ hết hạn: nhờ persist, cả phòng rớt mạng vẫn giữ ván; hết hạn thì ván tự kết thúc và adapter dọn phòng.
    ctx.wakeAt(ctx.now() + ROUND_TTL_MS);
  },
  tick(ctx) {
    const g = ctx.g;
    if (g.done) return false;
    g.done = true;
    ctx.end({ title: ['Ván đã hết hạn', 'The round expired'], ranks: [] });
    return true;
  },
  msg(ctx, p, m) {
    const g = ctx.g;
    if (m.a !== 'reveal' || g.done || ctx.host() !== p.id) return false;
    g.done = true;
    const wolf = ctx.name(g.wolf);
    ctx.end({ title: [`Sói là ${wolf}`, `The wolf is ${wolf}`], ranks: [] });
    return true;
  },
  view(ctx, id) {
    const g = ctx.g;
    return { round: g.round, role: roleOf(g.wolf, ctx.seats, id), wolf: g.done ? g.wolf : null };
  },
};

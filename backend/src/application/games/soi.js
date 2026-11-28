import { ACTION, OUTCOME, MAX_PLAYERS, MIN_PLAYERS, ROUND_TTL_MS, pickWolf, roleOf } from '../../../../shared/games/soi/logic.js';

function displayName(ctx, id) {
  return ctx.g.roster?.find((player) => player.id === id)?.name ?? ctx.name(id);
}

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
    g.wolf = pickWolf(ctx.seats, ctx.rand, ctx.keep.lastWolf);
    ctx.keep.lastWolf = g.wolf;
    g.roster = ctx.seats.map((id) => ({ id, name: ctx.name(id) }));
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
    if (g.done || ctx.host() !== p.id) return false;
    const wolf = displayName(ctx, g.wolf);
    if (m.a === ACTION.GROUP_VOTE) {
      if (!ctx.seats.includes(m.target)) return false;
      const correct = m.target === g.wolf;
      g.done = true;
      ctx.end({
        title: correct ? ['Dân làng thắng!', 'Villagers win!'] : ['Sói thắng!', 'The wolf wins!'],
        outcome: correct ? OUTCOME.CORRECT : OUTCOME.WRONG,
        suspect: displayName(ctx, m.target), wolf, ranks: [],
      });
      return true;
    }
    if (m.a !== ACTION.REVEAL) return false;
    g.done = true;
    ctx.end({ title: [`Sói là ${wolf}`, `The wolf is ${wolf}`], ranks: [] });
    return true;
  },
  view(ctx, id) {
    const g = ctx.g;
    return {
      round: g.round, role: roleOf(g.wolf, ctx.seats, id), wolf: g.done ? g.wolf : null,
      roster: g.roster ?? ctx.seats.map((player) => ({ id: player, name: ctx.name(player) })),
    };
  },
};

import { ACTION, OUTCOME, MAX_PLAYERS, MIN_PLAYERS, ROUND_TTL_MS, pickWolf, roleOf } from '../../../../shared/games/soi/logic.js';

function ballotResult(ctx) {
  const votes = ctx.g.votes;
  const online = ctx.online();
  const ready = ctx.seats.every((id) => !online.has(id) || votes.some((vote) => vote.voter === id));
  const counts = new Map();
  for (const { target } of votes) counts.set(target, (counts.get(target) ?? 0) + 1);
  const leaders = [...counts].sort((first, second) => second[1] - first[1]);
  const [first, second] = leaders;
  const tied = Boolean(first && second && first[1] === second[1]);
  return { ready, tied, suspect: first && !tied ? first[0] : null };
}

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
    if (g.done) return false;
    if (m.a === ACTION.VOTE) {
      if (!g.votes || !ctx.seats.includes(p.id) || !ctx.seats.includes(m.target)
        || p.id === m.target || g.votes.some((vote) => vote.voter === p.id)) return false;
      g.votes.push({ voter: p.id, target: m.target });
      return true;
    }
    if (ctx.host() !== p.id) return false;
    if (m.a === ACTION.OPEN_VOTE) {
      if (g.votes) {
        const ballot = ballotResult(ctx);
        if (!ballot.ready || !ballot.tied) return false;
      }
      g.votes = [];
      return true;
    }
    const wolf = displayName(ctx, g.wolf);
    if (m.a === ACTION.FINISH_VOTE && g.votes) {
      const ballot = ballotResult(ctx);
      if (!ballot.ready || !ballot.suspect) return false;
      const correct = ballot.suspect === g.wolf;
      g.done = true;
      ctx.end({
        title: correct ? ['Dân làng thắng!', 'Villagers win!'] : ['Sói thắng!', 'The wolf wins!'],
        outcome: correct ? OUTCOME.CORRECT : OUTCOME.WRONG,
        suspect: displayName(ctx, ballot.suspect), wolf, ranks: [],
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
    const view = {
      round: g.round, role: roleOf(g.wolf, ctx.seats, id), wolf: g.done ? g.wolf : null,
      roster: g.roster ?? ctx.seats.map((player) => ({ id: player, name: ctx.name(player) })),
    };
    if (!g.votes || g.done) return view;
    const ballot = ballotResult(ctx);
    return { ...view, ballot: {
      voted: g.votes.some((vote) => vote.voter === id),
      count: g.votes.length,
      canFinish: ballot.ready && Boolean(ballot.suspect),
      tied: ballot.ready && ballot.tied,
    } };
  },
};

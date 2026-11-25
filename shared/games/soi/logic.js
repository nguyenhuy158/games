// Sói: luật thuần (không DOM, không I/O), dùng chung cho server và test.
// Mỗi ván chọn ngẫu nhiên đúng 1 Sói trong số người ngồi ghế; những người còn lại là Dân.
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
// Ván không ai kết thúc thì tự hết hạn (một buổi chơi thật hiếm khi quá 3 giờ).
export const ROUND_TTL_MS = 3 * 60 * 60_000;
export const WOLF = 'wolf';
export const VILLAGER = 'villager';

// rand() trả số thực trong [0, 1) (ctx.rand của phòng, dựa trên crypto). Kẹp lại phòng khi rand() = 1 do làm tròn.
export function pickWolf(seats, rand) {
  return seats[Math.min(seats.length - 1, Math.floor(rand() * seats.length))];
}

// Vai của người `id`. Người xem (không có ghế) hoặc ván chưa chọn Sói thì chưa có vai (null).
export const roleOf = (wolf, seats, id) => (!wolf || !seats.includes(id) ? null : id === wolf ? WOLF : VILLAGER);

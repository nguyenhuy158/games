// Tên trong phòng không trùng nhau: trùng thì thêm số ("Mèo Lười" -> "Mèo Lười 2"), vẫn giữ tối đa 20 ký tự.
export function uniqueName(name, others) {
  const taken = new Set(others);
  if (!taken.has(name)) return name;
  for (let k = 2; ; k++) {
    const tag = ` ${k}`;
    const n = name.slice(0, 20 - tag.length) + tag;
    if (!taken.has(n)) return n;
  }
}

// Tên của những người khác trong phòng (cả người đang rớt mạng, để họ vào lại vẫn giữ tên).
export const otherNames = (players, id) => Object.values(players).filter((p) => p.id !== id).map((p) => p.name);

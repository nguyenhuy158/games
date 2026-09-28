import { icon } from './icons.js';

// Tên mặc định cho khách: con vật + tính cách ("Mèo Lười"), 30 × 30 = 900 kiểu nên hiếm khi trùng.
// Server vẫn tự thêm số nếu trong phòng đã có người cùng tên (worker/names.js).
const ANIMALS = ['Mèo', 'Cún', 'Thỏ', 'Gấu', 'Cáo', 'Hổ', 'Sóc', 'Vịt', 'Gà', 'Heo', 'Cua', 'Tôm', 'Cá', 'Rùa', 'Ếch',
  'Khỉ', 'Voi', 'Nai', 'Cú', 'Chim', 'Ong', 'Bướm', 'Nhím', 'Chuột', 'Hà mã', 'Gấu trúc', 'Kỳ lân', 'Cánh cụt', 'Bạch tuộc', 'Sư tử'];
const MOODS = ['Lười', 'Vui Vẻ', 'Tinh Nghịch', 'Ngơ Ngác', 'Siêng Năng', 'Mũm Mĩm', 'Nhanh Nhẹn', 'Hay Ngủ', 'Láu Lỉnh', 'Dễ Thương',
  'Cute', 'Bá Đạo', 'Thông Minh', 'Hài Hước', 'Nhút Nhát', 'Dũng Cảm', 'Tham Ăn', 'Lém Lỉnh', 'Điềm Tĩnh', 'Hiếu Động',
  'May Mắn', 'Mộng Mơ', 'Cool Ngầu', 'Chăm Chỉ', 'Lầy Lội', 'Hồn Nhiên', 'Tí Hon', 'Khổng Lồ', 'Lấp Lánh', 'Bí Ẩn'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const randomName = () => `${pick(ANIMALS)} ${pick(MOODS)}`.slice(0, 20);

// Nút xúc xắc cạnh ô tên: bấm để bốc tên khác (lưu luôn cho mọi game). Trả về hàng [ô tên, nút];
// ô đang nằm trong trang thì tự thay chỗ, chưa thì người gọi tự chèn hàng này.
export function addReroll(input) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:stretch';
  input.parentNode?.replaceChild(row, input);
  const btn = Object.assign(document.createElement('button'), { type: 'button', title: 'Bốc tên khác', innerHTML: icon('dices') });
  btn.setAttribute('aria-label', 'Bốc tên ngẫu nhiên khác');
  btn.style.flex = 'none';
  btn.onclick = (e) => {
    e.preventDefault(); // nằm trong <label>: không để click nhảy sang ô nhập
    input.value = randomName();
    try { localStorage.setItem('pk.name', input.value); } catch {}
  };
  row.append(input, btn);
  return row;
}

// Tên tự sinh kiểu cũ (dễ trùng) -> bốc lại tên mới.
const OLD_AUTO = /^(Người chơi \d{3}|Pika\d{4}|Thợ mỏ)$/;

// Tên của máy này (dùng chung mọi game, khoá pk.name). Lần đầu thì bốc ngẫu nhiên và nhớ lại.
export function deviceName() {
  try {
    let n = localStorage.getItem('pk.name');
    if (!n || OLD_AUTO.test(n)) { n = randomName(); localStorage.setItem('pk.name', n); }
    return n;
  } catch {
    return randomName();
  }
}

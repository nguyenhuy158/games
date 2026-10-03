// Luật Lô tô Việt Nam (thuần, không DOM). Tờ dò 9 hàng × 9 cột, chia 3 khối 3 hàng; mỗi hàng đúng 5 số + 4 ô trống (45 số / tờ).
// Cột k chứa số trong khoảng của nó (cột 0: 1–9, cột 1: 10–19, ..., cột 8: 80–90), trong cột xếp tăng dần từ trên xuống;
// trong mỗi khối, cột nào cũng có ít nhất một số. Người hô bốc lần lượt các số 1–90 (ngẫu nhiên, không lặp); người chơi dò
// số đã hô trên tờ, hàng ngang nào đủ 5 số đã hô thì bấm KINH.
// Một người có thể cầm nhiều tờ: ô thứ i trong các tờ của người đó = k * CELLS + r * COLS + c (tờ k, hàng r, cột c).
export const ROWS = 9;
export const COLS = 9;
export const BLOCK = 3;
export const PER_ROW = 5;
export const CELLS = ROWS * COLS;
export const PER_CARD = ROWS * PER_ROW;
export const MAX_NUMBER = 90;
// Màu tờ (chỉ số vào bảng màu ở client): đỏ, xanh lá, xanh dương, vàng, tím, cam, hồng, xanh ngọc.
export const COLOR_COUNT = 8;
export const MAX_CARDS = 6;
export const PACES = [0, 3, 5, 8]; // giây giữa hai lần tự hô; 0 = chủ phòng tự bấm

// Phạt "kinh láo" (bấm KINH khi chưa có hàng nào đủ 5 số đã hô). Chủ phòng chọn: tắt / phạt trong game / phạt vui ngoài đời / cả hai.
// Phạt trong game (server bốc một): khoá nút KINH, mất một hạt, đóng băng Tự dò, gắn nhãn "Kinh láo" tới hết ván, chờ thêm vài số.
export const PENALTY_MODES = ['off', 'game', 'party', 'both'];
export const GAME_PENALTIES = ['lock', 'chip', 'freeze', 'liar', 'after'];
export const LOCK_MS = 30_000;
export const FREEZE_MS = 60_000;
export const AFTER_CALLS = 3;
// Phạt vui (cả phòng thấy, không ép): mặc định song ngữ; chủ phòng sửa được (mỗi dòng một câu, lưu trên máy chủ phòng).
export const PARTY = [
  ['Hát 1 câu', 'Sing one line of a song'], ['Kể 1 chuyện cười', 'Tell a joke'], ['Chống đẩy 5 cái', 'Do 5 push-ups'],
  ['Khen người bên phải', 'Compliment the person on your right'], ['Đổi chỗ với người bên cạnh', 'Swap seats with your neighbour'],
  ['Nhảy 10 giây', 'Dance for 10 seconds'], ['Nói giọng miền khác 1 phút', 'Talk in another regional accent for 1 minute'],
  ['Uống 1 ngụm nước', 'Drink a sip of water'],
];
export const PARTY_MAX = 20;
export const PARTY_LEN = 60;
export const validParty = (list) => Array.isArray(list) && list.length >= 1 && list.length <= PARTY_MAX
  && list.every((s) => typeof s === 'string' && s.trim() && s.trim().length <= PARTY_LEN);

export const colRange = (c) => [c === 0 ? 1 : c * 10, c === COLS - 1 ? MAX_NUMBER : c * 10 + 9];

function pickDistinct(pool, n, rand) {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const ALL_COLS = Array.from({ length: COLS }, (_, c) => c);

// Tờ mới: mảng 9 hàng × 9 cột, ô trống = null.
export function newCard(rand = Math.random) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let b = 0; b < ROWS; b += BLOCK) {
    let rows;
    do rows = Array.from({ length: BLOCK }, () => pickDistinct(ALL_COLS, PER_ROW, rand));
    while (new Set(rows.flat()).size < COLS);
    rows.forEach((cs, i) => { for (const c of cs) grid[b + i][c] = 0; });
  }
  for (let c = 0; c < COLS; c++) {
    const rows = grid.map((row, r) => (row[c] === 0 ? r : -1)).filter((r) => r >= 0);
    const [min, max] = colRange(c);
    const nums = pickDistinct(Array.from({ length: max - min + 1 }, (_, i) => min + i), rows.length, rand).sort((a, b) => a - b);
    rows.forEach((r, i) => { grid[r][c] = nums[i]; });
  }
  return grid;
}

// Khoá so trùng: hai tờ cùng khoá là một tờ.
export const cardKey = (grid) => grid.flat().join(',');

// Số chưa hô kế tiếp (ngẫu nhiên); hô hết rồi thì null.
export function nextNumber(called, rand = Math.random) {
  const seen = new Set(called);
  const left = [];
  for (let n = 1; n <= MAX_NUMBER; n++) if (!seen.has(n)) left.push(n);
  return left.length ? left[Math.floor(rand() * left.length)] : null;
}

// Số ở ô i trong các tờ (null nếu ô trống / ngoài tờ).
export function numberAt(cards, i) {
  if (!Number.isInteger(i) || i < 0 || i >= cards.length * CELLS) return null;
  const k = Math.floor(i / CELLS), j = i % CELLS;
  return cards[k][Math.floor(j / COLS)][j % COLS];
}

// Đánh được ô i không: ô có số, số đã hô, chưa đánh.
export function canMark(cards, called, marked, i) {
  const v = numberAt(cards, i);
  return v != null && !marked.includes(i) && called.includes(v);
}

// Các ô (chỉ số i) có số n trên các tờ.
export const cellsOf = (cards, n) => rowsOf(cards).flatMap((row) => row.cells.filter((_, j) => row.nums[j] === n));

// Mỗi hàng của các tờ: { k, r, nums: 5 số, cells: 5 ô }.
export function rowsOf(cards) {
  return cards.flatMap((grid, k) => grid.map((row, r) => {
    const cells = [], nums = [];
    row.forEach((v, c) => {
      if (v != null) { cells.push(k * CELLS + r * COLS + c); nums.push(v); }
    });
    return { k, r, nums, cells };
  }));
}

// Hàng kinh được: đủ 5 số đã hô (server kiểm theo số đã hô, không theo ô người chơi tự đánh).
export function kinhRows(cards, called) {
  const set = new Set(called);
  return rowsOf(cards).filter((row) => row.nums.every((n) => set.has(n)));
}

// Hàng đang CHỜ: đã đánh 4 số, còn thiếu đúng 1 số chưa hô -> { k, r, n: số đang chờ }.
export function waitRows(cards, called, marked) {
  const hit = new Set(marked), seen = new Set(called);
  return rowsOf(cards).flatMap(({ k, r, nums, cells }) => {
    const miss = cells.filter((i) => !hit.has(i));
    if (miss.length !== 1) return [];
    const n = nums[cells.indexOf(miss[0])];
    return seen.has(n) ? [] : [{ k, r, n }];
  });
}

// Hàng nhiều số đã hô nhất (0–5): độ gần kinh của một người.
export function bestRow(cards, called) {
  const set = new Set(called);
  return Math.max(0, ...rowsOf(cards).map((row) => row.nums.filter((n) => set.has(n)).length));
}

// Hàng đánh được nhiều ô nhất (0–5): hiện cạnh tên người chơi (4 = đang chờ).
export function bestMarked(cards, marked) {
  const hit = new Set(marked);
  return Math.max(0, ...rowsOf(cards).map((row) => row.cells.filter((i) => hit.has(i)).length));
}

// Đọc số kiểu miền Nam / hội chợ: 21 "hai mươi mốt", 15 "mười lăm", 24 "hai mươi tư", 90 "chín mươi".
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
export function numberWords(n) {
  const tens = Math.floor(n / 10), u = n % 10;
  if (!tens) return DIGITS[u];
  const head = tens === 1 ? 'mười' : `${DIGITS[tens]} mươi`;
  if (!u) return head;
  const tail = u === 5 ? 'lăm' : u === 1 && tens > 1 ? 'mốt' : u === 4 && tens > 1 ? 'tư' : DIGITS[u];
  return `${head} ${tail}`;
}

// Đọc số tiếng Anh cho giọng English: 23 "twenty-three".
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function numberWordsEn(n) {
  if (n < 20) return ONES[n];
  const u = n % 10;
  return `${TENS[Math.floor(n / 10)]}${u ? `-${ONES[u]}` : ''}`;
}

// Câu hô (tự viết, ngắn): câu mở đầu xoay vòng + câu gắn với vài số quen; cả phòng ra cùng một câu vì chọn theo (số, lượt hô).
const OPENERS = [
  'Lô tô hô tô, bà con dò kỹ', 'Cờ ra con mấy, con mấy gì ra', 'Tay bốc tay hô, ai chờ thì dò', 'Hội chợ vui ghê, số mới ra lò',
  'Bà con chú ý, số tiếp theo đây', 'Ai đang chờ đó, coi chừng kinh nha', 'Lắc ống tre nghe, số này ra nè', 'Xuân về rộn rã, lô tô ra số',
];
const TAGS = {
  1: 'Một mình một chợ', 2: 'Hai bên cùng vui', 3: 'Ba chân bốn cẳng', 4: 'Bốn mùa xuân sắc', 5: 'Năm châu bốn biển', 6: 'Sáu câu vọng cổ',
  7: 'Bảy nổi ba chìm', 8: 'Tám chuyện cả ngày', 9: 'Chín bỏ làm mười', 10: 'Mười phân vẹn mười', 50: 'Năm mươi nửa đường', 90: 'Chín mươi là chót',
};
export function callLine(n, turn) {
  const opener = OPENERS[(n * 7 + turn) % OPENERS.length];
  return { text: `${opener}${TAGS[n] ? ` — ${TAGS[n]}` : ''}: số ${n}!`, say: `${opener}. ${TAGS[n] ? `${TAGS[n]}. ` : ''}Số ${numberWords(n)}!` };
}

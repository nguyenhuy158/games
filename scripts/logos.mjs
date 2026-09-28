// Logo kawaii tự vẽ (SVG thuần, không dùng tác phẩm của ai): nền pastel bo tròn, viền nâu đậm
// + viền trắng kiểu sticker, mặt cười má hồng, lấp lánh. Mỗi game một logo, dùng làm favicon / icon app.
// render-assets.mjs gọi file này để ghi public/logos/*.svg và xuất PNG.

const INK = '#4b2c2c';
const BLUSH = '#ff8fa3';

const sparkle = (x, y, s, fill = '#fff') =>
  `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;

// Mặt cười: mắt to có chấm sáng, má hồng, miệng "ω" hoặc cười mở.
// ink: màu mắt/miệng (mặt trên nền tối thì dùng trắng, chấm sáng chuyển sang màu mực).
function face(cx, cy, k = 1, mouth = 'w', ink = INK) {
  const hi = ink === INK ? '#fff' : INK;
  const e = (x) => `<ellipse cx="${x}" cy="${cy}" rx="${13 * k}" ry="${17 * k}" fill="${ink}"/><circle cx="${x - 4 * k}" cy="${cy - 6 * k}" r="${5 * k}" fill="${hi}"/>`;
  const dx = 40 * k;
  const my = cy + 26 * k;
  const m = mouth === 'w'
    ? `<path d="M${cx - 14 * k} ${my}q${7 * k} ${10 * k} ${14 * k} 0q${7 * k} ${10 * k} ${14 * k} 0" fill="none" stroke="${ink}" stroke-width="${6 * k}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M${cx - 16 * k} ${my - 4 * k}Q${cx} ${my + 20 * k} ${cx + 16 * k} ${my - 4 * k}Z" fill="#e0564f" stroke="${INK}" stroke-width="${5 * k}" stroke-linejoin="round"/>`;
  return `${e(cx - dx)}${e(cx + dx)}
    <ellipse cx="${cx - dx - 22 * k}" cy="${cy + 24 * k}" rx="${18 * k}" ry="${10 * k}" fill="${BLUSH}" opacity=".75"/>
    <ellipse cx="${cx + dx + 22 * k}" cy="${cy + 24 * k}" rx="${18 * k}" ry="${10 * k}" fill="${BLUSH}" opacity=".75"/>${m}`;
}

// Viền sticker: vẽ hình 2 lần, lần dưới nét trắng dày.
const sticker = (shape) => `<g stroke="#fff" stroke-width="34" stroke-linejoin="round" fill="#fff">${shape}</g>${shape}`;

const frame = (id, c1, c2, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="${id}" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>
    <clipPath id="${id}c"><rect x="8" y="8" width="496" height="496" rx="120"/></clipPath>
  </defs>
  <rect x="8" y="8" width="496" height="496" rx="120" fill="url(#${id})"/>
  <g clip-path="url(#${id}c)">${body}</g>
  <rect x="8" y="8" width="496" height="496" rx="120" fill="none" stroke="${INK}" stroke-width="12"/>
</svg>`;

export const LOGOS = {
  // Trang chủ: tay cầm chơi game có mặt cười.
  hub: frame('g', '#fbe7ff', '#c9b6ff', `
    ${sticker(`<path d="M104 210C104 164 146 146 190 150H322C366 146 408 164 408 210L432 334C442 384 398 414 360 392L318 352H194L152 392C114 414 70 384 80 334Z" fill="#fff" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>`)}
    <path d="M150 238h22v-22h24v22h22v24h-22v22h-24v-22h-22z" fill="#ff9ec4" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <circle cx="352" cy="220" r="17" fill="#ffe066" stroke="${INK}" stroke-width="7"/>
    <circle cx="386" cy="254" r="17" fill="#8ff0c8" stroke="${INK}" stroke-width="7"/>
    <circle cx="318" cy="254" r="17" fill="#9fd4ff" stroke="${INK}" stroke-width="7"/>
    ${face(256, 296, 0.7)}
    ${sparkle(92, 100, 30)}${sparkle(430, 92, 22, '#ffe066')}${sparkle(420, 440, 26)}${sparkle(80, 430, 18, '#ff9ec4')}`),

  // Pikachu nối thú: 2 ô giống nhau nối bằng đường gấp khúc (như lúc ăn cặp).
  pikachu: frame('p', '#fffbd6', '#ffd84d', `
    ${sticker(`<polyline points="150,236 150,120 362,120 362,176" fill="none" stroke="#ff6f91" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`)}
    ${sticker(`<rect x="62" y="236" width="176" height="206" rx="36" fill="#fff4e3" stroke="${INK}" stroke-width="12"/>`)}
    ${sticker(`<rect x="274" y="176" width="176" height="206" rx="36" fill="#fff4e3" stroke="${INK}" stroke-width="12"/>`)}
    <path d="M150 270l-26 48h22l-10 40 34-54h-22l12-34z" fill="#ffd84d" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M362 210l-26 48h22l-10 40 34-54h-22l12-34z" fill="#ffd84d" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    ${face(150, 372, 0.55)}${face(362, 312, 0.55)}
    ${sparkle(256, 70, 26)}${sparkle(440, 440, 24, '#ff9ec4')}${sparkle(70, 120, 20)}`),

  // Dò mìn: quả bom tròn mặt cười, ngòi toé lửa, cắm cờ bên cạnh.
  'do-min': frame('m', '#e6f0ff', '#9fb7e8', `
    <path d="M300 150C312 118 336 102 360 96" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
    ${sparkle(372, 90, 30, '#ffd23f')}
    ${sticker(`<circle cx="236" cy="296" r="136" fill="#3d4a66" stroke="${INK}" stroke-width="12"/>`)}
    <rect x="262" y="140" width="56" height="40" rx="10" fill="#8a96b3" stroke="${INK}" stroke-width="10" transform="rotate(35 290 160)"/>
    <ellipse cx="180" cy="232" rx="34" ry="20" fill="#fff" opacity=".35" transform="rotate(-30 180 232)"/>
    ${face(236, 300, 0.9, 'w', '#fff')}
    ${sticker(`<path d="M392 250V430" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M398 256L470 282L398 312Z" fill="#ff5d5d" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>`)}
    ${sparkle(90, 110, 26)}${sparkle(84, 420, 18, '#ffd23f')}${sparkle(456, 460, 16)}`),

  // Bầu cua: bé cua mặt cười giơ càng, cạnh viên xúc xắc, trên nền đỏ Tết.
  'bau-cua': frame('b', '#ffe3d6', '#ff8a7a', `
    ${sticker(`<rect x="318" y="300" width="140" height="140" rx="30" fill="#fff" stroke="${INK}" stroke-width="12" transform="rotate(14 388 370)"/>`)}
    <g transform="rotate(14 388 370)" fill="${INK}"><circle cx="348" cy="330" r="13"/><circle cx="388" cy="370" r="13"/><circle cx="428" cy="410" r="13"/></g>
    <path d="M150 300L92 330M150 330L100 372M362 300L420 330" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
    ${sticker(`<path d="M120 196C82 160 96 104 140 96C124 128 140 150 164 156C172 180 150 204 120 196Z" fill="#ff5d4f" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>`)}
    ${sticker(`<path d="M392 196C430 160 416 104 372 96C388 128 372 150 348 156C340 180 362 204 392 196Z" fill="#ff5d4f" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>`)}
    ${sticker(`<ellipse cx="256" cy="262" rx="140" ry="104" fill="#ff5d4f" stroke="${INK}" stroke-width="12"/>`)}
    <ellipse cx="200" cy="208" rx="36" ry="18" fill="#fff" opacity=".45" transform="rotate(-18 200 208)"/>
    ${face(256, 256, 0.85)}
    ${sparkle(88, 440, 28, '#ffd23f')}${sparkle(256, 70, 22)}${sparkle(454, 250, 18, '#ffd23f')}`),

  // Đào Vàng: cục vàng mặt cười bị móc câu gắp lên.
  'dao-vang': frame('d', '#fff1d6', '#f7b267', `
    <path d="M8 400C120 372 190 392 256 380S420 360 504 392V384 504H8Z" fill="#c98a55" opacity=".55"/>
    <line x1="256" y1="8" x2="256" y2="168" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    ${sticker(`<path d="M150 250C140 200 200 175 240 190C270 165 330 170 350 205C395 210 410 260 390 295C405 340 370 385 320 380C290 405 220 405 190 380C140 385 110 340 125 305C105 285 115 255 150 250Z" fill="#ffd23f" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>`)}
    <ellipse cx="200" cy="232" rx="30" ry="16" fill="#fff" opacity=".7" transform="rotate(-20 200 232)"/>
    <path d="M226 196C200 196 186 172 204 150M286 196C312 196 326 172 308 150" fill="none" stroke="#9aa7b4" stroke-width="16" stroke-linecap="round"/>
    <path d="M226 196C200 196 186 172 204 150M286 196C312 196 326 172 308 150" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <rect x="232" y="150" width="48" height="30" rx="12" fill="#c7d0da" stroke="${INK}" stroke-width="8"/>
    ${face(256, 290, 0.8, 'open')}
    ${sparkle(96, 110, 30)}${sparkle(420, 120, 24, '#ffe066')}${sparkle(440, 300, 18)}${sparkle(80, 330, 16, '#ffe066')}`),
};

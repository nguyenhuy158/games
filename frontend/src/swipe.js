// Vuốt / chạm trên màn cảm ứng cho game một người (2048, Xếp gạch). Chuột không tính (đã có bàn phím + nút).
//   swipe(el, { onSwipe(dir), onTap() })   dir = 'left' | 'right' | 'up' | 'down'
// el cần CSS touch-action: none để trình duyệt không cuộn trang khi vuốt.
const SWIPE_PX = 50; // vuốt tối thiểu
const TAP_PX = 10; // chạm: lệch tối đa
const TAP_MS = 200; // chạm: giữ tối đa

export function swipe(target, { onSwipe, onTap }) {
  let from = null;
  target.addEventListener('pointerdown', (e) => {
    from = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY, at: performance.now() };
  });
  target.addEventListener('pointercancel', () => { from = null; });
  target.addEventListener('pointerup', (e) => {
    if (!from) return;
    const dx = e.clientX - from.x, dy = e.clientY - from.y, ms = performance.now() - from.at;
    from = null;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d >= SWIPE_PX) onSwipe?.(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    else if (d <= TAP_PX && ms <= TAP_MS) onTap?.();
  });
}

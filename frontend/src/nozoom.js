// Chặn zoom: iOS Safari bỏ qua user-scalable=no nên phải chặn bằng sự kiện.
// Pinch (gesture* của WebKit + 2 ngón), chạm đúp (touch-action), pinch trackpad / Ctrl+cuộn trên máy tính.
// Ctrl +/- trên bàn phím vẫn để nguyên.
const stop = (e) => e.preventDefault();
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.documentElement.style.touchAction = 'pan-x pan-y';

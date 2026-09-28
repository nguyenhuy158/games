// Toast dùng chung các game, bắt chước sonner (position bottom-center, richColors, theme system) như chia-keo.
//   toast('...')            -> thông tin
//   toast.success / .error / .warning('...')
//   toast('...', { icon: 'crown' }) -> icon lucide tuỳ ý
import { icon } from './icons.js';

const ICONS = { info: 'info', success: 'circle-check', error: 'circle-x', warning: 'triangle-alert' };
const CSS = `
#toaster { position: fixed; left: 50%; bottom: max(24px, env(safe-area-inset-bottom)); translate: -50% 0; z-index: 1000;
  display: flex; flex-direction: column-reverse; align-items: center; gap: 8px; pointer-events: none; width: min(356px, calc(100vw - 32px)); }
#toaster .t { --bg: #fff; --fg: #171717; --bd: #ededed;
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 14px 16px; border-radius: 8px; pointer-events: auto;
  background: var(--bg); color: var(--fg); border: 1px solid var(--bd); box-shadow: 0 4px 12px #0000001a;
  font: 500 13px/1.4 "Be Vietnam Pro", "Plus Jakarta Sans", system-ui, sans-serif; animation: t-in .35s cubic-bezier(.21, 1.02, .73, 1); }
#toaster .t.out { animation: t-out .2s ease-in forwards; }
#toaster .t svg { width: 18px; height: 18px; flex: none; }
#toaster .t.success { --bg: #ecfdf3; --fg: #008a2e; --bd: #d3fde5; }
#toaster .t.error { --bg: #fff0f0; --fg: #e60000; --bd: #ffe0e1; }
#toaster .t.info { --bg: #f0f8ff; --fg: #0973dc; --bd: #d3e0fd; }
#toaster .t.warning { --bg: #fffcf0; --fg: #dc7609; --bd: #fdf5d3; }
@media (prefers-color-scheme: dark) {
  #toaster .t { --bg: #000; --fg: #fcfcfc; --bd: #333; }
  #toaster .t.success { --bg: #001f0f; --fg: #59f3a6; --bd: #003d1c; }
  #toaster .t.error { --bg: #2d0607; --fg: #ff9ea1; --bd: #4d0408; }
  #toaster .t.info { --bg: #000d1f; --fg: #89c7ff; --bd: #00113d; }
  #toaster .t.warning { --bg: #1d1f00; --fg: #f3cf58; --bd: #3d3d00; }
}
@keyframes t-in { from { opacity: 0; transform: translateY(100%) scale(.95); } }
@keyframes t-out { to { opacity: 0; transform: translateY(40%) scale(.95); } }`;

const MAX = 3;
let box;
function show(msg, type, opts = {}) {
  if (!box) {
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
    box = Object.assign(document.createElement('div'), { id: 'toaster' });
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = `t ${type}`;
  t.innerHTML = icon(opts.icon ?? ICONS[type]);
  t.append(Object.assign(document.createElement('span'), { textContent: msg }));
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); };
  t.onclick = close;
  box.append(t);
  while (box.children.length > MAX) box.firstChild.remove();
  setTimeout(close, opts.duration ?? 3000);
}

export const toast = (msg, opts) => show(msg, 'info', opts);
for (const type of ['success', 'error', 'warning']) toast[type] = (msg, opts) => show(msg, type, opts);

// Toast dùng chung các game, bắt chước sonner (position bottom-center, richColors, theme system) như chia-keo.
//   toast('...')            -> thông tin
//   toast.success / .error / .warning('...')
//   toast('...', { icon: 'crown' }) -> icon lucide tuỳ ý
import { icon } from './icons.js';

const ICONS = { info: 'info', success: 'circle-check', error: 'circle-x', warning: 'triangle-alert' };
const CSS = `
#toaster { position: fixed; left: 50%; bottom: max(24px, env(safe-area-inset-bottom)); translate: -50% 0; z-index: 1000;
  display: flex; flex-direction: column-reverse; align-items: center; gap: 8px; pointer-events: none; width: min(356px, calc(100vw - 32px)); }
#toaster .t { --bg: var(--ui-surface); --fg: var(--ui-fg); --bd: var(--ui-border);
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 16px; border-radius: var(--ui-radius); pointer-events: auto;
  background: var(--bg); color: var(--fg); border: 1px solid var(--bd); box-shadow: var(--ui-shadow-md);
  font: 500 14px/1.4 "Be Vietnam Pro", Inter, system-ui, sans-serif; animation: t-in var(--ui-dur) var(--ui-ease-out); }
#toaster .t.out { animation: t-out var(--ui-dur) var(--ui-ease-in) forwards; }
#toaster .t svg { width: 18px; height: 18px; flex: none; }
#toaster .t.success { --bg: var(--ui-success-soft); --fg: var(--ui-success-strong); }
#toaster .t.error { --bg: var(--ui-danger-soft); --fg: var(--ui-danger-strong); }
#toaster .t.info { --bg: var(--ui-primary-soft); --fg: var(--ui-primary); }
#toaster .t.warning { --bg: var(--ui-warning-soft); --fg: var(--ui-warning-strong); }
@media (prefers-reduced-motion: reduce) {
  #toaster .t, #toaster .t.out { animation: none; }
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

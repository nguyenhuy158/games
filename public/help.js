// Hộp "Cách chơi / How to play" dùng chung mọi game: nút (i) mở hộp thoại (<dialog> modal: Esc / nền mờ / nút đóng,
// Tab chỉ chạy trong hộp), lần đầu vào game tự mở một lần (localStorage 'help.seen.<game>', ghi khi đóng).
//   mountHelp({ game, button, content: { vi, en }, auto?, onOpen?, onClose? }) -> { open, close, isOpen }
//   button: element, mảng element hoặc selector (mọi nút khớp đều mở hộp); content[lang] = {
//     goal: 'Mục tiêu', play: ['Cách chơi'...], keys: ['Bàn phím / chuột'...], touch: ['Cảm ứng'...], tips: ['Mẹo'...] }
// Thanh trên chật (nút nhỏ hơn 44px): thêm class 'compact' cho nút — giữ cỡ như các nút bên cạnh, vùng chạm vẫn 44×44.
import { t, en } from './i18n.js';
import { iconEl } from './icons.js';
import { el, store } from './dom.js';

const SEEN_KEY = 'help.seen.';
const CSS = `
.help-btn{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
.help-btn.compact{min-width:0;min-height:0;position:relative}
.help-btn.compact::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}
dialog.help-dlg{padding:0;border:0;background:transparent;color:var(--ui-fg);width:min(420px,calc(100vw - 24px));max-width:none;
  max-height:calc(100dvh - 24px);overflow:visible;font:15px/1.45 "Be Vietnam Pro",Inter,system-ui,sans-serif;user-select:text}
dialog.help-dlg::backdrop{background:color-mix(in oklab,var(--ui-bg) 75%,transparent)}
dialog.help-dlg[open]{animation:help-pop var(--ui-dur) var(--ui-ease-out)}
@keyframes help-pop{from{transform:scale(.96);opacity:0}}
.help-card{display:flex;flex-direction:column;max-height:calc(100dvh - 24px);background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:var(--ui-radius);
  box-shadow:var(--ui-shadow-lg);overflow:hidden}
.help-head{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 16px;border-bottom:1px solid var(--ui-border)}
.help-head h2{flex:1;margin:0;font-size:18px;font-weight:600;color:var(--ui-fg);display:flex;align-items:center;gap:8px}
.help-head h2 .ic{width:24px;height:24px;color:var(--ui-primary)}
.help-x{width:44px;height:44px;min-width:0;min-height:0;flex:none;border-radius:var(--ui-radius);border:1px solid var(--ui-border);background:var(--ui-surface);color:var(--ui-fg);display:grid;place-items:center;cursor:pointer;padding:0;margin:0;box-shadow:none}
.help-body{overflow:auto;overscroll-behavior:contain;padding:16px;display:grid;gap:16px}
.help-sec h3{margin:0 0 8px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px;color:var(--ui-fg)}
.help-sec h3 .ic{width:24px;height:24px;padding:4px;border-radius:var(--ui-radius);background:var(--ui-primary-soft);color:var(--ui-primary)}
.help-sec p,.help-sec ul{margin:0;font-size:14px;color:var(--ui-fg-muted)}
.help-sec ul{padding-left:1.15em;display:grid;gap:4px}
.help-sec h4{margin:8px 0 4px;font-size:12px;font-weight:600;color:var(--ui-fg-muted)}
.help-sec h4:first-of-type{margin-top:0}
.help-foot{padding:12px 16px 16px;display:flex;justify-content:center}
.help-ok{display:inline-flex;align-items:center;justify-content:center;width:auto;min-height:44px;min-width:140px;margin:0;padding:0 24px;border-radius:var(--ui-radius);border:1px solid transparent;background:var(--ui-primary);color:var(--ui-primary-fg);
  font:inherit;font-weight:600;line-height:1.2;letter-spacing:normal;text-transform:none;text-align:center;cursor:pointer;box-shadow:var(--ui-shadow-sm)}
.help-ok:hover{background:var(--ui-primary-hover)}
.help-x:hover{background:var(--ui-surface-muted)}
.help-x:focus-visible,.help-ok:focus-visible{outline:2px solid var(--ui-primary);outline-offset:3px}
@media(prefers-reduced-motion:reduce){dialog.help-dlg[open]{animation:none}}
`;

const list = (items) => el('ul', {}, ...items.map((s) => el('li', { textContent: s })));
function section(icon, title, ...kids) {
  return el('div', { className: 'help-sec' }, el('h3', {}, iconEl(icon), title), ...kids);
}

export function mountHelp({ game, button, content, auto = true, onOpen, onClose }) {
  if (!document.getElementById('help-css')) document.head.append(el('style', { id: 'help-css', textContent: CSS }));
  const c = content[en ? 'en' : 'vi'] ?? content.vi;
  const controls = [
    ...(c.keys?.length ? [el('h4', { textContent: t('Bàn phím / chuột', 'Keyboard / mouse') }), list(c.keys)] : []),
    ...(c.touch?.length ? [el('h4', { textContent: t('Cảm ứng', 'Touch') }), list(c.touch)] : []),
  ];
  const title = t('Cách chơi', 'How to play');
  const dlg = el('dialog', { className: 'help-dlg' },
    el('div', { className: 'help-card' },
      el('div', { className: 'help-head' },
        el('h2', { id: `help-title-${game}` }, iconEl('info'), title),
        el('button', { type: 'button', className: 'help-x', title: t('Đóng', 'Close'), ariaLabel: t('Đóng', 'Close'), onclick: () => dlg.close() }, iconEl('x'))),
      el('div', { className: 'help-body' },
        section('trophy', t('Mục tiêu', 'Goal'), el('p', { textContent: c.goal })),
        section('gamepad-2', t('Cách chơi', 'How it works'), list(c.play)),
        controls.length ? section('hand', t('Điều khiển', 'Controls'), ...controls) : '',
        c.tips?.length ? section('lightbulb', t('Mẹo', 'Tips'), list(c.tips)) : ''),
      el('div', { className: 'help-foot' },
        el('button', { type: 'button', className: 'help-ok', textContent: t('Đã hiểu', 'Got it'), onclick: () => dlg.close() }))));
  dlg.setAttribute('aria-labelledby', `help-title-${game}`);
  // Chạm nền mờ (ngoài thẻ) thì đóng.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { store.set(SEEN_KEY + game, '1'); onClose?.(); });
  // Đang mở: phím không lọt xuống game (mũi tên / Cách...); Esc, Tab, Enter vẫn chạy mặc định trong hộp.
  for (const type of ['keydown', 'keyup']) addEventListener(type, (e) => { if (dlg.open) e.stopPropagation(); }, true);
  document.body.append(dlg);

  const open = () => {
    if (dlg.open) return;
    dlg.showModal();
    dlg.querySelector('.help-body').scrollTop = 0;
    onOpen?.();
  };
  const btns = typeof button === 'string' ? document.querySelectorAll(button) : [button].flat();
  for (const b of btns) {
    b.classList.add('help-btn');
    b.dataset.help = game;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', open);
  }
  if (auto && !store.get(SEEN_KEY + game)) open();
  return { open, close: () => dlg.close(), isOpen: () => dlg.open };
}

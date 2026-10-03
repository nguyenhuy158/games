// Hộp "Cách chơi / How to play" dùng chung mọi game: nút (i) mở hộp thoại (<dialog> modal: Esc / nền mờ / nút đóng,
// Tab chỉ chạy trong hộp), lần đầu vào game tự mở một lần (localStorage 'help.seen.<game>', ghi khi đóng).
//   mountHelp({ game, button, content: { vi, en }, auto?, onOpen?, onClose? }) -> { open, close, isOpen }
//   button: element, mảng element hoặc selector (mọi nút khớp đều mở hộp); content[lang] = {
//     goal: 'Mục tiêu', play: ['Cách chơi'...], keys: ['Bàn phím / chuột'...], touch: ['Cảm ứng'...], tips: ['Mẹo'...] }
// Kiểu dáng tự chèn một lần (game không dùng chung file css nào), màu riêng không phụ thuộc theme từng game.
import { t, en } from './i18n.js';
import { iconEl } from './icons.js';
import { el, store } from './dom.js';

const SEEN_KEY = 'help.seen.';
const CSS = `
.help-btn{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
dialog.help-dlg{padding:0;border:0;background:transparent;color:#3b2f4a;width:min(420px,calc(100vw - 24px));max-width:none;
  max-height:calc(100dvh - 24px);overflow:visible;font:15px/1.45 "Be Vietnam Pro","Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:text}
dialog.help-dlg::backdrop{background:#1d1530a8;backdrop-filter:blur(3px)}
dialog.help-dlg[open]{animation:help-pop .18s ease-out}
@keyframes help-pop{from{transform:scale(.94);opacity:0}}
.help-card{display:flex;flex-direction:column;max-height:calc(100dvh - 24px);background:#fffaf4;border:3px solid #ffd1e6;border-radius:24px;
  box-shadow:0 6px 0 #ffb3d4,0 18px 50px #0007;overflow:hidden}
.help-head{display:flex;align-items:center;gap:10px;padding:12px 10px 10px 16px;background:linear-gradient(#ffe3ef,#fff2f8);border-bottom:2px dashed #ffc4de}
.help-head h2{flex:1;margin:0;font-size:19px;font-weight:800;color:#c2307a;display:flex;align-items:center;gap:8px}
.help-head h2 .ic{width:28px;height:28px;padding:5px;border-radius:50%;background:#ff7ab6;color:#fff}
.help-x{width:44px;height:44px;flex:none;border-radius:50%;border:2px solid #ffc4de;background:#fff;color:#c2307a;display:grid;place-items:center;cursor:pointer;padding:0}
.help-body{overflow:auto;overscroll-behavior:contain;padding:12px 16px;display:grid;gap:12px}
.help-sec h3{margin:0 0 6px;font-size:14px;font-weight:800;display:flex;align-items:center;gap:6px;color:#4a3a63}
.help-sec h3 .ic{width:24px;height:24px;padding:4px;border-radius:9px;background:var(--hc);color:#fff}
.help-sec p,.help-sec ul{margin:0;font-size:14px;color:#4f4462}
.help-sec ul{padding-left:1.15em;display:grid;gap:4px}
.help-sec h4{margin:6px 0 3px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9a7fb5}
.help-sec h4:first-of-type{margin-top:0}
.help-foot{padding:10px 16px 14px;display:flex;justify-content:center}
.help-ok{min-height:44px;min-width:140px;border-radius:999px;border:0;background:#ff7ab6;color:#fff;font:inherit;font-weight:800;cursor:pointer;box-shadow:0 4px 0 #d9468f}
.help-ok:active{transform:translateY(2px);box-shadow:0 2px 0 #d9468f}
.help-x:focus-visible,.help-ok:focus-visible{outline:3px solid #8b5cf6;outline-offset:2px}
`;

const list = (items) => el('ul', {}, ...items.map((s) => el('li', { textContent: s })));
function section(icon, color, title, ...kids) {
  const s = el('section', { className: 'help-sec' }, el('h3', {}, iconEl(icon), title), ...kids);
  s.style.setProperty('--hc', color);
  return s;
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
      el('header', { className: 'help-head' },
        el('h2', { id: `help-title-${game}` }, iconEl('info'), title),
        el('button', { type: 'button', className: 'help-x', title: t('Đóng', 'Close'), ariaLabel: t('Đóng', 'Close'), onclick: () => dlg.close() }, iconEl('x'))),
      el('div', { className: 'help-body' },
        section('trophy', '#ffb020', t('Mục tiêu', 'Goal'), el('p', { textContent: c.goal })),
        section('gamepad-2', '#8b5cf6', t('Cách chơi', 'How it works'), list(c.play)),
        controls.length ? section('hand', '#2fb8ac', t('Điều khiển', 'Controls'), ...controls) : '',
        c.tips?.length ? section('lightbulb', '#ff7ab6', t('Mẹo', 'Tips'), list(c.tips)) : ''),
      el('footer', { className: 'help-foot' },
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

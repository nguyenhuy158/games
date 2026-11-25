// Song ngữ vi / en (mặc định vi). Chọn bằng nút langToggle() hoặc ?lang=en, nhớ trong localStorage 'lang' cho mọi game.
//   JS:   t('Tạo phòng', 'Create room')  — chuỗi tiếng Việt ngay cạnh tiếng Anh, template string dùng thoải mái.
//   Server gửi chữ dạng cặp ['vi', 'en'] (tiêu đề kết quả, lỗi...): tx(x) chọn đúng ngôn ngữ (chuỗi thường thì giữ nguyên).
//   HTML tĩnh: data-en="..." (thay chữ), data-en-html (thay HTML), data-en-title / data-en-placeholder / data-en-aria-label.
import { iconEl } from './icons.js';
const saved = (() => { try { return localStorage.getItem('lang'); } catch { return null; } })();
const q = new URLSearchParams(location.search).get('lang');
export const lang = q === 'en' || q === 'vi' ? q : saved === 'en' ? 'en' : 'vi';
if (q && q !== saved) try { localStorage.setItem('lang', q); } catch {}
export const en = lang === 'en';
export const t = (vi, e) => (en && e != null ? e : vi);
export const tx = (x) => (Array.isArray(x) ? t(x[0], x[1]) : x);

export function applyStatic(root = document) {
  if (!en) return;
  for (const n of root.querySelectorAll('[data-en]')) n.textContent = n.dataset.en;
  for (const n of root.querySelectorAll('[data-en-html]')) n.innerHTML = n.dataset.enHtml;
  for (const a of ['title', 'placeholder', 'aria-label']) {
    const key = `en${a.replace(/(^|-)(\w)/g, (_, _d, c) => c.toUpperCase())}`;
    for (const n of root.querySelectorAll(`[data-en-${a}]`)) n.setAttribute(a, n.dataset[key]);
  }
}
document.documentElement.lang = lang;
applyStatic();

// Nút chuyển ngôn ngữ: icon ngôn ngữ, bấm vào trượt ngang ra cờ Việt Nam | cờ Anh (SVG vẽ sẵn, không dùng emoji).
// Chọn cờ khác thì tải lại trang (giữ ?r=CODE nên vẫn về đúng phòng).
const FLAGS = {
  vi: '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#da251d"/><polygon fill="#ffcd00" points="15,4.5 16.35,8.65 20.71,8.65 17.18,11.21 18.53,15.35 15,12.79 11.47,15.35 12.82,11.21 9.29,8.65 13.65,8.65"/></svg>',
  en: '<svg viewBox="0 0 60 30"><clipPath id="ukc"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><rect width="60" height="30" fill="#012169"/>'
    + '<path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#ukc)" stroke="#c8102e" stroke-width="4"/>'
    + '<path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#c8102e" stroke-width="6"/></svg>',
};
const LANG_NAMES = { vi: 'Tiếng Việt', en: 'English' };
const FLAGS_OPEN_WIDTH = '80px';
function flagButton(k) {
  const on = k === lang;
  const b = document.createElement('button');
  b.type = 'button';
  b.title = LANG_NAMES[k];
  b.setAttribute('aria-label', LANG_NAMES[k]);
  b.setAttribute('aria-pressed', String(on));
  b.style.cssText = `display:inline-block;flex:none;width:24px;height:16px;min-width:0;min-height:0;padding:0;border:0;border-radius:3px;overflow:hidden;cursor:pointer;line-height:0;box-shadow:0 0 0 ${on ? 2 : 1}px var(${on ? '--ui-primary' : '--ui-border'});opacity:${on ? 1 : 0.45}`;
  b.innerHTML = FLAGS[k];
  b.firstChild.setAttribute('width', '24');
  b.firstChild.setAttribute('height', '16');
  b.firstChild.setAttribute('preserveAspectRatio', 'xMidYMid slice'); // cờ Anh 2:1 -> cắt vừa khung 3:2
  return b;
}
export function langToggle() {
  const box = document.createElement('span');
  box.className = 'lang-toggle';
  box.style.cssText = 'display:inline-flex;align-items:center;min-height:44px;padding:0;border:1px solid var(--ui-border);border-radius:var(--ui-radius);background:var(--ui-surface);color:var(--ui-fg);line-height:0';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Ngôn ngữ / Language';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-expanded', 'false');
  btn.style.cssText = 'display:inline-flex;align-items:center;align-self:stretch;padding:0 10px;border:0;background:none;color:inherit;cursor:pointer;font-size:18px';
  btn.append(iconEl('languages'));
  const flags = document.createElement('span');
  flags.style.cssText = 'display:inline-flex;gap:8px;align-items:center;max-width:0;opacity:0;overflow:hidden;padding:3px 0 3px 2px;transition:max-width var(--ui-dur-fast) var(--ui-ease-out),opacity var(--ui-dur-fast),padding var(--ui-dur-fast)';
  for (const k of ['vi', 'en']) {
    const f = flagButton(k);
    f.onclick = () => {
      if (k === lang) return setOpen(false);
      try { localStorage.setItem('lang', k); } catch {}
      const u = new URL(location.href);
      u.searchParams.delete('lang');
      location.replace(u);
    };
    flags.append(f);
  }
  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    flags.inert = !open;
    flags.style.maxWidth = open ? FLAGS_OPEN_WIDTH : '0';
    flags.style.opacity = open ? '1' : '0';
    flags.style.paddingRight = open ? '10px' : '0';
  };
  setOpen(false);
  btn.onclick = () => setOpen(btn.getAttribute('aria-expanded') !== 'true');
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) setOpen(false); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
  box.append(btn, flags);
  return box;
}
// Chỗ đặt nút trong HTML tĩnh: <span data-lang-toggle></span>
for (const n of document.querySelectorAll('[data-lang-toggle]')) n.replaceWith(langToggle());

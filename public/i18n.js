// Song ngữ vi / en (mặc định vi). Chọn bằng nút langToggle() hoặc ?lang=en, nhớ trong localStorage 'lang' cho mọi game.
//   JS:   t('Tạo phòng', 'Create room')  — chuỗi tiếng Việt ngay cạnh tiếng Anh, template string dùng thoải mái.
//   Server gửi chữ dạng cặp ['vi', 'en'] (tiêu đề kết quả, lỗi...): tx(x) chọn đúng ngôn ngữ (chuỗi thường thì giữ nguyên).
//   HTML tĩnh: data-en="..." (thay chữ), data-en-html (thay HTML), data-en-title / data-en-placeholder / data-en-aria-label.
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

// Nút chuyển ngôn ngữ: cờ Việt Nam | cờ Anh (SVG vẽ sẵn, không dùng emoji). Đổi xong tải lại trang (giữ ?r=CODE nên vẫn về đúng phòng).
const FLAGS = {
  vi: '<svg viewBox="0 0 30 20"><rect width="30" height="20" fill="#da251d"/><polygon fill="#ffcd00" points="15,4.5 16.35,8.65 20.71,8.65 17.18,11.21 18.53,15.35 15,12.79 11.47,15.35 12.82,11.21 9.29,8.65 13.65,8.65"/></svg>',
  en: '<svg viewBox="0 0 60 30"><clipPath id="ukc"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><rect width="60" height="30" fill="#012169"/>'
    + '<path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#ukc)" stroke="#c8102e" stroke-width="4"/>'
    + '<path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#c8102e" stroke-width="6"/></svg>',
};
export function langToggle() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'lang-toggle';
  b.title = en ? 'Chuyển sang tiếng Việt' : 'Switch to English';
  b.setAttribute('aria-label', b.title);
  b.style.cssText = 'display:inline-flex;gap:6px;align-items:center;padding:4px 6px;border-radius:999px;cursor:pointer;line-height:0';
  for (const k of ['vi', 'en']) {
    const f = document.createElement('span');
    f.innerHTML = FLAGS[k];
    const on = k === lang;
    f.style.cssText = `display:inline-block;width:24px;height:16px;border-radius:3px;overflow:hidden;box-shadow:0 0 0 ${on ? 2 : 1}px ${on ? '#ffd23f' : '#0003'};opacity:${on ? 1 : 0.45};transition:opacity .15s`;
    f.firstChild.setAttribute('width', '24');
    f.firstChild.setAttribute('height', '16');
    f.firstChild.setAttribute('preserveAspectRatio', 'xMidYMid slice'); // cờ Anh 2:1 -> cắt vừa khung 3:2
    b.append(f);
  }
  b.onclick = () => {
    try { localStorage.setItem('lang', en ? 'vi' : 'en'); } catch {}
    const u = new URL(location.href);
    u.searchParams.delete('lang');
    location.replace(u);
  };
  return b;
}
// Chỗ đặt nút trong HTML tĩnh: <span data-lang-toggle></span>
for (const n of document.querySelectorAll('[data-lang-toggle]')) n.replaceWith(langToggle());

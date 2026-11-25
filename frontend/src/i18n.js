// Song ngữ vi / en (mặc định vi). Chọn trong Cài đặt của sidebar (setLang) hoặc ?lang=en, nhớ trong localStorage 'lang' cho mọi game.
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

export function setLang(k) {
  try { localStorage.setItem('lang', k); } catch {}
  const u = new URL(location.href);
  u.searchParams.delete('lang');
  location.replace(u);
}

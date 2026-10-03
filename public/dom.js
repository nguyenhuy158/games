// Helper DOM + localStorage dùng chung mọi trang (trước đây mỗi game chép một bản).
export const $ = (s) => document.querySelector(s);
export const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
// localStorage có thể bị chặn (chế độ riêng tư, iframe): lỗi thì coi như không có.
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

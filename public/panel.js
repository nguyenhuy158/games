// Khung "màn hình người chơi khác" kiểu Google Meet, dùng chung cho các game nhiều người.
// Màn ngang: cột bên phải; màn dọc: hàng trên cùng (CSS quyết định qua .arena, xem style.css
// từng game). Có nút ẩn/hiện, nhớ lựa chọn trong localStorage.
//
// tiles: [{ key, name, sub, color, badge?, me?, off?, version?, draw? }]  (badge: chữ hoặc { icon: 'tên lucide' })
//   draw(ctx, w, h): vẽ bàn thu nhỏ (chỉ gọi lại khi version / cỡ ô đổi); không có draw -> thẻ "avatar".

import { icon } from './icons.js';
import { t } from './i18n.js';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

export function createPanel({ root, toggle, storeKey }) {
  const cache = new Map(); // key -> { node, canvas, version, nameEl, subEl, badgeEl }
  let hidden = false;
  try { hidden = localStorage.getItem(storeKey) === '1'; } catch {}

  const apply = () => {
    document.body.classList.toggle('panel-off', hidden);
    toggle.classList.toggle('on', !hidden);
    toggle.title = hidden ? t('Hiện màn hình người chơi khác', 'Show other players') : t('Ẩn màn hình người chơi khác', 'Hide other players');
  };
  toggle.onclick = () => {
    hidden = !hidden;
    try { localStorage.setItem(storeKey, hidden ? '1' : '0'); } catch {}
    apply();
  };
  apply();

  function tileNode(t) {
    let c = cache.get(t.key);
    if (!c) {
      const canvas = t.draw ? el('canvas', { className: 'tile-board' }) : null;
      const avatar = t.draw ? null : el('div', { className: 'tile-avatar' });
      const nameEl = el('b');
      const subEl = el('span');
      const badgeEl = el('i', { className: 'tile-badge' });
      const node = el('div', { className: 'tile' }, canvas ?? avatar, badgeEl, el('div', { className: 'tile-label' }, nameEl, subEl));
      c = { node, canvas, avatar, nameEl, subEl, badgeEl, version: null };
      cache.set(t.key, c);
    }
    c.node.style.setProperty('--c', t.color);
    c.node.classList.toggle('me', !!t.me);
    c.node.classList.toggle('off', !!t.off);
    c.nameEl.textContent = t.name;
    c.subEl.textContent = t.sub ?? '';
    const bk = t.badge?.icon ? `i:${t.badge.icon}` : t.badge ?? '';
    if (c.bk !== bk) { c.bk = bk; if (t.badge?.icon) c.badgeEl.innerHTML = icon(t.badge.icon); else c.badgeEl.textContent = bk; }
    c.badgeEl.hidden = !t.badge;
    if (c.avatar) c.avatar.textContent = (t.name || '?').trim().charAt(0).toUpperCase();
    // Vẽ lại bàn khi dữ liệu đổi hoặc kích thước ô đổi.
    if (c.canvas) {
      const w = c.canvas.clientWidth, h = c.canvas.clientHeight;
      const v = `${t.version}|${w}x${h}`;
      if (w && h && v !== c.version) {
        const dpr = window.devicePixelRatio || 1;
        c.canvas.width = Math.round(w * dpr);
        c.canvas.height = Math.round(h * dpr);
        const ctx = c.canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        t.draw(ctx, w, h);
        c.version = v;
      }
    }
    return c.node;
  }

  return {
    update(tiles) {
      document.body.classList.toggle('panel-empty', !tiles.length);
      toggle.hidden = !tiles.length;
      const keep = new Set(tiles.map((t) => t.key));
      for (const k of [...cache.keys()]) if (!keep.has(k)) { cache.get(k).node.remove(); cache.delete(k); }
      const nodes = tiles.map(tileNode);
      // Chỉ sắp lại DOM khi thứ tự đổi (tránh nháy).
      if (nodes.some((n, i) => root.children[i] !== n)) root.replaceChildren(...nodes);
    },
  };
}

// Vẽ bàn lưới thu nhỏ từ sprite ngang (mỗi loại 1 ô, tỉ lệ 4:5), giữ tỉ lệ, căn giữa.
// board có viền 1 ô (giá trị 0) như logic.js của Pikachu.
export function drawGrid(ctx, w, h, board, sprite, types = 36) {
  ctx.clearRect(0, 0, w, h);
  if (!board || !sprite?.complete) return;
  const R = board.length - 2, C = board[0].length - 2;
  const portrait = h > w * 1.1 && R < C; // ô dọc thì xoay bàn như bàn chính
  const rows = portrait ? C : R, cols = portrait ? R : C;
  const cw = Math.min(w / cols, h / rows / 1.25), ch = cw * 1.25;
  const ox = (w - cw * cols) / 2, oy = (h - ch * rows) / 2;
  const sw = sprite.naturalWidth / types, sh = sprite.naturalHeight;
  for (let r = 1; r <= R; r++) {
    for (let c = 1; c <= C; c++) {
      const t = board[r][c];
      if (!t) continue;
      const [x, y] = portrait ? [r - 1, c - 1] : [c - 1, r - 1];
      ctx.drawImage(sprite, (t - 1) * sw, 0, sw, sh, ox + x * cw, oy + y * ch, cw - 0.5, ch - 0.5);
    }
  }
}

// Đăng nhập Google qua SSO auth.huyab.click (dùng chung với chia-keo) + lịch sử chơi ở trang chủ.
import { iconEl, hydrateIcons } from './icons.js';

hydrateIcons();

const SSO = 'https://auth.huyab.click';
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const GAMES = { pikachu: 'Pikachu', 'dao-vang': 'Đào Vàng', 'do-min': 'Dò mìn', 'bau-cua': 'Bầu cua' };
const MODES = { coop: 'Chơi chung', race: 'Đua', team: 'Đội 2v2', versus: 'Tranh vàng', solo: 'Một mình', rotate: 'Xoay cái', house: 'Máy làm cái' };
const back = () => encodeURIComponent(location.origin + '/');
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// Điểm hiển thị theo game: Đào Vàng = tiền, Dò mìn = thời gian (giây), còn lại = điểm.
const scoreText = (game, v) => (game === 'dao-vang' ? `$${v}` : game === 'do-min' ? mmss(v) : game === 'bau-cua' ? `${v > 0 ? '+' : ''}${v} xu` : v);

const ago = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return new Date(t).toLocaleDateString('vi-VN');
};

async function load() {
  let me = null;
  try { me = await (await fetch('/api/me')).json(); } catch { return; } // mất mạng: bỏ qua, trang vẫn dùng được
  const acc = $('#account');
  if (!me?.user) {
    acc.replaceChildren(el('a', { className: 'primary', href: `${SSO}/login?redirect_uri=${back()}`, textContent: 'Đăng nhập Google' }));
    return;
  }
  const { user, stats } = me;
  // Tên Google làm tên mặc định trong game nếu chưa tự đặt.
  try { if (!localStorage.getItem('pk.name')) localStorage.setItem('pk.name', user.name.slice(0, 20)); } catch {}
  acc.replaceChildren(
    user.picture ? el('img', { src: user.picture, alt: '', referrerPolicy: 'no-referrer' }) : '',
    el('span', { textContent: user.name }),
    el('a', { href: `${SSO}/logout?redirect_uri=${back()}`, textContent: 'Đăng xuất' }),
  );
  $('#me').hidden = false;
  $('#funHint').hidden = true;
  $('#stats').replaceChildren(...(stats.length ? stats.map((s) => el('div', { className: 'stat' },
    el('b', { textContent: GAMES[s.game] ?? s.game }),
    el('span', {}, 'Số ván: ', el('strong', { textContent: s.plays }), s.wins ? ` · thắng ${s.wins}` : ''),
    s.game === 'do-min'
      ? el('span', {}, 'Thắng nhanh nhất: ', el('strong', { textContent: s.fastest != null ? mmss(s.fastest) : '—' }))
      : s.game === 'bau-cua'
      ? el('span', {}, 'Lãi đậm nhất: ', el('strong', { textContent: scoreText(s.game, s.best) }))
      : el('span', {}, 'Điểm cao nhất: ', el('strong', { textContent: scoreText(s.game, s.best) }), ` · màn xa nhất ${s.maxLevel}`),
  )) : [el('p', { className: 'sub', textContent: 'Chưa có ván nào — chơi thử một ván đi!' })]));
  const hist = await (await fetch('/api/me/history')).json();
  $('#history').replaceChildren(...hist.map((h) => {
    const d = (() => { try { return JSON.parse(h.detail || '{}'); } catch { return {}; } })();
    const extra = d.with?.length ? ` · cùng ${d.with.join(', ')}` : d.rank ? ` · hạng ${d.rank}/${d.of}` : d.size ? ` · ${d.size}, mở ${d.opened} ô, nổ ${d.booms}` : '';
    return el('li', {},
      el('b', { textContent: GAMES[h.game] ?? h.game }),
      el('span', { textContent: `${MODES[h.mode] ?? h.mode}${h.game === 'do-min' ? '' : h.game === 'bau-cua' ? ` · ${h.level} ván` : ` · màn ${h.level}`}${extra}` }),
      el('span', { className: 'score', textContent: scoreText(h.game, h.score) }),
      h.won ? el('span', { className: 'won' }, iconEl('trophy'), ' thắng') : '',
      el('span', { className: 'when', textContent: ago(h.at) }),
    );
  }));
}
load();

// ---------- bảng xếp hạng vui ----------
// Top 3 = huy chương vàng/bạc/đồng (icon medal tô màu), còn lại ghi số.
const MEDALS = ['#ffd23f', '#cfd8e3', '#e39a5b'];
const rank = (i) => {
  if (!MEDALS[i]) return String(i + 1);
  const m = iconEl('medal');
  m.setAttribute('style', `color:${MEDALS[i]}`);
  return m;
};
const FUN_ICONS = { plays: 'gamepad-2', wins: 'crown', gold: 'coins', tiles: 'zap', deep: 'pickaxe', mines: 'bomb', baucua: 'dices', team: 'handshake', night: 'moon' };
let period = 'week';
async function loadFun() {
  for (const b of document.querySelectorAll('#funPeriod button')) b.classList.toggle('on', b.dataset.period === period);
  let cats;
  try { cats = await (await fetch(`/api/fun?period=${period}`)).json(); } catch { return; }
  $('#funList').replaceChildren(...cats.map((c) => el('div', { className: 'fun-card' },
    el('b', {}, iconEl(FUN_ICONS[c.key] ?? 'trophy'), ` ${c.title}`),
    c.rows.length
      ? el('ol', {}, ...c.rows.map((r, i) => el('li', {},
        el('span', { className: 'rank' }, rank(i)),
        el('span', { className: 'name', textContent: r.name }),
        el('span', { className: 'val', textContent: c.unit === '$' ? `$${r.value}` : c.unit === 'giây' ? mmss(r.value) : `${r.value} ${c.unit}` }),
      )))
      : el('span', { className: 'empty', textContent: 'Chưa ai giành — cơ hội của bạn!' }),
  )));
}
for (const b of document.querySelectorAll('#funPeriod button')) b.onclick = () => { period = b.dataset.period; loadFun(); };
loadFun();

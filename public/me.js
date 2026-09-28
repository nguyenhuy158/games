// Đăng nhập Google qua SSO auth.huyab.click (dùng chung với chia-keo) + lịch sử chơi ở trang chủ.
const SSO = 'https://auth.huyab.click';
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const GAMES = { pikachu: 'Pikachu', 'dao-vang': 'Đào Vàng' };
const MODES = { coop: 'Chơi chung', race: 'Đua', team: 'Đội 2v2', versus: 'Tranh vàng', solo: 'Một mình' };
const back = () => encodeURIComponent(location.origin + '/');

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
    el('span', {}, 'Điểm cao nhất: ', el('strong', { textContent: s.game === 'dao-vang' ? `$${s.best}` : s.best }), ` · màn xa nhất ${s.maxLevel}`),
  )) : [el('p', { className: 'sub', textContent: 'Chưa có ván nào — chơi thử một ván đi!' })]));
  const hist = await (await fetch('/api/me/history')).json();
  $('#history').replaceChildren(...hist.map((h) => {
    const d = (() => { try { return JSON.parse(h.detail || '{}'); } catch { return {}; } })();
    const extra = d.with?.length ? ` · cùng ${d.with.join(', ')}` : d.rank ? ` · hạng ${d.rank}/${d.of}` : '';
    return el('li', {},
      el('b', { textContent: GAMES[h.game] ?? h.game }),
      el('span', { textContent: `${MODES[h.mode] ?? h.mode} · màn ${h.level}${extra}` }),
      el('span', { className: 'score', textContent: h.game === 'dao-vang' ? `$${h.score}` : h.score }),
      h.won ? el('span', { className: 'won', textContent: '🏆 thắng' }) : '',
      el('span', { className: 'when', textContent: ago(h.at) }),
    );
  }));
}
load();

// ---------- bảng xếp hạng vui ----------
const MEDALS = ['🥇', '🥈', '🥉', '4', '5'];
let period = 'week';
async function loadFun() {
  for (const b of document.querySelectorAll('#funPeriod button')) b.classList.toggle('on', b.dataset.period === period);
  let cats;
  try { cats = await (await fetch(`/api/fun?period=${period}`)).json(); } catch { return; }
  $('#funList').replaceChildren(...cats.map((c) => el('div', { className: 'fun-card' },
    el('b', { textContent: c.title }),
    c.rows.length
      ? el('ol', {}, ...c.rows.map((r, i) => el('li', {},
        el('span', { className: 'rank', textContent: MEDALS[i] }),
        el('span', { className: 'name', textContent: r.name }),
        el('span', { className: 'val', textContent: c.unit === '$' ? `$${r.value}` : `${r.value} ${c.unit}` }),
      )))
      : el('span', { className: 'empty', textContent: 'Chưa ai giành — cơ hội của bạn!' }),
  )));
}
for (const b of document.querySelectorAll('#funPeriod button')) b.onclick = () => { period = b.dataset.period; loadFun(); };
loadFun();

// Đăng nhập Google qua SSO auth.huyab.click (dùng chung với chia-keo) + lịch sử chơi ở trang chủ.
import { iconEl, hydrateIcons } from './icons.js';
import { t, en } from './i18n.js';
import { replayLinks } from './replay.js';

hydrateIcons();

const SSO = 'https://auth.huyab.click';
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const GAMES = en
  ? { pikachu: 'Pikachu', 'dao-vang': 'Gold Miner', 'do-min': 'Minesweeper', 'bau-cua': 'Bau Cua', 'co-caro': 'Gomoku', 'noi-4': 'Connect 4', 'ban-tau': 'Battleship', snake: 'Snake', bantumi: 'Bantumi', pairs: 'Pairs', logic: 'Logic', 'rapid-roll': 'Rapid Roll', 'space-impact': 'Space Impact', bounce: 'Bounce', 'o-an-quan': 'O An Quan', 'co-ganh': 'Co Ganh', 'co-tuong': 'Xiangqi' }
  : { pikachu: 'Pikachu', 'dao-vang': 'Đào Vàng', 'do-min': 'Dò mìn', 'bau-cua': 'Bầu cua', 'co-caro': 'Cờ caro', 'noi-4': 'Nối 4', 'ban-tau': 'Bắn tàu', snake: 'Rắn săn mồi', bantumi: 'Bantumi', pairs: 'Lật hình', logic: 'Logic', 'rapid-roll': 'Rapid Roll', 'space-impact': 'Space Impact', bounce: 'Bounce', 'o-an-quan': 'Ô ăn quan', 'co-ganh': 'Cờ gánh', 'co-tuong': 'Cờ tướng' };
const MODES = en
  ? { coop: 'Co-op', race: 'Race', team: 'Team 2v2', versus: 'Gold rush', solo: 'Solo', rotate: 'Rotating dealer', house: 'Bot dealer', pvp: 'PvP', bot: 'Vs bot', multi: 'Multiplayer' }
  : { coop: 'Chơi chung', race: 'Đua', team: 'Đội 2v2', versus: 'Tranh vàng', solo: 'Một mình', rotate: 'Xoay cái', house: 'Máy làm cái', pvp: 'Đối kháng', bot: 'Với máy', multi: 'Nhiều người' };
const back = () => encodeURIComponent(location.origin + '/');
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// Điểm hiển thị theo game: Đào Vàng = tiền, Dò mìn = thời gian (giây), còn lại = điểm.
const moves = (v) => t(`${v} nước`, `${v} moves`);
const SCORE = {
  'dao-vang': (v) => `$${v}`, 'do-min': mmss, 'bau-cua': (v) => `${v > 0 ? '+' : ''}${v} ${t('xu', 'coins')}`, 'co-caro': moves, 'noi-4': moves,
  'ban-tau': (v) => t(`${v} phát`, `${v} shots`), snake: (v) => t(`${v} điểm`, `${v} pts`), bantumi: (v) => t(`${v} sỏi`, `${v} seeds`), 'rapid-roll': (v) => `${v} m`, bounce: (v) => t(`${v} giây`, `${v} s`), 'space-impact': (v) => t(`${v} điểm`, `${v} pts`), logic: (v) => (v ? t(`${v} lượt`, `${v} guesses`) : t('chưa giải', 'unsolved')), 'o-an-quan': (v) => t(`${v} điểm`, `${v} pts`), 'co-ganh': (v) => t(`${v} quân`, `${v} pieces`), 'co-tuong': moves,
};
const scoreText = (game, v) => (SCORE[game] ?? String)(v);
// "level" mỗi game mang nghĩa khác nhau.
const LEVEL = { 'do-min': () => '', 'bau-cua': (l) => t(` · ${l} ván`, ` · ${l} rounds`), 'co-caro': (l) => t(` · bàn ${l}×${l}`, ` · ${l}×${l} board`), 'noi-4': () => '', 'ban-tau': () => '',
  snake: (l) => t(` · tốc độ ${l}`, ` · speed ${l}`), bantumi: (l) => t(` · ${l} sỏi/hố`, ` · ${l} seeds/pit`), pairs: () => '', logic: () => '', 'rapid-roll': () => '', 'co-ganh': () => '', 'co-tuong': () => '', 'o-an-quan': () => '' };
const levelText = (game, l) => (LEVEL[game] ?? ((x) => t(` · màn ${x}`, ` · level ${x}`)))(l);

const ago = (at) => {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return t('vừa xong', 'just now');
  if (s < 3600) return t(`${Math.floor(s / 60)} phút trước`, `${Math.floor(s / 60)} min ago`);
  if (s < 86400) return t(`${Math.floor(s / 3600)} giờ trước`, `${Math.floor(s / 3600)} h ago`);
  return new Date(at).toLocaleDateString(en ? 'en-US' : 'vi-VN');
};

async function load() {
  let me = null;
  try { me = await (await fetch('/api/me')).json(); } catch { return; } // mất mạng: bỏ qua, trang vẫn dùng được
  const acc = $('#account');
  if (!me?.user) {
    acc.replaceChildren(el('a', { className: 'primary', href: `${SSO}/login?redirect_uri=${back()}`, textContent: t('Đăng nhập Google', 'Sign in with Google') }));
    return;
  }
  const { user, stats } = me;
  // Tên Google làm tên mặc định trong game nếu chưa tự đặt.
  try { if (!localStorage.getItem('pk.name')) localStorage.setItem('pk.name', user.name.slice(0, 20)); } catch {}
  acc.replaceChildren(
    user.picture ? el('img', { src: user.picture, alt: '', referrerPolicy: 'no-referrer' }) : '',
    el('span', { textContent: user.name }),
    el('a', { href: `${SSO}/logout?redirect_uri=${back()}`, textContent: t('Đăng xuất', 'Sign out') }),
  );
  $('#me').hidden = false;
  $('#funHint').hidden = true;
  $('#stats').replaceChildren(...(stats.length ? stats.map((s) => el('div', { className: 'stat' },
    el('b', { textContent: GAMES[s.game] ?? s.game }),
    el('span', {}, t('Số ván: ', 'Games: '), el('strong', { textContent: s.plays }), s.wins ? t(` · thắng ${s.wins}`, ` · won ${s.wins}`) : ''),
    ['do-min', 'co-caro', 'noi-4', 'ban-tau'].includes(s.game)
      ? el('span', {}, t('Thắng nhanh nhất: ', 'Fastest win: '), el('strong', { textContent: s.fastest != null ? scoreText(s.game, s.fastest) : '—' }))
      : s.game === 'bau-cua'
      ? el('span', {}, t('Lãi đậm nhất: ', 'Biggest profit: '), el('strong', { textContent: scoreText(s.game, s.best) }))
      : el('span', {}, t('Điểm cao nhất: ', 'Best score: '), el('strong', { textContent: scoreText(s.game, s.best) }), t(` · màn xa nhất ${s.maxLevel}`, ` · furthest level ${s.maxLevel}`)),
  )) : [el('p', { className: 'sub', textContent: t('Chưa có ván nào — chơi thử một ván đi!', 'No games yet — go play one!') })]));
  $('#history').replaceChildren();
  await moreHistory();
}
// Thêm 30 ván cũ hơn vào cuối danh sách; còn nữa thì hiện nút "Xem thêm".
let oldest = 0;
async function moreHistory() {
  const hist = await (await fetch(`/api/me/history${oldest ? `?before=${oldest}` : ''}`)).json();
  if (hist.length) oldest = hist.at(-1).at;
  $('#history').append(...hist.map((h) => {
    const d = (() => { try { return JSON.parse(h.detail || '{}'); } catch { return {}; } })();
    const extra = d.vs ? t(` · gặp ${d.vs}`, ` · vs ${d.vs}`) : d.with?.length ? t(` · cùng ${d.with.join(', ')}`, ` · with ${d.with.join(', ')}`) : d.rank ? t(` · hạng ${d.rank}/${d.of}`, ` · rank ${d.rank}/${d.of}`)
      : d.size ? t(` · ${d.size}, mở ${d.opened} ô, nổ ${d.booms}`, ` · ${d.size}, opened ${d.opened}, booms ${d.booms}`) : '';
    return el('li', {},
      el('b', { textContent: GAMES[h.game] ?? h.game }),
      el('span', { textContent: `${MODES[h.mode] ?? h.mode}${levelText(h.game, h.level)}${extra}` }),
      el('span', { className: 'score', textContent: scoreText(h.game, h.score) }),
      h.won ? el('span', { className: 'won' }, iconEl('trophy'), t(' thắng', ' won')) : '',
      el('span', { className: 'when', textContent: ago(h.at) }),
      d.rp ? replayLinks(d.rp) : '',
    );
  }));
  let btn = $('#historyMore');
  if (!btn) {
    btn = el('button', { id: 'historyMore', className: 'btn', textContent: t('Xem thêm', 'Show more') });
    btn.onclick = async () => { btn.disabled = true; await moreHistory(); btn.disabled = false; };
    $('#history').after(btn);
  }
  btn.hidden = hist.length < 30;
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
const FUN_ICONS = { plays: 'gamepad-2', wins: 'crown', gold: 'coins', tiles: 'zap', deep: 'pickaxe', mines: 'bomb', baucua: 'dices', caro: 'grid-3x3', c4: 'circle', ships: 'swords', team: 'handshake', night: 'moon', nokia: 'smartphone' };
// Tên hạng mục do server gửi (tiếng Việt, worker/index.js) -> tiếng Anh theo key: [tên, đơn vị].
const FUN_EN = {
  plays: ['Grind champion', 'games'], wins: ['Victory king', 'wins'], gold: ['Gold Miner tycoon', '$'], tiles: ['Tile-matching saint', 'pts'],
  deep: ['Toughest miner', 'levels'], mines: ['Minesweeper saint', 's'], baucua: ['Bau Cua tycoon', 'coins won'], caro: ['Gomoku master', 'wins'],
  c4: ['Connect 4 king', 'wins'], ships: ['Battleship sharpshooter', 'shots'], nokia: ['Nokia legend', 'games'], team: ['Team player', 'team games'],
  night: ['Night owl', 'games at 0–5am'],
};
let period = 'week';
async function loadFun() {
  for (const b of document.querySelectorAll('#funPeriod button')) b.classList.toggle('on', b.dataset.period === period);
  let cats;
  try { cats = await (await fetch(`/api/fun?period=${period}`)).json(); } catch { return; }
  $('#funList').replaceChildren(...cats.map((c) => el('div', { className: 'fun-card' },
    el('b', {}, iconEl(FUN_ICONS[c.key] ?? 'trophy'), ` ${en ? FUN_EN[c.key]?.[0] ?? c.title : c.title}`),
    c.rows.length
      ? el('ol', {}, ...c.rows.map((r, i) => el('li', {},
        el('span', { className: 'rank' }, rank(i)),
        el('span', { className: 'name', textContent: r.name }),
        el('span', { className: 'val', textContent: c.unit === '$' ? `$${r.value}` : c.unit === 'giây' ? mmss(r.value) : `${r.value} ${en ? FUN_EN[c.key]?.[1] ?? c.unit : c.unit}` }),
      )))
      : el('span', { className: 'empty', textContent: t('Chưa ai giành — cơ hội của bạn!', 'Nobody yet — your chance!') }),
  )));
}
for (const b of document.querySelectorAll('#funPeriod button')) b.onclick = () => { period = b.dataset.period; loadFun(); };
loadFun();

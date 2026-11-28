// Đăng nhập Google qua SSO auth.huyab.cfd (dùng chung với chia-keo) + lịch sử chơi ở trang chủ.
import { iconEl, hydrateIcons } from './icons.js';
import { t, en } from './i18n.js';
import { replayLinks } from './replay.js';
import { $, el } from './dom.js';
import { openSettings } from './sidebar.js';
import { PROFILE_API, signInHref, signOutHref } from './account.js';

hydrateIcons();

const HOME_STATS_SELECTOR = '#homeStats';
const ACCOUNT_MENU_SELECTOR = '.account-menu';
const ESCAPE_KEY = 'Escape';
const HOME_STATS_TRIGGER = '#openHomeStats';
const HISTORY_API = '/api/me/history';
const CLAIM_API = '/api/me/history/claim';
const HISTORY_PAGE_SIZE = 30;
const DEFAULT_NAME_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 15000;
const CACHE_POLICY = 'no-store';
const NAME_STORAGE_KEY = 'pk.name';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const POST_METHOD = 'POST';
const FASTEST_GAMES = new Set(['do-min', 'co-caro', 'noi-4', 'ban-tau', 'sudoku']);
const SUDOKU_LEVELS = [t('Dễ', 'Easy'), t('Vừa', 'Medium'), t('Khó', 'Hard')];
const TETRIS_LEVELS = [t('Thường', 'Normal'), t('Khó', 'Hard'), t('Siêu khó', 'Expert')];
const GAMES = en
  ? { pikachu: 'Pikachu', 'dao-vang': 'Gold Miner', 'do-min': 'Minesweeper', 'bau-cua': 'Bau Cua', 'co-caro': 'Gomoku', 'noi-4': 'Connect 4', 'ban-tau': 'Battleship', snake: 'Snake', bantumi: 'Bantumi', pairs: 'Pairs', logic: 'Logic', 'rapid-roll': 'Rapid Roll', 'space-impact': 'Space Impact', bounce: 'Bounce', 'o-an-quan': 'O An Quan', 'co-ganh': 'Co Ganh', 'co-tuong': 'Xiangqi', loto: 'Lo To' }
  : { pikachu: 'Pikachu', 'dao-vang': 'Đào Vàng', 'do-min': 'Dò mìn', 'bau-cua': 'Bầu cua', 'co-caro': 'Cờ caro', 'noi-4': 'Nối 4', 'ban-tau': 'Bắn tàu', snake: 'Rắn săn mồi', bantumi: 'Bantumi', pairs: 'Lật hình', logic: 'Logic', 'rapid-roll': 'Rapid Roll', 'space-impact': 'Space Impact', bounce: 'Bounce', 'o-an-quan': 'Ô ăn quan', 'co-ganh': 'Cờ gánh', 'co-tuong': 'Cờ tướng', loto: 'Lô tô' };
GAMES['undercover'] = t('Ai là gián điệp', 'Undercover');
Object.assign(GAMES, { '2048': '2048', tetris: t('Xếp gạch', 'Tetris'), sudoku: 'Sudoku' });
const MODES = en
  ? { coop: 'Co-op', race: 'Race', team: 'Team 2v2', versus: 'Gold rush', solo: 'Solo', rotate: 'Rotating dealer', house: 'Bot dealer', pvp: 'PvP', bot: 'Vs bot', multi: 'Multiplayer' }
  : { coop: 'Chơi chung', race: 'Đua', team: 'Đội 2v2', versus: 'Tranh vàng', solo: 'Một mình', rotate: 'Xoay cái', house: 'Máy làm cái', pvp: 'Đối kháng', bot: 'Với máy', multi: 'Nhiều người' };
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// Điểm hiển thị theo game: Đào Vàng = tiền, Dò mìn = thời gian (giây), còn lại = điểm.
const moves = (v) => t(`${v} nước`, `${v} moves`);
const SCORE = {
  'dao-vang': (v) => `$${v}`, 'do-min': mmss, 'bau-cua': (v) => `${v > 0 ? '+' : ''}${v} ${t('xu', 'coins')}`, 'co-caro': moves, 'noi-4': moves,
  'ban-tau': (v) => t(`${v} phát`, `${v} shots`), snake: (v) => t(`${v} điểm`, `${v} pts`), bantumi: (v) => t(`${v} sỏi`, `${v} seeds`), 'rapid-roll': (v) => `${v} m`, bounce: (v) => t(`${v} giây`, `${v} s`), 'space-impact': (v) => t(`${v} điểm`, `${v} pts`), logic: (v) => (v ? t(`${v} lượt`, `${v} guesses`) : t('chưa giải', 'unsolved')), 'o-an-quan': (v) => t(`${v} điểm`, `${v} pts`), 'co-ganh': (v) => t(`${v} quân`, `${v} pieces`), 'co-tuong': moves,
  loto: (v) => t(`${v} số đã dò`, `${v} marked`),
  sudoku: mmss,
  'undercover': (v) => t(`${v} điểm`, `${v} points`),
};
const scoreText = (game, v) => (SCORE[game] ?? String)(v);
// "level" mỗi game mang nghĩa khác nhau.
const LEVEL = { 'do-min': () => '', 'bau-cua': (l) => t(` · ${l} ván`, ` · ${l} rounds`), 'co-caro': (l) => t(` · bàn ${l}×${l}`, ` · ${l}×${l} board`), 'noi-4': () => '', 'ban-tau': () => '',
  snake: (l) => t(` · tốc độ ${l}`, ` · speed ${l}`), bantumi: (l) => t(` · ${l} sỏi/hố`, ` · ${l} seeds/pit`), pairs: () => '', logic: () => '', 'rapid-roll': () => '', 'co-ganh': () => '', 'co-tuong': () => '', 'o-an-quan': () => '',
  loto: (l) => t(` · gọi ${l} số`, ` · ${l} numbers called`),
  '2048': () => '',
  sudoku: (l) => ` · ${SUDOKU_LEVELS[l - 1] ?? l}`,
  tetris: (l) => ` · ${TETRIS_LEVELS[l - 1] ?? l}` };
LEVEL['undercover'] = () => '';
const levelText = (game, l) => (LEVEL[game] ?? ((x) => t(` · màn ${x}`, ` · level ${x}`)))(l);

const ago = (at) => {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return t('vừa xong', 'just now');
  if (s < 3600) return t(`${Math.floor(s / 60)} phút trước`, `${Math.floor(s / 60)} min ago`);
  if (s < 86400) return t(`${Math.floor(s / 3600)} giờ trước`, `${Math.floor(s / 3600)} h ago`);
  return new Date(at).toLocaleDateString(en ? 'en-US' : 'vi-VN');
};

async function readJSON(url, options = {}) {
  const response = await fetch(url, { cache: CACHE_POLICY, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...options });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const signInLink = () => el('a', { className: 'primary', href: signInHref(), textContent: t('Đăng nhập Google', 'Sign in with Google') });
let loading = false;
let oldest = 0;
let historyLoading = false;

function renderAccount(user) {
  const acc = $('#account');
  $('#funHint').hidden = !!user;
  if (!user) {
    acc.replaceChildren(signInLink());
    $('#meNotice').replaceChildren(
      t('Lịch sử khách chỉ hiện trên trình duyệt này. Xóa cookie hoặc đóng cửa sổ ẩn danh có thể làm mất quyền truy cập. ', 'Guest history is only available in this browser. Clearing cookies or closing a private window can remove access. '),
      signInLink(),
      t(' để giữ các ván đã lưu trong tài khoản. Các ván trước khi có tính năng này không thể khôi phục.', ' to keep saved games in your account. Games played before this feature cannot be recovered.'),
    );
    return;
  }
  try { if (!localStorage.getItem(NAME_STORAGE_KEY)) localStorage.setItem(NAME_STORAGE_KEY, user.name.slice(0, DEFAULT_NAME_LIMIT)); } catch {}
  const menu = el('details', { className: 'account-menu' });
  const settings = el('button', { type: 'button', className: 'btn', onclick: (event) => {
    event.stopPropagation();
    menu.open = false;
    openSettings();
  } }, iconEl('settings'), t('Cài đặt', 'Settings'));
  menu.append(
    el('summary', {},
      user.picture ? el('img', { src: user.picture, alt: '', referrerPolicy: 'no-referrer' }) : '',
      el('span', { textContent: user.name }),
      iconEl('chevron-down'),
    ),
    el('div', { className: 'account-actions' }, settings,
      el('a', { href: signOutHref(), textContent: t('Đăng xuất', 'Sign out') }),
    ),
  );
  acc.replaceChildren(menu);
  $('#meNotice').textContent = t('Lịch sử và thành tích của tài khoản đang đăng nhập.', 'History and stats for your signed-in account.');
}

function renderStats(stats) {
  $('#stats').replaceChildren(...(stats.length ? stats.map((s) => el('div', { className: 'stat' },
    el('b', { textContent: GAMES[s.game] ?? s.game }),
    el('span', {}, t('Số ván: ', 'Games: '), el('strong', { textContent: s.plays }), s.wins ? t(` · thắng ${s.wins}`, ` · won ${s.wins}`) : ''),
    FASTEST_GAMES.has(s.game)
      ? el('span', {}, t('Thắng nhanh nhất: ', 'Fastest win: '), el('strong', { textContent: s.fastest != null ? scoreText(s.game, s.fastest) : '—' }))
      : s.game === 'bau-cua'
      ? el('span', {}, t('Lãi đậm nhất: ', 'Biggest profit: '), el('strong', { textContent: scoreText(s.game, s.best) }))
      : el('span', {}, t('Điểm cao nhất: ', 'Best score: '), el('strong', { textContent: scoreText(s.game, s.best) }), levelText(s.game, s.maxLevel)),
  )) : [el('p', { className: 'sub', textContent: t('Chưa có ván nào — chơi thử một ván đi!', 'No games yet — go play one!') })]));
}

async function load() {
  if (loading) return;
  loading = true;
  const retry = $('#meRetry');
  retry.disabled = true;
  $('#meError').hidden = true;
  $('#meNotice').textContent = t('Đang tải lịch sử…', 'Loading your history…');
  $('#stats').replaceChildren();
  $('#history').replaceChildren();
  $('#historyMore').hidden = true;
  $('#historyRetry').hidden = true;
  $('#historyError').hidden = true;
  oldest = 0;
  try {
    let me = await readJSON(PROFILE_API);
    renderAccount(me.user);
    renderStats(me.stats);
    retry.hidden = true;
    if (me.user && me.guestPending) {
      $('#meNotice').textContent = t('Đang lưu lịch sử khách vào tài khoản…', 'Saving guest history to your account…');
      try {
        await readJSON(CLAIM_API, { method: POST_METHOD, headers: JSON_HEADERS, body: JSON.stringify({}) });
        me = await readJSON(PROFILE_API);
        renderAccount(me.user);
        renderStats(me.stats);
        $('#meNotice').textContent = t('Đã giữ lịch sử khách trong tài khoản này.', 'Guest history is now kept in this account.');
      } catch {
        $('#meNotice').textContent = t('Lịch sử bên dưới là của tài khoản. Lịch sử khách vẫn chưa được xác nhận lưu.', 'The history below belongs to your account. Saving guest history has not been confirmed yet.');
        $('#meError').textContent = t('Chưa lưu được lịch sử khách. Giữ cookie của trình duyệt này và bấm thử lại.', 'Could not save guest history. Keep this browser’s cookies and retry.');
        $('#meError').hidden = false;
        retry.textContent = t('Thử lưu lại lịch sử khách', 'Retry saving guest history');
        retry.hidden = false;
      }
    }
    await moreHistory();
  } catch {
    $('#meNotice').textContent = '';
    $('#meError').textContent = t('Không tải được tài khoản và lịch sử. Kiểm tra kết nối rồi thử lại.', 'Could not load your account and history. Check your connection and retry.');
    $('#meError').hidden = false;
    retry.textContent = t('Thử tải lại', 'Retry loading');
    retry.hidden = false;
  } finally {
    retry.disabled = false;
    loading = false;
  }
}

async function moreHistory() {
  if (historyLoading) return;
  historyLoading = true;
  const more = $('#historyMore'), retry = $('#historyRetry');
  more.disabled = retry.disabled = true;
  $('#historyError').hidden = true;
  try {
    const hist = await readJSON(`${HISTORY_API}${oldest ? `?before=${oldest}` : ''}`);
    if (!Array.isArray(hist)) throw new Error('Invalid history response');
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
    more.hidden = hist.length < HISTORY_PAGE_SIZE;
    retry.hidden = true;
  } catch {
    $('#historyError').textContent = t('Không tải được các ván gần đây. Thử lại để xem lịch sử.', 'Could not load recent games. Retry to view your history.');
    $('#historyError').hidden = false;
    retry.hidden = false;
  } finally {
    more.disabled = retry.disabled = false;
    historyLoading = false;
  }
}
document.addEventListener('click', (event) => {
  const menu = $(ACCOUNT_MENU_SELECTOR);
  if (menu?.open && !menu.contains(event.target)) menu.open = false;
});
document.addEventListener('keydown', (event) => {
  const menu = $(ACCOUNT_MENU_SELECTOR);
  if (event.key !== ESCAPE_KEY || !menu?.open) return;
  menu.open = false;
  menu.firstElementChild.focus();
});
$(HOME_STATS_TRIGGER).onclick = () => $(HOME_STATS_SELECTOR).showModal();
$('#account').replaceChildren(signInLink());
$('#meRetry').onclick = load;
$('#historyRetry').onclick = moreHistory;
$('#historyMore').onclick = moreHistory;
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

// Danh sách phòng công khai của mọi game (GET /api/rooms, tự làm mới). Phòng tự báo lên khi chủ phòng bật "Công khai".
import { hydrateIcons } from '../icons.js';
import { t, en } from '../i18n.js';
import { $, el } from '../dom.js';

hydrateIcons();

// slug -> [tên vi, tên en, logo]. Nokia dùng logo theo tên game, Ô ăn quan theo slug.
const GAMES = {
  pikachu: ['Pikachu nối thú', 'Pikachu Onet'], 'do-min': ['Dò mìn', 'Minesweeper'], 'bau-cua': ['Bầu cua', 'Bau Cua'],
  'o-an-quan': ['Ô ăn quan', 'O An Quan'], 'co-ganh': ['Cờ gánh', 'Co Ganh'], 'co-tuong': ['Cờ tướng', 'Xiangqi'], 'co-caro': ['Cờ caro', 'Gomoku'], 'noi-4': ['Nối 4', 'Connect 4'], 'ban-tau': ['Bắn tàu', 'Battleship'],
  'dao-vang': ['Đào Vàng', 'Gold Miner'], snake: ['Rắn săn mồi', 'Snake'], bantumi: ['Bantumi', 'Bantumi'], pairs: ['Lật hình', 'Pairs'],
  logic: ['Logic', 'Logic'], 'rapid-roll': ['Rapid Roll', 'Rapid Roll'], 'space-impact': ['Space Impact', 'Space Impact'], bounce: ['Bounce', 'Bounce'],
  loto: ['Lô tô', 'Lo To'],
};
const title = (g) => (GAMES[g] ? GAMES[g][en ? 1 : 0] : g);
let filter = new URLSearchParams(location.search).get('game') || '';
let rooms = [];

function render() {
  const games = [...new Set(rooms.map((r) => r.game))];
  $('#filter').replaceChildren(...['', ...games].map((g) => el('button', {
    className: g === filter ? 'on' : '', textContent: g ? title(g) : t('Tất cả', 'All'),
    onclick: () => { filter = g; render(); },
  })));
  const shown = rooms.filter((r) => !filter || r.game === filter);
  for (const [id, status, count] of [['#waiting', 'waiting', '#nWait'], ['#playing', 'playing', '#nPlay']]) {
    const list = shown.filter((r) => r.status === status);
    $(count).textContent = list.length ? `(${list.length})` : '';
    $(id).replaceChildren(...(list.length ? list.map(card) : [el('div', {
      className: 'empty',
      textContent: status === 'waiting'
        ? t('Chưa có phòng nào đang chờ — tạo phòng ở một game rồi bật "Công khai" nhé.', 'No rooms waiting yet — create one in any game and turn on "Public".')
        : t('Không có phòng nào đang chơi.', 'No games in progress.'),
    })]));
  }
}

function card(r) {
  const full = r.cap && r.players >= r.cap;
  const watch = r.status === 'playing' || full;
  const who = [r.host && t(`Chủ phòng ${r.host}`, `Host ${r.host}`), r.mode].filter(Boolean).join(' · ');
  return el('a', { className: `room${watch ? ' watch' : ''}`, href: `${r.path}?r=${encodeURIComponent(r.code)}` },
    el('img', { src: `/logos/${r.game}.svg`, alt: '' }),
    el('div', {},
      el('b', { textContent: `${title(r.game)} · ${r.code}` }),
      el('span', { textContent: `${r.players}${r.cap ? `/${r.cap}` : ''} ${t('người', 'players')}${who ? ` · ${who}` : ''}` })),
    el('span', { className: 'go', textContent: watch ? t('Vào xem', 'Watch') : t('Vào chơi', 'Join') }));
}

async function load() {
  try {
    const r = await fetch('/api/rooms', { cache: 'no-store' });
    if (r.ok) rooms = (await r.json()).rooms ?? [];
  } catch {}
  render();
}
load();
// Tự làm mới; tab ẩn thì thôi (đỡ tốn request), mở lại tab thì tải ngay.
setInterval(() => { if (!document.hidden) load(); }, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

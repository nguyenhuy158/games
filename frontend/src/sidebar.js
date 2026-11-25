// Sidebar điều hướng dùng chung: màn rộng thì cố định bên trái, màn hẹp thì thành ngăn kéo.
// Màn hẹp mở ngăn kéo bằng các link về trang chủ (nút ← của mỗi game), vì ngăn kéo có sẵn link Trang chủ.
import { t } from './i18n.js';
import { iconEl } from './icons.js';

const WIDE_QUERY = '(min-width: 1024px)';
const SIDEBAR_WIDTH = '232px';
const HOME = '/';
const ROOMS = '/phong/';
const GROUPS = [
  { icon: 'swords', vi: 'Cờ & đối kháng', en: 'Board & duel', games: [
    ['/co-caro/', 'co-caro', 'Cờ caro', 'Gomoku'], ['/noi-4/', 'noi-4', 'Nối 4', 'Connect 4'], ['/ban-tau/', 'ban-tau', 'Bắn tàu', 'Battleship'],
    ['/o-an-quan/', 'o-an-quan', 'Ô ăn quan', 'O An Quan'], ['/co-tuong/', 'co-tuong', 'Cờ tướng', 'Xiangqi'], ['/co-ganh/', 'co-ganh', 'Cờ gánh', 'Co Ganh'],
  ] },
  { icon: 'users', vi: 'Chơi đông người', en: 'Party games', games: [
    ['/pikachu/', 'pikachu', 'Pikachu nối thú', 'Pikachu Onet'], ['/do-min/', 'do-min', 'Dò mìn', 'Minesweeper'], ['/bau-cua/', 'bau-cua', 'Bầu cua', 'Bau Cua'],
    ['/dao-vang/', 'dao-vang', 'Đào Vàng', 'Gold Miner'], ['/loto/', 'loto', 'Lô tô', 'Lo To'], ['/soi/', 'soi', 'Sói', 'Werewolf'],
    ['/gian-diep/', 'gian-diep', 'Ai là gián điệp', 'Undercover'],
  ] },
  { icon: 'puzzle', vi: 'Giải đố & một mình', en: 'Puzzles & solo', games: [
    ['/2048/', '2048', '2048', '2048'], ['/tetris/', 'tetris', 'Xếp gạch', 'Tetris'], ['/sudoku/', 'sudoku', 'Sudoku', 'Sudoku'],
  ] },
  { icon: 'smartphone', vi: 'Góc Nokia', en: 'Nokia corner', games: [
    ['/nokia/snake/', 'snake', 'Rắn săn mồi', 'Snake'], ['/nokia/bantumi/', 'bantumi', 'Bantumi', 'Bantumi'], ['/nokia/pairs/', 'pairs', 'Lật hình', 'Pairs'],
    ['/nokia/logic/', 'logic', 'Logic', 'Logic'], ['/nokia/rapid-roll/', 'rapid-roll', 'Rapid Roll', 'Rapid Roll'],
    ['/nokia/space-impact/', 'space-impact', 'Space Impact', 'Space Impact'], ['/nokia/bounce/', 'bounce', 'Bounce', 'Bounce'],
  ] },
];

const CSS = `
#sidebar { position: fixed; inset: 0 auto 0 0; z-index: 900; width: ${SIDEBAR_WIDTH}; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: 2px; padding: 16px 10px max(16px, env(safe-area-inset-bottom));
  background: var(--ui-surface); border-right: 1px solid var(--ui-border); color: var(--ui-fg); font-size: 14px; line-height: 1.4; scrollbar-width: thin; }
#sidebar a { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 6px 10px; border-radius: var(--ui-radius); color: inherit; text-decoration: none; font-weight: 500; }
#sidebar a:hover { background: var(--ui-surface-muted); }
#sidebar a[aria-current="page"] { background: var(--ui-surface-muted); color: var(--ui-primary); font-weight: 700; }
#sidebar a img { width: 22px; height: 22px; flex: none; }
#sidebar a.sb-home { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
#sidebar a.sb-home img { width: 30px; height: 30px; border-radius: 8px; }
#sidebar .ic { width: 18px; height: 18px; flex: none; }
#sidebar h2 { display: flex; align-items: center; gap: 8px; margin: 14px 10px 4px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ui-fg-muted); }
#sidebar h2 .ic { width: 14px; height: 14px; }
#sidebarBackdrop { position: fixed; inset: 0; z-index: 899; background: #0008; }
@media ${WIDE_QUERY} { html { padding-left: ${SIDEBAR_WIDTH}; } #sidebarBackdrop { display: none; } }
@media not ${WIDE_QUERY} {
  #sidebar { transform: translateX(-100%); visibility: hidden; transition: transform var(--ui-dur-fast) var(--ui-ease-out), visibility 0s var(--ui-dur-fast); box-shadow: var(--ui-shadow-lg); }
  html.sb-open #sidebar { transform: none; visibility: visible; transition: transform var(--ui-dur-fast) var(--ui-ease-out); }
  @media (pointer: coarse) { #sidebar a { min-height: 44px; } }
}
@media (prefers-reduced-motion: reduce) { #sidebar { transition: none !important; } }
`;

const here = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]*$/, '');
function link(href, img, text, className = '') {
  const a = document.createElement('a');
  a.href = href;
  a.className = className;
  if (href === here) a.setAttribute('aria-current', 'page');
  if (typeof img === 'string') a.append(Object.assign(document.createElement('img'), { src: img, alt: '' }));
  else a.append(img);
  a.append(text);
  return a;
}

function build() {
  const nav = document.createElement('nav');
  nav.id = 'sidebar';
  nav.setAttribute('aria-label', t('Các game', 'Games'));
  nav.append(link(HOME, '/logos/hub-192.png', t('Game Cổ Điển', 'Classic Games'), 'sb-home'), link(ROOMS, iconEl('users'), t('Phòng đang mở', 'Open rooms')));
  for (const g of GROUPS) {
    const h = document.createElement('h2');
    h.append(iconEl(g.icon), t(g.vi, g.en));
    nav.append(h, ...g.games.map(([href, logo, vi, en]) => link(href, `/logos/${logo}.svg`, t(vi, en))));
  }
  return nav;
}

const style = document.createElement('style');
style.textContent = CSS;
const nav = build();
const backdrop = Object.assign(document.createElement('div'), { id: 'sidebarBackdrop', hidden: true });
document.head.append(style);
document.body.prepend(nav, backdrop);

const wide = matchMedia(WIDE_QUERY);
const setOpen = (open) => {
  document.documentElement.classList.toggle('sb-open', open);
  backdrop.hidden = !open;
  nav.inert = !open && !wide.matches;
};
setOpen(false);
wide.addEventListener('change', () => setOpen(false));
backdrop.addEventListener('click', () => setOpen(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
document.addEventListener('click', (e) => {
  const a = e.target.closest(`a[href="${HOME}"]`);
  if (!a || nav.contains(a) || wide.matches || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  setOpen(true);
});

import { t, lang, setLang } from './i18n.js';
import { iconEl } from './icons.js';
import { el, store } from './dom.js';
import { isSoundOn, setSoundOn, onSoundChange } from './sound.js';
import { PROFILE_API, signInHref, signOutHref } from './account.js';

const WIDE_QUERY = '(min-width: 1024px)';
const SIDEBAR_WIDTH = '232px';
const HOME = '/';
const ROOMS = '/phong/';
const THEME_KEY = 'theme';
const SPY_THEME_KEY = 'gian-diep.theme';
const SPY_PATH = '/gian-diep/';
const DARK = 'dark';
const LIGHT = 'light';
const SOUND_ON = 'on';
const SOUND_OFF = 'off';
const SETTINGS_ID = 'sbSettings';
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
#sidebar .sb-settings { position: sticky; bottom: calc(-1 * max(16px, env(safe-area-inset-bottom))); margin: auto -10px calc(-1 * max(16px, env(safe-area-inset-bottom))); padding: 8px 10px max(16px, env(safe-area-inset-bottom)); background: var(--ui-surface); border-top: 1px solid var(--ui-border); }
#sidebar .sb-settings-btn { display: flex; align-items: center; justify-content: flex-start; gap: 10px; width: 100%; min-height: 36px; padding: 6px 10px; border: 0; border-radius: var(--ui-radius); background: none; box-shadow: none; color: inherit; font: inherit; font-weight: 500; text-align: left; cursor: pointer; }
#sidebar .sb-settings-btn:hover, #sidebar .sb-settings-btn[aria-expanded="true"] { background: var(--ui-surface-muted); }
#sidebar .sb-panel { position: absolute; left: 10px; right: 10px; bottom: calc(100% - 4px); display: grid; gap: 12px; padding: 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-surface); box-shadow: var(--ui-shadow-lg); }
#sidebar .sb-panel[hidden] { display: none; }
#sidebar .sb-row { display: grid; gap: 6px; }
#sidebar .sb-label { font-size: 12px; font-weight: 700; color: var(--ui-fg-muted); }
#sidebar .sb-seg { display: flex; gap: 2px; padding: 2px; border-radius: var(--ui-radius); background: var(--ui-surface-muted); }
#sidebar .sb-seg button { flex: 1; min-height: 32px; padding: 4px 8px; border: 0; border-radius: calc(var(--ui-radius) - 2px); background: none; color: var(--ui-fg-muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
#sidebar .sb-seg button[aria-pressed="true"] { background: var(--ui-surface); color: var(--ui-fg); box-shadow: var(--ui-shadow-sm); }
#sidebar .sb-account { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 13px; }
#sidebar .sb-account img { width: 28px; height: 28px; border-radius: 50%; }
#sidebar .sb-account b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#sidebar .sb-account a { min-height: 32px; padding: 4px 10px; border: 1px solid var(--ui-border); font-size: 13px; }
#sidebar .sb-account a.sb-primary { flex: 1; justify-content: center; border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-fg); font-weight: 600; }
#sidebar .sb-muted { color: var(--ui-fg-muted); }
@media (pointer: coarse) { #sidebar .sb-settings-btn, #sidebar .sb-seg button, #sidebar .sb-account a { min-height: 44px; } }
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
  nav.append(settingsMenu());
  return nav;
}

function segmented(label, options, current, onPick) {
  const seg = el('div', { className: 'sb-seg', role: 'group' });
  seg.setAttribute('aria-label', label);
  const render = (value) => { for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.value === value)); };
  for (const [value, text] of options) {
    const b = el('button', { type: 'button', textContent: text, onclick: () => onPick(value) });
    b.dataset.value = value;
    seg.append(b);
  }
  render(current);
  return { row: el('div', { className: 'sb-row' }, el('span', { className: 'sb-label', textContent: label }), seg), render };
}

async function loadAccount(box) {
  box.replaceChildren(el('span', { className: 'sb-muted', textContent: t('Đang tải…', 'Loading…') }));
  try {
    const res = await fetch(PROFILE_API, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { user } = await res.json();
    box.replaceChildren(...(user
      ? [user.picture ? el('img', { src: user.picture, alt: '', referrerPolicy: 'no-referrer' }) : '', el('b', { textContent: user.name }), el('a', { href: signOutHref(), textContent: t('Đăng xuất', 'Sign out') })]
      : [el('a', { className: 'sb-primary', href: signInHref(), textContent: t('Đăng nhập Google', 'Sign in with Google') })]));
  } catch {
    box.replaceChildren(el('span', { className: 'sb-muted', textContent: t('Không tải được tài khoản.', 'Could not load your account.') }));
  }
}

function applyTheme(theme) {
  store.set(THEME_KEY, theme);
  store.set(SPY_THEME_KEY, theme);
  if (theme === LIGHT) document.documentElement.dataset.theme = LIGHT;
  else delete document.documentElement.dataset.theme;
  if (location.pathname.startsWith(SPY_PATH)) location.reload();
}

function settingsMenu() {
  const button = el('button', { type: 'button', className: 'sb-settings-btn' }, iconEl('settings'), t('Cài đặt', 'Settings'));
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', SETTINGS_ID);
  const language = segmented(t('Ngôn ngữ', 'Language'), [['vi', 'Tiếng Việt'], ['en', 'English']], lang, (v) => { if (v !== lang) setLang(v); });
  const theme = segmented(t('Giao diện', 'Theme'), [[DARK, t('Tối', 'Dark')], [LIGHT, t('Sáng', 'Light')]], store.get(THEME_KEY) === LIGHT ? LIGHT : DARK, (v) => { applyTheme(v); theme.render(v); });
  const sound = segmented(t('Âm thanh', 'Sound'), [[SOUND_ON, t('Bật', 'On')], [SOUND_OFF, t('Tắt', 'Off')]], isSoundOn() ? SOUND_ON : SOUND_OFF, (v) => setSoundOn(v === SOUND_ON));
  onSoundChange(() => sound.render(isSoundOn() ? SOUND_ON : SOUND_OFF));
  const account = el('div', { className: 'sb-account' });
  const panel = el('div', { id: SETTINGS_ID, className: 'sb-panel', hidden: true }, language.row, theme.row, sound.row,
    el('div', { className: 'sb-row' }, el('span', { className: 'sb-label', textContent: t('Tài khoản', 'Account') }), account));
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', t('Cài đặt', 'Settings'));
  const box = el('div', { className: 'sb-settings' }, panel, button);
  let accountLoaded = false;
  const setPanel = (open) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open && !accountLoaded) { accountLoaded = true; loadAccount(account); }
  };
  button.onclick = () => setPanel(panel.hidden);
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) setPanel(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { setPanel(false); button.focus(); } });
  return box;
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

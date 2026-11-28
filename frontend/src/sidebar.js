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
const SPY_PATH = '/undercover/';
const DARK = 'dark';
const LIGHT = 'light';
const SOUND_ON = 'on';
const SOUND_OFF = 'off';
const MOBILE_SETTINGS_TRIGGER = '#mobileSettings';
const EXPANDED_ATTRIBUTE = 'aria-expanded';
const SETTINGS_ID = 'sbSettings';
const GROUPS = [
  { icon: 'swords', vi: 'Cờ & đối kháng', en: 'Board & duel', games: [
    ['/co-caro/', 'co-caro', 'Cờ caro', 'Gomoku'], ['/noi-4/', 'noi-4', 'Nối 4', 'Connect 4'], ['/ban-tau/', 'ban-tau', 'Bắn tàu', 'Battleship'],
    ['/o-an-quan/', 'o-an-quan', 'Ô ăn quan', 'O An Quan'], ['/co-tuong/', 'co-tuong', 'Cờ tướng', 'Xiangqi'], ['/co-ganh/', 'co-ganh', 'Cờ gánh', 'Co Ganh'],
  ] },
  { icon: 'users', vi: 'Chơi đông người', en: 'Party games', games: [
    ['/pikachu/', 'pikachu', 'Pikachu nối thú', 'Pikachu Onet'], ['/do-min/', 'do-min', 'Dò mìn', 'Minesweeper'], ['/bau-cua/', 'bau-cua', 'Bầu cua', 'Bau Cua'],
    ['/dao-vang/', 'dao-vang', 'Đào Vàng', 'Gold Miner'], ['/loto/', 'loto', 'Lô tô', 'Lo To'], ['/soi/', 'soi', 'Sói', 'Werewolf'],
    ['/undercover/', 'undercover', 'Ai là gián điệp', 'Undercover'],
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

const MOBILE_GAME_HEADER = 'mobile-game-header';
const GAME_BACK = 'a.back[href="/"], #hud .btn[href="/"]';
const ROOM_LEAVE = '#btnLeave, .room-leave';
const ENTRY_CARD = '[data-game-entry] :is(#home > .card:first-of-type, #overlay > .card.menu, .spy-content > .entry)';

const CSS = `
#sidebar { position: fixed; inset: 0 auto 0 0; z-index: 900; width: ${SIDEBAR_WIDTH}; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: 2px; padding: 16px 10px max(16px, env(safe-area-inset-bottom));
  background: var(--ui-surface); border-right: 1px solid var(--ui-border); color: var(--ui-fg); font-size: 14px; line-height: 1.4; scrollbar-width: thin; }
#sidebar a { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 6px 10px; border-radius: var(--ui-radius); color: inherit; text-decoration: none; font-weight: 500; }
#sidebar a:hover { background: var(--ui-surface-muted); }
#sidebar a[aria-current="page"] { background: var(--ui-surface-muted); color: var(--ui-primary); font-weight: 700; }
img[src^="/card-icons-v2/"] { border-radius: 25%; }
#sidebar a img { width: 22px; height: 22px; flex: none; }
#sidebar a.sb-home { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
#sidebar a.sb-home img { width: 30px; height: 30px; border-radius: 8px; }
#sidebar .ic { width: 18px; height: 18px; flex: none; }
#sidebar h2 { display: flex; align-items: center; gap: 8px; margin: 14px 10px 4px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ui-fg-muted); }
#sidebar h2 .ic { width: 14px; height: 14px; }
.${MOBILE_GAME_HEADER} { display: none; }
@media not ${WIDE_QUERY} {
  html:has(.${MOBILE_GAME_HEADER}) {
    --mobile-game-header-height: calc(60px + env(safe-area-inset-top));
    box-sizing: border-box;
    padding-top: var(--mobile-game-header-height);
  }
  .${MOBILE_GAME_HEADER} {
    position: fixed; inset: 0 0 auto; z-index: 900;
    height: var(--mobile-game-header-height); box-sizing: border-box;
    padding: env(safe-area-inset-top) 12px 0;
    display: flex; align-items: center; gap: 8px;
    color: var(--ui-fg); background: var(--ui-surface); border-bottom: 1px solid var(--ui-border);
  }
  .${MOBILE_GAME_HEADER} > h1 { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; margin: 0; font: inherit; font-weight: 700; }
  .${MOBILE_GAME_HEADER} > h1 > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .${MOBILE_GAME_HEADER} > h1 > img { height: 24px; width: 24px; flex: none; }
  .${MOBILE_GAME_HEADER} > button {
    box-sizing: border-box; display: grid; place-items: center; flex: none;
    width: 44px; height: 44px; min-width: 44px; min-height: 44px; margin: 0; padding: 0;
    border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-surface);
    color: inherit; box-shadow: none;
  }
  .${MOBILE_GAME_HEADER} > button:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }
  html:has(.${MOBILE_GAME_HEADER}) :is(#home h1:has(a.back), header.bar:has(a.back) > :is(h1, img.logo)),
  html:has(.${MOBILE_GAME_HEADER}) :is(${GAME_BACK}, ${ROOM_LEAVE}, [data-help]:not(.${MOBILE_GAME_HEADER} > *)) { display: none !important; }
}
@media not ${WIDE_QUERY} {
  @media (orientation: portrait) {
    [data-game-entry] #home:not(:has(> .spy-header)) {
      align-content: safe center; align-items: start; grid-template-columns: minmax(0, 1fr);
      padding: 16px 16px max(16px, env(safe-area-inset-bottom)); overflow-y: auto;
    }
    [data-game-entry] #overlay:has(> .card.menu) { align-items: safe center; }
    [data-game-entry] .spy-content:has(> .entry) { align-items: safe center; overflow-y: auto; }
    ${ENTRY_CARD} {
      --entry-padding: 16px;
      box-sizing: border-box; width: min(100%, 460px); max-width: none; min-width: 0;
      display: grid; align-content: start; gap: 14px; margin-inline: auto;
      padding: var(--entry-padding); text-align: start; background: var(--ui-surface);
      border: 1px solid var(--ui-border); border-radius: var(--ui-radius); box-shadow: var(--ui-shadow-sm);
    }
    ${ENTRY_CARD}::before {
      content: ""; display: block; grid-column: 1 / -1; align-self: start; justify-self: stretch;
      margin: calc(-1 * var(--entry-padding)) calc(-1 * var(--entry-padding)) 0;
      aspect-ratio: 5 / 2; border-radius: var(--ui-radius) var(--ui-radius) 0 0;
      background: var(--ui-surface-muted) var(--entry-cover) center / cover no-repeat;
    }
    [data-game-entry] #home:has(> .spy-header) > .card { margin-block: auto; width: min(calc(100% - 32px), 460px); }
    ${ENTRY_CARD} > :is(.entry-logo, .sprite, .link, .lang, .row:has(> #btnHelpHome)) { display: none; }
    ${ENTRY_CARD} > :is(.sub, .muted) { margin: 0; }
    ${ENTRY_CARD} > .join,
    ${ENTRY_CARD} > .row:has(> .code) { border-top: 1px solid var(--ui-border); padding-top: 14px; }
    ${ENTRY_CARD} > .mode-choices { width: 100%; }
  }
}
#mobileSettings, .room-leave > .leave-arrow { display: none; }
@media ${WIDE_QUERY} { html { padding-left: ${SIDEBAR_WIDTH}; } }
@media not ${WIDE_QUERY} {
  #sidebar { display: none; }
  #mobileSettings { display: inline-flex; }
  :is(a.back[href="/"], #hud .btn[href="/"], #btnLeave, .room-leave):not([hidden]) {
    box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
    flex: 0 0 auto; width: 44px; min-width: 44px; height: 44px; min-height: 44px; padding: 0;
    border: 1px solid var(--ui-border); border-radius: var(--ui-radius);
    background: var(--ui-surface); color: var(--ui-fg); text-decoration: none; box-shadow: none;
  }
  :is(a.back[href="/"], #hud .btn[href="/"], #btnLeave, .room-leave) > .ic { width: 18px; height: 18px; flex: none; }
  :is(a.back[href="/"], #hud .btn[href="/"], #btnLeave, .room-leave):focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }
  .room-leave > span { display: none; }
  .room-leave > .ic.leave-arrow { display: inline-block; }

}
#sidebar .sb-settings { position: sticky; bottom: calc(-1 * max(16px, env(safe-area-inset-bottom))); margin: auto -10px calc(-1 * max(16px, env(safe-area-inset-bottom))); padding: 8px 10px max(16px, env(safe-area-inset-bottom)); background: var(--ui-surface); border-top: 1px solid var(--ui-border); }
#sidebar .sb-settings-btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 36px; padding: 6px 10px; border: 0; border-radius: var(--ui-radius); background: none; box-shadow: none; color: inherit; font: inherit; font-weight: 500; text-align: left; cursor: pointer; }
#sidebar .sb-settings-btn:hover, #sidebar .sb-settings-btn[aria-expanded="true"] { background: var(--ui-surface-muted); }
#sbSettings { box-sizing: border-box; width: min(360px, calc(100% - 32px)); max-height: 90dvh; overflow: auto; padding: 16px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-surface); color: var(--ui-fg); box-shadow: var(--ui-shadow-lg); }
#sbSettings[open] { display: grid; gap: 12px; }
#sbSettings::backdrop { background: #0008; }
.sb-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sb-panel-head button, #sbSettings .sb-account a { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); color: inherit; background: var(--ui-surface); text-decoration: none; }
.sb-panel-head button { width: 44px; height: 44px; padding: 0; cursor: pointer; }
.sb-panel-head button:hover, #sbSettings .sb-account a:hover { background: var(--ui-surface-muted); }
#sbSettings .ic { width: 18px; height: 18px; }
#sbSettings .sb-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
#sbSettings .sb-label { font-size: 12px; font-weight: 700; color: var(--ui-fg-muted); }
#sbSettings .sb-seg { display: flex; gap: 2px; padding: 2px; border-radius: var(--ui-radius); background: var(--ui-surface-muted); }
#sbSettings .sb-seg button { flex: 1; min-height: 32px; padding: 4px 8px; border: 0; border-radius: calc(var(--ui-radius) - 2px); background: none; color: var(--ui-fg-muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
#sbSettings .sb-seg button[aria-pressed="true"] { background: var(--ui-surface); color: var(--ui-fg); box-shadow: var(--ui-shadow-sm); }
#sbSettings .sb-account { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 13px; }
#sbSettings .sb-account img { width: 28px; height: 28px; border-radius: 50%; }
#sbSettings .sb-account b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#sbSettings .sb-account a { min-height: 32px; padding: 4px 10px; border: 1px solid var(--ui-border); font-size: 13px; }
#sbSettings .sb-account a.sb-primary { flex: 1; justify-content: center; border-color: var(--ui-primary); background: var(--ui-primary); color: var(--ui-primary-fg); font-weight: 600; }
#sbSettings .sb-muted { color: var(--ui-fg-muted); }
@media (pointer: coarse) { #sidebar .sb-settings-btn, #sbSettings .sb-seg button, #sbSettings .sb-account a { min-height: 44px; } }
`;

const here = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]*$/, '');
const currentGame = GROUPS.flatMap(({ games }) => games).find(([path]) => path === here);
if (currentGame) {
  const [, logo] = currentGame;
  document.body.dataset.gameEntry = logo;
  document.body.style.setProperty('--entry-cover', `url("/covers-v2/${logo}.webp")`);
}
function link(href, img, text, className = '') {
  const a = document.createElement('a');
  a.href = href;
  a.className = className;
  if (href === here) a.setAttribute('aria-current', 'page');
  if (typeof img === 'string') a.append(Object.assign(document.createElement('img'), { src: img, loading: 'lazy', decoding: 'async', alt: '' }));
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
    nav.append(h, ...g.games.map(([href, logo, vi, en]) => link(href, `/card-icons-v2/${logo}.webp`, t(vi, en))));
  }
  nav.append(el('div', { className: 'sb-settings' }, settingsButton));
  return nav;
}

function segmented(label, options, current, onPick) {
  const seg = el('div', { className: 'sb-seg', role: 'group' });
  seg.setAttribute('aria-label', label);
  const render = (value) => { for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.value === value)); };
  for (const [value, text, glyph] of options) {
    const b = el('button', { type: 'button', ariaLabel: text, title: text, onclick: () => onPick(value) }, glyph ? iconEl(glyph) : text);
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

function renderTheme(theme) {
  if (theme === LIGHT) document.documentElement.dataset.theme = LIGHT;
  else delete document.documentElement.dataset.theme;
}

const savedTheme = store.get(THEME_KEY) ?? (location.pathname.startsWith(SPY_PATH) ? store.get(SPY_THEME_KEY) : null);
renderTheme(savedTheme);

const settingsLabel = t('Cài đặt', 'Settings');
const closeLabel = t('Đóng', 'Close');
const settingsButton = el('button', { type: 'button', className: 'sb-settings-btn', ariaLabel: settingsLabel, title: settingsLabel }, iconEl('settings'));
settingsButton.setAttribute(EXPANDED_ATTRIBUTE, String(false));
settingsButton.setAttribute('aria-controls', SETTINGS_ID);
settingsButton.setAttribute('aria-haspopup', 'dialog');

const language = segmented(t('Ngôn ngữ', 'Language'), [['vi', 'Tiếng Việt'], ['en', 'English']], lang, (value) => { if (value !== lang) setLang(value); });
const theme = segmented(t('Giao diện', 'Theme'), [[DARK, t('Tối', 'Dark'), 'moon'], [LIGHT, t('Sáng', 'Light'), 'lightbulb']], savedTheme === LIGHT ? LIGHT : DARK, (value) => { store.set(THEME_KEY, value); store.set(SPY_THEME_KEY, value); renderTheme(value); theme.render(value); });
const sound = segmented(t('Âm thanh', 'Sound'), [[SOUND_ON, t('Bật', 'On'), 'volume-2'], [SOUND_OFF, t('Tắt', 'Off'), 'volume-x']], isSoundOn() ? SOUND_ON : SOUND_OFF, (value) => setSoundOn(value === SOUND_ON));
onSoundChange(() => sound.render(isSoundOn() ? SOUND_ON : SOUND_OFF));
const account = el('div', { className: 'sb-account' });
const closeButton = el('button', { type: 'button', ariaLabel: closeLabel, title: closeLabel, onclick: () => settingsDialog.close() }, iconEl('x'));
const settingsDialog = el('dialog', { id: SETTINGS_ID, className: 'sb-panel', ariaLabel: settingsLabel },
  el('div', { className: 'sb-panel-head' }, el('b', { textContent: settingsLabel }), closeButton),
  language.row, theme.row, sound.row,
  el('div', { className: 'sb-row' }, el('span', { className: 'sb-label', textContent: t('Tài khoản', 'Account') }), account),
);
let accountLoaded = false;
settingsDialog.addEventListener('click', (event) => { if (event.target === settingsDialog) settingsDialog.close(); });
settingsDialog.addEventListener('close', () => settingsButton.setAttribute(EXPANDED_ATTRIBUTE, String(false)));
settingsButton.onclick = openSettings;

const style = document.createElement('style');
style.textContent = CSS;
document.head.append(style);
document.body.prepend(build(), settingsDialog);
document.querySelector(MOBILE_SETTINGS_TRIGGER)?.addEventListener('click', openSettings);

export function openSettings() {
  if (settingsDialog.open) return;
  settingsDialog.showModal();
  settingsButton.setAttribute(EXPANDED_ATTRIBUTE, String(true));
  if (accountLoaded) return;
  accountLoaded = true;
  loadAccount(account);
}


export function mountMobileGameHeader(gameId, helpLabel, openHelp) {
  if (!currentGame || here === SPY_PATH) return;

  const backLabel = t('Quay lại', 'Back');
  const back = el('button', { type: 'button', ariaLabel: backLabel, title: backLabel, onclick: () => {
    const leave = [...document.querySelectorAll(ROOM_LEAVE)].find((control) =>
      !control.closest('[hidden]') && control.parentElement.getClientRects().length);
    if (leave) leave.click();
    else location.assign(HOME);
  } }, iconEl('arrow-left'));
  const help = el('button', { type: 'button', ariaLabel: helpLabel, title: helpLabel, onclick: openHelp }, iconEl('info'));
  help.dataset.help = gameId;
  help.setAttribute('aria-haspopup', 'dialog');
  const settings = el('button', { type: 'button', ariaLabel: settingsLabel, title: settingsLabel, onclick: openSettings }, iconEl('settings'));
  settings.setAttribute('aria-haspopup', 'dialog');
  settings.setAttribute('aria-controls', SETTINGS_ID);
  const [, logo, vi, en] = currentGame;
  const title = el('h1', {}, el('img', { src: `/card-icons-v2/${logo}.webp`, alt: '' }), el('span', {}, t(vi, en)));
  document.body.prepend(el('header', { className: MOBILE_GAME_HEADER }, back, title, help, settings));
}

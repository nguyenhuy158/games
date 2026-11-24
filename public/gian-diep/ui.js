import { el } from '../dom.js';
import { t, tx } from '../i18n.js';
import { iconEl } from '../icons.js';
import { DEFAULT_CONFIG, DURATIONS, PACKS, MIN_PLAYERS, MAX_PLAYERS, ROLE, limits, validateSetup } from './logic.js';
import { createToasts } from './ui-kit/feedback.mjs';

export const PAGE_SIZE = 4;
const MIN_SPIES = 1;
const LIGHTNING_SECONDS = 5;
const SETTING_ICONS = Object.freeze({ spies: 'eye', whites: 'layers', seconds: 'timer', pack: 'grid-3x3' });
const ROLE_ICONS = Object.freeze({ [ROLE.CIVILIAN]: 'users', [ROLE.SPY]: 'eye', [ROLE.WHITE]: 'layers' });
const notices = createToasts();

export function notify(message, tone = 'info') {
  notices.show(tone, message);
  for (const close of document.querySelectorAll('.ui-toast-close')) close.ariaLabel = t('Đóng thông báo', 'Dismiss notification');
}

export function button(label, onclick, primary = false, icon) {
  const node = el('button', { type: 'button', className: 'ui-button', ariaLabel: label, onclick }, ...(icon ? [iconEl(icon)] : []), el('span', {}, label));
  if (primary) node.dataset.variant = 'primary';
  return node;
}

export function iconButton(label, onclick, icon) {
  const node = button(label, onclick, false, icon);
  node.classList.add('icon-only');
  node.title = label;
  return node;
}

export function indicator(icon, text, label = text) {
  return el('span', { className: 'icon-label', role: 'img', title: label, ariaLabel: label }, iconEl(icon), el('span', {}, text));
}

export function note(text, warning = false) {
  return el('p', { className: warning ? 'notice warning' : 'sub', textContent: text });
}

export function dialog(title, content, onClose) {
  const close = iconButton(t('Đóng', 'Close'), () => node.close(), 'x');
  const node = el('dialog', { className: 'spy-dialog' }, el('div', { className: 'dialog-head' }, el('h2', {}, title), close), el('div', { className: 'dialog-body' }, content));
  node.ariaLabel = title;
  node.addEventListener('close', () => { onClose?.(); node.remove(); });
  node.addEventListener('click', (event) => { if (event.target === node) node.close(); });
  document.body.append(node);
  node.showModal();
  return node;
}

export function confirmAction(title, detail, action) {
  const cancel = button(t('Hủy', 'Cancel'), () => node.close());
  const node = dialog(title, el('div', { className: 'stack' }, note(detail), el('div', { className: 'actions' }, cancel, button(t('Xác nhận', 'Confirm'), () => { node.close(); action(); }, true))));
  cancel.focus();
}

export function roleLabel(role) {
  if (role === ROLE.SPY) return t('Gián điệp', 'Spy');
  if (role === ROLE.WHITE) return t('Mũ Trắng', 'Mr. White');
  return t('Dân thường', 'Civilian');
}

export function configBadges(config) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const pack = PACKS.find((item) => item.id === cfg.pack);
  return el('div', { className: 'config-badges' },
    indicator('eye', String(cfg.spies), t(`${cfg.spies} gián điệp`, `${cfg.spies} spies`)),
    indicator('layers', String(cfg.whites), t(`${cfg.whites} Mũ Trắng`, `${cfg.whites} Mr. White roles`)),
    indicator('timer', `${cfg.seconds}s`, t(`${cfg.seconds} giây mỗi lượt`, `${cfg.seconds} seconds per clue`)),
    indicator('grid-3x3', tx(pack?.label)));
}

export function setupWarning(count, cfg) {
  if (count < MIN_PLAYERS) return t(`Cần thêm ${MIN_PLAYERS - count} người.`, `Need ${MIN_PLAYERS - count} more players.`);
  if (count > MAX_PLAYERS) return t(`Tối đa ${MAX_PLAYERS} người.`, `At most ${MAX_PLAYERS} players.`);
  if (!validateSetup(count, cfg)) return t('Số vai chưa hợp lệ. Mở Cài đặt và giảm gián điệp hoặc Mũ Trắng.', 'Invalid role counts. Open Settings and reduce spies or Mr. White roles.');
  return '';
}

export function settings(count, config, save) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const fields = el('div', { className: 'settings-grid' });
  const warning = note('', true);
  const summary = note('');
  const apply = button(t('Lưu cài đặt', 'Save settings'), () => { save({ ...cfg }); modal.close(); }, true);
  const selects = {};
  const options = (select, items, selected) => select.replaceChildren(...items.map(([value, label, disabled = false]) => el('option', { value, textContent: label, selected: String(value) === String(selected), disabled })));
  const update = () => {
    const cap = limits(count, cfg.spies);
    options(selects.spies, Array.from({ length: limits(MAX_PLAYERS).spies }, (_, index) => [index + MIN_SPIES, String(index + MIN_SPIES), index + MIN_SPIES > cap.spies]), cfg.spies);
    const whiteCap = limits(MAX_PLAYERS).whites;
    options(selects.whites, Array.from({ length: whiteCap + 1 }, (_, index) => [index, String(index), index > cap.whites]), cfg.whites);
    const issue = setupWarning(count, cfg);
    warning.textContent = issue;
    warning.hidden = !issue;
    apply.disabled = !!issue;
    summary.textContent = t(`${count} người · tối đa ${cap.spies} gián điệp, ${cap.whites} Mũ Trắng với lựa chọn hiện tại. Cần ít nhất 2 dân.`, `${count} players · up to ${cap.spies} spies, ${cap.whites} Mr. White roles with this selection. At least 2 civilians required.`);
  };
  const field = (key, label, items) => {
    const select = el('select', { onchange: () => { cfg[key] = key === 'pack' ? select.value : Number(select.value); update(); } });
    selects[key] = select;
    if (items) options(select, items, cfg[key]);
    fields.append(el('label', {}, indicator(SETTING_ICONS[key], label), select));
  };
  field('spies', t('Gián điệp', 'Spies'));
  field('whites', t('Mũ Trắng', 'Mr. White'));
  field('seconds', t('Thời gian mô tả', 'Clue timer'), DURATIONS.map((seconds) => [seconds, seconds === LIGHTNING_SECONDS ? t('5 giây · Chớp nhoáng', '5 sec · Lightning') : t(`${seconds} giây`, `${seconds} sec`)]));
  field('pack', t('Bộ từ', 'Word pack'), PACKS.map((pack) => [pack.id, tx(pack.label)]));
  update();
  const modal = dialog(t('Cài đặt ván', 'Game settings'), el('div', { className: 'stack' }, summary, fields, note(t('Bộ từ dùng tiếng Việt. Dân và gián điệp chỉ thấy từ, không thấy tên vai.', 'Word packs are in Vietnamese. Civilians and spies see only a word, not their role.')), warning, apply));
}

export function paginated(items, renderItem, label = t('Người chơi', 'Players')) {
  let page = 0;
  const list = el('div', { className: 'player-grid' });
  const status = el('span', { className: 'page-status' });
  const previous = iconButton(t('Trang trước', 'Previous page'), () => { page--; paint(); }, 'chevron-left');
  const next = iconButton(t('Trang sau', 'Next page'), () => { page++; paint(); }, 'chevron-right');
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  function paint() {
    list.replaceChildren(...items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(renderItem));
    previous.disabled = page === 0;
    next.disabled = page === pages - 1;
    status.textContent = t(`${label} · ${page + 1}/${pages}`, `${label} · ${page + 1}/${pages}`);
  }
  paint();
  const navigation = el('nav', { className: 'pagination', hidden: pages === 1, ariaLabel: label }, previous, status, next);
  return el('div', { className: 'roster' }, list, navigation);
}

export function results(view, playerName) {
  if (!view.reveal) return el('div');
  const reveal = view.reveal;
  return el('div', { className: 'results stack' },
    view.players.some((player) => player.id === view.winner) ? note(t(`${playerName(view.winner)} đoán đúng và thắng một mình.`, `${playerName(view.winner)} guessed correctly and wins alone.`)) : '',
    el('dl', { className: 'word-pair' }, el('div', {}, el('dt', {}, indicator('users', t('Từ của dân', 'Civilian word'))), el('dd', {}, reveal.civilianWord)), el('div', {}, el('dt', {}, indicator('eye', t('Từ gián điệp', 'Spy word'))), el('dd', {}, reveal.spyWord))),
    paginated(view.players, (player) => el('div', { className: 'player-row' }, el('span', { className: 'player-name' }, playerName(player.id)), el('strong', {}, indicator(ROLE_ICONS[reveal.roles[player.id]], roleLabel(reveal.roles[player.id]))))));
}

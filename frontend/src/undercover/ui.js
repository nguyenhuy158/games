import { el } from '../dom.js';
import { t, tx } from '../i18n.js';
import { iconEl } from '../icons.js';
import { listbox } from '../ui/listbox.mjs';
import { AI_PACK, DEFAULT_CONFIG, DURATIONS, PACKS, MIN_PLAYERS, MAX_PLAYERS, ROLE, HIDDEN_TEAM, limits, resultTitle, validateSetup } from '../../../shared/games/gian-diep/logic.js';

export const PAGE_SIZE = 4;
const LIGHTNING_SECONDS = 5;
const SETTING_ICONS = Object.freeze({ seconds: 'timer', pack: 'grid-3x3' });
const ROLE_ICONS = Object.freeze({ [ROLE.CIVILIAN]: 'users', [ROLE.SPY]: 'swords', [ROLE.WHITE]: 'layers' });
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
    indicator(cfg.pack === AI_PACK ? 'sparkles' : 'grid-3x3', cfg.pack === AI_PACK ? cfg.aiTopic : tx(pack?.label)));
}

export function setupWarning(count, cfg) {
  if (count < MIN_PLAYERS) return t(`Cần thêm ${MIN_PLAYERS - count} người.`, `Need ${MIN_PLAYERS - count} more players.`);
  if (count > MAX_PLAYERS) return t(`Tối đa ${MAX_PLAYERS} người.`, `At most ${MAX_PLAYERS} players.`);
  if (!validateSetup(count, cfg)) return t('Số vai chưa hợp lệ. Giảm số gián điệp hoặc Mũ Trắng trong Thiết lập ván.', 'Invalid role counts. Reduce spies or Mr. White roles in Game setup.');
  return '';
}

export function countRow(label, icon, min, max, value, change, repaint) {
  const name = el('span', { className: 'count-label' }, iconEl(icon), label);
  const number = el('output', { textContent: value, ariaLabel: label, tabIndex: -1 });
  const step = (delta, glyph, action) => {
    const control = button(glyph, () => {
      if (!control.isConnected || control.disabled) return;
      change(value + delta);
      const scope = repaint();
      const next = [...scope.querySelectorAll('.count-controls button')].find((item) => item.ariaLabel === action);
      if (next.disabled) next.closest('.count-controls').querySelector('output').focus();
      else next.focus();
    });
    control.ariaLabel = action;
    control.disabled = delta < 0 ? value <= min : value >= max;
    return control;
  };
  return el('div', { className: 'count-row' }, name, el('div', { className: 'count-controls' },
    step(-1, '−', t(`Giảm ${label}`, `Decrease ${label}`)),
    number,
    step(1, '+', t(`Tăng ${label}`, `Increase ${label}`))));
}

export function settings(count, config, save, generateAi) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const counts = el('div', { className: 'local-counts' });
  const fields = el('div', { className: 'settings-grid' });
  const warning = note('', true);
  const apply = button(t('Lưu cài đặt', 'Save settings'), () => { save({ ...cfg }); modal.close(); }, true);
  const update = () => {
    const cap = limits(count, cfg.spies);
    counts.replaceChildren(
      el('div', { className: 'count-row' },
        el('span', { className: 'count-label' }, iconEl('users'), t('Người chơi', 'Players')),
        el('strong', { textContent: count })),
      countRow(t('Gián điệp', 'Spies'), 'eye', DEFAULT_CONFIG.spies, cap.spies, cfg.spies, (value) => {
        cfg.spies = value;
        cfg.whites = Math.min(cfg.whites, limits(count, value).whites);
      }, update),
      countRow(t('Mũ Trắng', 'Mr. White'), 'layers', DEFAULT_CONFIG.whites, cap.whites, cfg.whites, (value) => { cfg.whites = value; }, update));
    const issue = setupWarning(count, cfg);
    warning.textContent = issue;
    warning.hidden = !issue;
    apply.disabled = !!issue;
    return counts;
  };
  const field = (key, label, items) => {
    const select = el('select', { onchange: () => { cfg[key] = key === 'pack' ? select.value : Number(select.value); } },
      ...items.map(([value, textContent]) => el('option', { value, textContent, selected: value === cfg[key] })));
    fields.append(el('label', {}, indicator(SETTING_ICONS[key], label), listbox(select)));
  };
  field('seconds', t('Thời gian mô tả', 'Clue timer'), DURATIONS.map((seconds) => [seconds, seconds === LIGHTNING_SECONDS ? t('5 giây · Chớp nhoáng', '5 sec · Lightning') : t(`${seconds} giây`, `${seconds} sec`)]));
  field('pack', t('Bộ từ', 'Word pack'), [...PACKS.map((pack) => [pack.id, tx(pack.label)]), ...(cfg.pack === AI_PACK ? [[AI_PACK, cfg.aiTopic]] : [])]);
  update();
  const modal = dialog(t('Thiết lập ván', 'Game setup'), el('div', { className: 'stack' }, counts, fields, ...(generateAi ? [button(t('Tạo bộ từ AI', 'Create AI pack'), () => { modal.close(); generateAi(); }, false, 'sparkles')] : []), warning, apply));
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
  const team = view.winner === ROLE.CIVILIAN || view.winner === HIDDEN_TEAM ? view.winner : ROLE.WHITE;
  const panel = el('div', { className: 'results stack' },
    el('h2', { className: 'result-banner' }, iconEl(team === HIDDEN_TEAM ? ROLE_ICONS[ROLE.SPY] : 'trophy'), tx(resultTitle(view.winner))),
    view.players.some((player) => player.id === view.winner) ? note(t(`${playerName(view.winner)} đoán đúng và thắng một mình.`, `${playerName(view.winner)} guessed correctly and wins alone.`)) : '',
    el('dl', { className: 'word-pair' },
      el('div', {}, el('dt', {}, indicator(ROLE_ICONS[ROLE.CIVILIAN], t('Từ của dân', 'Civilian word'))), el('dd', {}, reveal.civilianWord)),
      el('div', {}, el('dt', {}, indicator(ROLE_ICONS[ROLE.SPY], t('Từ gián điệp', 'Spy word'))), el('dd', {}, reveal.spyWord))),
    paginated(view.players, (player) => {
      const role = reveal.roles[player.id];
      const row = el('div', { className: 'player-row' }, el('span', { className: 'player-name' }, playerName(player.id)), el('strong', {}, indicator(ROLE_ICONS[role], roleLabel(role))));
      row.dataset.role = role;
      return row;
    }));
  panel.dataset.winner = team;
  return panel;
}

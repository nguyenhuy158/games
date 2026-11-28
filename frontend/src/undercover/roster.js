import { el } from '../dom.js';
import { t } from '../i18n.js';
import { movePlayer, shufflePlayers, orderedIds } from '../../../shared/games/gian-diep/logic.js';
import { button, iconButton, indicator, note } from './ui.js';

const MOVE_UP = -1;
const MOVE_DOWN = 1;
export function orderedPlayers(players, order) {
  const byId = new Map(players.map((player) => [player.id, player]));
  return orderedIds([...byId.keys()], order).map((id) => byId.get(id));
}

export function orderControls(players, player, index, change) {
  const move = (offset) => change(movePlayer(players, player.id, offset), player.id);
  const up = iconButton(t(`Đưa ${player.name} lên`, `Move ${player.name} up`), () => move(MOVE_UP), 'arrow-up');
  const down = iconButton(t(`Đưa ${player.name} xuống`, `Move ${player.name} down`), () => move(MOVE_DOWN), 'arrow-down');
  up.disabled = index === 0;
  down.disabled = index === players.length - 1;
  return el('div', { className: 'roster-actions' }, up, down);
}

export function seatingRoster(players, host, change, rand) {
  const list = el('ol', { className: 'roster-list', ariaLabel: t('Thứ tự mô tả', 'Speaking order'), tabIndex: 0 });
  const focusedPlayer = document.activeElement?.closest('[data-player]')?.dataset.player;
  if (focusedPlayer) queueMicrotask(() => {
    if (!list.isConnected) return;
    const row = [...list.children].find((item) => item.dataset.player === focusedPlayer);
    (row?.querySelector('button:not(:disabled)') ?? row ?? list).focus();
  });
  for (const [index, player] of players.entries()) {
    const row = el('li', { className: 'roster-row', tabIndex: -1 },
      el('div', { className: 'roster-person' }, el('span', { className: 'roster-position' }, String(index + 1)), el('span', { className: 'roster-name' }, player.name), player.id === host ? indicator('crown', '', t('Chủ phòng', 'Host')) : ''),
      change ? orderControls(players, player, index, change) : '');
    row.dataset.player = player.id;
    list.append(row);
  }
  const shuffle = change ? button(t('Xáo thứ tự', 'Shuffle order'), () => change(shufflePlayers(players, rand)), false, 'shuffle') : null;
  if (shuffle) shuffle.disabled = players.length < 2;
  return el('section', { className: 'roster-editor' },
    el('div', { className: 'roster-heading' }, el('h3', {}, t('Thứ tự mô tả', 'Speaking order')), shuffle ?? ''), list,
    change ? note(t('Người mới vào được xếp cuối.', 'New arrivals go last.')) : '');
}

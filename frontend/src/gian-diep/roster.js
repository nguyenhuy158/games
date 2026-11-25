import { el } from '../dom.js';
import { t } from '../i18n.js';
import { NAME_LIMIT, NAME_ERROR, MAX_PLAYERS, parseNames, movePlayer, shufflePlayers, orderedIds } from '../../../shared/games/gian-diep/logic.js';
import { button, iconButton, indicator, note, confirmAction } from './ui.js';

const MOVE_UP = -1;
const MOVE_DOWN = 1;
const KEY_ENTER = 'Enter';
const KEY_ESCAPE = 'Escape';
const INPUT_ROWS = 2;
const BULK_MODE = Object.freeze({ ADD: 'add', REPLACE: 'replace' });
const ERROR_TEXT = {
  [NAME_ERROR.EMPTY]: () => t('Tên không được trống. Xóa dòng trống rồi thử lại.', 'Names cannot be empty. Remove blank lines and try again.'),
  [NAME_ERROR.DUPLICATE]: () => t('Tên bị trùng. Đổi tên trùng rồi thử lại.', 'Duplicate names. Change the repeated name and try again.'),
  [NAME_ERROR.LONG]: () => t(`Mỗi tên tối đa ${NAME_LIMIT} ký tự. Rút ngắn tên rồi thử lại.`, `Each name can have up to ${NAME_LIMIT} characters. Shorten it and try again.`),
  [NAME_ERROR.LIMIT]: () => t(`Tối đa ${MAX_PLAYERS} người. Giảm danh sách hoặc chọn thay cả nhóm.`, `Up to ${MAX_PLAYERS} players. Shorten the list or replace the group.`),
};

export function rosterDraft() {
  return { text: '', mode: BULK_MODE.REPLACE, editing: null, error: '', customized: false };
}

export function rosterHasDraft(draft) {
  return draft.text !== '' || draft.editing !== null;
}

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
    note(t('Đổi thứ tự không đổi chủ phòng. Người mới vào được xếp cuối.', 'Changing order keeps the host. New arrivals go last.')));
}

export function rosterEditor(players, host, draft, change, rand, onDraft) {
  const root = el('section', { className: 'roster-editor' });
  const error = note(draft.error, true);
  error.role = 'alert';
  error.hidden = !draft.error;
  const showError = (code) => {
    draft.error = ERROR_TEXT[code]();
    error.textContent = draft.error;
    error.hidden = false;
  };
  const input = el('textarea', { value: draft.text, rows: INPUT_ROWS, autocomplete: 'off', ariaLabel: t('Tên người chơi, mỗi dòng một tên', 'Player names, one per line'), oninput: () => { draft.text = input.value; onDraft(); }, onkeydown: (event) => {
    if (event.key !== KEY_ENTER || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submit();
  } });
  const mode = el('select', { value: draft.mode, ariaLabel: t('Cách thêm tên', 'How to add names'), onchange: () => { draft.mode = mode.value; } },
    el('option', { value: BULK_MODE.REPLACE, selected: draft.mode === BULK_MODE.REPLACE }, t('Thay cả nhóm · tên đầu làm chủ', 'Replace group · first name hosts')),
    el('option', { value: BULK_MODE.ADD, selected: draft.mode === BULK_MODE.ADD }, t('Thêm vào nhóm', 'Add to group')));
  function submit() {
    if (draft.editing) { onDraft(); return; }
    const replacing = draft.mode === BULK_MODE.REPLACE;
    const parsed = parseNames(draft.text, replacing ? [] : players.map((player) => player.name));
    if (parsed.error) { showError(parsed.error); input.focus(); return; }
    const apply = () => {
      draft.text = '';
      draft.error = '';
      draft.mode = BULK_MODE.ADD;
      draft.customized = true;
      change({ names: parsed.names, replacing });
    };
    if (replacing && draft.customized) confirmAction(t('Thay cả nhóm?', 'Replace the group?'), t(`Danh sách cũ sẽ được thay. ${parsed.names[0]} làm chủ phòng mới.`, `The current list will be replaced. ${parsed.names[0]} becomes the new host.`), apply);
    else apply();
  }
  const submitButton = button(t('Thêm tên', 'Apply names'), submit, false, 'users');
  const list = el('ol', { className: 'roster-list', ariaLabel: t('Người chơi theo thứ tự mô tả', 'Players in speaking order'), tabIndex: 0 });
  for (const [index, player] of players.entries()) {
    const row = el('li', { className: 'roster-row' });
    row.dataset.player = player.id;
    if (draft.editing?.id === player.id) {
      const rename = el('input', { value: draft.editing.text, autocomplete: 'off', ariaLabel: t(`Tên mới của ${player.name}`, `New name for ${player.name}`), oninput: () => { draft.editing.text = rename.value; } });
      const form = el('form', { className: 'roster-rename', onsubmit: (event) => {
        event.preventDefault();
        const parsed = parseNames(draft.editing.text, players.filter((item) => item.id !== player.id).map((item) => item.name));
        if (parsed.error) { showError(parsed.error); rename.focus(); return; }
        draft.editing = null;
        draft.error = '';
        draft.customized = true;
        change({ players: players.map((item) => item.id === player.id ? { ...item, name: parsed.names[0] } : item), focus: player.id });
      } });
      const cancel = () => { draft.editing = null; draft.error = ''; change({ players, focus: player.id }); };
      rename.onkeydown = (event) => { if (event.key === KEY_ESCAPE) { event.preventDefault(); cancel(); } };
      const save = iconButton(t('Lưu tên', 'Save name'), null, 'circle-check');
      save.type = 'submit';
      form.append(rename, save, iconButton(t('Hủy sửa tên', 'Cancel rename'), cancel, 'x'));
      row.append(form);
    } else {
      const edit = button(player.name, () => { draft.editing = { id: player.id, text: player.name }; draft.error = ''; change({ players, focus: player.id, editing: true }); }, false, 'pencil');
      edit.classList.add('roster-edit-name');
      edit.ariaLabel = t(`Sửa tên ${player.name}`, `Rename ${player.name}`);
      const controls = orderControls(players, player, index, (next, focus) => change({ players: next, focus }));
      const remove = iconButton(player.id === host ? t('Không thể xóa chủ phòng. Dùng Thay cả nhóm để chọn chủ mới.', 'Cannot delete the host. Replace the group to choose a new host.') : t(`Xóa ${player.name}`, `Remove ${player.name}`), () => change({ players: players.filter((item) => item.id !== player.id), focus: players[index + 1]?.id ?? players[index - 1]?.id }), 'x');
      remove.disabled = player.id === host || !!draft.editing;
      for (const control of controls.children) control.disabled ||= !!draft.editing;
      edit.disabled = !!draft.editing;
      controls.append(remove);
      row.append(el('div', { className: 'roster-person' }, el('span', { className: 'roster-position' }, String(index + 1)), edit, player.id === host ? indicator('crown', '', t('Chủ phòng', 'Host')) : ''), controls);
    }
    list.append(row);
  }
  const shuffle = button(t('Xáo thứ tự', 'Shuffle order'), () => change({ players: shufflePlayers(players, rand) }), false, 'shuffle');
  shuffle.disabled = players.length < 2 || !!draft.editing;
  submitButton.disabled = !!draft.editing;
  root.append(el('div', { className: 'roster-heading' }, el('h3', {}, t('Tên & thứ tự mô tả', 'Names & speaking order')), shuffle),
    el('label', {}, t('Dán danh sách, mỗi dòng một tên', 'Paste names, one per line'), input),
    el('div', { className: 'roster-add' }, mode, submitButton),
    note(t('Enter để thêm · Shift+Enter xuống dòng · Bấm tên để sửa. Chỉ thay cả nhóm mới đổi chủ phòng.', 'Enter to apply · Shift+Enter for a new line · Tap a name to edit. Only replacing the group changes the host.')),
    error, list);
  return root;
}

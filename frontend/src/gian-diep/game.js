import { nokiaApp } from '../nokia/room.js';
import { el, store } from '../dom.js';
import { t, tx, langToggle } from '../i18n.js';
import { iconEl } from '../icons.js';
import { mountHelp } from '../help.js';
import { AI_PACK, MIN_PLAYERS, DEFAULT_CONFIG, PHASE, ACTION, createGame, act, advance, view, resultTitle, validateSetup } from '../../../shared/games/gian-diep/logic.js';
import { HELP } from './help.js';
import { button, iconButton, indicator, note, dialog, confirmAction, settings, configBadges, setupWarning, paginated, results } from './ui.js';
import { createActionGate, setButtonPending } from '../ui/feedback.mjs';
import { notifications, TOAST_TONE } from '../ui/notifications.js';
import { rosterDraft, rosterHasDraft, rosterEditor, seatingRoster, orderedPlayers } from './roster.js';
import { aiPicker, dealAiPair } from './ai.js';

const GAME = 'gian-diep';
const GAME_PATH = '/gian-diep/';
const TITLE = t('Ai là gián điệp?', 'Who is the spy?');
const MODE = Object.freeze({ HOME: 'home', LOCAL: 'local', ONLINE: 'online' });
const LOCAL_STEP = Object.freeze({ SETUP: 'setup', REVEAL: 'reveal', READY: 'ready', PLAY: 'play' });
const ROOM_STATUS = Object.freeze({ PLAYING: 'playing', ENDED: 'ended' });
const MS_PER_SECOND = 1000;
const CLOCK_INTERVAL_MS = 200;
const ACTION_TIMEOUT_MS = 6000;
const GUESS_LIMIT = 120;
const THEME_KEY = 'gian-diep.theme';
const THEME_DARK = 'dark';
const THEME_LIGHT = 'light';
const LOCAL_ID_PREFIX = 'local-';
const RANDOM_RANGE = 0x100000000;
const MANUAL_PHASES = new Set([PHASE.DESCRIBE, PHASE.DISCUSS, PHASE.COUNTDOWN, PHASE.VOTE]);
const PHASE_LABELS = {
  [PHASE.DEAL]: t('Nhận từ bí mật', 'Receive your secret word'),
  [PHASE.DESCRIBE]: t('Lượt mô tả', 'Give a clue'),
  [PHASE.DISCUSS]: t('Thảo luận', 'Discussion'),
  [PHASE.COUNTDOWN]: t('Chuẩn bị bỏ phiếu', 'Get ready to vote'),
  [PHASE.VOTE]: t('Bỏ phiếu kín', 'Secret ballot'),
  [PHASE.TIE]: t('Hòa phiếu', 'Tied vote'),
  [PHASE.GUESS]: t('Mũ Trắng đoán từ', 'Mr. White’s guess'),
  [PHASE.ENDED]: t('Kết quả', 'Results'),
};
const PHASE_ICONS = {
  [PHASE.DEAL]: 'layers',
  [PHASE.DESCRIBE]: 'megaphone',
  [PHASE.DISCUSS]: 'users',
  [PHASE.COUNTDOWN]: 'timer',
  [PHASE.VOTE]: 'hand',
  [PHASE.TIE]: 'swords',
  [PHASE.GUESS]: 'lightbulb',
  [PHASE.ENDED]: 'trophy',
};
const gate = createActionGate();
const randomValue = new Uint32Array(1);
let mode = MODE.HOME;
let app = null;
let onlineBoard = null;
let shown = false;
let onlineDeal = null;
let currentView = null;
let pendingOnline = null;
let guessDraft = '';
let guessOwner = null;
let localConfig = { ...DEFAULT_CONFIG };
let localPlayerSequence = 0;
let localPlayers = Array.from({ length: MIN_PLAYERS }, (_, index) => newLocalPlayer(defaultName(index)));
let localHostId = localPlayers[0].id;
const localRosterDraft = rosterDraft();
let localGame = null;
let localDealing = false;
let localStep = LOCAL_STEP.SETUP;
let revealIndex = 0;
let revealSeen = false;
let ballotOwner = null;
let ballotOpen = false;
let guessOpen = false;
const localNamesById = new Map();

const main = el('section', { className: 'spy-shell', id: 'spy-local' });
const themeButton = iconButton('', toggleTheme, 'moon');
const helpButton = iconButton(t('Cách chơi', 'How to play'), () => {}, 'info');
const backButton = iconButton(t('Quay lại', 'Back'), goBack, 'arrow-left');
const heading = el('h1', {}, TITLE);
const content = el('main', { className: 'spy-content' });
main.append(el('header', { className: 'spy-header' }, backButton, heading, el('div', { className: 'header-actions' }, helpButton, themeButton)), content);
document.body.append(main);
const ROOM_HELP_SEEN_KEY = `help.seen.${GAME}`;
const HELP_SEEN_VALUE = '1';
const help = mountHelp({
  game: `${GAME}-guide`,
  button: helpButton,
  content: HELP,
  auto: !new URLSearchParams(location.search).has('r'),
  onOpen: hideSecrets,
  onClose: () => store.set(ROOM_HELP_SEEN_KEY, HELP_SEEN_VALUE),
});
applyTheme(store.get(THEME_KEY) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? THEME_DARK : THEME_LIGHT));

function defaultName(index) {
  return t(`Người chơi ${index + 1}`, `Player ${index + 1}`);
}

function random() {
  crypto.getRandomValues(randomValue);
  return randomValue[0] / RANDOM_RANGE;
}

function playerName(id) {
  if (mode === MODE.LOCAL) return localNamesById.get(id) ?? id;
  return app?.room?.players.find((player) => player.id === id)?.name ?? t('Người đã rời phòng', 'Disconnected player');
}

function applyTheme(theme) {
  document.documentElement.classList.toggle(THEME_DARK, theme === THEME_DARK);
  themeButton.lastChild.textContent = theme === THEME_DARK ? t('Chế độ sáng', 'Light mode') : t('Chế độ tối', 'Dark mode');
  themeButton.ariaLabel = themeButton.textContent;
  themeButton.title = themeButton.ariaLabel;
  for (const control of document.querySelectorAll('.room-theme')) {
    control.lastChild.textContent = themeButton.textContent;
    control.ariaLabel = themeButton.textContent;
    control.title = control.ariaLabel;
  }
}

function toggleTheme() {
  const next = document.documentElement.classList.contains(THEME_DARK) ? THEME_LIGHT : THEME_DARK;
  store.set(THEME_KEY, next);
  applyTheme(next);
}

function focusMain() {
  const target = content.querySelector('h2') ?? heading;
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

function showHome() {
  mode = MODE.HOME;
  localGame = null;
  currentView = null;
  shown = false;
  main.hidden = false;
  heading.textContent = TITLE;
  backButton.ariaLabel = t('Các trò chơi khác', 'More games');
  backButton.title = backButton.ariaLabel;
  content.replaceChildren(el('div', { className: 'entry' },
    el('img', { className: 'entry-logo', src: '/logos/gian-diep.svg', alt: '' }),
    el('h2', {}, t('Cùng một nhóm. Khác một từ.', 'One group. A different word.')),
    el('div', { className: 'entry-facts' }, indicator('users', t('3–20 người', '3–20 players')), indicator('crown', t('Chủ phòng cùng chơi', 'Host plays too'))),
    el('div', { className: 'mode-choices' },
      button(t('Chuyền một máy', 'Pass one device'), startLocalSetup, true, 'smartphone'),
      button(t('Mỗi người một máy', 'One device each'), enterOnline, false, 'users')),
    note(t('Nhận từ bí mật, nói gợi ý, tìm người khác biệt. Chơi trực tiếp hoặc qua cuộc gọi riêng.', 'Get a secret word, give clues and find the odd one out. Talk in person or on your own call.')),
    el('div', { className: 'entry-footer' }, langToggle(), button(t('Luật chơi', 'Read the rules'), () => help.open(), false, 'info'))));
}

function goBack() {
  if (mode === MODE.HOME) { location.href = '/'; return; }
  if (localGame && localGame.phase !== PHASE.ENDED) {
    hideSecrets();
    confirmAction(t('Rời ván đang chơi?', 'Leave this game?'), t('Ván một máy chỉ lưu trong bộ nhớ. Rời đi sẽ mất toàn bộ ván.', 'This local game lives only in memory. Leaving discards the entire game.'), showHome);
    return;
  }
  showHome();
}

function startLocalSetup() {
  mode = MODE.LOCAL;
  localStep = LOCAL_STEP.SETUP;
  localGame = null;
  shown = false;
  heading.textContent = t('Chuyền một máy', 'Pass one device');
  backButton.ariaLabel = t('Quay lại', 'Back');
  backButton.title = backButton.ariaLabel;
  paintSetup();
  focusMain();
}

function newLocalPlayer(name) {
  return { id: `${LOCAL_ID_PREFIX}${++localPlayerSequence}`, name };
}

function paintSetup(focus, editing = false) {
  const issue = setupWarning(localPlayers.length, localConfig);
  const start = button(t('Chia từ bí mật', 'Deal secret words'), dealLocal, true, 'layers');
  const draftNote = note(t('Lưu hoặc hủy tên đang sửa; thêm danh sách đang nhập trước khi chia từ.', 'Save or cancel the name edit; apply the draft list before dealing.'));
  const updateDraft = () => {
    const pending = rosterHasDraft(localRosterDraft);
    start.disabled = !!issue || pending || localDealing;
    draftNote.hidden = !pending;
  };
  const roster = rosterEditor(localPlayers, localHostId, localRosterDraft, (change) => {
    if (localGame || localStep !== LOCAL_STEP.SETUP) return;
    if (change.names) {
      const added = change.names.map(newLocalPlayer);
      if (change.replacing) { localPlayers = added; localHostId = added[0].id; }
      else localPlayers = [...localPlayers, ...added];
    } else localPlayers = change.players;
    localRosterDraft.customized = true;
    paintSetup(change.focus, change.editing);
    if (change.names) content.querySelector('textarea')?.focus();
  }, random, updateDraft);
  updateDraft();
  content.replaceChildren(el('div', { className: 'setup stack' },
    el('div', { className: 'section-heading' }, el('h2', {}, iconEl('users'), t(`${localPlayers.length} người chơi`, `${localPlayers.length} players`))),
    roster,
    el('div', { className: 'setup-options stack' },
      el('div', { className: 'settings-summary' }, configBadges(localConfig), iconButton(t('Cài đặt', 'Settings'), () => settings(localPlayers.length, localConfig, (cfg) => { localConfig = cfg; paintSetup(); }, localAiPicker), 'gauge')),
      issue ? note(issue, true) : note(t('Xem thẻ lần lượt. Đủ người xem mới chạy đồng hồ.', 'Pass the cards privately. The timer waits for everyone.')),
      draftNote, start)));
  if (focus) {
    const row = [...content.querySelectorAll('[data-player]')].find((item) => item.dataset.player === focus);
    const control = row?.querySelector(editing ? 'input' : 'button');
    control?.focus();
    if (editing) control?.select();
  }
}

function localAiPicker() {
  aiPicker(({ packId, title }) => {
    localConfig = { ...localConfig, pack: AI_PACK, aiPackId: packId, aiTopic: title };
    if (mode === MODE.LOCAL && localStep === LOCAL_STEP.SETUP) paintSetup();
  });
}

async function dealLocal() {
  if (localDealing || rosterHasDraft(localRosterDraft) || localGame || localStep !== LOCAL_STEP.SETUP) return;
  if (!validateSetup(localPlayers.length, localConfig)) { notifications.show(TOAST_TONE.ERROR, setupWarning(localPlayers.length, localConfig)); return; }
  localDealing = true;
  content.inert = true;
  backButton.disabled = true;
  const restore = setButtonPending(content.querySelector('[data-variant="primary"]'), t('Đang chia từ…', 'Dealing…'));
  try {
    const pair = localConfig.pack === AI_PACK ? await dealAiPair(localConfig.aiPackId) : undefined;
    localNamesById.clear();
    const ids = localPlayers.map(({ id, name }) => { localNamesById.set(id, name); return id; });
    localGame = createGame(ids, localConfig, random, Date.now(), pair);
  } catch (error) {
    notifications.show(TOAST_TONE.ERROR, error.message);
    return;
  } finally {
    restore();
    localDealing = false;
    content.inert = false;
    backButton.disabled = false;
  }
  localStep = LOCAL_STEP.REVEAL;
  revealIndex = 0;
  revealSeen = false;
  shown = false;
  ballotOwner = null;
  ballotOpen = false;
  guessOpen = false;
  guessDraft = '';
  paintReveal();
  focusMain();
}

function paintReveal() {
  if (localStep === LOCAL_STEP.READY) {
    content.replaceChildren(el('div', { className: 'handoff stack' }, iconEl('circle-check'), el('h2', {}, t('Mọi người đã nhận từ', 'Everyone has their word')), note(t(`Trả máy cho ${playerName(localHostId)}. Bấm bắt đầu khi cả nhóm sẵn sàng.`, `Return the device to ${playerName(localHostId)}. Start when everyone is ready.`)), button(t('Bắt đầu lượt mô tả', 'Start giving clues'), () => { localStep = LOCAL_STEP.PLAY; sendAction({ a: ACTION.NEXT }); }, true, 'play')));
    return;
  }
  const player = localGame.players[revealIndex];
  const card = shown ? view(localGame, player.id).card : null;
  const next = button(revealIndex === localGame.players.length - 1 ? t('Ẩn & hoàn tất', 'Hide & finish') : t('Ẩn & chuyển máy', 'Hide & pass'), () => {
    shown = false;
    revealSeen = false;
    revealIndex++;
    if (revealIndex === localGame.players.length) localStep = LOCAL_STEP.READY;
    paintReveal();
    focusMain();
  }, true, 'arrow-right');
  next.disabled = !revealSeen;
  content.replaceChildren(el('div', { className: 'handoff stack' },
    el('p', { className: 'progress-label' }, t(`Nhận thẻ ${revealIndex + 1}/${localGame.players.length} · Đồng hồ chưa chạy`, `Card ${revealIndex + 1}/${localGame.players.length} · Timer paused`)),
    el('h2', {}, t(`Chuyển máy cho ${playerName(player.id)}`, `Pass to ${playerName(player.id)}`)),
    secretCard(card, shown, () => { shown = !shown; revealSeen ||= shown; paintReveal(); }), next));
}

function secretCard(card, visible, toggle) {
  const node = el('section', { className: 'secret-card', ariaLabel: t('Thẻ bí mật', 'Secret card') });
  if (!visible) {
    node.append(iconEl('hand'), el('h3', {}, t('Chỉ mình bạn xem', 'For your eyes only')), note(t('Che màn hình trước khi mở thẻ.', 'Keep the screen private before revealing.')), button(t('Xem thẻ', 'Reveal card'), toggle, true, 'eye'));
  } else {
    node.append(el('p', { className: 'sub' }, card?.white ? t('Bạn là Mũ Trắng', 'You are Mr. White') : t('Từ bí mật của bạn', 'Your secret word')),
      el('strong', { className: 'secret-word', textContent: card?.white ? t('Không có từ', 'No word') : card?.word ?? '' }),
      note(card?.white ? t('Nghe gợi ý và hòa nhập. Khi bị loại, bạn có một lần đoán từ của dân.', 'Listen to clues and blend in. If eliminated, you get one guess at the civilian word.') : t('Ghi nhớ từ. Không nói nguyên từ hoặc cho người khác xem.', 'Remember it. Do not say the word or show it to anyone.')),
      button(t('Ẩn thẻ', 'Hide card'), toggle, false, 'eye'));
  }
  return node;
}

function localNow() {
  return Date.now();
}

function localHost() {
  return localHostId;
}

function sendAction(message, actor = mode === MODE.LOCAL ? localHost() : app?.id) {
  if (mode === MODE.LOCAL) {
    const beforePhase = localGame.phase;
    if (!act(localGame, actor, localHost(), message, localNow())) {
      notifications.show(TOAST_TONE.WARNING, t('Lượt đã đổi. Chọn lại thao tác trên màn hình hiện tại.', 'The turn changed. Choose an action from the current screen.'));
      paintLocal();
      return;
    }
    shown = false;
    ballotOpen = false;
    if (beforePhase !== localGame.phase) { guessOpen = false; guessDraft = ''; }
    paintLocal();
    return;
  }
  if (!app || pendingOnline) return;
  const release = gate.claim(GAME);
  if (!release) return;
  const active = document.activeElement;
  const restore = active?.tagName === 'BUTTON' ? setButtonPending(active, t('Đang gửi…', 'Sending…')) : () => {};
  const timer = setTimeout(() => {
    clearPending();
    notifications.show(TOAST_TONE.WARNING, t('Chưa nhận xác nhận. Kiểm tra kết nối và trạng thái trước khi thử lại.', 'No confirmation yet. Check the connection and current state before retrying.'));
  }, ACTION_TIMEOUT_MS);
  pendingOnline = { release, restore, timer };
  app.send(message);
}

function clearPending() {
  if (!pendingOnline) return;
  clearTimeout(pendingOnline.timer);
  pendingOnline.restore();
  pendingOnline.release();
  pendingOnline = null;
}

function paintLocal() {
  if (!localGame || localStep !== LOCAL_STEP.PLAY) return;
  const publicView = view(localGame, null);
  if (publicView.phase === PHASE.VOTE) {
    const voter = localGame.players.find((player) => player.alive && !Object.hasOwn(localGame.votes, player.id));
    if (ballotOwner !== voter?.id) { ballotOwner = voter?.id ?? null; ballotOpen = false; }
  } else { ballotOwner = null; ballotOpen = false; }
  const actor = publicView.phase === PHASE.VOTE && ballotOpen ? ballotOwner : publicView.phase === PHASE.GUESS && guessOpen ? publicView.pendingGuess : null;
  paintBoard(content, actor ? view(localGame, actor) : publicView, actor, true);
}

function phaseDescription(v) {
  if (v.phase === PHASE.DEAL) return t('Xem thẻ riêng. Chủ phòng bắt đầu khi tất cả sẵn sàng.', 'Reveal privately. The host starts when everyone is ready.');
  if (v.phase === PHASE.DESCRIBE) return t(`${playerName(v.speaker)}: một gợi ý, không nói nguyên từ.`, `${playerName(v.speaker)}: one clue, not the word.`);
  if (v.phase === PHASE.DISCUSS) return t('Ai có từ khác? Cùng thảo luận.', 'Who has a different word? Discuss together.');
  if (v.phase === PHASE.COUNTDOWN) return t('Hết đếm ngược sẽ mở phiếu.', 'Voting opens after the countdown.');
  if (v.phase === PHASE.VOTE) return t('Chọn một người khác. Phiếu được giữ kín.', 'Choose someone else. Your vote stays private.');
  if (v.phase === PHASE.TIE) return t('Mỗi người hòa phiếu thêm một gợi ý.', 'Each tied player gives one more clue.');
  if (v.phase === PHASE.GUESS) return t(`${playerName(v.pendingGuess)}: một lần đoán từ của dân.`, `${playerName(v.pendingGuess)}: one guess at the civilian word.`);
  return '';
}

function paintBoard(target, v, actor, isLocal) {
  currentView = v;
  if (guessOwner !== v.pendingGuess) { guessOwner = v.pendingGuess; guessDraft = ''; }
  if (v.phase === PHASE.ENDED) {
    target.replaceChildren(el('div', { className: 'game-result stack' }, el('h2', {}, tx(resultTitle(v.winner))), results(v, playerName), isLocal ? button(t('Chơi ván mới', 'Play a new game'), startLocalSetup, true, 'rotate-ccw') : ''));
    return;
  }
  const seated = v.players.some((player) => player.id === actor);
  const host = isLocal || (app.room.host === app.id && seated);
  const alive = v.players.filter((player) => player.alive);
  const clock = el('span', { className: 'clock', role: 'timer', ariaLabel: t('Thời gian còn lại', 'Time remaining') });
  clock.dataset.clock = '';
  const status = el('section', { className: 'phase-panel' },
    el('div', { className: 'phase-heading' }, el('h2', {}, iconEl(PHASE_ICONS[v.phase]), PHASE_LABELS[v.phase]), clock),
    el('div', { className: 'round-status' }, indicator('rotate-cw', t(`Vòng ${v.round}`, `Round ${v.round}`)), indicator('users', `${alive.length}/${v.players.length}`, t(`Còn ${alive.length} trên ${v.players.length} người`, `${alive.length} of ${v.players.length} players alive`))),
    note(phaseDescription(v)));
  const work = el('div', { className: 'phase-work' });
  const controls = el('div', { className: 'host-controls' });
  const rosterPlayers = v.phase === PHASE.TIE ? v.players.filter((player) => v.candidates.includes(player.id)) : v.players;
  const roster = paginated(rosterPlayers, (player) => {
    const suffix = player.id === v.speaker ? t('Đang nói', 'Speaking') : player.alive ? t('Còn chơi', 'Alive') : t('Đã loại', 'Out');
    return el('div', { className: `player-row${player.id === v.speaker ? ' speaking' : ''}` }, el('span', { className: 'player-name' }, playerName(player.id)), indicator(player.id === v.speaker ? 'megaphone' : player.alive ? 'circle-check' : 'circle-x', '', suffix));
  });
  if (v.phase === PHASE.VOTE) renderVoting(work, v, actor, isLocal);
  if (v.phase === PHASE.GUESS) renderGuess(work, v, actor, isLocal);
  if (v.phase === PHASE.TIE) work.append(indicator('swords', t(`${v.candidates.length} người bầu lại`, `${v.candidates.length} runoff candidates`)));
  if (v.lastEliminated) status.append(el('p', { className: 'last-out' }, indicator('circle-x', playerName(v.lastEliminated), t(`Đã loại ${playerName(v.lastEliminated)}. Vai vẫn kín.`, `${playerName(v.lastEliminated)} is out. Role stays secret.`))));
  if (!isLocal && !seated) work.append(note(t('Bạn đang xem. Chờ ván sau để nhận từ.', 'You are watching. Wait for the next game to get a word.')));
  if (host && v.phase === PHASE.DEAL) controls.append(button(t('Bắt đầu mô tả', 'Start giving clues'), () => sendAction({ a: ACTION.NEXT }), true, 'play'));
  if (host && v.phase === PHASE.DESCRIBE) controls.append(button(t('Người tiếp theo', 'Next speaker'), () => sendAction({ a: ACTION.NEXT }), true, 'arrow-right'));
  if (host && v.phase === PHASE.DISCUSS) controls.append(button(t('Mở bỏ phiếu', 'Open voting'), () => sendAction({ a: ACTION.VOTING }), true, 'users'));
  if (host && v.phase === PHASE.TIE) controls.append(button(t('Đã nói xong · Bầu lại', 'Clues done · Vote again'), () => sendAction({ a: ACTION.NEXT }), true, 'users'));
  if (host && MANUAL_PHASES.has(v.phase) && !(isLocal && ballotOpen)) controls.append(button(t('Loại trực tiếp', 'Eliminate directly'), () => chooseElimination(v), false, 'circle-x'));
  if (!host && [PHASE.DEAL, PHASE.DISCUSS, PHASE.TIE].includes(v.phase)) controls.append(note(t('Chờ chủ phòng chuyển bước.', 'Waiting for the host to continue.')));
  if (v.tally) controls.append(button(t('Xem tổng phiếu', 'View vote totals'), () => showTally(v)));
  const info = el('aside', { className: 'game-sidebar' });
  if (!isLocal && v.card) info.append(button(t('Mở thẻ riêng của bạn', 'Your private card'), () => openOwnCard(v.card), false, 'eye'));
  if (!isLocal && seated && !v.players.find((player) => player.id === actor)?.alive && v.pendingGuess !== actor) info.append(note(host ? t('Bạn đã bị loại: vẫn điều hành, không bỏ phiếu.', 'You are out: you can still moderate, but not vote.') : t('Bạn đã bị loại. Không gợi ý hoặc bỏ phiếu nữa.', 'You are out. Do not give clues or vote.')));
  if (![PHASE.VOTE, PHASE.GUESS].includes(v.phase)) info.append(roster);
  target.replaceChildren(el('div', { className: 'game-layout' }, el('div', { className: 'game-main' }, status, work, controls), info));
  updateClock();
}

function openOwnCard(card) {
  shown = false;
  const holder = el('div');
  const paint = () => holder.replaceChildren(secretCard(shown ? card : null, shown, () => { shown = !shown; paint(); }));
  paint();
  const modal = dialog(t('Thẻ riêng', 'Private card'), holder, () => { shown = false; });
  modal.classList.add('secret-dialog');
}

function renderVoting(work, v, actor, isLocal) {
  work.append(el('p', { className: 'vote-progress', role: 'status' }, indicator('circle-check', t(`${v.voteCount}/${v.voteTotal} phiếu`, `${v.voteCount}/${v.voteTotal} votes`))));
  if (isLocal && !ballotOpen) {
    work.append(el('h3', {}, t(`Chuyển máy cho ${playerName(ballotOwner)}`, `Pass to ${playerName(ballotOwner)}`)), note(t('Chỉ người được gọi tên mở phiếu.', 'Only the named voter opens the ballot.')), button(t('Tôi sẵn sàng bỏ phiếu', 'Ready to vote'), () => { ballotOpen = true; paintLocal(); }, true, 'hand'));
    return;
  }
  const mine = v.players.find((player) => player.id === actor);
  if (!mine?.alive) { work.append(note(t('Chỉ người còn sống được bỏ phiếu.', 'Only living players can vote.'))); return; }
  if (v.voted) { work.append(el('p', { className: 'notice success' }, t('Đã nhận phiếu. Đang chờ người khác.', 'Vote received. Waiting for the others.'))); return; }
  if (isLocal) work.append(el('h3', {}, t(`Phiếu của ${playerName(actor)}`, `${playerName(actor)}’s ballot`)));
  const candidates = v.players.filter((player) => player.alive && player.id !== actor && v.candidates.includes(player.id));
  work.append(paginated(candidates, (player) => button(playerName(player.id), () => confirmAction(t(`Bỏ phiếu cho ${playerName(player.id)}?`, `Vote for ${playerName(player.id)}?`), t('Mỗi vòng chỉ bỏ một phiếu, không đổi được.', 'One vote per ballot; it cannot be changed.'), () => sendAction({ a: ACTION.VOTE, target: player.id }, actor)), false, 'users'), t('Chọn người', 'Choose a player')));
}

function renderGuess(work, v, actor, isLocal) {
  if (isLocal && !guessOpen) {
    work.append(el('h3', {}, t(`Chuyển máy cho ${playerName(v.pendingGuess)}`, `Pass to ${playerName(v.pendingGuess)}`)), button(t('Nhập từ dự đoán', 'Enter your guess'), () => { guessOpen = true; paintLocal(); }, true, 'pencil'));
    return;
  }
  if (actor !== v.pendingGuess) { work.append(note(t('Chờ Mũ Trắng đoán.', 'Waiting for Mr. White to guess.'))); return; }
  const input = el('input', { value: guessDraft, maxLength: GUESS_LIMIT, required: true, autocomplete: 'off', spellcheck: false, oninput: () => { guessDraft = input.value; } });
  const submit = button(t('Chốt lần đoán duy nhất', 'Submit your one guess'), null, true);
  submit.type = 'submit';
  const form = el('form', { className: 'guess-form stack', onsubmit: (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    confirmAction(t('Chốt từ này?', 'Submit this word?'), t(`Bạn chỉ được đoán một lần: “${text}”.`, `You get exactly one guess: “${text}”.`), () => sendAction({ a: ACTION.GUESS, text }, actor));
  } }, el('label', {}, t('Từ của dân thường là gì?', 'What is the civilian word?'), input), note(t('Chấp nhận khác dấu, chữ hoa và khoảng trắng.', 'Accents, case and whitespace do not matter.')), submit);
  work.append(form);
}

function chooseElimination(v) {
  hideSecrets();
  const choices = paginated(v.players.filter((player) => player.alive), (player) => button(playerName(player.id), () => {
    picker.close();
    confirmAction(t(`Loại ${playerName(player.id)}?`, `Eliminate ${playerName(player.id)}?`), t('Không hoàn tác. Mũ Trắng được đoán từ ngay khi bị loại.', 'Cannot be undone. Mr. White gets a guess when eliminated.'), () => sendAction({ a: ACTION.ELIMINATE, target: player.id }));
  }));
  const picker = dialog(t('Chủ phòng chọn người bị loại', 'Host: choose a player to eliminate'), choices);
}

function showTally(v) {
  dialog(t('Tổng phiếu đã chốt', 'Final vote totals'), paginated(Object.entries(v.tally), ([id, count]) => el('div', { className: 'player-row' }, el('span', { className: 'player-name' }, playerName(id)), el('strong', {}, t(`${count} phiếu`, `${count} votes`)))));
}

function enterOnline() {
  mode = MODE.ONLINE;
  main.hidden = true;
  localGame = null;
  shown = false;
  if (app) { document.getElementById('home').hidden = false; return; }
  app = nokiaApp({
    game: GAME,
    path: GAME_PATH,
    title: TITLE,
    sub: t('Mỗi người một máy. Nhận từ riêng, cùng tìm gián điệp.', 'One device each. Get a private word and find the spy.'),
    help: HELP,
    lobbyText: (room) => setupWarning(room.players.length, { ...DEFAULT_CONFIG, ...room.cfg }) || t('Sẵn sàng chia từ.', 'Ready to deal.'),
    badge: (player, room) => room.view?.players.find((item) => item.id === player.id)?.alive === false ? t('Đã loại', 'Out') : '',
    lobby(box, room, host, setConfig) {
      const cfg = { ...DEFAULT_CONFIG, ...room.cfg };
      if (room.status === ROOM_STATUS.ENDED && room.view?.reveal) box.append(results(room.view, playerName));
      const players = orderedPlayers(room.players, cfg.order);
      const changeOrder = host && room.status !== ROOM_STATUS.PLAYING ? (next) => {
        if (app?.room?.host !== app?.id || app.room.status === ROOM_STATUS.PLAYING) return;
        setConfig({ order: next.map((player) => player.id) });
      } : null;
      box.append(seatingRoster(players, room.host, changeOrder, random));
      box.append(el('div', { className: 'settings-summary' }, configBadges(cfg), host ? iconButton(t('Cài đặt ván', 'Game settings'), () => settings(room.players.length, cfg, setConfig, () => aiPicker(() => notifications.show(TOAST_TONE.SUCCESS, t('Bộ từ AI đã sẵn sàng.', 'AI pack is ready.')), { room: new URLSearchParams(location.search).get('r'), deviceId: app.id })), 'gauge') : ''));
    },
    mount(stage) {
      onlineBoard = stage;
    },
    onState(room, previous) {
      clearPending();
      if (room.view?.dealId !== onlineDeal || (room.status === ROOM_STATUS.PLAYING && previous?.status !== ROOM_STATUS.PLAYING)) {
        onlineDeal = room.view?.dealId;
        shown = false;
        guessDraft = '';
      }
      if (room.view?.phase !== previous?.view?.phase || room.view?.pendingGuess !== previous?.view?.pendingGuess) {
        for (const modal of document.querySelectorAll('.spy-dialog[open]')) modal.close();
      }
      queueMicrotask(() => enhanceRoomShell(room));
    },
    render: paintOnline,
  });
  enhanceRoomShell();
  const home = document.getElementById('home');
  const back = button(t('Chọn cách chơi khác', 'Choose another mode'), () => { home.hidden = true; showHome(); }, false, 'arrow-left');
  home.querySelector('.card').append(back);
  const room = document.getElementById('room');
  const toggle = iconButton(themeButton.textContent, toggleTheme, 'moon');
  toggle.classList.add('room-theme');
  toggle.ariaLabel = themeButton.textContent;
  room.querySelector('header').append(toggle);
  const homeTheme = iconButton(themeButton.textContent, toggleTheme, 'moon');
  homeTheme.classList.add('room-theme');
  homeTheme.ariaLabel = themeButton.textContent;
  home.querySelector('.lang').append(homeTheme);
  const leave = room.querySelector('header button');
  leave.addEventListener('click', (event) => {
    if (app.room?.status !== ROOM_STATUS.PLAYING) return;
    if (leave.dataset.confirmed) { delete leave.dataset.confirmed; return; }
    event.stopImmediatePropagation();
    hideSecrets();
    confirmAction(t('Rời phòng?', 'Leave the room?'), t('Ván vẫn tiếp tục cho những người còn lại. Có thể dùng mã phòng để quay lại.', 'The game continues for everyone else. Use the room code to reconnect.'), () => { leave.dataset.confirmed = 'yes'; leave.click(); });
  }, true);
  for (const helpControl of document.querySelectorAll('[data-help="gian-diep"]')) helpControl.addEventListener('click', hideSecrets, true);
}

function enhanceRoomShell(room = app?.room) {
  for (const control of document.querySelectorAll('#home button, #room button')) {
    control.classList.add('ui-button');
    if (control.classList.contains('primary')) control.dataset.variant = 'primary';
  }
  const codeInput = document.querySelector('#home input.code');
  if (codeInput) codeInput.ariaLabel = t('Mã phòng gồm 4 ký tự', '4-character room code');
  const start = document.querySelector('#overlay > .card > button.primary');
  if (start && room) start.disabled = !validateSetup(room.players.length, { ...DEFAULT_CONFIG, ...room.cfg });
}

function paintOnline(room) {
  if (!onlineBoard) return;
  const playing = room.status === ROOM_STATUS.PLAYING && !!room.view;
  onlineBoard.hidden = !playing;
  onlineBoard.inert = !playing;
  if (!playing) {
    onlineBoard.replaceChildren();
    currentView = null;
    return;
  }
  paintBoard(onlineBoard, room.view, app?.id, false);
}

function updateClock() {
  const now = mode === MODE.LOCAL ? localNow() : app?.now() ?? Date.now();
  const seconds = currentView?.deadline ? Math.max(0, Math.ceil((currentView.deadline - now) / MS_PER_SECOND)) : null;
  for (const clock of document.querySelectorAll('[data-clock]')) {
    clock.hidden = seconds === null;
    clock.textContent = seconds === null ? '' : `${seconds}s`;
  }
}

function hideSecrets() {
  for (const modal of document.querySelectorAll('.secret-dialog[open]')) modal.close();
  const needsPaint = shown || ballotOpen || guessOpen;
  shown = false;
  ballotOpen = false;
  guessOpen = false;
  if (!needsPaint) return;
  if (mode === MODE.LOCAL && localStep === LOCAL_STEP.REVEAL) paintReveal();
  else if (mode === MODE.LOCAL && localStep === LOCAL_STEP.PLAY) paintLocal();
  else if (mode === MODE.ONLINE && app?.room) paintOnline(app.room);
}

setInterval(() => {
  if (mode === MODE.LOCAL && localStep === LOCAL_STEP.PLAY && localGame && advance(localGame, localNow())) {
    for (const modal of document.querySelectorAll('.spy-dialog[open]')) modal.close();
    paintLocal();
  }
  updateClock();
}, CLOCK_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hideSecrets();
    for (const modal of document.querySelectorAll('.spy-dialog[open]')) modal.close();
  }
});
addEventListener('keydown', (event) => { if (event.key === 'Escape') hideSecrets(); }, true);
addEventListener('pagehide', hideSecrets);
addEventListener('beforeunload', (event) => {
  if (mode === MODE.LOCAL && localGame && localGame.phase !== PHASE.ENDED) { event.preventDefault(); event.returnValue = ''; }
});

if (new URLSearchParams(location.search).has('r')) enterOnline();
else showHome();

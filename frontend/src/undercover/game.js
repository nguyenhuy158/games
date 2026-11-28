import { nokiaApp } from '../nokia/room.js';
import { el, store } from '../dom.js';
import { t } from '../i18n.js';
import { iconEl } from '../icons.js';
import { openSettings } from '../sidebar.js';
import { mountHelp } from '../help.js';
import { isSoundOn } from '../sound.js';
import { AI_PACK, MIN_PLAYERS, MAX_PLAYERS, NAME_LIMIT, NAME_ERROR, limits, parseNames, DEFAULT_CONFIG, PHASE, ACTION, ROLE, HIDDEN_TEAM, createGame, act, advance, view, validateSetup } from '../../../shared/games/gian-diep/logic.js';
import { HELP } from './help.js';
import { button, iconButton, indicator, note, dialog, confirmAction, settings, countRow, configBadges, setupWarning, paginated, results } from './ui.js';
import { setButtonPending } from '../ui/feedback.mjs';
import { notifications, TOAST_TONE } from '../ui/notifications.js';
import { seatingRoster, orderedPlayers } from './roster.js';
import { aiPicker, dealAiPair, extendAiPack } from './ai.js';

const GAME = 'undercover';
const GAME_PATH = '/undercover/';
const TITLE = t('Ai là gián điệp?', 'Who is the spy?');
const MODE = Object.freeze({ HOME: 'home', LOCAL: 'local', ONLINE: 'online' });
const LOCAL_STEP = Object.freeze({ SETUP: 'setup', REVEAL: 'reveal', PLAY: 'play' });
const ROOM_STATUS = Object.freeze({ PLAYING: 'playing', ENDED: 'ended' });
const MS_PER_SECOND = 1000;
const CLOCK_INTERVAL_MS = 200;
const ACTION_TIMEOUT_MS = 6000;
const GUESS_LIMIT = 120;
const LOCAL_ID_PREFIX = 'local-';
const RANDOM_RANGE = 0x100000000;
const ENDING_MELODIES = new Map([
  [ROLE.CIVILIAN, [523.25, 659.25, 783.99, 1046.5]],
  [HIDDEN_TEAM, [392, 329.63, 261.63, 196]],
]);
const ENDING_NOTE_STEP = 0.12;
const ENDING_NOTE_LENGTH = 0.2;
const ENDING_NOTE_ATTACK = 0.02;
const ENDING_VOLUME = 0.1;
const ENDING_WAVEFORM = 'triangle';
const AUDIO_RUNNING = 'running';
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
const randomValue = new Uint32Array(1);
let endingAudio;
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
let localDealing = false;
let localAiProgress;
let localPlayerCount = MIN_PLAYERS;
const localHostId = `${LOCAL_ID_PREFIX}1`;
let localGame = null;
let localStep = LOCAL_STEP.SETUP;
let revealIndex = 0;
let revealName = '';
let ballotOwner = null;
let ballotOpen = false;
let guessOpen = false;
const localNamesById = new Map();

const main = el('section', { className: 'spy-shell', id: 'spy-local' });
function settingsControl() {
  const control = iconButton(t('Cài đặt', 'Settings'), openSettings, 'settings');
  control.classList.add('spy-settings');
  return control;
}
const helpButton = iconButton(t('Cách chơi', 'How to play'), () => {}, 'info');
const backButton = iconButton(t('Quay lại', 'Back'), goBack, 'arrow-left');
const heading = el('h1', {}, TITLE);
const content = el('main', { className: 'spy-content' });
main.append(el('header', { className: 'spy-header' }, backButton, heading, el('div', { className: 'header-actions' }, helpButton, settingsControl())), content);
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

function defaultName(index) {
  return t(`Người chơi ${index + 1}`, `Player ${index + 1}`);
}

function random() {
  crypto.getRandomValues(randomValue);
  return randomValue[0] / RANDOM_RANGE;
}

function playerName(id) {
  if (mode === MODE.LOCAL) return localNamesById.get(id);
  return app?.room?.players.find((player) => player.id === id)?.name ?? t('Người đã rời phòng', 'Disconnected player');
}

function focusMain() {
  const target = content.querySelector('h2');
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
    el('img', { className: 'entry-logo', src: '/logos/undercover.svg', alt: '' }),
    el('div', { className: 'entry-facts' }, indicator('users', t('3–20 người', '3–20 players')), indicator('crown', t('Chủ phòng cùng chơi', 'Host plays too'))),
    note(t('Đa số nhận cùng một từ, còn gián điệp nhận từ tương tự. Lần lượt đưa gợi ý rồi bỏ phiếu tìm gián điệp.', 'Most players get the same word, while the spies get a similar one. Take turns giving clues, then vote to find the spies.')),
    el('div', { className: 'mode-choices' },
      button(t('Chuyền một máy', 'Pass one device'), startLocalSetup, true, 'smartphone'),
      button(t('Mỗi người một máy', 'One device each'), enterOnline, false, 'users')),
    note(t('Nói gợi ý trực tiếp hoặc qua cuộc gọi riêng.', 'Give clues out loud in person or on your own call.'))));
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

function repaintLocalCounts() {
  paintSetup();
  return content;
}

function paintSetup() {
  const roleLimits = limits(localPlayerCount, localConfig.spies);
  content.replaceChildren(el('div', { className: 'setup stack' },
    el('div', { className: 'setup-fields stack' },
      el('h2', {}, t('Thiết lập ván', 'Game setup')),
      el('div', { className: 'local-counts' },
        countRow(t('Người chơi', 'Players'), 'users', MIN_PLAYERS, MAX_PLAYERS, localPlayerCount, (count) => {
          localPlayerCount = count;
          localConfig.spies = Math.min(localConfig.spies, limits(count).spies);
          localConfig.whites = Math.min(localConfig.whites, limits(count, localConfig.spies).whites);
        }, repaintLocalCounts),
        countRow(t('Gián điệp', 'Spies'), 'eye', DEFAULT_CONFIG.spies, roleLimits.spies, localConfig.spies, (count) => {
          localConfig.spies = count;
          localConfig.whites = Math.min(localConfig.whites, limits(localPlayerCount, count).whites);
        }, repaintLocalCounts),
        countRow(t('Mũ Trắng', 'Mr. White'), 'layers', DEFAULT_CONFIG.whites, roleLimits.whites, localConfig.whites, (count) => { localConfig.whites = count; }, repaintLocalCounts)),
      localPackControls()),
    button(packExhausted(localAiProgress) ? t('Chơi lại bộ này', 'Replay this pack') : t('Bắt đầu', 'Start game'), dealLocal, !packExhausted(localAiProgress), 'play')));
}

function packExhausted(progress) {
  return progress?.count > 0 && progress.used >= progress.count;
}

function packProgress(progress) {
  if (!progress?.count) return '';
  const { used, count } = progress;
  const label = t(`Đã dùng ${used ?? 0}/${count} cặp`, `${used ?? 0}/${count} pairs used`);
  return el('div', { className: 'pack-progress' },
    el('progress', { value: used ?? 0, max: count, ariaLabel: label }),
    note(packExhausted(progress) ? t(`Đã dùng hết ${count} cặp`, `All ${count} pairs used`) : label));
}

function expandPackButton(packId, roomContext, apply) {
  return button(t('Tạo thêm cặp từ', 'Add more word pairs'), async (event) => {
    const restore = setButtonPending(event.currentTarget, t('AI đang tạo thêm…', 'AI is adding pairs…'));
    try { apply(await extendAiPack(packId, roomContext)); }
    catch (error) { notifications.show(TOAST_TONE.ERROR, error.message); }
    finally { restore(); }
  }, true, 'sparkles');
}

function localPackControls() {
  const selected = localConfig.pack === AI_PACK;
  const choose = button(selected ? t('Đổi chủ đề AI', 'Change AI topic') : t('Tạo bộ từ AI', 'Create AI pack'), openLocalAi, false, 'sparkles');
  if (!selected) return choose;
  const reset = button(t('Dùng bộ mặc định', 'Use default pack'), () => {
    const { spies, whites } = localConfig;
    localConfig = { ...DEFAULT_CONFIG, spies, whites };
    localAiProgress = undefined;
    paintSetup();
  });
  return el('div', { className: 'stack' },
    note(t(`Bộ từ AI: ${localConfig.aiTopic}`, `AI pack: ${localConfig.aiTopic}`)),
    packProgress(localAiProgress),
    el('div', { className: 'actions' },
      packExhausted(localAiProgress) ? expandPackButton(localConfig.aiPackId, {}, (progress) => {
        if (mode !== MODE.LOCAL || localStep !== LOCAL_STEP.SETUP || localConfig.aiPackId !== progress.packId) return;
        localAiProgress = progress;
        paintSetup();
      }) : '',
      choose, reset));
}

function openLocalAi() {
  aiPicker(({ packId, title, used, count }) => {
    localAiProgress = { used, count };
    localConfig = { ...localConfig, pack: AI_PACK, aiPackId: packId, aiTopic: title };
    if (mode === MODE.LOCAL && localStep === LOCAL_STEP.SETUP) paintSetup();
  });
}

async function dealLocal(event) {
  if (!event.currentTarget.isConnected || localDealing) return;
  localDealing = true;
  content.inert = true;
  backButton.disabled = true;
  const restore = setButtonPending(event.currentTarget, t('Đang chia từ…', 'Dealing…'));
  try {
    const pair = localConfig.pack === AI_PACK ? await dealAiPair(localConfig.aiPackId, (progress) => { localAiProgress = progress; }) : undefined;
    localNamesById.clear();
    const ids = Array.from({ length: localPlayerCount }, (_, index) => `${LOCAL_ID_PREFIX}${index + 1}`);
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
  revealName = '';
  shown = false;
  ballotOwner = null;
  ballotOpen = false;
  guessOpen = false;
  guessDraft = '';
  paintReveal();
  focusMain();
}

function paintReveal() {
  const player = localGame.players[revealIndex];
  const index = revealIndex;
  const heading = el('h2', {}, revealName || defaultName(index));
  const step = el('div', { className: 'handoff stack' },
    el('p', { className: 'progress-label' }, t(`Nhận thẻ ${index + 1}/${localPlayerCount}`, `Card ${index + 1}/${localPlayerCount}`)),
    heading);
  if (shown) {
    const done = button(t('Đã xem', 'Done viewing'), () => {
      if (!done.isConnected) return;
      localNamesById.set(player.id, revealName);
      shown = false;
      revealName = '';
      revealIndex++;
      if (revealIndex === localGame.players.length) {
        localStep = LOCAL_STEP.PLAY;
        sendAction({ a: ACTION.NEXT });
      } else paintReveal();
      focusMain();
    }, true, 'arrow-right');
    step.append(flippedCard(view(localGame, player.id).card), done);
  } else if (revealName) {
    const reveal = button(t('Xem từ khóa', 'View keyword'), () => {
      if (!reveal.isConnected) return;
      shown = true;
      paintReveal();
      focusMain();
    }, true, 'eye');
    step.append(coveredCard(), reveal);
  } else {
    const input = el('input', { type: 'text', ariaLabel: t('Tên của bạn', 'Your name'), placeholder: t('Tên của bạn', 'Your name'), maxLength: NAME_LIMIT, autocomplete: 'off' });
    const error = el('p', { className: 'warning', role: 'alert', hidden: true });
    const form = el('form', { className: 'stack' }, note(t(`Chuyền máy cho người chơi ${index + 1} để nhập tên và xem từ.`, `Pass the device to player ${index + 1} to enter their name and see their word.`)), input, error);
    const next = button(t('Tiếp tục', 'Continue'), null, true, 'arrow-right');
    next.type = 'submit';
    form.append(next);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.isConnected) return;
      const result = parseNames(input.value, [...localNamesById.values()]);
      if (result.error) {
        error.textContent = result.error === NAME_ERROR.DUPLICATE
          ? t('Tên này đã được dùng.', 'This name is already taken.')
          : t('Nhập tên của bạn.', 'Enter your name.');
        error.hidden = false;
        input.focus();
        return;
      }
      [revealName] = result.names;
      paintReveal();
      focusMain();
    });
    step.append(form);
  }
  content.replaceChildren(step);
}

function coveredCard() {
  return el('section', { className: 'secret-card secret-covered' },
    iconEl('layers'),
    el('h3', {}, t('Thẻ đang úp', 'Card face down')),
    note(t('Chỉ mở khi mình bạn nhìn màn hình.', 'Open it when only you can see the screen.')));
}

function flippedCard(card) {
  const back = el('div', { className: 'secret-card secret-flip-back', ariaHidden: 'true' }, iconEl('layers'));
  const face = el('section', { className: 'secret-card', ariaLabel: t('Thẻ bí mật', 'Secret card') },
    el('p', { className: 'sub' }, card.white ? t('Bạn là Mũ Trắng', 'You are Mr. White') : t('Từ bí mật của bạn', 'Your secret word')),
    el('strong', { className: 'secret-word', textContent: card.white ? t('Không có từ', 'No word') : card.word ?? '' }),
    note(card.white ? t('Nghe gợi ý và hòa nhập. Khi bị loại, bạn có một lần đoán từ của dân.', 'Listen to clues and blend in. If eliminated, you get one guess at the civilian word.') : t('Ghi nhớ từ. Không nói nguyên từ hoặc cho người khác xem.', 'Remember it. Do not say the word or show it to anyone.')));
  return el('div', { className: 'secret-flip' }, back, face);
}

function unlockEndingAudio() {
  if (!isSoundOn()) return;
  const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Audio) return;
  try {
    endingAudio ??= new Audio();
    if (endingAudio.state !== AUDIO_RUNNING) void endingAudio.resume().catch(() => {});
  } catch {}
}

function playEnding(winner) {
  const melody = ENDING_MELODIES.get(winner);
  if (!melody || !isSoundOn()) return;
  unlockEndingAudio();
  if (!endingAudio) return;
  const start = endingAudio.currentTime;
  for (const [index, frequency] of melody.entries()) {
    const at = start + index * ENDING_NOTE_STEP;
    const stop = at + ENDING_NOTE_LENGTH;
    const tone = endingAudio.createOscillator();
    const volume = endingAudio.createGain();
    tone.type = ENDING_WAVEFORM;
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(ENDING_VOLUME, at + ENDING_NOTE_ATTACK);
    volume.gain.linearRampToValueAtTime(0, stop);
    tone.connect(volume).connect(endingAudio.destination);
    tone.start(at);
    tone.stop(stop);
  }
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
    if (beforePhase !== localGame.phase) {
      guessOpen = false;
      guessDraft = '';
      if (localGame.phase === PHASE.ENDED) playEnding(localGame.winner);
    }
    paintLocal();
    return;
  }
  if (!app || pendingOnline) return;
  const active = document.activeElement;
  const restore = active?.tagName === 'BUTTON' ? setButtonPending(active, t('Đang gửi…', 'Sending…')) : () => {};
  const timer = setTimeout(() => {
    clearPending();
    notifications.show(TOAST_TONE.WARNING, t('Chưa nhận xác nhận. Kiểm tra kết nối và trạng thái trước khi thử lại.', 'No confirmation yet. Check the connection and current state before retrying.'));
  }, ACTION_TIMEOUT_MS);
  pendingOnline = { restore, timer };
  app.send(message);
}

function clearPending() {
  if (!pendingOnline) return;
  clearTimeout(pendingOnline.timer);
  pendingOnline.restore();
  pendingOnline = null;
}

function paintLocal() {
  if (!localGame || localStep !== LOCAL_STEP.PLAY) return;
  const publicView = view(localGame, null);
  if (publicView.phase === PHASE.VOTE) {
    const voter = localGame.players.find((player) => player.alive && !Object.hasOwn(localGame.votes, player.id));
    if (ballotOwner !== voter.id) { ballotOwner = voter.id; ballotOpen = false; }
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
    target.replaceChildren(el('div', { className: 'game-result stack' }, results(v, playerName), isLocal ? button(t('Chơi ván mới', 'Play a new game'), startLocalSetup, true, 'rotate-ccw') : ''));
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
  const turnOrder = v.turnOrder ?? [];
  const showOrder = v.phase === PHASE.DESCRIBE && turnOrder.length > 0;
  const orderedRoster = showOrder ? orderedPlayers(rosterPlayers, turnOrder) : rosterPlayers;
  const renderPlayer = (player) => {
    const suffix = player.id === v.speaker ? t('Đang nói', 'Speaking') : player.alive ? t('Còn chơi', 'Alive') : t('Đã loại', 'Out');
    return el('div', { className: `player-row${player.id === v.speaker ? ' speaking' : ''}` }, el('span', { className: 'player-name' }, showOrder && player.alive ? `${turnOrder.indexOf(player.id) + 1}. ${playerName(player.id)}` : playerName(player.id)), indicator(player.id === v.speaker ? 'megaphone' : player.alive ? 'circle-check' : 'circle-x', '', suffix));
  };
  const roster = el('div', { className: 'player-grid play-roster', role: 'region', ariaLabel: t('Người chơi', 'Players'), tabIndex: 0 }, ...orderedRoster.map(renderPlayer));
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
  const previousRoster = target.querySelector('.play-roster');
  const rosterScroll = previousRoster?.scrollTop ?? 0;
  const rosterWasFocused = previousRoster && document.activeElement === previousRoster;
  target.replaceChildren(el('div', { className: 'game-layout' }, el('div', { className: 'game-main' }, status, work, controls), info));
  roster.scrollTop = rosterScroll;
  if (rosterWasFocused && roster.isConnected) roster.focus({ preventScroll: true });
  updateClock();
}

function openOwnCard(card) {
  const holder = el('div', { className: 'handoff stack' });
  const done = button(t('Đã xem', 'Done viewing'), () => modal.close(), true, 'arrow-right');
  const reveal = button(t('Xem từ khóa', 'View keyword'), () => {
    holder.replaceChildren(flippedCard(card), done);
    done.focus();
  }, true, 'eye');
  holder.append(coveredCard(), reveal);
  const modal = dialog(t('Thẻ riêng', 'Private card'), holder);
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
    sub: t('Tạo phòng để mời bạn, hoặc nhập mã để tham gia.', 'Create a room to invite friends, or join with a code.'),
    help: HELP,
    winSound: false,
    lobbyText: (room) => setupWarning(room.players.length, { ...DEFAULT_CONFIG, ...room.cfg }) || t('Sẵn sàng chia từ.', 'Ready to deal.'),
    badge: (player, room) => room.view?.players.find((item) => item.id === player.id)?.alive === false ? t('Đã loại', 'Out') : '',
    lobby(box, room, host, setConfig) {
      const cfg = { ...DEFAULT_CONFIG, ...room.cfg };
      if (room.status === ROOM_STATUS.ENDED && room.view?.reveal) box.append(results(room.view, playerName));
      const players = orderedPlayers(room.players, cfg.order);
      const changeOrder = host && players.length > 1 && room.status !== ROOM_STATUS.PLAYING ? (next) => {
        if (app?.room?.host !== app?.id || app.room.status === ROOM_STATUS.PLAYING) return;
        setConfig({ order: next.map((player) => player.id) });
      } : null;
      box.append(seatingRoster(players, room.host, changeOrder, random));
      const roomContext = { room: new URLSearchParams(location.search).get('r'), deviceId: app.id };
      const ready = () => notifications.show(TOAST_TONE.SUCCESS, t('Bộ từ AI đã sẵn sàng.', 'AI pack is ready.'));
      const chooseAi = () => aiPicker(ready, roomContext);
      box.append(el('div', { className: 'settings-summary stack' }, configBadges(cfg), host ? button(t('Thiết lập ván', 'Game setup'), () => settings(room.players.length, cfg, setConfig, chooseAi), false, 'gauge') : ''));
      if (room.aiProgress) box.append(packProgress(room.aiProgress));
      if (host && packExhausted(room.aiProgress)) box.append(el('div', { className: 'actions' },
        expandPackButton(cfg.aiPackId, roomContext, ready),
        button(t('Đổi chủ đề AI', 'Change AI topic'), chooseAi)));
    },
    mount(stage) {
      onlineBoard = stage;
    },
    onState(room, previous) {
      clearPending();
      if (room.status === ROOM_STATUS.ENDED && previous?.status === ROOM_STATUS.PLAYING) playEnding(room.view?.winner);
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
  const back = iconButton(t('Chọn cách chơi khác', 'Choose another mode'), () => { home.hidden = true; showHome(); }, 'arrow-left');
  const form = home.querySelector('.card');
  const controls = home.querySelector('.lang');
  controls.className = 'header-actions';
  controls.append(settingsControl());
  const heading = el('h1', {}, t('Mỗi người một máy', 'One device each'));
  form.querySelector('h1').remove();
  home.prepend(el('header', { className: 'spy-header' }, back, heading, controls));
  const room = document.getElementById('room');
  room.querySelector('header').append(settingsControl());
  const leave = room.querySelector('header button');
  leave.addEventListener('click', (event) => {
    if (app.room?.status !== ROOM_STATUS.PLAYING) return;
    if (leave.dataset.confirmed) { delete leave.dataset.confirmed; return; }
    event.stopImmediatePropagation();
    hideSecrets();
    confirmAction(t('Rời phòng?', 'Leave the room?'), t('Ván vẫn tiếp tục cho những người còn lại. Có thể dùng mã phòng để quay lại.', 'The game continues for everyone else. Use the room code to reconnect.'), () => { leave.dataset.confirmed = 'yes'; leave.click(); });
  }, true);
  for (const helpControl of document.querySelectorAll('[data-help="undercover"]')) helpControl.addEventListener('click', hideSecrets, true);
}

function enhanceRoomShell(room = app?.room) {
  for (const control of document.querySelectorAll('#home button, #room button')) {
    control.classList.add('ui-button');
    if (control.classList.contains('primary')) control.dataset.variant = 'primary';
  }
  const codeInput = document.querySelector('#home input.code');
  codeInput.ariaLabel = t('Mã phòng gồm 4 ký tự', '4-character room code');
  const start = document.querySelector('#overlay > .card > button.primary');
  if (start && room) start.disabled = !validateSetup(room.players.length, { ...DEFAULT_CONFIG, ...room.cfg });
}

function paintOnline(room) {
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
addEventListener('pointerup', unlockEndingAudio);
addEventListener('keydown', unlockEndingAudio);
addEventListener('beforeunload', (event) => {
  if (mode === MODE.LOCAL && localGame && localGame.phase !== PHASE.ENDED) { event.preventDefault(); event.returnValue = ''; }
});

if (new URLSearchParams(location.search).has('r')) enterOnline();
else showHome();

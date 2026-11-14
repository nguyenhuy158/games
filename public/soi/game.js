import { nokiaApp } from '../nokia/room.js';
import { iconEl } from '../icons.js';
import { t } from '../i18n.js';
import { el } from '../dom.js';
import { MIN_PLAYERS, WOLF } from './logic.js';

// Thẻ vai úp: chạm mới lật (tránh người bên cạnh liếc màn hình), sang ván mới thì úp lại.
// Server chỉ gửi vai của chính mình; chủ phòng lật bài thì ván kết thúc và bảng kết quả nêu tên Sói.
let shown = false, round = -1;
let card, revealBtn;

const app = nokiaApp({
  game: 'soi',
  path: '/soi/',
  title: t('Sói', 'Werewolf'),
  sub: t('Mỗi ván chọn ngẫu nhiên 1 người làm Sói, những người còn lại là Dân. Mỗi người chỉ thấy vai của mình.', 'Each round picks one player at random as the wolf; everyone else is a villager. You only see your own role.'),
  help: {
    vi: {
      goal: 'Chọn ngẫu nhiên 1 Sói trong phòng, những người còn lại là Dân. Cả phòng tự bàn bạc để tìm ra Sói.',
      play: [
        `Một người tạo phòng và chia sẻ mã 4 ký tự hoặc link mời. Cần ít nhất ${MIN_PLAYERS} người, tối đa 12.`,
        'Chủ phòng bấm Bắt đầu: máy chủ chọn ngẫu nhiên đúng 1 Sói, mọi người còn lại là Dân.',
        'Mỗi người chạm vào thẻ để xem vai của riêng mình. Không ai, kể cả chủ phòng, biết vai của người khác.',
        'Cả phòng nói chuyện, tranh luận, đoán ai là Sói (gặp mặt hoặc qua cuộc gọi).',
        'Chủ phòng bấm Lật bài để công bố Sói, rồi bấm Chơi lại để mở ván mới.',
      ],
      keys: ['Bấm chuột vào thẻ để xem vai, bấm Ẩn vai để úp lại.'],
      touch: ['Chạm vào thẻ để xem vai, chạm Ẩn vai để úp lại.'],
      tips: [
        'Úp thẻ lại ngay sau khi xem, nhất là khi ngồi gần nhau.',
        'Điện thoại tắt màn hình hay mất mạng giữa ván thì vẫn giữ vai, mở lại là vào tiếp.',
        'Người vào phòng khi ván đang chạy chỉ được xem, chờ ván sau.',
      ],
    },
    en: {
      goal: 'One player in the room is picked at random as the wolf, everyone else is a villager. The room talks it over to find the wolf.',
      play: [
        `One player creates a room and shares the 4-character code or the invite link. You need at least ${MIN_PLAYERS} players, at most 12.`,
        'The host taps Start: the server picks exactly one wolf at random, everyone else is a villager.',
        'Each player taps their card to see their own role. Nobody, not even the host, can see anyone else\'s role.',
        'The room talks and argues about who the wolf is (in person or on a call).',
        'The host taps Reveal to announce the wolf, then Play again for a new round.',
      ],
      keys: ['Click the card to see your role, click Hide to flip it back.'],
      touch: ['Tap the card to see your role, tap Hide to flip it back.'],
      tips: [
        'Flip the card back right after looking, especially when sitting close together.',
        'If your screen sleeps or the connection drops mid-round you keep your role: just reopen the page.',
        'Anyone joining while a round runs can only watch until the next one.',
      ],
    },
  },
  lobbyText: (r) => (r.players.length < MIN_PLAYERS
    ? t(`Cần thêm ${MIN_PLAYERS - r.players.length} người (tối thiểu ${MIN_PLAYERS}).`, `Need ${MIN_PLAYERS - r.players.length} more (minimum ${MIN_PLAYERS}).`)
    : t('Đủ người: chủ phòng bấm Bắt đầu để chọn Sói.', 'Enough players: the host starts to pick the wolf.')),
  badge: (p, r) => (r.view?.wolf === p.id ? t('Sói', 'Wolf') : ''),
  mount(stage) {
    card = el('div', { className: 'role' });
    revealBtn = el('button', { className: 'primary', onclick: () => app.send({ a: 'reveal' }) }, iconEl('eye'), ' ', t('Lật bài: ai là Sói?', 'Reveal: who is the wolf?'));
    stage.append(el('div', { className: 'soi' }, card, revealBtn));
  },
  render(r) {
    const v = r.view;
    if (!v || r.status !== 'playing') return;
    if (v.round !== round) { round = v.round; shown = false; }
    paint(r, v);
  },
});

function flip(on) {
  shown = on;
  if (app.room) paint(app.room, app.room.view);
}

function paint(r, v) {
  revealBtn.hidden = r.host !== app.id;
  card.className = `role${v.role && shown ? ` ${v.role}` : ''}${v.role ? '' : ' watching'}`;
  if (!v.role) {
    card.replaceChildren(iconEl('eye'), el('h2', {}, t('Bạn đang xem', 'You are watching')), el('p', {}, t('Chờ ván sau để được chia vai.', 'Wait for the next round to get a role.')));
  } else if (!shown) {
    card.replaceChildren(iconEl('hand'), el('p', {}, t('Đừng cho ai nhìn thấy màn hình của bạn.', 'Do not let anyone see your screen.')),
      el('button', { className: 'primary', onclick: () => flip(true) }, t('Chạm để xem vai', 'Tap to see your role')));
  } else {
    const wolf = v.role === WOLF;
    card.replaceChildren(iconEl(wolf ? 'paw-print' : 'users'), el('h2', {}, wolf ? t('Bạn là SÓI', 'You are the WOLF') : t('Bạn là DÂN', 'You are a VILLAGER')),
      el('p', {}, wolf ? t('Giữ bí mật, đừng để bị phát hiện.', 'Keep it secret, do not get caught.') : t('Tìm ra ai là Sói trong phòng.', 'Find out who the wolf is.')),
      el('button', { onclick: () => flip(false) }, t('Ẩn vai', 'Hide')));
  }
}

import { nokiaApp } from '../nokia/room.js';
import { iconEl } from '../icons.js';
import { t } from '../i18n.js';
import { el } from '../dom.js';
import { playerAvatar } from '../player-avatar.js';
import { ACTION, MIN_PLAYERS, OUTCOME, WOLF } from '../../../shared/games/soi/logic.js';


// Thẻ vai úp: chạm mới lật (tránh người bên cạnh liếc màn hình), sang ván mới thì úp lại.
// Server chỉ gửi vai của chính mình; chủ phòng lật bài thì ván kết thúc và bảng kết quả nêu tên Sói.
let shown = false, round = -1;
let card, revealBtn, voting, roundHeading;
let voteOpen = false;
let selectedSuspect = null;
const ENDING_TONES = {
  [OUTCOME.CORRECT]: [523.25, 659.25, 783.99],
  [OUTCOME.WRONG]: [392, 329.63, 261.63],
};
const NOTE_MS = 170;

const app = nokiaApp({
  game: 'soi',
  path: '/soi/',
  title: t('Sói', 'Werewolf'),
  sub: t('Tạo phòng để chia vai bí mật. Khi chơi trực tiếp, Sói nháy mắt để loại dân làng, còn dân tìm ra Sói.', 'Create a room to deal secret roles. Play face to face, with the Wolf winking players out while the villagers try to identify the Wolf.'),
  help: {
    vi: {
      goal: 'Bắt Sói — thử thách quan sát và suy luận trong video, đoạn 1:12:33–1:13:24. Một người là Sói, những người còn lại là Dân. Web hỗ trợ chia vai bí mật; cả nhóm chơi trực tiếp với nhau.',
      play: [
        'Chia vai: trong video, mọi người nhắm mắt, gõ hai tay xuống bàn; ekip bốc thăm và chạm vai người làm Sói. Trên web, chủ phòng bấm Bắt đầu để chọn ngẫu nhiên 1 Sói; mỗi người tự xem rồi ẩn vai.',
        'Mở mắt, trò chuyện theo chủ đề người điều phối đưa ra. Sói chọn lúc thích hợp để nháy mắt tấn công một dân làng mà không bị phát hiện.',
        'Dân bị nháy mắt phải đeo khẩu trang, giữ im lặng và không tiết lộ Sói. Khi 3 dân bị loại, dừng trò chuyện.',
        'Những người còn sống suy luận và chỉ ra nghi phạm. Chốt lựa chọn trước khi chủ phòng bấm Lật bài để công bố Sói.',
        'Tìm đúng Sói: mỗi dân sống sót được 200 điểm. Không tìm ra: Sói được 300 điểm. Trong video, điểm này cộng vào điểm sức mạnh cá nhân.',
      ],
      keys: ['Bấm thẻ để xem vai, bấm Ẩn vai để úp lại. Chủ phòng bấm Lật bài sau khi nhóm đã đoán, rồi Chơi lại cho ván mới.'],
      touch: ['Chạm thẻ để xem vai, chạm Ẩn vai để úp lại. Không cho người bên cạnh nhìn màn hình.'],
      tips: [
        `Tạo phòng rồi chia sẻ mã 4 ký tự hoặc link mời. Web nhận ${MIN_PLAYERS}–12 người; nên có ít nhất 5 người để còn dân suy luận sau khi 3 dân bị loại.`,
        'Nháy mắt, loại người, chọn nghi phạm và ghi điểm do nhóm tự thực hiện ngoài đời; web chưa tự xử lý các bước này.',
        'Mất mạng hoặc tắt màn hình vẫn giữ vai. Người vào giữa ván chờ ván sau để được chia vai.',
      ],
    },
    en: {
      goal: 'Catch the Wolf — the observation and deduction challenge in the video at 1:12:33–1:13:24. One player is the Wolf; everyone else is a Villager. The website deals secret roles; play together in person.',
      play: [
        'Assign roles: in the video, everyone closes their eyes and taps the table with both hands; the crew draws lots and taps the Wolf on the shoulder. On the website, the host taps Start to pick one random Wolf; each player views and hides their own role.',
        'Open your eyes and discuss a topic chosen by the moderator. The Wolf secretly winks at a Villager to attack without being spotted.',
        'A winked-at Villager puts on a mask, stays silent and must not reveal the Wolf. Stop the conversation once 3 Villagers are out.',
        'The survivors discuss and name their suspect. Agree on a suspect before the host taps Reveal to announce the Wolf.',
        'Catch the Wolf: each surviving Villager earns 200 points. Fail to find the Wolf: the Wolf earns 300 points. In the video, these count toward individual strength scores.',
      ],
      keys: ['Click your card to view your role, then Hide. The host taps Reveal after the group guesses, then Play again for a new round.'],
      touch: ['Tap your card to view your role, then Hide. Keep your screen hidden from other players.'],
      tips: [
        `Create a room and share its 4-character code or invite link. The website accepts ${MIN_PLAYERS}–12 players; use at least 5 so a Villager survives after 3 are out.`,
        'Winking, eliminations, naming a suspect and keeping score happen in person; the website does not automate these steps.',
        'Your role survives a dropped connection or sleeping screen. Players joining mid-round wait until the next round for a role.',
      ],
    },
  },
  minPlayers: MIN_PLAYERS,
  nextRoundLabel: t('Bắt đầu ván mới', 'Start new round'),
  lobbyHeading: (r) => r.players.length < MIN_PLAYERS
    ? t('Chờ người chơi', 'Waiting for players')
    : t('Sẵn sàng chia vai', 'Ready to deal roles'),
  lobbyText: (r) => (r.players.length < MIN_PLAYERS
    ? t(`Cần thêm ${MIN_PLAYERS - r.players.length} người (tối thiểu ${MIN_PLAYERS}).`, `Need ${MIN_PLAYERS - r.players.length} more (minimum ${MIN_PLAYERS}).`)
    : r.status === 'ended'
      ? t('Có thể chia vai ván mới.', 'Ready for another round.')
      : t('Đủ người: chủ phòng bấm Bắt đầu để chọn Sói.', 'Enough players: the host starts to pick the wolf.')),
  roster: (r) => {
    const online = new Set(r.players.map(({ id }) => id));
    const offline = (r.view?.roster ?? []).filter(({ id }) => !online.has(id)).map((p) => ({ ...p, offline: true }));
    return [...r.players, ...offline];
  },
  badge: (p, r) => [
    r.view?.wolf === p.id ? t('Sói', 'Wolf') : '',
    p.offline ? t('Ngoại tuyến', 'Offline') : '',
  ].filter(Boolean).join(' · '),
  lobby(box, r) {
    if (r.status === 'ended' && r.view?.round) {
      const number = r.view.round;
      box.append(el('p', { className: 'sub soi-round-summary', textContent: t(`Ván ${number} đã kết thúc`, `Round ${number} ended`) }));
    }
    if (!r.result?.outcome) return;
    const { outcome, suspect, wolf } = r.result;
    box.append(el('div', { className: `soi-outcome ${outcome}` },
      el('p', { textContent: t(`Cả phòng chọn: ${suspect}`, `The room chose: ${suspect}`) }),
      el('p', { textContent: t(`Sói thật: ${wolf}`, `The wolf was: ${wolf}`) })));
  },
  onState(r, previous, roomApp) {
    if (r.status !== 'ended' || previous?.status !== 'playing') return;
    ENDING_TONES[r.result?.outcome]?.forEach((frequency, index) => {
      setTimeout(() => {
        if (roomApp.room?.status === 'ended' && roomApp.room.view?.round === r.view?.round) {
          roomApp.beep(frequency, NOTE_MS, 'sine');
        }
      }, index * NOTE_MS);
    });
  },
  mount(stage) {
    roundHeading = el('h2', { className: 'soi-round', role: 'status' });
    card = el('div', { className: 'role' });
    revealBtn = el('button', { className: 'primary', onclick: () => app.send({ a: ACTION.REVEAL }) });
    voting = el('div', { className: 'soi-voting' });
    stage.append(el('div', { className: 'soi' }, roundHeading, card, voting, revealBtn));
  },
  render(r) {
    const v = r.view;
    if (r.status !== 'playing' || v?.round !== round) {
      round = v?.round;
      shown = false;
      voteOpen = false;
      selectedSuspect = null;
    }
    if (v && r.status === 'playing') paint(r, v);
  },
});

function flip(on) {
  shown = on;
  if (app.room) paint(app.room, app.room.view);
}

function paint(r, v) {
  const roundLabel = t(`Ván ${v.round}`, `Round ${v.round}`);
  if (roundHeading.textContent !== roundLabel) roundHeading.textContent = roundLabel;
  revealBtn.hidden = r.host !== app.id;
  revealBtn.classList.toggle('primary', !voteOpen);
  revealBtn.replaceChildren(iconEl('eye'), ' ', voteOpen
    ? t('Lật bài trực tiếp', 'Reveal directly')
    : t('Lật bài: ai là Sói?', 'Reveal: who is the wolf?'));
  paintVote(r, v);
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


function paintVote(r, v) {
  if (r.host !== app.id) {
    voteOpen = false;
    selectedSuspect = null;
    voting.replaceChildren();
    return;
  }

  if (!voteOpen) {
    voting.replaceChildren(el('button', { type: 'button', onclick: () => {
      voteOpen = true;
      paint(r, v);
    } }, t('Ghi lựa chọn của nhóm', 'Record the group’s choice')));
    return;
  }

  const candidates = (v.roster ?? r.players).filter(({ id }) => r.seats.includes(id));
  const choices = candidates.map((player) => el('button', {
    type: 'button',
    ariaPressed: String(player.id === selectedSuspect),
    onclick: () => {
      selectedSuspect = player.id;
      paintVote(r, v);
    },
  }, playerAvatar(player), player.name));

  voting.replaceChildren(
    el('h2', { textContent: t('Cả nhóm nghi ai?', 'Who does the group suspect?') }),
    el('p', { textContent: t('Chọn người mà nhóm đã thống nhất ngoài đời.', 'Choose the person the group agreed on in person.') }),
    ...choices,
    el('button', {
      type: 'button', className: 'primary', disabled: !selectedSuspect,
      onclick: () => {
        app.unlockSound();
        app.send({ a: ACTION.GROUP_VOTE, target: selectedSuspect });
      },
    }, t('Chốt lựa chọn', 'Confirm choice')),
  );
}

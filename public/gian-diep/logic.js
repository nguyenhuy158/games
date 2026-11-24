export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;
export const DURATIONS = Object.freeze([5, 10, 15]);
export const DEFAULT_CONFIG = Object.freeze({ spies: 1, whites: 0, seconds: 15, pack: 'food' });
export const PHASE = Object.freeze({ DEAL: 'deal', DESCRIBE: 'describe', DISCUSS: 'discuss', COUNTDOWN: 'countdown', VOTE: 'vote', TIE: 'tie', GUESS: 'guess', ENDED: 'ended' });
export const ACTION = Object.freeze({ NEXT: 'next', VOTING: 'voting', VOTE: 'vote', ELIMINATE: 'eliminate', GUESS: 'guess' });
export const ROLE = Object.freeze({ CIVILIAN: 'civilian', SPY: 'spy', WHITE: 'white' });
export const PACKS = [
  {
    id: 'food', label: ['Ẩm thực', 'Food'], pairs: [
      ['Phở', 'Bún bò'], ['Bánh mì', 'Bánh bao'], ['Cà phê', 'Trà sữa'], ['Bánh chưng', 'Bánh tét'],
      ['Nem rán', 'Gỏi cuốn'], ['Cháo', 'Súp'], ['Kem', 'Sữa chua'], ['Dưa hấu', 'Dưa lưới'],
      ['Xôi', 'Cơm nếp'], ['Bánh xèo', 'Bánh khọt'], ['Nước mía', 'Nước dừa'], ['Mì xào', 'Cơm rang'],
      ['Bún chả', 'Bún thịt nướng'], ['Bánh flan', 'Rau câu'], ['Khoai lang', 'Khoai tây'], ['Lẩu', 'Đồ nướng'],
    ],
  },
  {
    id: 'places', label: ['Địa điểm', 'Places'], pairs: [
      ['Bãi biển', 'Hồ bơi'], ['Thư viện', 'Nhà sách'], ['Chợ', 'Siêu thị'], ['Rạp phim', 'Nhà hát'],
      ['Sân bay', 'Nhà ga'], ['Công viên', 'Vườn hoa'], ['Khách sạn', 'Nhà nghỉ'], ['Bảo tàng', 'Phòng tranh'],
      ['Quán cà phê', 'Quán trà'], ['Sở thú', 'Thủy cung'], ['Núi', 'Đồi'], ['Sông', 'Suối'],
      ['Làng quê', 'Thị trấn'], ['Bệnh viện', 'Phòng khám'], ['Sân vận động', 'Nhà thi đấu'], ['Chùa', 'Đền'],
    ],
  },
  {
    id: 'culture', label: ['Đời sống', 'Everyday culture'], pairs: [
      ['Áo dài', 'Áo bà ba'], ['Tết', 'Trung thu'], ['Lì xì', 'Quà sinh nhật'], ['Đèn lồng', 'Đèn ông sao'],
      ['Nón lá', 'Mũ cói'], ['Cờ vua', 'Cờ tướng'], ['Cầu lông', 'Bóng bàn'], ['Guitar', 'Đàn ukulele'],
      ['Xe đạp', 'Xe máy'], ['Quạt', 'Điều hòa'], ['Bút bi', 'Bút chì'], ['Tập vở', 'Sổ tay'],
      ['Truyện tranh', 'Phim hoạt hình'], ['Chụp ảnh', 'Quay phim'], ['Dã ngoại', 'Cắm trại'], ['Karaoke', 'Hòa nhạc'],
    ],
  },
];

const HIDDEN_TEAM = 'hidden';
const MIN_SPIES = 1;
const MIN_CIVILIANS = 2;
const HIDDEN_DIVISOR = 3;
const SMALL_GROUP_MAX = 4;
const WHITE_MIN_PLAYERS = 6;
const MAX_WHITES = 2;
const MS_PER_SECOND = 1000;
const COUNTDOWN_MS = 3 * MS_PER_SECOND;
const PAIR_WORDS = 2;
const MAX_GUESS_LENGTH = 120;
const NORMALIZATION = 'NFD';
const DIACRITICS = /\p{M}/gu;
const STROKED_D = /đ/g;
const WHITESPACE = /\s+/gu;
const PLAIN_D = 'd';
const WORD_SPACE = ' ';
const CONFIG_FIELDS = new Set(Object.keys(DEFAULT_CONFIG));
const MANUAL_PHASES = new Set([PHASE.DESCRIBE, PHASE.DISCUSS, PHASE.COUNTDOWN, PHASE.VOTE]);
const validObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validTime = (now) => Number.isFinite(now) && now >= 0;
const alivePlayers = (g) => g.players.filter((player) => player.alive);
const normalizedWord = (word) => word.toLowerCase().normalize(NORMALIZATION).replace(DIACRITICS, '').replace(STROKED_D, PLAIN_D).trim().replace(WHITESPACE, WORD_SPACE);
const hiddenCap = (n) => Math.ceil(n / HIDDEN_DIVISOR);

export function limits(n, spies = DEFAULT_CONFIG.spies) {
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) return { spies: 0, whites: 0 };
  const maxSpies = n <= SMALL_GROUP_MAX ? MIN_SPIES : hiddenCap(n);
  const whiteCap = n < WHITE_MIN_PLAYERS ? 0 : n === WHITE_MIN_PLAYERS ? 1 : MAX_WHITES;
  const whites = Number.isInteger(spies) && spies >= MIN_SPIES && spies <= maxSpies
    ? Math.max(0, Math.min(whiteCap, hiddenCap(n) - spies, n - spies - MIN_CIVILIANS)) : 0;
  return { spies: maxSpies, whites };
}

export function normalizeConfig(cfg) {
  if (!validObject(cfg) || Object.keys(cfg).some((key) => !CONFIG_FIELDS.has(key))) return null;
  const next = { ...DEFAULT_CONFIG, ...cfg };
  if (!Number.isInteger(next.spies) || next.spies < MIN_SPIES || next.spies > limits(MAX_PLAYERS).spies) return null;
  if (!Number.isInteger(next.whites) || next.whites < 0 || next.whites > MAX_WHITES) return null;
  if (next.spies + next.whites > hiddenCap(MAX_PLAYERS)) return null;
  if (!DURATIONS.includes(next.seconds) || !PACKS.some((pack) => pack.id === next.pack)) return null;
  return next;
}

export function validateSetup(n, cfg) {
  const next = normalizeConfig(cfg);
  if (!next || !Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) return false;
  const cap = limits(n, next.spies);
  return next.spies <= cap.spies && next.whites <= cap.whites && n - next.spies - next.whites >= MIN_CIVILIANS;
}

function randomIndex(length, rand) {
  const value = rand();
  return Math.min(length - 1, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * length)));
}

export function createGame(ids, cfg, rand, now) {
  if (!Array.isArray(ids) || !validateSetup(ids.length, cfg) || typeof rand !== 'function' || !validTime(now)) throw new RangeError('Invalid game setup');
  if (ids.some((id) => typeof id !== 'string' || id.trim() === '' || id === ROLE.CIVILIAN || id === HIDDEN_TEAM) || new Set(ids).size !== ids.length) throw new RangeError('Invalid player ids');
  const config = normalizeConfig(cfg);
  const pack = PACKS.find((item) => item.id === config.pack);
  const pair = pack.pairs[randomIndex(pack.pairs.length, rand)];
  const civilianIndex = randomIndex(PAIR_WORDS, rand);
  const civilianWord = pair[civilianIndex];
  const spyWord = pair[1 - civilianIndex];
  const roles = ids.map((_, index) => index < config.spies ? ROLE.SPY : index < config.spies + config.whites ? ROLE.WHITE : ROLE.CIVILIAN);
  for (let index = roles.length - 1; index > 0; index--) {
    const other = randomIndex(index + 1, rand);
    [roles[index], roles[other]] = [roles[other], roles[index]];
  }
  const g = {
    cfg: config, phase: PHASE.DEAL, deadline: 0, round: 1,
    players: ids.map((id, index) => ({ id, role: roles[index], word: roles[index] === ROLE.WHITE ? null : roles[index] === ROLE.SPY ? spyWord : civilianWord, alive: true })),
    speaker: null, candidates: [], votes: {}, pendingGuess: null, winner: null, lastEliminated: null,
    civilianWord, spyWord, tally: null, startIndex: -1, turnOrder: [], turnIndex: 0,
  };
  return g;
}

function beginRound(g, now) {
  do { g.startIndex = (g.startIndex + 1) % g.players.length; } while (!g.players[g.startIndex].alive);
  g.turnOrder = [];
  for (let offset = 0; offset < g.players.length; offset++) {
    const player = g.players[(g.startIndex + offset) % g.players.length];
    if (player.alive) g.turnOrder.push(player.id);
  }
  g.turnIndex = 0;
  g.speaker = g.turnOrder[g.turnIndex];
  g.phase = PHASE.DESCRIBE;
  g.deadline = now + g.cfg.seconds * MS_PER_SECOND;
  g.candidates = [];
  g.votes = {};
}

function nextSpeaker(g, now) {
  g.turnIndex++;
  g.speaker = g.turnOrder[g.turnIndex] ?? null;
  g.phase = g.speaker === null ? PHASE.DISCUSS : PHASE.DESCRIBE;
  g.deadline = g.speaker === null ? 0 : now + g.cfg.seconds * MS_PER_SECOND;
}

function startCountdown(g, now) {
  if (g.phase === PHASE.DISCUSS) g.candidates = alivePlayers(g).map((player) => player.id);
  g.phase = PHASE.COUNTDOWN;
  g.speaker = null;
  g.votes = {};
  g.deadline = now + COUNTDOWN_MS;
}

function finish(g, winner) {
  g.winner = winner;
  g.phase = PHASE.ENDED;
  g.deadline = 0;
  g.speaker = null;
  g.pendingGuess = null;
  g.candidates = [];
}

function afterElimination(g, now) {
  const alive = alivePlayers(g);
  const civilianCount = alive.filter((player) => player.role === ROLE.CIVILIAN).length;
  if (civilianCount === alive.length) finish(g, ROLE.CIVILIAN);
  else if (civilianCount < MIN_CIVILIANS) finish(g, HIDDEN_TEAM);
  else {
    g.round++;
    beginRound(g, now);
  }
}

function eliminate(g, player, now) {
  player.alive = false;
  g.lastEliminated = player.id;
  g.speaker = null;
  g.deadline = 0;
  g.candidates = [];
  if (player.role === ROLE.WHITE) {
    g.phase = PHASE.GUESS;
    g.pendingGuess = player.id;
  } else afterElimination(g, now);
}

function resolveVotes(g, now) {
  const tally = Object.fromEntries(g.candidates.map((id) => [id, 0]));
  for (const target of Object.values(g.votes)) tally[target]++;
  g.tally = tally;
  const highest = Math.max(...Object.values(tally));
  const tied = g.candidates.filter((id) => tally[id] === highest);
  if (tied.length === 1) eliminate(g, g.players.find((player) => player.id === tied[0]), now);
  else {
    g.phase = PHASE.TIE;
    g.candidates = tied;
    g.speaker = null;
    g.deadline = 0;
  }
}

export function act(g, actorId, hostId, message, now) {
  if (!g?.players || g.phase === PHASE.ENDED || !validTime(now) || !validObject(message) || !Object.hasOwn(message, 'a')) return false;
  const actor = g.players.find((player) => player.id === actorId);
  if (!actor) return false;
  const isHost = actor.id === hostId;
  switch (message.a) {
    case ACTION.NEXT:
      if (!isHost || (g.phase !== PHASE.DEAL && g.phase !== PHASE.DESCRIBE && g.phase !== PHASE.TIE)) return false;
      if (g.phase === PHASE.DEAL) beginRound(g, now);
      else if (g.phase === PHASE.DESCRIBE) nextSpeaker(g, now);
      else startCountdown(g, now);
      return true;
    case ACTION.VOTING:
      if (!isHost || g.phase !== PHASE.DISCUSS) return false;
      startCountdown(g, now);
      return true;
    case ACTION.VOTE: {
      if (!actor.alive || g.phase !== PHASE.VOTE || Object.hasOwn(g.votes, actor.id)) return false;
      const target = g.players.find((player) => player.id === message.target);
      if (!target?.alive || target.id === actor.id || !g.candidates.includes(target.id)) return false;
      Object.defineProperty(g.votes, actor.id, { value: target.id, enumerable: true, configurable: true, writable: true });
      if (Object.keys(g.votes).length === alivePlayers(g).length) resolveVotes(g, now);
      return true;
    }
    case ACTION.ELIMINATE: {
      if (!isHost || !MANUAL_PHASES.has(g.phase)) return false;
      const target = g.players.find((player) => player.id === message.target);
      if (!target?.alive) return false;
      g.tally = null;
      g.votes = {};
      eliminate(g, target, now);
      return true;
    }
    case ACTION.GUESS: {
      if (g.phase !== PHASE.GUESS || actor.id !== g.pendingGuess || typeof message.text !== 'string' || message.text.length > MAX_GUESS_LENGTH) return false;
      const guess = normalizedWord(message.text);
      if (!guess) return false;
      g.pendingGuess = null;
      if (guess === normalizedWord(g.civilianWord)) finish(g, actor.id);
      else afterElimination(g, now);
      return true;
    }
    default:
      return false;
  }
}

export function advance(g, now) {
  if (!g?.players || !validTime(now) || !g.deadline || now < g.deadline) return false;
  if (g.phase === PHASE.DESCRIBE) {
    nextSpeaker(g, now);
    return true;
  }
  if (g.phase === PHASE.COUNTDOWN) {
    g.phase = PHASE.VOTE;
    g.deadline = 0;
    return true;
  }
  return false;
}

export function view(g, id) {
  const players = g?.players ?? [];
  const mine = players.find((player) => player.id === id);
  const ended = g?.phase === PHASE.ENDED && g.winner != null;
  const voting = g?.phase === PHASE.VOTE || g?.phase === PHASE.COUNTDOWN;
  return {
    phase: g?.phase ?? PHASE.ENDED, deadline: g?.deadline ?? 0, round: g?.round ?? 0,
    cfg: { ...(g?.cfg ?? DEFAULT_CONFIG) }, speaker: g?.speaker ?? null, candidates: [...(g?.candidates ?? [])],
    pendingGuess: g?.pendingGuess ?? null, lastEliminated: g?.lastEliminated ?? null, winner: g?.winner ?? null,
    players: players.map((player) => ({ id: player.id, alive: player.alive, ...(ended ? { role: player.role } : {}) })),
    card: !mine ? null : mine.role === ROLE.WHITE ? { white: true } : { word: mine.word },
    voted: !!mine && Object.hasOwn(g.votes, mine.id), voteCount: Object.keys(g?.votes ?? {}).length,
    voteTotal: players.filter((player) => player.alive).length,
    tally: !voting && g?.tally ? { ...g.tally } : null,
    reveal: ended ? { civilianWord: g.civilianWord, spyWord: g.spyWord, roles: Object.fromEntries(players.map((player) => [player.id, player.role])) } : null,
  };
}

export function resultTitle(winner) {
  if (winner === ROLE.CIVILIAN) return ['Dân thường thắng', 'Civilians win'];
  if (winner === HIDDEN_TEAM) return ['Phe ẩn thắng', 'Hidden team wins'];
  return winner == null ? null : ['Mũ Trắng thắng', 'Mr. White wins'];
}

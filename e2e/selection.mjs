const GAME_ROOTS = ['public', 'frontend/src', 'shared/games'];
const APPLICATION_PREFIX = 'backend/src/application/games';
const JS_SUFFIX = '.js';
const TEST_SUFFIX = '.test.mjs';
const NOKIA_PREFIX = 'nokia/';
const SOLO_GAMES = new Set(['2048', 'tetris', 'sudoku']);
const NOKIA_GAMES = new Set(['bantumi', 'bounce', 'logic', 'pairs', 'rapid-roll', 'snake', 'space-impact']);
const DOCUMENTATION_PATH = /^(?:README\.md|docs\/.*\.md)$/;
const GAME_SMOKES = {
  pikachu: ['pikachu'],
  'dao-vang': ['dao-vang'],
  'bau-cua': ['bau-cua'],
  'co-caro': ['caro'],
  'noi-4': ['c4'],
  'ban-tau': ['ban-tau'],
  'do-min': ['do-min'],
  'o-an-quan': ['o-an-quan', 'o-an-quan-3'],
  'co-ganh': ['co-ganh'],
  'co-tuong': ['co-tuong'],
  soi: ['soi'],
  'gian-diep': ['gian-diep'],
  loto: ['loto'],
  bantumi: ['bantumi'],
  bounce: ['bounce'],
  logic: ['logic'],
  pairs: ['pairs'],
  'rapid-roll': ['rapid-roll'],
  snake: ['snake'],
  'space-impact': ['space-impact'],
};
const KNOWN_GAMES = new Set([...Object.keys(GAME_SMOKES), ...SOLO_GAMES]);
const GAME_PATHS = [...KNOWN_GAMES].map((game) => ({
  game,
  directories: GAME_ROOTS.map((root) => `${root}/${NOKIA_GAMES.has(game) ? NOKIA_PREFIX : ''}${game}/`),
  application: `${APPLICATION_PREFIX}/${game}${JS_SUFFIX}`,
  test: `${NOKIA_GAMES.has(game) ? 'nokia-' : ''}${game}${TEST_SUFFIX}`,
}));

export function selectGames(paths) {
  if (!paths.length) return null;
  const games = new Set();
  for (const path of paths) {
    if (DOCUMENTATION_PATH.test(path)) continue;
    const match = GAME_PATHS.find(({ directories, application, test }) => directories.some((directory) => path.startsWith(directory)) || path === application || path === test);
    if (!match) return null;
    games.add(match.game);
  }
  if (!games.size) return null;
  return {
    routes: [...games].map((game) => `/${NOKIA_GAMES.has(game) ? NOKIA_PREFIX : ''}${game}/`),
    games: [...games].flatMap((game) => GAME_SMOKES[game] ?? []),
  };
}

export const PR_EVENT = 'pull_request';
const FAST_MODE = 'fast';
const FULL_MODE = 'full';

export function smokeModeForEvent(eventName, requestedMode = FULL_MODE) {
  if (eventName) return eventName === PR_EVENT ? FAST_MODE : FULL_MODE;
  if (requestedMode !== FAST_MODE && requestedMode !== FULL_MODE) throw new Error('Invalid E2E_SMOKE_MODE');
  return requestedMode;
}

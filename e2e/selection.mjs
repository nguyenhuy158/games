const PUBLIC_PREFIX = 'public';
const WORKER_PREFIX = 'worker/games';
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
  directory: `${PUBLIC_PREFIX}/${NOKIA_GAMES.has(game) ? NOKIA_PREFIX : ''}${game}/`,
  worker: `${WORKER_PREFIX}/${game}${JS_SUFFIX}`,
  test: `${NOKIA_GAMES.has(game) ? 'nokia-' : ''}${game}${TEST_SUFFIX}`,
}));

export function selectGames(paths) {
  if (!paths.length) return null;
  const games = new Set();
  for (const path of paths) {
    if (DOCUMENTATION_PATH.test(path)) continue;
    const match = GAME_PATHS.find(({ directory, worker, test }) => path.startsWith(directory) || path === worker || path === test);
    if (!match) return null;
    games.add(match.game);
  }
  if (!games.size) return null;
  return {
    routes: [...games].map((game) => `/${NOKIA_GAMES.has(game) ? NOKIA_PREFIX : ''}${game}/`),
    games: [...games].flatMap((game) => GAME_SMOKES[game] ?? []),
  };
}

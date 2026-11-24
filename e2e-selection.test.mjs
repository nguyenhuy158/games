import assert from 'node:assert/strict';
import { selectGames } from './e2e/selection.mjs';

assert.deepEqual(selectGames(['public/gian-diep/style.css', 'worker/games/gian-diep.js']), {
  routes: ['/gian-diep/'], games: ['gian-diep'],
});
assert.deepEqual(selectGames(['public/o-an-quan/logic.js', 'public/nokia/pairs/game.js']), {
  routes: ['/o-an-quan/', '/nokia/pairs/'], games: ['o-an-quan', 'o-an-quan-3', 'pairs'],
});
assert.deepEqual(selectGames(['public/sudoku/game.js']), { routes: ['/sudoku/'], games: [] });
for (const path of ['public/dom.js', 'public/nokia/room.js', 'worker/games/race.js', 'worker/index.js', 'public/new-game/game.js', 'public/soi-extra/game.js', '.github/workflows/ci.yml', 'package.json']) {
  assert.equal(selectGames(['public/soi/game.js', path]), null, path);
}
assert.equal(selectGames([]), null);
assert.deepEqual(selectGames(['public/soi/old.js', 'public/loto/new.js']), {
  routes: ['/soi/', '/loto/'], games: ['soi', 'loto'],
});
console.log('e2e selection ok');
assert.deepEqual(selectGames(['README.md', 'docs/gian-diep.md', 'public/gian-diep/game.js']), {
  routes: ['/gian-diep/'], games: ['gian-diep'],
});
assert.equal(selectGames(['README.md']), null);

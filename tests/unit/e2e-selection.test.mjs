import assert from 'node:assert/strict';
import { selectGames, smokeModeForEvent } from '../e2e/selection.mjs';

assert.deepEqual(selectGames(['frontend/src/gian-diep/style.css', 'backend/src/application/games/gian-diep.js']), {
  routes: ['/gian-diep/'], games: ['gian-diep'],
});
assert.deepEqual(selectGames(['shared/games/o-an-quan/logic.js', 'frontend/src/nokia/pairs/game.js']), {
  routes: ['/o-an-quan/', '/nokia/pairs/'], games: ['o-an-quan', 'o-an-quan-3', 'pairs'],
});
assert.deepEqual(selectGames(['tests/unit/gian-diep.test.mjs', 'tests/unit/nokia-pairs.test.mjs']), {
  routes: ['/gian-diep/', '/nokia/pairs/'], games: ['gian-diep', 'pairs'],
});
assert.deepEqual(selectGames(['frontend/src/sudoku/game.js']), { routes: ['/sudoku/'], games: [] });
for (const path of ['frontend/src/dom.js', 'frontend/src/nokia/room.js', 'shared/tape.js', 'shared/games/common.js', 'backend/src/application/games/race.js', 'backend/src/application/spy-ai.js', 'backend/src/index.js', 'frontend/src/new-game/game.js', 'frontend/src/soi-extra/game.js', 'public/logos/hub.svg', '.github/workflows/ci.yml', 'package.json']) {
  assert.equal(selectGames(['frontend/src/soi/game.js', path]), null, path);
}
assert.equal(selectGames([]), null);
assert.deepEqual(selectGames(['frontend/src/soi/old.js', 'frontend/src/loto/new.js']), {
  routes: ['/soi/', '/loto/'], games: ['soi', 'loto'],
});
assert.deepEqual(selectGames(['README.md', 'docs/gian-diep.md', 'frontend/src/gian-diep/game.js']), {
  routes: ['/gian-diep/'], games: ['gian-diep'],
});
assert.deepEqual(selectGames(['public/pikachu/images/tiles.webp', 'public/dao-vang/assets/atlas.json', 'shared/games/nokia/bounce/logic.js', 'backend/src/application/games/bounce.js']), {
  routes: ['/pikachu/', '/dao-vang/', '/nokia/bounce/'], games: ['pikachu', 'dao-vang', 'bounce'],
});
assert.equal(selectGames(['README.md']), null);
assert.equal(smokeModeForEvent('pull_request'), 'fast');
assert.equal(smokeModeForEvent('push', 'fast'), 'full');
assert.equal(smokeModeForEvent('workflow_dispatch', 'fast'), 'full');
assert.equal(smokeModeForEvent(undefined, 'fast'), 'fast');
assert.throws(() => smokeModeForEvent(undefined, 'fas'), /Invalid E2E_SMOKE_MODE/);
console.log('e2e selection and coverage policy ok');

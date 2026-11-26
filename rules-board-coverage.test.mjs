import assert from 'node:assert/strict';
import * as pikachu from './shared/games/pikachu/logic.js';
import * as caro from './shared/games/co-caro/logic.js';
import * as connect from './shared/games/noi-4/logic.js';
import * as naval from './shared/games/ban-tau/logic.js';
import * as ganh from './shared/games/co-ganh/logic.js';
import * as chess from './shared/games/co-tuong/logic.js';
import * as quan from './shared/games/o-an-quan/logic.js';
import * as tiles from './shared/games/2048/logic.js';
import * as tetris from './shared/games/tetris/logic.js';
import * as sudoku from './shared/games/sudoku/logic.js';

{
  const blocked = [
    [0, 0, 0, 0, 0, 0],
    [0, 1, 2, 3, 4, 0],
    [0, 2, 3, 4, 1, 0],
    [0, 3, 4, 1, 2, 0],
    [0, 4, 1, 2, 3, 0],
    [0, 0, 0, 0, 0, 0],
  ];
  assert.equal(pikachu.findPair(blocked), null);
  const target = blocked.slice(1, -1).flatMap((row) => row.slice(1, -1));
  const shuffled = Array.from({ length: 16 }, (_, i) => Math.floor(i / 4) + 1);
  const draws = Array(pikachu.TYPES - 1).fill(0.999);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = shuffled.indexOf(target[i]);
    assert.ok(j >= 0 && j <= i);
    draws.push((j + 0.5) / (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  assert.deepEqual(shuffled, target);
  let calls = 0;
  const board = pikachu.newBoard([4, 4], () => draws[calls++] ?? 0);
  assert.ok(calls > draws.length, 'a deadlocked initial shuffle must be reshuffled');
  assert.ok(pikachu.findPair(board), 'reshuffling restores a playable pair');
  assert.equal(pikachu.countLeft(board), 16);
  for (const type of [1, 2, 3, 4]) assert.equal(board.flat().filter((v) => v === type).length, 4);
  assert.ok(board[0].every((v) => v === 0) && board.at(-1).every((v) => v === 0));
  assert.ok(board.every((row) => row[0] === 0 && row.at(-1) === 0));
  const blockedSnapshot = structuredClone(blocked);
  let unsuccessfulDraws = 0;
  assert.equal(pikachu.reshuffle(blocked, () => { unsuccessfulDraws++; return 0.999; }), blocked);
  assert.equal(unsuccessfulDraws, 1500, 'unsuccessful shuffles stop after the bounded attempt count');
  assert.deepEqual(blocked, blockedSnapshot);
  assert.equal(pikachu.findPair(blocked), null);
  pikachu.reshuffle(blocked, () => 0);
  assert.ok(pikachu.findPair(blocked));
}

{
  const board = Array(15 * 15).fill(0);
  assert.equal(caro.winLine(board, 15, 0), null);
  for (const i of [0, 1, 2, 3, 4]) board[i] = 1;
  board[5] = 2;
  assert.deepEqual(caro.winLine(board, 15, 0, true), [0, 1, 2, 3, 4], 'the edge is not an opponent blocking the line');
  assert.equal(caro.winLine(board, 15, 15, true), null, 'an empty cell does not inherit a nearby win');
}

{
  const board = Array(connect.ROWS * connect.COLS).fill(0);
  assert.equal(connect.winLine(board, 0), null);
  for (let r = 0; r < connect.ROWS; r++) board[r * connect.COLS + 3] = r % 2 + 1;
  const snapshot = [...board];
  assert.equal(connect.drop(board, 3), -1);
  const fallback = connect.botMove(board, 1, () => 0, -1);
  assert.equal(fallback, connect.botMove(board, 1, () => 0, 1), 'unknown difficulty uses the normal search');
  assert.notEqual(fallback, 3, 'the bot skips a full column');
  assert.ok(connect.drop(board, fallback) >= 0);
  assert.deepEqual(board, snapshot, 'search does not mutate the board');
  const restored = Array(connect.ROWS * connect.COLS).fill(0);
  restored.splice(35, 4, 1, 1, 1, 1);
  const restoredSnapshot = [...restored];
  for (const player of [1, 2]) {
    const choice = connect.botMove(restored, player, () => 0.9, 0);
    assert.ok(Number.isInteger(choice) && choice >= 0 && choice < connect.COLS);
    assert.ok(connect.drop(restored, choice) >= 0, 'a restored winning board still yields an unoccupied target');
  }
  assert.deepEqual(restored, restoredSnapshot);
}

{
  const failedAttemptDraws = 603;
  const placements = [0, 2, 4, 6, 8].flatMap((row) => [0.9, (row + 0.5) / naval.N, 0]);
  let calls = 0;
  const fleet = naval.randomFleet(() => {
    const index = calls++;
    if (index < failedAttemptDraws) return 0;
    const value = placements[index - failedAttemptDraws];
    assert.notEqual(value, undefined, 'the restarted fleet fits the supplied placements');
    return value;
  });
  assert.equal(calls, failedAttemptDraws + placements.length);
  assert.equal(naval.validFleet(fleet), true);
  assert.deepEqual(fleet, [[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]]);

  const shots = Array(naval.N * naval.N).fill(0);
  naval.shoot([[22, 32, 42]], shots, 22);
  naval.shoot([[22, 32, 42]], shots, 32);
  const snapshot = [...shots];
  assert.equal(naval.botShot(shots, () => 0), 12);
  assert.equal(naval.botShot(shots, () => 0.999), 42);
  assert.deepEqual(shots, snapshot, 'choosing a target does not record a shot');
  naval.shoot([[22, 32, 42]], shots, 12);
  assert.equal(naval.botShot(shots, () => 0), 42, 'blocked vertical end leaves only the other end');
  assert.deepEqual(naval.shoot([[22, 32, 42]], shots, 42), { hit: true, sunk: 0, done: true });

  const edge = Array(naval.N * naval.N).fill(0);
  edge[0] = naval.HIT;
  edge[10] = naval.HIT;
  assert.equal(naval.botShot(edge, () => 0), 20, 'a vertical hunt cannot extend above the sea');
  const bottomEdge = Array(naval.N * naval.N).fill(0);
  naval.shoot([[70, 80, 90]], bottomEdge, 80);
  naval.shoot([[70, 80, 90]], bottomEdge, 90);
  assert.equal(naval.botShot(bottomEdge, () => 0.999), 70, 'a vertical hunt cannot extend below the sea');
  const restored = Array(naval.N * naval.N).fill(naval.MISS);
  restored[44] = naval.HIT;
  restored[65] = naval.HIT;
  restored[56] = 0;
  const restoredSnapshot = [...restored];
  assert.equal(naval.botShot(restored, () => 0), 56, 'stale unresolved hits cannot trap targeting or repeat a previous shot');
  assert.deepEqual(restored, restoredSnapshot);
}

{
  const game = ganh.newGame();
  const snapshot = structuredClone(game);
  const selected = ganh.botMove(game, undefined, () => 0);
  assert.equal(ganh.legal(game, game.turn, ...selected), true);
  assert.deepEqual(game, snapshot, 'three-ply maximizing/minimizing search preserves the original game');
  for (const winner of [0, 1, 2]) {
    const limited = ganh.newGame();
    if (winner === 1) limited.b[0] = limited.b[1] = 1;
    if (winner === 2) limited.b[20] = limited.b[21] = 2;
    limited.moves = ganh.MAX_MOVES - 1;
    assert.equal(ganh.legal(limited, 1, 14, 13), true);
    const choice = ganh.botMove(limited, 1, () => 0);
    assert.equal(ganh.legal(limited, limited.turn, ...choice), true, 'the bot evaluates move-limit draws and wins');
    const counts = [ganh.count(limited, 1), ganh.count(limited, 2)];
    assert.deepEqual(ganh.move(limited, 14, 13), { ganh: [], vay: [] });
    assert.equal(limited.over, true);
    assert.equal(limited.winner, winner);
    assert.deepEqual([ganh.count(limited, 1), ganh.count(limited, 2)], counts);
    assert.equal(ganh.legal(limited, 2, 10, 11), false, 'no moves are accepted after the move limit');
  }
  for (const offset of [0, 1, 7, 19]) {
    const playing = ganh.newGame();
    while (!playing.over) {
      const available = ganh.moves(playing);
      assert.ok(available.length > 0, 'every non-ended legal position has a next move');
      if (playing.open >= 0) assert.ok(available.every(([, to]) => to === playing.open));
      const choice = available[(playing.moves + offset) % available.length];
      assert.equal(ganh.legal(playing, playing.turn, ...choice), true);
      ganh.move(playing, ...choice);
      assert.equal(ganh.count(playing, 1) + ganh.count(playing, 2), 16);
      if (!playing.over) assert.ok(ganh.moves(playing).length > 0, 'surviving opponent groups retain a liberty after vây');
      assert.ok(playing.moves <= ganh.MAX_MOVES);
    }
    assert.ok([0, 1, 2].includes(playing.winner));
  }
}

{
  const game = chess.newGame();
  const copy = chess.clone(game);
  assert.deepEqual(copy, game);
  copy.b[0] = 0;
  assert.equal(game.b[0], -chess.R);
  const malformed = chess.clone(game);
  malformed.b[54] = 99;
  const malformedSnapshot = structuredClone(malformed);
  assert.ok(chess.moves(malformed).every(([from]) => from !== 54), 'unknown restored piece types have no legal moves');
  assert.equal(chess.legal(malformed, 1, 54, 45), false);
  assert.deepEqual(malformed, malformedSnapshot);
  game.moves = chess.MAX_MOVES - 1;
  const selected = chess.moves(game)[0];
  assert.equal(chess.legal(game, game.turn, ...selected), true);
  chess.move(game, ...selected);
  assert.equal(game.over, true);
  assert.equal(game.winner, 0, 'a non-terminal move at the move limit draws');

  const mate = { b: Array(chess.ROWS * chess.COLS).fill(0), turn: 1, over: false, winner: 0, moves: 0 };
  const at = (r, c) => r * chess.COLS + c;
  mate.b[at(9, 3)] = chess.K;
  mate.b[at(0, 4)] = -chess.K;
  mate.b[at(1, 0)] = chess.R;
  mate.b[at(5, 8)] = chess.R;
  chess.move(mate, at(5, 8), at(0, 8));
  assert.equal(mate.winner, 1);
  assert.deepEqual(chess.moves(mate), []);
  assert.equal(chess.botMove(mate), null, 'a checkmated player has no bot move');

  const timed = chess.newGame();
  const snapshot = structuredClone(timed);
  const clock = Date.now;
  const completedDepthClockReads = chess.moves(timed).length + 2;
  let reads = 0;
  try {
    Date.now = () => 0;
    const completed = chess.botMove(timed, 2, 100, () => 0);
    Date.now = () => ++reads > completedDepthClockReads ? 101 : 0;
    const chosen = chess.botMove(timed, 4, 100, () => 0);
    assert.ok(reads > completedDepthClockReads, 'the clock expires inside the deeper search');
    assert.equal(chess.legal(timed, timed.turn, ...chosen), true, 'timeout keeps a legal move from the completed depth');
    assert.deepEqual(chosen, completed, 'an interrupted deeper iteration retains the completed search result');
    assert.deepEqual(timed, snapshot, 'timeout unwinds temporary moves without mutating the game');
    const tactical = { b: Array(chess.ROWS * chess.COLS).fill(0), turn: 1, over: false, winner: 0, moves: 0 };
    tactical.b[at(9, 5)] = chess.K;
    tactical.b[at(0, 3)] = -chess.K;
    tactical.b[at(7, 0)] = chess.R;
    tactical.b[at(2, 0)] = -chess.H;
    const tacticalSnapshot = structuredClone(tactical);
    Date.now = () => 0;
    assert.deepEqual(chess.botMove(tactical, 3, 100, () => 0), [at(7, 0), at(2, 0)], 'iterative deepening preserves the winning capture');
    let tacticalReads = 0;
    Date.now = () => ++tacticalReads > 1 ? 101 : 0;
    assert.deepEqual(chess.botMove(tactical, 3, 100, () => 0), [at(7, 0), at(2, 0)], 'expiration retains the completed tactical capture');
    assert.deepEqual(tactical, tacticalSnapshot);
  } finally {
    Date.now = clock;
  }
}

{
  assert.equal(quan.owner(0), 0);
  assert.equal(quan.owner(6), 0);
  assert.equal(quan.owner(11), 2);
  const legacy = quan.newGame();
  delete legacy.loans;
  const copy = quan.clone(legacy);
  assert.deepEqual(copy.loans, []);
  copy.cap[1].small = 9;
  copy.b[1] = 0;
  copy.big[0] = 0;
  copy.debt[1] = 4;
  assert.equal(legacy.cap[1].small, 0);
  assert.equal(legacy.b[1], quan.DAN);
  assert.equal(legacy.big[0], 1);
  assert.equal(legacy.debt[1], 0);
  const legacySnapshot = structuredClone(legacy);
  const choice = quan.botMove(legacy, undefined, () => 0);
  assert.equal(quan.legal(legacy, legacy.turn, ...choice), true);
  assert.deepEqual(legacy, legacySnapshot, 'default-depth search preserves legacy game state');
  legacy.moves = 399;
  const [pit, direction] = quan.moves(legacy)[0];
  quan.move(legacy, pit, direction);
  assert.equal(legacy.over, true, 'legacy games without a loans array can finish');
  assert.deepEqual(legacy.loans, []);
  assert.ok(legacy.debt.every((debt) => debt === 0));
  assert.equal(quan.score(legacy, 1) + quan.score(legacy, 2) + legacy.b.reduce((sum, n) => sum + n, 0) + legacy.big.reduce((sum, n) => sum + n, 0) * quan.QUAN, 70);
  const tied = quan.newGame({ n: 3 });
  tied.cap[1].small = 12;
  tied.cap[2].small = 12;
  tied.cap[3].small = 11;
  assert.equal(quan.winner(tied), 0, 'a tie for the highest score is a draw');
  tied.cap[3].small = 13;
  assert.equal(quan.winner(tied), 3);
}

{
  const grid = [2, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4, 8, 16, 32];
  assert.equal(tiles.emptyCells(grid).length, 0);
  assert.equal(tiles.isOver(grid), false, 'a full board with a horizontal merge remains playable');
  const result = tiles.slide(grid, 'left');
  assert.equal(result.gain, 4);
  assert.deepEqual(result.grid.slice(0, tiles.SIZE), [4, 4, 8, 0]);
  assert.equal(result.moved, true);
  assert.deepEqual(grid.slice(0, tiles.SIZE), [2, 2, 4, 8]);
}

{
  const game = tetris.newGame();
  const snapshot = structuredClone(game);
  assert.equal(tetris.rotate(game), false);
  assert.equal(tetris.hardDrop(game), undefined);
  assert.deepEqual(game, snapshot, 'controls before spawning do not change the game');
  tetris.spawn(game, () => 0);
  tetris.hardDrop(game);
  assert.equal(game.piece.y, tetris.H - 1);
  assert.equal(game.board.flat().filter(Boolean).length, 0, 'hard drop alone does not lock a piece');
  assert.equal(tetris.tick(game, () => 0), 0);
  assert.equal(game.board.at(-1).filter(Boolean).length, 4);
  const shaped = tetris.newGame();
  tetris.spawn(shaped, () => 0.75);
  assert.equal(shaped.piece.type, 'T');
  tetris.hardDrop(shaped);
  assert.equal(tetris.tick(shaped, () => 0), 0);
  assert.equal(shaped.board.flat().filter(Boolean).length, 4, 'empty cells in the shape are not locked');
}

{
  const board = Array.from({ length: sudoku.N }, () => Array.from({ length: sudoku.N }, () => ({ value: null, given: false, error: false, notes: [] })));
  board[0][0].value = 5;
  board[8][0].value = 5;
  board[7][2].value = 5;
  board[4][4].value = 5;
  board[8][0].given = true;
  board[7][2].notes = [1, 9];
  assert.equal(sudoku.markConflicts(board), board);
  assert.equal(board[0][0].error, true, 'column conflicts mark both endpoints');
  assert.equal(board[8][0].error, true);
  assert.equal(board[7][2].error, true, 'box conflicts also mark the diagonal peer');
  assert.equal(board[4][4].error, false, 'an equal digit outside the row, column, and box is allowed');
  board[8][0].value = null;
  sudoku.markConflicts(board);
  assert.ok(board.flat().every((cell) => !cell.error), 'removing a shared conflicting peer clears both conflict groups');
  assert.equal(board[8][0].given, true);
  assert.deepEqual(board[7][2].notes, [1, 9]);
  assert.equal(sudoku.isFull(board), false);
  assert.equal(sudoku.isSolved(board), false);
}

console.log('rules-board-coverage ok');

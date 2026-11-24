import { MIN_PLAYERS, MAX_PLAYERS, DEFAULT_CONFIG, PHASE, ROLE, normalizeConfig, validateSetup, createGame, act, advance, view, resultTitle } from '../../public/gian-diep/logic.js';

const GAME_SLUG = 'gian-diep';
const GAME_PAGE = '/gian-diep/';
const HIDDEN_TEAM = 'hidden';
const MULTIPLAYER = 'multi';
const WIN_SCORE = 1;
const LOSS_SCORE = 0;
const INVALID_SETUP = [`Cần ${MIN_PLAYERS}–${MAX_PLAYERS} người và số vai hợp lệ; phải còn ít nhất 2 dân thường`, `Need ${MIN_PLAYERS}–${MAX_PLAYERS} players and valid role counts, with at least 2 civilians`];

function publish(ctx) {
  const g = ctx.g;
  ctx.wakeAt(g.deadline);
  if (g.phase !== PHASE.ENDED || g.reported || g.winner === null) return;
  g.reported = true;
  const ranks = g.players.map((player) => {
    const won = g.winner === ROLE.CIVILIAN ? player.role === ROLE.CIVILIAN : g.winner === HIDDEN_TEAM ? player.role !== ROLE.CIVILIAN : player.id === g.winner;
    return { id: player.id, score: won ? WIN_SCORE : LOSS_SCORE, won };
  }).sort((left, right) => Number(right.won) - Number(left.won));
  ctx.end({ mode: MULTIPLAYER, title: resultTitle(g.winner), ranks });
}

export default {
  slug: GAME_SLUG,
  page: GAME_PAGE,
  max: MAX_PLAYERS,
  maxOnline: MAX_PLAYERS,
  cfg: { ...DEFAULT_CONFIG },
  persist: true,
  replay: false,
  config(cfg, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
    return normalizeConfig({ ...cfg, ...patch });
  },
  start(ctx) {
    const dealId = (ctx.keep.dealId ?? 0) + 1;
    ctx.keep.dealId = dealId;
    Object.assign(ctx.g, {
      cfg: normalizeConfig(ctx.cfg) ?? { ...DEFAULT_CONFIG }, phase: PHASE.ENDED, deadline: 0, round: 0,
      players: [], speaker: null, candidates: [], votes: {}, pendingGuess: null, winner: null,
      lastEliminated: null, tally: null, dealId, reported: false,
    });
    if (!validateSetup(ctx.seats.length, ctx.cfg)) {
      ctx.wakeAt(0);
      ctx.end({ title: INVALID_SETUP, ranks: [] });
      return;
    }
    try {
      Object.assign(ctx.g, createGame(ctx.seats, ctx.cfg, ctx.rand, ctx.now()));
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      ctx.wakeAt(0);
      ctx.end({ title: INVALID_SETUP, ranks: [] });
      return;
    }
    publish(ctx);
  },
  msg(ctx, player, message) {
    if (!act(ctx.g, player?.id, ctx.host(), message, ctx.now())) return false;
    publish(ctx);
    return true;
  },
  tick(ctx) {
    if (!advance(ctx.g, ctx.now())) return false;
    publish(ctx);
    return true;
  },
  view(ctx, id) {
    return { ...view(ctx.g, id), dealId: ctx.g?.dealId ?? 0 };
  },
};

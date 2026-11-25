import { AI_PACK } from '../../../../shared/games/gian-diep/logic.js';

export function resolveAiPair(ctx) {
  if (ctx.cfg.pack !== AI_PACK) return undefined;
  const pack = ctx.keep.aiPack;
  if (!pack || pack.packId !== ctx.cfg.aiPackId || pack.expires <= ctx.now() || !pack.pairs?.length) throw new RangeError('AI pack is unavailable');
  return [...pack.pairs[Math.floor(ctx.rand() * pack.pairs.length)]];
}

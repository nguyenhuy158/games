import { AI_PACK } from '../../../../shared/games/gian-diep/logic.js';

export function aiPackProgress(pack) {
  return { used: pack.usedPairIndices?.length ?? 0, count: pack.pairs.length };
}

export function drawAiPair(pack, random) {
  const used = pack.usedPairIndices ?? [];
  const indices = pack.pairs.map((_, index) => index);
  const remaining = indices.filter((index) => !used.includes(index));
  const startsCycle = remaining.length === 0;
  const choices = startsCycle ? indices : remaining;
  if (startsCycle && choices.length > 1) choices.splice(used.at(-1), 1);
  const index = choices[Math.floor(random() * choices.length)];
  pack.usedPairIndices = startsCycle ? [index] : [...used, index];
  return [...pack.pairs[index]];
}

export function resolveAiPair(ctx) {
  if (ctx.cfg.pack !== AI_PACK) return undefined;
  const pack = ctx.keep.aiPack;
  if (!pack || pack.packId !== ctx.cfg.aiPackId || pack.expires <= ctx.now() || !pack.pairs?.length) throw new RangeError('AI pack is unavailable');
  return drawAiPair(pack, ctx.rand);
}

import { aiPackProgress } from '../application/games/gian-diep-ai.js';
import { AI_PACK } from '../../../shared/games/gian-diep/logic.js';
import { AI_ERROR, AI_GAME, AI_INSTANCE, aiFailure } from '../application/spy-ai.js';

const ROOM_READY = new Set(['lobby', 'ended']);

export async function generateRoomAi(room, topic, deviceId, guestId, packId) {
  const s = room.s;
  const authorized = () => room.s === s && s?.game === AI_GAME && ROOM_READY.has(s.status) && room.hostId() === deviceId && s.players[deviceId]?.guest === guestId;
  if (!guestId || !authorized()) return aiFailure(AI_ERROR.FORBIDDEN);
  const previous = s.keep?.aiPack;
  if (packId && (s.cfg.pack !== AI_PACK || s.cfg.aiPackId !== packId || previous?.packId !== packId)) return aiFailure(AI_ERROR.EXPIRED);
  const runId = s.runId, dealId = s.keep?.dealId, cfg = s.cfg;
  const requestId = crypto.randomUUID();
  room.aiRequest = requestId;
  const service = room.env.SPY_AI?.get(room.env.SPY_AI.idFromName(AI_INSTANCE));
  if (!service) return aiFailure(AI_ERROR.UNAVAILABLE);
  let pack;
  try { pack = packId ? await service.extend(guestId, packId, previous) : await service.generate(guestId, topic, true); }
  catch { return aiFailure(AI_ERROR.UNAVAILABLE); }
  if (pack.error) return pack;
  if (!authorized() || room.aiRequest !== requestId || s.runId !== runId || s.keep?.dealId !== dealId || s.cfg !== cfg) return aiFailure(AI_ERROR.CHANGED);
  s.keep ??= {};
  if (!packId && previous?.title === pack.title && previous.expires === pack.expires && previous.usedPairIndices) {
    pack = { ...pack, pairs: previous.pairs, usedPairIndices: previous.usedPairIndices };
  }
  s.keep.aiPack = pack;
  s.cfg = { ...s.cfg, pack: AI_PACK, aiPackId: pack.packId, aiTopic: pack.title };
  await room.save();
  room.broadcast();
  await room.drain();
  return { packId: pack.packId, title: pack.title, ...aiPackProgress(pack) };
}

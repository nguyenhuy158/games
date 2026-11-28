import { roomStorageKey } from '../../../shared/page-routes.js';
import { AI_ACTION, AI_ERROR, AI_GAME, AI_INSTANCE, aiFailure, normalizeAiTopic } from '../application/spy-ai.js';

const ROOM_CODE = /^[A-Z0-9]{4}$/;
const DEVICE_ID = /^[\w-]{8,64}$/;
const PACK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = {
  [AI_ACTION.TOPICS]: new Set(['action']),
  [AI_ACTION.GENERATE]: new Set(['action', 'topic', 'room', 'deviceId']),
  [AI_ACTION.DEAL]: new Set(['action', 'packId']),
};

export async function routeAi(body, env, owner) {
  if (typeof body.action !== 'string') return aiFailure(AI_ERROR.REQUEST);
  const allowed = Object.hasOwn(FIELDS, body.action) && FIELDS[body.action];
  if (!allowed || !Object.keys(body).every((key) => allowed.has(key))) return aiFailure(AI_ERROR.REQUEST);
  try {
    if (body.action === AI_ACTION.GENERATE) {
      const topic = normalizeAiTopic(body.topic);
      const online = Object.hasOwn(body, 'room') || Object.hasOwn(body, 'deviceId');
      if (online) {
        if (typeof body.room !== 'string' || !ROOM_CODE.test(body.room) || typeof body.deviceId !== 'string' || !DEVICE_ID.test(body.deviceId)) return aiFailure(AI_ERROR.REQUEST);
        if (!env.NOKIA) return aiFailure(AI_ERROR.UNAVAILABLE);
        return await env.NOKIA.get(env.NOKIA.idFromName(roomStorageKey(AI_GAME, body.room))).generateSpyAi(topic, body.deviceId, owner);
      }
    }
    if (body.action === AI_ACTION.DEAL && (typeof body.packId !== 'string' || !PACK_ID.test(body.packId))) return aiFailure(AI_ERROR.REQUEST);
    const service = env.SPY_AI?.get(env.SPY_AI.idFromName(AI_INSTANCE));
    if (!service) return aiFailure(AI_ERROR.UNAVAILABLE);
    if (body.action === AI_ACTION.TOPICS) return await service.topics(owner);
    if (body.action === AI_ACTION.DEAL) return await service.deal(owner, body.packId);
    return await service.generate(owner, body.topic);
  } catch (error) { return aiFailure(error.code ?? AI_ERROR.UNAVAILABLE); }
}

import { DurableObject } from 'cloudflare:workers';
import { SpyAiService } from '../application/spy-ai.js';

export class SpyAi extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.service = new SpyAiService(ctx.storage, env.AI);
    ctx.blockConcurrencyWhile(() => this.service.ready);
  }

  topics(owner, refresh) { return this.service.topics(owner, refresh); }
  generate(owner, topic, online = false) { return this.service.generate(owner, topic, online); }
  deal(owner, packId) { return this.service.deal(owner, packId); }
}

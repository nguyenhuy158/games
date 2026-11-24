import { DurableObject } from 'cloudflare:workers';
import { SpyAiService } from '../spy-ai.js';

export class SpyAi extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.service = new SpyAiService(ctx.storage, env.AI);
    ctx.blockConcurrencyWhile(() => this.service.ready);
  }

  topics(owner) { return this.service.topics(owner); }
  generate(owner, topic, online = false) { return this.service.generate(owner, topic, online); }
  deal(owner, packId) { return this.service.deal(owner, packId); }
}

// @huyab/sso chỉ ship source .ts: wrangler bundle được, nhưng Node thuần (test) từ chối strip type
// cho file trong node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). Test nào nạp worker
// thì import file này trước để Node tự strip type. Bỏ file này khi kit ship JavaScript.
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith('.ts')) return nextLoad(url, context);
    const { source } = nextLoad(url, { ...context, format: 'module' });
    const code = typeof source === 'string' ? source : new TextDecoder().decode(source);
    return { format: 'module', source: stripTypeScriptTypes(code), shortCircuit: true };
  },
});

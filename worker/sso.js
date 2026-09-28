// Đăng nhập = SSO dùng chung của auth.huyab.click (Google), giống chia-keo (worker/src/sso.ts).
// Cookie `huyab_sso` gắn Domain=.huyab.click nên games.huyab.click nhận được luôn.
// Token là JWT RS256 do SSO ký; app chỉ giữ khoá công khai (JWKS) nên không tự phát token được.

const ISSUER = 'https://auth.huyab.click';
const COOKIE = 'huyab_sso';

// Cache ở module scope: isolate sống qua nhiều request, khỏi gọi JWKS mỗi lần.
let cachedKey = null;

async function publicKey() {
  if (cachedKey) return cachedKey;
  const r = await fetch(`${ISSUER}/.well-known/jwks.json`);
  if (!r.ok) throw new Error('jwks_unavailable');
  const { keys } = await r.json();
  if (!keys?.length) throw new Error('jwks_empty');
  cachedKey = await crypto.subtle.importKey('jwk', { ...keys[0], ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return cachedKey;
}

const b64url = (s) => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(p.padEnd(Math.ceil(p.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
};

// { sub, name, picture } nếu cookie hợp lệ; null cho MỌI trường hợp khác (thiếu, sai chữ ký,
// hết hạn, JWKS lỗi). Không ném lỗi: đăng nhập là tuỳ chọn, hỏng thì coi như khách.
export async function userFrom(req) {
  try {
    const token = req.headers.get('Cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1];
    if (!token) return null;
    const [h, p, sig] = token.split('.');
    if (!h || !p || !sig) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', await publicKey(), b64url(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(b64url(p)));
    if (c.iss !== ISSUER || !c.sub || !c.exp || c.exp <= Date.now() / 1000) return null;
    return { sub: String(c.sub), name: String(c.name || c.email || 'Người chơi').slice(0, 40), picture: c.picture || null };
  } catch {
    return null;
  }
}

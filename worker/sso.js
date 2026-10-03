// Đăng nhập = SSO dùng chung của auth.huyab.click (Google), xác thực bằng @huyab/sso.
// Cookie `huyab_sso` gắn Domain=.huyab.click nên games.huyab.click nhận được luôn.
import { DEFAULT_SSO_ISSUER, SSO_COOKIE, verifySsoToken } from '@huyab/sso';

// Chỉ đọc cookie: game không nhận `Authorization: Bearer` (readSsoToken của kit nhận cả hai).
const COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${SSO_COOKIE}=([^;]+)`);
const GUEST_NAME = 'Người chơi';
const MAX_NAME_LENGTH = 40;

// { sub, name, picture } nếu cookie hợp lệ; null cho MỌI trường hợp khác (thiếu, sai chữ ký,
// hết hạn, JWKS lỗi). Không ném lỗi: đăng nhập là tuỳ chọn, hỏng thì coi như khách.
export async function userFrom(req) {
  const token = req.headers.get('Cookie')?.match(COOKIE_PATTERN)?.[1];
  const claims = token ? await verifySsoToken(token, DEFAULT_SSO_ISSUER) : null;
  if (!claims) return null;
  return { sub: String(claims.sub), name: String(claims.name || claims.email || GUEST_NAME).slice(0, MAX_NAME_LENGTH), picture: claims.picture || null };
}

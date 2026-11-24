export const GUEST_COOKIE = '__Host-games_guest';
export const GUEST_HEADER = 'X-Guest';
export const USER_HEADER = 'X-User';
export const GAME_HEADER = 'X-Game';
export const ROOM_HEADER = 'X-Room';
export const PRIVATE_CACHE = 'private, no-store';
const COOKIE_HEADER = 'Cookie';
const SET_COOKIE_HEADER = 'Set-Cookie';
const CACHE_HEADER = 'Cache-Control';
const COOKIE_BYTES = 32;
const HEX_RADIX = 16;
const HEX_WIDTH = 2;
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${GUEST_COOKIE}=([a-f0-9]{${COOKIE_BYTES * HEX_WIDTH}})(?:;|$)`);
const HASH_ALGORITHM = 'SHA-256';
const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(HEX_RADIX).padStart(HEX_WIDTH, '0')).join('');

export function guestSession(req) {
  const value = req.headers.get(COOKIE_HEADER)?.match(COOKIE_PATTERN)?.[1];
  return { id: value ?? hex(crypto.getRandomValues(new Uint8Array(COOKIE_BYTES))), fresh: !value };
}

export async function resultOwner(user, guest) {
  const data = new TextEncoder().encode(JSON.stringify([user?.sub ?? null, guest]));
  return hex(new Uint8Array(await crypto.subtle.digest(HASH_ALGORITHM, data)));
}

export function withGuestCookie(response, guest) {
  const headers = new Headers(response.headers);
  headers.append(SET_COOKIE_HEADER, `${GUEST_COOKIE}=${guest}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
  headers.set(CACHE_HEADER, PRIVATE_CACHE);
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers,
    ...(response.webSocket ? { webSocket: response.webSocket } : {}),
  });
}

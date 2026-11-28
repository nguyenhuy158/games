import { el } from './dom.js';

export const AVATAR_COUNT = 32;
export const AVATAR_SIZE = 24;
export const AVATAR_DIRECTORY = 'avatars/soi';
const HASH_MULTIPLIER = 31;

export function avatarSource(id) {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, HASH_MULTIPLIER) + char.codePointAt(0)) >>> 0;
  return `/${AVATAR_DIRECTORY}/${hash % AVATAR_COUNT}.svg`;
}

export function playerAvatar({ id }) {
  return el('img', { className: 'player-avatar', src: avatarSource(id), alt: '', width: AVATAR_SIZE, height: AVATAR_SIZE });
}

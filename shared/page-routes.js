export const UNDERCOVER_ID = 'undercover';
export const LEGACY_UNDERCOVER_ID = 'gian-diep';

export function canonicalGameId(game) {
  return game === LEGACY_UNDERCOVER_ID ? UNDERCOVER_ID : game;
}

// Tên Durable Object và khóa danh sách phòng phải giữ nguyên cho phòng đã tạo.
export function roomStorageKey(game, code) {
  return `${game === UNDERCOVER_ID ? LEGACY_UNDERCOVER_ID : game}:${code}`;
}

// Đường dẫn trang cũ. ID game và tên phòng lưu trên máy chủ vẫn dùng khóa hiện có.
const LEGACY_PAGE_SLUGS = { [LEGACY_UNDERCOVER_ID]: UNDERCOVER_ID };

export function canonicalPagePath(path) {
  if (path === '/logos/gian-diep.svg') return '/logos/undercover.svg';
  const [, slug, ...rest] = path.split('/');
  if (!path.startsWith('/') || !Object.hasOwn(LEGACY_PAGE_SLUGS, slug)) return path;
  const suffix = rest.join('/');
  return `/${LEGACY_PAGE_SLUGS[slug]}/${suffix === 'index.html' ? '' : suffix}`;
}

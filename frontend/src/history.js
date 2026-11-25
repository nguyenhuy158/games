import { el } from './dom.js';
import { t } from './i18n.js';
import { PROFILE_API } from './account.js';

const HISTORY_API = '/api/me/history';
const HISTORY_LINK = '/#me';
const POST_METHOD = 'POST';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const CACHE_POLICY = 'no-store';
const OWNER_CHANGED_STATUS = 409;
const REQUEST_TIMEOUT_MS = 15000;
const REPLAY_WAIT_MS = 5000;
const PANEL_ID = 'historyStatus';
const pending = new Set();
let preparation = null;
let lastSaved = null;

function panel() {
  let node = document.getElementById(PANEL_ID);
  if (node) return node;
  document.head.append(el('style', { textContent: `
    #historyStatus { position: fixed; bottom: max(12px, env(safe-area-inset-bottom)); right: max(12px, env(safe-area-inset-right)); z-index: 100; width: min(420px, calc(100% - 24px)); max-height: 40vh; overflow: auto; display: grid; gap: 8px; }
    #historyStatus .history-message { display: grid; gap: 8px; padding: 12px 16px; color: var(--ui-fg); background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); box-shadow: var(--ui-shadow-sm); font: inherit; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
    #historyStatus p { margin: 0; }
    #historyStatus .history-actions { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
    #historyStatus button { font: inherit; padding: 8px 12px; min-height: 44px; color: var(--ui-fg); background: var(--ui-surface-muted); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); cursor: pointer; }
    #historyStatus button:disabled { opacity: .6; cursor: wait; }
    #historyStatus button:not(:disabled):hover { background: var(--ui-surface); }
    #historyStatus a { color: var(--ui-primary); text-underline-offset: .2em; }
    #historyStatus :is(a, button):focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }
  ` }));
  node = el('aside', { id: PANEL_ID });
  node.setAttribute('aria-label', t('Lưu lịch sử chơi', 'Game history saving'));
  document.body.append(node);
  return node;
}

function message() {
  const text = el('p');
  text.setAttribute('role', 'status');
  const retry = el('button', { type: 'button', textContent: t('Thử lại', 'Retry'), hidden: true });
  const node = el('div', { className: 'history-message' }, text,
    el('div', { className: 'history-actions' }, retry, el('a', { href: HISTORY_LINK, textContent: t('Xem lịch sử', 'View history') })),
  );
  panel().append(node);
  return { node, text, retry };
}

async function request(url, options = {}) {
  const response = await fetch(url, { cache: CACHE_POLICY, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...options });
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  return response.json();
}

export async function beginHistory(game, retryStart) {
  lastSaved?.remove();
  lastSaved = null;
  preparation ??= message();
  const notice = preparation;
  notice.text.textContent = t('Đang chuẩn bị lưu lịch sử cho ván mới…', 'Preparing history for your new game…');
  notice.retry.hidden = true;
  notice.retry.disabled = true;
  let resultOwner;
  try {
    ({ resultOwner } = await request(PROFILE_API));
    if (!resultOwner) throw new Error('Missing result owner');
  } catch {
    notice.text.textContent = t('Chưa bắt đầu ván vì không kết nối được để lưu lịch sử. Kiểm tra mạng rồi thử lại.', 'The game has not started because history could not connect. Check your connection and retry.');
    notice.retry.onclick = retryStart;
    notice.retry.hidden = false;
    notice.retry.disabled = false;
    return null;
  }
  notice.node.remove();
  preparation = null;
  const eventId = crypto.randomUUID();
  let result = null;
  let saving = false;
  let saved = false;
  let replay = null;
  let status = null;

  async function save() {
    if (saving || saved) return;
    saving = true;
    status.retry.disabled = true;
    status.text.textContent = t('Đang lưu ván vào lịch sử…', 'Saving this game to history…');
    try {
      if (replay) {
        let timeout;
        try {
          const rp = await Promise.race([replay, new Promise((resolve) => { timeout = setTimeout(() => resolve(null), REPLAY_WAIT_MS); })]);
          if (rp) result.rp = rp;
        } catch {} finally {
          clearTimeout(timeout);
          replay = null;
        }
      }
      await request(HISTORY_API, { method: POST_METHOD, headers: JSON_HEADERS, body: JSON.stringify(result) });
      saved = true;
      pending.delete(eventId);
      status.text.textContent = t('Đã lưu ván vào lịch sử.', 'This game is saved in your history.');
      status.retry.hidden = true;
      lastSaved?.remove();
      lastSaved = status.node;
    } catch (error) {
      status.text.textContent = error.status === OWNER_CHANGED_STATUS
        ? t('Phiên đã thay đổi nên không thể lưu ván này vào tài khoản khác. Ván chưa được xác nhận lưu; giữ trang này và quay lại phiên ban đầu để thử lại.', 'Your session changed, so this game cannot be saved to another account. Saving is not confirmed; keep this page open and return to the original session to retry.')
        : t('Chưa xác nhận lưu được ván. Giữ trang này, kiểm tra kết nối và bấm Thử lại; tải lại hoặc đóng trang sẽ mất kết quả chưa lưu.', 'Saving this game is not confirmed. Keep this page open, check your connection and Retry; reloading or closing the page loses unsaved results.');
      status.retry.hidden = false;
    } finally {
      saving = false;
      status.retry.disabled = false;
    }
  }

  return {
    finish(details, recording = null) {
      if (result) return;
      result = { ...details, game, eventId, resultOwner };
      replay = recording;
      pending.add(eventId);
      status = message();
      status.retry.onclick = save;
      void save();
    },
  };
}

addEventListener('beforeunload', (event) => {
  if (!pending.size) return;
  event.preventDefault();
  event.returnValue = '';
});

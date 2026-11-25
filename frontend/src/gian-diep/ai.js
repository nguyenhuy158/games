import { el } from '../dom.js';
import { t } from '../i18n.js';
import { AI_TOPIC_LIMIT } from '../../../shared/games/gian-diep/logic.js';
import { button, dialog, note } from './ui.js';

const AI_ENDPOINT = '/api/gian-diep/ai';
const AI_TIMEOUT_MS = 45000;
const HTTP_POST = 'POST';
const JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' });
const ACTION = Object.freeze({ TOPICS: 'topics', GENERATE: 'generate', DEAL: 'deal' });

async function request(payload, signal) {
  const response = await fetch(AI_ENDPOINT, {
    method: HTTP_POST,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
    signal: AbortSignal.any([AbortSignal.timeout(AI_TIMEOUT_MS), ...(signal ? [signal] : [])]),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(Array.isArray(result.msg) ? t(...result.msg) : t('AI chưa sẵn sàng. Thử bộ từ có sẵn.', 'AI is unavailable. Try a built-in pack.'));
  return result;
}

export async function dealAiPair(packId) {
  const result = await request({ action: ACTION.DEAL, packId });
  return result.pair;
}

export function aiPicker(save, roomContext = {}) {
  const controller = new AbortController();
  let busy = false;
  const topic = el('input', { maxLength: AI_TOPIC_LIMIT, autocomplete: 'off', placeholder: t('Ví dụ: món ăn đường phố', 'Example: Vietnamese street food') });
  const status = note('');
  status.setAttribute('role', 'status');
  const suggestions = el('div', { className: 'actions' });
  const run = async (action) => {
    if (busy) return;
    if (action === ACTION.GENERATE && !topic.value.trim()) { topic.reportValidity(); return; }
    busy = true;
    generate.disabled = true;
    suggest.disabled = true;
    topic.disabled = true;
    status.textContent = t('AI đang chuẩn bị…', 'AI is preparing…');
    try {
      const result = await request(action === ACTION.TOPICS ? { action } : { action, topic: topic.value.trim(), ...roomContext }, controller.signal);
      if (controller.signal.aborted) return;
      if (action === ACTION.TOPICS) {
        suggestions.replaceChildren(...result.topics.map((title) => button(title, () => { topic.value = title; topic.focus(); })));
        status.textContent = t('Chọn chủ đề hoặc nhập ý tưởng riêng.', 'Choose a topic or enter your own.');
      } else {
        save(result);
        modal.close();
      }
    } catch (error) {
      if (!controller.signal.aborted) status.textContent = error.name === 'TimeoutError' ? t('AI quá thời gian. Có thể dùng bộ từ có sẵn.', 'AI timed out. You can use a built-in pack.') : error.message;
    } finally {
      busy = false;
      generate.disabled = false;
      suggest.disabled = false;
      topic.disabled = false;
    }
  };
  topic.required = true;
  const suggest = button(t('Gợi ý chủ đề', 'Suggest topics'), () => run(ACTION.TOPICS), false, 'lightbulb');
  const generate = button(t('Tạo bộ từ bí mật', 'Create secret pack'), () => run(ACTION.GENERATE), true, 'sparkles');
  const form = el('form', { className: 'stack', onsubmit: (event) => { event.preventDefault(); run(ACTION.GENERATE); } },
    el('label', {}, t('Chủ đề', 'Topic'), topic), suggest, suggestions,
    note(t('Chỉ hiện tên bộ từ. Từ khóa được giữ kín đến khi chia thẻ. AI có thể sai; bộ từ có sẵn luôn dùng được.', 'Only the pack title is shown. Words stay private until dealing. AI can make mistakes; built-in packs remain available.')),
    status, generate);
  const modal = dialog(t('Bộ từ AI', 'AI word pack'), form, () => controller.abort());
  topic.focus();
}

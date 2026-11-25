// Người hô đọc số bằng Web Speech API (giọng có sẵn trên máy). Server gửi số mới cho cả phòng cùng lúc, mỗi máy tự đọc nên
// mọi người nghe gần như đồng thời. Chọn giọng: Tiếng Việt / English / tắt (mặc định theo ngôn ngữ giao diện, lưu trên máy).
// Không có giọng cho ngôn ngữ đã chọn thì báo một lần và chỉ hiện chữ. iOS chỉ cho đọc sau một lần chạm: lần chạm đầu tiên
// đọc một câu rỗng để mở khoá.
import { store } from '../dom.js';

const KEY = 'loto.voice';
export const VOICE_MODES = ['vi', 'en', 'off'];
const TAGS = { vi: 'vi-VN', en: 'en-US' };
const LOAD_MS = 1500; // Chrome nạp danh sách giọng trễ: chưa có giọng nào trong lúc này thì chưa coi là thiếu

const synth = globalThis.speechSynthesis ?? null;

// Giọng vui / giọng máy cũ của macOS (Bubbles, Zarvox, Grandpa...) đọc số khó nghe: chỉ dùng khi không còn giọng nào khác.
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|princess|deranged|hysterical/i;
const ROBOTIC = /eddy|flo\b|grandma|grandpa|reed|rocko|sandy|shelley/i;

// Giọng tốt nhất cho một ngôn ngữ: đúng vùng (vi-VN / en-US) trước, rồi giọng "tự nhiên" (Google, Natural, Premium...).
function best(all, tag) {
  const base = tag.slice(0, 2);
  const score = (v) => {
    const l = v.lang.replace('_', '-').toLowerCase();
    if (!l.startsWith(base)) return 0;
    return 10 + (l === tag.toLowerCase() ? 4 : 0) + (/natural|neural|premium|enhanced|google/i.test(v.name) ? 2 : 0) + (v.default ? 1 : 0)
      - (NOVELTY.test(v.name) ? 8 : ROBOTIC.test(v.name) ? 2 : 0);
  };
  return all.filter((v) => score(v) > 0).sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function createVoice({ lang, onMissing, onSpeaking }) {
  const born = Date.now(), warned = new Set();
  let mode = store.get(KEY);
  if (!VOICE_MODES.includes(mode)) mode = lang;
  const voiceFor = (m) => (synth && TAGS[m] ? best(synth.getVoices(), TAGS[m]) : null);
  let unlocked = false;
  const unlock = () => {
    if (!synth || unlocked) return;
    unlocked = true;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    synth.speak(u);
  };
  // Sự kiện được trình duyệt tính là "người dùng vừa chạm" (touchend / click / phím); pointerdown của ngón tay thì không.
  for (const type of ['touchend', 'click', 'keydown']) document.addEventListener(type, unlock, { once: true, capture: true });
  return {
    supported: !!synth,
    get mode() { return mode; },
    set mode(m) { mode = m; store.set(KEY, m); },
    voiceFor,
    unlock,
    // Đọc câu theo giọng đang chọn; text = { vi, en }.
    speak(text) {
      if (mode === 'off') return;
      const voice = voiceFor(mode);
      if (!voice) {
        const loading = !synth?.getVoices().length && Date.now() - born < LOAD_MS;
        if (!loading && !warned.has(mode)) { warned.add(mode); onMissing?.(mode); }
        return;
      }
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text[mode]);
      u.voice = voice;
      u.lang = voice.lang;
      u.onstart = () => onSpeaking?.(true);
      u.onend = u.onerror = () => onSpeaking?.(false);
      synth.speak(u);
    },
  };
}

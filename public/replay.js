// Xem lại ván + chia sẻ link. Bản ghi = { game, page, at, frames: [[ms, tin], ...] }: tin WebSocket y như client nhận lúc
// chơi (server ghi ở worker/adapters/game-room.js, game chạy ở trình duyệt ghi bằng public/tape.js rồi uploadReplay()).
//
//   const rp = replayParam();            // ?replay=<id> trên URL trang game
//   if (rp) playReplay(rp, { feed: (msg) => onMsg(msg), reset: () => clearBoard() });
//   ...  card.append(replayLinks(result.rp));   // nút "Xem lại" + "Chia sẻ" ở màn kết quả
//
// feed nhận từng tin theo đúng nhịp đã ghi; reset() dọn màn trước khi tua (tua = reset rồi feed lại nhanh tới mốc).
// Khoảng lặng dài (chờ nước đi) rút còn tối đa GAP_MAX ms cho đỡ chán.
import { t } from './i18n.js';

const GAP_MAX = 1500;
const SPEEDS = [1, 2, 4, 0.5];

export const replayParam = () => new URLSearchParams(location.search).get('replay');
// Link chia sẻ gọn: /replay/<id> (worker chuyển tới trang game ?replay=<id>).
export const replayUrl = (id) => `${location.origin}/replay/${id}`;

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  document.head.append(Object.assign(document.createElement('style'), { textContent: `
    .rp-bar { position: fixed; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 1000;
      display: flex; align-items: center; gap: 8px; padding: 8px 12px; width: min(560px, calc(100vw - 24px)); box-sizing: border-box;
      border-radius: 14px; background: #1c1917ee; color: #fff; font: 600 14px/1 system-ui, sans-serif; box-shadow: 0 6px 24px #0006; }
    .rp-bar button, .rp-links a, .rp-links button { font: inherit; border: 0; border-radius: 10px; padding: 8px 10px; cursor: pointer;
      background: #ffffff1f; color: inherit; text-decoration: none; white-space: nowrap; }
    .rp-bar button:hover { background: #ffffff33; }
    .rp-bar input[type=range] { flex: 1; min-width: 60px; accent-color: var(--accent, #ffd23f); }
    .rp-bar .rp-time { font-variant-numeric: tabular-nums; opacity: .8; font-weight: 500; }
    .rp-tag { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 1000; padding: 6px 12px; border-radius: 999px;
      background: #1c1917ee; color: #fff; font: 600 13px system-ui, sans-serif; }
    .rp-links { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .rp-links a, .rp-links button { background: var(--panel, #0000000f); color: var(--text, inherit); border: 1px solid var(--line, #0002); }` }));
}

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const clock = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// Chia sẻ: menu share của máy (điện thoại) hoặc chép link. Trả về true nếu đã chép.
export async function shareReplay(id) {
  const url = replayUrl(id);
  if (navigator.share) { try { await navigator.share({ title: t('Xem lại ván này', 'Watch this game'), url }); return false; } catch (e) { if (e?.name === 'AbortError') return false; } }
  await navigator.clipboard?.writeText(url);
  return true;
}

function shareButton(id) {
  const b = el('button', { type: 'button', textContent: t('Chia sẻ', 'Share') });
  b.onclick = async () => {
    if (await shareReplay(id)) { b.textContent = t('Đã chép link', 'Link copied'); setTimeout(() => { b.textContent = t('Chia sẻ', 'Share'); }, 1500); }
  };
  return b;
}

// Nút "Xem lại" + "Chia sẻ" cho màn kết quả / lịch sử. Không có rp (ván cũ, DO khởi động lại giữa ván) -> phần tử rỗng.
export function replayLinks(rp) {
  style();
  const box = el('div', { className: 'rp-links' });
  if (!rp) { box.hidden = true; return box; }
  box.append(el('a', { href: replayUrl(rp), target: '_blank', rel: 'noopener', textContent: t('Xem lại', 'Replay') }), shareButton(rp));
  return box;
}

// Game chạy ở trình duyệt: gửi bản ghi (Tape.done()) lên, trả về mã (hoặc null nếu chưa đăng nhập / lỗi).
export async function uploadReplay(game, page, frames) {
  try {
    const r = await fetch('/api/replay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game, page, frames }) });
    return r.ok ? (await r.json()).id : null;
  } catch { return null; }
}

export async function playReplay(id, { feed, reset = () => {} }) {
  style();
  const tag = el('div', { className: 'rp-tag', textContent: t('Đang xem lại', 'Replay') });
  document.body.append(tag);
  let rec;
  try {
    const r = await fetch(`/api/replay/${encodeURIComponent(id)}`);
    rec = r.ok ? await r.json() : null;
  } catch { rec = null; }
  if (!rec?.frames?.length) { tag.textContent = t('Không tìm thấy bản xem lại (có thể đã hết hạn 30 ngày)', 'Replay not found (it may have expired after 30 days)'); return; }

  // Mốc phát đã rút gọn khoảng lặng.
  const times = [];
  let prev = rec.frames[0][0], acc = 0;
  for (const [at] of rec.frames) { acc += Math.min(at - prev, GAP_MAX); prev = at; times.push(acc); }
  const total = times.at(-1);

  let pos = 0, next = 0, speed = 1, playing = true, last = performance.now(), raf = 0;
  const play = el('button', { type: 'button' });
  const spd = el('button', { type: 'button', textContent: '1×' });
  const bar = el('input', { type: 'range', min: 0, max: Math.max(1, total), step: 1, value: 0 });
  const time = el('span', { className: 'rp-time' });
  const again = el('a', { href: rec.page, className: '', textContent: t('Chơi', 'Play') });
  Object.assign(again.style, { color: 'inherit', textDecoration: 'none', padding: '8px 10px', borderRadius: '10px', background: '#ffffff1f' });
  document.body.append(el('div', { className: 'rp-bar' }, play, spd, bar, time, shareButton(id), again));

  const ui = () => {
    play.textContent = playing ? '❚❚' : '▶';
    bar.value = pos;
    time.textContent = `${clock(pos)} / ${clock(total)}`;
  };
  const step = () => { while (next < rec.frames.length && times[next] <= pos) feed(rec.frames[next++][1]); };
  const loop = (now) => {
    if (playing) {
      pos = Math.min(total, pos + (now - last) * speed);
      step();
      if (pos >= total) playing = false;
    }
    last = now;
    ui();
    raf = requestAnimationFrame(loop);
  };
  const seek = (to) => { pos = Math.max(0, Math.min(total, to)); reset(); next = 0; step(); ui(); };

  play.onclick = () => { if (!playing && pos >= total) seek(0); playing = !playing; ui(); };
  spd.onclick = () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; spd.textContent = `${speed}×`; };
  bar.oninput = () => seek(Number(bar.value));
  addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); play.click(); } });

  cancelAnimationFrame(raf);
  step();
  raf = requestAnimationFrame(loop);
  return rec;
}

// Nhạc nền hội chợ tự tổng hợp bằng Web Audio (không dùng bài hát / bản thu có sẵn): vòng 8 ô nhịp ~120 bpm, giai điệu
// ngũ cung + bass, trống kick / snare / hi-hat tạo từ dao động và nhiễu. Thêm tiếng trống mỗi số hô, kèn mừng khi KINH.
// Âm lượng 0–3 (0 = tắt) lưu localStorage; nhạc tự hạ còn ~25% khi người hô đang đọc số.
import { store } from '../dom.js';

const KEY = 'loto.music';
export const LEVELS = [0, 0.35, 0.65, 1];
const BPM = 120, STEP = 60 / BPM / 4, STEPS = 128, LOOK = 0.12, DUCK = 0.25, PEAK = 0.22;
// Ngũ cung Đô (C D E G A), MIDI; null = nghỉ. Mỗi ô nhịp 16 bước (nốt móc kép).
const MEL = [72, null, 76, null, 79, null, 76, 74, 72, null, 69, null, 67, null, null, null,
  69, null, 72, null, 74, null, 76, 74, 72, null, 74, null, 76, null, null, null,
  79, null, 81, null, 79, null, 76, null, 74, null, 76, 79, 76, null, 74, null,
  72, null, 74, null, 76, null, 74, 72, 69, null, 72, null, 72, null, null, null];
const BASS = [48, 48, 45, 45, 43, 43, 48, 48]; // một nốt / nửa ô nhịp (C C A A G G C C) lặp 2 lần mỗi vòng 8 ô
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

export function createMusic() {
  let level = Number(store.get(KEY) ?? 2);
  if (!(level in LEVELS)) level = 2;
  let ctx = null, master = null, bus = null, noise = null, playing = false, step = 0, at = 0, timer = 0;
  const ensure = () => {
    if (!ctx) {
      const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = LEVELS[level];
      master.connect(ctx.destination);
      bus = ctx.createGain(); // nhánh nhạc nền (ducking), hiệu ứng đi thẳng vào master
      bus.gain.value = PEAK;
      bus.connect(master);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const tone = (out, t, f, dur, type, vol, slide) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const hiss = (out, t, dur, vol, cut) => {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = 'highpass';
    f.frequency.value = cut;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t);
    s.stop(t + dur + 0.02);
  };
  const kick = (out, t, vol = 1) => tone(out, t, 150, 0.25, 'sine', vol, 45);
  const snare = (out, t, vol = 0.5) => { hiss(out, t, 0.16, vol, 1500); tone(out, t, 220, 0.08, 'triangle', vol * 0.6); };
  const play = (s, t) => {
    const b = s % 16;
    if (b % 4 === 0) kick(bus, t, 0.9);
    if (b === 4 || b === 12) snare(bus, t);
    if (b % 2 === 0) hiss(bus, t, 0.04, b % 4 ? 0.12 : 0.07, 7000);
    const m = MEL[s % MEL.length];
    if (m) tone(bus, t, hz(m), STEP * 1.8, 'square', 0.11);
    if (b % 8 === 0) tone(bus, t, hz(BASS[(s >> 3) % BASS.length]), STEP * 7, 'triangle', 0.35);
  };
  const tick = () => {
    while (at < ctx.currentTime + LOOK) {
      play(step, at);
      step = (step + 1) % STEPS;
      at += STEP;
    }
  };
  return {
    get level() { return level; },
    set level(v) {
      level = v;
      store.set(KEY, String(v));
      if (master) master.gain.setTargetAtTime(LEVELS[v], ctx.currentTime, 0.05);
      if (!v) this.stop();
    },
    // Gọi từ lần chạm của người dùng để trình duyệt cho phép phát.
    unlock() { if (level) ensure(); },
    start() {
      if (playing || !level || !ensure() || ctx.state !== 'running') return;
      playing = true;
      step = 0;
      at = ctx.currentTime + 0.05;
      tick();
      timer = setInterval(tick, 25);
    },
    stop() {
      if (!playing) return;
      playing = false;
      clearInterval(timer);
    },
    get playing() { return playing; },
    duck(on) { if (bus) bus.gain.setTargetAtTime(on ? PEAK * DUCK : PEAK, ctx.currentTime, 0.08); },
    // Tiếng trống mỗi số hô.
    drum() {
      if (!level || !ensure()) return;
      const t = ctx.currentTime + 0.01;
      kick(master, t, 0.6);
      tone(master, t, 110, 0.35, 'sine', 0.5, 70);
      hiss(master, t, 0.05, 0.15, 3000);
    },
    // Kèn mừng KINH: arpeggio Đô trưởng đi lên + hồi trống.
    fanfare() {
      if (!level || !ensure()) return;
      const t = ctx.currentTime + 0.02;
      [72, 76, 79, 84].forEach((m, i) => { tone(master, t + i * 0.12, hz(m), i === 3 ? 0.7 : 0.16, 'square', 0.12); });
      tone(master, t + 0.36, hz(88), 0.7, 'triangle', 0.1);
      for (let i = 0; i < 4; i++) snare(master, t + i * 0.06, 0.25);
      kick(master, t + 0.36, 0.8);
    },
  };
}

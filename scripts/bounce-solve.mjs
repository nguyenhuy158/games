// Kiểm tra các màn Bounce qua được (beam search trên chính mô phỏng của game). Sửa màn xong thì chạy:
//   node scripts/bounce-solve.mjs [chỉ-số-màn]
import { LEVELS, createSim, step, jump, T } from '../public/nokia/bounce/logic.js';
const clone = (s) => ({ ...s, rings: new Set(s.rings), lifeTaken: new Set(s.lifeTaken), safe: { ...s.safe }, events: [] });
const ACTS = [{ right: true }, { right: true, j: 1 }, { left: true }, { left: true, j: 1 }, {}, { j: 1 }];
const value = (s) => (s.finished ? 1e9 : s.dead ? -1e9 : s.rings.size * 400 + s.x - s.t * 2 + s.lives * 50);
const only = process.argv[2] ? [Number(process.argv[2])] : LEVELS.map((_, i) => i);
for (const L of only) {
  let beam = [{ s: createSim(L) }];
  let best = null;
  for (let d = 0; d < 2400 && !best; d++) {
    const next = [];
    for (const { s } of beam) for (const a of ACTS) {
      const n = clone(s);
      if (a.j) jump(n);
      for (let f = 0; f < 6 && !n.dead && !n.finished; f++) step(n, 1 / 60, a);
      if (n.finished) { best = n; break; }
      if (!n.dead) next.push({ s: n, v: value(n) });
    }
    // Giữ đa dạng: mỗi (cột, vòng) tối đa vài trạng thái
    next.sort((a, b) => b.v - a.v);
    const seen = new Map();
    beam = next.filter(({ s }) => { const k = `${Math.floor(s.x / 3)}:${Math.floor(s.y / 3)}:${s.rings.size}`; const c = seen.get(k) ?? 0; seen.set(k, c + 1); return c < 1; }).slice(0, 300);
    if (!beam.length) break;
  }
  const top = beam[0]?.s;
  console.log('level', L + 1, best ? `SOLVABLE in ${best.t.toFixed(1)}s, lives left ${best.lives}` : `NOT SOLVED: best col ${Math.floor((top?.x ?? 0) / T)}/${LEVELS[L][0].length} rings ${top?.rings.size}/${top?.total}`);
}

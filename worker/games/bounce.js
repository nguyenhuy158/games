import { raceModule } from './race.js';
import { LEVELS } from '../../public/nokia/bounce/logic.js';

// Bounce: đua cùng một màn, ai về đích (đủ vòng) nhanh nhất thắng. Điểm = thời gian (giây), càng nhỏ càng tốt.
export default raceModule({
  page: '/nokia/bounce/', max: 6, timeMs: 5 * 60_000, better: 'low',
  cfg: { level: 0 },
  config: (cfg, m) => (Number.isInteger(m.level) && LEVELS[m.level] ? { ...cfg, level: m.level } : null),
  extra: (ctx) => ({ level: ctx.cfg.level }),
});

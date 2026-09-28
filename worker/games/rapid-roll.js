import { raceModule } from './race.js';

// Rapid Roll: đua cùng đề (cùng hạt giống), ai trụ được xa nhất thắng. Tối đa 4 phút mỗi ván.
export default raceModule({ max: 6, timeMs: 4 * 60_000, better: 'high' });

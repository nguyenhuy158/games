// Dùng chung server (worker/adapters/game-room.js, pikachu.js, ...) và client (game chạy ở trình duyệt). Không import gì.
export const REPLAY_MAX = 1_500_000;

// Ghi lại một ván để xem lại (public/replay.js phát lại): chuỗi [ms từ lúc bắt đầu, tin WebSocket y như client nhận].
// Tin giống hệt tin trước thì bỏ. gap > 0 (game thời gian thực): tin state giữ tối đa 1 khung mỗi gap ms, khung ở giữa chỉ giữ
// cái mới nhất rồi ghi khi tới lượt / lúc kết thúc, nên khung cuối (kết quả) không bao giờ mất. Tin sự kiện (t khác 'state')
// luôn ghi. Quá REPLAY_MAX thì ngưng ghi, chỉ giữ khung cuối.
export class Tape {
  constructor(gap = 0) {
    Object.assign(this, { gap, t0: Date.now(), frames: [], size: 2, last: '', lastAt: -Infinity, pending: null, full: false });
  }

  push(msg) {
    const at = Date.now() - this.t0;
    const d = JSON.stringify(msg);
    if (d === this.last) return;
    const state = msg?.t === 'state';
    if (this.full) { if (state) this.pending = [at, d]; return; }
    if (state && this.gap && at - this.lastAt < this.gap) { this.pending = [at, d]; return; }
    if (state) this.pending = null;
    else if (this.pending) this.flush();
    this.keep(at, d, state);
  }

  flush() { const p = this.pending; this.pending = null; this.keep(p[0], p[1], true); }

  keep(at, d, state) {
    this.size += d.length + 16;
    if (this.size > REPLAY_MAX) { this.full = true; return; }
    this.frames.push([at, JSON.parse(d)]);
    this.last = d;
    if (state) this.lastAt = at;
  }

  // Khung cuối còn chờ + danh sách khung; gọi một lần lúc lưu.
  done() {
    if (this.pending) { const [at, d] = this.pending; this.pending = null; this.frames.push([at, JSON.parse(d)]); }
    return this.frames;
  }
}

// Ports (hexagonal): hợp đồng giữa application (worker/games/*) và adapter (worker/adapters/*). Chỉ là JSDoc, không có code chạy.
//
// Chiều phụ thuộc: public/<game>/logic.js (domain, không import gì) <- worker/games/<game>.js (application, chỉ import domain + ports)
//                  <- worker/adapters/* (Durable Object, WebSocket, SQLite, HTTP) <- worker/index.js (nối dây).
// scripts/check-deps.mjs kiểm chiều này, chạy trong logic.test.mjs.

/**
 * Một game chạy trong phòng chung (adapters/game-room.js).
 * @typedef {object} GameModule
 * @property {number} max                      số ghế chơi (ai vào sau thì xem)
 * @property {string} [slug]                   tên game ở client (/logos/<slug>.svg, lịch sử); mặc định = key trong bảng game
 * @property {string} page                     đường dẫn trang game, vd '/nokia/snake/' (link mời, danh sách phòng)
 * @property {object} cfg                      cấu hình mặc định của sảnh chờ
 * @property {(cfg: object, m: object) => object | null} [config]   chủ phòng đổi cấu hình -> cfg mới (null = bỏ qua)
 * @property {(ctx: Ctx) => void} start        bắt đầu ván: ghi trạng thái vào ctx.g
 * @property {(ctx: Ctx, p: Player, m: object) => boolean} msg      tin { t: 'g', ... } của người chơi -> true nếu cần gửi lại trạng thái
 * @property {number | ((cfg: object) => number)} [tickMs]          nhịp đều (game thời gian thực)
 * @property {(ctx: Ctx) => boolean} [tick]    gọi theo nhịp đều hoặc khi tới giờ đã hẹn bằng ctx.wakeAt -> true nếu đổi
 * @property {(ctx: Ctx, id: string) => object} view                trạng thái gửi riêng cho người id (giấu thông tin nếu cần)
 * @property {(ctx: Ctx, id: string) => void} [leave]               một người rời phòng giữa ván
 * @property {boolean} [volatile]              không lưu ctx.g mỗi nhịp (game thời gian thực; DO khởi động lại thì về sảnh)
 */

/**
 * Những gì game được dùng từ bên ngoài — mọi I/O đi qua đây.
 * @typedef {object} Ctx
 * @property {object} g                        trạng thái ván (adapter lưu lại)
 * @property {object} cfg
 * @property {string[]} seats                  id người đang cầm ghế
 * @property {Record<string, Player>} players
 * @property {() => number} now
 * @property {() => number} rand               số ngẫu nhiên [0, 1) an toàn (crypto)
 * @property {(id: string) => string} name
 * @property {() => Set<string>} online
 * @property {(at: number) => void} wakeAt     hẹn gọi tick() lúc `at` (ms) — dùng alarm nên DO ngủ được, bị tắt vẫn dậy
 * @property {(result: Result) => void} end    kết thúc ván; adapter ghi lịch sử người đã đăng nhập qua Recorder
 * @property {(id: string, msg: object) => void} send
 * @property {(msg: object) => void} sendAll
 */

/** @typedef {{ id: string, name: string, user?: { sub: string, name: string } | null }} Player */
/** @typedef {{ ranks: { id: string, score: number, won: boolean }[], mode?: string, level?: number, title?: string | [string, string] }} Result */

/**
 * Nơi ghi kết quả + danh sách phòng công khai (adapters/top.js, DO SQLite "global").
 * @typedef {object} Recorder
 * @property {(plays: object[]) => Promise<void>} addPlays
 * @property {(row: RoomRow) => Promise<void>} roomUpsert
 * @property {(key: string) => Promise<void>} roomDrop
 */

/** @typedef {{ key: string, game: string, code: string, path: string, players: number, cap: number, status: 'waiting' | 'playing', host: string, mode?: string }} RoomRow */

export {};

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
 * @property {boolean} [volatile]              không lưu ctx.g (game thời gian thực; DO khởi động lại thì về sảnh). Không volatile + tickMs: lưu mỗi 2 giây
 * @property {boolean} [flat]                  giao thức "phẳng": view() trả thẳng các trường của tin state (luôn gọi, kể cả lúc chưa có ván)
 * @property {string[]} [messages]             tin riêng của game ({ t: 'move' ... }) chuyển cho msg() ở mọi pha (module tự kiểm)
 * @property {number} [emotes]                 số emote; adapter xử lý { t: 'emo', e } (chống spam) và phát lại cho cả phòng
 * @property {boolean} [autostart]             không có sảnh chờ: ván chạy luôn từ lúc mở phòng (Bầu cua)
 * @property {boolean} [persist]               cả phòng rớt mạng giữa ván thì giữ ván (hẹn giờ vẫn chạy), không xoá phòng
 * @property {number} [maxOnline]              số người tối đa trong phòng (mặc định 12)
 * @property {(ctx: Ctx, p: Player) => void} [join]                 có người vào giữa ván
 * @property {(ctx: Ctx, id: string) => void} [hello]               mỗi lần có người vào / vào lại (sau tin state): gửi dữ liệu riêng qua ctx.send (Dò mìn: bàn)
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
 * @property {object} keep                     dữ liệu giữ qua các ván (tỉ số cặp đấu, ai đi trước)
 * @property {() => string | null} host        chủ phòng hiện tại
 * @property {() => string[]} order            thứ tự vào phòng
 * @property {(key: string, ms: number) => boolean} allow            chống spam: false nếu `key` vừa dùng trong ms
 * @property {(plays: object[]) => void} record                     ghi lịch sử tuỳ ý (Bầu cua ghi lúc rời phòng)
 * @property {(at: number) => void} wakeAt     hẹn gọi tick() lúc `at` (ms) — dùng alarm nên DO ngủ được, bị tắt vẫn dậy
 * @property {(result: Result) => void} end    kết thúc ván; adapter ghi lịch sử người đã đăng nhập qua Recorder
 * @property {() => string | undefined} clip   game không kết thúc (Bầu cua): cắt bản xem lại tới lần gửi trạng thái kế tiếp, trả mã của đoạn đó
 * @property {(id: string, msg: object) => void} send
 * @property {(msg: object, o?: { tape?: boolean }) => void} sendAll   tape: false = không ghi vào bản xem lại (Đào Vàng bớt snap)
 */

/** @typedef {{ id: string, name: string, user?: { sub: string, name: string } | null }} Player */
/** @typedef {{ ranks: { id: string, score: number, won: boolean, detail?: object }[], mode?: string, level?: number, title?: string | [string, string] }} Result */

/**
 * Nơi ghi kết quả + danh sách phòng công khai (adapters/top.js, DO SQLite "global").
 * @typedef {object} Recorder
 * @property {(plays: object[]) => Promise<void>} addPlays
 * @property {(row: RoomRow) => Promise<void>} roomUpsert
 * @property {(key: string) => Promise<void>} roomDrop
 */

/** @typedef {{ key: string, game: string, code: string, path: string, players: number, cap: number, status: 'waiting' | 'playing', host: string, mode?: string }} RoomRow */

export {};

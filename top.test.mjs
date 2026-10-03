// Test SQL của DO Top (bảng xếp hạng, lịch sử, xếp hạng vui) bằng node:sqlite + stub 'cloudflare:workers'.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import './scripts/node-ts-hooks.mjs';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject{constructor(c,e){this.ctx=c;this.env=e}}', shortCircuit: true };
    return next(spec, ctx);
  }`));
// node:sqlite chỉ có sẵn (không cần cờ) từ Node 22.13; máy build cũ hơn thì bỏ qua thay vì chặn deploy.
const sqlite = await import('node:sqlite').catch(() => null);
if (!sqlite) { console.log('top skipped (no node:sqlite)'); }
const { Top } = sqlite ? await import('./worker/index.js') : {};
const { DatabaseSync } = sqlite ?? {};

if (sqlite) {
const db = new DatabaseSync(':memory:');
const sql = { exec(q, ...p) { const st = db.prepare(q); const rows = /^\s*SELECT/i.test(q) ? st.all(...p).map((r) => ({ ...r })) : (st.run(...p), []); return { toArray: () => rows }; } };
const top = new Top({ storage: { sql } }, {});

const H = 3600_000, now = Date.now();
const vnMidnight = Math.floor((now + 7 * H) / (24 * H)) * 24 * H - 7 * H; // 0h hôm nay giờ VN (UTC ms)
const play = (sub, name, game, mode, score, level, won, at) => {
  top.addPlays([{ sub, name, game, mode, score, level, won }]);
  db.prepare('UPDATE plays SET at = ? WHERE id = (SELECT MAX(id) FROM plays)').run(at);
};
play('a', 'An', 'dao-vang', 'solo', 900, 3, false, now - 2 * H);
play('a', 'An', 'pikachu', 'coop', 300, 5, true, vnMidnight + 2 * H); // 2h sáng VN -> cú đêm
play('b', 'Bình', 'dao-vang', 'coop', 1500, 4, false, now - H);
play('b', 'Bình', 'pikachu', 'race', 450, 2, true, now - 30 * 24 * H); // cũ hơn 1 tuần
play('a', 'An Mới', 'pikachu', 'team', 100, 1, false, vnMidnight + 12 * H); // đổi tên -> dùng tên mới

const all = Object.fromEntries(top.fun('all').map((c) => [c.key, c.rows]));
// Ván Đào Vàng 1 người do client tự báo: không vào bảng xếp hạng vui (chỉ lịch sử cá nhân).
assert.deepEqual(all.plays, [{ name: 'Bình', value: 2 }, { name: 'An Mới', value: 2 }]);
assert.deepEqual(all.wins.map((r) => r.value), [1, 1]);
assert.deepEqual(all.gold, [{ name: 'Bình', value: 1500 }], 'self-reported solo run (900) not ranked');
assert.deepEqual(all.tiles[0], { name: 'Bình', value: 450 });
assert.deepEqual(all.deep[0], { name: 'Bình', value: 4 });
assert.deepEqual(all.team, [{ name: 'An Mới', value: 2 }, { name: 'Bình', value: 1 }]);
assert.deepEqual(all.night, [{ name: 'An Mới', value: 1 }], 'only the 2am VN play counts');

const week = Object.fromEntries(top.fun('week').map((c) => [c.key, c.rows]));
assert.deepEqual(week.tiles, [{ name: 'An Mới', value: 300 }], 'old play excluded from this week');
assert.equal(top.fun('all').length, 13);
// Bầu cua: tổng lãi các buổi, buổi lỗ kéo tổng xuống, tổng âm thì không lên bảng.
play('a', 'An Mới', 'bau-cua', 'rotate', 500, 6, true, now - H);
play('a', 'An Mới', 'bau-cua', 'rotate', -200, 3, false, now - H);
play('b', 'Bình', 'bau-cua', 'house', -50, 2, false, now - H);
assert.deepEqual(Object.fromEntries(top.fun('all').map((c) => [c.key, c.rows])).baucua, [{ name: 'An Mới', value: 300 }]);
play('a', 'An Mới', 'do-min', 'coop', 95, 1, true, now - H);
play('b', 'Bình', 'do-min', 'race', 60, 2, true, now - H);
play('b', 'Bình', 'do-min', 'race', 30, 2, false, now - H); // thua: không tính
assert.deepEqual(Object.fromEntries(top.fun('all').map((c) => [c.key, c.rows])).mines, [{ name: 'Bình', value: 60 }, { name: 'An Mới', value: 95 }], 'nhanh nhất lên đầu, chỉ ván thắng');
assert.equal(Object.fromEntries(top.stats('b').map((s) => [s.game, s]))['do-min'].fastest, 60);

// stats / history theo người
const sa = Object.fromEntries(top.stats('a').map((s) => [s.game, s]));
assert.equal(sa.pikachu.plays, 2);
assert.equal(sa.pikachu.wins, 1);
assert.equal(sa['dao-vang'].best, 900);
assert.equal(top.history('b').length, 5); // 2 ván cũ + 2 ván dò mìn + 1 buổi bầu cua ở trên
assert.equal(top.history('nobody').length, 0);

// Nối 4: chỉ ván thắng người thật. Bắn tàu: thắng bằng ít phát nhất lên đầu, ván thua không tính.
play('a', 'An Mới', 'noi-4', 'pvp', 21, 0, true, now - H);
play('b', 'Bình', 'noi-4', 'bot', 15, 0, true, now - H);
play('a', 'An Mới', 'ban-tau', 'bot', 48, 0, true, now - H);
play('b', 'Bình', 'ban-tau', 'pvp', 39, 0, true, now - H);
play('b', 'Bình', 'ban-tau', 'pvp', 20, 0, false, now - H);
const fun2 = Object.fromEntries(top.fun('all').map((c) => [c.key, c.rows]));
assert.deepEqual(fun2.c4, [{ name: 'An Mới', value: 1 }], 'vs-bot wins do not count');
assert.deepEqual(fun2.ships, [{ name: 'Bình', value: 39 }, { name: 'An Mới', value: 48 }]);
console.log('top ok');
}

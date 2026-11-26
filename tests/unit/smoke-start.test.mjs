import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const ROOT_URL = new URL('../../', import.meta.url);
const SMOKE_SCRIPT = 'tests/smoke.mjs';

const fixture = `
const rooms = new Map();
class FixtureSocket extends EventTarget {
  constructor(address) {
    super();
    const url = new URL(address);
    this.id = url.searchParams.get('id');
    this.key = url.pathname;
    const room = rooms.get(this.key) ?? { sockets: [], status: 'lobby', mode: 'coop', opened: new Set() };
    rooms.set(this.key, room);
    room.sockets.push(this);
    this.room = room;
    queueMicrotask(() => {
      this.onopen();
      if (room.sockets.length === 2) this.broadcastState();
    });
  }
  deliver(message) {
    const event = new MessageEvent('message', { data: JSON.stringify(message) });
    this.onmessage?.(event);
    this.dispatchEvent(event);
  }
  broadcastState() {
    for (const socket of this.room.sockets) socket.deliver({
      t: 'state', status: this.room.status, mode: this.room.mode,
      host: this.room.sockets[0].id, winner: this.room.sockets[0].id,
      players: this.room.sockets.map((player) => ({ id: player.id, opened: this.room.opened.has(player.id) ? 1 : 0, booms: 0 })),
    });
  }
  send(raw) {
    const message = JSON.parse(raw);
    if (message.t === 'config') {
      this.room.mode = message.mode;
      this.broadcastState();
    } else if (message.t === 'start') {
      for (const socket of this.room.sockets) socket.deliver({ t: 'grid', grids: { [socket.id]: [-1] } });
      this.room.timer = setTimeout(() => {
        this.room.status = 'playing';
        this.broadcastState();
      }, 100);
    } else if (message.t === 'open') {
      if (this.room.status !== 'playing') throw new Error('Opened before playing state');
      this.room.opened.add(this.id);
      this.deliver({ t: 'open', unit: this.id, cells: [[message.i, 0]] });
      if (this.room.opened.size === 2) {
        this.room.status = 'ended';
        this.broadcastState();
        for (const socket of this.room.sockets) socket.deliver({ t: 'reveal', mines: [] });
      }
    }
  }
  close() { clearTimeout(this.room.timer); }
}
globalThis.WebSocket = FixtureSocket;
`;
const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(fixture)}`, SMOKE_SCRIPT, 'http://127.0.0.1:8789', 'do-min'], {
  cwd: ROOT_URL,
  env: { ...process.env, E2E_SMOKE_MODE: 'full', E2E_GAME_CONCURRENCY: '1' },
  encoding: 'utf8',
  timeout: 15000,
});
assert.equal(result.status, 0, result.stdout + result.stderr);
assert.match(result.stdout, /ok\s+do-min\s+.*winner=Bot0/);
assert.doesNotMatch(result.stdout, /retry|FAIL/);
console.log('smoke delayed mine start ok');

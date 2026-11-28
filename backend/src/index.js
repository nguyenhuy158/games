// Nối dây (hexagonal, xem docs/hexagon-plan.md): Worker = adapter HTTP; mỗi class Durable Object = adapter phòng chung + module game.
// Tên class + binding trong wrangler.toml giữ nguyên (đổi tên phải có migration).
import { gameRoom } from './adapters/game-room.js';
import snake from './application/games/snake.js';
import bantumi from './application/games/bantumi.js';
import pairs from './application/games/pairs.js';
import logic from './application/games/logic.js';
import rapidRoll from './application/games/rapid-roll.js';
import spaceImpact from './application/games/space-impact.js';
import bounce from './application/games/bounce.js';
import oAnQuan from './application/games/o-an-quan.js';
import coGanh from './application/games/co-ganh.js';
import coTuong from './application/games/co-tuong.js';
import { caro, c4 } from './application/games/caro.js';
import banTau from './application/games/ban-tau.js';
import bauCua from './application/games/bau-cua.js';
import doMin from './application/games/do-min.js';
import daoVang from './application/games/dao-vang.js';
import pikachu from './application/games/pikachu.js';
import loto from './application/games/loto.js';
import soi from './application/games/soi.js';
import undercover from './application/games/gian-diep.js';

export { SpyAi } from './adapters/spy-ai.js';
import { generateRoomAi } from './adapters/room-ai.js';
export { http as default } from './adapters/http.js';
export { Top } from './adapters/top.js';

// /api/nk/<game>/room/CODE -> DO "<game>:<CODE>" (ngoài game Nokia còn Ô ăn quan, Cờ gánh, Cờ tướng, Lô tô, Sói: class này là phòng dùng chung).
export const NOKIA_GAMES = { snake, bantumi, pairs, logic, 'rapid-roll': rapidRoll, 'space-impact': spaceImpact, bounce, 'o-an-quan': oAnQuan, 'co-ganh': coGanh, 'co-tuong': coTuong, loto, soi, undercover };
export class NokiaRoom extends gameRoom(NOKIA_GAMES) {
  generateSpyAi(topic, deviceId, guestId) { return generateRoomAi(this, topic, deviceId, guestId); }
}
// /api/room/CODE (Pikachu), /api/cc|c4/room/CODE (Cờ caro / Nối 4 chung class), /api/bt/room/CODE, /api/bc/room/CODE, /api/ms/room/CODE, /api/dv/room/CODE.
export class CaroRoom extends gameRoom({ caro, c4 }) {}
export class ShipRoom extends gameRoom({ 'ban-tau': banTau }) {}
export class DiceRoom extends gameRoom({ 'bau-cua': bauCua }) {}
export class MineRoom extends gameRoom({ 'do-min': doMin }) {}
export class MinerRoom extends gameRoom({ 'dao-vang': daoVang }) {}
export class Room extends gameRoom({ pikachu }) {}

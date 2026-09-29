// Nối dây (hexagonal, xem docs/hexagon-plan.md): Worker = adapter HTTP; mỗi class Durable Object = adapter phòng chung + module game.
// Tên class + binding trong wrangler.toml giữ nguyên (đổi tên phải có migration).
import { gameRoom } from './adapters/game-room.js';
import snake from './games/snake.js';
import bantumi from './games/bantumi.js';
import pairs from './games/pairs.js';
import logic from './games/logic.js';
import rapidRoll from './games/rapid-roll.js';
import spaceImpact from './games/space-impact.js';
import bounce from './games/bounce.js';
import oAnQuan from './games/o-an-quan.js';
import coGanh from './games/co-ganh.js';
import coTuong from './games/co-tuong.js';
import { caro, c4 } from './games/caro.js';
import banTau from './games/ban-tau.js';
import bauCua from './games/bau-cua.js';
import doMin from './games/do-min.js';
import daoVang from './games/dao-vang.js';
import pikachu from './games/pikachu.js';

export { http as default } from './adapters/http.js';
export { Top } from './adapters/top.js';

// /api/nk/<game>/room/CODE -> DO "<game>:<CODE>".
export const NOKIA_GAMES = { snake, bantumi, pairs, logic, 'rapid-roll': rapidRoll, 'space-impact': spaceImpact, bounce, 'o-an-quan': oAnQuan, 'co-ganh': coGanh, 'co-tuong': coTuong };
export class NokiaRoom extends gameRoom(NOKIA_GAMES) {}
// /api/room/CODE (Pikachu), /api/cc|c4/room/CODE (Cờ caro / Nối 4 chung class), /api/bt/room/CODE, /api/bc/room/CODE, /api/ms/room/CODE, /api/dv/room/CODE.
export class CaroRoom extends gameRoom({ caro, c4 }) {}
export class ShipRoom extends gameRoom({ 'ban-tau': banTau }) {}
export class DiceRoom extends gameRoom({ 'bau-cua': bauCua }) {}
export class MineRoom extends gameRoom({ 'do-min': doMin }) {}
export class MinerRoom extends gameRoom({ 'dao-vang': daoVang }) {}
export class Room extends gameRoom({ pikachu }) {}

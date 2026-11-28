// Hộp "Cách chơi / How to play" dùng chung mọi game: nút (i) mở hộp thoại (<dialog> modal: Esc / nền mờ / nút đóng,
// Tab chỉ chạy trong hộp), lần đầu vào game tự mở một lần (localStorage 'help.seen.<game>', ghi khi đóng).
//   mountHelp({ game, button, content: { vi, en }, auto?, onOpen?, onClose? }) -> { open, close, isOpen }
//   button: element, mảng element hoặc selector (mọi nút khớp đều mở hộp); content[lang] = {
//     goal: 'Mục tiêu', play: ['Cách chơi'...], keys: ['Bàn phím / chuột'...], touch: ['Cảm ứng'...], tips: ['Mẹo'...] }
// Thanh trên chật (nút nhỏ hơn 44px): thêm class 'compact' cho nút — giữ cỡ như các nút bên cạnh, vùng chạm vẫn 44×44.
import { t, en } from './i18n.js';
import { iconEl } from './icons.js';
import { el, store } from './dom.js';
import { mountMobileGameHeader } from './sidebar.js';

const SEEN_KEY = 'help.seen.';
const QUICK_RULES = {
  '2048': [
    'Vuốt hoặc dùng phím mũi tên để ghép các ô cùng số. Tạo ô 2048.',
    'Swipe or use the arrow keys to merge equal tiles. Make a 2048 tile.',
  ],
  'ban-tau': [
    'Xếp 5 tàu, rồi lần lượt bắn vào ô của đối thủ. Đánh chìm hết tàu địch trước để thắng.',
    'Place 5 ships, then take turns firing at enemy squares. Sink their fleet first.',
  ],
  'bau-cua': [
    'Đặt xu ảo vào các con vật. Khi mở bát, mỗi mặt trùng với ô bạn đặt sẽ trả thưởng.',
    'Bet virtual coins on animals. Each matching die pays out when the bowl opens.',
  ],
  'co-caro': [
    'Đặt quân vào ô trống. Nối 5 quân để thắng, hoặc nối 3 khi chơi XO.',
    'Place a piece on an empty square. Line up 5 to win, or 3 in tic-tac-toe.',
  ],
  'co-ganh': [
    'Di chuyển quân để gánh hoặc vây quân đối phương. Bạn thắng khi họ hết quân hoặc hết nước đi.',
    'Move to flank or trap enemy pieces. Win when your opponent runs out of pieces or legal moves.',
  ],
  'co-tuong': [
    'Lần lượt di chuyển một quân. Chiếu bí tướng đối phương để thắng.',
    'Take turns moving one piece. Checkmate the opposing general to win.',
  ],
  'dao-vang': [
    'Chạm để thả móc gắp vàng. Đủ tiền trước khi hết giờ để qua màn.',
    'Tap to drop the claw and grab gold. Reach the cash target before time runs out.',
  ],
  'do-min': [
    'Mở ô và dùng các số làm gợi ý để đánh dấu mìn. Mở hết ô an toàn để thắng.',
    'Open squares and use the numbers to flag mines. Uncover every safe square to win.',
  ],
  'loto': [
    'Đánh dấu các số được gọi. Đủ 5 số trên một hàng thì bấm KINH.',
    'Mark the called numbers. Tap KINH when all 5 numbers in a row are marked.',
  ],
  'noi-4': [
    'Thả quân vào một cột. Nối 4 quân ngang, dọc hoặc chéo để thắng.',
    'Drop a disc into a column. Connect 4 across, down, or diagonally to win.',
  ],
  'o-an-quan': [
    'Chọn ô để rải sỏi và thu quân. Ai có nhiều điểm nhất khi hết ván sẽ thắng.',
    'Choose a pit to sow pebbles and capture pieces. The most points wins.',
  ],
  'pikachu': [
    'Nối hai hình giống nhau bằng tối đa ba đoạn thẳng. Dọn hết bàn trước khi hết giờ.',
    'Link matching tiles with up to three straight segments. Clear the board before time runs out.',
  ],
  'soi': [
    'Web chia vai, cả nhóm chơi trực tiếp. Sói nháy mắt để loại dân, còn dân tìm ra Sói.',
    'The game deals roles, then you play face to face. The Wolf winks villagers out while they try to identify the Wolf.',
  ],
  'sudoku': [
    'Điền 1–9 vào ô trống. Mỗi hàng, cột và ô vuông 3×3 phải có đủ chín số, không trùng.',
    'Fill the empty squares with 1–9. Every row, column, and 3×3 box must contain each digit once.',
  ],
  'tetris': [
    'Di chuyển và xoay các khối đang rơi. Lấp kín hàng để xóa hàng và ghi điểm.',
    'Move and rotate falling blocks. Fill rows to clear them and score.',
  ],
  'undercover-guide': [
    'Dân có cùng một từ, gián điệp có từ tương tự. Lần lượt nói gợi ý rồi bỏ phiếu tìm gián điệp.',
    'Civilians share a word and spies get a similar one. Take turns giving clues, then vote to find the spies.',
  ],
  'bantumi': [
    'Chọn ô để rải sỏi. Gom nhiều sỏi vào kho hơn đối thủ để thắng.',
    'Choose a pit to sow seeds. Collect more in your store than your opponent.',
  ],
  'bounce': [
    'Điều khiển bóng qua tất cả các vòng. Tới cửa đích để qua màn.',
    'Guide the ball through every ring. Reach the exit to clear the level.',
  ],
  'logic': [
    'Đoán mã gồm 4 hình. Dùng phản hồi sau mỗi lượt để sửa lần đoán tiếp theo.',
    'Guess the four-shape code. Use the feedback to refine your next guess.',
  ],
  'pairs': [
    'Lật hai lá để tìm một cặp giống nhau. Ai tìm nhiều cặp nhất thắng.',
    'Flip two cards to find a match. The most pairs wins.',
  ],
  'rapid-roll': [
    'Lăn bóng xuống các bệ và tránh gai. Cố trụ xa nhất.',
    'Roll the ball down the platforms and dodge spikes. Survive as far as you can.',
  ],
  'snake': [
    'Lái rắn ăn mồi để dài ra và ghi điểm. Tránh đâm vào tường hoặc thân rắn.',
    'Steer your snake to eat, grow, and score. Avoid walls and snake bodies.',
  ],
  'space-impact': [
    'Lái phi thuyền, bắn quái và né đạn. Hạ trùm để qua màn.',
    'Fly your ship, shoot aliens, and dodge fire. Defeat the boss to clear the level.',
  ],
};
const CSS = `
.help-btn{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
.help-btn.compact{min-width:0;min-height:0;position:relative}
.help-btn.compact::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}
dialog.help-dlg{padding:0;border:0;background:transparent;color:var(--ui-fg);width:min(420px,calc(100vw - 24px));max-width:none;
  max-height:calc(100dvh - 24px);overflow:visible;font:15px/1.45 "Be Vietnam Pro",Inter,system-ui,sans-serif;user-select:text}
dialog.help-dlg::backdrop{background:color-mix(in oklab,var(--ui-bg) 75%,transparent)}
dialog.help-dlg[open]{animation:help-pop var(--ui-dur) var(--ui-ease-out)}
@keyframes help-pop{from{transform:scale(.96);opacity:0}}
.help-card{display:flex;flex-direction:column;max-height:calc(100dvh - 24px);background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:var(--ui-radius);
  box-shadow:var(--ui-shadow-lg);overflow:hidden}
.help-head{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 16px;border-bottom:1px solid var(--ui-border)}
.help-head h2{flex:1;margin:0;font-size:18px;font-weight:600;color:var(--ui-fg);display:flex;align-items:center;gap:8px}
.help-head h2 .ic{width:24px;height:24px;color:var(--ui-primary)}
.help-x{width:44px;height:44px;min-width:0;min-height:0;flex:none;border-radius:var(--ui-radius);border:1px solid var(--ui-border);background:var(--ui-surface);color:var(--ui-fg);display:grid;place-items:center;cursor:pointer;padding:0;margin:0;box-shadow:none}
.help-body{overflow:auto;overscroll-behavior:contain;padding:16px;display:grid;gap:16px}
.help-quick{margin:0;color:var(--ui-fg)}
.help-foot{padding:12px 16px 16px;display:flex;justify-content:center}
.help-ok{display:inline-flex;align-items:center;justify-content:center;width:auto;min-height:44px;min-width:140px;margin:0;padding:0 24px;border-radius:var(--ui-radius);border:1px solid transparent;background:var(--ui-primary);color:var(--ui-primary-fg);
  font:inherit;font-weight:600;line-height:1.2;letter-spacing:normal;text-transform:none;text-align:center;cursor:pointer;box-shadow:var(--ui-shadow-sm)}
.help-ok:hover{background:var(--ui-primary-hover)}
.help-x:hover{background:var(--ui-surface-muted)}
.help-x:focus-visible,.help-ok:focus-visible{outline:2px solid var(--ui-primary);outline-offset:3px}
@media(prefers-reduced-motion:reduce){dialog.help-dlg[open]{animation:none}}
`;

export function mountHelp({ game, button, content, auto = true, onOpen, onClose }) {
  if (!document.getElementById('help-css')) document.head.append(el('style', { id: 'help-css', textContent: CSS }));
  const title = t('Cách chơi', 'How to play');
  const quick = Object.hasOwn(QUICK_RULES, game)
    ? t(...QUICK_RULES[game])
    : (content[en ? 'en' : 'vi'] ?? content.vi).goal;
  const dlg = el('dialog', { className: 'help-dlg' },
    el('div', { className: 'help-card' },
      el('div', { className: 'help-head' },
        el('h2', { id: `help-title-${game}` }, iconEl('info'), title),
        el('button', { type: 'button', className: 'help-x', title: t('Đóng', 'Close'), ariaLabel: t('Đóng', 'Close'), onclick: () => dlg.close() }, iconEl('x'))),
      el('div', { className: 'help-body' },
        el('p', { className: 'help-quick', textContent: quick })),
      el('div', { className: 'help-foot' },
        el('button', { type: 'button', className: 'help-ok', textContent: t('Đã hiểu', 'Got it'), onclick: () => dlg.close() }))));
  dlg.setAttribute('aria-labelledby', `help-title-${game}`);
  // Chạm nền mờ (ngoài thẻ) thì đóng.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { store.set(SEEN_KEY + game, '1'); onClose?.(); });
  // Đang mở: phím không lọt xuống game (mũi tên / Cách...); Esc, Tab, Enter vẫn chạy mặc định trong hộp.
  for (const type of ['keydown', 'keyup']) addEventListener(type, (e) => { if (dlg.open) e.stopPropagation(); }, true);
  document.body.append(dlg);

  const open = () => {
    if (dlg.open) return;
    dlg.showModal();
    dlg.querySelector('.help-body').scrollTop = 0;
    onOpen?.();
  };
  const btns = typeof button === 'string' ? document.querySelectorAll(button) : [button].flat();
  for (const b of btns) {
    b.replaceChildren(iconEl('info'));
    b.classList.add('help-btn');
    b.dataset.help = game;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', open);
  }
  mountMobileGameHeader(game, title, open);
  if (auto && !store.get(SEEN_KEY + game)) open();
  return { open, close: () => dlg.close(), isOpen: () => dlg.open };
}

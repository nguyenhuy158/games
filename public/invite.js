// Hộp mời vào phòng dùng chung các game: mã QR để quét bằng camera điện thoại + sao chép / chia sẻ link.
import { icon } from './icons.js';
import { toast } from './toast.js';
import { t } from './i18n.js';

const CSS = `
#invite { border: 0; padding: 0; background: none; color: var(--ui-fg); max-width: calc(100vw - 32px); }
#invite::backdrop { background: color-mix(in oklab, var(--ui-bg) 75%, transparent); }
#invite .box { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); box-shadow: var(--ui-shadow-lg); padding: 24px; display: grid; gap: 12px; justify-items: center; width: min(340px, calc(100vw - 32px)); font: inherit; }
#invite h2 { margin: 0; font-size: 18px; }
#invite .code { font-size: 28px; font-weight: 800; letter-spacing: 6px; }
#invite .qr { width: 100%; max-width: 260px; aspect-ratio: 1; }
#invite .qr svg { width: 100%; height: 100%; display: block; }
#invite .link { font-size: 12px; color: var(--ui-fg-muted); word-break: break-all; text-align: center; margin: 0; }
#invite .row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
#invite button { font: inherit; font-size: 14px; font-weight: 600; min-height: 44px; display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: var(--ui-radius); border: 1px solid var(--ui-border); background: var(--ui-surface); color: var(--ui-fg); cursor: pointer; }
#invite button:hover { background: var(--ui-surface-muted); }
#invite button.primary { background: var(--ui-primary); color: var(--ui-primary-fg); border-color: transparent; }
#invite button.primary:hover { background: var(--ui-primary-hover); }
#invite .ic { width: 1.1em; height: 1.1em; }`;

let dlg;
// Thư viện QR (12KB) chỉ tải khi mở hộp mời, không tải sẵn ở mọi trang game.
export async function invite(link, code) {
  const { default: qrcode } = await import('./vendor/qrcode.mjs');
  if (!dlg) {
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }));
    dlg = Object.assign(document.createElement('dialog'), { id: 'invite' });
    // Bấm ra ngoài hộp thì đóng.
    dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); };
    document.body.append(dlg);
  }
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const box = document.createElement('div');
  box.className = 'box';
  box.innerHTML = `<h2>${t('Quét để vào phòng', 'Scan to join')}</h2><div class="qr">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>
    <div class="code"></div><p class="link"></p><div class="row"></div>`;
  box.querySelector('.code').textContent = code;
  box.querySelector('.link').textContent = link;
  const btn = (html, cls, onclick) => Object.assign(document.createElement('button'), { innerHTML: html, className: cls, onclick });
  const row = box.querySelector('.row');
  row.append(btn(`${icon('copy')} ${t('Sao chép link', 'Copy link')}`, 'primary', async () => {
    try { await navigator.clipboard.writeText(link); toast.success(t('Đã sao chép link mời', 'Invite link copied')); } catch { toast(link); }
  }));
  if (navigator.share) row.append(btn(`${icon('share-2')} ${t('Chia sẻ', 'Share')}`, '', () => navigator.share({ title: t(`Vào phòng ${code}`, `Join room ${code}`), url: link }).catch(() => {})));
  row.append(btn(t('Đóng', 'Close'), '', () => dlg.close()));
  dlg.replaceChildren(box);
  dlg.showModal();
}

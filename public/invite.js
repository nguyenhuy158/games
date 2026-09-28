// Hộp mời vào phòng dùng chung các game: mã QR để quét bằng camera điện thoại + sao chép / chia sẻ link.
import qrcode from './vendor/qrcode.mjs';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { t } from './i18n.js';

const CSS = `
#invite { border: 0; padding: 0; background: none; color: #1b1b1b; max-width: calc(100vw - 32px); }
#invite::backdrop { background: #000a; }
#invite .box { background: #fff; border-radius: 20px; padding: 20px; display: grid; gap: 12px; justify-items: center; width: min(340px, calc(100vw - 32px)); font: inherit; }
#invite h2 { margin: 0; font-size: 18px; }
#invite .code { font-size: 28px; font-weight: 800; letter-spacing: 6px; }
#invite .qr { width: 100%; max-width: 260px; aspect-ratio: 1; }
#invite .qr svg { width: 100%; height: 100%; display: block; }
#invite .link { font-size: 12px; color: #666; word-break: break-all; text-align: center; margin: 0; }
#invite .row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
#invite button { font: inherit; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; border: 1px solid #ddd; background: #f4f4f4; color: #1b1b1b; cursor: pointer; }
#invite button.primary { background: #1b1b1b; color: #fff; border-color: #1b1b1b; }
#invite .ic { width: 1.1em; height: 1.1em; }`;

let dlg;
export function invite(link, code) {
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

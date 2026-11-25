import { iconEl } from '../icons.js';
import { t } from '../i18n.js';
import { createToasts, TOAST_TONE } from './feedback.mjs';

export { TOAST_TONE };
export const TOAST_ICON = Object.freeze({
  INFO: 'info',
  SUCCESS: 'circle-check',
  ERROR: 'circle-x',
  WARNING: 'triangle-alert',
  FLAME: 'flame',
  TROPHY: 'trophy',
  BOT: 'bot',
  CROWN: 'crown',
  PARTY: 'party-popper',
  FROWN: 'frown',
  LAYERS: 'layers',
  BOMB: 'bomb',
  FLAG: 'flag',
  VOICE_OFF: 'megaphone-off',
  VOICE: 'megaphone',
  MUSIC: 'music',
  MUTE: 'volume-x',
  TIMER: 'timer',
  PAUSE: 'pause',
  SHUFFLE: 'shuffle',
});
const TONE_ICONS = Object.freeze({
  [TOAST_TONE.INFO]: TOAST_ICON.INFO,
  [TOAST_TONE.SUCCESS]: TOAST_ICON.SUCCESS,
  [TOAST_TONE.ERROR]: TOAST_ICON.ERROR,
  [TOAST_TONE.WARNING]: TOAST_ICON.WARNING,
});

export const notifications = createToasts(document, {
  closeLabel: t('Đóng thông báo', 'Dismiss notification'),
  renderIcon: (name, tone) => iconEl(name || TONE_ICONS[tone]),
});

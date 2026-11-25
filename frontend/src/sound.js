import { store } from './dom.js';

const SOUND_KEY = 'sound';
const SOUND_OFF = '0';
const SOUND_ON = '1';
const SOUND_EVENT = 'sound-change';

export const isSoundOn = () => store.get(SOUND_KEY) !== SOUND_OFF;
export function setSoundOn(on) {
  store.set(SOUND_KEY, on ? SOUND_ON : SOUND_OFF);
  dispatchEvent(new Event(SOUND_EVENT));
}
export const onSoundChange = (fn) => addEventListener(SOUND_EVENT, fn);

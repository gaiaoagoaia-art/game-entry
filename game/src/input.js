// Mouse and keyboard input. The canvas is scaled to the window, so pointer positions are
// converted back into the game's 1280x720 logical coordinates here. Clicks are queued (not
// fired as callbacks) and one-shot key presses become ACTION_* flags, so the main loop takes
// each exactly once and a press between frames is never lost or doubled.

import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SPEED = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const DIGITS = { Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4' };

export function createInput(canvas) {
  const pointer = { x: 0, y: 0, inside: false };
  const clicks = [];
  let actions = 0;
  let digit = null;

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
      y: ((event.clientY - rect.top) / rect.height) * FIELD.height,
    };
  }

  canvas.addEventListener('pointermove', (event) => {
    const p = toLogical(event);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.inside = true;
  });
  canvas.addEventListener('pointerleave', () => {
    pointer.inside = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = toLogical(event);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.inside = true;
    clicks.push(p);
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyF') {
      if (!event.repeat) actions |= ACTION_SPEED;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'KeyR') {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (DIGITS[event.code]) {
      digit = DIGITS[event.code];
    } else return;
    event.preventDefault();
  });

  return {
    pointer,
    /** Every click since the last call, in logical coordinates. */
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
    /** The one-shot key presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last tower hotkey pressed ('1'..'4'), or null. */
    takeDigit() {
      const taken = digit;
      digit = null;
      return taken;
    },
  };
}

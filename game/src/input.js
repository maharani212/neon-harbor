// Keyboard and pointer input for Neon Harbor. Held keys give the car's throttle and
// steering (or the on-foot walk direction); one-shot presses (enter a car, pause,
// confirm, mute) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The mouse aims the gun:
// its world position is recomputed every frame from the camera, so the aim follows
// the view as it scrolls.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);
const HANDBRAKE = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target, toWorld) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let handbrake = false;
  let shooting = false;
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseIn = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (HANDBRAKE.has(event.code)) handbrake = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (HANDBRAKE.has(event.code)) handbrake = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    handbrake = false;
    shooting = false;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseIn = true;
  });
  target.addEventListener('pointerdown', (event) => {
    if (event.button === 0) shooting = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', (event) => {
    if (event.button === 0) shooting = false;
  });
  target.addEventListener('pointerleave', () => {
    mouseIn = false;
    shooting = false;
  });

  return {
    /** The held driving keys, for the world to turn into throttle and steering. */
    keys() {
      return { up, down, left, right, handbrake };
    },
    /** Whether the fire button (mouse) is held. */
    isShooting() {
      return shooting;
    },
    /** The mouse position in world pixels, or null when the pointer never moved. */
    aim() {
      if (!mouseIn || typeof toWorld !== 'function') return null;
      return toWorld(mouseX, mouseY);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

// Neon Harbor — keyboard input.
// One shared object: the game loop reads it, the autopilot can drive it, and
// the HUD never touches it. Keys are tracked by `code` (KeyW, ArrowUp, ...).

export const Input = {
  down: new Set(),
  pressed: new Set(),
  attached: false,

  /** Start listening for keydown / keyup on the window. Safe to call twice. */
  attach() {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.pressed.clear();
    });
  },

  /** True while the key is held. */
  isDown(code) {
    return this.down.has(code);
  },

  /** True only on the frame the key went down (edge-triggered). */
  wasPressed(code) {
    return this.pressed.has(code);
  },

  /** True if any of the given codes is held. */
  anyDown(codes) {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  },

  /** Movement axis from WASD / arrows: { x: -1..1, y: -1..1 }. */
  axis() {
    let x = 0;
    let y = 0;
    if (this.anyDown(['KeyA', 'ArrowLeft'])) x -= 1;
    if (this.anyDown(['KeyD', 'ArrowRight'])) x += 1;
    if (this.anyDown(['KeyW', 'ArrowUp'])) y -= 1;
    if (this.anyDown(['KeyS', 'ArrowDown'])) y += 1;
    return { x, y };
  },

  /** Clear the edge-triggered set; the loop calls this once per frame. */
  endFrame() {
    this.pressed.clear();
  },

  /** Drive the input from code (autopilot): set the held keys for this frame. */
  setVirtual(codes) {
    this.down = new Set(codes);
  },
};

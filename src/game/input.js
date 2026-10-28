/** Keyboard + touch controls, merged into one state the game reads each frame. */
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false };
    this.pressed = new Set(); // one-shot actions this frame
    addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }

  bindTouch(root) {
    for (const el of root.querySelectorAll("[data-hold]")) {
      const k = el.dataset.hold;
      const on = (e) => {
        e.preventDefault();
        this.touch[k] = true;
        el.classList.add("on");
      };
      const off = (e) => {
        e.preventDefault();
        this.touch[k] = false;
        el.classList.remove("on");
      };
      el.addEventListener("pointerdown", on);
      el.addEventListener("pointerup", off);
      el.addEventListener("pointerleave", off);
      el.addEventListener("pointercancel", off);
    }
    for (const el of root.querySelectorAll("[data-tap]")) {
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.pressed.add(el.dataset.tap);
      });
    }
  }

  get steer() {
    const l = this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.touch.left;
    const r = this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.touch.right;
    return (r ? 1 : 0) - (l ? 1 : 0);
  }
  get gas() {
    return this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.touch.gas;
  }
  get brake() {
    return this.keys.has("ArrowDown") || this.keys.has("KeyS") || this.keys.has("Space") || this.touch.brake;
  }

  /** Was an action pressed since last frame? Accepts key codes or touch action names. */
  took(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  endFrame() {
    this.pressed.clear();
  }
}

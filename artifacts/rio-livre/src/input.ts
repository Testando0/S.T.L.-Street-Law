import { clamp } from "./util";

type Action = "interact" | "vehicle" | "jump" | "phone" | "chat" | "map" | "pause" | "sprint";

export class InputManager {
  moveX = 0;
  moveY = 0;
  sprint = false;
  enabled = true;
  onPause?: () => void;
  private keys = new Set<string>();
  private actions = new Set<Action>();
  private lookX = 0;
  private lookY = 0;
  private joystickX = 0;
  private joystickY = 0;
  private joystickPointer: number | null = null;
  private joystickBase?: HTMLElement;
  private joystickKnob?: HTMLElement;
  private joystickCenter = { x: 0, y: 0 };
  private lookPointer: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private sprintToggle = false;
  private touchMode = false;

  constructor() {
    this.touchMode = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    this.bindKeyboard();
    this.bindJoystick();
    this.bindLook();
    this.bindButtons();
  }

  private bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!this.enabled) return;
      const key = e.key.toLowerCase();
      const code = e.code;
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", " "].includes(key)) e.preventDefault();
      if (code === "ShiftLeft" || code === "ShiftRight") this.sprint = true;
      if (key === "e") this.actions.add("interact");
      if (key === "f") this.actions.add("vehicle");
      if (key === " " && !e.repeat) this.actions.add("jump");
      if (key === "tab") {
        e.preventDefault();
        this.actions.add("phone");
      }
      if (key === "t" && !e.repeat) this.actions.add("chat");
      if (key === "m" && !e.repeat) this.actions.add("map");
      if (key === "escape" && !e.repeat) {
        this.onPause?.();
      }
      if (key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright") {
        this.keys.add(key);
      } else {
        this.keys.add(key);
      }
    });
    window.addEventListener("keyup", (e) => {
      const key = e.key.toLowerCase();
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.sprint = false;
      this.keys.delete(key);
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.sprint = false;
      this.actions.clear();
      this.resetJoystick();
    });
  }

  private bindJoystick() {
    this.joystickBase = document.querySelector<HTMLElement>("#joystick-base") ?? undefined;
    this.joystickKnob = document.querySelector<HTMLElement>("#joystick-knob") ?? undefined;
    const base = this.joystickBase;
    if (!base) return;
    const update = (clientX: number, clientY: number) => {
      const dx = clientX - this.joystickCenter.x;
      const dy = clientY - this.joystickCenter.y;
      const max = base.clientWidth * 0.29;
      const len = Math.hypot(dx, dy);
      const nx = len > max ? (dx / len) * max : dx;
      const ny = len > max ? (dy / len) * max : dy;
      const norm = Math.hypot(nx / max, ny / max);
      this.joystickX = clamp(nx / max, -1, 1);
      this.joystickY = clamp(ny / max, -1, 1);
      if (this.joystickKnob) {
        this.joystickKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
        this.joystickKnob.style.background = norm > 0.83
          ? "linear-gradient(145deg, #fff5cf, #ffc54a)"
          : "linear-gradient(145deg, rgba(255,246,223,.9), rgba(240,203,121,.8))";
      }
      if (norm < 0.12) {
        this.joystickX = 0;
        this.joystickY = 0;
      }
    };
    base.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      e.stopPropagation();
      this.joystickPointer = e.pointerId;
      const rect = base.getBoundingClientRect();
      this.joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      base.setPointerCapture(e.pointerId);
      base.classList.add("active");
      update(e.clientX, e.clientY);
    });
    base.addEventListener("pointermove", (e) => {
      if (this.joystickPointer !== e.pointerId) return;
      e.preventDefault();
      update(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (this.joystickPointer !== e.pointerId) return;
      this.joystickPointer = null;
      base.classList.remove("active");
      this.resetJoystick();
      if (base.hasPointerCapture(e.pointerId)) base.releasePointerCapture(e.pointerId);
    };
    base.addEventListener("pointerup", end);
    base.addEventListener("pointercancel", end);
    base.addEventListener("lostpointercapture", () => {
      this.joystickPointer = null;
      this.resetJoystick();
    });
  }

  private resetJoystick() {
    this.joystickX = 0;
    this.joystickY = 0;
    if (this.joystickKnob) this.joystickKnob.style.transform = "translate(-50%, -50%)";
  }

  private bindLook() {
    const canvas = document.querySelector<HTMLCanvasElement>("#scene");
    if (!canvas) return;
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      if (this.lookPointer !== null) return;
      this.lookPointer = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.lookPointer !== e.pointerId) return;
      const dx = e.clientX - this.lastLook.x;
      const dy = e.clientY - this.lastLook.y;
      this.lastLook = { x: e.clientX, y: e.clientY };
      this.lookX += dx;
      this.lookY += dy;
    });
    const end = (e: PointerEvent) => {
      if (this.lookPointer !== e.pointerId) return;
      this.lookPointer = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.lookY += e.deltaY * 0.25;
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private bindButtons() {
    document.querySelectorAll<HTMLElement>("[data-action]").forEach((btn) => {
      btn.addEventListener("pointerdown", (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action as Action;
        if (!action) return;
        if (action === "sprint") {
          this.sprintToggle = !this.sprintToggle;
          this.sprint = this.sprintToggle;
          btn.classList.toggle("active", this.sprintToggle);
          return;
        }
        btn.classList.add("active");
        this.actions.add(action);
      });
      btn.addEventListener("pointerup", () => btn.classList.remove("active"));
      btn.addEventListener("pointercancel", () => btn.classList.remove("active"));
      btn.addEventListener("pointerleave", () => btn.classList.remove("active"));
    });
  }

  update() {
    let x = 0;
    let y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y -= 1;
    const keyboardLength = Math.hypot(x, y);
    if (keyboardLength > 0) {
      x /= keyboardLength;
      y /= keyboardLength;
    }
    if (Math.abs(this.joystickX) > 0.08 || Math.abs(this.joystickY) > 0.08) {
      x = this.joystickX;
      y = -this.joystickY;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      if (len > 0.88 && this.touchMode) this.sprint = true;
      else if (!this.keys.has("shift") && !this.sprintToggle) this.sprint = false;
    } else if (!this.keys.has("shift") && !this.sprintToggle) {
      this.sprint = false;
    }
    this.moveX = x;
    this.moveY = y;
  }

  consumeLook() {
    const out = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  consumeAction(action: Action) {
    if (!this.actions.has(action)) return false;
    this.actions.delete(action);
    return true;
  }

  clearActions() {
    this.actions.clear();
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) {
      this.keys.clear();
      this.moveX = 0;
      this.moveY = 0;
      this.sprint = false;
      this.actions.clear();
      this.resetJoystick();
      this.lookX = 0;
      this.lookY = 0;
    }
  }

  get isTouch() {
    return this.touchMode;
  }

  isActionDown(action: Action) {
    return this.actions.has(action);
  }
}

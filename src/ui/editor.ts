// The layer editor: a grid with a row per pad and a column per 1/16 note.
// Click an empty cell to add a hit, click a hit to remove it, and drag up or
// down (or scroll) on a hit to change its volume.

import type { Pad } from "../kit";
import { BEATS_PER_BAR, type Looper, STEPS_PER_BEAT, offGrid, stepOf } from "../looper/looper";
import { button, h, setText } from "./dom";

export interface EditorHandlers {
  toggle(layerId: number, pad: string, step: number): void;
  velocity(layerId: number, pad: string, step: number, delta: number): void;
  endEdit(): void;
  close(): void;
}

/** Pixels of vertical drag for the full volume range. */
const DRAG_RANGE = 120;
/** Movement below this many pixels is a click, not a drag. */
const DRAG_THRESHOLD = 4;
/** Volume change per wheel notch (deltaY 100). */
const WHEEL_STEP = 0.1;

interface Drag {
  pad: string;
  step: number;
  lastY: number;
  moved: number;
}

export class Editor {
  readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly labels: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly playhead: HTMLElement;
  private cells = new Map<string, HTMLElement>();
  private readonly labelNames = new Map<string, HTMLElement>();
  private steps = 0;
  private drag: Drag | null = null;
  layerId: number | null = null;

  constructor(
    private readonly pads: Pad[],
    private readonly handlers: EditorHandlers,
  ) {
    this.title = h("h2", {});
    this.labels = h("div", { class: "editor-labels" });
    this.playhead = h("span", { class: "editor-playhead" });
    this.grid = h("div", { class: "editor-grid" });
    this.el = h(
      "section",
      { class: "editor", "aria-label": "Layer editor" },
      h(
        "div",
        { class: "editor-head" },
        this.title,
        h("span", { class: "hint" }, "Click to add or remove a hit · drag up/down or scroll on a hit for volume"),
        button("✕", "Close the editor (Esc)", () => this.handlers.close(), "small"),
      ),
      h("div", { class: "editor-body" }, this.labels, h("div", { class: "editor-scroll" }, this.grid)),
    );
    this.el.hidden = true;

    for (const pad of this.pads) {
      const name = h("span", {});
      this.labelNames.set(pad.id, name);
      this.labels.append(h("div", { class: `editor-label row-${pad.row}` }, h("kbd", {}, pad.label), name));
    }

    this.grid.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.grid.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.grid.addEventListener("pointerup", () => this.onPointerUp());
    this.grid.addEventListener("pointercancel", () => this.onPointerUp());
    this.grid.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
  }

  /** Row labels: each pad's current sound name. */
  setNames(names: Map<string, string>): void {
    for (const [padId, el] of this.labelNames) setText(el, names.get(padId) ?? "");
  }

  get open(): boolean {
    return this.layerId !== null;
  }

  show(layerId: number): void {
    this.layerId = layerId;
    this.el.hidden = false;
  }

  hide(): void {
    this.layerId = null;
    this.drag = null;
    this.el.hidden = true;
  }

  /** Redraws the hits of the open layer. Closes the editor if the layer is gone. */
  update(looper: Looper): void {
    if (this.layerId === null) return;
    const layer = looper.layer(this.layerId);
    if (!layer) {
      this.hide();
      return;
    }
    if (this.steps !== looper.loopSteps) this.build(looper.loopSteps);
    setText(this.title, layer.name);

    const filled = new Map<string, { velocity: number; off: number }>();
    for (const hit of layer.hits) {
      const key = `${hit.pad}:${stepOf(hit.beat, this.steps)}`;
      const current = filled.get(key);
      if (!current || hit.velocity > current.velocity) {
        filled.set(key, { velocity: hit.velocity, off: offGrid(hit.beat) });
      }
    }
    for (const [key, cell] of this.cells) {
      const hit = filled.get(key);
      cell.classList.toggle("on", hit !== undefined);
      cell.classList.toggle("off-grid", hit !== undefined && hit.off !== 0);
      if (hit) {
        cell.style.setProperty("--v", hit.velocity.toFixed(2));
        cell.style.setProperty("--off", `${(hit.off * 100).toFixed(0)}%`);
        cell.title = `${Math.round(hit.velocity * 100)}%`;
      } else {
        cell.removeAttribute("title");
      }
    }
  }

  /** Moves the playhead; `fraction` is the position in the loop (0..1), or null when stopped. */
  renderPlayhead(fraction: number | null): void {
    this.playhead.hidden = fraction === null;
    if (fraction !== null) this.playhead.style.left = `${fraction * 100}%`;
  }

  private build(steps: number): void {
    this.steps = steps;
    this.cells.clear();
    this.grid.style.setProperty("--steps", String(steps));
    const stepsPerBar = BEATS_PER_BAR * STEPS_PER_BEAT;
    const cells: HTMLElement[] = [];
    for (const pad of this.pads) {
      for (let step = 0; step < steps; step++) {
        let edge = "";
        if (step % stepsPerBar === 0) edge = " bar";
        else if (step % STEPS_PER_BEAT === 0) edge = " beat";
        const odd = Math.floor(step / STEPS_PER_BEAT) % 2 === 1 ? " odd" : "";
        const cell = h("span", { class: `cell row-${pad.row}${edge}${odd}` });
        cell.dataset.pad = pad.id;
        cell.dataset.step = String(step);
        this.cells.set(`${pad.id}:${step}`, cell);
        cells.push(cell);
      }
    }
    this.grid.replaceChildren(...cells, this.playhead);
  }

  private cellAt(e: Event): { pad: string; step: number; on: boolean } | null {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(".cell");
    if (!cell?.dataset.pad || cell.dataset.step === undefined) return null;
    return { pad: cell.dataset.pad, step: Number(cell.dataset.step), on: cell.classList.contains("on") };
  }

  private onPointerDown(e: PointerEvent): void {
    const cell = this.cellAt(e);
    if (!cell || this.layerId === null) return;
    e.preventDefault();
    if (!cell.on) {
      this.handlers.toggle(this.layerId, cell.pad, cell.step);
      return;
    }
    this.drag = { pad: cell.pad, step: cell.step, lastY: e.clientY, moved: 0 };
    this.grid.setPointerCapture(e.pointerId);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drag || this.layerId === null) return;
    const dy = this.drag.lastY - e.clientY;
    this.drag.moved += Math.abs(dy);
    this.drag.lastY = e.clientY;
    if (this.drag.moved >= DRAG_THRESHOLD && dy !== 0) {
      this.handlers.velocity(this.layerId, this.drag.pad, this.drag.step, dy / DRAG_RANGE);
    }
  }

  private onPointerUp(): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag || this.layerId === null) return;
    if (drag.moved < DRAG_THRESHOLD) this.handlers.toggle(this.layerId, drag.pad, drag.step);
    this.handlers.endEdit();
  }

  private onWheel(e: WheelEvent): void {
    const cell = this.cellAt(e);
    if (!cell?.on || this.layerId === null) return;
    e.preventDefault();
    const notches = Math.max(-3, Math.min(3, -e.deltaY / 100));
    this.handlers.velocity(this.layerId, cell.pad, cell.step, notches * WHEEL_STEP);
  }
}

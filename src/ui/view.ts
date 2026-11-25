// The screen: transport bar, beat display, the 4x4 pads and the key help.
// Built once; `render` runs every animation frame and only touches what changed.

import type { Action } from "../input/keyboard";
import type { Pad } from "../kit";
import { LOOP_BAR_OPTIONS, type LoopBars, type Looper, BEATS_PER_BAR, MAX_BPM, MIN_BPM } from "../looper/looper";

export interface ViewHandlers {
  action(action: Action): void;
  bars(bars: LoopBars): void;
  quantize(): void;
  start(): void;
}

type Attrs = Record<string, string>;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  el.append(...children);
  return el;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** A button that never takes keyboard focus, so Space and Enter keep their looper meaning. */
function button(label: string, title: string, onPress: () => void, className = ""): HTMLButtonElement {
  const el = h("button", { type: "button", title, class: className }, label);
  el.tabIndex = -1;
  el.addEventListener("mousedown", (e) => e.preventDefault());
  el.addEventListener("click", onPress);
  return el;
}

export class View {
  private readonly padEls = new Map<string, HTMLElement>();
  private readonly flashTimers = new Set<number>();
  private readonly overlay: HTMLElement;
  private readonly overlayText: HTMLElement;
  private readonly status: HTMLElement;
  private readonly layers: HTMLElement;
  private readonly bpm: HTMLElement;
  private readonly beats: HTMLElement;
  private beatCells: HTMLElement[] = [];
  private readonly barButtons = new Map<LoopBars, HTMLButtonElement>();
  private readonly metronomeButton: HTMLButtonElement;
  private readonly quantizeButton: HTMLButtonElement;
  private readonly recordButton: HTMLButtonElement;
  private readonly playButton: HTMLButtonElement;

  constructor(root: HTMLElement, rows: Pad[][], handlers: ViewHandlers) {
    const act = (action: Action) => () => handlers.action(action);

    this.bpm = h("output", { class: "bpm-value", "aria-live": "polite" });
    const tempo = h(
      "div",
      { class: "group", "aria-label": "Tempo" },
      button("−", "Slower (↓, Shift+↓ for 10)", act({ type: "tempo", delta: -1 }), "small"),
      h("span", { class: "bpm" }, this.bpm, h("span", { class: "unit" }, "BPM")),
      button("+", "Faster (↑, Shift+↑ for 10)", act({ type: "tempo", delta: 1 }), "small"),
    );

    const barsGroup = h("div", { class: "group segmented", "aria-label": "Loop length" });
    for (const bars of LOOP_BAR_OPTIONS) {
      const el = button(`${bars} bar${bars > 1 ? "s" : ""}`, "Loop length (clear the loop to change it)", () =>
        handlers.bars(bars),
      );
      this.barButtons.set(bars, el);
      barsGroup.append(el);
    }

    this.metronomeButton = button("Metronome", "Metronome on/off (M)", act({ type: "metronome" }), "toggle");
    this.quantizeButton = button("Quantize 1/16", "Snap what you record to 1/16 notes", () => handlers.quantize(), "toggle");

    this.recordButton = button("● Rec", "Record a layer (Space)", act({ type: "record" }), "record");
    this.playButton = button("▶ Play", "Play/stop (Enter)", act({ type: "play" }));
    const transport = h(
      "div",
      { class: "group" },
      this.recordButton,
      this.playButton,
      button("Undo", "Remove the last layer (Backspace)", act({ type: "undo" })),
      button("Clear", "Stop and clear everything (Esc)", act({ type: "clear" })),
    );

    this.status = h("span", { class: "status" });
    this.layers = h("span", { class: "layers" });
    this.beats = h("div", { class: "beats", "aria-hidden": "true" });

    const grid = h("div", { class: "pads" });
    for (const row of rows) {
      for (const pad of row) {
        const el = h(
          "div",
          { class: `pad row-${pad.row}`, role: "button", "aria-label": `${pad.name} (${pad.label})` },
          h("span", { class: "key" }, pad.label),
          h("span", { class: "name" }, pad.name),
        );
        el.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          handlers.action({ type: "pad", padId: pad.id });
        });
        this.padEls.set(pad.id, el);
        grid.append(el);
      }
    }

    const keys: [string, string][] = [
      ["Space", "record / keep layer"],
      ["Enter", "play / stop"],
      ["Backspace", "undo layer"],
      ["Esc", "clear all"],
      ["M", "metronome"],
      ["↑ ↓", "tempo (Shift: ±10)"],
    ];
    const help = h(
      "ul",
      { class: "help" },
      ...keys.map(([key, what]) => h("li", {}, h("kbd", {}, key), ` ${what}`)),
    );

    this.overlayText = h("p", {}, "Press any key or click to start");
    this.overlay = h(
      "div",
      { class: "overlay" },
      h("div", { class: "overlay-card" }, h("h2", {}, "keyjam"), this.overlayText),
    );
    this.overlay.addEventListener("pointerdown", () => handlers.start());

    root.append(
      h(
        "main",
        { class: "app" },
        h("header", {}, h("h1", {}, "keyjam"), h("span", { class: "tagline" }, "drums on your keyboard")),
        h("section", { class: "controls" }, tempo, barsGroup, h("div", { class: "group" }, this.metronomeButton, this.quantizeButton), transport),
        h("section", { class: "timeline" }, h("div", { class: "timeline-info" }, this.status, this.layers), this.beats),
        grid,
        help,
      ),
      this.overlay,
    );
  }

  showOverlay(text: string): void {
    setText(this.overlayText, text);
    this.overlay.hidden = false;
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
  }

  markUnavailable(padIds: string[]): void {
    for (const id of padIds) {
      const el = this.padEls.get(id);
      if (el) {
        el.classList.add("unavailable");
        el.title = "This sound couldn't be loaded";
      }
    }
  }

  /** Lights up a pad now, or after `delayMs` (for sounds the loop plays). */
  flash(padId: string, delayMs = 0): void {
    const el = this.padEls.get(padId);
    if (!el) return;
    const light = () => {
      el.classList.remove("hit");
      void el.offsetWidth; // restart the animation
      el.classList.add("hit");
    };
    if (delayMs <= 0) return light();
    const timer = window.setTimeout(() => {
      this.flashTimers.delete(timer);
      light();
    }, delayMs);
    this.flashTimers.add(timer);
  }

  /** Drops flashes booked for loop sounds that were cancelled. */
  cancelFlashes(): void {
    for (const timer of this.flashTimers) clearTimeout(timer);
    this.flashTimers.clear();
  }

  render(looper: Looper, now: number): void {
    setText(this.bpm, String(looper.bpm));
    this.bpm.title = `${MIN_BPM}–${MAX_BPM} BPM`;

    for (const [bars, el] of this.barButtons) {
      el.classList.toggle("on", looper.bars === bars);
      el.disabled = !looper.canChangeBars && looper.bars !== bars;
    }
    this.metronomeButton.classList.toggle("on", looper.metronome);
    this.quantizeButton.classList.toggle("on", looper.quantize);
    this.recordButton.classList.toggle("on", looper.recording);
    setText(this.playButton, looper.running ? "■ Stop" : "▶ Play");

    const count = looper.layerCount;
    setText(this.layers, count === 0 ? "No layers yet" : `${count} layer${count > 1 ? "s" : ""}`);

    if (this.beatCells.length !== looper.loopBeats) this.buildBeats(looper.loopBeats);
    const position = looper.position(now);
    const current = position?.kind === "loop" ? Math.floor(position.beat) : -1;
    this.beatCells.forEach((cell, i) => cell.classList.toggle("now", i === current));
    this.beats.classList.toggle("recording", looper.recording);

    let status = "Stopped";
    if (position?.kind === "countIn") status = `Count-in ${position.beatsLeft}`;
    else if (looper.recording) status = "● Recording";
    else if (looper.running) status = "▶ Playing";
    setText(this.status, status);
    this.status.dataset.state = position?.kind === "countIn" ? "count-in" : looper.recording ? "recording" : looper.running ? "playing" : "stopped";
  }

  private buildBeats(count: number): void {
    this.beatCells = Array.from({ length: count }, (_, i) =>
      h("span", { class: i % BEATS_PER_BAR === 0 ? "beat bar-start" : "beat" }, String((i % BEATS_PER_BAR) + 1)),
    );
    this.beats.replaceChildren(...this.beatCells);
  }
}

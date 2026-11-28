// The screen: transport bar, beat display, the 4x4 pads, the Layers side
// bar, the layer editor and the key help. Built once; `render` runs every
// animation frame and only touches what changed. On a phone held upright the
// play controls, beat display and pads fill the screen, and the rest is below.

import { HIGH_LATENCY, MAX_OFFSET_MS, MIN_OFFSET_MS } from "../audio/latency";
import type { Action } from "../input/keyboard";
import type { Kit, Pad } from "../kit";
import { SAMPLE_BY_ID, variantLabel } from "../library";
import { LOOP_BAR_OPTIONS, type LoopBars, type Looper, BEATS_PER_BAR, MAX_BPM, MIN_BPM } from "../looper/looper";
import { button, h, keysOrTouch, setText } from "./dom";
import { Editor, type EditorHandlers } from "./editor";
import { type LayerHandlers, LayersPanel } from "./layers";
import { type SoundHandlers, SoundPanel } from "./sound";

/** Screens this narrow get the phone layout. */
const PHONE = "(max-width: 600px)";

/** The parts of the screen that sit in different places on a phone. */
interface Parts {
  main: HTMLElement;
  header: HTMLElement;
  controls: HTMLElement;
  tempo: HTMLElement;
  bars: HTMLElement;
  toggles: HTMLElement;
  transport: HTMLElement;
  undo: HTMLElement;
  clear: HTMLElement;
  timeline: HTMLElement;
  pads: HTMLElement;
  side: HTMLElement;
  help: HTMLElement;
  audio: HTMLElement;
}

export interface ViewHandlers {
  /** `pressedAt` is when the pad was tapped (performance.now() clock), if known. */
  action(action: Action, pressedAt?: number): void;
  bars(bars: LoopBars): void;
  quantize(): void;
  offset(ms: number): void;
  start(): void;
  layer: Omit<LayerHandlers, "open">;
  editor: Omit<EditorHandlers, "close">;
  /** Selects a pad to change its sound (Shift+key, clicking its name, or its ✎ on a touch screen). */
  select(padId: string): void;
  sound: SoundHandlers;
}

export class View {
  private readonly padEls = new Map<string, HTMLElement>();
  private readonly padNames = new Map<string, { name: HTMLElement; variant: HTMLElement }>();
  private readonly soundPanel: SoundPanel;
  private readonly flashTimers = new Set<number>();
  private readonly overlay: HTMLElement;
  private readonly overlayText: HTMLElement;
  private readonly status: HTMLElement;
  private readonly layerCount: HTMLElement;
  private readonly panel: LayersPanel;
  private readonly editor: Editor;
  private readonly bpm: HTMLElement;
  private readonly beats: HTMLElement;
  private beatCells: HTMLElement[] = [];
  private readonly barButtons = new Map<LoopBars, HTMLButtonElement>();
  private readonly metronomeButton: HTMLButtonElement;
  private readonly quantizeButton: HTMLButtonElement;
  private readonly recordButton: HTMLButtonElement;
  private readonly playButton: HTMLButtonElement;
  private readonly latency: HTMLElement;
  private readonly latencyHint: HTMLElement;
  private readonly offsetInput: HTMLInputElement;
  private readonly offsetValue: HTMLElement;
  private readonly parts: Parts;

  constructor(
    root: HTMLElement,
    rows: Pad[][],
    handlers: ViewHandlers,
    private readonly onLayersChanged: () => void,
  ) {
    const act = (action: Action) => () => handlers.action(action);
    this.panel = new LayersPanel({
      ...handlers.layer,
      open: (id) => {
        this.editor.show(id);
        this.onLayersChanged();
      },
    });
    this.soundPanel = new SoundPanel(handlers.sound);
    this.editor = new Editor(rows.flat(), {
      ...handlers.editor,
      close: () => this.closeEditor(),
    });

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
    const undo = button("Undo", "Undo the last change (Ctrl+Z)", act({ type: "undo" }));
    const clear = button("Clear", "Stop and clear everything (Esc)", act({ type: "clear" }));

    this.status = h("span", { class: "status" });
    this.layerCount = h("span", { class: "layers" });
    this.beats = h("div", { class: "beats", "aria-hidden": "true" });

    const grid = h("div", { class: "pads" });
    for (const row of rows) {
      for (const pad of row) {
        const name = h("span", { class: "name", title: "Change this sound (Shift+key)" });
        const variant = h("span", { class: "variant" });
        const el = h(
          "div",
          { class: `pad row-${pad.row}`, role: "button" },
          h("span", { class: "key keys-only" }, pad.label),
          h("span", { class: "pad-sound" }, name, variant),
          button("✎", "Change this sound", () => handlers.select(pad.id), "pad-edit touch-only"),
        );
        el.addEventListener("pointerdown", (e) => {
          const target = e.target as HTMLElement;
          if (target.closest(".pad-edit")) return; // the ✎ button selects the pad itself
          e.preventDefault();
          // With a mouse, clicking the sound's name selects the pad. A tap anywhere plays it.
          if (e.pointerType === "mouse" && target.closest(".pad-sound")) handlers.select(pad.id);
          else handlers.action({ type: "pad", padId: pad.id }, e.timeStamp);
        });
        // No menu or text selection when a finger stays on a pad.
        el.addEventListener("contextmenu", (e) => e.preventDefault());
        this.padNames.set(pad.id, { name, variant });
        this.padEls.set(pad.id, el);
        grid.append(el);
      }
    }

    const keys: [string, string][] = [
      ["Space", "record / keep layer"],
      ["Enter", "play / stop"],
      ["Backspace", "remove last layer"],
      ["Ctrl+Z", "undo"],
      ["Esc", "close editor / clear all"],
      ["M", "metronome"],
      ["↑ ↓", "tempo (Shift: ±10)"],
    ];
    const help = h(
      "ul",
      { class: "help keys-only" },
      ...keys.map(([key, what]) => h("li", {}, h("kbd", {}, key), ` ${what}`)),
    );

    this.latency = h("span", { class: "latency" });
    this.latencyHint = h(
      "span",
      { class: "latency-hint" },
      "High latency: wired headphones or speakers react much faster than Bluetooth.",
    );
    this.offsetInput = h("input", {
      type: "range",
      min: String(MIN_OFFSET_MS),
      max: String(MAX_OFFSET_MS),
      step: "1",
      "aria-label": "Latency offset",
    });
    // Keep keyboard focus off the slider, so the arrow keys keep changing the tempo.
    this.offsetInput.tabIndex = -1;
    this.offsetInput.addEventListener("input", () => handlers.offset(Number(this.offsetInput.value)));
    this.offsetInput.addEventListener("change", () => this.offsetInput.blur());
    this.offsetValue = h("output", { class: "offset-value" });
    const audio = h(
      "section",
      { class: "audio" },
      this.latency,
      h(
        "label",
        {
          class: "offset",
          title: "Recorded hits land late? Move right. Early? Move left.",
        },
        "Latency offset",
        this.offsetInput,
        this.offsetValue,
      ),
      this.latencyHint,
    );

    this.overlayText = h("p", {}, ...keysOrTouch("Press any key or click to start", "Tap to start"));
    this.overlay = h(
      "div",
      { class: "overlay" },
      h("div", { class: "overlay-card" }, h("h2", {}, "keyjam"), this.overlayText),
    );
    // On a click, not a press: on touch screens only the end of a tap allows sound to start.
    this.overlay.addEventListener("click", () => handlers.start());

    this.parts = {
      main: h("main", { class: "app" }),
      header: h("header", {}, h("h1", {}, "keyjam"), h("span", { class: "tagline keys-only" }, "drums on your keyboard")),
      controls: h("section", { class: "controls" }),
      tempo,
      bars: barsGroup,
      toggles: h("div", { class: "group" }),
      transport: h("div", { class: "group transport" }),
      undo,
      clear,
      timeline: h("section", { class: "timeline" }, h("div", { class: "timeline-info" }, this.status, this.layerCount), this.beats),
      pads: grid,
      side: h("div", { class: "side" }, this.soundPanel.el, this.panel.el),
      help,
      audio,
    };
    const phone = window.matchMedia(PHONE);
    this.place(phone.matches);
    phone.addEventListener("change", (e) => this.place(e.matches));
    root.append(this.parts.main, this.overlay);
  }

  /** Puts the parts of the screen in place, for a phone or a wider screen. */
  private place(phone: boolean): void {
    const p = this.parts;
    p.main.classList.toggle("phone", phone);
    if (phone) {
      // The play controls, beat display and pads fill the screen; the rest is below.
      p.toggles.replaceChildren(this.metronomeButton);
      p.transport.replaceChildren(this.recordButton, this.playButton, p.undo);
      p.controls.replaceChildren(p.tempo, p.toggles, p.transport);
      p.main.replaceChildren(
        h("div", { class: "stage" }, p.header, p.controls, p.timeline, p.pads),
        h("section", { class: "more" }, p.bars, this.quantizeButton, p.clear),
        p.side,
        this.editor.el,
        p.help,
        p.audio,
      );
    } else {
      p.toggles.replaceChildren(this.metronomeButton, this.quantizeButton);
      p.transport.replaceChildren(this.recordButton, this.playButton, p.undo, p.clear);
      p.controls.replaceChildren(p.tempo, p.bars, p.toggles, p.transport);
      p.main.replaceChildren(
        p.header,
        p.controls,
        h("div", { class: "workspace" }, h("div", { class: "play-area" }, p.timeline, p.pads), p.side),
        this.editor.el,
        p.help,
        p.audio,
      );
    }
  }

  get editorOpen(): boolean {
    return this.editor.open;
  }

  closeEditor(): void {
    this.editor.hide();
    this.onLayersChanged();
  }

  /** Redraws the side bar and the editor. Call after anything about the layers changed. */
  updateLayers(looper: Looper): void {
    this.editor.update(looper);
    this.panel.update(looper, this.editor.layerId);
  }

  showOverlay(text: string): void {
    setText(this.overlayText, text);
    this.overlay.hidden = false;
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
  }

  /** Pads whose sound couldn't be loaded are greyed out. */
  markUnavailable(padIds: string[]): void {
    for (const [id, el] of this.padEls) {
      const unavailable = padIds.includes(id);
      el.classList.toggle("unavailable", unavailable);
      el.title = unavailable ? "This sound couldn't be loaded" : "";
    }
  }

  /** Shows the kit: each pad's sound name, the selected pad, and the Sound block. */
  showKit(kit: Kit, selected: string | null): void {
    const names = new Map<string, string>();
    for (const [padId, { name, variant }] of this.padNames) {
      const sample = SAMPLE_BY_ID.get(kit[padId].sample);
      const padName = sample?.family.name ?? kit[padId].sample;
      names.set(padId, padName);
      setText(name, padName);
      setText(variant, sample ? variantLabel(sample) : "");
      this.padEls.get(padId)?.classList.toggle("selected", padId === selected);
      this.padEls.get(padId)?.setAttribute("aria-label", padName);
    }
    this.editor.setNames(names);
    this.soundPanel.update(kit, selected);
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

  /** Shows the latency the browser reports (seconds) and the player's offset (ms). */
  renderAudio(latency: number, offsetMs: number): void {
    setText(this.latency, `Latency ${Math.round(latency * 1000)} ms`);
    this.latencyHint.hidden = latency <= HIGH_LATENCY;
    if (document.activeElement !== this.offsetInput) this.offsetInput.value = String(offsetMs);
    setText(this.offsetValue, `${offsetMs > 0 ? "+" : ""}${offsetMs} ms`);
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
    setText(this.layerCount, count === 0 ? "No layers yet" : `${count} layer${count > 1 ? "s" : ""}`);

    if (this.beatCells.length !== looper.loopBeats) this.buildBeats(looper.loopBeats);
    const position = looper.position(now);
    const current = position?.kind === "loop" ? Math.floor(position.beat) : -1;
    const fraction = position?.kind === "loop" ? position.beat / looper.loopBeats : null;
    this.panel.renderPlayhead(fraction);
    this.editor.renderPlayhead(fraction);
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

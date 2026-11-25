// The Layers side bar: a card per layer with a mini timeline of its hits and
// mute, solo and delete buttons. Clicking a card opens it in the editor.

import { PAD_BY_ID, type PadRow } from "../kit";
import type { Hit, Looper } from "../looper/looper";
import { button, h } from "./dom";

export interface LayerHandlers {
  mute(id: number): void;
  solo(id: number): void;
  remove(id: number): void;
  open(id: number): void;
}

/** Lanes in the mini timeline, top to bottom, matching the pad rows. */
const LANES: PadRow[] = ["fx", "hats", "toms", "core"];

function miniTimeline(hits: readonly Hit[], loopBeats: number): { el: HTMLElement; playhead: HTMLElement } {
  const playhead = h("span", { class: "mini-playhead" });
  const el = h("div", { class: "mini", "aria-hidden": "true" });
  for (const hit of hits) {
    const pad = PAD_BY_ID.get(hit.pad);
    if (!pad) continue;
    const dot = h("span", { class: `dot row-${pad.row}` });
    dot.style.left = `${(hit.beat / loopBeats) * 100}%`;
    dot.style.top = `${((LANES.indexOf(pad.row) + 0.5) / LANES.length) * 100}%`;
    dot.style.opacity = String(0.35 + 0.65 * hit.velocity);
    el.append(dot);
  }
  el.append(playhead);
  return { el, playhead };
}

export class LayersPanel {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly count: HTMLElement;
  private playheads: HTMLElement[] = [];

  constructor(private readonly handlers: LayerHandlers) {
    this.count = h("span", { class: "count" });
    this.list = h("div", { class: "layer-list" });
    this.el = h(
      "aside",
      { class: "layers-panel", "aria-label": "Layers" },
      h("h2", {}, "Layers ", this.count),
      this.list,
    );
  }

  /** Rebuilds the cards. Call after anything about the layers changed. */
  update(looper: Looper, editingId: number | null): void {
    const cards: HTMLElement[] = [];
    this.playheads = [];

    for (const layer of looper.layers) {
      const { el: mini, playhead } = miniTimeline(layer.hits, looper.loopBeats);
      this.playheads.push(playhead);
      const audible = looper.audible(layer);
      const card = h(
        "div",
        {
          class: `layer-card${layer.id === editingId ? " editing" : ""}${audible ? "" : " silent"}`,
          role: "button",
          title: "Edit this layer",
        },
        h(
          "div",
          { class: "layer-top" },
          h("span", { class: "layer-name" }, layer.name),
          h(
            "span",
            { class: "layer-buttons" },
            button("M", "Mute", () => this.handlers.mute(layer.id), `small mute${layer.muted ? " on" : ""}`),
            button("S", "Solo", () => this.handlers.solo(layer.id), `small solo${layer.soloed ? " on" : ""}`),
            button("✕", "Delete layer (Ctrl+Z brings it back)", () => this.handlers.remove(layer.id), "small"),
          ),
        ),
        mini,
      );
      card.addEventListener("click", () => this.handlers.open(layer.id));
      cards.push(card);
    }

    const take = looper.takeHits;
    if (take !== null) {
      const { el: mini, playhead } = miniTimeline(take, looper.loopBeats);
      this.playheads.push(playhead);
      cards.push(
        h(
          "div",
          { class: "layer-card take" },
          h("div", { class: "layer-top" }, h("span", { class: "layer-name" }, "● Recording")),
          mini,
        ),
      );
    }

    if (cards.length === 0) {
      cards.push(h("p", { class: "empty" }, "No layers yet. Press Space to record one."));
    }
    this.count.textContent = looper.layerCount > 0 ? String(looper.layerCount) : "";
    this.list.replaceChildren(...cards);
  }

  /** Moves the playheads; `fraction` is the position in the loop (0..1), or null when stopped. */
  renderPlayhead(fraction: number | null): void {
    for (const playhead of this.playheads) {
      playhead.hidden = fraction === null;
      if (fraction !== null) playhead.style.left = `${fraction * 100}%`;
    }
  }
}

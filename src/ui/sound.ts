// The Sound block in the side bar: pick a sample for the selected pad and
// shape it with Pitch, Tone, Length and Volume. Samples are grouped by type;
// sounds sampled at several knob positions show them as a grid of buttons.

import { DEFAULT_KIT, type Kit, PAD_BY_ID } from "../kit";
import { FAMILIES, type Family, GROUPS, type GroupId, KNOB_POSITIONS, SAMPLE_BY_ID, type Sample, sampleLabel } from "../library";
import { MIN_LENGTH, PITCH_RANGE, type SoundSettings } from "../sound";
import { button, h, keysOrTouch, setText } from "./dom";

export type Param = "pitch" | "tone" | "length" | "volume";

export interface SoundHandlers {
  choose(padId: string, sampleId: string): void;
  set(padId: string, param: Param, value: number): void;
  reset(): void;
}

interface Slider {
  param: Param;
  input: HTMLInputElement;
  value: HTMLElement;
  /** Slider position → setting, and back. */
  toSetting(position: number): number;
  toPosition(setting: number): number;
  format(setting: number): string;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

export class SoundPanel {
  readonly el: HTMLElement;
  private readonly padName: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly body: HTMLElement;
  private readonly chips = new Map<GroupId, HTMLButtonElement>();
  private readonly variants: HTMLElement;
  private readonly sliders: Slider[];
  private padId: string | null = null;
  /** Variant buttons by sample id, to mark the current one. */
  private sampleButtons = new Map<string, HTMLButtonElement>();

  constructor(private readonly handlers: SoundHandlers) {
    this.padName = h("span", { class: "sound-pad" });
    this.empty = h(
      "p",
      { class: "empty" },
      ...keysOrTouch("Press Shift + a pad's key, or click its name, to change its sound.", "Tap ✎ on a pad to change its sound."),
    );

    const chipRow = h("div", { class: "chips" });
    for (const group of GROUPS) {
      const chip = button(group.name, `${group.name} sounds`, () => this.showGroup(group.id), "chip");
      this.chips.set(group.id, chip);
      chipRow.append(chip);
    }
    this.variants = h("div", { class: "variants" });

    this.sliders = [
      this.slider("pitch", "Pitch", -PITCH_RANGE, PITCH_RANGE, (p) => p, (s) => s, (s) => `${s > 0 ? "+" : ""}${s} st`),
      this.slider("tone", "Tone", 0, 100, (p) => p / 100, (s) => s * 100, percent),
      this.slider("length", "Length", MIN_LENGTH * 100, 100, (p) => p / 100, (s) => s * 100, percent),
      this.slider("volume", "Volume", 0, 100, (p) => p / 100, (s) => s * 100, percent),
    ];

    this.body = h(
      "div",
      { class: "sound-body" },
      chipRow,
      this.variants,
      h("div", { class: "sliders" }, ...this.sliders.map((s) => s.input.parentElement!)),
    );

    this.el = h(
      "section",
      { class: "sound-panel", "aria-label": "Sound" },
      h(
        "div",
        { class: "sound-head" },
        h("h2", {}, "Sound"),
        this.padName,
        button("Reset kit", "Put every pad back to its default sound", () => this.handlers.reset(), "small-text"),
      ),
      this.empty,
      this.body,
    );
  }

  /** Shows the selected pad's sound. Rebuilds the sample picker only when the pad changes. */
  update(kit: Kit, padId: string | null): void {
    this.empty.hidden = padId !== null;
    this.body.hidden = padId === null;
    const pad = padId ? PAD_BY_ID.get(padId) : undefined;
    if (!padId || !pad) {
      this.padId = null;
      setText(this.padName, "");
      return;
    }
    const sound = kit[padId];
    const sample = SAMPLE_BY_ID.get(sound.sample);
    setText(this.padName, `${pad.label} · ${sample ? sampleLabel(sample) : sound.sample}`);

    if (padId !== this.padId) {
      this.padId = padId;
      this.showGroup(sample?.family.group ?? "kick");
    }
    for (const [id, el] of this.sampleButtons) el.classList.toggle("on", id === sound.sample);

    for (const slider of this.sliders) {
      const setting = sound[slider.param];
      if (document.activeElement !== slider.input) slider.input.value = String(slider.toPosition(setting));
      setText(slider.value, slider.format(setting));
    }
  }

  private showGroup(group: GroupId): void {
    for (const [id, chip] of this.chips) chip.classList.toggle("on", id === group);
    this.sampleButtons = new Map();
    const families = FAMILIES.filter((f) => f.group === group).map((f) => this.familyPicker(f));
    this.variants.replaceChildren(...families);
  }

  private sampleButton(sample: Sample, label: string): HTMLButtonElement {
    const el = button(label, sampleLabel(sample), () => {
      if (this.padId) this.handlers.choose(this.padId, sample.id);
    }, "variant");
    this.sampleButtons.set(sample.id, el);
    return el;
  }

  private familyPicker(family: Family): HTMLElement {
    const samples = [...SAMPLE_BY_ID.values()].filter((s) => s.family === family);
    const values = KNOB_POSITIONS.map(([, value]) => String(value));

    if (family.knobs.length === 0) {
      return h("div", { class: "family single" }, this.sampleButton(samples[0], family.name));
    }

    if (family.knobs.length === 1) {
      return h(
        "div",
        { class: "family" },
        h("div", { class: "family-name" }, `${family.name} `, h("span", {}, family.knobs[0])),
        h("div", { class: "knob-row" }, ...samples.map((s) => this.sampleButton(s, String(s.knobs[0])))),
      );
    }

    // Two knobs: rows are the first knob, columns the second.
    const [rowKnob, colKnob] = family.knobs;
    const grid = h("div", { class: "knob-grid" }, h("span", { class: "corner" }), ...values.map((v) => h("span", { class: "axis" }, v)));
    for (const [rowCode, rowValue] of KNOB_POSITIONS) {
      grid.append(h("span", { class: "axis" }, String(rowValue)));
      for (const [colCode] of KNOB_POSITIONS) {
        const sample = SAMPLE_BY_ID.get(family.code + rowCode + colCode);
        if (sample) grid.append(this.sampleButton(sample, ""));
      }
    }
    return h(
      "div",
      { class: "family" },
      h("div", { class: "family-name" }, `${family.name} `, h("span", {}, `${rowKnob} ↓ · ${colKnob} →`)),
      grid,
    );
  }

  private slider(
    param: Param,
    label: string,
    min: number,
    max: number,
    toSetting: (position: number) => number,
    toPosition: (setting: number) => number,
    format: (setting: number) => string,
  ): Slider {
    const input = h("input", { type: "range", min: String(min), max: String(max), step: "1", "aria-label": label });
    // Keep keyboard focus off the slider, so the keys keep playing pads.
    input.tabIndex = -1;
    const value = h("output", { class: "slider-value" });
    h("label", { class: "slider", title: "Double-click to reset" }, h("span", { class: "slider-label" }, label), input, value);
    const slider: Slider = { param, input, value, toSetting, toPosition, format };
    input.addEventListener("input", () => {
      if (this.padId) this.handlers.set(this.padId, param, toSetting(Number(input.value)));
    });
    input.addEventListener("change", () => input.blur());
    input.addEventListener("dblclick", () => {
      if (!this.padId) return;
      const fallback: SoundSettings = DEFAULT_KIT[this.padId];
      input.blur();
      this.handlers.set(this.padId, param, fallback[param]);
    });
    return slider;
  }
}

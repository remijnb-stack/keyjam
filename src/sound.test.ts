import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_KIT, PADS } from "./kit";
import { GROUPS, SAMPLES, SAMPLE_BY_ID, sampleLabel } from "./library";
import { cleanSettings, cutoffHz, lengthEnvelope, playbackRate } from "./sound";

describe("library", () => {
  it("has all 116 samples of the TR-808 set, each with its file", () => {
    expect(SAMPLES).toHaveLength(116);
    for (const sample of SAMPLES) {
      expect(existsSync(join("public/samples/808", sample.file)), sample.file).toBe(true);
    }
  });

  it("names variants after the knobs on the machine", () => {
    expect(sampleLabel(SAMPLE_BY_ID.get("BD2575")!)).toBe("Kick · tone 2.5 · decay 7.5");
    expect(sampleLabel(SAMPLE_BY_ID.get("SD1000")!)).toBe("Snare · tone 10 · snappy 0");
    expect(sampleLabel(SAMPLE_BY_ID.get("LT50")!)).toBe("Tom low · tuning 5");
    expect(sampleLabel(SAMPLE_BY_ID.get("CP")!)).toBe("Clap");
  });

  it("puts every sample in a group the picker shows", () => {
    const groups = new Set(GROUPS.map((g) => g.id));
    for (const sample of SAMPLES) expect(groups.has(sample.family.group)).toBe(true);
  });
});

describe("default kit", () => {
  it("gives every pad a sound from the library", () => {
    for (const pad of PADS) expect(SAMPLE_BY_ID.has(DEFAULT_KIT[pad.id].sample), pad.id).toBe(true);
  });
});

describe("sound settings", () => {
  it("keeps values in range", () => {
    expect(cleanSettings({ sample: "CP", pitch: 30, tone: 2, length: 0, volume: -1 })).toEqual({
      sample: "CP",
      pitch: 12,
      tone: 1,
      length: 0.05,
      volume: 0,
    });
  });

  it("rejects a sample that doesn't exist", () => {
    expect(cleanSettings({ sample: "XX", pitch: 0, tone: 1, length: 1, volume: 1 })).toBeNull();
  });

  it("shifts pitch by playback speed: an octave doubles it", () => {
    expect(playbackRate(0)).toBe(1);
    expect(playbackRate(12)).toBe(2);
    expect(playbackRate(-12)).toBe(0.5);
  });

  it("maps tone from 100 Hz to 20 kHz", () => {
    expect(cutoffHz(0)).toBe(100);
    expect(cutoffHz(1)).toBeCloseTo(20000);
    expect(cutoffHz(0.5)).toBeCloseTo(1414, 0);
  });

  it("shortens a sound, taking its pitch into account", () => {
    expect(lengthEnvelope(1, 1, 1)).toBeNull();
    expect(lengthEnvelope(1, 1, 0.5)).toEqual({ fadeAt: 0.3, stopAt: 0.5 });
    // An octave down plays twice as long, so half its length is a full second.
    expect(lengthEnvelope(1, 0.5, 0.5)?.stopAt).toBe(1);
  });
});

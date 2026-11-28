import { describe, expect, it } from "vitest";
import { LiveTiming } from "./liveTiming";

const STAMP = { contextTime: 5, performanceTime: 1000 };
const LATENCY = 0.01;

/** Presses that each need `needed` seconds before they could sound; returns how long after the press each one sounds. */
function play(timing: LiveTiming, needed: number[], latency = LATENCY): number[] {
  return needed.map((n, i) => {
    const pressed = 6 + i * 0.25; // on the audio clock
    const pressedAt = STAMP.performanceTime + (pressed - STAMP.contextTime) * 1000;
    return timing.timeFor(pressedAt, pressed + n, STAMP, latency) - pressed;
  });
}

describe("LiveTiming", () => {
  it("plays the first press almost at once", () => {
    const [delay] = play(new LiveTiming(), [0.015]);
    expect(delay).toBeCloseTo(0.017);
  });

  it("plays presses a steady time after them, however long each took to handle", () => {
    const timing = new LiveTiming();
    play(timing, [0.028, 0.025, 0.012, 0.02]);
    const delays = play(timing, [0.011, 0.019, 0.024, 0.013]);
    for (const delay of delays) expect(delay).toBeCloseTo(0.027);
  });

  it("doesn't slow down the presses after one hiccup", () => {
    const timing = new LiveTiming();
    play(timing, [0.015, 0.015, 0.015, 0.015]);
    const [hiccup, next] = play(timing, [0.08, 0.015]);
    expect(hiccup).toBeCloseTo(0.08); // as soon as it can
    expect(next).toBeCloseTo(0.017);
  });

  it("never waits more than 40 ms beyond the output latency", () => {
    const timing = new LiveTiming();
    play(timing, [0.2, 0.2, 0.2]);
    const [delay] = play(timing, [0.015]);
    expect(delay).toBeCloseTo(0.05);
  });

  it("plays at once while the audio clock isn't linked to the page clock yet", () => {
    expect(new LiveTiming().timeFor(1234, 7, { contextTime: 0, performanceTime: 0 }, LATENCY)).toBe(7);
  });
});

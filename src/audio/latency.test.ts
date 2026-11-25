import { describe, expect, it } from "vitest";
import { clampOffset, heardTime } from "./latency";
import { softClipCurve } from "./softClip";

describe("heardTime", () => {
  it("steps back by the output latency", () => {
    expect(heardTime({ now: 10, handlerDelay: 0, latency: 0.2, offsetMs: 0 })).toBeCloseTo(9.8);
  });

  it("also steps back by the time the key press waited to be handled", () => {
    expect(heardTime({ now: 10, handlerDelay: 0.01, latency: 0.02, offsetMs: 0 })).toBeCloseTo(9.97);
  });

  it("adds the player's offset; positive moves hits earlier", () => {
    expect(heardTime({ now: 10, handlerDelay: 0, latency: 0.02, offsetMs: 30 })).toBeCloseTo(9.95);
    expect(heardTime({ now: 10, handlerDelay: 0, latency: 0.02, offsetMs: -10 })).toBeCloseTo(9.99);
  });

  it("never moves a hit later than the key press", () => {
    expect(heardTime({ now: 10, handlerDelay: 0, latency: 0.02, offsetMs: -100 })).toBe(10);
  });

  it("ignores a stalled handler beyond 100 ms", () => {
    expect(heardTime({ now: 10, handlerDelay: 2, latency: 0, offsetMs: 0 })).toBeCloseTo(9.9);
  });
});

describe("clampOffset", () => {
  it("keeps the offset within ±100 ms, in whole milliseconds", () => {
    expect(clampOffset(250)).toBe(100);
    expect(clampOffset(-250)).toBe(-100);
    expect(clampOffset(12.4)).toBe(12);
  });
});

describe("softClipCurve", () => {
  const size = 2049; // odd, so the middle sample is exactly 0
  const range = 2;
  const curve = softClipCurve(size, range, 0.7);
  const at = (x: number) => curve[Math.round(((x / range + 1) / 2) * (size - 1))];

  it("leaves quiet sounds untouched", () => {
    expect(at(0)).toBeCloseTo(0);
    expect(at(0.5)).toBeCloseTo(0.5, 2);
    expect(at(-0.5)).toBeCloseTo(-0.5, 2);
  });

  it("rounds off loud peaks without ever passing full scale", () => {
    expect(at(1)).toBeLessThan(1);
    expect(at(1)).toBeGreaterThan(0.7);
    expect(Math.max(...curve)).toBeLessThanOrEqual(1);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(-1);
  });

  it("only gets louder as the input gets louder", () => {
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
  });
});

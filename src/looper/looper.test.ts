import { describe, expect, it } from "vitest";
import { Looper } from "./looper";

// At 60 BPM one beat is one second, which keeps the arithmetic readable.
// Recording from a stop at time 0 counts in one bar: beat 0 falls at 4.05 s.
const DOWNBEAT = 4.05;

function recordingLooper(bars: 1 | 2 | 4 = 2): Looper {
  const looper = new Looper();
  looper.bpm = 60;
  looper.bars = bars;
  looper.toggleRecord(0);
  return looper;
}

const pads = (looper: Looper, from: number, to: number) =>
  looper.eventsBetween(from, to).filter((e) => e.kind === "pad");

describe("count-in", () => {
  it("counts down one bar before the loop starts", () => {
    const looper = recordingLooper();
    expect(looper.position(0)).toEqual({ kind: "countIn", beatsLeft: 4 });
    expect(looper.position(DOWNBEAT - 2.5)).toEqual({ kind: "countIn", beatsLeft: 3 });
    expect(looper.position(DOWNBEAT)).toEqual({ kind: "loop", beat: 0, cycle: 0 });
  });

  it("clicks four times with an accent on the first, even with the metronome off", () => {
    const looper = recordingLooper();
    looper.metronome = false;
    expect(looper.eventsBetween(-5, 0.5)).toEqual([
      { kind: "click", accent: true, beat: -4 },
      { kind: "click", accent: false, beat: -3 },
      { kind: "click", accent: false, beat: -2 },
      { kind: "click", accent: false, beat: -1 },
    ]);
  });

  it("ignores pads played during the count-in", () => {
    const looper = recordingLooper();
    looper.hit("kick", DOWNBEAT - 2);
    looper.toggleRecord(DOWNBEAT + 1);
    expect(looper.layerCount).toBe(0);
  });

  it("counts a hit just before the downbeat as the downbeat", () => {
    const looper = recordingLooper();
    looper.quantize = false;
    looper.hit("kick", DOWNBEAT - 0.1);
    expect(pads(looper, 8, 16)).toEqual([{ kind: "pad", pad: "kick", beat: 8 }]);
  });
});

describe("recording", () => {
  it("quantizes to 1/16 notes and plays the hit back from the next cycle", () => {
    const looper = recordingLooper();
    looper.hit("snare", DOWNBEAT + 1.1);
    expect(pads(looper, 0, 8)).toEqual([]); // already heard live
    expect(pads(looper, 8, 16)).toEqual([{ kind: "pad", pad: "snare", beat: 9 }]);
  });

  it("keeps the exact timing when quantize is off", () => {
    const looper = recordingLooper();
    looper.quantize = false;
    looper.hit("snare", DOWNBEAT + 1.1);
    const [event] = pads(looper, 8, 16);
    expect(event.beat).toBeCloseTo(9.1);
  });

  it("moves a late hit at the end of the loop to the start, without playing it twice", () => {
    const looper = recordingLooper(1);
    looper.hit("kick", DOWNBEAT + 3.95); // rounds to beat 4 = next cycle's downbeat
    expect(pads(looper, 4, 8)).toEqual([]);
    expect(pads(looper, 8, 12)).toEqual([{ kind: "pad", pad: "kick", beat: 8 }]);
  });

  it("keeps a take as a layer and keeps playing", () => {
    const looper = recordingLooper();
    looper.hit("kick", DOWNBEAT);
    looper.toggleRecord(DOWNBEAT + 2);
    expect(looper.recording).toBe(false);
    expect(looper.running).toBe(true);
    expect(looper.layerCount).toBe(1);
  });

  it("doesn't keep an empty take", () => {
    const looper = recordingLooper();
    looper.toggleRecord(DOWNBEAT + 2);
    expect(looper.layerCount).toBe(0);
  });

  it("records overdubs as separate layers", () => {
    const looper = recordingLooper();
    looper.hit("kick", DOWNBEAT);
    looper.toggleRecord(DOWNBEAT + 8);
    looper.toggleRecord(DOWNBEAT + 8.5); // already playing: no count-in
    looper.hit("hat", DOWNBEAT + 9);
    looper.toggleRecord(DOWNBEAT + 12);
    expect(looper.layerCount).toBe(2);
    expect(pads(looper, 16, 24)).toEqual([
      { kind: "pad", pad: "kick", beat: 16 },
      { kind: "pad", pad: "hat", beat: 17 },
    ]);
  });

  it("ignores pads while not recording", () => {
    const looper = new Looper();
    looper.togglePlay(0);
    looper.hit("kick", 1);
    expect(looper.layerCount).toBe(0);
  });
});

describe("transport", () => {
  it("starts playing at once without a count-in", () => {
    const looper = new Looper();
    looper.bpm = 60;
    looper.togglePlay(0);
    expect(looper.position(0.05)).toEqual({ kind: "loop", beat: 0, cycle: 0 });
  });

  it("keeps the take when stopping while recording", () => {
    const looper = recordingLooper();
    looper.hit("kick", DOWNBEAT);
    looper.togglePlay(DOWNBEAT + 1);
    expect(looper.running).toBe(false);
    expect(looper.layerCount).toBe(1);
  });

  it("ticks every beat with an accent on each bar, unless the metronome is off", () => {
    const looper = recordingLooper(1);
    expect(looper.eventsBetween(3, 5)).toEqual([
      { kind: "click", accent: false, beat: 3 },
      { kind: "click", accent: true, beat: 4 },
    ]);
    looper.metronome = false;
    expect(looper.eventsBetween(3, 5)).toEqual([]);
  });

  it("keeps the current beat when the tempo changes", () => {
    const looper = recordingLooper();
    const now = DOWNBEAT + 3;
    looper.setBpm(120, now);
    expect(looper.beatAt(now)).toBeCloseTo(3);
    expect(looper.beatAt(now + 1)).toBeCloseTo(5);
  });

  it("keeps the tempo within 40-240 BPM", () => {
    const looper = new Looper();
    looper.setBpm(500, 0);
    expect(looper.bpm).toBe(240);
    looper.setBpm(5, 0);
    expect(looper.bpm).toBe(40);
  });
});

describe("undo and clear", () => {
  it("drops the take being recorded first, then the last layer", () => {
    const looper = recordingLooper();
    looper.hit("kick", DOWNBEAT);
    looper.toggleRecord(DOWNBEAT + 8);
    looper.toggleRecord(DOWNBEAT + 9);
    looper.hit("hat", DOWNBEAT + 9);

    looper.undo();
    expect(looper.recording).toBe(false);
    expect(looper.layerCount).toBe(1);

    looper.undo();
    expect(looper.layerCount).toBe(0);
  });

  it("clear stops and forgets everything", () => {
    const looper = recordingLooper();
    looper.hit("kick", DOWNBEAT);
    looper.clear();
    expect(looper.running).toBe(false);
    expect(looper.recording).toBe(false);
    expect(looper.layerCount).toBe(0);
  });
});

describe("loop length", () => {
  it("can only change while nothing is recorded", () => {
    const looper = recordingLooper();
    looper.setBars(4);
    expect(looper.bars).toBe(2); // a take is in progress

    looper.clear();
    looper.setBars(4);
    expect(looper.bars).toBe(4);
  });
});

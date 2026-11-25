import { describe, expect, it } from "vitest";
import { Looper, MIN_VELOCITY, offGrid, stepOf } from "./looper";

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
    expect(pads(looper, 8, 16)).toEqual([{ kind: "pad", pad: "kick", beat: 8, velocity: 1 }]);
  });
});

describe("recording", () => {
  it("quantizes to 1/16 notes and plays the hit back from the next cycle", () => {
    const looper = recordingLooper();
    looper.hit("snare", DOWNBEAT + 1.1);
    expect(pads(looper, 0, 8)).toEqual([]); // already heard live
    expect(pads(looper, 8, 16)).toEqual([{ kind: "pad", pad: "snare", beat: 9, velocity: 1 }]);
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
    expect(pads(looper, 8, 12)).toEqual([{ kind: "pad", pad: "kick", beat: 8, velocity: 1 }]);
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
      { kind: "pad", pad: "kick", beat: 16, velocity: 1 },
      { kind: "pad", pad: "hat", beat: 17, velocity: 1 },
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

describe("drop last and clear", () => {
  it("drops the take being recorded first, then the last layer", () => {
    const looper = recordingLooper();
    looper.hit("kick", DOWNBEAT);
    looper.toggleRecord(DOWNBEAT + 8);
    looper.toggleRecord(DOWNBEAT + 9);
    looper.hit("hat", DOWNBEAT + 9);

    looper.dropLast();
    expect(looper.recording).toBe(false);
    expect(looper.layerCount).toBe(1);

    looper.dropLast();
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

/** A playing 1-bar loop at 60 BPM with one recorded layer: kick on beat 0, snare on beat 2. */
function loopWithLayer(): Looper {
  const looper = recordingLooper(1);
  looper.hit("kick", DOWNBEAT);
  looper.hit("snare", DOWNBEAT + 2);
  looper.toggleRecord(DOWNBEAT + 3.5);
  return looper;
}

const padsIn = (looper: Looper, from: number, to: number) =>
  pads(looper, from, to).map((e) => (e.kind === "pad" ? `${e.pad}@${e.beat}` : ""));

describe("layers", () => {
  it("names layers in order and starts over after a clear", () => {
    const looper = loopWithLayer();
    looper.toggleRecord(DOWNBEAT + 4);
    looper.hit("hat", DOWNBEAT + 5);
    looper.toggleRecord(DOWNBEAT + 7);
    expect(looper.layers.map((l) => l.name)).toEqual(["Layer 1", "Layer 2"]);

    looper.clear();
    looper.toggleRecord(100);
    looper.hit("kick", 100 + 4.05);
    looper.toggleRecord(100 + 5);
    expect(looper.layers.map((l) => l.name)).toEqual(["Layer 1"]);
  });

  it("silences a muted layer at once", () => {
    const looper = loopWithLayer();
    const [layer] = looper.layers;
    looper.toggleMute(layer.id);
    expect(pads(looper, 4, 8)).toEqual([]);
    looper.toggleMute(layer.id);
    expect(padsIn(looper, 4, 8)).toEqual(["kick@4", "snare@6"]);
  });

  it("plays only soloed layers while any layer is soloed", () => {
    const looper = loopWithLayer();
    looper.toggleRecord(DOWNBEAT + 4);
    looper.hit("hat", DOWNBEAT + 5);
    looper.toggleRecord(DOWNBEAT + 7);
    const [first, second] = looper.layers;

    looper.toggleSolo(second.id);
    expect(padsIn(looper, 8, 12)).toEqual(["hat@9"]);
    looper.toggleSolo(second.id);
    looper.toggleMute(first.id);
    expect(padsIn(looper, 8, 12)).toEqual(["hat@9"]);
  });

  it("keeps playing the take being recorded, whatever is soloed", () => {
    const looper = loopWithLayer();
    looper.toggleSolo(looper.layers[0].id);
    looper.toggleRecord(DOWNBEAT + 4);
    looper.hit("hat", DOWNBEAT + 5);
    expect(padsIn(looper, 8, 12)).toEqual(["kick@8", "hat@9", "snare@10"]);
  });

  it("deletes any layer, not just the last", () => {
    const looper = loopWithLayer();
    looper.toggleRecord(DOWNBEAT + 4);
    looper.hit("hat", DOWNBEAT + 5);
    looper.toggleRecord(DOWNBEAT + 7);
    looper.deleteLayer(looper.layers[0].id);
    expect(looper.layers.map((l) => l.name)).toEqual(["Layer 2"]);
  });
});

describe("editing a layer", () => {
  it("adds a hit at full volume in an empty cell; it plays on the next pass", () => {
    const looper = loopWithLayer();
    const id = looper.layers[0].id;
    looper.toggleStep(id, "hat", 6); // step 6 = beat 1.5
    expect(padsIn(looper, 4, 8)).toEqual(["kick@4", "hat@5.5", "snare@6"]);
  });

  it("removes the pad's hit from a filled cell", () => {
    const looper = loopWithLayer();
    looper.toggleStep(looper.layers[0].id, "snare", 8);
    expect(padsIn(looper, 4, 8)).toEqual(["kick@4"]);
  });

  it("finds off-grid hits in their nearest cell", () => {
    const looper = recordingLooper(1);
    looper.quantize = false;
    looper.hit("snare", DOWNBEAT + 1.1); // nearest step 4
    looper.toggleRecord(DOWNBEAT + 3);
    const layer = looper.layers[0];
    expect(stepOf(layer.hits[0].beat, looper.loopSteps)).toBe(4);
    expect(offGrid(layer.hits[0].beat)).toBeCloseTo(0.4);
    looper.toggleStep(layer.id, "snare", 4);
    expect(layer.hits).toEqual([]);
  });

  it("treats a hit at the end of the loop as part of the first cell", () => {
    expect(stepOf(3.95, 16)).toBe(0);
  });

  it("changes the volume of a hit, within 5–100%", () => {
    const looper = loopWithLayer();
    const id = looper.layers[0].id;
    looper.changeVelocity(id, "kick", 0, -0.5);
    expect(pads(looper, 4, 5)).toEqual([{ kind: "pad", pad: "kick", beat: 4, velocity: 0.5 }]);
    looper.changeVelocity(id, "kick", 0, -2);
    expect(looper.layers[0].hits[0].velocity).toBe(MIN_VELOCITY);
    looper.changeVelocity(id, "kick", 0, 5);
    expect(looper.layers[0].hits[0].velocity).toBe(1);
  });

  it("ignores volume changes on empty cells", () => {
    const looper = loopWithLayer();
    looper.changeVelocity(looper.layers[0].id, "hat", 3, -0.5);
    looper.undo(); // only the recording itself is in the history
    expect(looper.layerCount).toBe(0);
  });
});

describe("undo (Ctrl+Z)", () => {
  it("undoes grid edits one at a time", () => {
    const looper = loopWithLayer();
    const id = looper.layers[0].id;
    looper.toggleStep(id, "hat", 2);
    looper.toggleStep(id, "kick", 0);
    looper.undo();
    expect(padsIn(looper, 4, 8)).toEqual(["kick@4", "hat@4.5", "snare@6"]);
    looper.undo();
    expect(padsIn(looper, 4, 8)).toEqual(["kick@4", "snare@6"]);
  });

  it("undoes one whole drag on a hit's volume in one step", () => {
    const looper = loopWithLayer();
    const id = looper.layers[0].id;
    looper.changeVelocity(id, "kick", 0, -0.1);
    looper.changeVelocity(id, "kick", 0, -0.1);
    looper.endEdit();
    looper.changeVelocity(id, "kick", 0, -0.1);
    looper.undo();
    expect(looper.layers[0].hits[0].velocity).toBeCloseTo(0.8);
    looper.undo();
    expect(looper.layers[0].hits[0].velocity).toBe(1);
  });

  it("brings back a deleted layer, a dropped layer and a cleared loop", () => {
    const looper = loopWithLayer();
    looper.deleteLayer(looper.layers[0].id);
    looper.undo();
    expect(looper.layerCount).toBe(1);

    looper.dropLast();
    looper.undo();
    expect(looper.layerCount).toBe(1);

    looper.clear();
    looper.setBars(4);
    looper.undo();
    expect(looper.layerCount).toBe(1);
    expect(looper.bars).toBe(1); // the layers' own loop length comes back too
  });

  it("removes a just-recorded layer", () => {
    const looper = loopWithLayer();
    looper.undo();
    expect(looper.layerCount).toBe(0);
    expect(looper.canUndo).toBe(false);
  });
});

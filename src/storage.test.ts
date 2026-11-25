import { describe, expect, it } from "vitest";
import { DEFAULT_KIT } from "./kit";
import { Looper } from "./looper/looper";
import { parseSession } from "./storage";

function recordedLooper(): Looper {
  const looper = new Looper();
  looper.bpm = 60;
  looper.bars = 1;
  looper.toggleRecord(0);
  looper.hit("kick", 4.05);
  looper.hit("snare", 6.05);
  looper.toggleRecord(7.5);
  return looper;
}

describe("saving and loading", () => {
  it("round-trips the kit and the loop", () => {
    const looper = recordedLooper();
    const [layer] = looper.layers;
    looper.toggleMute(layer.id);
    looper.changeVelocity(layer.id, "kick", 0, -0.5);
    const kit = { ...DEFAULT_KIT, kick: { sample: "BD2575", pitch: -3, tone: 0.4, length: 0.5, volume: 0.9 } };

    const session = parseSession(JSON.stringify({ kit, loop: looper.exportLoop() }));
    expect(session.kit.kick).toEqual(kit.kick);
    expect(session.kit.snare).toEqual(DEFAULT_KIT.snare);

    const restored = new Looper();
    restored.importLoop(session.loop!);
    expect(restored.bpm).toBe(60);
    expect(restored.bars).toBe(1);
    expect(restored.layers).toHaveLength(1);
    expect(restored.layers[0]).toMatchObject({ name: "Layer 1", muted: true, soloed: false });
    expect(restored.layers[0].hits).toEqual([
      { pad: "kick", beat: 0, velocity: 0.5, firstCycle: 0 },
      { pad: "snare", beat: 2, velocity: 1, firstCycle: 0 },
    ]);
    expect(restored.running).toBe(false);
    expect(restored.canUndo).toBe(false);
  });

  it("numbers new layers after the restored ones", () => {
    const restored = new Looper();
    restored.importLoop(parseSession(JSON.stringify({ loop: recordedLooper().exportLoop() })).loop!);
    restored.toggleRecord(0);
    restored.hit("hat", restored.timeAt(1));
    restored.toggleRecord(restored.timeAt(2));
    expect(restored.layers.map((l) => l.name)).toEqual(["Layer 1", "Layer 2"]);
  });

  it("starts fresh from nothing, broken JSON or the wrong shape", () => {
    for (const text of [null, "", "{nope", "[]", '"hi"', '{"kit": 5, "loop": "x"}']) {
      const session = parseSession(text);
      expect(session.kit).toEqual(DEFAULT_KIT);
      expect(session.loop).toBeNull();
    }
  });

  it("drops what doesn't fit and clamps what's out of range", () => {
    const session = parseSession(
      JSON.stringify({
        kit: { kick: { sample: "nope" }, snare: { sample: "SD0000", pitch: 99, tone: "loud" }, ghost: { sample: "CP" } },
        loop: {
          bpm: 999,
          bars: 3,
          layers: [
            {
              name: "Mine",
              hits: [
                { pad: "kick", beat: 1, velocity: 7 },
                { pad: "ghost", beat: 1 },
                { pad: "snare", beat: 9 },
                { pad: "snare", beat: -1 },
                "junk",
              ],
            },
            "junk",
          ],
        },
      }),
    );
    expect(session.kit.kick).toEqual(DEFAULT_KIT.kick);
    expect(session.kit.snare).toEqual({ ...DEFAULT_KIT.snare, sample: "SD0000", pitch: 12 });
    expect(session.kit).not.toHaveProperty("ghost");
    expect(session.loop).toMatchObject({ bpm: 240, bars: 2 });
    expect(session.loop!.layers).toEqual([
      { name: "Mine", muted: false, soloed: false, hits: [{ pad: "kick", beat: 1, velocity: 1 }] },
    ]);
  });
});

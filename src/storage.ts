// Saves the kit and the last loop in this browser, and reads them back.
// What comes back from storage is checked field by field: anything broken
// or out of range is dropped or replaced by its default, never trusted.

import { copyKit, DEFAULT_KIT, type Kit } from "./kit";
import { LOOP_BAR_OPTIONS, MAX_BPM, MIN_BPM, MIN_VELOCITY, BEATS_PER_BAR, type LoopBars, type SavedLoop } from "./looper/looper";
import { cleanSettings, type SoundSettings } from "./sound";

const KEY = "keyjam.session.v1";

export interface Session {
  kit: Kit;
  loop: SavedLoop | null;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Every pad gets its saved sound if valid, otherwise its default. */
export function parseKit(value: unknown): Kit {
  const kit = copyKit(DEFAULT_KIT);
  if (!isObject(value)) return kit;
  for (const padId of Object.keys(kit)) {
    const saved = value[padId];
    if (!isObject(saved) || typeof saved.sample !== "string") continue;
    const fallback = kit[padId];
    const sound: SoundSettings = {
      sample: saved.sample,
      pitch: num(saved.pitch, fallback.pitch),
      tone: num(saved.tone, fallback.tone),
      length: num(saved.length, fallback.length),
      volume: num(saved.volume, fallback.volume),
    };
    kit[padId] = cleanSettings(sound) ?? fallback;
  }
  return kit;
}

export function parseLoop(value: unknown): SavedLoop | null {
  if (!isObject(value) || !Array.isArray(value.layers)) return null;
  const bars = LOOP_BAR_OPTIONS.find((b) => b === value.bars) ?? 2;
  const loopBeats = bars * BEATS_PER_BAR;
  const pads = new Set(Object.keys(DEFAULT_KIT));

  const layers: SavedLoop["layers"] = [];
  for (const layer of value.layers) {
    if (!isObject(layer) || !Array.isArray(layer.hits)) continue;
    const hits = layer.hits.flatMap((hit) => {
      if (!isObject(hit) || typeof hit.pad !== "string" || !pads.has(hit.pad)) return [];
      const beat = num(hit.beat, -1);
      if (beat < 0 || beat >= loopBeats) return [];
      return [{ pad: hit.pad, beat, velocity: Math.min(1, Math.max(MIN_VELOCITY, num(hit.velocity, 1))) }];
    });
    layers.push({
      name: typeof layer.name === "string" ? layer.name.slice(0, 40) : `Layer ${layers.length + 1}`,
      muted: bool(layer.muted, false),
      soloed: bool(layer.soloed, false),
      hits,
    });
  }

  return {
    bpm: Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, num(value.bpm, 90)))),
    bars: bars as LoopBars,
    quantize: bool(value.quantize, true),
    metronome: bool(value.metronome, true),
    nextNumber: Math.max(layers.length + 1, Math.round(num(value.nextNumber, 1))),
    layers,
  };
}

export function parseSession(text: string | null): Session {
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const saved = isObject(data) ? data : {};
  return { kit: parseKit(saved.kit), loop: parseLoop(saved.loop) };
}

export function loadSession(): Session {
  try {
    return parseSession(localStorage.getItem(KEY));
  } catch {
    return parseSession(null);
  }
}

export function saveSession(kit: Kit, loop: SavedLoop): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ kit, loop }));
  } catch {
    // Storage unavailable or full: keep playing, just without saving.
  }
}

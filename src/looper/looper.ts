// The looper's state and timing rules, free of Web Audio and the DOM so it
// can be tested on its own. Every method that depends on the clock takes
// `now` (in seconds, the audio clock) as an argument.
//
// Positions are kept in beats, not seconds, so a recorded loop keeps its
// shape when the tempo changes.

export const BEATS_PER_BAR = 4;
/** Quantize and edit grid: 4 steps per beat = 1/16 notes. */
export const STEPS_PER_BEAT = 4;
export const COUNT_IN_BEATS = BEATS_PER_BAR;
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const LOOP_BAR_OPTIONS = [1, 2, 4] as const;
export type LoopBars = (typeof LOOP_BAR_OPTIONS)[number];
export const MIN_VELOCITY = 0.05;

/** Small gap between a key press and beat 0, so the first sound is never scheduled in the past. */
const START_DELAY = 0.05;
/** An unquantized hit this many beats before the first downbeat still counts as the downbeat. */
const EARLY_TOLERANCE = 1 / 8;
const HISTORY_LIMIT = 100;
const GRID_EPSILON = 1e-6;

export interface Hit {
  pad: string;
  /** Position inside the loop, 0 <= beat < loop length in beats. */
  beat: number;
  /** First loop cycle this hit plays back in. Cycles before it heard it live. */
  firstCycle: number;
  /** Volume, MIN_VELOCITY..1. */
  velocity: number;
}

export interface Layer {
  id: number;
  name: string;
  hits: Hit[];
  muted: boolean;
  soloed: boolean;
}

export type LoopEvent =
  | { kind: "pad"; pad: string; beat: number; velocity: number }
  | { kind: "click"; accent: boolean; beat: number };

export type LoopPosition =
  | { kind: "countIn"; beatsLeft: number }
  | { kind: "loop"; beat: number; cycle: number };

interface Snapshot {
  layers: Layer[];
  bars: LoopBars;
  nextNumber: number;
}

/** The grid step a beat position falls in (nearest 1/16), within a loop of `steps`. */
export function stepOf(beat: number, steps: number): number {
  return Math.round(beat * STEPS_PER_BEAT) % steps;
}

/** How far a hit sits from its grid step, in steps (-0.5..0.5). 0 means on the grid. */
export function offGrid(beat: number): number {
  const steps = beat * STEPS_PER_BEAT;
  const off = steps - Math.round(steps);
  return Math.abs(off) < GRID_EPSILON ? 0 : off;
}

const clampVelocity = (v: number) => Math.min(1, Math.max(MIN_VELOCITY, v));

const copyLayers = (layers: Layer[]): Layer[] =>
  layers.map((layer) => ({ ...layer, hits: layer.hits.map((hit) => ({ ...hit })) }));

export class Looper {
  bpm = 90;
  bars: LoopBars = 2;
  quantize = true;
  metronome = true;

  private layerList: Layer[] = [];
  /** The layer being recorded, or null when not recording. */
  private take: Hit[] | null = null;
  /** Audio time of beat 0 of the first cycle; null while stopped. */
  private startTime: number | null = null;
  /** Ids are never reused, so the editor never confuses an old layer with a new one. */
  private nextId = 1;
  /** Number in the next layer's name; starts over after a clear. */
  private nextNumber = 1;
  private history: Snapshot[] = [];
  /** Consecutive edits with the same key (one drag on one hit) share one undo step. */
  private lastEditKey: string | null = null;

  get running(): boolean {
    return this.startTime !== null;
  }

  get recording(): boolean {
    return this.take !== null;
  }

  get layers(): readonly Layer[] {
    return this.layerList;
  }

  get layerCount(): number {
    return this.layerList.length;
  }

  /** Hits of the layer being recorded, or null when not recording. */
  get takeHits(): readonly Hit[] | null {
    return this.take;
  }

  get loopBeats(): number {
    return this.bars * BEATS_PER_BAR;
  }

  get loopSteps(): number {
    return this.loopBeats * STEPS_PER_BEAT;
  }

  /** Loop length can only change while there is nothing recorded. */
  get canChangeBars(): boolean {
    return this.layerList.length === 0 && this.take === null;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  layer(id: number): Layer | undefined {
    return this.layerList.find((layer) => layer.id === id);
  }

  /** Whether a layer is heard: with any layer soloed, only soloed layers play. */
  audible(layer: Layer): boolean {
    return this.layerList.some((l) => l.soloed) ? layer.soloed : !layer.muted;
  }

  beatAt(time: number): number {
    if (this.startTime === null) return 0;
    return ((time - this.startTime) * this.bpm) / 60;
  }

  timeAt(beat: number): number {
    if (this.startTime === null) return 0;
    return this.startTime + (beat * 60) / this.bpm;
  }

  position(now: number): LoopPosition | null {
    if (this.startTime === null) return null;
    const beat = this.beatAt(now);
    if (beat < 0) {
      return { kind: "countIn", beatsLeft: Math.min(COUNT_IN_BEATS, Math.ceil(-beat)) };
    }
    const cycle = Math.floor(beat / this.loopBeats);
    return { kind: "loop", beat: beat - cycle * this.loopBeats, cycle };
  }

  // Transport and recording

  /**
   * Space. Stopped: count in one bar, then play and record.
   * Playing: start recording a new layer right away.
   * Recording: keep the take as a layer and keep playing.
   */
  toggleRecord(now: number): void {
    if (this.take !== null) {
      this.commitTake();
      return;
    }
    if (this.startTime === null) {
      this.startTime = now + START_DELAY + (COUNT_IN_BEATS * 60) / this.bpm;
    }
    this.take = [];
  }

  /** Enter. Start playing at once (no count-in), or stop, keeping any take. */
  togglePlay(now: number): void {
    if (this.startTime === null) {
      this.startTime = now + START_DELAY;
      return;
    }
    this.commitTake();
    this.startTime = null;
  }

  /** A pad was played at `time` (audio clock). While recording, it is added to the take. */
  hit(pad: string, time: number): void {
    if (this.take === null || this.startTime === null) return;
    const raw = this.beatAt(time);
    let beat = this.quantize ? Math.round(raw * STEPS_PER_BEAT) / STEPS_PER_BEAT : raw;
    if (beat < 0) {
      if (raw < -EARLY_TOLERANCE) return; // played during the count-in
      beat = 0;
    }
    const cycle = Math.floor(beat / this.loopBeats);
    this.take.push({
      pad,
      beat: beat - cycle * this.loopBeats,
      firstCycle: cycle + 1,
      velocity: 1,
    });
  }

  /** Backspace. Drop the take being recorded, or else the last layer. */
  dropLast(): void {
    if (this.take !== null) {
      this.take = null;
    } else if (this.layerList.length > 0) {
      this.remember();
      this.layerList.pop();
    }
  }

  /** Escape. Stop and forget everything (Ctrl+Z brings the layers back). */
  clear(): void {
    if (this.layerList.length > 0) this.remember();
    this.layerList = [];
    this.take = null;
    this.startTime = null;
    this.nextNumber = 1;
  }

  setBpm(bpm: number, now: number): void {
    const next = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
    if (this.startTime !== null) {
      const beat = this.beatAt(now);
      this.startTime = now - (beat * 60) / next;
    }
    this.bpm = next;
  }

  setBars(bars: LoopBars): void {
    if (this.canChangeBars) this.bars = bars;
  }

  // Layers

  toggleMute(id: number): void {
    const layer = this.layer(id);
    if (layer) layer.muted = !layer.muted;
  }

  toggleSolo(id: number): void {
    const layer = this.layer(id);
    if (layer) layer.soloed = !layer.soloed;
  }

  deleteLayer(id: number): void {
    if (!this.layer(id)) return;
    this.remember();
    this.layerList = this.layerList.filter((layer) => layer.id !== id);
  }

  /** Clicking a grid cell: removes the pad's hits in that 1/16 step, or adds one at full volume. */
  toggleStep(id: number, pad: string, step: number): void {
    const layer = this.layer(id);
    if (!layer) return;
    this.remember();
    const inCell = (hit: Hit) => hit.pad === pad && stepOf(hit.beat, this.loopSteps) === step;
    if (layer.hits.some(inCell)) {
      layer.hits = layer.hits.filter((hit) => !inCell(hit));
    } else {
      layer.hits.push({ pad, beat: step / STEPS_PER_BEAT, firstCycle: 0, velocity: 1 });
    }
  }

  /** Changes the volume of the pad's hits in a 1/16 step. One drag is one undo step. */
  changeVelocity(id: number, pad: string, step: number, delta: number): void {
    const layer = this.layer(id);
    if (!layer) return;
    const hits = layer.hits.filter((hit) => hit.pad === pad && stepOf(hit.beat, this.loopSteps) === step);
    if (hits.length === 0) return;
    this.remember(`velocity:${id}:${pad}:${step}`);
    for (const hit of hits) hit.velocity = clampVelocity(hit.velocity + delta);
  }

  /** Ends a run of merged edits, so the next drag gets its own undo step. */
  endEdit(): void {
    this.lastEditKey = null;
  }

  /** Ctrl+Z. Puts the layers back as they were before the last change. */
  undo(): void {
    const snapshot = this.history.pop();
    if (!snapshot) return;
    this.layerList = snapshot.layers;
    this.bars = snapshot.bars;
    this.nextNumber = snapshot.nextNumber;
    this.lastEditKey = null;
  }

  // Playback

  /** Everything that should sound in the beat range [from, to), sorted by beat. */
  eventsBetween(from: number, to: number): LoopEvent[] {
    const events: LoopEvent[] = [];
    if (this.startTime === null || to <= from) return events;

    for (let beat = Math.ceil(from); beat < to; beat++) {
      if (beat < 0) {
        if (beat >= -COUNT_IN_BEATS) {
          events.push({ kind: "click", accent: beat === -COUNT_IN_BEATS, beat });
        }
      } else if (this.metronome) {
        events.push({ kind: "click", accent: beat % BEATS_PER_BAR === 0, beat });
      }
    }

    const hits = this.layerList.filter((layer) => this.audible(layer)).flatMap((layer) => layer.hits);
    if (this.take !== null) hits.push(...this.take);

    const length = this.loopBeats;
    const lastCycle = Math.floor(to / length);
    for (let cycle = Math.max(0, Math.floor(from / length)); cycle <= lastCycle; cycle++) {
      for (const hit of hits) {
        if (cycle < hit.firstCycle) continue;
        const beat = cycle * length + hit.beat;
        if (beat >= from && beat < to) {
          events.push({ kind: "pad", pad: hit.pad, beat, velocity: hit.velocity });
        }
      }
    }

    return events.sort((a, b) => a.beat - b.beat);
  }

  private commitTake(): void {
    if (this.take !== null && this.take.length > 0) {
      this.remember();
      this.layerList.push({
        id: this.nextId++,
        name: `Layer ${this.nextNumber++}`,
        hits: this.take,
        muted: false,
        soloed: false,
      });
    }
    this.take = null;
  }

  /** Saves the layers before a change, for undo. Edits sharing `key` back to back save once. */
  private remember(key: string | null = null): void {
    if (key !== null && key === this.lastEditKey) return;
    this.lastEditKey = key;
    this.history.push({ layers: copyLayers(this.layerList), bars: this.bars, nextNumber: this.nextNumber });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }
}

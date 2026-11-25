// The looper's state and timing rules, free of Web Audio and the DOM so it
// can be tested on its own. Every method that depends on the clock takes
// `now` (in seconds, the audio clock) as an argument.
//
// Positions are kept in beats, not seconds, so a recorded loop keeps its
// shape when the tempo changes.

export const BEATS_PER_BAR = 4;
/** Quantize grid: 4 steps per beat = 1/16 notes. */
export const STEPS_PER_BEAT = 4;
export const COUNT_IN_BEATS = BEATS_PER_BAR;
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const LOOP_BAR_OPTIONS = [1, 2, 4] as const;
export type LoopBars = (typeof LOOP_BAR_OPTIONS)[number];

/** Small gap between a key press and beat 0, so the first sound is never scheduled in the past. */
const START_DELAY = 0.05;
/** An unquantized hit this many beats before the first downbeat still counts as the downbeat. */
const EARLY_TOLERANCE = 1 / 8;

export interface Hit {
  pad: string;
  /** Position inside the loop, 0 <= beat < loop length in beats. */
  beat: number;
  /** First loop cycle this hit plays back in. Cycles before it heard it live. */
  firstCycle: number;
}

export type LoopEvent =
  | { kind: "pad"; pad: string; beat: number }
  | { kind: "click"; accent: boolean; beat: number };

export type LoopPosition =
  | { kind: "countIn"; beatsLeft: number }
  | { kind: "loop"; beat: number; cycle: number };

export class Looper {
  bpm = 90;
  bars: LoopBars = 2;
  quantize = true;
  metronome = true;

  private layers: Hit[][] = [];
  /** The layer being recorded, or null when not recording. */
  private take: Hit[] | null = null;
  /** Audio time of beat 0 of the first cycle; null while stopped. */
  private startTime: number | null = null;

  get running(): boolean {
    return this.startTime !== null;
  }

  get recording(): boolean {
    return this.take !== null;
  }

  get layerCount(): number {
    return this.layers.length;
  }

  get loopBeats(): number {
    return this.bars * BEATS_PER_BAR;
  }

  /** Loop length can only change while there is nothing recorded. */
  get canChangeBars(): boolean {
    return this.layers.length === 0 && this.take === null;
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

  /** A pad was played. While recording, it is added to the take. */
  hit(pad: string, now: number): void {
    if (this.take === null || this.startTime === null) return;
    const raw = this.beatAt(now);
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
    });
  }

  /** Backspace. Drop the take being recorded, or else the last layer. */
  undo(): void {
    if (this.take !== null) {
      this.take = null;
    } else {
      this.layers.pop();
    }
  }

  /** Escape. Stop and forget everything. */
  clear(): void {
    this.layers = [];
    this.take = null;
    this.startTime = null;
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

    const length = this.loopBeats;
    const hits = this.take === null ? this.layers.flat() : [...this.layers.flat(), ...this.take];
    const lastCycle = Math.floor(to / length);
    for (let cycle = Math.max(0, Math.floor(from / length)); cycle <= lastCycle; cycle++) {
      for (const hit of hits) {
        if (cycle < hit.firstCycle) continue;
        const beat = cycle * length + hit.beat;
        if (beat >= from && beat < to) events.push({ kind: "pad", pad: hit.pad, beat });
      }
    }

    return events.sort((a, b) => a.beat - b.beat);
  }

  private commitTake(): void {
    if (this.take !== null && this.take.length > 0) this.layers.push(this.take);
    this.take = null;
  }
}

// A pad's sound: which sample it plays and how. Pure, so the mapping from
// settings to audio parameters can be tested.

import { SAMPLE_BY_ID } from "./library";

export interface SoundSettings {
  /** Sample id from the library, e.g. "BD1025". */
  sample: string;
  /** Semitones, -12..12. Like a sampler, lower is also longer. */
  pitch: number;
  /** Brightness, 0..1. 1 leaves the sound as recorded; lower closes a low-pass filter. */
  tone: number;
  /** How much of the sound plays before it fades out, 0.05..1. */
  length: number;
  /** 0..1. */
  volume: number;
}

export const PITCH_RANGE = 12;
export const MIN_LENGTH = 0.05;

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

/** Keeps settings within their ranges; null if the sample doesn't exist. */
export function cleanSettings(settings: SoundSettings): SoundSettings | null {
  if (!SAMPLE_BY_ID.has(settings.sample)) return null;
  return {
    sample: settings.sample,
    pitch: Math.round(clamp(settings.pitch, -PITCH_RANGE, PITCH_RANGE)),
    tone: clamp(settings.tone, 0, 1),
    length: clamp(settings.length, MIN_LENGTH, 1),
    volume: clamp(settings.volume, 0, 1),
  };
}

/** Playback speed for a pitch shift in semitones. */
export function playbackRate(pitch: number): number {
  return 2 ** (pitch / 12);
}

/** Low-pass cutoff for a tone setting: 100 Hz at 0 up to 20 kHz at 1, evenly in pitch. */
export function cutoffHz(tone: number): number {
  return 100 * 200 ** tone;
}

/**
 * When to start fading and when to stop, in seconds after the start, for a
 * sample of `duration` seconds played at `rate`. Null at full length.
 */
export function lengthEnvelope(duration: number, rate: number, length: number): { fadeAt: number; stopAt: number } | null {
  if (length >= 1) return null;
  const stopAt = Math.max(0.02, (duration / rate) * length);
  return { fadeAt: stopAt * 0.6, stopAt };
}

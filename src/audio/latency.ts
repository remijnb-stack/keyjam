// Timing corrections for what you hear versus when you press a key.
//
// Sound leaves the speakers (or headphones) some time after the app plays
// it: the output latency. You play along with what you hear, so every key
// press arrives that much late. To record a hit where you meant it, take
// the moment you pressed the key and step back by the latency.

export const MIN_OFFSET_MS = -100;
export const MAX_OFFSET_MS = 100;

/** Above this, live playing starts to feel late. */
export const HIGH_LATENCY = 0.05;

/** Handler delays above this are treated as a stall, not as timing information. */
const MAX_HANDLER_DELAY = 0.1;

export interface PressTiming {
  /** Audio clock when the key press is handled. */
  now: number;
  /** Seconds between the key press and the handler running (event timestamp to now). */
  handlerDelay: number;
  /** Output latency the browser reports, in seconds. */
  latency: number;
  /** The player's own fine-tuning, in milliseconds. Positive moves hits earlier. */
  offsetMs: number;
}

/** The audio-clock time the player was hearing when they pressed the key. */
export function heardTime({ now, handlerDelay, latency, offsetMs }: PressTiming): number {
  const delay = Math.min(MAX_HANDLER_DELAY, Math.max(0, handlerDelay));
  const correction = Math.max(0, latency + clampOffset(offsetMs) / 1000);
  return now - delay - correction;
}

export function clampOffset(ms: number): number {
  return Math.min(MAX_OFFSET_MS, Math.max(MIN_OFFSET_MS, Math.round(ms)));
}

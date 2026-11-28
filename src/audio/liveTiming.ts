// When to play a sound you trigger live, with a key or a tap.
//
// Playing it "right now" sounds anywhere from 0 to one audio buffer late
// (the audio is worked out in blocks, on phones often 10-20 ms long), plus
// however long the page took to handle the press. That delay changes from
// press to press, and uneven timing is easy to feel. So each press is booked
// on the audio clock a steady time after it really happened: as long as the
// slower recent presses needed. A steady delay is something you get used to.

/** How many recent presses the delay is based on. */
const WINDOW = 16;
/** Spare time on top, in seconds. */
const MARGIN = 0.002;
/** Never wait more than this beyond the output latency; a slower press just plays at once. */
const MAX_EXTRA = 0.04;

/** Links the audio clock to the performance.now() clock, as AudioContext.getOutputTimestamp() does. */
export interface OutputStamp {
  /** Audio-clock time of the sound the speakers play at `performanceTime`, in seconds. */
  contextTime: number;
  /** performance.now() clock, in ms. */
  performanceTime: number;
}

export class LiveTiming {
  /** Seconds each recent press needed between being pressed and the soonest it could sound. */
  private needed: number[] = [];

  /**
   * Audio-clock time to start the sound of a press made at `pressedAt`
   * (performance.now() clock, ms). `now` is the audio clock, `latency` the
   * output latency the browser reports (seconds).
   */
  timeFor(pressedAt: number, now: number, stamp: OutputStamp, latency: number): number {
    // Without a usable link between the clocks (audio not running yet), play at once.
    if (stamp.performanceTime <= 0 || stamp.contextTime <= 0) return now;

    // The moment of the press, on the audio clock as the speakers play it.
    const pressed = stamp.contextTime + (pressedAt - stamp.performanceTime) / 1000;
    const needed = now - pressed;
    if (!Number.isFinite(needed) || needed < 0) return now;

    this.needed.push(needed);
    if (this.needed.length > WINDOW) this.needed.shift();
    // The second slowest, so one hiccup doesn't hold back the presses after it.
    const sorted = [...this.needed].sort((a, b) => a - b);
    const slow = sorted[Math.max(0, sorted.length - 2)];
    const delay = Math.min(slow + MARGIN, Math.max(0, latency) + MAX_EXTRA);
    return Math.max(now, pressed + delay);
  }
}

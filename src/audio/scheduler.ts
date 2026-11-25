// Feeds the looper's events to the audio clock a little ahead of time.
// Timers in the browser are jittery; the audio clock isn't. So a timer wakes
// up often and books everything due in the next ~120 ms at its exact time.

import type { LoopEvent, Looper } from "../looper/looper";

const TICK_MS = 25;
const LOOKAHEAD = 0.12;
/** Background tabs only wake timers about once a second, so look further ahead there. */
const HIDDEN_LOOKAHEAD = 1.5;

export class Scheduler {
  /** Beat up to which events are booked; null when nothing is booked yet. */
  private bookedTo: number | null = null;

  constructor(
    private readonly looper: Looper,
    private readonly clock: () => number,
    private readonly onEvent: (event: LoopEvent, time: number) => void,
  ) {}

  start(): void {
    setInterval(() => this.tick(), TICK_MS);
  }

  /** Forget what was booked; the next tick books from now. Call after the loop changes. */
  resync(): void {
    this.bookedTo = null;
    this.tick();
  }

  private tick(): void {
    if (!this.looper.running) {
      this.bookedTo = null;
      return;
    }
    const now = this.clock();
    const lookahead = document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD;
    const from = this.bookedTo ?? this.looper.beatAt(now);
    const to = this.looper.beatAt(now + lookahead);
    if (to <= from) return;
    for (const event of this.looper.eventsBetween(from, to)) {
      this.onEvent(event, this.looper.timeAt(event.beat));
    }
    this.bookedTo = to;
  }
}

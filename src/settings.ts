// Settings kept in this browser. Storage can be unavailable (private
// windows, blocked site data), so every read and write fails softly.

import { clampOffset } from "./audio/latency";

const OFFSET_KEY = "keyjam.latencyOffsetMs";

export function loadOffset(): number {
  try {
    const value = Number(localStorage.getItem(OFFSET_KEY));
    return Number.isFinite(value) ? clampOffset(value) : 0;
  } catch {
    return 0;
  }
}

export function saveOffset(ms: number): void {
  try {
    localStorage.setItem(OFFSET_KEY, String(ms));
  } catch {
    // Not saved; the offset still applies until the page reloads.
  }
}

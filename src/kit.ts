// The 16 pads on a 4x4 grid of keys, laid out like the pads of a pad
// controller, and the sound each one plays by default. Keys are matched by
// physical position (KeyboardEvent.code), so the grid stays the same on any
// keyboard layout. Which sound a pad plays is up to the player (the kit).

import type { SoundSettings } from "./sound";

export type PadRow = "fx" | "hats" | "toms" | "core";

export interface Pad {
  id: string;
  /** KeyboardEvent.code of the key that plays this pad. */
  code: string;
  /** Key name shown on the pad. */
  label: string;
  /** A new sound in the same choke group cuts off the previous one (closed hat stops open hat). */
  choke?: string;
  row: PadRow;
}

/** Every pad's sound, by pad id. */
export type Kit = Record<string, SoundSettings>;

const DEFAULTS: [row: PadRow, label: string, id: string, sample: string, volume: number, choke?: string][] = [
  ["fx", "1", "cymbal", "CY5050", 0.55],
  ["fx", "2", "conga-low", "LC50", 0.8],
  ["fx", "3", "conga-high", "HC50", 0.8],
  ["fx", "4", "clave", "CL", 0.7],
  ["hats", "Q", "hat-closed", "CH", 0.7, "hat"],
  ["hats", "W", "hat-open", "OH10", 0.6, "hat"],
  ["hats", "E", "maracas", "MA", 0.7],
  ["hats", "R", "cowbell", "CB", 0.55],
  ["toms", "A", "rim", "RS", 0.8],
  ["toms", "S", "snare2", "SD0010", 0.8],
  ["toms", "D", "tom-low", "LT50", 0.85],
  ["toms", "F", "tom-high", "HT50", 0.85],
  ["core", "Z", "kick", "BD1025", 1],
  ["core", "X", "boom", "BD0010", 0.9],
  ["core", "C", "snare", "SD5075", 0.85],
  ["core", "V", "clap", "CP", 0.8],
];

export const PADS: Pad[] = DEFAULTS.map(([row, label, id, , , choke]) => ({
  id,
  code: /^\d$/.test(label) ? `Digit${label}` : `Key${label}`,
  label,
  choke,
  row,
}));

/** Top row first, as on the keyboard. The basics sit on the bottom row. */
export const PAD_ROWS: Pad[][] = [0, 4, 8, 12].map((i) => PADS.slice(i, i + 4));

export const PAD_BY_ID = new Map(PADS.map((p) => [p.id, p]));
export const PAD_BY_CODE = new Map(PADS.map((p) => [p.code, p]));

export const DEFAULT_KIT: Kit = Object.fromEntries(
  DEFAULTS.map(([, , id, sample, volume]) => [id, { sample, pitch: 0, tone: 1, length: 1, volume }]),
);

export function copyKit(kit: Kit): Kit {
  return Object.fromEntries(Object.entries(kit).map(([id, sound]) => [id, { ...sound }]));
}

// The drum kit: 16 pads on a 4x4 grid of keys, laid out like the pads of a
// pad controller. Keys are matched by physical position (KeyboardEvent.code),
// so the grid stays the same on any keyboard layout.

export type PadRow = "fx" | "hats" | "toms" | "core";

export interface Pad {
  id: string;
  name: string;
  /** KeyboardEvent.code of the key that plays this pad. */
  code: string;
  /** Key name shown on the pad. */
  label: string;
  /** File in public/samples/808/. */
  file: string;
  /** Volume, 0..1, to balance the kit. */
  gain: number;
  /** A new sound in the same choke group cuts off the previous one (closed hat stops open hat). */
  choke?: string;
  row: PadRow;
}

const pad = (
  row: PadRow,
  label: string,
  id: string,
  name: string,
  gain: number,
  choke?: string,
): Pad => ({
  id,
  name,
  code: /^\d$/.test(label) ? `Digit${label}` : `Key${label}`,
  label,
  file: `${id}.wav`,
  gain,
  choke,
  row,
});

/** Top row first, as on the keyboard. The basics sit on the bottom row. */
export const PAD_ROWS: Pad[][] = [
  [
    pad("fx", "1", "cymbal", "Cymbal", 0.55),
    pad("fx", "2", "conga-low", "Conga low", 0.8),
    pad("fx", "3", "conga-high", "Conga high", 0.8),
    pad("fx", "4", "clave", "Clave", 0.7),
  ],
  [
    pad("hats", "Q", "hat-closed", "Closed hat", 0.7, "hat"),
    pad("hats", "W", "hat-open", "Open hat", 0.6, "hat"),
    pad("hats", "E", "maracas", "Maracas", 0.7),
    pad("hats", "R", "cowbell", "Cowbell", 0.55),
  ],
  [
    pad("toms", "A", "rim", "Rimshot", 0.8),
    pad("toms", "S", "snare2", "Snare 2", 0.8),
    pad("toms", "D", "tom-low", "Tom low", 0.85),
    pad("toms", "F", "tom-high", "Tom high", 0.85),
  ],
  [
    pad("core", "Z", "kick", "Kick", 1),
    pad("core", "X", "boom", "808 boom", 0.9),
    pad("core", "C", "snare", "Snare", 0.85),
    pad("core", "V", "clap", "Clap", 0.8),
  ],
];

export const PADS: Pad[] = PAD_ROWS.flat();

export const PAD_BY_ID = new Map(PADS.map((p) => [p.id, p]));
export const PAD_BY_CODE = new Map(PADS.map((p) => [p.code, p]));

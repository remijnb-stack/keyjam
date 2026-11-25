// The sample library: every recording in the TR-808 set (public/samples/808).
// Each sound was sampled at five positions of its knobs on the real machine
// (0, 2.5, 5, 7.5 and 10), so a kick comes in 5 tones × 5 decays.

export type GroupId = "kick" | "snare" | "cymbal" | "toms" | "congas" | "hats" | "other";

export interface Family {
  /** Two-letter code from the 808's instrument dial, also the file name prefix. */
  code: string;
  name: string;
  /** The knobs that were sampled, in file name order. */
  knobs: string[];
  group: GroupId;
}

export interface Sample {
  /** File name without extension, e.g. "BD2575". */
  id: string;
  family: Family;
  /** Knob positions (0–10), in the order of `family.knobs`. */
  knobs: number[];
  file: string;
}

export const GROUPS: { id: GroupId; name: string }[] = [
  { id: "kick", name: "Kick" },
  { id: "snare", name: "Snare" },
  { id: "toms", name: "Toms" },
  { id: "congas", name: "Congas" },
  { id: "hats", name: "Hats" },
  { id: "cymbal", name: "Cymbal" },
  { id: "other", name: "Other" },
];

export const FAMILIES: Family[] = [
  { code: "BD", name: "Kick", knobs: ["tone", "decay"], group: "kick" },
  { code: "SD", name: "Snare", knobs: ["tone", "snappy"], group: "snare" },
  { code: "LT", name: "Tom low", knobs: ["tuning"], group: "toms" },
  { code: "MT", name: "Tom mid", knobs: ["tuning"], group: "toms" },
  { code: "HT", name: "Tom high", knobs: ["tuning"], group: "toms" },
  { code: "LC", name: "Conga low", knobs: ["tuning"], group: "congas" },
  { code: "MC", name: "Conga mid", knobs: ["tuning"], group: "congas" },
  { code: "HC", name: "Conga high", knobs: ["tuning"], group: "congas" },
  { code: "CH", name: "Closed hat", knobs: [], group: "hats" },
  { code: "OH", name: "Open hat", knobs: ["decay"], group: "hats" },
  { code: "CY", name: "Cymbal", knobs: ["tone", "decay"], group: "cymbal" },
  { code: "RS", name: "Rimshot", knobs: [], group: "other" },
  { code: "CL", name: "Clave", knobs: [], group: "other" },
  { code: "CP", name: "Clap", knobs: [], group: "other" },
  { code: "MA", name: "Maracas", knobs: [], group: "other" },
  { code: "CB", name: "Cowbell", knobs: [], group: "other" },
];

/** Knob positions as written in the file names ("10" means fully open, 10.0). */
export const KNOB_POSITIONS: [code: string, value: number][] = [
  ["00", 0],
  ["25", 2.5],
  ["50", 5],
  ["75", 7.5],
  ["10", 10],
];

function variants(knobCount: number): [code: string, values: number[]][] {
  if (knobCount === 0) return [["", []]];
  const rest = variants(knobCount - 1);
  return KNOB_POSITIONS.flatMap(([code, value]) =>
    rest.map(([restCode, restValues]): [string, number[]] => [code + restCode, [value, ...restValues]]),
  );
}

export const SAMPLES: Sample[] = FAMILIES.flatMap((family) =>
  variants(family.knobs.length).map(([code, knobs]) => {
    const id = family.code + code;
    return { id, family, knobs, file: `${id}.wav` };
  }),
);

export const SAMPLE_BY_ID = new Map(SAMPLES.map((s) => [s.id, s]));

/** "tone 2.5 · decay 7.5", or "" for a sound without knobs. */
export function variantLabel(sample: Sample): string {
  return sample.family.knobs.map((knob, i) => `${knob} ${sample.knobs[i]}`).join(" · ");
}

/** "Kick · tone 2.5 · decay 7.5" */
export function sampleLabel(sample: Sample): string {
  const variant = variantLabel(sample);
  return variant ? `${sample.family.name} · ${variant}` : sample.family.name;
}

// Turns a key press into an app action. Pure, so the key map can be tested.

export type Action =
  | { type: "pad"; padId: string }
  | { type: "record" }
  | { type: "play" }
  | { type: "undo" }
  | { type: "clear" }
  | { type: "metronome" }
  | { type: "tempo"; delta: number };

export interface KeyPress {
  code: string;
  repeat: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export function actionForKey(key: KeyPress, padIdForCode: (code: string) => string | undefined): Action | null {
  // Leave browser and system shortcuts (Ctrl+R, Cmd+W, ...) alone.
  if (key.ctrlKey || key.metaKey || key.altKey) return null;

  // Holding an arrow keeps changing the tempo; holding anything else does nothing.
  if (key.code === "ArrowUp" || key.code === "ArrowDown") {
    const step = key.shiftKey ? 10 : 1;
    return { type: "tempo", delta: key.code === "ArrowUp" ? step : -step };
  }
  if (key.repeat) return null;

  switch (key.code) {
    case "Space":
      return { type: "record" };
    case "Enter":
    case "NumpadEnter":
      return { type: "play" };
    case "Backspace":
      return { type: "undo" };
    case "Escape":
      return { type: "clear" };
    case "KeyM":
      return { type: "metronome" };
  }

  const padId = padIdForCode(key.code);
  return padId ? { type: "pad", padId } : null;
}

import { describe, expect, it } from "vitest";
import { PAD_BY_CODE } from "../kit";
import { actionForKey, type KeyPress } from "./keyboard";

const press = (code: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  code,
  repeat: false,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});

const action = (key: KeyPress) => actionForKey(key, (code) => PAD_BY_CODE.get(code)?.id);

describe("actionForKey", () => {
  it("plays the pad under each key of the 4x4 grid", () => {
    expect(action(press("KeyZ"))).toEqual({ type: "pad", padId: "kick" });
    expect(action(press("KeyC"))).toEqual({ type: "pad", padId: "snare" });
    expect(action(press("KeyQ"))).toEqual({ type: "pad", padId: "hat-closed" });
    expect(action(press("Digit1"))).toEqual({ type: "pad", padId: "cymbal" });
  });

  it("maps the looper controls", () => {
    expect(action(press("Space"))).toEqual({ type: "record" });
    expect(action(press("Enter"))).toEqual({ type: "play" });
    expect(action(press("Backspace"))).toEqual({ type: "undo" });
    expect(action(press("Escape"))).toEqual({ type: "clear" });
    expect(action(press("KeyM"))).toEqual({ type: "metronome" });
  });

  it("changes the tempo by 1, or 10 with Shift, also while held", () => {
    expect(action(press("ArrowUp"))).toEqual({ type: "tempo", delta: 1 });
    expect(action(press("ArrowDown", { shiftKey: true }))).toEqual({ type: "tempo", delta: -10 });
    expect(action(press("ArrowUp", { repeat: true }))).toEqual({ type: "tempo", delta: 1 });
  });

  it("ignores held keys, so a pad doesn't machine-gun", () => {
    expect(action(press("KeyZ", { repeat: true }))).toBeNull();
    expect(action(press("Space", { repeat: true }))).toBeNull();
  });

  it("leaves browser shortcuts alone", () => {
    expect(action(press("KeyR", { ctrlKey: true }))).toBeNull();
    expect(action(press("KeyW", { metaKey: true }))).toBeNull();
  });

  it("ignores keys without a job", () => {
    expect(action(press("KeyP"))).toBeNull();
  });
});

import "./style.css";
import { AudioEngine } from "./audio/engine";
import { clampOffset, heardTime } from "./audio/latency";
import { Scheduler } from "./audio/scheduler";
import { actionForKey, type Action } from "./input/keyboard";
import { copyKit, DEFAULT_KIT, type Kit, PAD_BY_CODE, PAD_BY_ID, PAD_ROWS, PADS } from "./kit";
import { Looper } from "./looper/looper";
import { loadOffset, saveOffset } from "./settings";
import { cleanSettings } from "./sound";
import { loadSession, saveSession } from "./storage";
import type { Param } from "./ui/sound";
import { View } from "./ui/view";

const SAVE_DELAY_MS = 400;

const looper = new Looper();
const session = loadSession();
let kit: Kit = session.kit;
if (session.loop) looper.importLoop(session.loop);

let engine: AudioEngine | null = null;
let scheduler: Scheduler | null = null;
/** The player's own latency correction for recording, in ms. */
let offsetMs = loadOffset();
/** The pad whose sound the Sound block shows. */
let selectedPad: string | null = null;

const view = new View(
  document.querySelector<HTMLElement>("#app")!,
  PAD_ROWS,
  {
    action: dispatch,
    bars: (bars) => {
      looper.setBars(bars);
      refresh();
    },
    quantize: () => {
      looper.quantize = !looper.quantize;
      refresh();
    },
    offset: (ms) => {
      offsetMs = clampOffset(ms);
      saveOffset(offsetMs);
    },
    start: boot,
    layer: {
      mute: (id) => edit(() => looper.toggleMute(id)),
      solo: (id) => edit(() => looper.toggleSolo(id)),
      remove: (id) => edit(() => looper.deleteLayer(id)),
    },
    editor: {
      toggle: (id, pad, step) => edit(() => looper.toggleStep(id, pad, step)),
      velocity: (id, pad, step, delta) => edit(() => looper.changeVelocity(id, pad, step, delta)),
      endEdit: () => looper.endEdit(),
    },
    select: (padId) => dispatch({ type: "select", padId }),
    sound: {
      choose: (padId, sampleId) => changeSound(padId, { sample: sampleId }, true),
      set: (padId, param: Param, value) => changeSound(padId, { [param]: value }, false),
      reset: () => {
        if (!confirm("Put every pad back to its default sound?")) return;
        kit = copyKit(DEFAULT_KIT);
        void loadKitSamples();
        kitChanged();
      },
      close: deselect,
    },
  },
  () => view.updateLayers(looper),
);
view.updateLayers(looper);
view.showKit(kit, selectedPad);

// Saving: the kit and the loop are saved shortly after each change, and when the page goes away.

let saveTimer: number | undefined;

function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, SAVE_DELAY_MS);
}

function saveNow(): void {
  clearTimeout(saveTimer);
  saveSession(kit, looper.exportLoop());
}

window.addEventListener("pagehide", saveNow);

// Audio

/** Audio may only start after a key press or click, so the first one starts it. */
function boot(): void {
  if (engine) return;
  const audio = new AudioEngine(`${import.meta.env.BASE_URL}samples/808/`);
  engine = audio;
  view.showOverlay("Loading sounds…");

  void loadKitSamples().then(() => {
    view.hideOverlay();
    scheduler = new Scheduler(
      looper,
      () => audio.ctx.currentTime,
      (event, time) => {
        if (event.kind === "click") {
          audio.click(event.accent, time);
          return;
        }
        const pad = PAD_BY_ID.get(event.pad);
        if (!pad) return;
        audio.playPad(pad, kit[pad.id], time, event.velocity);
        view.flash(pad.id, (time - audio.ctx.currentTime) * 1000);
      },
    );
    scheduler.start();
    requestAnimationFrame(frame);
  });
}

/** Loads the samples the kit uses; pads whose sample fails are greyed out. */
async function loadKitSamples(): Promise<void> {
  const audio = engine;
  if (!audio) return;
  await Promise.all(PADS.map((pad) => audio.load(kit[pad.id].sample)));
  view.markUnavailable(PADS.filter((pad) => audio.failed(kit[pad.id].sample)).map((pad) => pad.id));
}

function frame(): void {
  if (engine) {
    view.render(looper, engine.ctx.currentTime);
    view.renderAudio(engine.latency, offsetMs);
  }
  requestAnimationFrame(frame);
}

/** Plays a pad without recording it: for picking and shaping sounds. */
function preview(padId: string): void {
  const pad = PAD_BY_ID.get(padId);
  if (!engine || !pad) return;
  engine.playPad(pad, kit[padId]);
  view.flash(padId);
}

/** Changes part of a pad's sound. A new sample loads first, then plays. */
function changeSound(padId: string, change: Partial<Kit[string]>, play: boolean): void {
  const next = cleanSettings({ ...kit[padId], ...change });
  if (!next) return;
  kit = { ...kit, [padId]: next };
  kitChanged();
  if (!engine || !play) return;
  void engine.load(next.sample).then(() => {
    view.markUnavailable(PADS.filter((pad) => engine!.failed(kit[pad.id].sample)).map((pad) => pad.id));
    preview(padId);
  });
}

function deselect(): void {
  selectedPad = null;
  view.showKit(kit, selectedPad);
}

function kitChanged(): void {
  view.showKit(kit, selectedPad);
  scheduleSave();
}

// Looper

/** After the loop changes, drop what was booked ahead and book it again. */
function resync(): void {
  if (!engine || !scheduler) return;
  engine.cancelAfter(engine.ctx.currentTime);
  view.cancelFlashes();
  scheduler.resync();
}

/** Redraws everything that depends on the looper, and saves. */
function refresh(): void {
  view.updateLayers(looper);
  if (engine) view.render(looper, engine.ctx.currentTime);
  scheduleSave();
}

/** Applies a change to the layers, so the loop and the screen follow it at once. */
function edit(change: () => void): void {
  change();
  resync();
  refresh();
}

/** `pressedAt` is the key event's timestamp (performance.now() clock), if known. */
function dispatch(action: Action, pressedAt?: number): void {
  if (!engine || !scheduler) return;
  void engine.ctx.resume();
  const now = engine.ctx.currentTime;

  switch (action.type) {
    case "pad": {
      const pad = PAD_BY_ID.get(action.padId);
      if (!pad) return;
      engine.playPad(pad, kit[pad.id]);
      // Record the hit where the player meant it: at what they were hearing.
      const handlerDelay = pressedAt === undefined ? 0 : (performance.now() - pressedAt) / 1000;
      looper.hit(pad.id, heardTime({ now, handlerDelay, latency: engine.latency, offsetMs }));
      view.flash(pad.id);
      if (looper.recording) view.updateLayers(looper);
      return;
    }
    case "select":
      selectedPad = action.padId;
      view.showKit(kit, selectedPad);
      preview(action.padId);
      return;
    case "record":
      looper.toggleRecord(now);
      break;
    case "play":
      looper.togglePlay(now);
      break;
    case "dropLast":
      looper.dropLast();
      break;
    case "undo":
      looper.undo();
      break;
    case "clear":
      // Esc closes what's open first (editor, then Sound), so it never clears the loop by surprise.
      if (view.editorOpen) {
        view.closeEditor();
        return;
      }
      if (selectedPad !== null) {
        deselect();
        return;
      }
      looper.clear();
      break;
    case "metronome":
      looper.metronome = !looper.metronome;
      break;
    case "tempo":
      looper.setBpm(looper.bpm + action.delta, now);
      break;
  }
  edit(() => {});
}

window.addEventListener("keydown", (event) => {
  if (!engine) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key === "Shift") return;
    event.preventDefault();
    boot();
    return;
  }
  const action = actionForKey(event, (code) => PAD_BY_CODE.get(code)?.id);
  if (!action) return;
  event.preventDefault();
  dispatch(action, event.timeStamp);
});

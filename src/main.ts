import "./style.css";
import { AudioEngine } from "./audio/engine";
import { clampOffset, heardTime } from "./audio/latency";
import { Scheduler } from "./audio/scheduler";
import { actionForKey, type Action } from "./input/keyboard";
import { PAD_BY_CODE, PAD_BY_ID, PAD_ROWS, PADS } from "./kit";
import { Looper } from "./looper/looper";
import { loadOffset, saveOffset } from "./settings";
import { View } from "./ui/view";

const looper = new Looper();
let engine: AudioEngine | null = null;
let scheduler: Scheduler | null = null;
/** The player's own latency correction for recording, in ms. */
let offsetMs = loadOffset();

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
  },
  () => view.updateLayers(looper),
);
view.updateLayers(looper);

/** Audio may only start after a key press or click, so the first one starts it. */
function boot(): void {
  if (engine) return;
  const audio = new AudioEngine();
  engine = audio;
  view.showOverlay("Loading sounds…");

  void audio.loadKit(PADS, `${import.meta.env.BASE_URL}samples/808/`).then((failed) => {
    view.markUnavailable(failed);
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
        audio.playPad(pad, time, event.velocity);
        view.flash(pad.id, (time - audio.ctx.currentTime) * 1000);
      },
    );
    scheduler.start();
    requestAnimationFrame(frame);
  });
}

function frame(): void {
  if (engine) {
    view.render(looper, engine.ctx.currentTime);
    view.renderAudio(engine.latency, offsetMs);
  }
  requestAnimationFrame(frame);
}

/** After the loop changes, drop what was booked ahead and book it again. */
function resync(): void {
  if (!engine || !scheduler) return;
  engine.cancelAfter(engine.ctx.currentTime);
  view.cancelFlashes();
  scheduler.resync();
}

/** Redraws everything that depends on the looper. */
function refresh(): void {
  view.updateLayers(looper);
  if (engine) view.render(looper, engine.ctx.currentTime);
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
      engine.playPad(pad);
      // Record the hit where the player meant it: at what they were hearing.
      const handlerDelay = pressedAt === undefined ? 0 : (performance.now() - pressedAt) / 1000;
      looper.hit(pad.id, heardTime({ now, handlerDelay, latency: engine.latency, offsetMs }));
      view.flash(pad.id);
      if (looper.recording) view.updateLayers(looper);
      return;
    }
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
      // Esc closes the editor first, so it never clears the loop by surprise.
      if (view.editorOpen) {
        view.closeEditor();
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
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    boot();
    return;
  }
  const action = actionForKey(event, (code) => PAD_BY_CODE.get(code)?.id);
  if (!action) return;
  event.preventDefault();
  dispatch(action, event.timeStamp);
});

import "./style.css";
import { AudioEngine } from "./audio/engine";
import { Scheduler } from "./audio/scheduler";
import { actionForKey, type Action } from "./input/keyboard";
import { PAD_BY_CODE, PAD_BY_ID, PAD_ROWS, PADS } from "./kit";
import { Looper } from "./looper/looper";
import { View } from "./ui/view";

const looper = new Looper();
let engine: AudioEngine | null = null;
let scheduler: Scheduler | null = null;

const view = new View(document.querySelector<HTMLElement>("#app")!, PAD_ROWS, {
  action: dispatch,
  bars: (bars) => {
    looper.setBars(bars);
    if (engine) view.render(looper, engine.ctx.currentTime);
  },
  quantize: () => {
    looper.quantize = !looper.quantize;
    if (engine) view.render(looper, engine.ctx.currentTime);
  },
  start: boot,
});

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
        audio.playPad(pad, time);
        view.flash(pad.id, (time - audio.ctx.currentTime) * 1000);
      },
    );
    scheduler.start();
    requestAnimationFrame(frame);
  });
}

function frame(): void {
  if (engine) view.render(looper, engine.ctx.currentTime);
  requestAnimationFrame(frame);
}

/** After the loop changes, drop what was booked ahead and book it again. */
function resync(): void {
  if (!engine || !scheduler) return;
  engine.cancelAfter(engine.ctx.currentTime);
  view.cancelFlashes();
  scheduler.resync();
}

function dispatch(action: Action): void {
  if (!engine || !scheduler) return;
  void engine.ctx.resume();
  const now = engine.ctx.currentTime;

  switch (action.type) {
    case "pad": {
      const pad = PAD_BY_ID.get(action.padId);
      if (!pad) return;
      engine.playPad(pad);
      looper.hit(pad.id, now);
      view.flash(pad.id);
      return;
    }
    case "record":
      looper.toggleRecord(now);
      break;
    case "play":
      looper.togglePlay(now);
      break;
    case "undo":
      looper.undo();
      break;
    case "clear":
      looper.clear();
      break;
    case "metronome":
      looper.metronome = !looper.metronome;
      break;
    case "tempo":
      looper.setBpm(looper.bpm + action.delta, now);
      break;
  }
  resync();
  view.render(looper, now);
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
  dispatch(action);
});

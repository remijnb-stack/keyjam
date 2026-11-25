# keyjam

Play drums on your computer keyboard, and loop them.

keyjam is a small music toy to find out whether making beats is fun, before
spending money on software or gear. It runs in the browser (Chrome or Edge);
nothing to install.

**Play it:** https://remijnb-stack.github.io/keyjam/

## Playing

Press any key to start, then play the pads:

| Keys | Pads |
| --- | --- |
| `1` `2` `3` `4` | cymbal, conga low, conga high, clave |
| `Q` `W` `E` `R` | closed hat, open hat, maracas, cowbell |
| `A` `S` `D` `F` | rimshot, snare 2, tom low, tom high |
| `Z` `X` `C` `V` | kick, 808 boom, snare, clap |

The grid works like the 4×4 pads on a pad controller. The closed hat cuts off
the open hat, as on a real drum machine.

## Looping

| Key | What it does |
| --- | --- |
| `Space` | Start recording. When stopped, it counts in one bar first. Press again to keep what you played as a layer. |
| `Enter` | Play / stop |
| `Backspace` | Remove the last layer (or the one you're recording) |
| `Ctrl+Z` (`Cmd+Z`) | Undo: brings back edits, deleted layers or a cleared loop |
| `Esc` | Close the layer editor; otherwise stop and clear everything |
| `M` | Metronome on / off |
| `↑` `↓` | Tempo ±1 BPM (with `Shift`: ±10) |

Each time you record, your playing becomes a new layer on top of the loop.
The loop is 1, 2 or 4 bars long; pick the length before you record.

## Layers

The **Layers** side bar shows a card per layer with its hits on a mini
timeline. **M** mutes a layer, **S** solos it (only soloed layers play),
**✕** deletes it. Changes are heard at once.

Click a card to open the layer in the editor below the pads: a row per pad
and a column per 1/16 note. Click an empty cell to add a hit, click a hit to
remove it, and drag up or down (or scroll) on a hit to make it louder or
softer. Hits recorded with quantize off sit in their nearest cell, with a
line showing where they really are.
**Quantize 1/16** snaps what you record to the nearest 1/16 note, so loops
sound tight even when your timing isn't. Turn it off to keep your exact timing.

Nothing is saved yet: reloading the page starts fresh (except the latency
offset below).

## Latency

Sound reaches your ears a little after you press a key. The number at the
bottom of the page (**Latency … ms**) is what the browser reports for your
speakers or headphones. Wired headphones and laptop speakers are usually
10–40 ms; **Bluetooth is often 150–300 ms**, which makes drumming feel late,
and no app can remove that.

Because you play along with what you hear, keyjam records each hit at the
moment you were *hearing* when you pressed the key, so loops line up even
with some latency. If your recorded hits still land late, move **Latency
offset** to the right; early, to the left. The offset is saved in your
browser.

## Development

```bash
npm install
npm run dev     # local server with hot reload
npm run check   # type-check and tests
npm run build   # production build in dist/
```

Vite + TypeScript, no framework. Sound runs on the Web Audio API.

- `src/looper/looper.ts` is the looper's state and timing (tested, no browser APIs).
- `src/audio/` plays sounds, books loop events slightly ahead on the audio clock,
  and corrects recorded hits for latency (`latency.ts`).
- `src/input/keyboard.ts` maps keys to actions; `src/kit.ts` defines the pads.
- `src/ui/view.ts` draws the screen; `layers.ts` is the side bar, `editor.ts` the grid.

Merging to `main` publishes the site to GitHub Pages. Plans are in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Sounds

The drum sounds are Roland TR-808 samples recorded by Michael Fischer in 1994
and shared freely without licensing restrictions (see
[`public/samples/808/TR808.TXT`](public/samples/808/TR808.TXT)). They were
trimmed of trailing silence for keyjam.

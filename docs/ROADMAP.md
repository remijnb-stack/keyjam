# Roadmap

keyjam is built in phases. Each phase is a separate, playable version and
its own pull request.

## v1: drums and looper (this version)

- [x] 16 drum pads on `1234 / QWER / ASDF / ZXCV` (TR-808 samples)
- [x] Metronome, tempo 40–240 BPM (default 90)
- [x] Looper: 1, 2 or 4 bars, one-bar count-in, layers, undo, clear
- [x] Quantize to 1/16 notes (on by default, can be turned off)
- [x] Published on GitHub Pages

## v2: melody

- [ ] `Tab` switches between drum mode and piano mode
- [ ] Piano keys: `A S D F G H J K` white, `W E T Y U O P` black, `Z`/`X` octave down/up
- [ ] Simple synth with two sounds: bass and lead. A note sounds while the key is held
- [ ] Choose a root note and scale (major, minor, minor pentatonic). Keys in
      the scale light up on screen, the root in its own color; others are
      dimmed but playable
- [ ] Export a loop as WAV

## v3: RGB keyboard

- [ ] The same lighting on the real keyboard keys, plus a short flash on each press
- [ ] **Open question:** which keyboard (brand, model, operating system, RGB
      software, per-key lighting or zones). This decides the route: vendor
      SDK, OpenRGB with a small local bridge, or WebHID for QMK/VIA keyboards.

## Later

- [ ] Switch between drum kits
- [ ] Drop in your own samples

# Roadmap

keyjam is built in phases. Each phase is a separate, playable version and
its own pull request.

## v1: drums and looper (this version)

- [x] 16 drum pads on `1234 / QWER / ASDF / ZXCV` (TR-808 samples)
- [x] Metronome, tempo 40–240 BPM (default 90)
- [x] Looper: 1, 2 or 4 bars, one-bar count-in, layers, undo, clear
- [x] Quantize to 1/16 notes (on by default, can be turned off)
- [x] Published on GitHub Pages

## v1.5: latency, layers and kit

Three pull requests, in this order.

**Latency**
- [x] Show the latency the browser reports; warn when it's high (Bluetooth)
- [x] Ask for the smallest audio buffer; soft clipper instead of a compressor (no look-ahead delay)
- [x] Record hits where the player heard them (latency + handler delay), with a
      saved ±100 ms latency offset
- [ ] **Open question:** does the "build-up" on sounds go away with wired
      headphones or speakers instead of Bluetooth?

**Layers (v1.5a)**
- [x] Side bar *Layers* next to the pads (below them on narrow screens): a card
      per layer with name, mini timeline of hits, mute (M), solo (S), delete (✕).
      Mute works at once
- [x] Click a layer to edit it in a full-width grid below: 16 pad rows × 1/16
      columns, playhead. Click to add or remove a hit; scroll or drag on a hit to
      change its volume. Off-grid hits show in the nearest cell with a marker
- [x] `Ctrl+Z` undoes edits and deleted layers; `Backspace` still removes the last layer

**Kit (v1.5b)**
- [x] `Shift`+key or clicking a pad's name selects it; a *Sound* block in the side
      bar shows its settings
- [x] Choose any of the 116 TR-808 samples per pad, grouped by type, with preview
- [x] Per pad: Pitch (±12 semitones), Tone, Length, Volume. Settings apply to
      recorded hits too
- [x] Kit and last loop saved in the browser (layers, hit volumes, mute/solo,
      tempo, loop length, latency offset), with *Reset kit*

## v1.6: mobile

Play and loop on an Android phone (Chrome), held upright, through the phone
speaker. The desktop layout and keys stay as they are. Two pull requests, in
this order; each is tested on the live site after merging.

**Touch pads and phone layout (v1.6a)**
- [ ] A tap anywhere on a pad plays it. On touch screens a small ✎ button in
      the pad's corner selects its sound (today the sound's name covers the
      middle of the pad, so a tap there selects instead of plays)
- [ ] Upright phone layout: tempo −/+, metronome, Rec, Play, Undo and the
      count-in/status bar in a compact bar on top; the 16 pads fill the rest of
      the screen. Loop length, quantize, Clear, Sound, Layers and latency go below
- [ ] Sound starts on the first tap (on release too, not only on press) and
      comes back after switching apps
- [ ] Tapped hits are recorded with the tap's timestamp, like key presses
- [ ] No keyboard text on touch-only screens: key letters on pads, the key
      list, "Press any key", "Press Space", "Shift + key"
- [ ] No zoom, text selection or long-press menu when tapping fast

**Home screen and screen on (v1.6b)**
- [ ] Add to home screen: icon, opens full screen, upright (needs internet)
- [ ] The screen stays on while the loop plays or records
- [ ] **Open question:** what latency does the phone speaker give on the real
      phone, and does recording line up without changing the offset?

**Later on mobile**
- [ ] Layer editor by touch: bigger cells, swipe to scroll, volume per hit
- [ ] Sound block by touch: reset a slider without double-clicking
- [ ] iPhone (Safari): sound with the silent switch on, starting sound, latency
- [ ] Landscape layout, and offline use

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

- [ ] Mute and unmute on the next bar (for live performance)
- [ ] Re-record a layer to replace it
- [ ] Save to a file and share

- [ ] Switch between drum kits
- [ ] Drop in your own samples

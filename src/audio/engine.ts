// Plays the kit and the metronome through Web Audio. Every sound can be
// scheduled at an exact time on the audio clock, which keeps loops tight.

import type { Pad } from "../kit";

interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  start: number;
  choke?: string;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly out: AudioNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    // A gentle limiter so stacked layers don't clip.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    const master = this.ctx.createGain();
    master.gain.value = 0.8;
    master.connect(limiter).connect(this.ctx.destination);
    this.out = master;
  }

  /** Loads every sample. A sample that fails to load leaves its pad silent; returns their ids. */
  async loadKit(pads: Pad[], baseUrl: string): Promise<string[]> {
    const failed: string[] = [];
    await Promise.all(
      pads.map(async (pad) => {
        try {
          const response = await fetch(`${baseUrl}${pad.file}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
          this.buffers.set(pad.id, buffer);
        } catch (error) {
          console.warn(`Couldn't load ${pad.file}`, error);
          failed.push(pad.id);
        }
      }),
    );
    return failed;
  }

  /** Plays a pad now, or at `time` on the audio clock. */
  playPad(pad: Pad, time = this.ctx.currentTime): void {
    const buffer = this.buffers.get(pad.id);
    if (!buffer) return;
    if (pad.choke) this.choke(pad.choke, time);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = pad.gain;
    source.connect(gain).connect(this.out);
    this.start({ source, gain, start: time, choke: pad.choke });
  }

  /** A short metronome blip; higher on the first beat of a bar. */
  click(accent: boolean, time: number): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = accent ? 1760 : 1320;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(accent ? 0.35 : 0.22, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain).connect(this.out);
    this.start({ source: osc, gain, start: time });
    osc.stop(time + 0.06);
  }

  /** Cancels sounds scheduled after `time` that haven't started yet. */
  cancelAfter(time: number): void {
    for (const voice of this.voices) {
      if (voice.start > time) {
        voice.source.stop();
        this.voices.delete(voice);
      }
    }
  }

  private start(voice: Voice): void {
    voice.source.onended = () => {
      voice.source.disconnect();
      voice.gain.disconnect();
      this.voices.delete(voice);
    };
    voice.source.start(voice.start);
    this.voices.add(voice);
  }

  /** Fades out earlier sounds in the group at `time`. */
  private choke(group: string, time: number): void {
    for (const voice of this.voices) {
      if (voice.choke !== group || voice.start >= time) continue;
      voice.gain.gain.setTargetAtTime(0, time, 0.008);
      voice.source.stop(time + 0.05);
    }
  }
}

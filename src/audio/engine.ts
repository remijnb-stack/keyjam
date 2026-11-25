// Plays the kit and the metronome through Web Audio. Every sound can be
// scheduled at an exact time on the audio clock, which keeps loops tight.

import type { Pad } from "../kit";
import { SAMPLE_BY_ID } from "../library";
import { cutoffHz, lengthEnvelope, playbackRate, type SoundSettings } from "../sound";
import { softClipCurve } from "./softClip";

const MASTER_VOLUME = 0.8;
/** The clipper handles peaks up to this many times full scale. */
const CLIP_RANGE = 2;

interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  filter?: BiquadFilterNode;
  start: number;
  choke?: string;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly out: AudioNode;
  /** Decoded samples by library id; null when loading failed. */
  private readonly buffers = new Map<string, AudioBuffer | null>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Set<Voice>();

  /** `baseUrl` is where the sample files are, ending in a slash. */
  constructor(private readonly baseUrl: string) {
    // 0 asks for the smallest audio buffer the device allows.
    this.ctx = new AudioContext({ latencyHint: 0 });
    // Stacked layers can peak above full scale. A soft clipper rounds those
    // peaks off without the ~6 ms look-ahead delay a compressor adds.
    const master = this.ctx.createGain();
    master.gain.value = MASTER_VOLUME / CLIP_RANGE;
    const clipper = this.ctx.createWaveShaper();
    clipper.curve = softClipCurve(2048, CLIP_RANGE);
    clipper.oversample = "none";
    master.connect(clipper).connect(this.ctx.destination);
    this.out = master;
  }

  /** Seconds between playing a sound and hearing it, as far as the browser knows. */
  get latency(): number {
    return (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0);
  }

  /** Loads a sample once and keeps it. Resolves to null if it can't be loaded. */
  load(sampleId: string): Promise<AudioBuffer | null> {
    const cached = this.loading.get(sampleId);
    if (cached) return cached;
    const sample = SAMPLE_BY_ID.get(sampleId);
    const promise = (async () => {
      try {
        if (!sample) throw new Error("unknown sample");
        const response = await fetch(`${this.baseUrl}${sample.file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(sampleId, buffer);
        return buffer;
      } catch (error) {
        console.warn(`Couldn't load sample ${sampleId}`, error);
        this.buffers.set(sampleId, null);
        return null;
      }
    })();
    this.loading.set(sampleId, promise);
    return promise;
  }

  /** True when a sample was tried and couldn't be loaded. */
  failed(sampleId: string): boolean {
    return this.buffers.get(sampleId) === null;
  }

  /**
   * Plays a pad's sound now, or at `time` on the audio clock, at `velocity`
   * (0..1) of its volume. A sample that isn't loaded yet starts loading and
   * plays from the next hit.
   */
  playPad(pad: Pad, sound: SoundSettings, time = this.ctx.currentTime, velocity = 1): void {
    const buffer = this.buffers.get(sound.sample);
    if (!buffer) {
      if (buffer === undefined) void this.load(sound.sample);
      return;
    }
    if (pad.choke) this.choke(pad.choke, time);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const rate = playbackRate(sound.pitch);
    source.playbackRate.value = rate;

    const gain = this.ctx.createGain();
    const volume = sound.volume * velocity;
    gain.gain.value = volume;
    const envelope = lengthEnvelope(buffer.duration, rate, sound.length);
    if (envelope) {
      gain.gain.setValueAtTime(volume, time + envelope.fadeAt);
      gain.gain.linearRampToValueAtTime(0, time + envelope.stopAt);
    }

    let filter: BiquadFilterNode | undefined;
    if (sound.tone < 1) {
      filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoffHz(sound.tone);
      source.connect(filter).connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(this.out);
    this.start({ source, gain, filter, start: time, choke: pad.choke });
    if (envelope) source.stop(time + envelope.stopAt + 0.01);
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
      voice.filter?.disconnect();
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
      voice.gain.gain.cancelScheduledValues(time);
      voice.gain.gain.setTargetAtTime(0, time, 0.008);
      voice.source.stop(time + 0.05);
    }
  }
}

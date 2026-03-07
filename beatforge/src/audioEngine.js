import { FADE_SECONDS, MAX_MASTER_GAIN, TARGET_PEAK } from "./constants.js";

export class AudioEngine {
  constructor() {
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = MAX_MASTER_GAIN;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    this.activeSources = new Set();
  }

  async ensureRunning() {
    if (this.context.state !== "running") await this.context.resume();
  }

  async decodeAndPrepare(arrayBuffer) {
    const decoded = await this.context.decodeAudioData(arrayBuffer.slice(0));
    this.normalizeBuffer(decoded);
    this.applyFade(decoded, FADE_SECONDS);
    return decoded;
  }

  normalizeBuffer(buffer) {
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i]));
    }
    if (!peak) return;
    const scale = TARGET_PEAK / peak;
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < channel.length; i += 1) {
        channel[i] = Math.max(-1, Math.min(1, channel[i] * scale));
      }
    }
  }

  applyFade(buffer, fadeSeconds) {
    const fadeSamples = Math.floor(buffer.sampleRate * fadeSeconds);
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const channel = buffer.getChannelData(c);
      const limit = Math.min(fadeSamples, channel.length);
      for (let i = 0; i < limit; i += 1) {
        channel[i] *= i / limit;
        channel[channel.length - i - 1] *= (limit - i) / limit;
      }
    }
  }

  playBuffer({ buffer, gainValue, when }) {
    if (!buffer) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const release = () => {
      source.removeEventListener("ended", release);
      this.activeSources.delete(source);
    };
    gain.gain.value = Math.max(0, Math.min(1, gainValue));
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.addEventListener("ended", release, { once: true });
    this.activeSources.add(source);
    source.start(when);
  }

  stopAllPlayingSources() {
    for (const source of this.activeSources) {
      try {
        source.stop(0);
      } catch {
        // source may already be stopped/disposed; ignore.
      }
    }
    this.activeSources.clear();
  }

  getPeakLevel() {
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) {
      peak = Math.max(peak, Math.abs((data[i] - 128) / 128));
    }
    return Math.min(1, peak);
  }
}

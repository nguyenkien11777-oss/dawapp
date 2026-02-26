const GRID_SIZE = 3;
const TARGET_PEAK = 0.891;
const MAX_MASTER_GAIN = 0.7;
const FADE_SECONDS = 0.005;

export class AudioEngine {
  constructor() {
    this.context = new AudioContext({ latencyHint: "interactive" });
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = MAX_MASTER_GAIN;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.context.destination);

    this.cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => ({
      buffer: null,
      gain: 1,
      path: null,
      activeSources: new Set()
    }));
  }

  get sampleRate() {
    return this.context.sampleRate;
  }

  getCell(index) {
    return this.cells[index];
  }

  async ensureRunning() {
    if (this.context.state !== "running") {
      await this.context.resume();
    }
  }

  setCellGain(index, gain) {
    this.cells[index].gain = Math.min(1, Math.max(0, gain));
  }

  clearCell(index) {
    const cell = this.cells[index];
    for (const source of cell.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (_) {}
    }
    cell.activeSources.clear();
    cell.buffer = null;
    cell.path = null;
  }

  clearAll() {
    for (let i = 0; i < this.cells.length; i += 1) {
      this.clearCell(i);
    }
  }

  async decodeAndPrepare(arrayBuffer) {
    const decoded = await this.context.decodeAudioData(arrayBuffer.slice(0));
    const resampled = decoded.sampleRate === this.sampleRate
      ? decoded
      : await this.resampleBuffer(decoded, this.sampleRate);
    this.normalizeBuffer(resampled);
    this.applyFade(resampled, FADE_SECONDS);
    return resampled;
  }

  async resampleBuffer(audioBuffer, targetRate) {
    const length = Math.ceil(audioBuffer.duration * targetRate);
    const offline = new OfflineAudioContext(audioBuffer.numberOfChannels, length, targetRate);
    const source = offline.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offline.destination);
    source.start();
    return offline.startRendering();
  }

  normalizeBuffer(buffer) {
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < channel.length; i += 1) {
        peak = Math.max(peak, Math.abs(channel[i]));
      }
    }
    if (peak <= 0) return;
    const scale = TARGET_PEAK / peak;
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < channel.length; i += 1) {
        const sample = channel[i] * scale;
        channel[i] = Math.max(-1, Math.min(1, sample));
      }
    }
  }

  applyFade(buffer, fadeSeconds) {
    const fadeSamples = Math.floor(buffer.sampleRate * fadeSeconds);
    if (fadeSamples <= 0) return;
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const channel = buffer.getChannelData(c);
      const limit = Math.min(fadeSamples, channel.length);
      for (let i = 0; i < limit; i += 1) {
        const fadeIn = i / limit;
        const fadeOut = (limit - i) / limit;
        channel[i] *= fadeIn;
        channel[channel.length - 1 - i] *= fadeOut;
      }
    }
  }

  setCellBuffer(index, buffer, path = null) {
    this.clearCell(index);
    this.cells[index].buffer = buffer;
    this.cells[index].path = path;
  }

  scheduleCell(index, when, playbackRate = 1) {
    const cell = this.cells[index];
    if (!cell.buffer) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();

    source.buffer = cell.buffer;
    source.playbackRate.value = playbackRate;
    gain.gain.value = Math.min(1, Math.max(0, cell.gain));

    source.connect(gain);
    gain.connect(this.masterGain);

    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      cell.activeSources.delete(source);
    };

    cell.activeSources.add(source);
    source.start(when);
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

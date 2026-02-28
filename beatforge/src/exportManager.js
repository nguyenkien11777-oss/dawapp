import { invoke } from "@tauri-apps/api/core";
import { MAX_MASTER_GAIN, STEPS, SUBDIVISIONS, TARGET_PEAK } from "./constants.js";

const tauriInvoke = (cmd, args = {}) => invoke(cmd, args);

function interleave(buffer) {
  const channels = buffer.numberOfChannels;
  const length = buffer.length * channels;
  const result = new Float32Array(length);
  for (let i = 0; i < buffer.length; i += 1) {
    for (let c = 0; c < channels; c += 1) result[i * channels + c] = buffer.getChannelData(c)[i];
  }
  return result;
}

function floatTo16BitPCM(float32) {
  const output = new DataView(new ArrayBuffer(float32.length * 2));
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    output.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(output.buffer);
}

function normalizeRenderedBuffer(buffer) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i]));
  }

  const scale = peak > TARGET_PEAK ? TARGET_PEAK / peak : 1;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = Math.max(-1, Math.min(1, channel[i] * scale));
    }
  }
}

export function encodeWav(audioBuffer) {
  const interleaved = interleave(audioBuffer);
  const pcm = floatTo16BitPCM(interleaved);
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (offset, value) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcm.length, true);

  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  return wav;
}

export class ExportManager {
  constructor(audioEngine, projectManager, sampleBuffers) {
    this.audioEngine = audioEngine;
    this.projectManager = projectManager;
    this.sampleBuffers = sampleBuffers;
  }

  async renderMasterWav() {
    const { bpm, subdivision, userRows, presetRows } = this.projectManager.state.sequencer;
    const stepDuration = (60 / bpm) / SUBDIVISIONS[subdivision];
    const duration = STEPS * stepDuration;
    const sr = this.audioEngine.context.sampleRate;
    const offline = new OfflineAudioContext(2, Math.ceil(duration * sr), sr);
    const master = offline.createGain();
    master.gain.value = MAX_MASTER_GAIN;
    master.connect(offline.destination);

    for (let step = 0; step < STEPS; step += 1) {
      const when = step * stepDuration;
      for (const row of userRows) {
        if (row.mute || !row.steps[step] || !row.samplePath) continue;
        const buf = this.sampleBuffers.get(row.samplePath);
        if (!buf) continue;
        const s = offline.createBufferSource();
        const g = offline.createGain();
        s.buffer = buf;
        g.gain.value = row.volume;
        s.connect(g); g.connect(master); s.start(when);
      }
      for (const row of presetRows) {
        if (row.mute || !row.steps[step] || !row.sound) continue;
        const buf = this.sampleBuffers.get(row.sound);
        if (!buf) continue;
        const s = offline.createBufferSource();
        const g = offline.createGain();
        s.buffer = buf;
        g.gain.value = row.volume;
        s.connect(g); g.connect(master); s.start(when);
      }
    }

    const rendered = await offline.startRendering();
    normalizeRenderedBuffer(rendered);
    return encodeWav(rendered);
  }

  async exportMp3() {
    const outPath = await tauriInvoke("export_mp3_from_master", { project: this.projectManager.currentProject });
    return outPath;
  }
}

import { invoke } from "@tauri-apps/api/core";
import { MAX_MASTER_GAIN, STEPS, TARGET_PEAK } from "./constants.js";

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

function parseWavPcm16(wavBytes) {
  const bytes = wavBytes instanceof Uint8Array ? wavBytes : new Uint8Array(wavBytes);
  if (bytes.length < 44) throw new Error("Invalid WAV: too small");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readString = (offset, length) => {
    let out = "";
    for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
    return out;
  };
  if (readString(0, 4) !== "RIFF" || readString(8, 4) !== "WAVE") {
    throw new Error("Invalid WAV: missing RIFF/WAVE");
  }

  let offset = 12;
  let channels = 2;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = readString(offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    if (chunkId === "fmt ") {
      channels = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }
    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0) throw new Error("Invalid WAV: data chunk missing");
  if (bitsPerSample !== 16) throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`);
  const sampleCount = Math.floor(dataSize / 2);
  const interleaved = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) interleaved[i] = view.getInt16(dataOffset + (i * 2), true);
  return { channels, sampleRate, interleaved };
}

export class ExportManager {
  constructor(audioEngine, projectManager, sampleBuffers) {
    this.audioEngine = audioEngine;
    this.projectManager = projectManager;
    this.sampleBuffers = sampleBuffers;
  }

  async renderMasterWav() {
    const { bpm, userRows, presetRows } = this.projectManager.state.sequencer;
    const stepDuration = (60 / bpm) / 4;
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

  encodeMp3WithLameJs(wavBytes) {
    const lamejs = window?.lamejs;
    if (!lamejs?.Mp3Encoder) {
      throw new Error("LAMEJS_NOT_AVAILABLE: lamejs runtime is not loaded");
    }

    const { channels, sampleRate, interleaved } = parseWavPcm16(wavBytes);
    const mp3Encoder = new lamejs.Mp3Encoder(Math.min(channels, 2), sampleRate, 192);
    const CHUNK = 1152;
    const chunks = [];

    if (channels === 1) {
      for (let i = 0; i < interleaved.length; i += CHUNK) {
        const left = interleaved.subarray(i, i + CHUNK);
        const mp3buf = mp3Encoder.encodeBuffer(left);
        if (mp3buf?.length) chunks.push(Uint8Array.from(mp3buf));
      }
    } else {
      const frameCount = Math.floor(interleaved.length / channels);
      for (let i = 0; i < frameCount; i += CHUNK) {
        const batch = Math.min(CHUNK, frameCount - i);
        const left = new Int16Array(batch);
        const right = new Int16Array(batch);
        for (let j = 0; j < batch; j += 1) {
          left[j] = interleaved[(i + j) * channels];
          right[j] = interleaved[(i + j) * channels + 1];
        }
        const mp3buf = mp3Encoder.encodeBuffer(left, right);
        if (mp3buf?.length) chunks.push(Uint8Array.from(mp3buf));
      }
    }

    const flush = mp3Encoder.flush();
    if (flush?.length) chunks.push(Uint8Array.from(flush));

    const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
    const output = new Uint8Array(totalSize);
    let cursor = 0;
    for (const chunk of chunks) {
      output.set(chunk, cursor);
      cursor += chunk.length;
    }
    return output;
  }
}

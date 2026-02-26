const tauriInvoke = async (cmd, args = {}) => {
  const invoker = window.__TAURI__?.core?.invoke;
  if (!invoker) throw new Error("Tauri runtime not available");
  return invoker(cmd, args);
};

function interleave(buffer) {
  const channels = buffer.numberOfChannels;
  const length = buffer.length * channels;
  const result = new Float32Array(length);
  for (let i = 0; i < buffer.length; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      result[i * channels + c] = buffer.getChannelData(c)[i];
    }
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

function encodeWav(audioBuffer) {
  const interleaved = interleave(audioBuffer);
  const pcm = floatTo16BitPCM(interleaved);
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

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
  constructor(audioEngine, projectManager) {
    this.audioEngine = audioEngine;
    this.projectManager = projectManager;
  }

  async renderLoopCycle() {
    const { bpm, subdivision } = this.projectManager.state;
    const stepDuration = (60 / bpm) / subdivision;
    const totalDuration = stepDuration * 3;
    const sampleRate = this.audioEngine.sampleRate;
    const frameCount = Math.ceil(totalDuration * sampleRate);

    const offline = new OfflineAudioContext(2, frameCount, sampleRate);
    const master = offline.createGain();
    master.gain.value = 0.7;
    master.connect(offline.destination);

    for (let step = 0; step < 3; step += 1) {
      const when = step * stepDuration;
      for (let row = 0; row < 3; row += 1) {
        const idx = row * 3 + step;
        const cell = this.audioEngine.getCell(idx);
        if (!cell.buffer) continue;

        const source = offline.createBufferSource();
        const gain = offline.createGain();
        gain.gain.value = cell.gain;
        source.buffer = cell.buffer;
        source.connect(gain);
        gain.connect(master);
        source.start(when);
      }
    }

    const rendered = await offline.startRendering();
    return encodeWav(rendered);
  }

  async exportMp3() {
    if (!this.projectManager.currentProject) {
      throw new Error("Select a project before exporting.");
    }
    const wav = await this.renderLoopCycle();
    const outPath = await tauriInvoke("export_mp3", {
      project: this.projectManager.currentProject,
      wavBytes: Array.from(wav)
    });
    return outPath;
  }
}

export { encodeWav };

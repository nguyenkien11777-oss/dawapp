const MAX_DURATION_SECONDS = 60;

export class Recorder {
  constructor(audioEngine) {
    this.audioEngine = audioEngine;
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.stopTimer = null;
    this.recordingCell = null;
    this.listeners = new Set();
  }

  get isRecording() {
    return Boolean(this.mediaRecorder && this.mediaRecorder.state === "recording");
  }

  async start(cellIndex) {
    if (this.isRecording) {
      throw new Error("Only one recording can run at a time.");
    }
    this.recordingCell = cellIndex;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: "audio/webm" });
    this.chunks = [];

    this.mediaRecorder.addEventListener("dataavailable", (evt) => {
      if (evt.data.size > 0) this.chunks.push(evt.data);
    });

    this.mediaRecorder.start(50);
    this.notify("record-start", { cellIndex });

    this.stopTimer = window.setTimeout(() => {
      if (this.isRecording) this.stop();
    }, MAX_DURATION_SECONDS * 1000);
  }

  async stop() {
    if (!this.mediaRecorder) return null;

    const recorder = this.mediaRecorder;
    const stream = this.stream;

    const blob = await new Promise((resolve) => {
      recorder.addEventListener("stop", () => {
        resolve(new Blob(this.chunks, { type: "audio/webm" }));
      }, { once: true });
      recorder.stop();
    });

    this.cleanup();
    const arrayBuffer = await blob.arrayBuffer();
    const prepared = await this.audioEngine.decodeAndPrepare(arrayBuffer);

    this.notify("record-stop", { cellIndex: this.recordingCell, buffer: prepared });
    this.recordingCell = null;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    return prepared;
  }

  on(event, handler) {
    this.listeners.add({ event, handler });
  }

  off(event, handler) {
    for (const listener of this.listeners) {
      if (listener.event === event && listener.handler === handler) {
        this.listeners.delete(listener);
      }
    }
  }

  notify(event, payload) {
    for (const listener of this.listeners) {
      if (listener.event === event) {
        listener.handler(payload);
      }
    }
  }

  cleanup() {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.mediaRecorder) {
      this.mediaRecorder.stream?.getTracks().forEach((track) => track.stop());
    }
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
  }
}

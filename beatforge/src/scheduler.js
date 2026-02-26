const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_TIME = 0.1;

export class Scheduler {
  constructor(audioEngine, onStep) {
    this.audioEngine = audioEngine;
    this.onStep = onStep;
    this.timerId = null;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this.bpm = 120;
    this.subdivision = 4;
    this.isPlaying = false;
  }

  updateTempo({ bpm, subdivision }) {
    this.bpm = Math.max(20, Math.min(300, bpm));
    this.subdivision = subdivision;
  }

  get stepDuration() {
    return (60 / this.bpm) / this.subdivision;
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.audioEngine.context.currentTime + 0.05;
    this.tick();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.currentStep = 0;
  }

  tick() {
    if (!this.isPlaying) return;

    while (this.nextStepTime < this.audioEngine.context.currentTime + SCHEDULE_AHEAD_TIME) {
      const column = this.currentStep % 3;
      this.onStep({ step: this.currentStep, column, when: this.nextStepTime });
      this.nextStepTime += this.stepDuration;
      this.currentStep += 1;
    }

    this.timerId = window.setTimeout(() => this.tick(), LOOKAHEAD_MS);
  }
}

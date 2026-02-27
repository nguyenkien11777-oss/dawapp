import { LOOKAHEAD_MS, SCHEDULE_AHEAD_TIME, STEPS, SUBDIVISIONS } from "./constants.js";

export class Scheduler {
  constructor(audioEngine, onStep) {
    this.audioEngine = audioEngine;
    this.onStep = onStep;
    this.timerId = null;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this.bpm = 120;
    this.subdivision = "1/16";
    this.isPlaying = false;
  }

  updateTempo({ bpm, subdivision }) {
    this.bpm = Math.max(20, Math.min(300, Number(bpm) || 120));
    if (SUBDIVISIONS[subdivision]) this.subdivision = subdivision;
  }

  get stepDuration() {
    const secondsPerBeat = 60 / this.bpm;
    return secondsPerBeat / SUBDIVISIONS[this.subdivision];
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
      this.onStep({ step: this.currentStep, when: this.nextStepTime });
      this.nextStepTime += this.stepDuration;
      this.currentStep = (this.currentStep + 1) % STEPS;
    }
    this.timerId = window.setTimeout(() => this.tick(), LOOKAHEAD_MS);
  }
}

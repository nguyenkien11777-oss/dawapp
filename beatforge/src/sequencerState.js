import {
  DEFAULT_BPM,
  PRESET_ROWS_DEFAULT,
  PRESET_ROWS_MAX,
  REC_ROWS_DEFAULT,
  REC_ROWS_MAX,
  STEPS
} from "./constants.js";

const mkSteps = () => Array.from({ length: STEPS }, () => false);

const mkRecRow = (id) => ({
  id,
  name: `REC ${id + 1}`,
  steps: mkSteps(),
  volume: 1,
  mute: false,
  samplePath: null
});

const mkPresetRow = (id, sound = null) => ({
  id,
  name: `DRUM ${id + 1}`,
  steps: mkSteps(),
  volume: 1,
  mute: false,
  sound
});

const defaultMusic = () => ({
  trackPath: null,
  enabled: false,
  mode: "independent",
  volume: 1,
  startOffset: 0
});

export class SequencerState {
  constructor() {
    this.meta = {
      name: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.sequencer = {
      bpm: DEFAULT_BPM,
      steps: STEPS,
      userRows: Array.from({ length: REC_ROWS_DEFAULT }, (_, i) => mkRecRow(i)),
      presetRows: Array.from({ length: PRESET_ROWS_DEFAULT }, (_, i) => mkPresetRow(i))
    };
    this.music = defaultMusic();
    this.render = {
      hasMasterWav: false,
      lastExportedAt: null
    };
  }

  static fromJSON(data) {
    const state = new SequencerState();
    Object.assign(state, data);
    state.sequencer.steps = STEPS;
    state.sequencer.userRows = (state.sequencer.userRows ?? []).map((row, i) => ({ ...mkRecRow(i), ...row, id: i, steps: (row.steps ?? mkSteps()).slice(0, STEPS) }));
    state.sequencer.presetRows = (state.sequencer.presetRows ?? []).map((row, i) => ({ ...mkPresetRow(i), ...row, id: i, steps: (row.steps ?? mkSteps()).slice(0, STEPS) }));
    state.music = { ...defaultMusic(), ...(state.music ?? {}) };
    return state;
  }

  touch() {
    this.meta.updatedAt = new Date().toISOString();
  }

  setTempo(bpm) {
    this.sequencer.bpm = bpm;
    this.touch();
  }

  addRecRow() {
    if (this.sequencer.userRows.length >= REC_ROWS_MAX) return false;
    this.sequencer.userRows.push(mkRecRow(this.sequencer.userRows.length));
    this.touch();
    return true;
  }

  addPresetRow(sound = null) {
    if (this.sequencer.presetRows.length >= PRESET_ROWS_MAX) return false;
    this.sequencer.presetRows.push(mkPresetRow(this.sequencer.presetRows.length, sound));
    this.touch();
    return true;
  }
}

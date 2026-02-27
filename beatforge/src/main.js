import { AudioEngine } from "./audioEngine.js";
import { Scheduler } from "./scheduler.js";
import { ProjectManager } from "./projectManager.js";
import { ExportManager, encodeWav } from "./exportManager.js";
import { UI } from "./ui.js";
import { Dashboard } from "./dashboard.js";
import { Recorder } from "./recorder.js";
import { DEFAULT_BPM, DEFAULT_SUBDIVISION } from "./constants.js";

const bpmInput = document.getElementById("bpmInput");
const subdivisionSelect = document.getElementById("subdivisionSelect");
const playBtn = document.getElementById("playBtn");
const recordMasterBtn = document.getElementById("recordMasterBtn");
const addRecRowBtn = document.getElementById("addRecRowBtn");
const addPresetRowBtn = document.getElementById("addPresetRowBtn");
const backBtn = document.getElementById("backBtn");
const saveBtn = document.getElementById("saveBtn");
const exportBtn = document.getElementById("exportBtn");
const newProjectBtn = document.getElementById("newProjectBtn");
const projectTitle = document.getElementById("projectTitle");

const audioEngine = new AudioEngine();
const ui = new UI();
const projectManager = new ProjectManager();
const sampleBuffers = new Map();
const exportManager = new ExportManager(audioEngine, projectManager, sampleBuffers);
const dashboard = new Dashboard(projectManager, ui);
const recorder = new Recorder(audioEngine);

const TRANSPORT_STATE = {
  IDLE: "idle",
  PLAYING: "playing",
  MASTER_RECORDING: "masterRecording"
};

let transportState = TRANSPORT_STATE.IDLE;
let transportTimer = null;
let elapsed = 0;
let activeRecRow = null;
let inFlightRecordingPersist = false;

const scheduler = new Scheduler(audioEngine, ({ step, when }) => {
  const { userRows, presetRows } = projectManager.state.sequencer;
  for (const row of userRows) {
    if (!row.steps[step] || row.mute || !row.samplePath) continue;
    audioEngine.playBuffer({ buffer: sampleBuffers.get(row.samplePath), gainValue: row.volume, when });
  }
  for (const row of presetRows) {
    if (!row.steps[step] || row.mute || !row.sound) continue;
    audioEngine.playBuffer({ buffer: sampleBuffers.get(row.sound), gainValue: row.volume, when });
  }
  ui.highlightStep(step);
});

async function persistRecordedBuffer(rowIndex, buffer) {
  if (!buffer || rowIndex == null || !projectManager.currentProject) return;
  const row = projectManager.state.sequencer.userRows[rowIndex];
  if (!row) return;

  inFlightRecordingPersist = true;
  try {
    const wav = encodeWav(buffer);
    const samplePath = await projectManager.writeRecordingWav(rowIndex, wav);
    sampleBuffers.set(samplePath, buffer);
    row.samplePath = samplePath;
    projectManager.markDirty();
    updateHeader();
    await renderSequencer();
  } finally {
    inFlightRecordingPersist = false;
  }
}

recorder.on("record-start", async ({ cellIndex }) => {
  activeRecRow = cellIndex;
  await renderSequencer();
});

recorder.on("record-stop", async ({ cellIndex, buffer }) => {
  activeRecRow = null;
  try {
    await persistRecordedBuffer(cellIndex, buffer);
    ui.log(`Recorded REC ${Number(cellIndex) + 1}`);
  } catch (error) {
    await renderSequencer();
    ui.log(`REC persist failed: ${error?.message ?? "unknown error"}`);
  }
});

function isTransportActive() {
  return transportState !== TRANSPORT_STATE.IDLE;
}

function syncTransportUi() {
  playBtn.textContent = transportState === TRANSPORT_STATE.IDLE ? "PLAY" : "STOP";
  playBtn.disabled = transportState === TRANSPORT_STATE.MASTER_RECORDING;
  recordMasterBtn.textContent = transportState === TRANSPORT_STATE.MASTER_RECORDING ? "STOP RECORD" : "RECORD MASTER";
  recordMasterBtn.classList.toggle("recording", transportState === TRANSPORT_STATE.MASTER_RECORDING);
}

function syncTransportLocks() {
  const locked = isTransportActive();
  addRecRowBtn.disabled = locked;
  addPresetRowBtn.disabled = locked;
}

function transitionTransport(nextState) {
  if (nextState === transportState) return;
  if (transportState === TRANSPORT_STATE.MASTER_RECORDING && nextState === TRANSPORT_STATE.PLAYING) return;

  if (nextState === TRANSPORT_STATE.IDLE) {
    if (scheduler.isPlaying) scheduler.stop();
    ui.highlightStep(-1);
  } else if (nextState === TRANSPORT_STATE.PLAYING) {
    if (!scheduler.isPlaying) scheduler.start();
  } else if (nextState === TRANSPORT_STATE.MASTER_RECORDING) {
    if (!scheduler.isPlaying) scheduler.start();
  }

  transportState = nextState;
  syncTransportUi();
  syncTransportLocks();
}

function updateHeader() {
  const dirty = projectManager.dirty ? " *" : "";
  projectTitle.textContent = `${projectManager.currentProject ?? "No Project"}${dirty}`;
}

async function loadSamplesForState() {
  const sampleList = await projectManager.listDrumSamples();
  for (const sample of sampleList) {
    if (sampleBuffers.has(sample)) continue;
    const bytes = await projectManager.readFileBytes(sample);
    const prepared = await audioEngine.decodeAndPrepare(Uint8Array.from(bytes).buffer);
    sampleBuffers.set(sample, prepared);
  }
  for (const row of projectManager.state.sequencer.userRows) {
    if (!row.samplePath || sampleBuffers.has(row.samplePath)) continue;
    try {
      const bytes = await projectManager.readFileBytes(row.samplePath);
      const prepared = await audioEngine.decodeAndPrepare(Uint8Array.from(bytes).buffer);
      sampleBuffers.set(row.samplePath, prepared);
    } catch (_) {}
  }
  return sampleList;
}

async function renderSequencer() {
  const state = projectManager.state.sequencer;
  const samples = await loadSamplesForState();
  bpmInput.value = String(state.bpm ?? DEFAULT_BPM);
  subdivisionSelect.value = state.subdivision ?? DEFAULT_SUBDIVISION;
  scheduler.updateTempo({ bpm: state.bpm, subdivision: state.subdivision });

  ui.renderRows(state.userRows, ui.recRows, "rec", {
    recordingRow: activeRecRow,
    lockRec: isTransportActive(),
    onRec: async (rowIndex) => {
      if (!projectManager.currentProject) return;
      if (isTransportActive()) return;
      if (recorder.isRecording && activeRecRow !== rowIndex) return;
      try {
        if (recorder.isRecording && activeRecRow === rowIndex) {
          await recorder.stop();
          return;
        }
        await audioEngine.ensureRunning();
        await recorder.start(rowIndex);
      } catch (error) {
        activeRecRow = null;
        await renderSequencer();
        ui.log(`REC failed: ${error?.message ?? "unknown error"}`);
      }
    },
    onStep: (_, row, step) => { state.userRows[row].steps[step] = !state.userRows[row].steps[step]; projectManager.markDirty(); updateHeader(); renderSequencer(); },
    onDelete: (_, row) => { if (isTransportActive() || recorder.isRecording) return; state.userRows.splice(row, 1); state.userRows.forEach((r, i) => { r.id = i; }); projectManager.markDirty(); updateHeader(); renderSequencer(); },
    onVolume: (_, row, value) => { state.userRows[row].volume = value; projectManager.markDirty(); updateHeader(); },
    onMute: (_, row) => { state.userRows[row].mute = !state.userRows[row].mute; projectManager.markDirty(); updateHeader(); renderSequencer(); }
  });

  ui.renderRows(state.presetRows, ui.presetRows, "preset", {
    samples,
    lockSoundChange: isTransportActive(),
    onStep: (_, row, step) => { state.presetRows[row].steps[step] = !state.presetRows[row].steps[step]; projectManager.markDirty(); updateHeader(); renderSequencer(); },
    onDelete: (_, row) => { if (isTransportActive()) return; state.presetRows.splice(row, 1); state.presetRows.forEach((r, i) => { r.id = i; }); projectManager.markDirty(); updateHeader(); renderSequencer(); },
    onVolume: (_, row, value) => { state.presetRows[row].volume = value; projectManager.markDirty(); updateHeader(); },
    onMute: (_, row) => { state.presetRows[row].mute = !state.presetRows[row].mute; projectManager.markDirty(); updateHeader(); renderSequencer(); },
    onSound: (row, sound) => { if (isTransportActive()) return; state.presetRows[row].sound = sound || null; projectManager.markDirty(); updateHeader(); }
  });

  syncTransportLocks();
}

async function openProject(name) {
  await projectManager.loadProject(name);
  activeRecRow = null;
  updateHeader();
  await renderSequencer();
  ui.showSequencer();
}

async function refreshDashboard() {
  await dashboard.refresh({
    open: openProject,
    rename: async (name) => {
      const newName = prompt("Rename project", name);
      if (!newName || newName === name) return;
      await projectManager.renameProject(name, newName);
      await refreshDashboard();
    },
    duplicate: async (name) => {
      const target = prompt("Duplicate project as", `${name}_copy`);
      if (!target) return;
      await projectManager.duplicateProject(name, target);
      await refreshDashboard();
    },
    delete: async (name) => {
      if (!confirm(`Delete ${name}?`)) return;
      await projectManager.deleteProject(name);
      await refreshDashboard();
    }
  });
}

newProjectBtn.onclick = async () => {
  const name = prompt("New project name", `project_${Date.now()}`);
  if (!name) return;
  await projectManager.createProject(name);
  await openProject(name);
};

backBtn.onclick = async () => {
  if (transportState === TRANSPORT_STATE.MASTER_RECORDING || recorder.isRecording) return;
  if (projectManager.dirty && !confirm("Unsaved changes. Exit project?")) return;
  ui.showDashboard();
  await refreshDashboard();
};

saveBtn.onclick = async () => {
  if (transportState === TRANSPORT_STATE.MASTER_RECORDING || recorder.isRecording || inFlightRecordingPersist) return ui.log("Cannot save while recording or persisting.");
  await projectManager.saveProject();
  updateHeader();
  ui.log("Project saved.");
};

addRecRowBtn.onclick = async () => {
  if (isTransportActive()) return;
  if (projectManager.state.addRecRow()) { projectManager.markDirty(); updateHeader(); await renderSequencer(); }
};
addPresetRowBtn.onclick = async () => {
  if (isTransportActive()) return;
  if (projectManager.state.addPresetRow()) { projectManager.markDirty(); updateHeader(); await renderSequencer(); }
};

bpmInput.oninput = () => {
  const bpm = Number(bpmInput.value);
  const subdivision = subdivisionSelect.value;
  projectManager.state.setTempo(bpm, subdivision);
  scheduler.updateTempo({ bpm, subdivision });
  projectManager.markDirty();
  updateHeader();
};

subdivisionSelect.onchange = () => {
  const bpm = Number(bpmInput.value);
  const subdivision = subdivisionSelect.value;
  projectManager.state.setTempo(bpm, subdivision);
  scheduler.updateTempo({ bpm, subdivision });
  projectManager.markDirty();
  updateHeader();
};

playBtn.onclick = async () => {
  if (transportState === TRANSPORT_STATE.MASTER_RECORDING) return;
  await audioEngine.ensureRunning();
  if (transportState === TRANSPORT_STATE.IDLE) {
    transitionTransport(TRANSPORT_STATE.PLAYING);
  } else {
    transitionTransport(TRANSPORT_STATE.IDLE);
  }
};

recordMasterBtn.onclick = async () => {
  await audioEngine.ensureRunning();
  if (transportState !== TRANSPORT_STATE.MASTER_RECORDING) {
    transitionTransport(TRANSPORT_STATE.MASTER_RECORDING);
    elapsed = 0;
    ui.setTimer(0);
    clearInterval(transportTimer);
    transportTimer = setInterval(() => { elapsed += 1; ui.setTimer(elapsed); }, 1000);
  } else {
    clearInterval(transportTimer);
    ui.setTimer(0);
    const wav = await exportManager.renderMasterWav();
    await projectManager.writeMasterWav(wav);
    projectManager.state.render.hasMasterWav = true;
    projectManager.markDirty();
    updateHeader();
    transitionTransport(TRANSPORT_STATE.IDLE);
  }
};

exportBtn.onclick = async () => {
  const path = await exportManager.exportMp3();
  ui.log(`Exported MP3: ${path}`);
};

syncTransportUi();
syncTransportLocks();

(async () => {
  ui.showDashboard();
  await refreshDashboard();
})();

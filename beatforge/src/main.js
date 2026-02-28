import { getCurrentWindow } from "@tauri-apps/api/window";
import { AudioEngine } from "./audioEngine.js";
import { Scheduler } from "./scheduler.js";
import { ProjectManager } from "./projectManager.js";
import { ExportManager, encodeWav } from "./exportManager.js";
import { UI } from "./ui.js";
import { Dashboard } from "./dashboard.js";
import { Recorder } from "./recorder.js";
import { DEFAULT_BPM, DEFAULT_SUBDIVISION } from "./constants.js";

const appWindow = getCurrentWindow();

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
const missingSampleWarnings = new Set();
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
let inFlightMasterExport = false;
let inFlightSave = false;
let inFlightExportMp3 = false;
let inFlightDashboardAction = false;
let handlingClose = false;

const scheduler = new Scheduler(audioEngine, ({ step, when }) => {
  const { userRows, presetRows } = projectManager.state.sequencer;
  for (const row of userRows) {
    if (!row.steps[step] || row.mute || !row.samplePath) continue;
    const key = row.samplePath;
    const buffer = sampleBuffers.get(key);
    if (!buffer) {
      if (!missingSampleWarnings.has(key)) {
        missingSampleWarnings.add(key);
        ui.log(`Missing sample buffer: ${key}`);
      }
      continue;
    }
    audioEngine.playBuffer({ buffer, gainValue: row.volume, when });
  }
  for (const row of presetRows) {
    if (!row.steps[step] || row.mute || !row.sound) continue;
    const key = row.sound;
    const buffer = sampleBuffers.get(key);
    if (!buffer) {
      if (!missingSampleWarnings.has(key)) {
        missingSampleWarnings.add(key);
        ui.log(`Missing sample buffer: ${key}`);
      }
      continue;
    }
    audioEngine.playBuffer({ buffer, gainValue: row.volume, when });
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
    missingSampleWarnings.delete(samplePath);
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

function clearMasterTimer() {
  if (!transportTimer) return;
  clearInterval(transportTimer);
  transportTimer = null;
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
    missingSampleWarnings.delete(sample);
  }
  for (const row of projectManager.state.sequencer.userRows) {
    if (!row.samplePath || sampleBuffers.has(row.samplePath)) continue;
    try {
      const bytes = await projectManager.readProjectFileBytes(row.samplePath);
      const prepared = await audioEngine.decodeAndPrepare(Uint8Array.from(bytes).buffer);
      sampleBuffers.set(row.samplePath, prepared);
      missingSampleWarnings.delete(row.samplePath);
    } catch (_) {
      if (!missingSampleWarnings.has(row.samplePath)) {
        missingSampleWarnings.add(row.samplePath);
        ui.log(`Missing recorded file: ${row.samplePath}`);
      }
    }
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
  missingSampleWarnings.clear();
  updateHeader();
  await renderSequencer();
  ui.showSequencer();
}

async function runDashboardAction(task) {
  if (inFlightDashboardAction) return;
  inFlightDashboardAction = true;
  try {
    await task();
  } finally {
    inFlightDashboardAction = false;
  }
}

async function refreshDashboard() {
  await dashboard.refresh({
    open: async (name) => runDashboardAction(async () => { await openProject(name); }),
    rename: async (name) => runDashboardAction(async () => {
      const newName = prompt("Rename project", name);
      if (!newName || newName === name) return;
      await projectManager.renameProject(name, newName);
      await refreshDashboard();
    }),
    duplicate: async (name) => runDashboardAction(async () => {
      const target = prompt("Duplicate project as", `${name}_copy`);
      if (!target) return;
      await projectManager.duplicateProject(name, target);
      await refreshDashboard();
    }),
    delete: async (name) => runDashboardAction(async () => {
      if (!confirm(`Delete ${name}?`)) return;
      await projectManager.deleteProject(name);
      await refreshDashboard();
    })
  });
}

newProjectBtn.onclick = async () => {
  if (inFlightDashboardAction) return;
  const name = prompt("New project name", `project_${Date.now()}`);
  if (!name) return;
  await runDashboardAction(async () => {
    await projectManager.createProject(name);
    await openProject(name);
  });
};

async function saveCurrentProject() {
  if (inFlightSave || inFlightRecordingPersist || recorder.isRecording || inFlightMasterExport) return false;
  inFlightSave = true;
  try {
    await projectManager.saveProject();
    updateHeader();
    ui.log("Project saved.");
    return true;
  } catch (error) {
    ui.log(`Save failed: ${error?.message ?? "unknown error"}`);
    return false;
  } finally {
    inFlightSave = false;
  }
}

backBtn.onclick = async () => {
  if (transportState === TRANSPORT_STATE.MASTER_RECORDING || recorder.isRecording || inFlightMasterExport) return;
  if (projectManager.dirty) {
    const shouldSave = confirm("Unsaved changes. Save before exit?");
    if (shouldSave) {
      const saved = await saveCurrentProject();
      if (!saved) return;
    } else if (!confirm("Exit without saving?")) {
      return;
    }
  }
  ui.showDashboard();
  await refreshDashboard();
};

saveBtn.onclick = async () => {
  if (transportState === TRANSPORT_STATE.MASTER_RECORDING || recorder.isRecording || inFlightRecordingPersist || inFlightSave) {
    return ui.log("Cannot save while recording, persisting, or saving.");
  }
  await saveCurrentProject();
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
    clearMasterTimer();
    transportTimer = setInterval(() => { elapsed += 1; ui.setTimer(elapsed); }, 1000);
  } else {
    if (inFlightMasterExport) return;
    inFlightMasterExport = true;
    clearMasterTimer();
    ui.setTimer(0);
    try {
      const wav = await exportManager.renderMasterWav();
      await projectManager.writeMasterWav(wav);
      projectManager.state.render.hasMasterWav = true;
      projectManager.markDirty();
      updateHeader();
    } catch (error) {
      ui.log(`Master record finalize failed: ${error?.message ?? "unknown error"}`);
    } finally {
      inFlightMasterExport = false;
      transitionTransport(TRANSPORT_STATE.IDLE);
    }
  }
};

exportBtn.onclick = async () => {
  if (inFlightExportMp3) return;
  inFlightExportMp3 = true;
  try {
    const path = await exportManager.exportMp3();
    ui.log(`Exported MP3: ${path}`);
  } catch (error) {
    ui.log(`Export MP3 failed: ${error?.message ?? "unknown error"}`);
  } finally {
    inFlightExportMp3 = false;
  }
};

syncTransportUi();
syncTransportLocks();

(async () => {
  await appWindow.onCloseRequested(async (event) => {
    if (handlingClose) return;
    if (inFlightSave) {
      event.preventDefault();
      ui.log("Save in progress");
      return;
    }
    if (!projectManager.dirty) return;
    event.preventDefault();

    handlingClose = true;
    try {
      const shouldSave = confirm("Unsaved changes. Save before closing?");
      if (shouldSave) {
        const saved = await saveCurrentProject();
        if (saved) await appWindow.close();
      } else if (confirm("Close without saving?")) {
        await appWindow.close();
      }
    } finally {
      handlingClose = false;
    }
  });

  ui.showDashboard();
  await refreshDashboard();
})();

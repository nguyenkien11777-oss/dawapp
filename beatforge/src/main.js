import { getCurrentWindow } from "@tauri-apps/api/window";
import { AudioEngine } from "./audioEngine.js";
import { Scheduler } from "./scheduler.js";
import { ProjectManager } from "./projectManager.js";
import { ExportManager, encodeWav } from "./exportManager.js";
import { UI } from "./ui.js";
import { Dashboard } from "./dashboard.js";
import { Recorder } from "./recorder.js";
import { BPM_PRESETS, DEFAULT_BPM } from "./constants.js";

const appWindow = getCurrentWindow();

const bpmInput = document.getElementById("bpmInput");
const bpmPresetSelect = document.getElementById("bpmPresetSelect");
const bpmValue = document.getElementById("bpmValue");
const playBtn = document.getElementById("playBtn");
const recordMasterBtn = document.getElementById("recordMasterBtn");
const addRecRowBtn = document.getElementById("addRecRowBtn");
const addPresetRowBtn = document.getElementById("addPresetRowBtn");
const backBtn = document.getElementById("backBtn");
const newProjectBtn = document.getElementById("newProjectBtn");
const projectTitle = document.getElementById("projectTitle");
const fileMenuBtn = document.getElementById("fileMenuBtn");
const optionMenuBtn = document.getElementById("optionMenuBtn");
const importMenuBtn = document.getElementById("importMenuBtn");
const fileMenu = document.getElementById("fileMenu");
const optionMenu = document.getElementById("optionMenu");
const importMenu = document.getElementById("importMenu");
const menuSave = document.getElementById("menuSave");
const menuSaveAs = document.getElementById("menuSaveAs");
const menuRename = document.getElementById("menuRename");
const menuImportWav = document.getElementById("menuImportWav");
const toolAudioEditor = document.getElementById("toolAudioEditor");
const toolTrim = document.getElementById("toolTrim");
const toolNormalize = document.getElementById("toolNormalize");
const toolReverse = document.getElementById("toolReverse");
const toolGain = document.getElementById("toolGain");
const musicSyncToggle = document.getElementById("musicSyncToggle");
const musicSmoothSeekToggle = document.getElementById("musicSmoothSeekToggle");
const musicImportBtn = document.getElementById("musicImportBtn");
const musicRemoveBtn = document.getElementById("musicRemoveBtn");
const musicFileInput = document.getElementById("musicFileInput");
const musicPlayToggleBtn = document.getElementById("musicPlayToggleBtn");
const musicVolume = document.getElementById("musicVolume");
const musicStartOffset = document.getElementById("musicStartOffset");
const trackArc = document.getElementById("trackArc");
const vinylDisc = document.getElementById("vinylDisc");
const musicSeekBar = document.getElementById("musicSeekBar");
const musicSeekTime = document.getElementById("musicSeekTime");
const musicNoteField = document.getElementById("musicNoteField");
const modalOverlay = document.getElementById("modalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalActions = document.getElementById("modalActions");
const audioEditorProjectTitle = document.getElementById("audioEditorProjectTitle");
const audioEditorBackBtn = document.getElementById("audioEditorBackBtn");
const editorRecSelect = document.getElementById("editorRecSelect");
const editorPreviewBtn = document.getElementById("editorPreviewBtn");
const editorWaveBars = document.getElementById("editorWaveBars");
const editorTrimStart = document.getElementById("editorTrimStart");
const editorTrimEnd = document.getElementById("editorTrimEnd");
const editorPitch = document.getElementById("editorPitch");
const editorPitchValue = document.getElementById("editorPitchValue");
const editorTone = document.getElementById("editorTone");
const editorToneValue = document.getElementById("editorToneValue");
const editorVoice = document.getElementById("editorVoice");
const editorResetBtn = document.getElementById("editorResetBtn");
const editorApplyBtn = document.getElementById("editorApplyBtn");
const drumImportInput = document.createElement("input");
drumImportInput.type = "file";
drumImportInput.accept = ".wav,audio/wav";
drumImportInput.hidden = true;
document.body.appendChild(drumImportInput);

const audioEngine = new AudioEngine();
const ui = new UI();
const projectManager = new ProjectManager();
const sampleBuffers = new Map();
const missingSampleWarnings = new Set();
const exportManager = new ExportManager(audioEngine, projectManager, sampleBuffers);
const dashboard = new Dashboard(projectManager, ui);
const recorder = new Recorder(audioEngine);
const musicAudio = new Audio();
musicAudio.preload = "auto";

const TRANSPORT_STATE = { IDLE: "idle", PLAYING: "playing", MASTER_RECORDING: "masterRecording" };
let transportState = TRANSPORT_STATE.IDLE;
let transportTimer = null;
let elapsed = 0;
let activeRecRow = null;
let lastClickedRecRow = null;
let handlingClose = false;
let inFlightRecordingPersist = false;
let inFlightMasterExport = false;
let inFlightExportMp3 = false;
let inFlightSave = false;
let inFlightDashboardAction = false;
let inFlightAudioTool = false;
let inFlightModalOperation = false;
let externalMusicFile = null;
let externalMusicName = "";
let currentMusicObjectUrl = null;
let renderInProgress = false;
let renderRequested = false;
let musicSeekDragging = false;
let musicSeekCommitTimer = null;
let smoothSeekEnabled = true;
let musicNotesRunning = false;
let musicNoteRafId = null;
let musicNoteLastSpawn = 0;
let editorSelectedRecRow = null;
let editorSourceBuffer = null;
let editorProcessedBuffer = null;
let editorWaveRenderToken = 0;
const MUSIC_NOTE_MIN_INTERVAL_MS = 580;

const scheduler = new Scheduler(audioEngine, ({ step, when }) => {
  const { userRows, presetRows } = projectManager.state.sequencer;
  for (const row of userRows) {
    if (!row.steps[step] || row.mute || !row.samplePath) continue;
    const buffer = sampleBuffers.get(row.samplePath);
    if (buffer) audioEngine.playBuffer({ buffer, gainValue: row.volume, when });
  }
  for (const row of presetRows) {
    if (!row.steps[step] || row.mute || !row.sound) continue;
    const buffer = sampleBuffers.get(row.sound);
    if (buffer) audioEngine.playBuffer({ buffer, gainValue: row.volume, when });
  }
  ui.highlightStep(step);
});

function safeAsync(handler) {
  return async (...args) => {
    try { await handler(...args); } catch (err) { console.error("Unhandled UI async error:", err); }
  };
}

function errorMessage(error) {
  if (!error) return "unknown error";
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  try { return JSON.stringify(error); } catch { return String(error); }
}

async function runModalOperation(task) {
  if (inFlightModalOperation) return;
  inFlightModalOperation = true;
  try {
    return await task();
  } finally {
    inFlightModalOperation = false;
  }
}

function showModalError(message) {
  return showModal({ title: "Error", html: `<p class='error'>${message}</p>`, buttons: [{ label: "OK", value: true }] });
}

function isAbsoluteLikePath(path) {
  if (!path) return false;
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(path);
}

function clearMusicObjectUrl() {
  if (currentMusicObjectUrl) {
    URL.revokeObjectURL(currentMusicObjectUrl);
    currentMusicObjectUrl = null;
  }
}

function setMusicSourceFromBlob(blob) {
  clearMusicObjectUrl();
  currentMusicObjectUrl = URL.createObjectURL(blob);
  musicAudio.src = currentMusicObjectUrl;
}

function openMenu(menu) {
  fileMenu.hidden = menu !== fileMenu;
  optionMenu.hidden = menu !== optionMenu;
  importMenu.hidden = menu !== importMenu;
}

function closeMenus() { fileMenu.hidden = true; optionMenu.hidden = true; importMenu.hidden = true; }

document.addEventListener("click", (e) => {
  if (!fileMenuBtn.contains(e.target)
    && !fileMenu.contains(e.target)
    && !optionMenuBtn.contains(e.target)
    && !optionMenu.contains(e.target)
    && !importMenuBtn.contains(e.target)
    && !importMenu.contains(e.target)) {
    closeMenus();
  }
});

function showModal({ title, html, buttons }) {
  return new Promise((resolve) => {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modalActions.innerHTML = "";
    buttons.forEach((btn) => {
      const b = document.createElement("button");
      b.textContent = btn.label;
      b.onclick = () => {
        modalOverlay.hidden = true;
        resolve(btn.value);
      };
      modalActions.appendChild(b);
    });
    modalOverlay.hidden = false;
  });
}

async function promptText(title, label, value = "") {
  modalTitle.textContent = title;
  modalBody.innerHTML = `<div class='modal-body-grid'><label>${label}<input id='modalInput' value='${value.replaceAll("'", "&#39;")}' /></label><div id='modalError' class='error'></div></div>`;
  modalActions.innerHTML = "<button id='modalCancel'>Cancel</button><button id='modalOk'>OK</button>";
  modalOverlay.hidden = false;
  return new Promise((resolve) => {
    const input = document.getElementById("modalInput");
    const errorEl = document.getElementById("modalError");
    document.getElementById("modalCancel").onclick = () => { modalOverlay.hidden = true; resolve(null); };
    document.getElementById("modalOk").onclick = () => {
      const text = input.value.trim();
      if (!text) {
        errorEl.textContent = "Value is required.";
        return;
      }
      modalOverlay.hidden = true;
      resolve(text);
    };
  });
}

function syncMusicUi() {
  const m = projectManager.state.music;
  const enabled = Boolean(m.enabled);
  musicPlayToggleBtn.textContent = enabled ? "⏸ Pause" : "▶ Play";
  musicPlayToggleBtn.classList.toggle("active", enabled);
  musicPlayToggleBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
  musicSyncToggle.checked = m.mode === "sync";
  musicSmoothSeekToggle.checked = smoothSeekEnabled;
  musicVolume.value = String(m.volume ?? 1);
  musicStartOffset.value = String(m.startOffset ?? 0);
  const title = (externalMusicName || m.trackPath || "No track loaded").split(/[\\/]/).pop() || "No track loaded";
  trackArc.textContent = title.length > 24 ? `${title.slice(0, 21)}...` : title;
}

function fmtTime(totalSec) {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "00:00";
  const sec = Math.floor(totalSec % 60);
  const min = Math.floor(totalSec / 60);
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function syncSeekUi() {
  const duration = Number.isFinite(musicAudio.duration) && musicAudio.duration > 0 ? musicAudio.duration : 0;
  const current = Number.isFinite(musicAudio.currentTime) ? musicAudio.currentTime : 0;
  if (!musicSeekDragging) {
    musicSeekBar.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : "0";
  }
  musicSeekTime.textContent = `${fmtTime(current)} / ${fmtTime(duration)}`;
}

function spawnMusicNote() {
  if (!musicNoteField) return;
  const note = document.createElement("span");
  note.className = "music-note";
  note.textContent = Math.random() > 0.5 ? "♪" : "♫";
  note.style.left = `${20 + Math.random() * 60}%`;
  note.style.setProperty("--note-x", `${(-30 + Math.random() * 60).toFixed(1)}px`);
  musicNoteField.appendChild(note);
  note.addEventListener("animationend", () => note.remove(), { once: true });
}

function startMusicNotes() {
  if (musicNotesRunning) return;
  musicNotesRunning = true;
  musicNoteLastSpawn = 0;
  const loop = (now) => {
    if (!musicNotesRunning) return;
    if (document.hidden || musicAudio.paused) {
      musicNoteRafId = requestAnimationFrame(loop);
      return;
    }
    if (now - musicNoteLastSpawn >= MUSIC_NOTE_MIN_INTERVAL_MS) {
      musicNoteLastSpawn = now;
      spawnMusicNote();
    }
    musicNoteRafId = requestAnimationFrame(loop);
  };
  musicNoteRafId = requestAnimationFrame(loop);
}

function stopMusicNotes() {
  musicNotesRunning = false;
  if (musicNoteRafId) {
    cancelAnimationFrame(musicNoteRafId);
    musicNoteRafId = null;
  }
}

function seekToSliderValue() {
  const duration = Number.isFinite(musicAudio.duration) ? musicAudio.duration : 0;
  if (!duration) return;
  const nextTime = (Number(musicSeekBar.value) / 1000) * duration;
  musicAudio.currentTime = nextTime;
  syncSeekUi();
}

async function startMusicPlaybackAt(currentTimeSec) {
  if (!musicAudio.src) return false;
  musicAudio.currentTime = currentTimeSec;
  musicAudio.volume = Number(projectManager.state.music.volume || 1);
  try {
    await musicAudio.play();
    return true;
  } catch (err) {
    console.error("Music play error", err);
    return false;
  }
}

function isTransportActive() { return transportState !== TRANSPORT_STATE.IDLE; }

function syncTransportUi() {
  playBtn.textContent = transportState === TRANSPORT_STATE.IDLE ? "PLAY" : "STOP";
  playBtn.disabled = transportState === TRANSPORT_STATE.MASTER_RECORDING;
  recordMasterBtn.textContent = transportState === TRANSPORT_STATE.MASTER_RECORDING ? "STOP RECORD" : "RECORD MASTER";
  recordMasterBtn.classList.toggle("recording", transportState === TRANSPORT_STATE.MASTER_RECORDING);
}

function maybeStartMusicWithTransport() {
  const m = projectManager.state.music;
  if (!m.enabled || m.mode !== "sync") return;
  if (!musicAudio.src) return;
  startMusicPlaybackAt(Number(m.startOffset || 0)).then((ok) => {
    if (!ok) {
      projectManager.state.music.enabled = false;
      syncMusicUi();
    }
  });
}

function stopSequencerAudio() {
  audioEngine.stopAllPlayingSources();
}

function stopMusicPlayback() {
  musicAudio.pause();
  vinylDisc.classList.remove("spinning");
  stopMusicNotes();
}

function syncTransportLocks() {
  const locked = isTransportActive();
  addRecRowBtn.disabled = locked;
  addPresetRowBtn.disabled = locked;
}

async function transitionTransport(nextState) {
  if (nextState === transportState) return;
  if (transportState === TRANSPORT_STATE.MASTER_RECORDING && nextState === TRANSPORT_STATE.PLAYING) return;

  if (nextState === TRANSPORT_STATE.IDLE) {
    if (scheduler.isPlaying) scheduler.stop();
    stopSequencerAudio();
    ui.highlightStep(-1);
    if (projectManager.state.music.mode === "sync") stopMusicPlayback();
  } else if (nextState === TRANSPORT_STATE.PLAYING || nextState === TRANSPORT_STATE.MASTER_RECORDING) {
    if (!scheduler.isPlaying) scheduler.start();
    maybeStartMusicWithTransport();
  }

  transportState = nextState;
  syncTransportUi();
  syncTransportLocks();
  await renderSequencer();
}

function clearMasterTimer() {
  if (!transportTimer) return;
  clearInterval(transportTimer);
  transportTimer = null;
}

function updateHeader() {
  const dirty = projectManager.dirty ? " *" : "";
  const title = `${projectManager.currentProject ?? "No Project"}${dirty}`;
  projectTitle.textContent = title;
  if (audioEditorProjectTitle) audioEditorProjectTitle.textContent = title;
}

async function loadMusicFromState() {
  externalMusicFile = null;
  externalMusicName = "";
  const path = projectManager.state.music.trackPath;
  if (!path) {
    clearMusicObjectUrl();
    musicAudio.removeAttribute("src");
    stopMusicPlayback();
    syncMusicUi();
    syncSeekUi();
    return;
  }
  if (isAbsoluteLikePath(path)) {
    ui.log("Ignored legacy absolute music path in project state.");
    projectManager.state.music.trackPath = null;
    projectManager.state.music.enabled = false;
    projectManager.markDirty();
    clearMusicObjectUrl();
    musicAudio.removeAttribute("src");
    stopMusicPlayback();
    syncMusicUi();
    syncSeekUi();
    return;
  }
  const bytes = await projectManager.readProjectFileBytes(path);
  setMusicSourceFromBlob(new Blob([new Uint8Array(bytes)]));
  musicAudio.currentTime = 0;
  syncMusicUi();
  syncSeekUi();
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

async function renderProcessedBuffer(source, payload = {}) {
  const semitone = Number(payload.pitchSemitone || 0);
  const tone = Number(payload.tone || 0);
  const voice = payload.voice || "natural";
  const playbackRate = Math.max(0.0625, Math.min(16, Math.pow(2, semitone / 12)));
  const outLength = Math.max(1, Math.ceil(source.length / playbackRate));
  const offline = new OfflineAudioContext(source.numberOfChannels, outLength, source.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = source;
  src.playbackRate.value = playbackRate;

  const toneFilter = offline.createBiquadFilter();
  toneFilter.type = "peaking";
  toneFilter.frequency.value = 1800;
  toneFilter.Q.value = 0.8;
  toneFilter.gain.value = Math.max(-12, Math.min(12, tone));

  const voiceFilter = offline.createBiquadFilter();
  voiceFilter.type = "peaking";
  if (voice === "warm") {
    voiceFilter.frequency.value = 380;
    voiceFilter.gain.value = 4;
  } else if (voice === "bright") {
    voiceFilter.frequency.value = 3400;
    voiceFilter.gain.value = 5;
  } else {
    voiceFilter.frequency.value = 1200;
    voiceFilter.gain.value = 0;
  }
  voiceFilter.Q.value = 0.9;

  src.connect(toneFilter);
  toneFilter.connect(voiceFilter);
  voiceFilter.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

function buildWaveBarsHtml(buffer) {
  if (!buffer) return "";
  const bars = 92;
  const ch = buffer.getChannelData(0);
  const perBar = Math.max(1, Math.floor(ch.length / bars));
  let graph = "";
  for (let i = 0; i < bars; i += 1) {
    const start = i * perBar;
    const end = Math.min(ch.length, start + perBar);
    let peak = 0;
    for (let k = start; k < end; k += 1) peak = Math.max(peak, Math.abs(ch[k]));
    const h = Math.max(5, Math.round(peak * 78));
    graph += `<span style="height:${h}px"></span>`;
  }
  return graph;
}

function getSelectedEditorRow() {
  if (editorSelectedRecRow == null) return null;
  return projectManager.state.sequencer.userRows[editorSelectedRecRow] ?? null;
}

async function recalcEditorProcessedBuffer() {
  const row = getSelectedEditorRow();
  if (!row?.samplePath) {
    editorSourceBuffer = null;
    editorProcessedBuffer = null;
    editorWaveBars.innerHTML = "";
    return;
  }
  const source = sampleBuffers.get(row.samplePath);
  if (!source) {
    editorSourceBuffer = null;
    editorProcessedBuffer = null;
    editorWaveBars.innerHTML = "";
    return;
  }

  editorSourceBuffer = source;
  const startSec = Math.max(0, Number(editorTrimStart.value || 0));
  const endSec = Math.max(startSec, Number(editorTrimEnd.value || source.duration));
  const pitchSemitone = Number(editorPitch.value || 0);
  const tone = Number(editorTone.value || 0);
  const voice = editorVoice.value;
  editorPitchValue.textContent = `${pitchSemitone} st`;
  editorToneValue.textContent = tone.toFixed(1);

  const token = ++editorWaveRenderToken;
  const startFrame = Math.min(source.length, Math.floor(startSec * source.sampleRate));
  const endFrame = Math.min(source.length, Math.floor(endSec * source.sampleRate));
  const len = Math.max(1, endFrame - startFrame);
  const trimmed = audioEngine.context.createBuffer(source.numberOfChannels, len, source.sampleRate);
  for (let c = 0; c < source.numberOfChannels; c += 1) trimmed.copyToChannel(source.getChannelData(c).slice(startFrame, endFrame), c);
  const processed = await renderProcessedBuffer(trimmed, { pitchSemitone, tone, voice });
  if (token !== editorWaveRenderToken) return;
  editorProcessedBuffer = processed;
  editorWaveBars.innerHTML = buildWaveBarsHtml(processed);
}

function hydrateEditorRecSelector() {
  editorRecSelect.innerHTML = "";
  projectManager.state.sequencer.userRows.forEach((row, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = `REC ${idx + 1}${row.samplePath ? "" : " (no audio)"}`;
    editorRecSelect.appendChild(opt);
  });
}

async function openAudioEditorScreen() {
  if (inFlightSave || inFlightRecordingPersist) {
    ui.log("Cannot open audio editor while save/persist is in progress.");
    return;
  }
  if (!projectManager.currentProject) return;
  closeMenus();
  audioEditorProjectTitle.textContent = projectManager.currentProject;
  hydrateEditorRecSelector();
  if (editorRecSelect.options.length === 0) {
    await runModalOperation(() => showModalError("No REC rows available."));
    return;
  }

  if (editorSelectedRecRow == null || !projectManager.state.sequencer.userRows[editorSelectedRecRow]) {
    editorSelectedRecRow = Number(lastClickedRecRow ?? 0);
  }
  editorSelectedRecRow = Math.max(0, Math.min(projectManager.state.sequencer.userRows.length - 1, editorSelectedRecRow));
  editorRecSelect.value = String(editorSelectedRecRow);
  const row = getSelectedEditorRow();
  const source = row?.samplePath ? sampleBuffers.get(row.samplePath) : null;
  const duration = source?.duration ?? 0;
  editorTrimStart.value = "0";
  editorTrimEnd.value = duration.toFixed(2);
  editorPitch.value = "0";
  editorTone.value = "0";
  editorVoice.value = "natural";
  await recalcEditorProcessedBuffer();
  if (editorProcessedBuffer) {
    await audioEngine.ensureRunning();
    const gain = row?.volume ?? 1;
    audioEngine.playBuffer({ buffer: editorProcessedBuffer, gainValue: gain, when: audioEngine.context.currentTime });
  }
  ui.showAudioEditor();
}

async function applyAudioTool(tool, payload = {}) {
  if (inFlightSave || inFlightRecordingPersist) return ui.log("Cannot apply audio tools while save/persist is in progress.");
  if (lastClickedRecRow == null || inFlightAudioTool) return ui.log("Select a REC row first.");
  const row = projectManager.state.sequencer.userRows[lastClickedRecRow];
  if (!row?.samplePath) return ui.log("Selected REC row has no recording.");
  const source = sampleBuffers.get(row.samplePath);
  if (!source) return ui.log("Recording buffer missing.");

  inFlightAudioTool = true;
  try {
    let out = source;
    if (tool === "reverse") {
      out = audioEngine.context.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
      for (let c = 0; c < source.numberOfChannels; c += 1) out.copyToChannel(Float32Array.from(source.getChannelData(c)).reverse(), c);
    } else if (tool === "normalize") {
      out = audioEngine.context.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
      for (let c = 0; c < source.numberOfChannels; c += 1) out.copyToChannel(Float32Array.from(source.getChannelData(c)), c);
      audioEngine.normalizeBuffer(out);
    } else if (tool === "gain") {
      const scale = Math.pow(10, (payload.gainDb || 0) / 20);
      out = audioEngine.context.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
      for (let c = 0; c < source.numberOfChannels; c += 1) {
        const src = source.getChannelData(c);
        const channel = new Float32Array(src.length);
        for (let i = 0; i < src.length; i += 1) channel[i] = Math.max(-1, Math.min(1, src[i] * scale));
        out.copyToChannel(channel, c);
      }
    } else if (tool === "trim") {
      const start = Math.max(0, Number(payload.startSec || 0));
      const end = Math.max(start, Number(payload.endSec || source.duration));
      const startFrame = Math.min(source.length, Math.floor(start * source.sampleRate));
      const endFrame = Math.min(source.length, Math.floor(end * source.sampleRate));
      const len = Math.max(1, endFrame - startFrame);
      out = audioEngine.context.createBuffer(source.numberOfChannels, len, source.sampleRate);
      for (let c = 0; c < source.numberOfChannels; c += 1) out.copyToChannel(source.getChannelData(c).slice(startFrame, endFrame), c);
    } else if (tool === "editor") {
      out = await renderProcessedBuffer(source, payload);
    }
    await persistRecordedBuffer(lastClickedRecRow, out);
    ui.log(`${tool} applied on REC ${lastClickedRecRow + 1}`);
  } finally {
    inFlightAudioTool = false;
  }
}

async function renderSequencer() {
  if (renderInProgress) {
    renderRequested = true;
    return;
  }
  renderInProgress = true;
  try {
    do {
      renderRequested = false;
      if (!projectManager.currentProject) break;
      const state = projectManager.state.sequencer;
      const samples = await loadSamplesForState();
      bpmInput.value = String(state.bpm ?? DEFAULT_BPM);
      bpmValue.textContent = String(state.bpm ?? DEFAULT_BPM);
      scheduler.updateTempo({ bpm: state.bpm });

      ui.renderRows(state.userRows, ui.recRows, "rec", {
        recordingRow: activeRecRow,
        lockRec: isTransportActive(),
        onRec: async (rowIndex) => {
          lastClickedRecRow = rowIndex;
          if (!projectManager.currentProject || isTransportActive()) return;
          if (recorder.isRecording && activeRecRow !== rowIndex) return;
          try {
            if (recorder.isRecording && activeRecRow === rowIndex) return recorder.stop();
            await audioEngine.ensureRunning();
            await recorder.start(rowIndex);
          } catch (error) {
            activeRecRow = null;
            await renderSequencer();
            ui.log(`REC failed: ${error?.message ?? "unknown error"}`);
          }
        },
        onStep: (_, row, step) => { lastClickedRecRow = row; state.userRows[row].steps[step] = !state.userRows[row].steps[step]; projectManager.markDirty(); updateHeader(); renderSequencer(); },
        onDelete: (_, row) => { lastClickedRecRow = row; if (isTransportActive() || recorder.isRecording) return; state.userRows.splice(row, 1); state.userRows.forEach((r, i) => { r.id = i; }); projectManager.markDirty(); updateHeader(); renderSequencer(); },
        onVolume: (_, row, value) => { lastClickedRecRow = row; state.userRows[row].volume = value; projectManager.markDirty(); updateHeader(); },
        onMute: (_, row) => { lastClickedRecRow = row; state.userRows[row].mute = !state.userRows[row].mute; projectManager.markDirty(); updateHeader(); renderSequencer(); }
      });

      ui.renderRows(state.presetRows, ui.presetRows, "preset", {
        samples,
        lockSoundChange: isTransportActive(),
        onStep: (_, row, step) => { state.presetRows[row].steps[step] = !state.presetRows[row].steps[step]; projectManager.markDirty(); updateHeader(); renderSequencer(); },
        onDelete: (_, row) => { if (isTransportActive()) return; state.presetRows.splice(row, 1); state.presetRows.forEach((r, i) => { r.id = i; }); projectManager.markDirty(); updateHeader(); renderSequencer(); },
        onVolume: (_, row, value) => { state.presetRows[row].volume = value; projectManager.markDirty(); updateHeader(); },
        onMute: (_, row) => { state.presetRows[row].mute = !state.presetRows[row].mute; projectManager.markDirty(); updateHeader(); renderSequencer(); },
        onSound: async (row, sound) => {
          if (isTransportActive()) return;
          state.presetRows[row].sound = sound || null;
          projectManager.markDirty();
          updateHeader();
          const buffer = sampleBuffers.get(sound);
          if (buffer) {
            await audioEngine.ensureRunning();
            audioEngine.playBuffer({ buffer, gainValue: state.presetRows[row].volume, when: audioEngine.context.currentTime });
          }
        }
      });

      syncTransportLocks();
      syncMusicUi();
    } while (renderRequested);
  } finally {
    renderInProgress = false;
  }
}


async function openProject(name) {
  await projectManager.loadProject(name);
  activeRecRow = null;
  lastClickedRecRow = null;
  editorSelectedRecRow = null;
  missingSampleWarnings.clear();
  updateHeader();
  await loadMusicFromState();
  await renderSequencer();
  ui.showSequencer();
}

async function runDashboardAction(task) {
  if (inFlightDashboardAction) return;
  inFlightDashboardAction = true;
  try { await task(); } finally { inFlightDashboardAction = false; }
}

async function refreshDashboard() {
  await dashboard.refresh({
    open: safeAsync(async (name) => runDashboardAction(async () => openProject(name))),
    rename: safeAsync(async (name) => runDashboardAction(async () => {
      const newName = await runModalOperation(() => promptText("Rename project", "Project name", name));
      if (!newName || newName === name) return;
      await projectManager.renameProject(name, newName);
      await refreshDashboard();
    })),
    duplicate: safeAsync(async (name) => runDashboardAction(async () => {
      const target = await runModalOperation(() => promptText("Duplicate project as", "New project name", `${name}_copy`));
      if (!target) return;
      try { await projectManager.duplicateProject(name, target); } catch { await runModalOperation(() => showModalError("Project name already exists.")); }
      await refreshDashboard();
    })),
    delete: safeAsync(async (name) => runDashboardAction(async () => {
      const yes = await runModalOperation(() => showModal({ title: "Delete Project", html: `<p>Delete ${name}?</p>`, buttons: [{ label: "Cancel", value: false }, { label: "Delete", value: true }] }));
      if (!yes) return;
      await projectManager.deleteProject(name);
      await refreshDashboard();
    }))
  });
}

async function maybeIncludeMusicBeforeSave() {
  if (!externalMusicFile || projectManager.state.music.trackPath) return true;
  const include = await runModalOperation(() => showModal({ title: "Include imported music in project?", html: "<p>Include imported music in this project?</p>", buttons: [{ label: "No", value: false }, { label: "Yes", value: true }] }));
  if (!include) {
    stopMusicPlayback();
    clearMusicObjectUrl();
    musicAudio.removeAttribute("src");
    externalMusicFile = null;
    externalMusicName = "";
    projectManager.state.music.trackPath = null;
    projectManager.state.music.enabled = false;
    projectManager.markDirty();
    syncMusicUi();
    return true;
  }
  const bytes = new Uint8Array(await externalMusicFile.arrayBuffer());
  const relative = await projectManager.writeMusicFile(externalMusicFile.name, bytes);
  projectManager.state.music.trackPath = relative;
  externalMusicFile = null;
  externalMusicName = "";
  projectManager.markDirty();
  return true;
}

async function saveCurrentProject() {
  if (inFlightSave || inFlightRecordingPersist || recorder.isRecording || inFlightMasterExport) return false;
  inFlightSave = true;
  try {
    await maybeIncludeMusicBeforeSave();
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

async function confirmSaveBeforeLeave({ promptHtml }) {
  if (!projectManager.dirty) return true;
  const choice = await runModalOperation(() => showModal({
    title: "Unsaved changes",
    html: promptHtml,
    buttons: [{ label: "Cancel", value: null }, { label: "No", value: false }, { label: "Save", value: true }],
  }));
  if (choice === true) return saveCurrentProject();
  if (choice === false) return true;
  return false;
}

recorder.on("record-start", async ({ cellIndex }) => {
  activeRecRow = cellIndex;
  await renderSequencer();
});

recorder.on("record-stop", async ({ cellIndex, buffer }) => {
  activeRecRow = null;
  try { await persistRecordedBuffer(cellIndex, buffer); ui.log(`Recorded REC ${Number(cellIndex) + 1}`); }
  catch (error) { await renderSequencer(); ui.log(`REC persist failed: ${error?.message ?? "unknown error"}`); }
});

fileMenuBtn.onclick = () => openMenu(fileMenu);
optionMenuBtn.onclick = () => openMenu(optionMenu);
importMenuBtn.onclick = () => openMenu(importMenu);

menuSave.onclick = safeAsync(async () => { closeMenus(); await saveCurrentProject(); });
menuSaveAs.onclick = safeAsync(async () => {
  closeMenus();
  const name = await runModalOperation(() => promptText("Save As", "New project name", `${projectManager.currentProject}_copy`));
  if (!name) return;
  try {
    await maybeIncludeMusicBeforeSave();
    await projectManager.saveAsProject(name);
    updateHeader();
    await refreshDashboard();
  } catch {
    await runModalOperation(() => showModalError("Project name already exists."));
  }
});
menuRename.onclick = safeAsync(async () => {
  closeMenus();
  const name = await runModalOperation(() => promptText("Rename", "Project name", projectManager.currentProject ?? ""));
  if (!name || name === projectManager.currentProject) return;
  await projectManager.renameProject(projectManager.currentProject, name);
  updateHeader();
  await refreshDashboard();
});

toolAudioEditor.onclick = safeAsync(async () => {
  await openAudioEditorScreen();
});

audioEditorBackBtn.onclick = safeAsync(async () => {
  ui.showSequencer();
  await renderSequencer();
});

editorRecSelect.onchange = safeAsync(async () => {
  editorSelectedRecRow = Number(editorRecSelect.value);
  const row = getSelectedEditorRow();
  const source = row?.samplePath ? sampleBuffers.get(row.samplePath) : null;
  const duration = source?.duration ?? 0;
  editorTrimStart.value = "0";
  editorTrimEnd.value = duration.toFixed(2);
  editorPitch.value = "0";
  editorTone.value = "0";
  editorVoice.value = "natural";
  await recalcEditorProcessedBuffer();
  if (editorProcessedBuffer) {
    await audioEngine.ensureRunning();
    audioEngine.playBuffer({ buffer: editorProcessedBuffer, gainValue: row?.volume ?? 1, when: audioEngine.context.currentTime });
  }
});

const editorLiveUpdate = safeAsync(async () => {
  await recalcEditorProcessedBuffer();
});
editorTrimStart.oninput = editorLiveUpdate;
editorTrimEnd.oninput = editorLiveUpdate;
editorPitch.oninput = editorLiveUpdate;
editorTone.oninput = editorLiveUpdate;
editorVoice.onchange = editorLiveUpdate;

editorPreviewBtn.onclick = safeAsync(async () => {
  if (!editorProcessedBuffer) {
    ui.log("No processed audio to preview.");
    return;
  }
  const row = getSelectedEditorRow();
  await audioEngine.ensureRunning();
  audioEngine.playBuffer({ buffer: editorProcessedBuffer, gainValue: row?.volume ?? 1, when: audioEngine.context.currentTime });
});

editorResetBtn.onclick = safeAsync(async () => {
  const row = getSelectedEditorRow();
  const source = row?.samplePath ? sampleBuffers.get(row.samplePath) : null;
  editorTrimStart.value = "0";
  editorTrimEnd.value = (source?.duration ?? 0).toFixed(2);
  editorPitch.value = "0";
  editorTone.value = "0";
  editorVoice.value = "natural";
  await recalcEditorProcessedBuffer();
});

editorApplyBtn.onclick = safeAsync(async () => {
  if (inFlightSave || inFlightRecordingPersist || inFlightAudioTool) {
    ui.log("Cannot save audio editor changes while save/persist/tool is in progress.");
    return;
  }
  const rowIndex = Number(editorRecSelect.value);
  if (!Number.isInteger(rowIndex)) {
    ui.log("Select a REC row first.");
    return;
  }
  if (!editorProcessedBuffer) {
    ui.log("Nothing to save in audio editor.");
    return;
  }
  lastClickedRecRow = rowIndex;
  await persistRecordedBuffer(rowIndex, editorProcessedBuffer);
  ui.log(`Audio editor changes saved on REC ${rowIndex + 1}`);
  await recalcEditorProcessedBuffer();
});

menuImportWav.onclick = safeAsync(async () => {
  closeMenus();
  const yes = await runModalOperation(() => showModal({
    title: "Import WAV to Preset Drum Rack",
    html: "<p>You can add a WAV file into this project drum library. Only .wav is accepted. Imported file will be copied to <code>/assets/drums</code>.</p>",
    buttons: [{ label: "Cancel", value: false }, { label: "Choose WAV", value: true }]
  }));
  if (!yes) return;
  drumImportInput.value = "";
  drumImportInput.click();
});

drumImportInput.onchange = safeAsync(async () => {
  const file = drumImportInput.files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".wav")) {
    await runModalOperation(() => showModalError("INVALID_AUDIO_TYPE: only .wav files are accepted."));
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const out = await projectManager.importDrumWav(file.name, bytes);
  ui.log(`Imported WAV: ${out}`);
  await renderSequencer();
});

toolTrim.onclick = safeAsync(async () => {
  closeMenus();
  if (inFlightSave || inFlightRecordingPersist) return ui.log("Cannot apply audio tools while save/persist is in progress.");
  const state = projectManager.state.sequencer.userRows[lastClickedRecRow ?? -1];
  const max = sampleBuffers.get(state?.samplePath)?.duration ?? 0;
  modalTitle.textContent = "Trim recording";
  modalBody.innerHTML = `<div class='modal-body-grid'><label>Start (sec)<input id='trimStart' type='number' min='0' step='0.01' value='0'/></label><label>End (sec)<input id='trimEnd' type='number' min='0' step='0.01' value='${max.toFixed(2)}'/></label></div>`;
  modalActions.innerHTML = "<button id='modalCancel'>Cancel</button><button id='modalOk'>Apply</button>";
  modalOverlay.hidden = false;
  document.getElementById("modalCancel").onclick = () => { modalOverlay.hidden = true; };
  document.getElementById("modalOk").onclick = safeAsync(async () => {
    const startSec = Number(document.getElementById("trimStart").value);
    const endSec = Number(document.getElementById("trimEnd").value);
    modalOverlay.hidden = true;
    await applyAudioTool("trim", { startSec, endSec });
  });
});
toolNormalize.onclick = safeAsync(async () => { closeMenus(); await applyAudioTool("normalize"); });
toolReverse.onclick = safeAsync(async () => { closeMenus(); await applyAudioTool("reverse"); });
toolGain.onclick = safeAsync(async () => {
  closeMenus();
  if (inFlightSave || inFlightRecordingPersist) return ui.log("Cannot apply audio tools while save/persist is in progress.");
  modalTitle.textContent = "Gain";
  modalBody.innerHTML = "<div class='modal-body-grid'><label>Gain dB (-24 to 24)<input id='gainDb' type='number' min='-24' max='24' step='0.1' value='0'/></label></div>";
  modalActions.innerHTML = "<button id='modalCancel'>Cancel</button><button id='modalOk'>Apply</button>";
  modalOverlay.hidden = false;
  document.getElementById("modalCancel").onclick = () => { modalOverlay.hidden = true; };
  document.getElementById("modalOk").onclick = safeAsync(async () => {
    const gainDb = Math.max(-24, Math.min(24, Number(document.getElementById("gainDb").value || 0)));
    modalOverlay.hidden = true;
    await applyAudioTool("gain", { gainDb });
  });
});

newProjectBtn.onclick = safeAsync(async () => {
  if (inFlightDashboardAction) return;
  const name = await runModalOperation(() => promptText("New project", "Project name", `project_${Date.now()}`));
  if (!name) return;
  await runDashboardAction(async () => { await projectManager.createProject(name); await openProject(name); });
});

backBtn.onclick = safeAsync(async () => {
  const ok = await confirmSaveBeforeLeave({ promptHtml: "<p>Save before returning to Dashboard?</p>" });
  if (!ok) return;
  await transitionTransport(TRANSPORT_STATE.IDLE);
  ui.showDashboard();
  await refreshDashboard();
});

addRecRowBtn.onclick = safeAsync(async () => {
  if (isTransportActive()) return;
  if (projectManager.state.addRecRow()) { projectManager.markDirty(); updateHeader(); await renderSequencer(); }
});
addPresetRowBtn.onclick = safeAsync(async () => {
  if (isTransportActive()) return;
  if (projectManager.state.addPresetRow()) { projectManager.markDirty(); updateHeader(); await renderSequencer(); }
});

for (const p of BPM_PRESETS) {
  const opt = document.createElement("option");
  opt.value = String(p);
  const label = p === 95 ? "HipHop" : p === 120 ? "House" : p === 140 ? "Trap" : "Style";
  opt.textContent = `${p} BPM — ${label}`;
  bpmPresetSelect.appendChild(opt);
}

bpmPresetSelect.onchange = () => {
  const bpm = Number(bpmPresetSelect.value);
  bpmInput.value = String(bpm);
  bpmValue.textContent = String(bpm);
  projectManager.state.setTempo(bpm);
  scheduler.updateTempo({ bpm });
  projectManager.markDirty();
  updateHeader();
};

bpmInput.oninput = () => {
  const bpm = Number(bpmInput.value);
  bpmValue.textContent = String(bpm);
  projectManager.state.setTempo(bpm);
  scheduler.updateTempo({ bpm });
  projectManager.markDirty();
  updateHeader();
};

playBtn.onclick = safeAsync(async () => {
  if (transportState === TRANSPORT_STATE.MASTER_RECORDING) return;
  await audioEngine.ensureRunning();
  await transitionTransport(transportState === TRANSPORT_STATE.IDLE ? TRANSPORT_STATE.PLAYING : TRANSPORT_STATE.IDLE);
});

recordMasterBtn.onclick = safeAsync(async () => {
  await audioEngine.ensureRunning();
  if (transportState !== TRANSPORT_STATE.MASTER_RECORDING) {
    await transitionTransport(TRANSPORT_STATE.MASTER_RECORDING);
    elapsed = 0;
    ui.setTimer(0);
    clearMasterTimer();
    transportTimer = setInterval(() => { elapsed += 1; ui.setTimer(elapsed); }, 1000);
    return;
  }

  if (inFlightSave) {
    await showModalError("Save in progress. Please wait.");
    return;
  }
  if (inFlightMasterExport) return;
  if (inFlightExportMp3) return;
  inFlightMasterExport = true;
  inFlightExportMp3 = true;
  clearMasterTimer();
  ui.setTimer(0);
  try {
    await projectManager.ffmpegPreflight();
    const wav = await exportManager.renderMasterWav();
    await projectManager.writeMasterWav(wav);
    projectManager.state.render.hasMasterWav = true;
    projectManager.markDirty();
    updateHeader();
    const selected = await projectManager.chooseMp3SavePath(`${projectManager.currentProject}-pipi.mp3`);
    if (selected) {
      const out = await projectManager.exportMasterMp3ToPath(selected);
      const exists = await projectManager.pathExists(out);
      ui.log(exists ? `Exported MP3: ${out}` : `Export completed but file not found at expected path: ${out}`);
      if (!exists) {
        await runModalOperation(() => showModalError("Export path not found after save. Please try another folder/path."));
      }
    } else {
      ui.log("Export canceled. master.wav kept in project.");
    }
  } catch (error) {
    const message = errorMessage(error);
    ui.log(`Master record finalize failed: ${message}`);
    if (message.includes("FFMPEG_NOT_FOUND")) {
      await runModalOperation(() => showModalError("Không thể xuất MP3 vì máy chưa có encoder. master.wav đã được giữ trong project; hãy cài ffmpeg rồi thử lại MP3."));
    }
  } finally {
    inFlightExportMp3 = false;
    inFlightMasterExport = false;
    await transitionTransport(TRANSPORT_STATE.IDLE);
  }
});

musicImportBtn.onclick = () => musicFileInput.click();
musicFileInput.onchange = safeAsync(async () => {
  const file = musicFileInput.files?.[0];
  if (!file) return;
  externalMusicFile = file;
  externalMusicName = file.name;
  projectManager.state.music.trackPath = null;
  setMusicSourceFromBlob(file);
  projectManager.markDirty();
  syncMusicUi();
  syncSeekUi();
});
musicRemoveBtn.onclick = safeAsync(async () => {
  stopMusicPlayback();
  clearMusicObjectUrl();
  musicAudio.removeAttribute("src");
  externalMusicFile = null;
  externalMusicName = "";
  projectManager.state.music.trackPath = null;
  projectManager.state.music.enabled = false;
  musicAudio.currentTime = 0;
  projectManager.markDirty();
  syncMusicUi();
  syncSeekUi();
});
musicPlayToggleBtn.onclick = safeAsync(async () => {
  const nextEnabled = !projectManager.state.music.enabled;
  if (!nextEnabled) {
    projectManager.state.music.enabled = false;
    projectManager.markDirty();
    stopMusicPlayback();
    syncMusicUi();
    return;
  }

  if (projectManager.state.music.mode !== "independent") {
    projectManager.state.music.enabled = true;
    projectManager.markDirty();
    syncMusicUi();
    return;
  }

  const ok = await startMusicPlaybackAt(Number(projectManager.state.music.startOffset || 0));
  projectManager.state.music.enabled = ok;
  projectManager.markDirty();
  if (!ok) ui.log("Music playback failed. Check file format and source.");
  syncMusicUi();
});
musicSyncToggle.onchange = () => {
  projectManager.state.music.mode = musicSyncToggle.checked ? "sync" : "independent";
  projectManager.markDirty();
};
musicSmoothSeekToggle.onchange = () => {
  smoothSeekEnabled = musicSmoothSeekToggle.checked;
};
musicVolume.oninput = () => {
  projectManager.state.music.volume = Number(musicVolume.value);
  musicAudio.volume = Number(musicVolume.value);
  projectManager.markDirty();
};
musicStartOffset.oninput = () => {
  projectManager.state.music.startOffset = Math.max(0, Number(musicStartOffset.value || 0));
  projectManager.markDirty();
};
musicAudio.onpause = () => {
  vinylDisc.classList.remove("spinning");
  stopMusicNotes();
};
musicAudio.onplay = () => {
  vinylDisc.classList.add("spinning");
  startMusicNotes();
};
musicAudio.ontimeupdate = syncSeekUi;
musicAudio.onloadedmetadata = syncSeekUi;
musicAudio.onended = () => {
  projectManager.state.music.enabled = false;
  syncMusicUi();
  stopMusicNotes();
  syncSeekUi();
};

musicSeekBar.addEventListener("pointerdown", (event) => {
  musicSeekDragging = true;
  if (musicSeekBar.setPointerCapture) musicSeekBar.setPointerCapture(event.pointerId);
});
musicSeekBar.addEventListener("pointerup", (event) => {
  if (musicSeekBar.hasPointerCapture?.(event.pointerId)) musicSeekBar.releasePointerCapture(event.pointerId);
});
musicSeekBar.addEventListener("pointercancel", () => { musicSeekDragging = false; });
musicSeekBar.addEventListener("lostpointercapture", () => { musicSeekDragging = false; });
musicSeekBar.oninput = () => {
  if (!smoothSeekEnabled) {
    seekToSliderValue();
    return;
  }
  if (musicSeekCommitTimer) clearTimeout(musicSeekCommitTimer);
  musicSeekCommitTimer = setTimeout(seekToSliderValue, 55);
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopMusicNotes();
    return;
  }
  if (!musicAudio.paused) startMusicNotes();
});

syncTransportUi();
syncTransportLocks();
syncSeekUi();

async function registerCloseHandler() {
  await appWindow.onCloseRequested(async (event) => {
    if (handlingClose) return;
    if (inFlightSave) {
      event.preventDefault();
      ui.log("Save in progress");
      return;
    }
    event.preventDefault();
    handlingClose = true;
    try {
      const ok = await confirmSaveBeforeLeave({ promptHtml: "<p>Save before closing?</p>" });
      if (ok) {
        clearMusicObjectUrl();
        await appWindow.close();
      }
    } finally {
      handlingClose = false;
    }
  });
}

(async () => {
  try {
    try {
      await registerCloseHandler();
    } catch (err) {
      console.warn("Close-handler registration failed; app will continue without close intercept:", err);
    }
  ui.showDashboard();
  await refreshDashboard();
  } catch (err) {
    console.error("Startup failure", err);
    await showModalError("App failed to initialize.");
  }
})();

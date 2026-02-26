import { AudioEngine } from "./audioEngine.js";
import { Recorder } from "./recorder.js";
import { Scheduler } from "./scheduler.js";
import { ProjectManager } from "./projectManager.js";
import { ExportManager, encodeWav } from "./exportManager.js";
import { UI } from "./ui.js";

const bpmInput = document.getElementById("bpmInput");
const subdivisionSelect = document.getElementById("subdivisionSelect");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const exportBtn = document.getElementById("exportBtn");
const projectSelect = document.getElementById("projectSelect");
const newProjectBtn = document.getElementById("newProjectBtn");

const audioEngine = new AudioEngine();
const recorder = new Recorder(audioEngine);
const ui = new UI();
const projectManager = new ProjectManager(audioEngine);
const exportManager = new ExportManager(audioEngine, projectManager);

const scheduler = new Scheduler(audioEngine, ({ column, when }) => {
  for (let row = 0; row < 3; row += 1) {
    const index = row * 3 + column;
    if (audioEngine.getCell(index).buffer) {
      audioEngine.scheduleCell(index, when, 1);
      ui.setCellState(index, {
        hasSample: true,
        text: "Playing",
        playing: true
      });
      setTimeout(() => {
        ui.setCellState(index, {
          hasSample: true,
          text: "Ready",
          playing: false
        });
      }, 120);
    }
  }
  ui.highlightColumn(column);
});

const syncTempo = () => {
  const bpm = Number(bpmInput.value);
  const subdivision = Number(subdivisionSelect.value);
  scheduler.updateTempo({ bpm, subdivision });
  projectManager.setTransport({ bpm, subdivision });
  projectManager.autosave().catch((err) => ui.log(`Autosave failed: ${err.message}`));
};

const serializeBufferToWav = (buffer) => encodeWav(buffer);

async function refreshProjects(selectName = null) {
  const projects = await projectManager.listProjects();
  ui.setProjectOptions(projects);
  if (projects.length === 0) {
    const created = await projectManager.createProject("project_1");
    ui.log(`Created project ${created}`);
    return refreshProjects(created);
  }
  const selected = selectName ?? projects[0];
  projectSelect.value = selected;
  const state = await projectManager.loadProject(selected);
  bpmInput.value = String(state.bpm ?? 120);
  subdivisionSelect.value = String(state.subdivision ?? 4);
  syncTempo();

  state.cells.forEach((cell) => {
    ui.setCellState(cell.id, {
      hasSample: Boolean(cell.samplePath),
      text: cell.samplePath ? "Ready" : "Empty"
    });
  });
}

ui.bindCellClick(async (index) => {
  try {
    await audioEngine.ensureRunning();
    if (!recorder.isRecording) {
      ui.setCellState(index, { recording: true, text: "Recording...", hasSample: false });
      recorder.start(index);
      return;
    }

    const buffer = await recorder.stop();
    const wav = serializeBufferToWav(buffer);
    audioEngine.setCellBuffer(index, buffer);
    const path = await projectManager.writeCellWav(index, wav);
    audioEngine.getCell(index).path = path;
    ui.setCellState(index, { hasSample: true, text: "Ready", recording: false });
    ui.log(`Recorded cell ${index + 1}`);
  } catch (error) {
    ui.log(`Record error: ${error.message}`);
    ui.setCellState(index, { hasSample: false, text: "Empty", recording: false });
  }
});

playBtn.addEventListener("click", async () => {
  await audioEngine.ensureRunning();
  syncTempo();
  scheduler.start();
  playBtn.disabled = true;
  stopBtn.disabled = false;
  ui.log("Playback started.");
});

stopBtn.addEventListener("click", () => {
  scheduler.stop();
  playBtn.disabled = false;
  stopBtn.disabled = true;
  ui.highlightColumn(-1);
  ui.log("Playback stopped.");
});

bpmInput.addEventListener("change", syncTempo);
subdivisionSelect.addEventListener("change", syncTempo);

newProjectBtn.addEventListener("click", async () => {
  const name = prompt("New project name", `project_${Date.now()}`);
  if (!name) return;
  await projectManager.createProject(name);
  await refreshProjects(name);
  ui.log(`Project created: ${name}`);
});

projectSelect.addEventListener("change", async () => {
  await refreshProjects(projectSelect.value);
  ui.log(`Loaded project: ${projectSelect.value}`);
});

exportBtn.addEventListener("click", async () => {
  try {
    const path = await exportManager.exportMp3();
    await projectManager.saveProject();
    ui.log(`Exported MP3: ${path}`);
  } catch (error) {
    ui.log(`Export failed: ${error.message}`);
  }
});

function monitorPeak() {
  ui.updatePeak(audioEngine.getPeakLevel());
  requestAnimationFrame(monitorPeak);
}

(async () => {
  try {
    await refreshProjects();
    monitorPeak();
    ui.log("BeatForge ready.");
  } catch (error) {
    ui.log(`Startup failure: ${error.message}`);
  }
})();

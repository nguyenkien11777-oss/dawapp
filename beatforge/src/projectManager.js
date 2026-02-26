const tauriInvoke = async (cmd, args = {}) => {
  const invoker = window.__TAURI__?.core?.invoke;
  if (!invoker) throw new Error("Tauri runtime not available");
  return invoker(cmd, args);
};

export class ProjectManager {
  constructor(audioEngine) {
    this.audioEngine = audioEngine;
    this.currentProject = null;
    this.state = {
      bpm: 120,
      subdivision: 4,
      cells: Array.from({ length: 9 }, (_, i) => ({
        id: i,
        samplePath: null,
        gain: 1
      }))
    };
  }

  async listProjects() {
    return tauriInvoke("list_projects");
  }

  async createProject(name) {
    this.currentProject = await tauriInvoke("create_project", { name });
    await this.saveProject();
    return this.currentProject;
  }

  setTransport({ bpm, subdivision }) {
    this.state.bpm = bpm;
    this.state.subdivision = subdivision;
  }

  setCell(index, samplePath, gain = 1) {
    this.state.cells[index] = { id: index, samplePath, gain: Math.min(1, Math.max(0, gain)) };
  }

  async autosave() {
    if (!this.currentProject) return;
    await tauriInvoke("autosave_project", {
      project: this.currentProject,
      content: JSON.stringify(this.state)
    });
  }

  async saveProject() {
    if (!this.currentProject) return;
    await tauriInvoke("save_project", {
      project: this.currentProject,
      content: JSON.stringify(this.state)
    });
  }

  async loadProject(projectName) {
    this.audioEngine.clearAll();
    this.currentProject = projectName;
    const recovery = await tauriInvoke("check_recovery", { project: projectName });
    let raw = await tauriInvoke("load_project", { project: projectName });

    if (recovery && confirm("Recover autosave for this project?")) {
      raw = recovery;
    }

    this.state = JSON.parse(raw);
    for (const cell of this.state.cells) {
      this.audioEngine.setCellGain(cell.id, cell.gain);
      if (cell.samplePath) {
        const bytes = await tauriInvoke("read_file_bytes", { path: cell.samplePath });
        const data = Uint8Array.from(bytes).buffer;
        const prepared = await this.audioEngine.decodeAndPrepare(data);
        this.audioEngine.setCellBuffer(cell.id, prepared, cell.samplePath);
      }
    }
    return this.state;
  }

  async writeCellWav(index, wavBytes) {
    if (!this.currentProject) throw new Error("No active project selected.");
    const path = await tauriInvoke("write_sample_wav", {
      project: this.currentProject,
      cellId: index,
      bytes: Array.from(wavBytes)
    });
    this.setCell(index, path, this.state.cells[index].gain);
    await this.autosave();
    return path;
  }

  async removeCell(index) {
    const cell = this.state.cells[index];
    if (cell.samplePath) {
      await tauriInvoke("remove_file", { path: cell.samplePath });
    }
    this.setCell(index, null, 1);
    await this.autosave();
  }
}

import { SequencerState } from "./sequencerState.js";
import { invoke } from "@tauri-apps/api/core";

const tauriInvoke = (cmd, args = {}) => invoke(cmd, args);
// const tauriInvoke = async (cmd, args = {}) => {
//   if (!window.__TAURI__ || !window.__TAURI__.core) {
//     throw new Error("Tauri runtime not available. Make sure you run with 'npx tauri dev'");
//   }

//   return window.__TAURI__.core.invoke(cmd, args);
// };

export class ProjectManager {
  constructor() {
    this.currentProject = null;
    this.state = new SequencerState();
    this.dirty = false;
  }

  markDirty() {
    this.dirty = true;
    this.state.touch();
  }

  clearDirty() {
    this.dirty = false;
  }

  async listProjectCards() {
    return tauriInvoke("list_project_cards");
  }

  async createProject(name) {
    await tauriInvoke("create_project", { name });
    this.currentProject = name;
    this.state = new SequencerState();
    this.state.meta.name = name;
    await this.saveProject();
    return name;
  }

  async duplicateProject(source, target) {
    await tauriInvoke("duplicate_project", { source, target });
  }

  async deleteProject(project) {
    await tauriInvoke("delete_project", { project });
    if (this.currentProject === project) {
      this.currentProject = null;
      this.state = new SequencerState();
      this.clearDirty();
    }
  }

  async renameProject(project, newName) {
    await tauriInvoke("rename_project", { project, newName });

    if (this.currentProject === project) {
      this.currentProject = newName;
    }
  }

  async loadProject(project) {
    const raw = await tauriInvoke("load_project", { project });
    this.currentProject = project;
    this.state = SequencerState.fromJSON(JSON.parse(raw));
    this.clearDirty();
    await tauriInvoke("touch_recent_project", { project });
    return this.state;
  }

  async saveProject() {
    if (!this.currentProject) return;
    this.state.meta.name = this.currentProject;
    await tauriInvoke("save_project", {
      project: this.currentProject,
      content: JSON.stringify(this.state, null, 2)
    });
    this.clearDirty();
  }

  async writeMasterWav(wavBytes) {
    return tauriInvoke("write_master_wav", {
      project: this.currentProject,
      bytes: Array.from(wavBytes)
    });
  }

  async listDrumSamples() {
    return tauriInvoke("list_drum_samples");
  }

  async readFileBytes(path) {
    return tauriInvoke("read_file_bytes", { path });
  }
}
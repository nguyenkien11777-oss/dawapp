import { SequencerState } from "./sequencerState.js";
import { invoke } from "@tauri-apps/api/core";

const tauriInvoke = (cmd, args = {}) => invoke(cmd, args);

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

  async listProjectCards() { return tauriInvoke("list_project_cards"); }

  async createProject(name) {
    await tauriInvoke("create_project", { name });
    this.currentProject = name;
    this.state = new SequencerState();
    this.state.meta.name = name;
    await this.saveProject();
    return name;
  }

  async saveAsProject(newName) {
    if (!this.currentProject) return;
    const previousProject = this.currentProject;
    const content = JSON.stringify({ ...this.state, meta: { ...this.state.meta, name: newName } }, null, 2);
    await tauriInvoke("duplicate_project", { source: previousProject, target: newName });
    await tauriInvoke("save_project", { project: newName, content });
    this.currentProject = newName;
    this.state.meta.name = newName;
    this.clearDirty();
  }

  async duplicateProject(source, target) { await tauriInvoke("duplicate_project", { source, target }); }

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
    if (this.currentProject === project) this.currentProject = newName;
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
    await tauriInvoke("save_project", { project: this.currentProject, content: JSON.stringify(this.state, null, 2) });
    this.clearDirty();
  }

  async writeMasterWav(wavBytes) {
    return tauriInvoke("write_master_wav", { project: this.currentProject, bytes: Array.from(wavBytes) });
  }

  async exportMasterMp3ToPath(path) {
    return tauriInvoke("export_mp3_from_master_to_path", { project: this.currentProject, outputPath: path });
  }

  async chooseMp3SavePath(defaultName) {
    return tauriInvoke("pick_save_mp3_path", { defaultName });
  }

  async writeRecordingWav(row, wavBytes) {
    return tauriInvoke("write_recording_wav", { project: this.currentProject, row, bytes: Array.from(wavBytes) });
  }

  async writeMusicFile(fileName, bytes) {
    return tauriInvoke("write_project_music_file", { project: this.currentProject, fileName, bytes: Array.from(bytes) });
  }

  async listDrumSamples() { return tauriInvoke("list_drum_samples"); }
  async readFileBytes(path) { return tauriInvoke("read_file_bytes", { path }); }

  async readProjectFileBytes(path) {
    return tauriInvoke("read_project_file_bytes", { project: this.currentProject, path });
  }
}

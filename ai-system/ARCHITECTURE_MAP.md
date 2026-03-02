# BeatForge v2 Architecture Map

## Authoritative Engine Constitution
**Authoritative Engine Constitution: see `/beatforge/ARCHITECTURE_V1_V2.md`.**

## Runtime Topology
- **Frontend runtime:** Vite-hosted Vanilla JS (`beatforge/src/*`) bound to DOM in `beatforge/index.html`.
- **Audio runtime:** Web Audio API (`AudioContext`, scheduler timing, recorder decode/prep, offline render).
- **Desktop backend:** Tauri v2 + Rust command surface in `beatforge/src-tauri/src/main.rs`.
- **External codec boundary:** Rust shell-out to ffmpeg in `beatforge/src-tauri/src/ffmpeg.rs`.

## Frontend Module Structure
- `main.js`: composition root, transport controller, in-flight coordination, UI event orchestration.
- `audioEngine.js`: decode/prepare, buffer playback, peak metering.
- `scheduler.js`: lookahead timing loop with run invalidation.
- `recorder.js`: MediaRecorder lifecycle + event bus.
- `exportManager.js`: offline mix render + WAV encode + MP3 export invoke.
- `projectManager.js`: JS facade over Tauri commands.
- `sequencerState.js`: state model + schema normalization helpers.
- `ui.js`: DOM rendering, callback dispatch isolation, logging/timer updates.
- `dashboard.js`: thin dashboard refresh adapter.

## Rust Module Structure
- `src-tauri/src/main.rs`:
  - project CRUD commands
  - safe write path
  - dashboard card assembly + MRU sort
  - recording/master write commands
  - project-relative read guard
  - recent project tracking
- `src-tauri/src/ffmpeg.rs`:
  - ffmpeg invocation wrapper for MP3 rendering

## Data Flow (Primary Paths)
1. **Dashboard path**
   - UI click → `main.js` guarded dashboard action → `projectManager` invoke → Rust command → state/UI refresh.
2. **Sequencer playback path**
   - transport action → `transitionTransport` → `scheduler.start/stop` → step callback → buffer lookup → `audioEngine.playBuffer`.
3. **Row recording path**
   - REC click → `recorder.start` → stop/autostop → decoded buffer event → persist to backend via `projectManager.writeRecordingWav`.
4. **Master render/export path**
   - master stop → `exportManager.renderMasterWav` (offline) → `write_master_wav` → optional `export_mp3_from_master`.
5. **Project lifecycle path**
   - create/load/save/rename/duplicate/delete via Tauri command boundary.

## JS ↔ Rust Boundary (Invoke Contracts)
`projectManager.js` + `exportManager.js` invoke:
- `list_project_cards`
- `create_project`
- `duplicate_project`
- `delete_project`
- `rename_project`
- `load_project`
- `save_project`
- `write_master_wav`
- `write_recording_wav`
- `list_drum_samples`
- `read_file_bytes`
- `read_project_file_bytes`
- `touch_recent_project`
- `export_mp3_from_master`

## Dependency Graph (Condensed)
- `main.js` depends on all frontend modules.
- `projectManager.js` and `exportManager.js` depend on `@tauri-apps/api/core`.
- `audioEngine.js`, `scheduler.js`, `recorder.js`, `exportManager.js` depend on browser audio APIs.
- Rust side depends on `tauri`, `serde`, `serde_json`, `dirs`.

## Operational Shape
- Frontend keeps volatile interaction state and audio scheduling.
- Backend owns durable storage and filesystem-facing operations.
- Offline render is client-side audio; persistent/export artifacts cross into Rust for disk and codec operations.

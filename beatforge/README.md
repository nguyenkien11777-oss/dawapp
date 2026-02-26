# BeatForge

BeatForge is an offline desktop mini-DAW loop sequencer built with Tauri, Vanilla JS, WebAudio API, Rust, and ffmpeg.

## Features
- 3x3 sequencer grid with per-cell sample ownership.
- Microphone recording (single active recording, max 60s per cell).
- Normalize to -1dB (target peak 0.891), 5ms fade in/out, clamping to avoid clipping.
- High-precision look-ahead scheduler (`25ms` lookAhead, `100ms` scheduleAheadTime).
- Master gain clipping protection (`0.7`) and per-cell gain cap (`<= 1`).
- Sample-rate normalization to `AudioContext.sampleRate` with OfflineAudioContext resampling.
- Safe project persistence in Windows AppData (`temp -> rename` atomic-style writes).
- Autosave + crash recovery prompt on load.
- Offline loop-cycle render and MP3 export through Rust + ffmpeg (`libmp3lame`, `192k`).

## Project Structure
```
beatforge/
├── src/
│   ├── index.html
│   ├── style.css
│   ├── main.js
│   ├── audioEngine.js
│   ├── recorder.js
│   ├── scheduler.js
│   ├── projectManager.js
│   ├── exportManager.js
│   └── ui.js
├── src-tauri/
│   ├── main.rs
│   ├── ffmpeg.rs
│   └── tauri.conf.json
├── package.json
├── README.md
└── .gitignore
```

## Notes
- Fully offline operation; no paid APIs.
- Output projects are persisted under `%APPDATA%/BeatForge/projects/`.
- MP3 export requires `ffmpeg` available in system PATH.

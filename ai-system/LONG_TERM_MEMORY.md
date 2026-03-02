# Long-Term Operational Memory

Memory descriptions must not constrain future modular refactoring.
If module boundaries change, update LONG_TERM_MEMORY before architectural decisions.

## Risk-Sensitive Areas
- `beatforge/src/main.js`: central event wiring and guard coordination; highest regression blast radius.
- `beatforge/src-tauri/src/main.rs`: filesystem and project lifecycle operations; failures affect data integrity and recoverability.
- `beatforge/src/recorder.js`: async media lifecycle and stop sequencing; prone to race regressions under feature growth.

## Performance Hotspots
- Step scheduling loop + per-step row iteration in `main.js` callback and `scheduler.js`.
- Decode/prepare path in `audioEngine.js` for repeated sample loading.
- Offline full-pattern rendering in `exportManager.js`.
- Rust dashboard card scan/deserialization in `list_project_cards` for large project counts.

## Complexity Clusters
- Transport-state-driven UI + scheduler orchestration in `main.js`.
- Cross-runtime boundaries (`invoke`) with serialized payload contracts.
- Project duplication and recursive copy semantics in Rust.
- Mixed sync/async UI callback paths in `ui.js` and event wrappers.

## Guard-Maintenance Priority Zones
- In-flight guard lifecycles in `main.js`.
- Recorder stop single-flight behavior in `recorder.js`.
- Dashboard action serialization around project open/rename/duplicate/delete.
- Project-relative reads and path resolution checks in Rust backend.

## Expansion Watchlist
- Introducing undo/redo or multi-pattern sequencing will increase state-shape and migration complexity.
- Adding new export formats will deepen codec/runtime dependency surface.
- Multi-window or collaboration features would require explicit rethinking of current single-process assumptions.

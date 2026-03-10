# Long-Term Operational Memory

Memory descriptions must not constrain future modular refactoring.
If module boundaries change:
1. Re-validate against ARCHITECTURE_DOC.
2. Then update LONG_TERM_MEMORY to reflect current structure.

## Memory Governance

- This document must remain concise and operational.
- If it exceeds practical review size, summarize and archive older sections to `ai-system/archive/`.
- Long-term memory must not duplicate constitutional rules.
- Memory is advisory and may be invalidated by live code changes.

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
- Multi-window or collaboration features may require revisiting current single-process assumptions. Must be validated against ARCHITECTURE_DOC.

## Validity Boundary
Derived from repository snapshot_date in AI_STATE.yaml.
Must be revalidated after structural module changes.


## 2026-03-06 Synchronization Note
- Drift check executed against live modules touched by recent change (`beatforge/index.html`, `beatforge/src/style.css`) and risk-sensitive modules (`beatforge/src/main.js`, `beatforge/src-tauri/src/main.rs`).
- Result: No structural drift detected; prior fix is cosmetic/UI-static and does not alter transport authority, in-flight guard discipline, or filesystem containment behavior.
- Phase context updated to v3 expansion on top of preserved v2 safety model.

## 2026-03-10 Synchronization Note
- Drift check executed against live close-flow modules: `beatforge/src/main.js` and `beatforge/src-tauri/capabilities/default.json`, with safety baseline cross-check against `beatforge/src-tauri/src/main.rs`.
- Result: Drift detected in `beatforge/src-tauri/capabilities/default.json` relative to prior snapshot baseline, limited to ACL permission extension (`core:window:allow-destroy`) required by runtime close path.
- Constitutional impact assessment: no change to transport model, authority ownership, module boundaries, filesystem containment, or async guard invariants.
- Compliance gate outcome: all required categories PASS.
- System state after synchronization: STABLE.

BeatForge – Architecture & Evolution Documentation (v1 → v2)
1. Tổng Quan Dự Án

BeatForge là một DAW (Digital Audio Workstation) desktop nhẹ xây dựng bằng:

Frontend: Vanilla JS + Web Audio API

Bundler: Vite

Desktop runtime: Tauri

Backend: Rust (file system + export + project management)

Mục tiêu:

Sequencer theo bước (step sequencer)

Record từng hàng (per-row recording)

Master recording (render toàn bộ mix)

Xuất WAV/MP3

Quản lý project

Dashboard MRU

PHẦN I – v1: Kiến Trúc Ban Đầu
1.1 Kiến trúc tổng thể v1

Frontend (JS)

main.js

recorder.js

scheduler.js

audioEngine.js

exportManager.js

projectManager.js

ui.js

dashboard.js

Backend (Rust)

main.rs (Tauri commands)

Luồng cơ bản:

UI → main.js → scheduler / recorder / export → invoke Tauri → Rust FS

1.2 Đặc điểm v1

Boolean-based transport logic (isPlaying, isMasterRecording)

scheduler.start() / stop() có thể bị gọi từ nhiều nơi

Recording persistence không có in-flight guard

Master export không có single-flight guard

Save không block khi recording đang persist

samplePath lưu absolute path

Duplicate project không đảm bảo isolation

Không có MRU sorting đúng nghĩa

UI async handlers không được catch rejection

recorder.notify không cách ly async listener

read_project_file_bytes không chặn ../ traversal

1.3 Vấn đề v1
1. Race conditions

recorder.stop có thể chạy song song

Save có thể chạy trước khi persist xong

Master stop có thể chạy 2 lần

2. State drift

UI có thể lệch khỏi transport state

scheduler có thể chạy orphan timer

3. Security

Path traversal chưa chặn ../

samplePath absolute

4. Data integrity

Close khi save đang chạy

Duplicate project có thể trỏ file gốc

5. Runtime stability

Unhandled Promise rejections

Async UI callbacks không được isolate

PHẦN II – v2: Stabilization & Production Hardening

v2 không thêm feature lớn.
v2 tập trung:

Stabilization, Determinism, Isolation, Safety.

PHASE 1 – Recording & Persistence Stabilization
Mục tiêu

Loại bỏ race giữa record → persist → save.

Cải tiến
1. Recorder stop single-flight
stoppingPromise

Ngăn stop() chạy song song.

2. inFlightRecordingPersist

Block save khi persist chưa xong.

3. Double stop prevention

Auto-stop + manual-stop hội tụ về một pipeline.

4. Dirty state chính xác

markDirty chỉ sau:

write

samplePath assignment

PHASE 2 – Transport State Machine Hardening
Mục tiêu

Chuyển từ boolean sang state machine.

Centralized transport state
TRANSPORT_STATE = {
  idle,
  playing,
  masterRecording
}
transitionTransport(nextState)

Guard illegal transition

Idempotent

Scheduler authority centralized

Illegal transition blocked:

masterRecording → playing

UI derived strictly from transportState

Không còn:

isMasterRecording boolean

UI drift

PHASE 3 – Export Safety
Mục tiêu

Đảm bảo export không clip và không auto-master ngoài ý định.

Normalize only when peak > TARGET_PEAK

Không amplify low mix.

Clamp [-1, 1]

Không clip WAV.

window.TAURI loại bỏ hoàn toàn

Chuyển sang invoke API chuẩn.

PHASE 4 – Project Lifecycle Integrity
1. samplePath chuyển sang relative

Ví dụ:

recordings/rec_0.wav

Không còn absolute path.

2. Path traversal blocked

Rust:

canonicalize root

canonicalize target

starts_with containment check

Chặn:

../

nested traversal

symlink escape

3. Duplicate project isolation

Recursive copy

Skip master.wav

Skip renders/

recordings/ được copy đầy đủ

4. Close during save blocked

Nếu inFlightSave:

prevent close

không cho discard-close

PHASE 5 – Dashboard & MRU
MRU sorting

Ưu tiên recentProjects từ config.json

Fallback alphabetical

Deterministic

Dashboard deadlock fix

runDashboardAction giữ quyền guard
openProject không tự guard nữa

PHASE 6 – Defensive Guards
inFlight flags:

inFlightSave

inFlightExportMp3

inFlightDashboardAction

inFlightMasterExport

inFlightRecordingPersist

Tất cả:

set trước await

clear trong finally

Không thể stuck true.

Scheduler hardening

runId invalidation

Stale loop không thể tiếp tục.

FINAL HARDENING – UI Stability
1. safeAsync wrapper

Tất cả async DOM handlers đều được wrap.

2. Recorder.notify isolation

Listener async reject không thể escape.

3. UI callback isolation

renderRows callback được guard.

4. Startup IIFE catch

Không còn unhandled rejection khi boot.

v1 vs v2 – So Sánh Tổng Thể
Category	v1	v2
Recorder stop	Có race	Single-flight
Save vs persist	Có race	Guarded
Transport	Boolean	State machine
Scheduler authority	Phân tán	Centralized
Export normalize	Amplify	Only scale down
samplePath	Absolute	Relative
Path traversal	Có thể	Blocked
Duplicate isolation	Không đảm bảo	Fully isolated
Close during save	Có thể corrupt	Blocked
Dashboard deadlock	Có	Fixed
In-flight flags	Không đủ	Full guard
Async UI errors	Unhandled	Fully isolated
Production readiness	Dev-grade	Production-stable
Định Nghĩa Production-Stable của v2

v2 đạt:

No race condition đã biết

No unhandled Promise rejection

No path traversal

No state machine drift

No orphan scheduler

No deadlock dashboard

Deterministic transport

Deterministic MRU

Deterministic export

Nếu Muốn Fork & Phát Triển Phiên Bản Riêng

Nguyên tắc bắt buộc giữ:

Không bao giờ gọi scheduler.start/stop ngoài transitionTransport

Không thêm boolean transport state

Mọi async UI handler phải safeAsync

Mọi file read phải canonical containment check

Mọi async persistence phải có in-flight guard

Không lưu absolute samplePath

Không await listener trong notify (fire-and-forget nhưng isolate rejection)

Kiến Trúc An Toàn Cốt Lõi (Core Safety Principles)

Single authority

Single source of truth

Fire-and-forget with isolation

Guard every async boundary

Deterministic transitions

Canonicalize before trusting filesystem

Never mutate state before IO success

Kết Luận

v1 là functional prototype.
v2 là stabilized production-grade engine.

v2 không tập trung vào feature.
v2 tập trung vào:

Integrity

Determinism

Isolation

Security

Race elimination

tree structure
[
  dawapp/beatforge
  |/assets/drums
    |drum.wav
    |hat.wav
    |hat.wav
    |...
  |/src
    |audioEngine.js
    |constants.js
    |dashboard.js
    |exportManager.js
    |recorder.js
    |scheduler.js
    |sequencerState.js
    |style.css
    |ui.js
  |/src-tauri
    |/gen
    |/icons
    |/src
    |/target
    |build.rs
    |cargo.toml
    |tauri.conf.json
  |index.html
  |package.json
  |pakage-lock.json
]
Từ v2 trở đi, mọi phát triển mới phải giữ các nguyên tắc trên.
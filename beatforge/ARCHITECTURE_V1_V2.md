BeatForge – Architecture & Evolution Documentation (v1 → v2)

1. Tổng Quan Dự Án

BeatForge là DAW desktop nhẹ dùng Frontend: Vanilla JS + Web Audio API, Bundler: Vite, Desktop: Tauri, Backend: Rust (file system + export + project management).

Mục tiêu: Sequencer theo bước, Record từng hàng, Master recording, Xuất WAV/MP3, Quản lý project, Dashboard MRU.

PHẦN I – v1: Kiến Trúc Ban Đầu

1.1 Kiến trúc tổng thể v1

Frontend (JS): main.js, recorder.js, scheduler.js, audioEngine.js, exportManager.js, projectManager.js, ui.js, dashboard.js.

Backend (Rust): main.rs (Tauri commands).

Luồng: UI → main.js → scheduler/recorder/export → invoke Tauri → Rust FS.

1.2 Đặc điểm v1

Transport logic boolean-based (isPlaying, isMasterRecording). scheduler.start/stop gọi từ nhiều nơi. Không có guard cho recording persistence và master export. Save không block khi persist. samplePath absolute. Duplicate project không isolate. MRU không đúng. UI async handlers không catch rejection. recorder.notify không isolate async listener. read_project_file_bytes không chặn ../ traversal.

1.3 Vấn đề v1

1. Race conditions: recorder.stop song song, Save trước persist, Master stop 2 lần.

2. State drift: UI lệch transport state, scheduler orphan timer.

3. Security: Path traversal ../, samplePath absolute.

4. Data integrity: Close khi save, Duplicate trỏ file gốc.

5. Runtime stability: Unhandled Promise rejections, Async UI không isolate.

PHẦN II – v2: Stabilization & Production Hardening

v2 tập trung Stabilization, Determinism, Isolation, Safety, không thêm feature lớn.

PHASE 1 – Recording & Persistence Stabilization

Loại bỏ race record → persist → save.

1. Recorder stop single-flight với stoppingPromise, ngăn song song.

2. inFlightRecordingPersist block save khi persist chưa xong.

3. Double stop prevention hội tụ pipeline.

4. Dirty state markDirty chỉ sau write/samplePath assignment.

PHASE 2 – Transport State Machine Hardening

Chuyển từ boolean sang state machine. Centralized TRANSPORT_STATE: idle, playing, masterRecording. transitionTransport guard illegal transition, idempotent. Scheduler authority centralized. Block masterRecording → playing. UI derived từ transportState. Loại bỏ isMasterRecording boolean, UI drift.

PHASE 3 – Export Safety

Normalize chỉ khi peak > TARGET_PEAK, không amplify low mix. Clamp [-1, 1], không clip WAV. Loại bỏ window.TAURI, dùng invoke API chuẩn.

PHASE 4 – Project Lifecycle Integrity

1. samplePath relative (e.g., recordings/rec_0.wav), không absolute.

2. Path traversal blocked: canonicalize root/target, starts_with check, chặn ../, nested, symlink.

3. Duplicate project recursive copy, skip master.wav/renders/, copy recordings/ đầy đủ.

4. Close during save blocked nếu inFlightSave, prevent discard-close.

PHASE 5 – Dashboard & MRU

MRU ưu tiên recentProjects từ config.json, fallback alphabetical, deterministic.

Dashboard deadlock fix: runDashboardAction guard, openProject không tự guard.

PHASE 6 – Defensive Guards

inFlight flags: inFlightSave, inFlightExportMp3, inFlightDashboardAction, inFlightMasterExport, inFlightRecordingPersist. Set trước await, clear finally, không stuck.

Scheduler hardening: runId invalidation, stale loop không tiếp tục.

FINAL HARDENING – UI Stability

1. safeAsync wrapper cho async DOM handlers.

2. Recorder.notify isolation, listener reject không escape.

3. UI callback isolation, renderRows guard.

4. Startup IIFE catch, không unhandled rejection boot.

v1 vs v2 – So Sánh Tổng Thể

| Category             | v1             | v2                |
| -------------------- | -------------- | ----------------- |
| Recorder stop        | Có race        | Single-flight     |
| Save vs persist      | Có race        | Guarded           |
| Transport            | Boolean        | State machine     |
| Scheduler authority  | Phân tán       | Centralized       |
| Export normalize     | Amplify        | Only scale down   |
| samplePath           | Absolute       | Relative          |
| Path traversal       | Có thể         | Blocked           |
| Duplicate isolation  | Không đảm bảo  | Fully isolated    |
| Close during save    | Có thể corrupt | Blocked           |
| Dashboard deadlock   | Có             | Fixed             |
| In-flight flags      | Không đủ       | Full guard        |
| Async UI errors      | Unhandled      | Fully isolated    |
| Production readiness | Dev-grade      | Production-stable |

Định Nghĩa Production-Stable của v2

v2 đạt: No race condition, No unhandled rejection, No path traversal, No state drift, No orphan scheduler, No deadlock, Deterministic transport/MRU/export.

Nếu Muốn Fork & Phát Triển Phiên Bản Riêng

Giữ nguyên tắc: Không gọi scheduler.start/stop ngoài transitionTransport. Không thêm boolean transport. Async UI handler phải safeAsync. File read phải canonical check. Async persistence phải in-flight guard. Không lưu absolute samplePath. Không await listener trong notify (fire-and-forget, isolate rejection).

Kiến Trúc An Toàn Cốt Lõi (Core Safety Principles)

Single authority, Single source of truth, Fire-and-forget with isolation, Guard every async boundary, Deterministic transitions, Canonicalize filesystem, Never mutate state before IO success.

Kết Luận

v1: functional prototype. v2: stabilized production-grade engine. v2 tập trung Integrity, Determinism, Isolation, Security, Race elimination.

Cấu trúc cây:

[dawapp/beatforge
|/assets/drums
|drum.wav, hat.wav, ...
|/src
|audioEngine.js, constants.js, dashboard.js, exportManager.js, recorder.js, scheduler.js, sequencerState.js, style.css, ui.js
|/src-tauri
|/gen, /icons, /src, /target, build.rs, cargo.toml, tauri.conf.json
|index.html, package.json, pakage-lock.json]

Từ v2 trở đi, phát triển giữ nguyên tắc trên. v3 mở rộng trên v2 engine, không thay đổi core safety, nhưng mở rộng UI/UX, Music player, Audio tools, Project interaction, Tempo simplification, Menu, Modal UI.

Nếu xung đột, v3 ưu tiên.

1. Tempo System Simplification (Subdivision Removal)

Loại bỏ Subdivision hoàn toàn. Tempo chỉ BPM. BPM Control: preset selector, slider, numeric display. Presets: 95,100,120,130,140,160,170. Sync rules: preset update slider/numeric, slider update numeric.

2. Music Player Architecture

Subsystem tách biệt sequencer. UI dưới Preset Drum Rack. Layout: spinning disc, curved title, play toggle, volume knob, offset control, mode selector, replace/remove. Track title curved, truncate nếu dài.

3. Music Playback Modes

Independent: chạy độc lập transport. Sync With Beat: sync transport, restart từ offset (seconds). Start khi playing/masterRecording, stop khi idle.

4. Imported Music Persistence

Import từ filesystem. Save: modal "Include in project?" YES: copy to project/music/, persist relative. NO: không lưu, reset player. Không lưu absolute.

5. Audio Tools System

Cho recording, không preset/imported. Tools: Trim (start/end seconds), Normalize, Reverse, Gain (-24dB to +24dB). Áp dụng last clicked REC row.

6. Master Export Workflow (Redesign)

Loại bỏ Export MP3 button. STOP master recording: mở save dialog, default <project-name>-pipi.mp3. Internal render master.wav luôn giữ. MP3 là export copy.

7. Preset Sample UX

Dropdown hiển thị filename without extension, truncate ellipsis. Preview play once khi chọn.

8. Transport Locked UI

playing/masterRecording: khóa preset dropdown, REC buttons. Unlock idle.

9. Top Menu System

Menu: File, Option. File: Save, Save As, Rename, Save As (new folder, copy state, switch project). Rename block trùng.

10. Modal UI Framework

Loại bỏ alert/confirm/prompt, dùng custom modal: center, rounded, blurred, focus trap, keyboard safe. Cho Save As, Rename, Trim, Gain, Include music, Errors.

11. Global Scrollbar Styling

Scrollbar ẩn, scrolling hoạt động.

12. UI/UX Redesign Layer

Visual: clean, tactile, music-centric, playful professional. Vinyl spin smooth, subtle lighting, real hardware feel. Animations soft easing, no abrupt.

13. Layout Update (v3)

Top Menu | Transport Controls | BPM Controls | Step Sequencer Grid | Preset Drum Rack | Music Player (Vinyl) | Status/Logs

14. Architecture Conflict Policy

v2 safety luôn giữ. v3 feature mở rộng. Conflict: document, use v3, không phá v2.

Tổng Kết

v3 không thay đổi transport state machine, filesystem security, async guard, recording pipeline. Chỉ mở rộng UI, UX, Music workflow, Audio tools, Menu.

15. v3.5 Governance Rules (Audio Editor + Import + Export Reliability)

v3.5 là lớp mở rộng trên v3, vẫn giữ toàn bộ safety kernel của v2.

15.1 Dedicated Audio Editor Screen (not modal)

REC Audio Editor phải là màn hình riêng, chuyển trạng thái tương tự Dashboard/Sequencer, không dùng modal làm giao diện chỉnh sửa chính.
Editor phải có điều hướng rõ ràng: Sequencer -> Audio Editor -> Sequencer.

15.2 REC Selection Authority inside Editor

Audio Editor phải có vùng chọn REC row độc lập trong chính editor.
Không phụ thuộc vào last-click context của sequencer.
Khi đổi REC row, editor phải cập nhật source, waveform và preview theo row mới.

15.3 Extreme Pitch Range + Visual Feedback

Pitch control trong editor phải hỗ trợ kéo từ rất cao xuống rất thấp (extreme range).
Mọi thay đổi trim/pitch/tone/voice phải phản ánh lên waveform bars để người dùng nhìn thấy kết quả xử lý.
Nếu preview được bật hoặc user yêu cầu preview, phải phát theo processed buffer hiện tại.

15.4 Deterministic Processing + Save Semantics

Chuỗi xử lý audio editor phải deterministic, không phụ thuộc timing ngẫu nhiên của UI callback.
Save từ editor phải ghi vào recording path tương ứng REC row được chọn (project-relative), không ghi absolute path.
Không mutate state trước khi IO thành công (giữ nguyên nguyên tắc v2).

15.5 WAV-only Import Security Rule

Import vào Preset Drum Rack chỉ chấp nhận .wav.
Validation phải có ở cả frontend và backend; backend là authority cuối cùng.
Filename phải sanitize; không cho path traversal; destination nằm trong /assets/drums.

15.6 MP3 Export Reliability Rule

Master finalize phải luôn giữ master.wav trước khi thử xuất MP3.
Nếu encoder MP3 thiếu ở runtime (ví dụ ffmpeg không sẵn có), hệ thống phải trả lỗi rõ ràng, actionable, và không được làm mất dữ liệu master.wav.
Thông điệp lỗi phải hướng user tới fallback (giữ WAV / thử lại MP3 sau khi cài encoder).

15.7 Forward Compatibility Contract

Mọi phiên bản sau v3.5 khi mở rộng Audio Editor/Import/Export phải chứng minh:
- Không phá transport state machine authority.
- Không phá in-flight guard lifecycle.
- Không phá filesystem containment và relative-path persistence.
- Không tạo unhandled async rejection từ UI/editor callbacks.

16. v4 Feature Execution Layer (Quick Assist + Welcome + UX Safety)

v4 mở rộng trên v3.5, vẫn giữ toàn bộ safety kernel của v2.

16.1 V4 Quick Assist Menu Separation Rule

Các hành động V4 Quick Assist phải nằm ở menu riêng, tách khỏi Option menu để tránh trộn lẫn với Audio Tools và giảm thao tác nhầm.

16.2 Quick Assist Immediate-Apply Rule

Mọi gợi ý quick-assist khi user nhấn phải có thể auto-apply ngay trong phạm vi state hiện tại (template/mix/master/performance), không yêu cầu luồng phụ gây chậm workflow.

16.3 Screen Transition Audio Kill Rule

Khi chuyển screen (Welcome/Dashboard/Sequencer/Theme/Audio Editor), mọi nguồn phát âm thanh đang chạy phải dừng hoàn toàn trước khi hoàn tất chuyển screen.

16.4 Preset Sample Selector Visibility Rule

UI chọn sample cho Preset Drum Rack phải giới hạn danh sách hiển thị tối đa 7 mục mỗi lần xem; nếu nhiều hơn phải cuộn được nhưng ẩn thanh cuộn để giữ thẩm mỹ giao diện.

16.5 Status Log Readability + Capacity Rule

Status log phải luôn readable theo theme nền; chỉ giữ tối đa 7 thông báo gần nhất theo khung hiển thị, phần vượt ngưỡng cho phép cuộn và vẫn ẩn thanh cuộn.

16.6 Audio Editor Visual Consistency Rule

Màu nền/visual base của Pitch knob là chuẩn tham chiếu cho các control knob khác trong REC Audio Editor (Gain/EQ/Filter/FX) để giữ ngôn ngữ thiết kế thống nhất.

16.7 Audio Editor Sidebar Anchoring Rule

REC Row Selection panel trong Audio Editor phải kéo theo chiều cao màn hình editor và nhóm nút Reset/Save phải neo ở đáy panel để thao tác nhất quán.

16.8 Welcome Screen Entry Rule

Khi khởi động app, màn hình đầu tiên là Welcome screen riêng.
Welcome screen phải có tính nhận diện chuyên nghiệp, hiển thị rõ phiên bản đang chạy và thông tin định hướng cơ bản.
User nhấn/chạm bất kỳ vị trí hợp lệ để vào Dashboard.

16.9 Forward Stability Contract for v4+

Mọi phiên bản sau v4 khi mở rộng Quick Assist/Welcome/Arrangement/Mixing phải chứng minh:
- Không phá transport state machine authority.
- Không phá in-flight guard lifecycle.
- Không phá filesystem containment và relative-path persistence.
- Không tạo unhandled async rejection từ UI callbacks.
- Không làm screen transition để sót nguồn âm đang phát.

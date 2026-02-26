BeatForge

BeatForge là một ứng dụng desktop chạy local (Windows) được xây dựng bằng Tauri v2 + Rust + WebAudio API, cho phép người dùng:

Thu âm trực tiếp từ micro

Tạo loop beat theo grid 3x3

Điều chỉnh BPM

Chỉnh gain per-cell

Loop theo column scheduler

Normalize và bảo vệ clipping

Export MP3 offline bằng ffmpeg

Ứng dụng hoạt động hoàn toàn offline, mỗi máy lưu dữ liệu riêng biệt.

Mục tiêu thiết kế

BeatForge được thiết kế theo nguyên tắc:

Offline-first

Không phụ thuộc API trả phí

1 user / 1 máy

Dữ liệu local trong AppData

Kiến trúc tách biệt rõ ràng giữa UI, Audio Engine và Backend

Mục tiêu dài hạn: có thể mở rộng thành mini DAW cá nhân.

Kiến trúc tổng thể
Frontend (Vanilla JS + WebAudio)
src/
 ├ index.html
 ├ style.css
 ├ main.js
 ├ ui.js
 ├ audioEngine.js
 ├ recorder.js
 ├ scheduler.js
 ├ projectManager.js
 ├ exportManager.js
audioEngine.js

Quản lý AudioContext

PlaybackRate (gộp pitch + tempo)

Master gain cap 0.7

Per-cell gain

Normalize về -1dB (~0.891)

Fade in/out 5ms

Clamp sample [-1, 1]

Sample-rate mismatch handling

Source cleanup (stop + disconnect)

recorder.js

1 recording tại 1 thời điểm

Max sample duration: 60s

Overwrite sample cũ nếu ghi lại

Stream track cleanup

scheduler.js

Look-ahead scheduler

Poll interval: 25ms

Schedule window: 100ms

Loop theo column 0 → 1 → 2

Dựa trên audioContext.currentTime

projectManager.js

Autosave

Safe write (temp → rename)

Crash recovery

Load/save project JSON

Sample IO

exportManager.js

OfflineAudioContext render

Render mặc định 8 bars

WAV encode JS

Gọi Rust backend encode MP3 (192kbps)

Backend (Rust + Tauri v2)
src-tauri/
 ├ Cargo.toml
 ├ build.rs
 ├ tauri.conf.json
 ├ icons/
 ├ src/
 │   ├ main.rs
 │   ├ ffmpeg.rs
main.rs

Expose Tauri commands:

save_project

load_project

write_sample

read_sample

delete_sample

export_mp3

ffmpeg.rs

Wrapper async gọi:

ffmpeg -codec:a libmp3lame -b:a 192k
Luồng hoạt động

Người dùng nhấn vào ô (3x3)

Ghi âm bắt đầu

Nhấn lại → dừng ghi

Sample được:

Normalize -1dB

Fade 5ms

Clamp

Scheduler chạy theo BPM

Column loop kích hoạt playback

Offline render khi export

Rust encode MP3

Thông số kỹ thuật

Grid: 3x3

Master gain max: 0.7

Sample max duration: 60s

1 recording tại 1 thời điểm

Autosave enabled

Crash recovery supported

Offline MP3 export

No cloud sync

Windows only (hiện tại)

Thư mục dữ liệu

Windows AppData:

%APPDATA%/BeatForge/projects/

Mỗi project chứa:

project.json

samples/

autosave.json

Yêu cầu môi trường phát triển

Node LTS

Rust stable (MSVC)

Visual Studio C++ Build Tools

WebView2

Chạy dev
npm install
npx tauri dev
Build production
npx tauri build

File exe sẽ nằm trong:

src-tauri/target/release/bundle/
Quy tắc phát triển thêm (RẤT QUAN TRỌNG)

Bất kỳ AI/dev nào mở rộng BeatForge phải tuân thủ:

Không thay đổi cấu trúc thư mục

Không gộp file frontend

Không phá scheduler look-ahead

Không bỏ normalize -1dB

Không bỏ master gain cap 0.7

Không thêm dependency cloud

Không làm thay đổi project file format cũ

Nếu cần mở rộng:

Thêm module mới riêng

Không sửa module cũ trừ khi refactor có kiểm soát

Giữ backward compatibility project.json

Roadmap tương lai

Undo/Redo stack

MIDI input support

Waveform preview per-cell

Per-cell pitch control

Loop length configurable

Multi-pattern support

Drag & drop sample import

Windows installer customization

Triết lý thiết kế

BeatForge không hướng tới DAW phức tạp.
Nó là công cụ sáng tạo loop nhanh, nhẹ, ổn định và offline.

License

Private project – chưa public license.
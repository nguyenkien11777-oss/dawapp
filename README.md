# BeatForge – Ứng dụng Loop Beat & Voice Sampler (Desktop Offline)

🚀 Giới thiệu

BeatForge là một ứng dụng desktop chạy hoàn toàn offline trên Windows, cho phép người dùng:

🎙 Thu âm trực tiếp từ micro

🎚 Tự động chuẩn hóa âm lượng (Normalize -1dB)

🎵 Tạo beat theo dạng lặp (Loop Sequencer)

🟦 Sắp xếp âm thanh trên grid 3x3

🔁 Phát lại theo BPM tùy chỉnh (20–300 BPM)

💾 Lưu nhiều project riêng biệt

🎧 Xuất file MP3 bằng ffmpeg (không dùng API trả phí)

Ứng dụng được xây dựng bằng:

HTML + CSS + JavaScript (Frontend)

Tauri (đóng gói thành file .exe)

Rust backend (xử lý file & encode MP3)

WebAudio API (xử lý âm thanh realtime)

Hoạt động hoàn toàn offline.

🧱 Kiến trúc tổng thể
1️⃣ Loại ứng dụng

Ứng dụng Desktop (.exe)

Chạy local trên Windows

Không cần internet

Không sử dụng API trả phí
🟦 Hệ thống Grid (Sequencer)

Kích thước: 3x3

Tổng cộng 9 ô độc lập

Mỗi ô chứa 1 sample riêng

Loop theo từng cột

Cách hoạt động:

Cột 0 → phát tất cả ô active ở cột 0
Cột 1 → phát tất cả ô active ở cột 1
Cột 2 → phát tất cả ô active ở cột 2
→ Lặp lại

Step type hỗ trợ:

1/4

1/8

1/16

🎙 Hệ thống ghi âm
Quy tắc:

Chỉ cho phép 1 recording tại 1 thời điểm

Mỗi ô ghi tối đa 60 giây

Không cho ghi chồng

Ghi lại sẽ xóa sample cũ

Tự động Normalize về -1dB

Tự động Fade in/out 5ms để tránh click pop

Lưu file WAV vào folder project

Beat tổng không giới hạn thời gian.

🎚 Normalize -1dB là gì?

Âm thanh digital có biên độ từ -1.0 đến +1.0.

Nếu đạt 1.0 → có thể gây clipping.

Normalize -1dB nghĩa là:

Tìm biên độ lớn nhất trong sample

Scale toàn bộ waveform sao cho peak ≈ 0.891

Đảm bảo âm lượng lớn nhưng không vỡ

🔊 Hệ thống âm thanh
Core Engine gồm:

AudioContext

Scheduler precision cao

Master Gain giới hạn 0.7

Peak Meter realtime

AnalyserNode

🛡 Clipping Protection

MasterGain giới hạn 0.7

Normalize -1dB

Tránh vỡ tiếng khi nhiều sample phát cùng lúc

🧠 Scheduler Precision

Không dùng setInterval đơn giản.

Sử dụng kỹ thuật lookAhead scheduling dựa trên:

audioContext.currentTime

Đảm bảo beat chính xác ngay cả khi CPU bận.

🔄 Xử lý Sample Rate Mismatch

Tự động resample về sampleRate của AudioContext

Offline render dùng cùng sampleRate

Tránh lỗi lệch cao độ

🧹 Memory Leak Protection

Khi:

Ghi lại

Xóa sample

Load project

Hệ thống sẽ:

Stop source

Disconnect node

Clear buffer

Giải phóng bộ nhớ

💾 Project Management

Hỗ trợ nhiều project

Autosave sau mỗi thay đổi

Phục hồi project nếu app crash

Undo / Redo bằng stack state

🎵 Xuất MP3

Quy trình:

Render toàn bộ loop bằng OfflineAudioContext

Xuất WAV

Gửi sang Rust backend

Rust dùng ffmpeg encode MP3

Không cần API trả phí.

📊 Peak Meter

Hiển thị mức âm thanh realtime.
Giúp:

Tránh clipping

Theo dõi mức volume

🎛 Thông số kỹ thuật

BPM: 20 – 300

Max sample mỗi ô: 60 giây

Tổng số sample tối đa: 9

Master Gain: 0.7

Normalize: -1dB

Fade in/out: 5ms

🎨 Giao diện

Dark mode

Nền đen

Chữ trắng

Ô đang ghi: đỏ nhấp nháy

Ô active: xanh neon

Cột đang phát: xanh lá

Thanh trên cùng:

BPM

Step type

Play / Stop

Export MP3

Project selector

🔐 Tính năng an toàn

Microphone permission handling

Crash recovery

Safe file write

Không ghi vào Program Files

Không yêu cầu internet

📌 Tóm tắt

BeatForge là:

Mini DAW dạng loop sequencer

Thu âm trực tiếp

Hoạt động hoàn toàn offline

Đóng gói thành file .exe

Không phụ thuộc dịch vụ bên thứ ba

Thiết kế tối ưu cho cá nhân sử dụng và lưu trữ riêng biệt trên từng máy.

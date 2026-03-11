use std::path::Path;
use std::process::Command;

pub fn ffmpeg_available() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn encode_mp3(input_wav: &Path, output_mp3: &Path) -> Result<(), String> {
    if !ffmpeg_available() {
        return Err("FFMPEG_NOT_FOUND: ffmpeg is not available in PATH".to_string());
    }

    let status = Command::new("ffmpeg")
        .arg("-y")
        .arg("-i")
        .arg(input_wav)
        .arg("-codec:a")
        .arg("libmp3lame")
        .arg("-b:a")
        .arg("192k")
        .arg(output_mp3)
        .status()
        .map_err(|err| format!("FFMPEG_EXEC_ERROR: Failed to execute ffmpeg: {err}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("FFMPEG_EXIT_STATUS: ffmpeg exited with status: {status}"))
    }
}

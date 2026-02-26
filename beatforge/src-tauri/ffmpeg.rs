use std::path::Path;
use std::process::Command;

pub fn encode_mp3(input_wav: &Path, output_mp3: &Path) -> Result<(), String> {
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
        .map_err(|err| format!("Failed to execute ffmpeg: {err}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("ffmpeg exited with status: {status}"))
    }
}

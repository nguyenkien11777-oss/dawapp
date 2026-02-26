mod ffmpeg;

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

fn app_root() -> Result<PathBuf, String> {
    let roaming = dirs::data_dir().ok_or("Unable to resolve appDataDir")?;
    let root = roaming.join("BeatForge");
    fs::create_dir_all(root.join("projects")).map_err(|e| e.to_string())?;
    Ok(root)
}

fn project_dir(project: &str) -> Result<PathBuf, String> {
    let dir = app_root()?.join("projects").join(project);
    fs::create_dir_all(dir.join("samples")).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(bytes).map_err(|e| e.to_string())?;
    f.flush().map_err(|e| e.to_string())?;
    fs::rename(tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_projects() -> Result<Vec<String>, String> {
    let root = app_root()?.join("projects");
    let mut projects = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().is_dir() {
            projects.push(entry.file_name().to_string_lossy().to_string());
        }
    }
    projects.sort();
    Ok(projects)
}

#[tauri::command]
fn create_project(name: String) -> Result<String, String> {
    project_dir(&name)?;
    Ok(name)
}

#[tauri::command]
fn save_project(project: String, content: String) -> Result<(), String> {
    let path = project_dir(&project)?.join("project.json");
    safe_write(&path, content.as_bytes())
}

#[tauri::command]
fn autosave_project(project: String, content: String) -> Result<(), String> {
    let path = project_dir(&project)?.join("autosave.json");
    safe_write(&path, content.as_bytes())
}

#[tauri::command]
fn check_recovery(project: String) -> Result<Option<String>, String> {
    let path = project_dir(&project)?.join("autosave.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

#[tauri::command]
fn load_project(project: String) -> Result<String, String> {
    let path = project_dir(&project)?.join("project.json");
    if !path.exists() {
        return Ok("{\"bpm\":120,\"subdivision\":4,\"cells\":[]}".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_sample_wav(project: String, cell_id: usize, bytes: Vec<u8>) -> Result<String, String> {
    let path = project_dir(&project)?.join("samples").join(format!("cell_{cell_id}.wav"));
    safe_write(&path, &bytes)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn export_mp3(project: String, wav_bytes: Vec<u8>) -> Result<String, String> {
    let dir = project_dir(&project)?;
    let wav_path = dir.join("render_tmp.wav");
    let mp3_path = dir.join("export.mp3");
    safe_write(&wav_path, &wav_bytes)?;
    ffmpeg::encode_mp3(&wav_path, &mp3_path)?;
    let _ = fs::remove_file(wav_path);
    Ok(mp3_path.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_projects,
            create_project,
            save_project,
            autosave_project,
            check_recovery,
            load_project,
            write_sample_wav,
            read_file_bytes,
            remove_file,
            export_mp3
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

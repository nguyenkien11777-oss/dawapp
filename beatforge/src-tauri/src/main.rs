mod ffmpeg;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
struct ProjectCard {
    name: String,
    created: String,
    modified: String,
    bpm: u64,
    subdivision: String,
    row_count: usize,
    has_master: bool,
}

fn app_root() -> Result<PathBuf, String> {
    let roaming = dirs::data_dir().ok_or("Unable to resolve appDataDir")?;
    let root = roaming.join("BeatForge");
    fs::create_dir_all(root.join("projects")).map_err(|e| e.to_string())?;
    Ok(root)
}

fn config_path() -> Result<PathBuf, String> { Ok(app_root()?.join("config.json")) }

fn project_dir(project: &str) -> Result<PathBuf, String> {
    let dir = app_root()?.join("projects").join(project);
    fs::create_dir_all(dir.join("renders")).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("recordings")).map_err(|e| e.to_string())?;
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
fn list_project_cards() -> Result<Vec<ProjectCard>, String> {
    let root = app_root()?.join("projects");
    let mut cards = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.path().is_dir() { continue; }
        let name = entry.file_name().to_string_lossy().to_string();
        let p = entry.path().join("project.json");
        let raw = if p.exists() { fs::read_to_string(&p).unwrap_or_else(|_| "{}".into()) } else { "{}".into() };
        let v: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
        let bpm = v.pointer("/sequencer/bpm").and_then(Value::as_u64).unwrap_or(120);
        let subdivision = v.pointer("/sequencer/subdivision").and_then(Value::as_str).unwrap_or("1/16").to_string();
        let user_rows = v.pointer("/sequencer/userRows").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0);
        let preset_rows = v.pointer("/sequencer/presetRows").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0);
        cards.push(ProjectCard {
            name,
            created: v.pointer("/meta/createdAt").and_then(Value::as_str).unwrap_or("").to_string(),
            modified: v.pointer("/meta/updatedAt").and_then(Value::as_str).unwrap_or("").to_string(),
            bpm,
            subdivision,
            row_count: user_rows + preset_rows,
            has_master: entry.path().join("master.wav").exists(),
        });
    }
    cards.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(cards)
}

#[tauri::command]
fn create_project(name: String) -> Result<String, String> { project_dir(&name)?; Ok(name) }

#[tauri::command]
fn save_project(project: String, content: String) -> Result<(), String> {
    safe_write(&project_dir(&project)?.join("project.json"), content.as_bytes())
}

#[tauri::command]
fn load_project(project: String) -> Result<String, String> {
    let path = project_dir(&project)?.join("project.json");
    if !path.exists() { return Ok("{}".into()); }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_project(project: String, new_name: String) -> Result<(), String> {
    let src = app_root()?.join("projects").join(project);
    let dst = app_root()?.join("projects").join(new_name);
    fs::rename(src, dst).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_project(project: String) -> Result<(), String> {
    let dir = app_root()?.join("projects").join(project);
    if dir.exists() { fs::remove_dir_all(dir).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
fn duplicate_project(source: String, target: String) -> Result<(), String> {
    let src = app_root()?.join("projects").join(source);
    let dst = project_dir(&target)?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let e = entry.map_err(|e| e.to_string())?;
        let path = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if name == "master.wav" || name == "renders" { continue; }
        let out = dst.join(name);
        if path.is_file() { fs::copy(path, out).map_err(|e| e.to_string())?; }
    }
    Ok(())
}


#[tauri::command]
fn write_recording_wav(project: String, row: usize, bytes: Vec<u8>) -> Result<String, String> {
    let path = project_dir(&project)?.join("recordings").join(format!("rec_{row}.wav"));
    safe_write(&path, &bytes)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn write_master_wav(project: String, bytes: Vec<u8>) -> Result<String, String> {
    let path = project_dir(&project)?.join("master.wav");
    safe_write(&path, &bytes)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_mp3_from_master(project: String) -> Result<String, String> {
    let dir = project_dir(&project)?;
    let wav_path = dir.join("master.wav");
    if !wav_path.exists() { return Err("master.wav not found".into()); }
    let mp3_path = dir.join("renders").join("export.mp3");
    ffmpeg::encode_mp3(&wav_path, &mp3_path)?;
    Ok(mp3_path.to_string_lossy().to_string())
}

#[tauri::command]
fn list_drum_samples() -> Result<Vec<String>, String> {
    let dir = std::env::current_dir().map_err(|e| e.to_string())?.join("assets").join("drums");
    if !dir.exists() { return Ok(vec![]); }
    let mut files = vec![];
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let p = entry.map_err(|e| e.to_string())?.path();
        if p.is_file() && p.extension().and_then(|s| s.to_str()).unwrap_or("").eq_ignore_ascii_case("wav") {
            files.push(p.to_string_lossy().to_string());
        }
    }
    files.sort();
    Ok(files)
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> { fs::read(path).map_err(|e| e.to_string()) }

#[tauri::command]
fn touch_recent_project(project: String) -> Result<(), String> {
    let path = config_path()?;
    let mut list: Vec<String> = if path.exists() {
        serde_json::from_str::<Value>(&fs::read_to_string(&path).map_err(|e| e.to_string())?)
            .ok()
            .and_then(|v| v.get("recentProjects").and_then(Value::as_array).cloned())
            .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default()
    } else { vec![] };
    list.retain(|p| p != &project);
    list.insert(0, project);
    list.truncate(10);
    safe_write(&path, serde_json::to_string_pretty(&json!({"recentProjects": list})).unwrap().as_bytes())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_project_cards,
            create_project,
            save_project,
            load_project,
            rename_project,
            delete_project,
            duplicate_project,
            write_recording_wav,
            write_master_wav,
            export_mp3_from_master,
            list_drum_samples,
            read_file_bytes,
            touch_recent_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

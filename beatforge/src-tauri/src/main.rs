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
    row_count: usize,
    has_master: bool,
}

fn app_root() -> Result<PathBuf, String> {
    let roaming = dirs::data_dir().ok_or("Unable to resolve appDataDir")?;
    let root = roaming.join("BeatForge");
    fs::create_dir_all(root.join("projects")).map_err(|e| e.to_string())?;
    Ok(root)
}

fn config_path() -> Result<PathBuf, String> {
    Ok(app_root()?.join("config.json"))
}

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

fn read_recent_projects() -> Result<Vec<String>, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }

    let list = serde_json::from_str::<Value>(&fs::read_to_string(path).map_err(|e| e.to_string())?)
        .ok()
        .and_then(|v| v.get("recentProjects").and_then(Value::as_array).cloned())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    Ok(list)
}

fn sort_cards_by_mru(cards: &mut [ProjectCard]) -> Result<(), String> {
    let mru = read_recent_projects()?;
    cards.sort_by(|a, b| {
        let ia = mru.iter().position(|p| p == &a.name);
        let ib = mru.iter().position(|p| p == &b.name);
        match (ia, ib) {
            (Some(x), Some(y)) => x.cmp(&y),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.name.cmp(&b.name),
        }
    });
    Ok(())
}

fn copy_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
            let e = entry.map_err(|e| e.to_string())?;
            copy_recursive(&e.path(), &dst.join(e.file_name()))?;
        }
        return Ok(());
    }

    fs::copy(src, dst).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_project_cards() -> Result<Vec<ProjectCard>, String> {
    let root = app_root()?.join("projects");
    let mut cards = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let p = entry.path().join("project.json");
        let raw = if p.exists() {
            fs::read_to_string(&p).unwrap_or_else(|_| "{}".into())
        } else {
            "{}".into()
        };
        let v: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
        let bpm = v
            .pointer("/sequencer/bpm")
            .and_then(Value::as_u64)
            .unwrap_or(120);
        let user_rows = v
            .pointer("/sequencer/userRows")
            .and_then(Value::as_array)
            .map(|a| a.len())
            .unwrap_or(0);
        let preset_rows = v
            .pointer("/sequencer/presetRows")
            .and_then(Value::as_array)
            .map(|a| a.len())
            .unwrap_or(0);
        cards.push(ProjectCard {
            name,
            created: v
                .pointer("/meta/createdAt")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            modified: v
                .pointer("/meta/updatedAt")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            bpm,
            row_count: user_rows + preset_rows,
            has_master: entry.path().join("master.wav").exists(),
        });
    }

    sort_cards_by_mru(&mut cards)?;
    Ok(cards)
}

#[tauri::command]
fn create_project(name: String) -> Result<String, String> {
    let dir = app_root()?.join("projects").join(&name);
    if dir.exists() {
        return Err("project already exists".into());
    }
    project_dir(&name)?;
    Ok(name)
}

#[tauri::command]
fn save_project(project: String, content: String) -> Result<(), String> {
    safe_write(&project_dir(&project)?.join("project.json"), content.as_bytes())
}

#[tauri::command]
fn load_project(project: String) -> Result<String, String> {
    let path = project_dir(&project)?.join("project.json");
    if !path.exists() {
        return Ok("{}".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_project(project: String, new_name: String) -> Result<(), String> {
    let src = app_root()?.join("projects").join(project);
    let dst = app_root()?.join("projects").join(new_name);
    if dst.exists() {
        return Err("project already exists".into());
    }
    fs::rename(src, dst).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_project(project: String) -> Result<(), String> {
    let dir = app_root()?.join("projects").join(project);
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn duplicate_project(source: String, target: String) -> Result<(), String> {
    let src = app_root()?.join("projects").join(source);
    let dst = app_root()?.join("projects").join(&target);
    if dst.exists() {
        return Err("project already exists".into());
    }
    let dst = project_dir(&target)?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let e = entry.map_err(|e| e.to_string())?;
        let path = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if name == "master.wav" || name == "renders" {
            continue;
        }
        let out = dst.join(name);
        copy_recursive(&path, &out)?;
    }
    Ok(())
}

#[tauri::command]
fn write_recording_wav(project: String, row: usize, bytes: Vec<u8>) -> Result<String, String> {
    let relative = PathBuf::from("recordings").join(format!("rec_{row}.wav"));
    let path = project_dir(&project)?.join(&relative);
    safe_write(&path, &bytes)?;
    Ok(relative.to_string_lossy().to_string())
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
    if !wav_path.exists() {
        return Err("master.wav not found".into());
    }
    let mp3_path = dir.join("renders").join("export.mp3");
    ffmpeg::encode_mp3(&wav_path, &mp3_path)?;
    Ok(mp3_path.to_string_lossy().to_string())
}


#[tauri::command]
fn export_mp3_from_master_to_path(project: String, output_path: String) -> Result<String, String> {
    let dir = project_dir(&project)?;
    let wav_path = dir.join("master.wav");
    if !wav_path.exists() {
        return Err("master.wav not found".into());
    }
    let mut out = PathBuf::from(output_path);
    if out.extension().is_none() {
        out.set_extension("mp3");
    }
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    ffmpeg::encode_mp3(&wav_path, &out)?;
    Ok(out.to_string_lossy().to_string())
}

#[tauri::command]
fn path_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(path).exists())
}

#[tauri::command]
fn pick_save_mp3_path(default_name: String) -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter("MP3", &["mp3"])
        .save_file();
    Ok(file.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn write_project_music_file(project: String, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let sanitized = Path::new(&file_name).file_name().ok_or("invalid file name")?.to_string_lossy().to_string();
    let relative = PathBuf::from("music").join(sanitized);
    let root = project_dir(&project)?;
    fs::create_dir_all(root.join("music")).map_err(|e| e.to_string())?;
    let target = root.join(&relative);
    safe_write(&target, &bytes)?;
    Ok(relative.to_string_lossy().to_string())
}

#[tauri::command]
fn list_drum_samples() -> Result<Vec<String>, String> {
    let mut dir = std::env::current_dir().map_err(|e| e.to_string())?;

    // Nếu đang ở src-tauri thì lùi lên 1 cấp
    if dir.ends_with("src-tauri") {
        dir = dir.parent().ok_or("no parent")?.to_path_buf();
    }

    let drums_dir = dir.join("assets").join("drums");

    if !drums_dir.exists() {
        println!("Drum folder not found at {:?}", drums_dir);
        return Ok(vec![]);
    }

    let mut files = vec![];

    for entry in fs::read_dir(drums_dir).map_err(|e| e.to_string())? {
        let p = entry.map_err(|e| e.to_string())?.path();

        if p.is_file()
            && p.extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .eq_ignore_ascii_case("wav")
        {
            files.push(p.to_string_lossy().to_string());
        }
    }

    files.sort();
    Ok(files)
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_project_file_bytes(project: String, path: String) -> Result<Vec<u8>, String> {
    let clean = PathBuf::from(path);
    if clean.is_absolute() {
        return Err("path must be project-relative".into());
    }

    let root = project_dir(&project)?;
    let canonical_root = fs::canonicalize(&root).map_err(|e| e.to_string())?;
    let full = root.join(clean);
    let canonical_full = fs::canonicalize(&full).map_err(|e| e.to_string())?;

    if !canonical_full.starts_with(&canonical_root) {
        return Err("path escapes project directory".into());
    }

    fs::read(canonical_full).map_err(|e| e.to_string())
}

#[tauri::command]
fn touch_recent_project(project: String) -> Result<(), String> {
    let path = config_path()?;
    let mut list = read_recent_projects()?;
    list.retain(|p| p != &project);
    list.insert(0, project);
    list.truncate(10);
    safe_write(
        &path,
        serde_json::to_string_pretty(&json!({"recentProjects": list}))
            .unwrap()
            .as_bytes(),
    )
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
            export_mp3_from_master_to_path,
            pick_save_mp3_path,
            write_project_music_file,
            list_drum_samples,
            read_file_bytes,
            read_project_file_bytes,
            touch_recent_project,
            path_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//! Saves and loads tasks as a small JSON file in the app data folder.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub const SAVE_VERSION: u32 = 2;
/// Most bars on screen, and most favourites. Mirrors `MAX_BARS` / `MAX_FAVORITES` in
/// src/lib/types.ts; change both together.
pub const MAX_ITEMS: usize = 20;
/// Longest bar. Mirrors the widest `LIMITS` entry in src/lib/types.ts (8 h at one
/// segment per half hour); change both together.
const MAX_SEGMENTS: u32 = 16;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Unit {
    Hours,
    Times,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub unit: Unit,
    pub segments: u32,
    pub done: u32,
    pub color_index: u32,
    pub x: f64,
    pub y: f64,
    pub created_at: f64,
    /// The favourite this bar was made from or saved as. Cleared when that favourite changes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favorite_id: Option<String>,
}

/// A saved bar template for daily routines.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Favorite {
    pub id: String,
    pub title: String,
    pub unit: Unit,
    pub segments: u32,
    /// Bar color used when restoring. Missing in favourites saved before colors were kept.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color_index: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SaveFile {
    pub version: u32,
    pub tasks: Vec<Task>,
    /// Missing in version 1 files.
    #[serde(default)]
    pub favorites: Vec<Favorite>,
}

impl Default for SaveFile {
    fn default() -> Self {
        Self {
            version: SAVE_VERSION,
            tasks: Vec::new(),
            favorites: Vec::new(),
        }
    }
}

pub struct Storage {
    path: PathBuf,
}

impl Storage {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Reads the save file. A missing file gives an empty save. A broken file is
    /// moved to `<name>.bak` so the user can still recover it, then an empty save is used.
    pub fn load(&self) -> SaveFile {
        let raw = match fs::read_to_string(&self.path) {
            Ok(raw) => raw,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return SaveFile::default(),
            Err(e) => {
                eprintln!("progress-it: could not read {}: {e}", self.path.display());
                return SaveFile::default();
            }
        };
        match serde_json::from_str::<SaveFile>(&raw) {
            Ok(save) => sanitize(save),
            Err(e) => {
                let backup = self.path.with_extension("json.bak");
                eprintln!(
                    "progress-it: broken save file ({e}), moved to {}",
                    backup.display()
                );
                let _ = fs::rename(&self.path, &backup);
                SaveFile::default()
            }
        }
    }

    pub fn save(&self, save: &SaveFile) -> io::Result<()> {
        let json = serde_json::to_vec_pretty(save)?;
        write_atomic(&self.path, &json)
    }
}

/// Drops tasks and favourites that can't be used, duplicate names, and anything over
/// the limit. The same rules apply to both: the frontend never makes a bar or a
/// favourite without a name, or two with the same one.
fn sanitize(mut save: SaveFile) -> SaveFile {
    save.version = SAVE_VERSION;

    let mut seen = std::collections::HashSet::new();
    // Finished first, so a bar that is on its way out doesn't claim its name.
    save.tasks
        .retain(|t| t.done < t.segments && usable(&t.title, t.segments, &mut seen));
    save.tasks.truncate(MAX_ITEMS);

    let mut seen = std::collections::HashSet::new();
    save.favorites
        .retain(|f| usable(&f.title, f.segments, &mut seen));
    save.favorites.truncate(MAX_ITEMS);
    save
}

/// True for a named, sized item whose name hasn't been seen yet. Names are compared
/// trimmed and lowercased, like `sameName` in src/lib/types.ts.
fn usable(title: &str, segments: u32, seen: &mut std::collections::HashSet<String>) -> bool {
    let name = title.trim().to_lowercase();
    !name.is_empty() && segments > 0 && segments <= MAX_SEGMENTS && seen.insert(name)
}

/// Writes to a temp file next to the target, then renames it over the target,
/// so a crash mid-write never leaves a half-written save.
fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str, segments: u32, done: u32) -> Task {
        named_task(id, &format!("Write report {id}"), segments, done)
    }

    fn named_task(id: &str, title: &str, segments: u32, done: u32) -> Task {
        Task {
            id: id.into(),
            title: title.into(),
            unit: Unit::Hours,
            segments,
            done,
            color_index: 2,
            x: 10.0,
            y: 20.0,
            created_at: 1.0,
            favorite_id: None,
        }
    }

    fn favorite(id: &str, title: &str) -> Favorite {
        Favorite {
            id: id.into(),
            title: title.into(),
            unit: Unit::Times,
            segments: 3,
            color_index: Some(4),
        }
    }

    #[test]
    fn missing_file_gives_empty_save() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::new(dir.path().join("tasks.json"));
        assert_eq!(storage.load(), SaveFile::default());
    }

    #[test]
    fn round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::new(dir.path().join("nested").join("tasks.json"));
        let mut linked = task("b", 10, 0);
        linked.favorite_id = Some("f1".into());
        let save = SaveFile {
            version: SAVE_VERSION,
            tasks: vec![task("a", 4, 1), linked],
            favorites: vec![favorite("f1", "Gym")],
        };
        storage.save(&save).unwrap();
        assert_eq!(storage.load(), save);
        assert!(!dir.path().join("nested").join("tasks.json.tmp").exists());
    }

    #[test]
    fn uses_camel_case_json() {
        let json = serde_json::to_string(&task("a", 4, 1)).unwrap();
        assert!(json.contains("\"colorIndex\":2"));
        assert!(json.contains("\"createdAt\":1.0"));
        assert!(json.contains("\"unit\":\"hours\""));
        assert!(!json.contains("favoriteId"));
    }

    #[test]
    fn reads_version_1_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tasks.json");
        fs::write(
            &path,
            r#"{"version":1,"tasks":[{"id":"a","title":"Gym","unit":"times","segments":3,"done":1,"colorIndex":0,"x":1,"y":2,"createdAt":3}]}"#,
        )
        .unwrap();
        let save = Storage::new(path).load();
        assert_eq!(save.version, SAVE_VERSION);
        assert_eq!(save.tasks.len(), 1);
        assert_eq!(save.tasks[0].favorite_id, None);
        assert!(save.favorites.is_empty());
    }

    #[test]
    fn drops_duplicate_favourite_names() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::new(dir.path().join("tasks.json"));
        let save = SaveFile {
            version: SAVE_VERSION,
            tasks: vec![],
            favorites: vec![
                favorite("1", "Gym"),
                favorite("2", " gym "),
                favorite("3", "Read"),
            ],
        };
        storage.save(&save).unwrap();
        let ids: Vec<_> = storage.load().favorites.into_iter().map(|f| f.id).collect();
        assert_eq!(ids, vec!["1", "3"]);
    }

    #[test]
    fn broken_file_is_backed_up() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tasks.json");
        fs::write(&path, "{ not json").unwrap();
        let storage = Storage::new(path.clone());
        assert_eq!(storage.load(), SaveFile::default());
        assert!(!path.exists());
        assert_eq!(
            fs::read_to_string(dir.path().join("tasks.json.bak")).unwrap(),
            "{ not json"
        );
    }

    #[test]
    fn drops_finished_and_invalid_tasks() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::new(dir.path().join("tasks.json"));
        let save = SaveFile {
            version: SAVE_VERSION,
            tasks: vec![
                task("ok", 4, 3),
                task("finished", 4, 4),
                task("empty", 0, 0),
                task("huge", 40, 0),
            ],
            favorites: vec![],
        };
        storage.save(&save).unwrap();
        let ids: Vec<_> = storage.load().tasks.into_iter().map(|t| t.id).collect();
        assert_eq!(ids, vec!["ok"]);
    }

    #[test]
    fn drops_nameless_and_duplicate_tasks() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::new(dir.path().join("tasks.json"));
        let save = SaveFile {
            version: SAVE_VERSION,
            tasks: vec![
                named_task("1", "Gym", 4, 0),
                named_task("2", " gym ", 4, 0),
                named_task("3", "  ", 4, 0),
                named_task("4", "Read", 4, 0),
            ],
            favorites: vec![],
        };
        storage.save(&save).unwrap();
        let ids: Vec<_> = storage.load().tasks.into_iter().map(|t| t.id).collect();
        assert_eq!(ids, vec!["1", "4"]);
    }
}

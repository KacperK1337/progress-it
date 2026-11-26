mod hit_test;
mod overlay;
mod platform;
mod storage;
mod tray;

use hit_test::{HitState, Region};
use overlay::{DisplayState, Rect};
use std::fs;
use storage::{SaveFile, Storage};
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const OVERLAY_LABEL: &str = "overlay";

// Both touch the disk (`save` also fsyncs), so they run off the main thread: a plain
// `#[tauri::command]` body runs inline on the UI thread and would stall the overlay.
#[tauri::command(async)]
fn load_tasks(storage: State<Storage>) -> SaveFile {
    storage.load()
}

#[tauri::command(async)]
fn save_tasks(storage: State<Storage>, data: SaveFile) -> Result<(), String> {
    storage.save(&data).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_hit_regions(hit: State<HitState>, regions: Vec<Region>) {
    hit.set_regions(regions);
}

#[tauri::command]
fn get_work_area(window: WebviewWindow) -> Option<Rect> {
    overlay::work_area(&window)
}

/// The frontend calls this once its first frame is ready, so the window never flashes empty.
#[tauri::command]
fn overlay_ready(window: WebviewWindow, hit: State<HitState>) {
    let _ = window.show();
    // Showing can reset the level on some systems, so apply it again.
    platform::set_desktop_layer(&window);
    hit.set_ready();
}

#[tauri::command]
fn set_modal_mode(window: WebviewWindow, open: bool) {
    overlay::set_modal_mode(&window, open);
}

#[tauri::command]
fn reveal_bars(window: WebviewWindow) {
    overlay::reveal(&window);
}

/// Turns on launch-at-login the first time a release build runs. After that the
/// tray toggle is the source of truth. Dev builds skip this so they don't register
/// a debug binary as a login item.
fn enable_autostart_on_first_run(app: &tauri::App, data_dir: &std::path::Path) {
    if cfg!(debug_assertions) {
        return;
    }
    let marker = data_dir.join(".autostart-initialized");
    if marker.exists() {
        return;
    }
    if let Err(e) = app.autolaunch().enable() {
        eprintln!("progress-it: could not enable launch at login: {e}");
    }
    let _ = fs::write(marker, b"");
}

pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin: a second launch just exits.
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(HitState::default())
        .manage(DisplayState::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            app.manage(Storage::new(data_dir.join("tasks.json")));
            enable_autostart_on_first_run(app, &data_dir);

            tray::build(app)?;

            let window = app
                .get_webview_window(OVERLAY_LABEL)
                .expect("overlay window is defined in tauri.conf.json");
            overlay::init(&window);
            hit_test::spawn(app.handle().clone(), window);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_tasks,
            save_tasks,
            set_hit_regions,
            get_work_area,
            overlay_ready,
            set_modal_mode,
            reveal_bars,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Progress It");
}

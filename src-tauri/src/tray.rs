//! Tray (menu bar on macOS) icon. The overlay has no window chrome, so this is the
//! only way to quit or change launch-at-login.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::App;
use tauri_plugin_autostart::ManagerExt;

const AUTOSTART_ID: &str = "autostart";
const QUIT_ID: &str = "quit";

pub fn build(app: &App) -> tauri::Result<()> {
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(
        app,
        AUTOSTART_ID,
        "Launch at login",
        true,
        autostart_on,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, QUIT_ID, "Quit Progress It", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&autostart, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Progress It")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            AUTOSTART_ID => {
                let launcher = app.autolaunch();
                let enable = !launcher.is_enabled().unwrap_or(false);
                let result = if enable {
                    launcher.enable()
                } else {
                    launcher.disable()
                };
                if let Err(e) = result {
                    eprintln!("progress-it: could not change launch at login: {e}");
                }
                let _ = autostart.set_checked(launcher.is_enabled().unwrap_or(false));
            }
            QUIT_ID => app.exit(0),
            _ => {}
        });

    if let Some(icon) = tray_icon() {
        builder = builder
            .icon(icon)
            .icon_as_template(cfg!(target_os = "macos"));
    } else if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Small monochrome icon made for the tray / menu bar.
fn tray_icon() -> Option<tauri::image::Image<'static>> {
    tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png")).ok()
}

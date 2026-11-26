//! The single transparent window that covers the primary monitor.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::hit_test::{Geometry, HitState};
use crate::platform;

/// Rectangle in logical pixels, relative to the overlay window.
#[derive(Serialize, Clone, Copy, Debug)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Last seen primary monitor setup, used to notice resolution or scale changes.
#[derive(Default)]
pub struct DisplayState(Mutex<Option<DisplaySignature>>);

#[derive(Clone, Copy, PartialEq, Debug)]
struct DisplaySignature {
    pos: (i32, i32),
    size: (u32, u32),
    scale: u64,
    work: (i32, i32, u32, u32),
}

fn signature(m: &Monitor) -> DisplaySignature {
    let w = m.work_area();
    DisplaySignature {
        pos: (m.position().x, m.position().y),
        size: (m.size().width, m.size().height),
        scale: m.scale_factor().to_bits(),
        work: (w.position.x, w.position.y, w.size.width, w.size.height),
    }
}

/// Places the window over the whole primary monitor and puts it on the desktop layer.
pub fn init(window: &WebviewWindow) {
    let _ = window.set_ignore_cursor_events(true);
    fit_to_primary(window);
    platform::set_desktop_layer(window);
}

fn fit_to_primary(window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        eprintln!("progress-it: no primary monitor found");
        return;
    };
    let pos = *monitor.position();
    let size = *monitor.size();
    // Size first: macOS keeps the bottom-left corner fixed when resizing, so resizing
    // after positioning would push the top of the window off screen.
    let _ = window.set_size(PhysicalSize::new(size.width, size.height));
    let _ = window.set_position(PhysicalPosition::new(pos.x, pos.y));

    let app = window.app_handle();
    app.state::<HitState>().set_geometry(Geometry {
        x: pos.x as f64,
        y: pos.y as f64,
        scale: monitor.scale_factor(),
    });
    *app.state::<DisplayState>().0.lock().unwrap() = Some(signature(&monitor));
}

/// Called from the hit-test thread every few seconds.
pub fn refit_if_display_changed(app: &AppHandle, window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return;
    };
    let now = signature(&monitor);
    let changed = *app.state::<DisplayState>().0.lock().unwrap() != Some(now);
    if changed {
        fit_to_primary(window);
        let _ = window.emit("display-changed", ());
    }
}

/// Usable part of the primary monitor (no menu bar, Dock or taskbar), in overlay coordinates.
pub fn work_area(window: &WebviewWindow) -> Option<Rect> {
    let monitor = window.primary_monitor().ok()??;
    let scale = monitor.scale_factor();
    let origin = monitor.position();
    let work = monitor.work_area();
    Some(Rect {
        x: (work.position.x - origin.x) as f64 / scale,
        y: (work.position.y - origin.y) as f64 / scale,
        w: work.size.width as f64 / scale,
        h: work.size.height as f64 / scale,
    })
}

/// How long bars stay above other apps when the desktop can't be shown.
const REVEAL_FOR: Duration = Duration::from_secs(5);

static MODAL_OPEN: AtomicBool = AtomicBool::new(false);

/// Brings the bars into view, e.g. when a focus block ends: shows the desktop where the OS
/// allows it, otherwise lifts the bars above all apps for a few seconds. Clicks still go
/// through to the apps everywhere except on the bars.
pub fn reveal(window: &WebviewWindow) {
    if platform::show_desktop() {
        return;
    }
    platform::raise(window);
    let window = window.clone();
    thread::spawn(move || {
        thread::sleep(REVEAL_FOR);
        // An open modal keeps the window raised; closing it lowers the window again.
        if !MODAL_OPEN.load(Ordering::Relaxed) {
            platform::set_desktop_layer(&window);
        }
    });
}

/// While the new-task modal is open the window must take keyboard input and sit above
/// other apps. When it closes, the window goes back to the desktop layer.
pub fn set_modal_mode(window: &WebviewWindow, open: bool) {
    MODAL_OPEN.store(open, Ordering::Relaxed);
    if open {
        platform::raise(window);
        let _ = window.set_focus();
    } else {
        platform::set_desktop_layer(window);
    }
}

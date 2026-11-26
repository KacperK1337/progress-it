//! Per-OS window layer tweaks. "Desktop layer" means above the wallpaper and desktop
//! icons but below every normal app window.

use tauri::WebviewWindow;

#[cfg(target_os = "macos")]
mod imp {
    use objc2_app_kit::{NSFloatingWindowLevel, NSWindow, NSWindowCollectionBehavior};
    use tauri::WebviewWindow;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowLevelForKey(key: i32) -> i32;
    }
    const K_CG_DESKTOP_ICON_WINDOW_LEVEL_KEY: i32 = 18;

    fn with_ns_window(window: &WebviewWindow, f: impl FnOnce(&NSWindow) + Send + 'static) {
        let Ok(ptr) = window.ns_window() else { return };
        // Raw pointers aren't Send; pass the address and rebuild it on the main thread.
        let addr = ptr as usize;
        let _ = window.run_on_main_thread(move || {
            // SAFETY: the address comes from Tauri's live NSWindow for this window, and
            // we are on the main thread as AppKit requires.
            let ns_window = unsafe { &*(addr as *const NSWindow) };
            f(ns_window);
        });
    }

    pub fn set_desktop_layer(window: &WebviewWindow) {
        with_ns_window(window, |w| {
            let level = unsafe { CGWindowLevelForKey(K_CG_DESKTOP_ICON_WINDOW_LEVEL_KEY) } + 1;
            w.setLevel(level as isize);
            w.setCollectionBehavior(
                NSWindowCollectionBehavior::CanJoinAllSpaces
                    | NSWindowCollectionBehavior::Stationary
                    | NSWindowCollectionBehavior::IgnoresCycle,
            );
        });
    }

    pub fn raise(window: &WebviewWindow) {
        with_ns_window(window, |w| {
            w.setLevel(NSFloatingWindowLevel);
        });
    }

    /// The system "Show Desktop" (same as F11 or the trackpad spread gesture). Our window
    /// sits on the desktop layer, so it stays visible. No extra permissions needed.
    pub fn show_desktop() -> bool {
        let spawned = std::process::Command::new(
            "/System/Applications/Mission Control.app/Contents/MacOS/Mission Control",
        )
        .arg("1")
        .spawn();
        match spawned {
            Ok(mut child) => {
                // Rust never reaps a dropped `Child`. Wait off the main thread so the
                // helper doesn't linger as a zombie for the lifetime of the app.
                std::thread::spawn(move || {
                    let _ = child.wait();
                });
                true
            }
            Err(_) => false,
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use tauri::WebviewWindow;

    pub fn set_desktop_layer(window: &WebviewWindow) {
        let _ = window.set_always_on_top(false);
        let _ = window.set_always_on_bottom(true);
    }

    pub fn raise(window: &WebviewWindow) {
        let _ = window.set_always_on_bottom(false);
        let _ = window.set_always_on_top(true);
    }

    /// No safe "show desktop" here: Windows' and Linux's versions can hide our window too.
    pub fn show_desktop() -> bool {
        false
    }
}

pub fn set_desktop_layer(window: &WebviewWindow) {
    imp::set_desktop_layer(window);
}

pub fn raise(window: &WebviewWindow) {
    imp::raise(window);
}

/// Shows the desktop the way the OS does it. False if this OS has no safe way.
pub fn show_desktop() -> bool {
    imp::show_desktop()
}

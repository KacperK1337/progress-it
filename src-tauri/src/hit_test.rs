//! Click-through for the full-screen overlay.
//!
//! The overlay window ignores the mouse by default, so clicks reach the desktop.
//! The frontend reports which rectangles are interactive (toolbar, bars, modal).
//! A background thread watches the cursor and turns mouse input on only while the
//! cursor is over one of them. It also tells the frontend which region is hovered.

use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::overlay;

/// Poll fast only when the cursor is close to something interactive.
const NEAR_DISTANCE: f64 = 120.0;
const FAST_TICK: Duration = Duration::from_millis(16);
const SLOW_TICK: Duration = Duration::from_millis(80);
/// A cursor nobody is moving can't enter a bar on its own, so poll even slower. The app
/// runs all day, and this is most of that day.
const IDLE_TICK: Duration = Duration::from_millis(250);
/// How long the cursor must sit still, away from every region, to count as idle.
const IDLE_AFTER: Duration = Duration::from_secs(3);
const DISPLAY_CHECK_EVERY: Duration = Duration::from_secs(2);

/// Rectangle in logical pixels, relative to the overlay window's top-left corner.
#[derive(Deserialize, Clone, Debug)]
pub struct Region {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Region {
    fn contains(&self, px: f64, py: f64) -> bool {
        px >= self.x && px <= self.x + self.w && py >= self.y && py <= self.y + self.h
    }

    fn distance(&self, px: f64, py: f64) -> f64 {
        let dx = (self.x - px).max(px - (self.x + self.w)).max(0.0);
        let dy = (self.y - py).max(py - (self.y + self.h)).max(0.0);
        dx.hypot(dy)
    }
}

/// Where the overlay sits on screen, in physical pixels, plus its scale factor.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Geometry {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
}

#[derive(Default)]
pub struct HitState {
    regions: Mutex<Vec<Region>>,
    geometry: Mutex<Option<Geometry>>,
    ready: AtomicBool,
}

impl HitState {
    pub fn set_regions(&self, regions: Vec<Region>) {
        *self.regions.lock().unwrap() = regions;
    }

    pub fn set_geometry(&self, geometry: Geometry) {
        *self.geometry.lock().unwrap() = Some(geometry);
    }

    pub fn set_ready(&self) {
        self.ready.store(true, Ordering::Relaxed);
    }
}

pub fn spawn(app: AppHandle, window: WebviewWindow) {
    thread::spawn(move || {
        let state = app.state::<HitState>();
        // The window starts out ignoring the mouse (set in overlay::init).
        let mut interactive = false;
        let mut hovered: Option<String> = None;
        let mut last_display_check = Instant::now();
        let mut last_cursor = (f64::NAN, f64::NAN);
        let mut still_since = Instant::now();

        loop {
            if !state.ready.load(Ordering::Relaxed) {
                thread::sleep(SLOW_TICK);
                continue;
            }

            if last_display_check.elapsed() >= DISPLAY_CHECK_EVERY {
                last_display_check = Instant::now();
                overlay::refit_if_display_changed(&app, &window);
            }

            let Some(geo) = *state.geometry.lock().unwrap() else {
                thread::sleep(SLOW_TICK);
                continue;
            };
            let Ok(cursor) = app.cursor_position() else {
                thread::sleep(SLOW_TICK);
                continue;
            };
            let px = (cursor.x - geo.x) / geo.scale;
            let py = (cursor.y - geo.y) / geo.scale;
            if (px, py) != last_cursor {
                last_cursor = (px, py);
                still_since = Instant::now();
            }

            let (hit, nearest) = {
                let regions = state.regions.lock().unwrap();
                let hit = regions
                    .iter()
                    .find(|r| r.contains(px, py))
                    .map(|r| r.id.clone());
                let nearest = regions
                    .iter()
                    .map(|r| r.distance(px, py))
                    .fold(f64::INFINITY, f64::min);
                (hit, nearest)
            };

            let want_interactive = hit.is_some();
            if want_interactive != interactive
                && window.set_ignore_cursor_events(!want_interactive).is_ok()
            {
                interactive = want_interactive;
            }
            if hit != hovered {
                let _ = window.emit("region-hover", hit.clone());
                hovered = hit;
            }

            thread::sleep(if nearest <= NEAR_DISTANCE {
                FAST_TICK
            } else if still_since.elapsed() >= IDLE_AFTER {
                IDLE_TICK
            } else {
                SLOW_TICK
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn region() -> Region {
        Region {
            id: "a".into(),
            x: 10.0,
            y: 10.0,
            w: 100.0,
            h: 40.0,
        }
    }

    #[test]
    fn contains_edges() {
        let r = region();
        assert!(r.contains(10.0, 10.0));
        assert!(r.contains(110.0, 50.0));
        assert!(!r.contains(9.9, 20.0));
        assert!(!r.contains(50.0, 50.1));
    }

    #[test]
    fn distance_outside_and_inside() {
        let r = region();
        assert_eq!(r.distance(50.0, 30.0), 0.0);
        assert_eq!(r.distance(0.0, 30.0), 10.0);
        assert_eq!(r.distance(113.0, 54.0), 5.0);
    }
}

# Progress It

Progress bars on your desktop, to help you focus on your daily tasks.

Progress It is a small desktop widget for macOS, Windows and Linux. Each task you work on
becomes a glowing bar on your desktop, sitting above your wallpaper and below your app
windows.

## Features

### Bars

Click **Add new** in the toolbar at the top of your screen, type a task name and choose:

- **Hours** (0.5–8 h): every 30 minutes of focused work fills one segment.
- **Times** (1–10): every time you do the task fills one segment.

Press **Add** and the bar lands somewhere free on your desktop. The longer the task, the
longer the bar. Names are up to 30 characters and must be different from bars already on
screen. You can have up to 20 bars.

When a bar is full it glows, says _"&lt;task&gt; is done!"_ and disappears.

### Focus bars (hours bars)

- **Click** an hours bar to start working on it. It shows _"Working on: …"_ and its outline pulses.
- Every **30 minutes** one segment fills, the desktop is shown so you can see your progress,
  next 30 minutes will start automatically.
- **Click** the bar again to stop. An unfinished half hour doesn't currently count.
- Only **one** task can be worked on at a time; the other bars are locked until you stop.

### Times bars

**Click** a times bar to add one time.

### Fixing mistakes

- **Right-click** a bar to take one segment back.
- Click **×** on a bar to delete it.

### Favourites (daily routine)

- Click **♥** on a bar to save it as a favourite (name, hours or times, and color).
- Each morning, click **Restore favourites**: the board is cleared and all favourites come
  back, empty and ready to go.
- **⚙ Settings → Manage favourites** lets you rename them, change their length, switch
  between hours and times, add new ones and remove old ones.

### Other

- **Clear all** removes every current bar.
- Your bars and favourites are saved automatically and come back when the app starts.

## Install

Download the file for your system from the
[latest release](https://github.com/KacperK1337/progress-it/releases/latest).

The app isn't code-signed yet, so macOS and Windows warn you the first time you open it.

## Run from source

Alternatively you can clone the repo and run app locally.
You need [Node.js](https://nodejs.org) 26.13.1+ (npm 11.20.0+) and [Rust](https://rustup.rs). On Linux, also
install the [Tauri system dependencies](https://tauri.app/start/prerequisites/#linux).

```sh
git clone https://github.com/KacperK1337/progress-it.git
cd progress-it
npm install
npm run tauri dev     # run the app
```

Useful while developing:

```sh
# General
VITE_BLOCK_MS=10000 npm run tauri dev     # 10-second focus blocks instead of 30 minutes

# Frontend
npm run format                            # format with Prettier (format:check only checks)
npm run lint                              # ESLint
npm run check                             # type check
npm test                                  # tests

# Backend
cargo fmt                                 # format (cargo fmt --check only checks)
cargo clippy --all-targets -- -D warnings # lint
cargo test                                # tests
```

Pull requests run the same frontend and backend checks on GitHub.

Data is saved in `tasks.json` in the app data folder, e.g. on macOS
`~/Library/Application Support/com.progressit.widget/`.

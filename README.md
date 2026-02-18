# WorkMonitor — Working Hours Tracker

A professional, secure, and automated time tracking application for macOS with a native dashboard, app usage analytics, and smart sleep detection.

## Key Features

### Dual-Mode Time Tracking
- **Workplace Duration** — Manual start/stop/pause for focused work sessions with a configurable daily goal.
- **Day Working Hours** — Automatic tracking that starts on screen unlock and pauses on lock/sleep. Sleep-aware: time is never counted while the Mac is asleep.

### Native macOS App
- **Menu Bar Widget** — Real-time timer displayed in the macOS menu bar.
- **Built-in Dashboard** — Native WKWebView window (no browser required). Opens via "Open Dashboard" in the menu bar.
- **Screen Lock/Unlock Detection** — Listens to `com.apple.screenIsLocked` / `com.apple.screenIsUnlocked` distributed notifications.
- **Sleep/Wake Detection** — Listens to `NSWorkspace.willSleepNotification` / `didWakeNotification` to pause tracking during system sleep.

### App Usage Tracking
- Automatically tracks the **frontmost application** every 5 seconds.
- Shows a ranked horizontal bar chart of today's top 10 apps by usage time on the dashboard.
- Pauses tracking when the screen is locked or the system is asleep.

### Dashboard & Visualizations
- **Weekly Bar Chart** — Last 7 days of Workplace Duration with dynamic color coding:
  - Purple = below goal
  - Green = goal met
  - Orange/Amber = overtime (goal + 1 hour)
- **Goal Progress Ring** — Circular progress indicator with the same dynamic color tiers.
- **Today's Activity Timeline** — Chronological list of lock/unlock events.
- **App Usage Chart** — Horizontal bars showing per-app time for today.
- **Auto-Refresh** — Dashboard data refreshes automatically when the window regains focus.

### Work History
- **Daily, Weekly, Monthly** reports showing both Workplace Duration and Day Working Hours.
- Data stored locally in SQLite — never leaves your machine.

### Configurable Goal
- Set a custom daily working goal (default: 4 hours 10 minutes) from the Settings view.
- Goal is used for the progress bar, ring, and bar chart color thresholds.

## Installation

### DMG Installer (Recommended)
1. Download or build `WorkingHours.dmg`.
2. Double-click to open, then drag `WorkingHours.app` to the Applications folder.
3. Launch from Applications. The app starts automatically on login.

### PKG Installer
1. Locate `WorkingHours.pkg` in the project root.
2. Double-click to install.
3. The app installs to `/Applications/WorkingHours.app` and starts automatically on login.

### Manual Start (Development)
1. Ensure Node.js is installed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the start script:
   ```bash
   ./start.sh
   ```
4. Access the dashboard at `http://127.0.0.1:3000`.

### Build from Source
```bash
./build_app.sh    # Builds WorkingHours.app and WorkingHours.zip
./build_pkg.sh    # Builds WorkingHours.pkg installer
./build_dmg.sh    # Builds WorkingHours.dmg drag-and-drop installer
```

## Uninstallation

```bash
./uninstall.sh
```
This removes the application and all background LaunchAgents.

## Project Structure

```
├── mac_utility.swift    # Native macOS app: menu bar, WKWebView dashboard,
│                        #   lock/unlock/sleep detection, app usage polling
├── server.js            # Express backend: session management, app heartbeat,
│                        #   reports, background timer loop
├── db.js                # SQLite schema, migrations, and query functions
├── public/
│   ├── index.html       # Dashboard HTML with charts and controls
│   ├── style.css        # Dark theme UI with modern glass-card design
│   └── app.js           # Frontend logic: timer, charts, app usage, auto-refresh
├── build_app.sh         # Compile Swift + bundle into .app
├── build_pkg.sh         # Compile Swift + create .pkg installer
├── build_dmg.sh         # Create drag-and-drop DMG installer
├── launcher.sh          # Entry point for .app bundle
├── start.sh             # Dev start script
├── uninstall.sh         # Clean removal script
├── Info.plist           # macOS app bundle configuration
└── package.json         # Node.js dependencies
```

## Tech Stack

- **Frontend** — Vanilla HTML/CSS/JS, SVG icons, CSS grid/flexbox
- **Backend** — Node.js, Express, better-sqlite3
- **Native** — Swift, AppKit, WebKit (WKWebView with custom URL scheme handler)
- **Database** — SQLite (stored in `~/Library/Application Support/WorkingHours/`)

## Security

This application is designed with privacy in mind:
- Binds strictly to `127.0.0.1` — data never leaves your machine.
- No external network requests or telemetry.
- Database stored locally in Application Support.

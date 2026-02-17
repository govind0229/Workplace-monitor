# Working Hours Tracker 🕒

A professional, secure, and automated time tracking application for macOS.

![App Logo](https://img.icons8.com/fluence/96/000000/clock.png) <!-- Placeholder or relative path if available -->

## Key Features

- **Dual-Mode Tracking**:
  - **Workplace Duration**: Manual start/stop for focused work sessions with custom goals.
  - **Day Working Hours**: Automatic tracking that starts when you unlock your Mac and pauses when you lock it.
- **macOS Integration**: Native menu bar widget for real-time monitoring.
- **High-Precision Sync**: Zero-lag synchronization between the web dashboard and the macOS menu bar.
- **Work History**: Detailed daily, weekly, and monthly reports showing both focused work and total activity.
- **Security Hardened**: Restricted to `localhost` to prevent unauthorized network access and source code exposure.
- **Professional Installer**: Easy installation via a branded macOS `.pkg` package.

## Installation

### The Easy Way (macOS Installer)
1.  Locate `WorkingHours.pkg` in the project root.
2.  Double-click to install.
3.  The app will install to `/Applications/WorkingHours.app` and set itself to start automatically on login.

### Manual Start (For Development)
If you prefer running from source:
1.  Ensure Node.js is installed.
2.  Run the start script:
    ```bash
    ./start.sh
    ```
3.  Access the dashboard at `http://127.0.0.1:3000`.

## Uninstallation

To cleanly remove the application and all its background agents:
1.  Open Terminal in the project directory.
2.  Run:
    ```bash
    ./uninstall.sh
    ```

## Project Structure

- `public/`: Securely served frontend assets (HTML, CSS, JS).
- `server.js`: Hardened Node.js backend.
- `db.js`: SQLite database management and reporting logic.
- `mac_utility.swift`: Swift-based macOS notification observer and menu bar widget.
- `build_pkg.sh`: Automation script for compiling and packaging the app.

## Security Note

This application is designed with privacy in mind. It binds strictly to `127.0.0.1`, meaning your data never leaves your computer and is not accessible by other devices on your local network.

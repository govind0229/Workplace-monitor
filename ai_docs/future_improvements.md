# Future Improvement Recommendations

This document outlines high-value, unimplemented features and backend enhancements to further evolve the **Workplace Monitor** application.

---

## 1. macOS Focus Mode (Do Not Disturb) Integration
* **Auto-Silence Alerts:** Access macOS Focus Mode API (`INFocusStatus` or system configuration defaults) to detect when the user is in "Do Not Disturb" or custom focus periods (e.g. *Meeting*, *Coding*). Automatically pause or mute wellness break reminders during these active blocks.
* **Deep Work Tagging:** Auto-tag active session segments as "Deep Work" when macOS Focus Mode is active.

## 2. macOS Global System Hotkeys
* **Hotkey Commands:** Implement global hotkey listeners in the macOS Swift app (using `DDHotKey` or native Carbon APIs) so users can trigger commands from anywhere:
  - `Cmd + Shift + B` to start a break.
  - `Cmd + Shift + S` to snooze an alert.
  - `Cmd + Shift + L` to quickly toggle location.

## 3. Slack & Microsoft Teams Status Sync
* **Automatic Status Synchronization:** Push active session states directly to Slack/Teams. When in a desk session, set status to 💻 "Working"; during wellness breaks, update status to ☕ "On a Break"; and when the system is locked, toggle status to 🚶 "Away".

## 4. Automated Weekly AI Digest
* **Background Report Generator:** Instead of manually triggering the AI Digest on the dashboard, build a server-side cron service that aggregates SQLite session data weekly, runs a local LLM or API completion, and generates a structured productivity report delivered via notification.

## 5. Cloud Backup & Sync
* **Secure iCloud / Drive Backups:** Implement a simple daily sync of the local SQLite `working_hours.db` database to iCloud Drive or private storage, preserving years of logs in case of hard drive failures.

## 6. PDF & Excel Timesheet Exporter
* **Report Exporter:** Create a formatting template engine to export project activity, daily sessions, and office visits directly into professional, client-ready PDF or Excel files.

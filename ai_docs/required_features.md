# Required Features Specification & Roadmap

This document serves as the implementation specification and technical blueprint for the required features to be added in the next phases of development.

---

## 1. macOS Focus Mode (Do Not Disturb) Integration
Detect when the user has enabled macOS Focus Mode (DND, Work, Coding, etc.) to automatically silence wellness break popups and tag productive intervals.

* **Technical Blueprint:**
  - **Swift Wrapper (`mac_utility.swift`):** Import `AppIntents` / `Focus` framework or query the macOS defaults database to check focus status:
    ```swift
    // Check if Do Not Disturb is active
    let defaults = UserDefaults(suiteName: "com.apple.controlcenter")
    let dndState = defaults?.bool(forKey: "dnd_state") ?? false
    ```
  - **Server Communication:** Modify the status heartbeats sent to the local Node.js server to include `is_dnd_active: true`.
  - **Backend Router (`server.js`):** If a break reminder threshold is crossed, check if the session is flagged with active DND. If yes, postpone the popup trigger by adding 15 minutes to the threshold or scheduling a snooze.
  - **Database Logging (`db.js`):** Add an `is_deep_work` column to `app_usage_timeline` to track focused sessions.

---

## 2. macOS Global System Hotkeys
Register system-wide shortcuts to trigger common application commands without bringing the dashboard to the foreground.

* **Technical Blueprint:**
  - **Swift Wrapper (`mac_utility.swift`):** Use the Carbon framework's `RegisterEventHotkey` or an open-source library like `DDHotKey` to register global listeners:
    - `Cmd + Shift + B` (Wellness Break)
    - `Cmd + Shift + S` (Snooze Alert)
    - `Cmd + Shift + L` (Toggle Location WFO/WFH)
  - **Action Handlers:** When pressed, execute the corresponding API POST requests to the local Node.js server (e.g., `/start-break`, `/dismiss-break-reminder`, or location change routes).

---

## 3. Slack & Microsoft Teams Status Sync
Automatically synchronize active desk sessions, breaks, and lock states with team chat applications to preserve office availability states.

* **Technical Blueprint:**
  - **Settings UI (`public/index.html`):** Add text inputs for Slack User Token (OAuth) and Microsoft Teams webhook credentials.
  - **Backend Router (`routes/settings.js`):** Securely persist tokens in the `settings` database table.
  - **Status Hook (`server.js`):** Whenever the session state changes (Active desk work, screen lock, starting a coffee/lunch break), trigger an asynchronous HTTP POST request to:
    - **Slack API (`users.profile.set`):**
      ```json
      {
        "profile": {
          "status_text": "On a Wellness Break",
          "status_emoji": ":coffee:",
          "status_expiration": 900
        }
      }
      ```
    - **MS Teams Presence API:** Update user availability state.

---

## 4. Automated Weekly AI Digest
Compute productivity metrics weekly, run them through an LLM, and push a summary notification.

* **Technical Blueprint:**
  - **Server-Side Cron (`server.js`):** Implement a weekly cron job (using `node-cron` or standard interval loops) to query the SQLite tables (`app_usage`, `sessions`, `break_history`) for the last 7 days.
  - **LLM Integration:** Format the metrics into a prompt and call a local model (Ollama / local LLM) or a lightweight cloud LLM API.
  - **Delivery:** Send the summary text as a desktop notification using `terminal-notifier` or native Swift notification triggers.

---

## 5. Cloud Backup & Sync
Automate daily backups of `working_hours.db` to prevent data loss.

* **Technical Blueprint:**
  - **Backend Scheduler (`server.js`):** Trigger a backup task every day at 11:59 PM.
  - **Sync Routine:** Copy `working_hours.db` directly to the user's iCloud Drive directory:
    ```javascript
    const icloudPath = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'WorkingHoursBackup');
    // Copy working_hours.db to icloudPath
    ```

---

## 6. PDF & Excel Timesheet Exporter
Generate client-ready timesheets and reports.

* **Technical Blueprint:**
  - **Backend Router (`server.js`):** Define a new route `/export-report?format=[pdf|excel]`.
  - **Library Integration:** Use `pdfkit` (for PDF formatting) or `exceljs` (for Excel spreadsheets) to query the reports data and generate structured columns containing project descriptions, visit durations, and daily totals.
  - **Frontend UI (`public/app.js`):** Add a download button next to the custom date filter popup to fetch and download the generated file.

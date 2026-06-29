# AI Development Story: Workplace Monitor Evolution

This document chronicles the development, technical challenges, and solutions implemented by the AI coding assistant (Antigravity) working in tandem with the user to build and mature the **Workplace Monitor** application.

---

## The Narrative & Milestones

### 1. The Snooze & Continuous Work Time Bug Fixes
* **The Problem:** The periodic break reminder would popup, but clicking "Snooze" would lose track of the actual continuous work time. The next popup would show a static base reminder (e.g. "30 minutes") instead of the accumulated work time (e.g. "40 minutes"). Additionally, closing the macOS Swift reminder window directly would cause the system to freeze or trigger reminders immediately on boot without active work.
* **The Solution:** 
  - Restructured the Node.js background timer loop to use a dedicated `snooze_until` timestamp instead of overwriting the last break notification base (`last_break_notify`).
  - Correctly calculated elapsed continuous work time: `total_seconds - last_break_notify` and passed it dynamically to the popup.
  - Added a callback in the Swift app (`windowShouldClose`) to hit `/dismiss-break-reminder`, ensuring dismissals from window closing are recorded and rescheduled properly.
  - Enforced a minimum requirement of 30 minutes of active work before any break alerts are allowed to trigger on system boot.

### 2. Verified Breaks & Strict Enforcement
* **The Problem:** Users could repeatedly snooze or skip breaks, negating the health benefits of the burnout prevention system.
* **The Solution:**
  - Implemented **Strict Mode Enforcement**: If the count of consecutive skips/snoozes exceeds a user-defined threshold, the app automatically triggers a macOS screen lock command (`pmset displaysleepnow` or lock screen script).
  - Added verified breaks: The system monitors keyboard/mouse activity during a break. If activity is detected, the break is canceled and the timer resumes.

### 3. Timezone & Midnight Crossover Stability
* **The Problem:** Users in IST and non-UTC time zones observed data drifting to incorrect days. Stale sessions left running overnight would accumulate "ghost hours" (e.g., 59 hours on a single day), and midnight crossover would leak yesterday's lock state.
* **The Solution:**
  - Rewrote database queries across all daily, weekly, and monthly reports to run queries with `date(..., 'localtime')` or local time stamps.
  - Handled midnight crossover by resetting global state immediately when midnight is reached.
  - Implemented automatic cleanup of stale sessions on boot and discarded long idle/sleep periods (> 4 hours) instead of accumulating them as active time.

### 4. Goal Progress UI Redesign
* **The Problem:** The Goal Progress ring card was visually cluttered. The center displayed crowded emojis and text, and when goals were completed, the gradients turned into solid colors, causing track-blending collisions and reducing aesthetic appeal.
* **The Solution:**
  - **Clean Ring Center:** Removed clutter, leaving a single large, high-contrast percentage with a subtle drop-shadow and a clean `DESK GOAL` subtext label.
  - **Dual Electric Gradients:** Designed an outer concentric ring (Desk Focus) using a premium fuchsia/purple gradient (`#8b5cf6` to `#d946ef`) and an inner concentric ring (Office Presence) using an electric teal/cyan gradient (`#4facfe` to `#00f2fe`).
  - **Interactive Legend Grid:** Added a card-based hoverable legend showing live statistics (`85% (3h 30m)`) with smooth micro-animations.

### 5. Customizable Dashboard Layout Settings Migration
* **The Problem:** The initial "Layout" customization button on the dashboard opened a floating drawer. However, this drawer suffered from WKWebView focus loss and click-outside closure issues. Automatic dashboard refreshes would also reset the UI state, closing the drawer before the user could finish.
* **The Solution:**
  - Migrated the layout customization panel entirely to the **Settings** view.
  - Paused automatic dashboard updates and syncs while layout editing is in progress or when the user is on the Settings tab.
  - Implemented **Live Preview** (reordering cards in the background instantly using DOM `appendChild` to keep Chart.js instances intact), a **Save Layout** button to commit changes, and an **Automatic Rollback** if the user leaves the tab without saving.

### 6. Dynamic Grid Auto-Sizing
* **The Problem:** Narrow grid columns (e.g. `320px` originally hardcoded for the Goal Ring) squished wide cards (like the "Top Apps Timeline" or "Last 7 Days" charts) when users reordered them.
* **The Solution:**
  - Classified cards into sizing requirements (`wide`, `medium`, `narrow`, `full`).
  - Implemented `adjustRowGridTemplates()` which dynamically assigns classes (`.layout-narrow-wide`, `.layout-wide-narrow`, etc.) to grid rows based on their active children.
  - Configured matching CSS Grid templates to automatically resize columns to fit their active cards.

### 7. Top Apps Timeline Range Filter
* **The Problem:** The "Top Apps Timeline" line chart only showed a single day's hourly data, preventing users from seeing weekly or monthly application usage trends.
* **The Solution:**
  - Added filter tabs (**1 Day**, **1 Week**, **1 Month**) next to the card title.
  - Refactored `/app-timeline` in the backend to query SQLite tables `app_usage` (daily total seconds per app) and `app_usage_timeline` (durations per app) and return unified labels (hours for Day, weekdays for Week, dates for Month).
  - Updated frontend to dynamically draw datasets based on selected ranges and refined tooltips to format values over 60 minutes as hours and minutes, omitting `0m` for whole hours (e.g., `2h` instead of `2h 0m`).

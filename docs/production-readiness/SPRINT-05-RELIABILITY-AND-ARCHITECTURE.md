# Sprint 5 — Reliability and Architecture

## Goal

Make the application easier to maintain and capable of recovering from expected runtime failures.

## Work items

### Backend modules

Split responsibilities into configuration, validation, sessions, reports, projects, wellbeing, location, sync, and startup modules.

### Frontend modules

Split API access, dashboard, reports, settings, projects, location, wellbeing, and native-bridge code.

### Native modules

Separate server communication, session monitoring, location monitoring, app-usage monitoring, permissions, and window management.

### Runtime reliability

- Add graceful shutdown and database closing.
- Prevent duplicate server and native-app instances.
- Replace broad process-kill patterns with exact process ownership.
- Add structured, rotated, privacy-redacted logs.
- Add cloud-sync retry with exponential backoff and jitter.
- Add network cancellation and timeouts.
- Show controlled offline, server-startup, and recovery states.
- Bundle runtime JavaScript, fonts, charts, and sanitization dependencies.
- Measure idle CPU, active CPU, memory, battery impact, and database growth.

Refactor in small changes after Sprint 2 tests are in place. Do not combine a large refactor with behavior changes.

## Exit criteria

- Core local tracking works without internet access.
- Crashes and restarts do not create duplicate active sessions.
- Logs rotate and contain no secrets or precise coordinates.
- Major modules can be tested without launching the full application.
- Full-workday resource usage is documented and acceptable.


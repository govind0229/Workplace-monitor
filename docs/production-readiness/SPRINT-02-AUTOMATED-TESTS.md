# Sprint 2 — Automated Test Foundation

## Goal

Protect critical timekeeping behavior with repeatable tests that never touch the user database.

## Work items

- Select a Node test runner and add working `npm test` and coverage commands.
- Make the database path injectable.
- Create a fresh temporary SQLite database for every test group.
- Separate server startup from route construction so API tests can run without opening a production port.
- Add fixtures and a controllable clock for date, sleep, and midnight scenarios.
- Run tests in pull-request CI before build or release jobs.

## Minimum test suites

### Sessions

- Start, pause, resume, stop, and duplicate-action handling
- Manual and automatic session overlap
- Project changes that split active sessions
- Stale-session recovery

### macOS lifecycle events

- Lock and unlock
- User sleep versus idle sleep
- Wake and resume
- Restart during an active session
- Long idle and idle-response choices

### Time boundaries

- Midnight rollover
- Local timezone grouping
- Daylight-saving transitions
- Negative and excessive elapsed-time protection

### Reports and settings

- Daily, weekly, monthly, visit, project, and timeline aggregation
- CSV escaping and date filtering
- Settings validation and persistence
- Dynamic break calculations

### Location and sync

- Geofence arrival, departure, jitter, and stale coordinates
- Sync checkpoint advancement only after success
- Timeout, retry, and malformed remote response behavior

## CI requirements

- JavaScript syntax and lint checks
- Unit and API integration tests
- Coverage report
- Swift compilation
- Shell-script syntax checks
- Failure on any skipped critical suite

## Exit criteria

- `npm test` passes locally and in CI.
- Tests cannot discover or open the production database path.
- Critical time calculations have full branch coverage.
- Every bug fixed from this point receives a regression test.


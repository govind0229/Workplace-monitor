# Sprint 1 — Security and Correctness

## Goal

Remove the highest-risk security and behavior inconsistencies before adding more features.

## Work items

### 1. Local API boundary

- Bind Express to `127.0.0.1`, not `0.0.0.0`.
- Remove unrestricted CORS or allow only known native/local origins.
- Add request body-size limits.
- Add security response headers appropriate for a local web application.
- Ensure logs do not expose API keys, coordinates, or browser activity.

### 2. API validation

- Create shared validation helpers.
- Validate project IDs, session actions, durations, coordinates, geofence radius, dates, enums, and URLs.
- Return consistent `400`, `404`, and `409` responses.
- Add a centralized Express error handler.
- Reject malformed JSON without crashing the server.

### 3. Settings consistency

- Persist `defaultProjectId` in the settings endpoint.
- Ensure deleting the default project clears the setting.
- Make the wellbeing enabled switch control backend reminders.
- Respect manual and WFH break intervals independently.
- Use the dynamic interval only when smart breaks are enabled.
- Validate goal and interval ranges.

### 4. Port configuration decision

Choose one approach:

- Recommended short-term: use port `3000` consistently and remove the incomplete setting.
- Later alternative: store one port configuration and pass it to Node, Swift, the native proxy, launcher, and frontend.

Do not expose a port setting until every component consumes it.

### 5. Cloud-sync credential safety

- Move API keys from SQLite to macOS Keychain.
- Never return or log stored secrets.
- Add strict URL validation and network timeouts.
- Make sync disabled by default.

## Tests required

- Requests from a non-local interface are rejected.
- Invalid payloads receive controlled errors.
- Every setting persists across restart.
- Disabled wellbeing reminders never fire.
- Manual and WFH intervals behave independently.
- Smart breaks do not override a manual interval when disabled.

## Exit criteria

- The API is reachable only from the local machine.
- All visible settings change real backend behavior.
- No credential is stored in plain text in the settings table.
- No known settings-persistence defect remains.


# Slack & Microsoft Teams Status Sync Testing Guide

This guide details how to verify and test the Slack and Microsoft Teams status synchronization feature in the Workplace Monitor app.

---

## 1. Interactive Testing via the Web UI (Recommended)

The easiest way to test status synchronization is through the app's web user interface.

### A. Testing API Connections
1. Start the server (e.g., `node server.js` or `npm run dev`).
2. Open the application in your browser (`http://localhost:3000`).
3. Click on the **Settings** tab.
4. Scroll down to the **Slack & Microsoft Teams Sync** section.
5. **Slack Test**:
   - Check **Enable Slack Status Sync**.
   - Input your user token `xoxp-...` (or enter a dummy/invalid token for negative testing).
   - Click the **Test Slack Connection** button.
   - If using a valid token, you will see a green success message with your Slack name. If using an invalid token, a red message explaining the error (e.g. `invalid_auth`) will be shown.
6. **Microsoft Teams Test**:
   - Check **Enable MS Teams Webhook Sync**.
   - Input your Teams Incoming Webhook URL.
   - Click the **Test Teams Connection** button.
   - Check your Microsoft Teams channel: you should see a card titled **Workplace Monitor Sync Test** indicating a successful handshake.

---

### B. Testing Automated State Transitions
Once your Slack and Teams credentials are saved:
1. **Start Day Session**:
   - Go to the Dashboard view and click **Start Session**.
   - **Verification**: Check your Slack workspace. Your profile should display the active status text (default: `Focusing on Desk`) and emoji (default: `:laptop_computer:`).
2. **Pause Day Session**:
   - Click **Pause**.
   - **Verification**: Your Slack status will update to `Paused` (or clear, depending on your preferences).
3. **Trigger a Wellness Break**:
   - From the Wellbeing dashboard, select **Take a Break** and choose **Lunch Break**.
   - **Verification**: Your Slack status updates to your configured lunch break emoji and text.
4. **Simulate Lock and Unlock**:
   - Click **Stop Session** or let the computer lock.
   - **Verification**: Slack status updates to **Away** and clears active emojis. When you unlock, status returns to active `Focusing on Desk`.
   - **Verification (Break Protection)**: While on an active Lunch Break, locking the screen should **not** overwrite your status back to "Away". It should preserve your "Lunch Break" status until you return and unlock.

---

## 2. Programmatic Testing via Command Line (cURL)

If you are developing or testing headless, you can trigger settings saves, connection tests, and system event triggers directly via terminal commands.

### A. Update Settings Configuration
Submit configuration keys to the database:
```bash
curl -X POST http://localhost:3000/settings \
  -H "Content-Type: application/json" \
  -d '{
    "slackSyncEnabled": true,
    "slackUserToken": "xoxp-YOUR-SLACK-USER-TOKEN-HERE",
    "slackStatusTextActive": "Focusing on Desk",
    "slackStatusEmojiActive": ":laptop_computer:",
    "slackStatusTextBreak": "Quick Break",
    "slackStatusEmojiBreak": ":coffee:",
    "teamsSyncEnabled": true,
    "teamsWebhookUrl": "https://YOUR-TEAMS-WEBHOOK-URL-HERE"
  }'
```

### B. Trigger Connection Verification Endpoints
Test Slack token credentials:
```bash
curl -X POST http://localhost:3000/settings/test-slack \
  -H "Content-Type: application/json" \
  -d '{"token": "xoxp-YOUR-SLACK-USER-TOKEN-HERE"}'
```

Test Teams Webhook delivery:
```bash
curl -X POST http://localhost:3000/settings/test-teams \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://YOUR-TEAMS-WEBHOOK-URL-HERE"}'
```

### C. Trigger Status Update Hook Events
Simulate system lock/unlock events to trigger Slack/Teams state updates:
```bash
# Lock the screen (should update status to Away)
curl -X POST http://localhost:3000/event \
  -H "Content-Type: application/json" \
  -d '{"event": "lock"}'

# Unlock the screen (should update status back to active)
curl -X POST http://localhost:3000/event \
  -H "Content-Type: application/json" \
  -d '{"event": "unlock"}'
```

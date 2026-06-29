# Slack & Microsoft Teams Status Sync Setup Guide

This guide describes how to configure Slack User Tokens and Microsoft Teams Webhook URLs to enable status synchronization in the Workplace Monitor app.

---

## 1. Slack Status Sync Setup

To allow the Workplace Monitor app to update your Slack profile status (text and emoji) and your presence (active/away), you need to create a custom Slack App and obtain a **User Token** (`xoxp-...`).

### Step-by-Step Instructions:

1. **Go to the Slack API Portal**:
   - Open your browser and navigate to [api.slack.com/apps](https://api.slack.com/apps).
   - Log in to your Slack account and click the **Create New App** button.

2. **Select App Configuration**:
   - Select **From scratch** in the creation modal.
   - **App Name**: Enter a name (e.g., `Workplace Monitor Sync`).
   - **Development Slack Workspace**: Select the workspace you want your status to sync with.
   - Click **Create App**.

3. **Configure Permissions & Scopes**:
   - In the left sidebar under the *Features* section, click on **OAuth & Permissions**.
   - Scroll down to the **Scopes** section.
   - Under **User Token Scopes** (do **NOT** use Bot Token Scopes), click **Add an OAuth Scope**:
     * Add `users.profile:write` (Allows updating your status text, emoji, and expiration).
     * Add `users:write` (Allows updating your online presence to active/away).
   
   > [!IMPORTANT]
   > Ensure these scopes are added under **User Token Scopes** and NOT Bot Token Scopes. Since we are updating your personal profile, the token must act on your behalf as a user.

4. **Install App to Workspace**:
   - Scroll back up to the top of the **OAuth & Permissions** page.
   - Click the **Install to Workspace** button.
   - Click **Allow** to authorize the permissions.

5. **Copy the User OAuth Token**:
   - Under the *OAuth Tokens for Your Workspace* section, you will see a **User OAuth Token** starting with `xoxp-...`.
   - Copy this token value.

6. **Configure in Workplace Monitor**:
   - Open the **Workplace Monitor** web application and navigate to the **Settings** view.
   - Scroll down to the **Slack & Microsoft Teams Sync** section.
   - Check the **Enable Slack Status Sync** toggle.
   - Paste the copied token (`xoxp-...`) into the **Slack User Token** input field.
   - Click the **Test Slack Connection** button to verify. It should display:
     `✓ Connected to Slack as [Your Name] (Team: [Workspace Name])`.
   - Click **Save Changes** at the bottom of the Settings page.

---

## 2. Microsoft Teams Status Sync Setup

Microsoft Teams updates its channel feeds via Incoming Webhooks. Because Microsoft is transitioning from legacy Office 365 Connectors to Power Automate Workflows, you can use either the modern Workflows app or the legacy Connector interface depending on your workspace configuration.

### Method A: Power Automate Workflows (Recommended & Modern)

1. **Open Teams and Add the Workflows App**:
   - In Microsoft Teams, click on the **Apps** icon in the left-hand rail.
   - Search for **Workflows** and open/install it.

2. **Select Webhook Template**:
   - In the Workflows app, click the **Create** tab.
   - Search for the template: `"Post to a channel when a webhook request is received"` (or search for `webhook`).
   - Select that template.

3. **Configure Flow Properties**:
   - Confirm your login credentials.
   - Select the target **Team** and **Channel** where status notifications should be posted.
   - Click **Create flow**.

4. **Copy the Generated Webhook URL**:
   - Once the flow is created, it will show a unique Webhook URL.
   - Copy this Webhook URL.

5. **Configure in Workplace Monitor**:
   - Open the **Workplace Monitor** web application and navigate to the **Settings** view.
   - Scroll to the **Slack & Microsoft Teams Sync** section.
   - Check the **Enable MS Teams Webhook Sync** toggle.
   - Paste the Webhook URL into the **Teams Incoming Webhook URL** input field.
   - Click the **Test Teams Connection** button. It will post a test card to your channel.
   - Click **Save Changes** at the bottom of the Settings page.

---

### Method B: Legacy Channel Connectors (Fallback)

*Note: Use this method only if Office 365 Connectors are still enabled in your Microsoft Teams workspace.*

1. **Open Channel Connectors**:
   - Go to the channel where you want notifications posted.
   - Click the three dots (`...`) in the upper-right corner and select **Connectors** (or **Manage Channel** -> **Connectors**).

2. **Add Incoming Webhook**:
   - Search for **Incoming Webhook** and click **Add** or **Configure**.
   - Input a name (e.g., `Workplace Monitor Status`).
   - Upload an icon if desired (using the app icon from our repository).
   - Click **Create**.

3. **Copy Webhook URL**:
   - Copy the Webhook URL generated at the bottom of the page.
   - Paste this URL into your **Teams Incoming Webhook URL** in Settings and save.

---

## 3. Customize Your Status Triggers

You can customize the text and emoji that update on Slack for different active and break events directly from the UI:

| Active Workplace Event | Slack Profile Status | MS Teams Integration |
| :--- | :--- | :--- |
| **Desk Active** (Working/Untracked/Automatic) | Configured *On-Desk Status* (Default: `Focusing on Desk` :laptop_computer:) | Activity summary posted to webhook |
| **Desk Away / Screen Locked** (Unproductive/Idle) | Clears status and sets presence to **Away** | Presence/status cleared |
| **Manual Breaks** (Lunch, Dinner, Coffee, etc.) | Configured *On-Break Status* (e.g., `Quick Break` :coffee:) | Break event posted to webhook |

- **Break Protection**: The app prevents the "Away" status from overwriting wellness breaks. If you take a lock-screen break (e.g., lunch), your status remains active on "Lunch" and won't revert to "Away" until you log back in.

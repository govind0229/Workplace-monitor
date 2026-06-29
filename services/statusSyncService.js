const https = require('https');
const { getSetting } = require('../db');

/**
 * Generic helper to execute an HTTPS POST request with JSON payload.
 */
function postJson(url, headers, body) {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(url);
            const bodyStr = JSON.stringify(body);
            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Length': Buffer.byteLength(bodyStr),
                    ...headers
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            resolve(data);
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(bodyStr);
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Tests connection to Slack using the provided token.
 */
async function testSlackConnection(token) {
    if (!token) throw new Error('Slack Token is empty');
    const res = await postJson(
        'https://slack.com/api/auth.test',
        { 'Authorization': `Bearer ${token}` },
        {}
    );
    if (!res.ok) {
        throw new Error(res.error || 'Failed to authenticate Slack token');
    }
    return res;
}

/**
 * Tests connection to Microsoft Teams webhook by posting a test card.
 */
async function testTeamsConnection(webhookUrl) {
    if (!webhookUrl) throw new Error('Teams Webhook URL is empty');
    const card = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "4B53BC",
        "summary": "Workplace Monitor Test Connection",
        "sections": [{
            "activityTitle": "Workplace Monitor Status",
            "activitySubtitle": "Connection Verified Successfully!",
            "markdown": true
        }]
    };
    return await postJson(webhookUrl, {}, card);
}

/**
 * Updates the user's Slack custom status.
 */
async function updateSlackStatus(token, text, emoji) {
    if (!token) return;
    
    // Slack profile set endpoint updates status text and emoji
    const profile = {
        status_text: text,
        status_emoji: emoji,
        status_expiration: 0
    };
    
    const res = await postJson(
        'https://slack.com/api/users.profile.set',
        { 'Authorization': `Bearer ${token}` },
        { profile }
    );
    
    if (!res.ok) {
        console.error('[Slack Status] Update failed:', res.error);
    } else {
        console.log(`[Slack Status] Status updated successfully to "${text}" (${emoji})`);
    }
}

/**
 * Sends a status change card to the Microsoft Teams incoming webhook.
 */
async function updateTeamsStatus(webhookUrl, text) {
    if (!webhookUrl) return;
    
    const card = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "4B53BC",
        "summary": "Workplace Status Update",
        "sections": [{
            "activityTitle": "Workplace Status Update",
            "facts": [
                { "name": "Current Status", "value": text }
            ],
            "markdown": true
        }]
    };

    try {
        await postJson(webhookUrl, {}, card);
        console.log(`[Teams Webhook] Status update posted successfully: "${text}"`);
    } catch (e) {
        console.error('[Teams Webhook] Failed to post status card:', e.message);
    }
}

/**
 * Entry point to sync user's status across enabled third-party integrations.
 * @param {string} state - The transition state ('active', 'break', 'away', etc.)
 */
async function syncStatus(state) {
    try {
        // Read status sync configurations
        const slackEnabled = getSetting('slackSyncEnabled', 'false') === 'true';
        const slackToken = getSetting('slackUserToken', '');
        
        const teamsEnabled = getSetting('teamsSyncEnabled', 'false') === 'true';
        const teamsWebhookUrl = getSetting('teamsWebhookUrl', '');

        if (!slackEnabled && !teamsEnabled) return;

        let statusText = '';
        let statusEmoji = '';

        // Standardize status text and emojis based on the incoming state
        if (state === 'active') {
            statusText = getSetting('slackStatusTextActive', 'Focusing on Desk');
            statusEmoji = getSetting('slackStatusEmojiActive', ':laptop_computer:');
        } else if (state === 'break') {
            statusText = getSetting('slackStatusTextBreak', 'Quick Break');
            statusEmoji = getSetting('slackStatusEmojiBreak', ':coffee:');
        } else if (state === 'lunch') {
            statusText = 'Having Lunch';
            statusEmoji = ':lunchbox:';
        } else if (state === 'dinner') {
            statusText = 'Having Dinner';
            statusEmoji = ':bento:';
        } else if (state === 'away' || state === 'paused') {
            statusText = 'Away from Desk';
            statusEmoji = ':walking:';
        } else {
            statusText = 'Away';
            statusEmoji = ':desert_island:';
        }

        const promises = [];

        if (slackEnabled && slackToken) {
            promises.push(updateSlackStatus(slackToken, statusText, statusEmoji));
        }

        if (teamsEnabled && teamsWebhookUrl) {
            promises.push(updateTeamsStatus(teamsWebhookUrl, statusText));
        }

        await Promise.all(promises);
    } catch (e) {
        console.error('[Status Sync Service] Error during synchronization:', e);
    }
}

module.exports = {
    syncStatus,
    testSlackConnection,
    testTeamsConnection
};

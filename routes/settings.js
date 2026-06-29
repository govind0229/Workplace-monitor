const express = require('express');
const router = express.Router();
const { getSetting, setSetting } = require('../db');

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

router.get('/settings', (req, res) => {
    const goalHours = getSetting('goalHours', '4');
    const goalMinutes = getSetting('goalMinutes', '10');
    const breakInterval = getSetting('breakInterval', '60');
    const wfhBreakInterval = getSetting('wfhBreakInterval', '60');
    const goalLinePercent = getSetting('goalLinePercent', '44');
    const customAppCategories = getSetting('customAppCategories', '{}');
    const officeLat = getSetting('officeLat', '');
    const officeLng = getSetting('officeLng', '');
    const officeRadius = getSetting('officeRadius', '300');
    const defaultProjectId = getSetting('defaultProjectId', null);

    const strictBreakMode = getSetting('strictBreakMode', 'false');
    const maxSkipsBeforeLock = getSetting('maxSkipsBeforeLock', '5');

    const slackSyncEnabled = getSetting('slackSyncEnabled', 'false');
    const slackUserToken = getSetting('slackUserToken', '');
    const slackStatusTextActive = getSetting('slackStatusTextActive', 'Focusing on Desk');
    const slackStatusEmojiActive = getSetting('slackStatusEmojiActive', ':laptop_computer:');
    const slackStatusTextBreak = getSetting('slackStatusTextBreak', 'Quick Break');
    const slackStatusEmojiBreak = getSetting('slackStatusEmojiBreak', ':coffee:');
    const teamsSyncEnabled = getSetting('teamsSyncEnabled', 'false');
    const teamsWebhookUrl = getSetting('teamsWebhookUrl', '');

    res.json({
        goalHours: parseInt(goalHours),
        goalMinutes: parseInt(goalMinutes),
        breakInterval: parseInt(breakInterval),
        wfhBreakInterval: parseInt(wfhBreakInterval),
        goalLinePercent: parseInt(goalLinePercent),
        customAppCategories: customAppCategories,
        officeLat: officeLat,
        officeLng: officeLng,
        officeRadius: parseInt(officeRadius),
        defaultProjectId: defaultProjectId ? parseInt(defaultProjectId) : null,
        strictBreakMode: strictBreakMode === 'true',
        maxSkipsBeforeLock: parseInt(maxSkipsBeforeLock),
        slackSyncEnabled: slackSyncEnabled === 'true',
        slackUserToken: slackUserToken,
        slackStatusTextActive: slackStatusTextActive,
        slackStatusEmojiActive: slackStatusEmojiActive,
        slackStatusTextBreak: slackStatusTextBreak,
        slackStatusEmojiBreak: slackStatusEmojiBreak,
        teamsSyncEnabled: teamsSyncEnabled === 'true',
        teamsWebhookUrl: teamsWebhookUrl
    });
});

router.post('/settings', asyncHandler(async (req, res) => {
    const { 
        goalHours, goalMinutes, breakInterval, useAiDynamicBreak, wfhBreakInterval, 
        goalLinePercent, customAppCategories, officeRadius, defaultProjectId, 
        strictBreakMode, maxSkipsBeforeLock,
        slackSyncEnabled, slackUserToken, slackStatusTextActive, slackStatusEmojiActive,
        slackStatusTextBreak, slackStatusEmojiBreak, teamsSyncEnabled, teamsWebhookUrl
    } = req.body;

    if (goalHours !== undefined) setSetting('goalHours', goalHours);
    if (goalMinutes !== undefined) setSetting('goalMinutes', goalMinutes);
    if (useAiDynamicBreak !== undefined) setSetting('useAiDynamicBreak', useAiDynamicBreak.toString());
    if (breakInterval !== undefined) {
        setSetting('breakInterval', breakInterval);
        setSetting('dynamicBreakInterval', breakInterval); // Sync so the backend timers use this immediately
    }
    if (wfhBreakInterval !== undefined) setSetting('wfhBreakInterval', wfhBreakInterval);
    if (goalLinePercent !== undefined) setSetting('goalLinePercent', goalLinePercent);
    if (customAppCategories !== undefined) setSetting('customAppCategories', customAppCategories);
    if (officeRadius !== undefined) setSetting('officeRadius', officeRadius);
    if (defaultProjectId !== undefined) setSetting('defaultProjectId', defaultProjectId);
    if (strictBreakMode !== undefined) setSetting('strictBreakMode', strictBreakMode.toString());
    if (maxSkipsBeforeLock !== undefined) setSetting('maxSkipsBeforeLock', maxSkipsBeforeLock.toString());

    if (slackSyncEnabled !== undefined) setSetting('slackSyncEnabled', slackSyncEnabled.toString());
    if (slackUserToken !== undefined) setSetting('slackUserToken', slackUserToken);
    if (slackStatusTextActive !== undefined) setSetting('slackStatusTextActive', slackStatusTextActive);
    if (slackStatusEmojiActive !== undefined) setSetting('slackStatusEmojiActive', slackStatusEmojiActive);
    if (slackStatusTextBreak !== undefined) setSetting('slackStatusTextBreak', slackStatusTextBreak);
    if (slackStatusEmojiBreak !== undefined) setSetting('slackStatusEmojiBreak', slackStatusEmojiBreak);
    if (teamsSyncEnabled !== undefined) setSetting('teamsSyncEnabled', teamsSyncEnabled.toString());
    if (teamsWebhookUrl !== undefined) setSetting('teamsWebhookUrl', teamsWebhookUrl);

    // Call global invalidate if it exists
    if (global.invalidateSettingsCache) {
        global.invalidateSettingsCache();
    }
    res.json({ success: true });
}));

const { testSlackConnection, testTeamsConnection } = require('../services/statusSyncService');

router.post('/settings/test-slack', asyncHandler(async (req, res) => {
    const { token } = req.body;
    try {
        const info = await testSlackConnection(token);
        res.json({ success: true, user: info.user, team: info.team });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
}));

router.post('/settings/test-teams', asyncHandler(async (req, res) => {
    const { webhookUrl } = req.body;
    try {
        await testTeamsConnection(webhookUrl);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
}));

module.exports = router;

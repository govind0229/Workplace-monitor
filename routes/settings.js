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
        maxSkipsBeforeLock: parseInt(maxSkipsBeforeLock)
    });
});

router.post('/settings', asyncHandler(async (req, res) => {
    const { goalHours, goalMinutes, breakInterval, useAiDynamicBreak, wfhBreakInterval, goalLinePercent, customAppCategories, officeRadius, defaultProjectId, strictBreakMode, maxSkipsBeforeLock } = req.body;
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

    // Call global invalidate if it exists
    if (global.invalidateSettingsCache) {
        global.invalidateSettingsCache();
    }
    res.json({ success: true });
}));

module.exports = router;

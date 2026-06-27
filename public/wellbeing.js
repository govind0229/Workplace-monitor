// ─── Wellbeing Feature ───

const wbState = {
    enabled: localStorage.getItem('wbEnabled') !== 'false',
    interval: parseInt(localStorage.getItem('wbInterval')) || 60,
    useAi: localStorage.getItem('wbUseAi') === 'true', // Default to OFF to respect manual interval
    goals: parseInt(localStorage.getItem('wbGoals')) || 8,
    selected: JSON.parse(localStorage.getItem('wbSelected') || '["lunch","water","stretch_walk","breathe"]'),
};
let wbSettingsLoaded = false;

// wellbeingActivities is now loaded from shared-activities.js

let breakDurations = {};
let breakStartTimes = {};

function fmtDur(s) {
    const m = Math.floor(s / 60);
    return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
}

async function initWellbeing() {
    const grid = document.getElementById('activitiesGrid');
    if (!grid) return;

    if (!wbSettingsLoaded) {
        try {
            const settingsRes = await fetch(`${API_BASE}/settings`);
            if (settingsRes.ok) {
                const settings = await settingsRes.json();
                wbState.enabled = settings.wellbeingEnabled !== false;
                wbState.interval = Number.parseInt(settings.breakInterval, 10) || 60;
                wbState.useAi = settings.useAiDynamicBreak === true;
                localStorage.setItem('wbEnabled', wbState.enabled);
                localStorage.setItem('wbInterval', wbState.interval);
                localStorage.setItem('wbUseAi', wbState.useAi);
            }
        } catch (_error) { /* retain local settings while offline */ }
        wbSettingsLoaded = true;
    }

    breakDurations = {};
    breakStartTimes = {};
    try {
        const res = await fetch(`${API_BASE}/reports`);
        const data = await res.json();
        const d = new Date();
        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const todayDayObj = data.timeline ? data.timeline.find(t => t.date === todayStr) : null;
        const todayBlocks = todayDayObj ? todayDayObj.blocks : [];
        const reasonMap = {
            lunch: ['lunch'], dinner: ['lunch'],
            coffee: ['coffee'],
            driving: ['driving'],
            exercise: ['exercise'],
            personal: ['personal'],
            water: ['water'],
            stretch_walk: ['stretch_walk', 'walk'],
            take_break: ['breathe', 'mindful'],
            focus: ['focus']
        };
        const intervals = {};
        todayBlocks.forEach(b => {
            if (b.type === 'break' && b.reason) {
                const key = b.reason.replace('lock_', '');
                const ids = reasonMap[key] || [key];
                const t1 = b.start ? new Date(b.start.replace(' ', 'T') + 'Z').getTime() : null;
                const t2 = b.end ? new Date(b.end.replace(' ', 'T') + 'Z').getTime() : Date.now();
                if (t1 && t2 > t1) {
                    ids.forEach(id => {
                        if (!intervals[id]) intervals[id] = [];
                        intervals[id].push({ start: t1, end: t2 });
                    });
                }
            }
        });

        Object.keys(intervals).forEach(id => {
            intervals[id].sort((a, b) => a.start - b.start);
            let merged = [];
            intervals[id].forEach(iv => {
                if (merged.length === 0) merged.push(iv);
                else {
                    let last = merged[merged.length - 1];
                    if (iv.start <= last.end) {
                        last.end = Math.max(last.end, iv.end);
                    } else {
                        merged.push(iv);
                    }
                }
            });
            let totalSecs = 0;
            merged.forEach(iv => totalSecs += Math.floor((iv.end - iv.start) / 1000));
            breakDurations[id] = totalSecs;
            breakStartTimes[id] = merged.map(iv => iv.start);
        });
    } catch (e) { /* offline */ }

    function fmt12h(ts) {
        const d = new Date(ts);
        let h = d.getHours();
        const m = String(d.getMinutes()).padStart(2, '0');
        const ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${m} ${ap}`;
    }

    const clockSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

    grid.innerHTML = wellbeingActivities.map(act => {
        const isSelected = wbState.selected.includes(act.id);
        const dur = breakDurations[act.id] || 0;
        const breaks = breakStartTimes[act.id] || [];
        
        let footerTime = '';
        if (breaks.length === 1) {
            footerTime = `<span class="wb-card-time">Started ${fmt12h(breaks[0])}</span><span class="wb-card-time-sep"></span>`;
        } else if (breaks.length > 1) {
            footerTime = `<span class="wb-card-time">${breaks.length} sessions (Last: ${fmt12h(breaks[breaks.length - 1])})</span><span class="wb-card-time-sep"></span>`;
        }
        
        const detailDur = dur > 0 ? `<span>Today: ${fmtDur(dur)}</span>` : `<span>0m today</span>`;
        
        return `
        <div class="wb-card ${isSelected ? 'wb-card-selected' : ''}" style="--act-color: ${act.color}" onclick="toggleWellbeingActivity('${act.id}')">
            <div class="wb-card-icon-wrap">
                ${act.svgIcon}
            </div>
            <div class="wb-card-content">
                <div class="wb-card-header">
                    <h4 class="wb-card-title">${act.title}</h4>
                    <div class="wb-check-circle">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                </div>
                <div class="wb-card-desc">${act.desc}</div>
                <div class="wb-card-footer">
                    ${clockSvg}
                    ${footerTime}${detailDur}
                </div>
            </div>
            <div class="wb-card-selection-overlay">
                <label class="wb-checkbox" onclick="event.stopPropagation()">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleWellbeingActivity('${act.id}')">
                    <span class="wb-check-box"></span>
                </label>
            </div>
        </div>`;
    }).join('');

    const toggle = document.getElementById('wellbeingEnableToggle');
    const statusTxt = document.getElementById('wbToggleStatusText');
    if (toggle) {
        toggle.checked = wbState.enabled;
        if (statusTxt) {
            statusTxt.textContent = wbState.enabled ? 'ENABLED' : 'DISABLED';
            statusTxt.style.color = wbState.enabled ? 'var(--secondary, #10b981)' : 'var(--text-muted)';
        }
        toggle.onchange = e => {
            wbState.enabled = e.target.checked;
            localStorage.setItem('wbEnabled', wbState.enabled);
            if (statusTxt) {
                statusTxt.textContent = wbState.enabled ? 'ENABLED' : 'DISABLED';
                statusTxt.style.color = wbState.enabled ? 'var(--secondary, #10b981)' : 'var(--text-muted)';
            }
        };
    }
    // Setup Interval and AI toggle
    const intInp = document.getElementById('wbInterval');
    const aiToggle = document.getElementById('wbAiToggle');
    
    if (intInp) { 
        intInp.value = wbState.interval; 
        intInp.onchange = e => { 
            wbState.interval = parseInt(e.target.value) || 60; 
            localStorage.setItem('wbInterval', wbState.interval); 
        }; 
    }
    
    if (aiToggle) {
        aiToggle.checked = wbState.useAi;
        // Disable interval input if AI is taking over
        if (intInp) intInp.disabled = wbState.useAi;
        
        aiToggle.onchange = e => {
            wbState.useAi = e.target.checked;
            localStorage.setItem('wbUseAi', wbState.useAi);
            if (intInp) intInp.disabled = wbState.useAi;
        };
    }
    const goalsInp = document.getElementById('wbGoals');
    if (goalsInp) { goalsInp.value = wbState.goals; goalsInp.onchange = e => { wbState.goals = parseInt(e.target.value) || 8; localStorage.setItem('wbGoals', wbState.goals); }; }

    renderWellbeingSelected();
}

function toggleWellbeingActivity(id) {
    if (wbState.selected.includes(id)) {
        wbState.selected = wbState.selected.filter(x => x !== id);
    } else {
        wbState.selected.push(id);
    }
    localStorage.setItem('wbSelected', JSON.stringify(wbState.selected));
    initWellbeing();
}

function removeWellbeingActivity(id) {
    wbState.selected = wbState.selected.filter(x => x !== id);
    localStorage.setItem('wbSelected', JSON.stringify(wbState.selected));
    initWellbeing();
}

function renderWellbeingSelected() {
    const list = document.getElementById('selectedActivitiesList');
    if (!list) return;
    if (wbState.selected.length === 0) {
        list.innerHTML = '<div class="wb-empty-selected">No activities selected.<br>Click cards to add.</div>';
        return;
    }
    const dragDots = `<svg width="12" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="5" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="8" cy="19" r="2"/><circle cx="16" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="16" cy="19" r="2"/></svg>`;
    const trashSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    list.innerHTML = wbState.selected.map((id, i) => {
        const act = wellbeingActivities.find(a => a.id === id);
        if (!act) return '';
        const dur = breakDurations[id] || 0;
        const displayTime = dur > 0 ? `Today: ${fmtDur(dur)}` : `0m today`;
        return `<div class="wb-selected-item ${i === 0 ? 'wb-selected-item-first' : ''}" draggable="true" data-id="${id}">
            <div class="wb-drag-handle">${dragDots}</div>
            <div class="wb-selected-item-content">
                <div class="wb-selected-item-title">${i+1}. ${act.title}</div>
                <div class="wb-selected-item-desc">${displayTime}</div>
            </div>
            <button class="wb-remove-btn" onclick="removeWellbeingActivity('${id}')" title="Remove">${trashSvg}</button>
        </div>`;
    }).join('');
}

function saveWellbeingSettings() {
    wbState.interval = parseInt(document.getElementById('wbInterval')?.value) || 60;
    wbState.useAi = document.getElementById('wbAiToggle')?.checked || false;
    wbState.goals = parseInt(document.getElementById('wbGoals')?.value) || 8;
    
    localStorage.setItem('wbInterval', wbState.interval);
    localStorage.setItem('wbUseAi', wbState.useAi);
    localStorage.setItem('wbGoals', wbState.goals);
    
    // Sync to backend so the actual break timers use this interval
    fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            breakInterval: wbState.interval,
            wfhBreakInterval: wbState.interval,
            useAiDynamicBreak: wbState.useAi,
            wellbeingEnabled: wbState.enabled
        })
    }).catch(e => console.error('Failed to sync wellbeing settings'));

    const btn = document.getElementById('saveWellbeingBtn');
    if (btn) { btn.textContent = 'Saved!'; setTimeout(() => { btn.textContent = 'Save Settings'; }, 1500); }
}

window.toggleWellbeingActivity = toggleWellbeingActivity;
window.removeWellbeingActivity = removeWellbeingActivity;
window.saveWellbeingSettings = saveWellbeingSettings;
window.initWellbeing = initWellbeing;

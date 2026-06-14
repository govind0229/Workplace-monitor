// ─── Wellbeing Feature ───

const wbState = {
    enabled: localStorage.getItem('wbEnabled') !== 'false',
    interval: parseInt(localStorage.getItem('wbInterval')) || 60,
    goals: parseInt(localStorage.getItem('wbGoals')) || 8,
    selected: JSON.parse(localStorage.getItem('wbSelected') || '["lunch","water","stretch_walk","breathe"]'),
};

const wellbeingActivities = [
    {
        id: 'lunch', title: 'Lunch Break', desc: 'Step away for a proper meal break.', color: '#10b981',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>'
    },
    {
        id: 'water', title: 'Drink Water', desc: 'Stay hydrated throughout the day.', color: '#3b82f6',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>'
    },
    {
        id: 'stretch_walk', title: 'Stand & Stretch', desc: 'Relieve tension with a quick stretch.', color: '#7c3aed',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'
    },
    {
        id: 'breathe', title: 'Breathe Deep', desc: 'Calm your mind with breathing.', color: '#ef4444',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>'
    },
    {
        id: 'walk', title: 'Go For a Walk', desc: 'Get some fresh air and movement.', color: '#d97706',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/></svg>'
    },
    {
        id: 'focus', title: 'Focus Session', desc: 'Deep work with no distractions.', color: '#0891b2',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
    },
    {
        id: 'mindful', title: 'Mindful Minute', desc: 'A moment of calm awareness.', color: '#16a34a',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>'
    },
    {
        id: 'read', title: 'Read & Learn', desc: 'Invest in personal growth.', color: '#ca8a04',
        svgIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
    },
];

let breakDurations = {};
let breakStartTimes = {};

function fmtDur(s) {
    const m = Math.floor(s / 60);
    return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
}

async function initWellbeing() {
    const grid = document.getElementById('activitiesGrid');
    if (!grid) return;

    breakDurations = {};
    breakStartTimes = {};
    try {
        const res = await fetch(`${API_BASE}/reports`);
        const data = await res.json();
        const todayStr = new Date().toISOString().split('T')[0];
        const todayBlocks = (data.timeline && data.timeline[todayStr]) ? data.timeline[todayStr] : [];
        const reasonMap = {
            lunch: ['lunch'], dinner: ['lunch'],
            coffee: ['water'],
            stretch_walk: ['stretch_walk', 'walk'],
            take_break: ['breathe', 'mindful'],
            focus: ['focus']
        };
        todayBlocks.forEach(b => {
            if (b.type === 'break' && b.reason) {
                const key = b.reason.replace('lock_', '');
                const ids = reasonMap[key] || [key];
                const t1 = b.start ? new Date(b.start.replace(' ', 'T') + 'Z').getTime() : null;
                const t2 = b.end ? new Date(b.end.replace(' ', 'T') + 'Z').getTime() : Date.now();
                const dur = t1 ? Math.floor((t2 - t1) / 1000) : 0;
                if (dur > 0) {
                    ids.forEach(id => {
                        breakDurations[id] = (breakDurations[id] || 0) + dur;
                        if (!breakStartTimes[id] && t1) breakStartTimes[id] = t1;
                    });
                }
            }
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
        const startTs = breakStartTimes[act.id];
        const footerTime = startTs ? `<span class="wb-card-time">Started ${fmt12h(startTs)}</span><span class="wb-card-time-sep"></span>` : '';
        const detailDur = dur > 0 ? `<span>Today: ${fmtDur(dur)}</span>` : `<span>0m today</span>`;
        
        return `
        <div class="wb-card ${isSelected ? 'wb-card-selected' : ''}" style="--act-color: ${act.color}" onclick="toggleWellbeingActivity('${act.id}')">
            <div class="wb-card-icon-wrap">
                ${act.svgIcon}
            </div>
            <div class="wb-card-content">
                <div class="wb-card-header">
                    <h4 class="wb-card-title">${act.title}</h4>
                </div>
                <p class="wb-card-desc">${act.desc}</p>
                <div class="wb-card-time-badge">
                    ${clockSvg} ${footerTime}${detailDur}
                </div>
            </div>
            <div class="wb-card-action">
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
    const intInp = document.getElementById('wbInterval');
    if (intInp) { intInp.value = wbState.interval; intInp.onchange = e => { wbState.interval = parseInt(e.target.value) || 60; localStorage.setItem('wbInterval', wbState.interval); }; }
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
    wbState.goals = parseInt(document.getElementById('wbGoals')?.value) || 8;
    localStorage.setItem('wbInterval', wbState.interval);
    localStorage.setItem('wbGoals', wbState.goals);
    const btn = document.getElementById('saveWellbeingBtn');
    if (btn) { btn.textContent = 'Saved!'; setTimeout(() => { btn.textContent = 'Save Settings'; }, 1500); }
}

window.toggleWellbeingActivity = toggleWellbeingActivity;
window.removeWellbeingActivity = removeWellbeingActivity;
window.saveWellbeingSettings = saveWellbeingSettings;
window.initWellbeing = initWellbeing;

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
        svgIcon: '<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="38" width="32" height="16" rx="4" fill="#10b981" opacity="0.4"/><rect x="24" y="38" width="32" height="7" rx="2" fill="#10b981" opacity="0.7"/><rect x="31" y="28" width="3" height="14" rx="1.5" fill="#6b7280"/><rect x="46" y="28" width="3" height="14" rx="1.5" fill="#6b7280"/><ellipse cx="40" cy="38" rx="14" ry="2.5" fill="#f59e0b" opacity="0.7"/></svg>'
    },
    {
        id: 'water', title: 'Drink Water', desc: 'Stay hydrated throughout the day.', color: '#3b82f6',
        svgIcon: '<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M40 18 C40 18 26 34 26 46 a14 14 0 0 0 28 0 C54 34 40 18 40 18z" fill="#3b82f6" opacity="0.7"/><path d="M33 44 Q37 40 40 44" stroke="white" stroke-width="2" fill="none" opacity="0.7"/></svg>'
    },
    {
        id: 'stretch_walk', title: 'Stand & Stretch', desc: 'Relieve tension with a quick stretch.', color: '#7c3aed',
        svgIcon: '<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="24" r="5" fill="#7c3aed"/><line x1="40" y1="29" x2="40" y2="50" stroke="#7c3aed" stroke-width="3" stroke-linecap="round"/><line x1="40" y1="36" x2="28" y2="30" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round"/><line x1="40" y1="36" x2="52" y2="30" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round"/><line x1="40" y1="50" x2="32" y2="60" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round"/><line x1="40" y1="50" x2="48" y2="60" stroke="#7c3aed" stroke-width="2.5" stroke-linecap="round"/></svg>'
    },
    {
        id: 'breathe', title: 'Breathe Deep', desc: 'Calm your mind with breathing.', color: '#ef4444',
        svgIcon: '<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="18" fill="#ef4444" opacity="0.2"/><circle cx="40" cy="40" r="12" fill="#ef4444" opacity="0.35"/><circle cx="40" cy="40" r="7" fill="#ef4444" opacity="0.7"/></svg>'
    },
    {
        id: 'walk', title: 'Go For a Walk', desc: 'Get some fresh air and movement.', color: '#d97706',
        svgIcon: '<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="23" r="5" fill="#d97706"/><path d="M36 30 Q32 44 30 54" stroke="#d97706" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M36 30 Q44 36 48 32" stroke="#d97706" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M36 43 Q40 50 44 56" stroke="#d97706" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>'
    },
    {
        id: 'focus', title: 'Focus Session', desc: 'Deep work with no distractions.', color: '#0891b2',
        svgIcon: '<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="26" y="28" width="28" height="24" rx="3" fill="#0891b2" opacity="0.3"/><rect x="26" y="28" width="28" height="6" rx="3" fill="#0891b2" opacity="0.7"/><rect x="30" y="40" width="20" height="2" rx="1" fill="#0891b2"/><rect x="30" y="44" width="14" height="2" rx="1" fill="#0891b2" opacity="0.6"/></svg>'
    },
    {
        id: 'mindful', title: 'Mindful Minute', desc: 'A moment of calm awareness.', color: '#16a34a',
        svgIcon: '<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M40 24 C32 24 26 30 26 38 C26 50 40 58 40 58 C40 58 54 50 54 38 C54 30 48 24 40 24z" fill="#16a34a" opacity="0.35"/><circle cx="40" cy="38" r="7" fill="#16a34a" opacity="0.7"/></svg>'
    },
    {
        id: 'read', title: 'Read & Learn', desc: 'Invest in personal growth.', color: '#ca8a04',
        svgIcon: '<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="26" y="26" width="28" height="32" rx="3" fill="#ca8a04" opacity="0.25"/><rect x="26" y="26" width="4" height="32" rx="2" fill="#ca8a04" opacity="0.6"/><rect x="32" y="33" width="16" height="2" rx="1" fill="#ca8a04"/><rect x="32" y="38" width="16" height="2" rx="1" fill="#ca8a04" opacity="0.7"/><rect x="32" y="43" width="10" height="2" rx="1" fill="#ca8a04" opacity="0.5"/></svg>'
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

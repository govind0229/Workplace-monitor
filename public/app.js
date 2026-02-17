const timerDisplay = document.getElementById('timerDisplay');
const statusBadge = document.getElementById('statusBadge');
const progressBar = document.getElementById('progressBar');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const todayTotalDisplay = document.getElementById('todayTotalDisplay');

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const reportsList = document.querySelectorAll('.reports-list')[0] || document.getElementById('reportsList');
const tabButtons = document.querySelectorAll('.tab-btn');

// Settings
const goalHoursInput = document.getElementById('goalHours');
const goalMinutesInput = document.getElementById('goalMinutes');
const saveSettingsBtn = document.getElementById('saveSettings');

let currentTab = 'daily';
let reportsData = null;
let goalSeconds = (getStoredInt('goalHours', 4) * 3600) + (getStoredInt('goalMinutes', 10) * 60);

function getStoredInt(key, defaultValue) {
    const val = localStorage.getItem(key);
    return (val === null || isNaN(parseInt(val))) ? defaultValue : parseInt(val);
}

const API_BASE = 'http://localhost:3000';

// Navigation Logic
navItems.forEach(item => {
    item.onclick = () => {
        const targetView = item.dataset.view;

        // Update UI
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        views.forEach(view => {
            view.classList.remove('active');
            if (view.id === targetView + 'View') {
                view.classList.add('active');
            }
        });

        // Trigger fetches if needed
        if (targetView === 'history') fetchReports();
        if (targetView === 'settings') loadSettings();
    };
});

function loadSettings() {
    goalHoursInput.value = getStoredInt('goalHours', 4);
    goalMinutesInput.value = getStoredInt('goalMinutes', 10);
}

saveSettingsBtn.onclick = () => {
    const h = parseInt(goalHoursInput.value);
    const m = parseInt(goalMinutesInput.value);
    localStorage.setItem('goalHours', h);
    localStorage.setItem('goalMinutes', m);
    goalSeconds = (h * 3600) + (m * 60);
    document.querySelector('.goal-label').textContent = `Goal: ${h}h ${m}m`;
    alert('Settings saved!');
};

function formatTime(seconds = 0) {
    if (isNaN(seconds) || seconds === null) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v < 10 ? '0' + v : v).join(':');
}

let baseManualSeconds = 0;
let baseAutoSeconds = 0;
let lastSyncRealTime = 0;
let manualStatus = 'idle';
let autoStatus = 'idle';
let syncInterval = 10000; // Sync every 10s

async function updateStatus(forceSync = false) {
    const now = Date.now();

    if (forceSync || (now - lastSyncRealTime >= syncInterval)) {
        try {
            const res = await fetch(`${API_BASE}/status`);
            const data = await res.json();

            // Store ground truth from server
            baseManualSeconds = data.manual.total_seconds || 0;
            baseAutoSeconds = data.automatic.total_seconds || 0;
            manualStatus = data.manual.status;
            autoStatus = data.automatic.status;

            // Critical: Align our local reference with the MOMENT of fetch completion
            lastSyncRealTime = Date.now();

            statusBadge.textContent = manualStatus;
            statusBadge.className = 'status-badge status-' + manualStatus;

            if (manualStatus === 'active') {
                startBtn.disabled = true;
                startBtn.classList.add('pulse');
                startBtn.textContent = 'Session Active';
            } else {
                startBtn.disabled = false;
                startBtn.classList.remove('pulse');
                startBtn.textContent = 'Start Session';
            }
        } catch (e) {
            console.error("Connection lost", e);
            statusBadge.textContent = 'Offline';
            statusBadge.className = 'status-badge status-offline';
            startBtn.disabled = true;
        }
    }

    const currentNow = Date.now();
    let displayManual = baseManualSeconds;
    if (manualStatus === 'active') {
        const elapsed = Math.floor((currentNow - lastSyncRealTime) / 1000);
        displayManual = baseManualSeconds + elapsed;
    }

    let displayAuto = baseAutoSeconds;
    if (autoStatus === 'active') {
        const elapsed = Math.floor((currentNow - lastSyncRealTime) / 1000);
        displayAuto = baseAutoSeconds + elapsed;
    }

    timerDisplay.textContent = formatTime(displayManual);
    todayTotalDisplay.textContent = formatTime(displayAuto);

    const progress = Math.min((displayManual / goalSeconds) * 100, 100);
    progressBar.style.width = progress + '%';
}


startBtn.onclick = async () => {
    await fetch(`${API_BASE}/start`, { method: 'POST' });
    updateStatus(true);
};

stopBtn.onclick = async () => {
    const confirmed = confirm("Are you sure you want to finish your day? This will save your session to history.");
    if (confirmed) {
        const res = await fetch(`${API_BASE}/stop`, { method: 'POST' });
        if (res.ok) {
            updateStatus(true);
            // Automatically switch to history to show results
            const historyNav = document.querySelector('[data-view="history"]');
            if (historyNav) historyNav.click();
        }
    }
};

async function fetchReports() {
    try {
        const res = await fetch(`${API_BASE}/reports`);
        reportsData = await res.json();
        renderActiveTab();
    } catch (e) {
        console.error("Failed to fetch reports", e);
    }
}

function renderActiveTab() {
    if (!reportsData) return;
    const data = reportsData[currentTab] || [];

    // Add header
    const header = `
        <div class="report-item report-header">
            <span>Period</span>
            <span>Workplace</span>
            <span>Day Total</span>
        </div>
    `;

    reportsList.innerHTML = header + (data.length ? data.map(item => `
        <div class="report-item" style="animation: fadeIn 0.3s ease-out">
            <span>${item.date || item.week || item.month}</span>
            <span>${formatTime(item.manual_total)}</span>
            <span class="auto-total-dim">${formatTime(item.auto_total)}</span>
        </div>
    `).join('') : '<div style="text-align:center; color:#555; margin-top:50px;">No records found</div>');
}

tabButtons.forEach(btn => {
    btn.onclick = () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        renderActiveTab();
    };
});

// Initialize
updateStatus(true);
setInterval(() => updateStatus(false), 1000);
document.querySelector('.goal-label').textContent = `Goal: ${getStoredInt('goalHours', 4)}h ${getStoredInt('goalMinutes', 10)}m`;

const timerDisplay = document.getElementById('timerDisplay');
const statusBadge = document.getElementById('statusBadge');
const progressBar = document.getElementById('progressBar');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
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
const goalLinePercentInput = document.getElementById('goalLinePercent');
const saveSettingsBtn = document.getElementById('saveSettings');

// Category Mapping
const appNameInput = document.getElementById('appNameInput');
const categorySelect = document.getElementById('categorySelect');
const addCategoryMappingBtn = document.getElementById('addCategoryMapping');
const categoryMappingsList = document.getElementById('categoryMappingsList');
const appSuggestions = document.getElementById('appSuggestions');
let customAppCategories = {};

let currentTab = 'daily';
let reportsData = null;
let goalSeconds = (getStoredInt('goalHours', 4) * 3600) + (getStoredInt('goalMinutes', 10) * 60);
let goalLinePercent = getStoredInt('goalLinePercent', 44);

function getStoredInt(key, defaultValue) {
    const val = localStorage.getItem(key);
    return (val === null || isNaN(parseInt(val))) ? defaultValue : parseInt(val);
}

const API_BASE = window.__API_BASE || 'http://localhost:3000';

// Utility: Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Utility: Throttle function
function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Cache DOM elements
const domCache = {
    progressPercent: null,
    goalLabel: null
};

// Accent Color management
const themeColors = {
    purple: { primary: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #d946ef)', r: 139, g: 92, b: 246 },
    ocean: { primary: '#0ea5e9', gradient: 'linear-gradient(135deg, #0ea5e9, #3b82f6)', r: 14, g: 165, b: 233 },
    sunset: { primary: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)', r: 245, g: 158, b: 11 },
    emerald: { primary: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #059669)', r: 16, g: 185, b: 129 },
    rose: { primary: '#f43f5e', gradient: 'linear-gradient(135deg, #f43f5e, #be123c)', r: 244, g: 63, b: 94 },
    indigo: { primary: '#4f46e5', gradient: 'linear-gradient(135deg, #4f46e5, #7c3aed)', r: 79, g: 70, b: 229 },
    teal: { primary: '#0d9488', gradient: 'linear-gradient(135deg, #0d9488, #0f766e)', r: 13, g: 148, b: 136 },
    coral: { primary: '#f97316', gradient: 'linear-gradient(135deg, #f97316, #ea580c)', r: 249, g: 115, b: 22 }
};

function applyAccentColor(colorKey) {
    const config = themeColors[colorKey] || themeColors.purple;
    const isLight = document.body.getAttribute('data-theme') === 'light';

    document.documentElement.style.setProperty('--primary', config.primary);
    document.documentElement.style.setProperty('--primary-gradient', config.gradient);
    document.documentElement.style.setProperty('--primary-dim', `rgba(${config.r}, ${config.g}, ${config.b}, ${isLight ? '0.1' : '0.15'})`);
    document.documentElement.style.setProperty('--shadow-hero', `0 8px 32px -8px rgba(${config.r}, ${config.g}, ${config.b}, ${isLight ? '0.15' : '0.3'})`);
    document.documentElement.style.setProperty('--shadow-hover', `0 6px 24px -4px rgba(${config.r}, ${config.g}, ${config.b}, ${isLight ? '0.35' : '0.5'})`);

    localStorage.setItem('accentColor', colorKey);

    document.querySelectorAll('.color-swatch').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === colorKey);
    });
}

// Ensure theme changes trigger accent color re-calculations for alpha differences
function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    // Refresh accent color alphas based on new theme
    applyAccentColor(localStorage.getItem('accentColor') || 'purple');
}

// Apply saved theme & color immediately
applyTheme(localStorage.getItem('theme') || 'dark');

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

// Theme toggle buttons
document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.onclick = () => applyTheme(btn.dataset.theme);
});

// Accent color toggle buttons
document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.onclick = () => applyAccentColor(btn.dataset.color);
});

async function loadSettings() {
    try {
        const res = await fetch(`${API_BASE}/settings`);
        const data = await res.json();
        goalHoursInput.value = data.goalHours;
        goalMinutesInput.value = data.goalMinutes;
        const breakInput = document.getElementById('breakInterval');
        if (breakInput) breakInput.value = data.breakInterval || 60;
        if (goalLinePercentInput) goalLinePercentInput.value = data.goalLinePercent || 44;

        // Load custom app categories
        try {
            customAppCategories = JSON.parse(data.customAppCategories || '{}');
        } catch (e) {
            customAppCategories = {};
        }
        renderCategoryMappings();

        // Load app suggestions
        loadAppSuggestions();

        // Sync to localStorage too
        localStorage.setItem('goalHours', data.goalHours);
        localStorage.setItem('goalMinutes', data.goalMinutes);
        localStorage.setItem('goalLinePercent', data.goalLinePercent || 44);
        goalSeconds = (data.goalHours * 3600) + (data.goalMinutes * 60);
        goalLinePercent = data.goalLinePercent || 44;
        document.querySelector('.goal-label').textContent = `Goal: ${data.goalHours}h ${data.goalMinutes}m`;
    } catch (e) {
        goalHoursInput.value = getStoredInt('goalHours', 4);
        goalMinutesInput.value = getStoredInt('goalMinutes', 10);
        if (goalLinePercentInput) goalLinePercentInput.value = getStoredInt('goalLinePercent', 44);
    }
}

async function loadAppSuggestions() {
    try {
        const res = await fetch(`${API_BASE}/today-apps`);
        const data = await res.json();
        if (appSuggestions) {
            appSuggestions.innerHTML = data.apps.map(app =>
                `<option value="${escapeHTML(app)}">`
            ).join('');
        }
    } catch (e) {
        console.error('Failed to load app suggestions:', e);
    }
}

function renderCategoryMappings() {
    if (!categoryMappingsList) return;

    const allMappings = [];
    for (const [category, apps] of Object.entries(customAppCategories)) {
        apps.forEach(app => {
            allMappings.push({ app, category });
        });
    }

    if (allMappings.length === 0) {
        categoryMappingsList.innerHTML = '<div class="category-mappings-empty">No custom mappings yet. Add apps above to categorize them.</div>';
        return;
    }

    allMappings.sort((a, b) => a.app.localeCompare(b.app));

    const fragment = document.createDocumentFragment();
    allMappings.forEach(({ app, category }) => {
        const item = document.createElement('div');
        item.className = 'category-mapping-item';
        item.innerHTML = `
            <div class="category-mapping-info">
                <span class="category-mapping-app">${escapeHTML(app)}</span>
                <span class="category-mapping-badge">${escapeHTML(category)}</span>
            </div>
            <button class="category-mapping-remove" data-app="${escapeHTML(app)}" data-category="${escapeHTML(category)}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;
        fragment.appendChild(item);
    });

    requestAnimationFrame(() => {
        categoryMappingsList.innerHTML = '';
        categoryMappingsList.appendChild(fragment);

        // Add remove handlers
        categoryMappingsList.querySelectorAll('.category-mapping-remove').forEach(btn => {
            btn.onclick = () => {
                const app = btn.dataset.app;
                const category = btn.dataset.category;
                removeCategoryMapping(app, category);
            };
        });
    });
}

function addCategoryMapping() {
    const appName = appNameInput.value.trim();
    const category = categorySelect.value;

    if (!appName) {
        alert('Please enter an app name');
        return;
    }

    // Remove app from all categories first
    for (const cat in customAppCategories) {
        customAppCategories[cat] = customAppCategories[cat].filter(a => a !== appName);
        if (customAppCategories[cat].length === 0) {
            delete customAppCategories[cat];
        }
    }

    // Add to selected category
    if (!customAppCategories[category]) {
        customAppCategories[category] = [];
    }
    customAppCategories[category].push(appName);

    // Clear input and re-render
    appNameInput.value = '';
    renderCategoryMappings();
}

function removeCategoryMapping(app, category) {
    if (customAppCategories[category]) {
        customAppCategories[category] = customAppCategories[category].filter(a => a !== app);
        if (customAppCategories[category].length === 0) {
            delete customAppCategories[category];
        }
    }
    renderCategoryMappings();
}

// Add category mapping button handler
if (addCategoryMappingBtn) {
    addCategoryMappingBtn.onclick = addCategoryMapping;
}

// Allow Enter key to add mapping
if (appNameInput) {
    appNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCategoryMapping();
        }
    });
}

saveSettingsBtn.onclick = async () => {
    const h = parseInt(goalHoursInput.value);
    const m = parseInt(goalMinutesInput.value);
    const breakInput = document.getElementById('breakInterval');
    const breakMin = breakInput ? parseInt(breakInput.value) || 0 : 60;
    const linePct = goalLinePercentInput ? parseInt(goalLinePercentInput.value) || 44 : 44;

    // Disable button to prevent double-clicks
    saveSettingsBtn.disabled = true;
    const originalText = saveSettingsBtn.textContent;
    saveSettingsBtn.textContent = 'Saving...';

    localStorage.setItem('goalHours', h);
    localStorage.setItem('goalMinutes', m);
    localStorage.setItem('goalLinePercent', linePct);
    goalSeconds = (h * 3600) + (m * 60);
    goalLinePercent = linePct;

    if (!domCache.goalLabel) {
        domCache.goalLabel = document.querySelector('.goal-label');
    }
    if (domCache.goalLabel) {
        domCache.goalLabel.textContent = `Goal: ${h}h ${m}m`;
    }

    try {
        await fetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                goalHours: h,
                goalMinutes: m,
                breakInterval: breakMin,
                goalLinePercent: linePct,
                customAppCategories: JSON.stringify(customAppCategories)
            })
        });
        alert('Settings saved!');
        // Refresh charts to reflect changes
        renderWeeklyChart();
        renderCategoryChart();
    } catch (e) {
        alert('Settings saved locally (server connection failed)');
    } finally {
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = originalText;
    }
};

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

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
let animationFrameId = null;
let _lastRenderedManual = -1;
let _lastRenderedAuto = -1;

function updateGreeting() {
    const greetingEl = document.getElementById('dashboardGreeting');
    if (!greetingEl) return;

    const hour = new Date().getHours();
    let greeting = 'Good Evening';
    if (hour >= 5 && hour < 12) greeting = 'Good Morning';
    else if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';

    // Add custom messages if active
    if (manualStatus === 'active') {
        greetingEl.textContent = `${greeting} — Focus Mode`;
    } else {
        greetingEl.textContent = greeting;
    }
}

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

            // Batch DOM updates
            requestAnimationFrame(() => {
                statusBadge.textContent = manualStatus;
                statusBadge.className = 'status-badge status-' + manualStatus;

                if (manualStatus === 'active') {
                    startBtn.disabled = true;
                    startBtn.classList.add('pulse');
                    startBtn.textContent = 'Session Active';
                    pauseBtn.style.display = '';
                } else if (manualStatus === 'paused') {
                    startBtn.disabled = false;
                    startBtn.classList.remove('pulse');
                    startBtn.textContent = 'Resume';
                    pauseBtn.style.display = 'none';
                } else {
                    startBtn.disabled = false;
                    startBtn.classList.remove('pulse');
                    startBtn.textContent = 'Start Session';
                    pauseBtn.style.display = 'none';
                }
                updateGreeting();
            });
        } catch (e) {
            console.error("Connection lost", e);
            requestAnimationFrame(() => {
                statusBadge.textContent = 'Offline';
                statusBadge.className = 'status-badge status-offline';
                startBtn.disabled = true;
            });
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

    // Optimization: Only update DOM if the rounded seconds have changed, drastically reducing CPU usage
    if (!forceSync && displayManual === _lastRenderedManual && displayAuto === _lastRenderedAuto) {
        return;
    }

    _lastRenderedManual = displayManual;
    _lastRenderedAuto = displayAuto;

    // Batch all DOM updates in a single animation frame
    requestAnimationFrame(() => {
        timerDisplay.textContent = formatTime(displayManual);
        todayTotalDisplay.textContent = formatTime(displayAuto);

        const progress = Math.min((displayManual / goalSeconds) * 100, 100);
        progressBar.style.width = progress + '%';

        if (!domCache.progressPercent) {
            domCache.progressPercent = document.querySelector('.progress-percent');
        }
        if (domCache.progressPercent) {
            domCache.progressPercent.textContent = Math.floor(progress) + '%';
        }

        // Update goal ring
        if (typeof updateGoalRing === 'function') updateGoalRing(displayManual);
    });
}


startBtn.onclick = async () => {
    await fetch(`${API_BASE}/start`, { method: 'POST' });
    updateStatus(true);
};

pauseBtn.onclick = async () => {
    await fetch(`${API_BASE}/pause`, { method: 'POST' });
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

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    // Add header
    const header = document.createElement('div');
    header.className = 'report-item report-header';
    header.innerHTML = `
        <span>Period</span>
        <span>Workplace</span>
        <span>Day Total</span>
    `;
    fragment.appendChild(header);

    if (data.length) {
        data.forEach(item => {
            const row = document.createElement('div');
            row.className = 'report-item';
            row.style.animation = 'fadeIn 0.3s ease-out';
            row.innerHTML = `
                <span>${escapeHTML(item.date || item.week || item.month)}</span>
                <span>${formatTime(item.manual_total)}</span>
                <span class="auto-total-dim">${formatTime(item.auto_total)}</span>
            `;
            fragment.appendChild(row);
        });
    } else {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center; color:#555; margin-top:50px;';
        empty.textContent = 'No records found';
        fragment.appendChild(empty);
    }

    // Single DOM update
    requestAnimationFrame(() => {
        reportsList.innerHTML = '';
        reportsList.appendChild(fragment);
    });
}

tabButtons.forEach(btn => {
    btn.onclick = () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        renderActiveTab();
    };
});

document.getElementById('exportCsvBtn').onclick = () => {
    const url = `${API_BASE}/export-csv?tab=${currentTab}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentTab}_report.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// ─── Dashboard Charts ───

function formatHM(seconds) {
    if (!seconds || isNaN(seconds)) return '0h';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return m + 'm';
    if (m === 0) return h + 'h';
    return h + 'h ' + m + 'm';
}

// Cache for chart data to avoid redundant fetches
let chartDataCache = null;
let chartDataCacheTime = 0;
const CHART_CACHE_DURATION = 30000; // 30 seconds

async function renderWeeklyChart() {
    const container = document.getElementById('weeklyChart');
    if (!container) return;
    try {
        // Use cached data if available and fresh
        let data;
        const now = Date.now();
        if (chartDataCache && (now - chartDataCacheTime < CHART_CACHE_DURATION)) {
            data = chartDataCache;
        } else {
            const res = await fetch(`${API_BASE}/reports`);
            data = await res.json();
            chartDataCache = data;
            chartDataCacheTime = now;
        }
        const daily = data.daily || [];

        // Get last 7 days
        const days = [];
        const today = new Date();
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const found = daily.find(r => r.date === dateStr);
            days.push({
                label: dayNames[d.getDay()],
                date: dateStr,
                manual: found ? found.manual_total : 0,
                auto: found ? found.auto_total : 0,
                isToday: i === 0
            });
        }

        const maxSeconds = Math.max(...days.map(d => Math.max(d.manual, d.auto)), goalSeconds, 1);
        const overtimeThreshold = goalSeconds + 3600;

        // Use custom goal line percentage from settings
        const goalPct = goalLinePercent;

        // Build per-column HTML (top value label + bars only — no day label here)
        const colsHTML = days.map(d => {
            const manualPct = d.manual > 0 ? Math.max((d.manual / maxSeconds) * 100, 3) : 0;
            const autoPct = d.auto > 0 ? Math.max((d.auto / maxSeconds) * 100, 3) : 0;

            let manualColor = '';
            if (d.manual >= overtimeThreshold) manualColor = 'bar-orange';
            else if (d.manual >= goalSeconds) manualColor = 'bar-green';

            const hasData = d.manual > 0 || d.auto > 0;
            const topVal = d.manual >= d.auto ? d.manual : d.auto;
            const topCls = d.manual >= d.auto ? '' : 'bar-value-auto';
            const valLabel = hasData
                ? `<span class="chart-bar-value ${topCls}">${formatHM(topVal)}</span>`
                : `<span class="chart-bar-value chart-bar-value-empty"></span>`;

            const todayColCls = d.isToday ? 'chart-col today-col' : 'chart-col';

            // bar-hidden = truly invisible when value is 0 (no stub)
            const manualHiddenCls = d.manual === 0 ? 'bar-hidden' : '';
            const autoHiddenCls = d.auto === 0 ? 'bar-hidden' : '';

            return `
                <div class="${todayColCls}" 
                     data-manual="${d.manual}" 
                     data-auto="${d.auto}"
                     onmouseenter="showColTooltip(event, this, '${d.label}')"
                     onmouseleave="hideColTooltip()">
                    <div class="chart-col-top">${valLabel}</div>
                    <div class="chart-col-bars">
                        <div class="chart-bar ${manualColor} ${manualHiddenCls}" style="height: ${manualPct}%"></div>
                        <div class="chart-bar bar-auto ${autoHiddenCls}" style="height: ${autoPct}%"></div>
                    </div>
                </div>
            `;
        }).join('');

        // Day labels row (separate from bars so their height doesn't affect goal line)
        const labelsHTML = days.map(d => {
            const cls = d.isToday ? 'chart-day-label today-label' : 'chart-day-label';
            return `<div class="chart-day-cell"><span class="${cls}">${d.label}</span></div>`;
        }).join('');

        container.innerHTML = `
            <div class="chart-bars-area">
                <div class="chart-goal-line" style="bottom: ${goalPct}%"></div>
                <div class="chart-cols-row">${colsHTML}</div>
            </div>
            <div class="chart-day-labels-row">${labelsHTML}</div>
        `;
    } catch (e) {
        container.innerHTML = '<div class="chart-loading">Unable to load</div>';
    }
}

// Global Tooltip Logic
let globalTooltip = null;

function createGlobalTooltip() {
    if (!globalTooltip) {
        globalTooltip = document.createElement('div');
        globalTooltip.className = 'app-tooltip';
        document.body.appendChild(globalTooltip);
    }
}

function showColTooltip(e, el, label) {
    createGlobalTooltip();
    const manual = parseInt(el.getAttribute('data-manual') || '0');
    const auto = parseInt(el.getAttribute('data-auto') || '0');

    globalTooltip.innerHTML = `
        <div class="tooltip-title">${label}</div>
        <div style="display:flex; justify-content:space-between; gap:16px;">
            <span style="color:var(--text-dim)">Workplace</span>
            <span class="tooltip-value">${formatHM(manual)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; gap:16px;">
            <span style="color:var(--text-dim)">Day Hours</span>
            <span class="tooltip-value">${formatHM(auto)}</span>
        </div>
    `;

    positionTooltip(e);
}

function hideColTooltip() {
    if (globalTooltip) {
        globalTooltip.classList.remove('visible');
    }
}

function positionTooltip(e) {
    if (!globalTooltip) return;

    // Offset slightly from cursor
    let x = e.clientX + 15;
    let y = e.clientY - 40;

    // Check boundaries
    globalTooltip.style.visibility = 'hidden';
    globalTooltip.style.display = 'block';
    const rect = globalTooltip.getBoundingClientRect();

    if (x + rect.width > window.innerWidth) {
        x = e.clientX - rect.width - 15;
    }
    if (y < 0) {
        y = e.clientY + 15;
    }

    globalTooltip.style.left = x + 'px';
    globalTooltip.style.top = y + 'px';
    globalTooltip.style.visibility = 'visible';

    requestAnimationFrame(() => {
        globalTooltip.classList.add('visible');
    });
}

function showAppTooltip(e, appName, seconds) {
    createGlobalTooltip();

    globalTooltip.innerHTML = `
        <div class="tooltip-title">${appName}</div>
        <div style="display:flex; justify-content:space-between; gap:16px;">
            <span style="color:var(--text-dim)">Time Spent</span>
            <span class="tooltip-value" style="color:#3b82f6">${formatHM(seconds)}</span>
        </div>
    `;

    positionTooltip(e);
}

function updateGoalRing(manualSeconds) {
    const ring = document.getElementById('ringProgress');
    const pctEl = document.getElementById('ringPercent');
    if (!ring || !pctEl) return;

    const circumference = 326.73;
    const ratio = manualSeconds / goalSeconds;
    const pct = Math.min(ratio, 1);
    const offset = circumference - (pct * circumference);

    ring.style.strokeDashoffset = offset;
    pctEl.textContent = Math.floor(ratio * 100) + '%';

    // Dynamic ring color: purple/fuchsia < goal, green >= goal, orange >= goal+1h
    const overtimeThreshold = goalSeconds + 3600;
    if (manualSeconds >= overtimeThreshold) {
        ring.style.stroke = '#f59e0b';
    } else if (manualSeconds >= goalSeconds) {
        ring.style.stroke = '#10b981';
    } else {
        ring.style.stroke = 'url(#ringGradient)';
    }
}

async function renderActivityTimeline() {
    const container = document.getElementById('activityTimeline');
    const countEl = document.getElementById('eventCount');
    if (!container) return;
    try {
        const res = await fetch(`${API_BASE}/today-events`);
        const data = await res.json();
        const events = data.events || [];

        if (countEl) countEl.textContent = events.length + ' events';

        if (events.length === 0) {
            container.innerHTML = '<div class="timeline-empty">No activity recorded today</div>';
            return;
        }

        container.innerHTML = events.map(ev => {
            const ts = ev.timestamp || '';
            let timeStr = '';
            try {
                const d = new Date(ts.replace(' ', 'T') + 'Z');
                timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            } catch (e) { timeStr = ts; }

            const isUnlock = ev.event_type === 'unlock';
            const label = isUnlock ? 'Screen Unlocked' : 'Screen Locked';

            return `
                <div class="timeline-item">
                    <div class="timeline-dot ${ev.event_type}"></div>
                    <span class="timeline-time">${timeStr}</span>
                    <span class="timeline-event">${label}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = '<div class="timeline-empty">Unable to load events</div>';
    }
}

async function renderAppUsage() {
    const container = document.getElementById('appUsageList');
    const countEl = document.getElementById('appCount');
    if (!container) return;
    try {
        const res = await fetch(`${API_BASE}/app-usage`);
        const data = await res.json();
        const usage = data.usage || [];

        if (countEl) countEl.textContent = usage.length + ' apps';

        if (usage.length === 0) {
            container.innerHTML = '<div class="app-usage-empty">No app usage recorded today</div>';
            return;
        }

        const maxSeconds = usage[0].total_seconds || 1;
        const colorClasses = ['app-bar-1', 'app-bar-2', 'app-bar-3', 'app-bar-4', 'app-bar-5'];

        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();
        usage.slice(0, 10).forEach((app, i) => {
            const pct = Math.max((app.total_seconds / maxSeconds) * 100, 3);
            const color = i < colorClasses.length ? colorClasses[i] : 'app-bar-default';

            const row = document.createElement('div');
            row.className = 'app-row';
            row.innerHTML = `
                <div style="display:flex; width:100%; align-items:center;"
                     onmouseenter="showAppTooltip(event, '${escapeHTML(app.app_name)}', parseInt('${app.total_seconds}'))"
                     onmouseleave="hideColTooltip()">
                    <span class="app-rank">${i + 1}</span>
                    <div class="app-info">
                        <div class="app-name-row">
                            <span class="app-name">${escapeHTML(app.app_name)}</span>
                            <span class="app-time">${formatHM(app.total_seconds)}</span>
                        </div>
                        <div class="app-bar-track">
                            <div class="app-bar-fill ${color}" style="width: ${pct}%"></div>
                        </div>
                    </div>
                </div>
            `;
            fragment.appendChild(row);
        });

        requestAnimationFrame(() => {
            container.innerHTML = '';
            container.appendChild(fragment);
        });
    } catch (e) {
        container.innerHTML = '<div class="app-usage-empty">Unable to load app usage</div>';
    }
}

async function renderCategoryChart() {
    const container = document.getElementById('categoryChart');
    if (!container) return;
    try {
        const res = await fetch(`${API_BASE}/app-usage-categories`);
        const data = await res.json();
        const cats = data.categories || [];

        if (cats.length === 0) {
            container.innerHTML = '<div class="category-empty">No app usage recorded today</div>';
            return;
        }

        const total = cats.reduce((sum, c) => sum + c.seconds, 0) || 1;
        const colors = ['#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#f97316', '#84cc16', '#d946ef'];

        // Build SVG pie chart using conic segments via circle stroke-dasharray
        const radius = 50;
        const circumference = 2 * Math.PI * radius;
        let offset = 0;
        const slices = cats.map((cat, i) => {
            const pct = cat.seconds / total;
            const dashLen = pct * circumference;
            const color = colors[i % colors.length];
            const slice = `<circle cx="70" cy="70" r="${radius}" fill="none" stroke="${color}" stroke-width="30"
                stroke-dasharray="${dashLen} ${circumference - dashLen}" stroke-dashoffset="${-offset}"
                style="transition: stroke-dashoffset 0.5s ease"/>`;
            offset += dashLen;
            return slice;
        });

        const pieSvg = `<svg class="pie-svg" viewBox="0 0 140 140">${slices.join('')}</svg>`;

        const legend = cats.map((cat, i) => {
            const pct = Math.round((cat.seconds / total) * 100);
            const color = colors[i % colors.length];
            return `
                <div class="category-item">
                    <div class="category-dot" style="background:${color}"></div>
                    <span class="category-name">${escapeHTML(cat.name)}</span>
                    <span class="category-time">${formatHM(cat.seconds)}</span>
                    <span class="category-pct">${pct}%</span>
                </div>
            `;
        }).join('');

        container.innerHTML = pieSvg + `<div class="category-legend">${legend}</div>`;
    } catch (e) {
        container.innerHTML = '<div class="category-empty">Unable to load categories</div>';
    }
}

async function loadDashboardCharts() {
    renderWeeklyChart();
    renderAppUsage();
    renderCategoryChart();
    renderActivityTimeline();
}

// ─── Auto-refresh when window regains focus (native app + browser) ───
// Debounce to avoid multiple rapid calls
const debouncedRefresh = debounce(() => {
    updateStatus(true);
    loadDashboardCharts();
}, 300);

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        debouncedRefresh();
    }
});

window.addEventListener('focus', debouncedRefresh);

// Handle online/offline events
window.addEventListener('online', () => {
    console.log('Connection restored');
    updateStatus(true);
});

window.addEventListener('offline', () => {
    console.log('Connection lost');
    requestAnimationFrame(() => {
        statusBadge.textContent = 'Offline';
        statusBadge.className = 'status-badge status-offline';
    });
});

// ─── Initialize ───
(async () => {
    try {
        const res = await fetch(`${API_BASE}/settings`);
        const data = await res.json();
        localStorage.setItem('goalHours', data.goalHours);
        localStorage.setItem('goalMinutes', data.goalMinutes);
        localStorage.setItem('goalLinePercent', data.goalLinePercent || 44);
        goalSeconds = (data.goalHours * 3600) + (data.goalMinutes * 60);
        goalLinePercent = data.goalLinePercent || 44;
        const goalLabel = document.querySelector('.goal-label');
        if (goalLabel) {
            goalLabel.textContent = `Goal: ${data.goalHours}h ${data.goalMinutes}m`;
        }
    } catch (e) {
        const goalLabel = document.querySelector('.goal-label');
        if (goalLabel) {
            goalLabel.textContent = `Goal: ${getStoredInt('goalHours', 4)}h ${getStoredInt('goalMinutes', 10)}m`;
        }
    }
})();

// Initial load
updateStatus(true);
loadDashboardCharts();

// Use requestAnimationFrame for smoother updates instead of setInterval
function animationLoop() {
    updateStatus(false);
    animationFrameId = requestAnimationFrame(animationLoop);
}
animationFrameId = requestAnimationFrame(animationLoop);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
});

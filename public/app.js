const timerDisplay = document.getElementById('timerDisplay');
const statusBadge = document.getElementById('statusBadge');
const progressBar = document.getElementById('progressBar');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
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

// Location
const locationStatusBadge = document.getElementById('locationStatusBadge');
const setOfficeLocationBtn = document.getElementById('setOfficeLocationBtn');
const officeRadiusInput = document.getElementById('officeRadiusInput');
const clearOfficeLocationBtn = document.getElementById('clearOfficeLocationBtn');
const officeRadiusSlider = document.getElementById('officeRadiusSlider');
const radiusDecrease = document.getElementById('radiusDecrease');
const radiusIncrease = document.getElementById('radiusIncrease');
const radiusValDisplay = document.getElementById('radiusValDisplay');
const gaugeProgress = document.getElementById('gaugeProgress');
const locateMeBtn = document.getElementById('locateMeBtn');
const mapLocateMeBtn = document.getElementById('mapLocateMeBtn');
const distanceCard = document.getElementById('distanceCard');

// Category Mapping
const appNameInput = document.getElementById('appNameInput');
const categorySelect = document.getElementById('categorySelect');
const addCategoryMappingBtn = document.getElementById('addCategoryMapping');
const categoryMappingsList = document.getElementById('categoryMappingsList');
const appSuggestions = document.getElementById('appSuggestions');
let customAppCategories = {};

let currentTab = 'daily';
let currentStatsRange = 7;
let reportsData = null;
let timeFormat = localStorage.getItem('timeFormat') || '24h';
let goalSeconds = (getStoredInt('goalHours', 4) * 3600) + (getStoredInt('goalMinutes', 10) * 60);
let goalLinePercent = getStoredInt('goalLinePercent', 44);
let defaultProjectId = null;
let filterStartDate = null;
let filterEndDate = null;

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
    goalLabel: null,
    heroLabelText: null,
    heroLabelIcon: null
};

// Accent Color management
const themeColors = {
    // Original Gradients
    purple: { primary: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #d946ef)', r: 139, g: 92, b: 246 },
    ocean: { primary: '#0ea5e9', gradient: 'linear-gradient(135deg, #0ea5e9, #3b82f6)', r: 14, g: 165, b: 233 },
    sunset: { primary: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)', r: 245, g: 158, b: 11 },
    emerald: { primary: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #059669)', r: 16, g: 185, b: 129 },
    rose: { primary: '#f43f5e', gradient: 'linear-gradient(135deg, #f43f5e, #be123c)', r: 244, g: 63, b: 94 },
    indigo: { primary: '#4f46e5', gradient: 'linear-gradient(135deg, #4f46e5, #7c3aed)', r: 79, g: 70, b: 229 },
    teal: { primary: '#0d9488', gradient: 'linear-gradient(135deg, #0d9488, #0f766e)', r: 13, g: 148, b: 136 },
    coral: { primary: '#f97316', gradient: 'linear-gradient(135deg, #f97316, #ea580c)', r: 249, g: 115, b: 22 },
    // New Gradients
    fire: { primary: '#f97316', gradient: 'linear-gradient(135deg, #f97316, #facc15)', r: 249, g: 115, b: 22 },
    forest: { primary: '#22c55e', gradient: 'linear-gradient(135deg, #22c55e, #14b8a6)', r: 34, g: 197, b: 94 },
    berry: { primary: '#d946ef', gradient: 'linear-gradient(135deg, #d946ef, #f43f5e)', r: 217, g: 70, b: 239 },
    midnight: { primary: '#312e81', gradient: 'linear-gradient(135deg, #4c1d95, #1e3a8a)', r: 49, g: 46, b: 129 },
    // Solid Colors
    solid_blue: { primary: '#2563eb', gradient: '#2563eb', r: 37, g: 99, b: 235 },
    solid_red: { primary: '#dc2626', gradient: '#dc2626', r: 220, g: 38, b: 38 },
    solid_green: { primary: '#16a34a', gradient: '#16a34a', r: 22, g: 163, b: 74 },
    solid_purple: { primary: '#9333ea', gradient: '#9333ea', r: 147, g: 51, b: 234 },
    solid_orange: { primary: '#ea580c', gradient: '#ea580c', r: 234, g: 88, b: 12 },
    solid_pink: { primary: '#db2777', gradient: '#db2777', r: 219, g: 39, b: 119 },
    solid_gray: { primary: '#4b5563', gradient: '#4b5563', r: 75, g: 85, b: 99 }
};

function applyAccentColor(colorKey) {
    const config = Reflect.get(themeColors, colorKey) || themeColors.purple;
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
    localStorage.setItem('theme', theme);
    document.querySelectorAll('.theme-btn[data-theme]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    let activeTheme = theme;
    if (theme === 'system') {
        activeTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    document.body.setAttribute('data-theme', activeTheme);
    // Refresh accent color alphas based on new theme
    applyAccentColor(localStorage.getItem('accentColor') || 'purple');
}

// Listen for system theme changes if using system theme
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    if (localStorage.getItem('theme') === 'system') {
        applyTheme('system');
    }
});

// Apply saved theme & color immediately
applyTheme(localStorage.getItem('theme') || 'system');

// Navigation Logic
navItems.forEach(item => {
    item.onclick = () => {
        const targetView = item.dataset.view;
        sessionStorage.setItem('activeView', targetView);

        // Reset scroll position to top when switching views!
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.scrollTop = 0;
        }

        // Update Active Nav Style
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        // Switch Views (using content-visibility)
        views.forEach(view => {
            const isTarget = view.id === targetView + 'View';
            view.classList.toggle('active', isTarget);
            view.setAttribute('aria-hidden', !isTarget);

            if (isTarget) {
                // Modern Focus Management for accessibility
                view.setAttribute('tabindex', '-1');
                view.focus({ preventScroll: true });

                // Trigger staggered animations for active elements
                requestAnimationFrame(() => {
                    const animatedElements = view.querySelectorAll('.glass-card, .view-title, .status-card');
                    animatedElements.forEach((el, index) => {
                        el.classList.remove('animate-in');
                        void el.offsetWidth; // Force Reflow
                        el.classList.add('animate-in');

                        // Apply precise micro-animation delay dynamically
                        el.style.animationDelay = `${index * 0.05}s`;
                    });
                });
            }
        });

        // Trigger fetches only if the tab is actively loaded
        if (targetView === 'history') {
            fetchReports();
            setTimeout(() => {
                renderStatsChart(currentStatsRange);
            }, 50);
        }
        if (targetView === 'settings') loadSettings();
        if (targetView === 'location') initLocationView();
        if (targetView === 'wellbeing') {
            const wellbeingView = document.getElementById('wellbeingView');
            if (wellbeingView && wellbeingView.children.length === 0) {
                fetch('wellbeing.html')
                    .then(res => res.text())
                    .then(html => {
                        wellbeingView.innerHTML = html;
                        if (typeof initWellbeing === 'function') initWellbeing();
                    })
                    .catch(err => console.error('Failed to load wellbeing view:', err));
            } else {
                if (typeof initWellbeing === 'function') initWellbeing();
            }
        }
    };
});

// Restore active view from sessionStorage
const savedView = sessionStorage.getItem('activeView') || 'monitor';
const targetNav = Array.from(navItems).find(n => n.dataset.view === savedView);
if (targetNav) {
    targetNav.click();
}

// Add data-label to nav items for minimized tooltip
navItems.forEach(item => {
    const labelSpan = item.querySelector('.nav-label');
    const label = labelSpan ? labelSpan.textContent.trim() : item.textContent.trim();
    item.setAttribute('data-label', label);
});

// Collapsible Sidebar Logic
(function() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    if (!sidebar || !toggleBtn) return;

    // Default: minimized in HTML. If user expanded it before, remove class
    const savedState = localStorage.getItem('sidebarExpanded');
    if (savedState === 'true') {
        sidebar.classList.remove('minimized');
    }

    toggleBtn.addEventListener('click', () => {
        const isMinimized = sidebar.classList.toggle('minimized');
        localStorage.setItem('sidebarExpanded', !isMinimized);
    });
})();


// Theme toggle buttons
document.querySelectorAll('.theme-btn[data-theme]').forEach(btn => {
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
        try {
            const dynRes = await fetch(`${API_BASE}/dynamic-break-stats`);
            const dynData = await dynRes.json();
            const dynText = document.getElementById('dynamicBreakText');
            if (dynText) {
                dynText.textContent = `AI scheduled your next break for ${dynData.interval} minutes from now based on your behavior.`;
            }
        } catch (err) {
            console.error('Failed to load dynamic break stats', err);
        }
        if (goalLinePercentInput) goalLinePercentInput.value = data.goalLinePercent || 44;
        defaultProjectId = data.defaultProjectId || null;


        if (officeRadiusInput && data.officeRadius) {
            officeRadiusInput.value = data.officeRadius;
        }

        if (locationStatusBadge) {
            if (data.officeLat && data.officeLng) {
                locationStatusBadge.textContent = 'Office Location Configured ✓';
                locationStatusBadge.className = 'status-badge status-active';
                setOfficeLocationBtn.innerHTML = DOMPurify.sanitize(`
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                    Update to Current Location
                `);
            } else {
                locationStatusBadge.textContent = 'Not Configured';
                locationStatusBadge.className = 'status-badge status-offline';
            }
        }

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
                html`<option value="${escapeHTML(app)}">`
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
        categoryMappingsList.innerHTML = DOMPurify.sanitize('<div class="category-mappings-empty">No custom mappings yet. Add apps above to categorize them.</div>');
        return;
    }

    allMappings.sort((a, b) => a.app.localeCompare(b.app));

    const fragment = document.createDocumentFragment();
    allMappings.forEach(({ app, category }) => {
        const item = document.createElement('div');
        item.className = 'category-mapping-item';
        item.innerHTML = DOMPurify.sanitize(`
            <div class="category-mapping-info">
                <span class="category-mapping-app">${escapeHTML(app)}</span>
                <span class="category-mapping-badge">${escapeHTML(category)}</span>
            </div>
            <button class="category-mapping-remove" data-app="${escapeHTML(app)}" data-category="${escapeHTML(category)}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `);
        fragment.appendChild(item);
    });

    requestAnimationFrame(() => {
        categoryMappingsList.innerHTML = DOMPurify.sanitize('');
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
        if (Object.hasOwn(customAppCategories, cat)) { const arr = Reflect.get(customAppCategories, cat); Reflect.set(customAppCategories, cat, arr.filter(a => a !== appName)); }
        if (Reflect.get(customAppCategories, cat).length === 0) {
            Reflect.deleteProperty(customAppCategories, cat);
        }
    }

    // Add to selected category
    if (!Reflect.has(customAppCategories, category)) {
        Reflect.set(customAppCategories, category, []);
    }
    Reflect.get(customAppCategories, category).push(appName);

    // Clear input and re-render
    appNameInput.value = '';
    renderCategoryMappings();
}

function removeCategoryMapping(app, category) {
    if (Object.hasOwn(customAppCategories, category) && Reflect.get(customAppCategories, category)) {
        Reflect.set(customAppCategories, category, Reflect.get(customAppCategories, category).filter(a => a !== app));
        if (Reflect.get(customAppCategories, category).length === 0) {
            Reflect.deleteProperty(customAppCategories, category);
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

    const linePct = goalLinePercentInput ? parseInt(goalLinePercentInput.value) || 44 : 44;
    const radius = officeRadiusInput ? parseInt(officeRadiusInput.value) || 200 : 200;


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

                goalLinePercent: linePct,
                officeRadius: radius,
                customAppCategories: JSON.stringify(customAppCategories)
            })
        });
        alert('Settings saved!');
        // Refresh charts to reflect changes
        renderWeeklyChart();
        renderStatsChart(currentStatsRange);
        renderCategoryChart();
    } catch (e) {
        alert('Settings saved locally (server connection failed)');
    } finally {
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = originalText;
    }
};

let _isSettingOfficeLocation = false;

if (setOfficeLocationBtn) {
    setOfficeLocationBtn.onclick = async () => {
        setOfficeLocationBtn.disabled = true;
        setOfficeLocationBtn.innerHTML = DOMPurify.sanitize(`
            <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Locating...
        `);

        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.requestLocation) {
            console.log('[Location] Requesting office location via Native Bridge...');
            _isSettingOfficeLocation = true;
            window.webkit.messageHandlers.requestLocation.postMessage({});

            // Auto-reset if native doesn't respond in 15s to prevent UI hang
            setTimeout(() => {
                if (_isSettingOfficeLocation) {
                    console.warn('[Location] Native bridge timed out for office set');
                    _isSettingOfficeLocation = false;
                    resetLocationBtn();
                }
            }, 15000);
            return;
        }

        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser.');
            resetLocationBtn();
            return;
        }

        const geoOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 };

        const successCallback = async (position) => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            const radius = officeRadiusInput ? parseInt(officeRadiusInput.value) || 200 : 200;

            try {
                await fetch(`${API_BASE}/set-office-location`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ latitude, longitude, radius })
                });

                _isSettingOfficeLocation = false;
                resetLocationBtn();
                if (locationMap) loadLocationData();
                console.log('Office location successfully set via Browser API!');
            } catch (e) {
                console.error(e);
                _isSettingOfficeLocation = false;
                alert('Failed to save office location.');
                resetLocationBtn();
            }
        };

        const errorCallback = (error) => {
            if (geoOptions.enableHighAccuracy) {
                console.warn('[Location] High accuracy failed, retrying with low accuracy...');
                geoOptions.enableHighAccuracy = false;
                geoOptions.timeout = 10000;
                navigator.geolocation.getCurrentPosition(successCallback, errorCallback, geoOptions);
            } else {
                console.error(error);
                _isSettingOfficeLocation = false;
                alert(`Location access denied or unavailable: ${error.message}`);
                resetLocationBtn();
            }
        };

        navigator.geolocation.getCurrentPosition(successCallback, errorCallback, geoOptions);
    };
}

if (clearOfficeLocationBtn) {
    clearOfficeLocationBtn.onclick = async () => {
        if (!confirm('Are you sure you want to clear the office location? Auto-tracking to the Workplace timer will be disabled.')) return;

        clearOfficeLocationBtn.disabled = true;
        try {
            await fetch(`${API_BASE}/clear-office-location`, { method: 'POST' });
            alert('Office location cleared.');
            resetLocationBtn();
            if (locationStatusBadge) {
                locationStatusBadge.textContent = 'Not Configured';
                locationStatusBadge.className = 'status-badge status-offline';
            }
            // Refresh the map view
            if (locationMap) {
                if (officeCircle) locationMap.removeLayer(officeCircle);
                officeMarker = null;
                officeCircle = null;
                clearRoutePolyline();
                document.getElementById('locationAutoStatus').textContent = 'Inactive';
                document.getElementById('locationAutoStatus').style.color = '';
            }
        } catch (e) {
            console.error(e);
            alert('Failed to clear location.');
        } finally {
            clearOfficeLocationBtn.disabled = false;
        }
    };
}

function resetLocationBtn() {
    if (!setOfficeLocationBtn) return;
    setOfficeLocationBtn.disabled = false;
    setOfficeLocationBtn.innerHTML = DOMPurify.sanitize(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3"/>
        </svg>
        Set Current Location as Office
    `);
}

// ===== LOCATION MAP VIEW =====
let locationMap = null;
let officeMarker = null;
let officeCircle = null;
let officeOuterCircle = null;
let userMarker = null;
let currentBaseLayer = null;
let _currentOfficeLat = null;
let _currentOfficeLng = null;
let _currentOfficeRadius = 200;
let _distanceWatchId = null;

/**
 * Haversine distance in metres between two lat/lng pairs.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth radius in metres
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Current travel mode: 'driving' or 'walking'
let _routeMode = 'driving';
let _routePolyline = null;
let _routeCalcTimeout = null;

function updateDistanceCard(userLat, userLng, accuracy) {
    if (_currentOfficeLat === null || _currentOfficeLng === null) {
        if (distanceCard) distanceCard.style.display = 'none';
        return;
    }

    if (distanceCard) distanceCard.style.display = 'flex';

    // ── Always compute straight-line distance immediately ──
    const straightDist = haversineDistance(userLat, userLng, _currentOfficeLat, _currentOfficeLng);
    const inside = straightDist <= _currentOfficeRadius;

    // Geofence status
    const statusEl = document.getElementById('distanceStatus');
    if (statusEl) {
        statusEl.textContent = inside ? '✓ Inside Geofence' : '✗ Outside Geofence';
        statusEl.className = 'distance-status-badge ' + (inside ? 'inside' : 'outside');
    }

    // ── DISTANCE CARD OPTIMIZATION ──
    // If inside, we hide the distance and ETA, and don't calculate road routes
    const distRow = document.querySelector('.distance-value-row');
    const etaRow = document.querySelector('.route-eta-row');

    if (inside) {
        if (distRow) distRow.style.display = 'none';
        if (etaRow) etaRow.style.display = 'none';
        clearTimeout(_routeCalcTimeout);
        return; // Don't proceed to route calculation
    } else {
        if (distRow) distRow.style.display = 'flex';
        if (etaRow) etaRow.style.display = 'flex';

        // Show straight-line value right away in the main display (fallback until road route loads)
        const distValEl = document.getElementById('routeDistValue');
        const distUnitEl = document.getElementById('routeDistUnit');
        const etaEl = document.getElementById('routeEta');

        if (distValEl && distUnitEl) {
            if (straightDist >= 1000) {
                distValEl.textContent = (straightDist / 1000).toFixed(2);
                distUnitEl.textContent = 'km';
            } else {
                distValEl.textContent = Math.round(straightDist);
                distUnitEl.textContent = 'm';
            }
        }

        if (etaEl) etaEl.textContent = 'Calculating route…';
        const slEl = document.getElementById('routeStraightLine');
        if (slEl) slEl.textContent = '';
    }

    // Coordinates + accuracy hint
    const coordsEl = document.getElementById('distanceCoords');
    if (coordsEl) {
        const accText = accuracy ? ` · ±${Math.round(accuracy)}m accuracy` : '';
        coordsEl.textContent = `You: ${userLat.toFixed(5)}, ${userLng.toFixed(5)}${accText}`;
    }

    // Debounce road-route fetch (1.5 s so we don't spam on every GPS tick)
    clearTimeout(_routeCalcTimeout);
    _routeCalcTimeout = setTimeout(() => {
        calculateRoute(userLat, userLng, _currentOfficeLat, _currentOfficeLng, _routeMode, straightDist);
    }, 1500);
}

/**
 * Fetches a road route from OSRM (free, no API key needed) and:
 *  - Updates the route distance + ETA in the card
 *  - Draws the route polyline on the map
 */
async function calculateRoute(userLat, userLng, officeLat, officeLng, mode = 'driving') {
    const spinnerEl = document.getElementById('routeSpinner');
    const distValEl = document.getElementById('routeDistValue');
    const distUnitEl = document.getElementById('routeDistUnit');
    const etaEl = document.getElementById('routeEta');

    // Final check: if user moved inside while starting calc, abort
    const straightDist = haversineDistance(userLat, userLng, officeLat, officeLng);
    if (straightDist <= _currentOfficeRadius) return;

    // Show spinner
    if (spinnerEl) spinnerEl.style.display = 'inline-flex';
    if (etaEl) etaEl.textContent = 'Calculating route…';

    // OSRM profiles: 'driving', 'bike', 'foot'
    const osrmProfile = mode === 'cycling' ? 'bike' : mode === 'walking' ? 'foot' : 'driving';
    // Note: OSRM expects lng,lat order
    const primaryUrl = `https://router.project-osrm.org/route/v1/${osrmProfile}/${userLng},${userLat};${officeLng},${officeLat}?overview=full&geometries=geojson&steps=false`;
    const secondaryUrl = `https://osrm.project-osrm.org/route/v1/${osrmProfile}/${userLng},${userLat};${officeLng},${officeLat}?overview=full&geometries=geojson&steps=false`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
        let res;
        try {
            res = await fetch(primaryUrl, { signal: controller.signal });
        } catch (e) {
            console.warn('[Route] Primary server failed, trying backup...', e.message);
            res = await fetch(secondaryUrl, { signal: controller.signal });
        }

        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
        const data = await res.json();

        if (!data.routes || data.routes.length === 0) throw new Error('No route found');

        const route = data.routes[0];
        const distMetres = route.distance;     // metres
        const durationSec = route.duration;    // seconds
        const geometry = route.geometry;       // GeoJSON LineString

        // Update distance display
        if (distValEl && distUnitEl) {
            if (distMetres >= 1000) {
                distValEl.textContent = (distMetres / 1000).toFixed(2);
                distUnitEl.textContent = 'km';
            } else {
                distValEl.textContent = Math.round(distMetres);
                distUnitEl.textContent = 'm';
            }
        }

        // Update ETA
        if (etaEl) {
            const modeLabel = mode === 'cycling' ? ' by bike' : mode === 'walking' ? ' walk' : ' drive';
            etaEl.textContent = formatDuration(durationSec) + modeLabel;
        }

        // Draw route polyline on map
        if (locationMap && geometry) {
            // Remove old route layer
            if (_routePolyline) {
                locationMap.removeLayer(_routePolyline);
                _routePolyline = null;
            }

            // GeoJSON coords are [lng, lat], Leaflet needs [lat, lng]
            const latlngs = geometry.coordinates.map(c => [c[1], c[0]]);

            const routeColor = mode === 'cycling' ? '#10b981' : mode === 'walking' ? '#f59e0b' : '#6366f1';
            _routePolyline = L.polyline(latlngs, {
                color: routeColor,
                weight: 4,
                opacity: 0.85,
                dashArray: mode === 'cycling' ? '10 6' : null,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(locationMap);

            // Add distance label directly on the map line
            const distLabel = distMetres >= 1000 ? (distMetres / 1000).toFixed(1) + ' km' : Math.round(distMetres) + ' m';
            _routePolyline.bindTooltip(`${distLabel} ${mode === 'cycling' ? 'bike' : 'drive'}`, {
                permanent: true,
                direction: 'center',
                className: 'route-label-tooltip',
                opacity: 0.9
            });

            // Update the sidebar card labels
            const slEl = document.getElementById('routeStraightLine');
            if (slEl) {
                const straightDist = haversineDistance(userLat, userLng, officeLat, officeLng);
                const slText = straightDist >= 1000
                    ? `${(straightDist / 1000).toFixed(1)}km straight`
                    : `${Math.round(straightDist)}m straight`;
                slEl.textContent = `(via road) · ${slText}`;
            }

            // Bring markers on top of the route line
            if (officeMarker) officeMarker.bringToFront();
            if (userMarker) userMarker.bringToFront();
        }

    } catch (err) {
        clearTimeout(timeoutId);
        console.error('[Route] OSRM error:', err.name, err.message);

        // Optimization: Instead of showing "Road route unavailable", we just hide the ETA row 
        // and keep the main distance display which already shows the straight-line fallback.
        const etaRow = document.querySelector('.route-eta-row');
        if (etaRow) {
            etaRow.style.display = 'none';
        }

        if (etaEl) {
            etaEl.textContent = '';
        }
        const slEl = document.getElementById('routeStraightLine');
        if (slEl) {
            slEl.textContent = '';
        }
    } finally {
        if (spinnerEl) spinnerEl.style.display = 'none';
    }
}

/** Format seconds into "X h Y min" or "Y min" */
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h} h ${m} min`;
    if (m > 0) return `${m} min`;
    return '< 1 min';
}

/** Remove route line from map */
function clearRoutePolyline() {
    if (_routePolyline && locationMap) {
        locationMap.removeLayer(_routePolyline);
        _routePolyline = null;
    }
}

// Wire up travel mode buttons
document.querySelectorAll('.route-mode-btn').forEach(btn => {
    btn.onclick = () => {
        _routeMode = btn.dataset.mode;
        document.querySelectorAll('.route-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Recalculate immediately on mode switch
        if (window._lastUserPos && _currentOfficeLat !== null) {
            // Cancel any pending debounce
            clearTimeout(_routeCalcTimeout);
            calculateRoute(
                window._lastUserPos.lat, window._lastUserPos.lng,
                _currentOfficeLat, _currentOfficeLng,
                _routeMode
            );
        }
    };
});

/**
 * Single source of truth for live location tracking.
 * Uses watchPosition with maximumAge:0 to always get a fresh GPS fix.
 * Updates the user marker and distance card on every position update.
 */
function startLiveTracking() {
    if (!navigator.geolocation) return;

    // Clear any previous watch
    if (_distanceWatchId !== null) {
        navigator.geolocation.clearWatch(_distanceWatchId);
        _distanceWatchId = null;
    }

    // Show "acquiring" state in distance card
    const statusEl = document.getElementById('distanceStatus');
    if (statusEl) {
        statusEl.textContent = 'Acquiring GPS…';
        statusEl.className = 'distance-status-badge';
    }

    _distanceWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const acc = pos.coords.accuracy; // metres
            window._lastUserPos = { lat, lng, acc };

            console.log(`[Location] Live position: ${lat.toFixed(6)}, ${lng.toFixed(6)} ±${Math.round(acc)}m`);

            // Update user marker on map (map must exist)
            if (locationMap) {
                if (userMarker) locationMap.removeLayer(userMarker);
                userMarker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'user-location-marker',
                        html: '<div class="user-dot-inner"></div>',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                }).addTo(locationMap).bindPopup(`📍 You are here<br><small style="color:#999">${lat.toFixed(5)}, ${lng.toFixed(5)}</small>`);
            }

            // Update distance card
            updateDistanceCard(lat, lng, acc);
        },
        (err) => {
            console.warn('[Location] Watch error:', err.code, err.message);
            const statusEl = document.getElementById('distanceStatus');
            if (statusEl) {
                statusEl.textContent = `GPS Error: ${err.message}`;
                statusEl.className = 'distance-status-badge outside';
            }
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,        // always fresh — no stale cached position
            timeout: 20000
        }
    );
}

function centerOnUser() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
    }

    const resetBtn = () => {
        if (locateMeBtn) {
            locateMeBtn.disabled = false;
            locateMeBtn.innerHTML = DOMPurify.sanitize(`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg> My Current Location`);
        }
    };

    if (locateMeBtn) {
        locateMeBtn.disabled = true;
        locateMeBtn.innerHTML = DOMPurify.sanitize(`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Locating…`);
    }

    // --- NATIVE BRIDGE CHECK ---
    // If running in the Workplace Monitor macOS app, use the native bridge
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.requestLocation) {
        console.log('[Location] Requesting location via Native Bridge...');
        window.webkit.messageHandlers.requestLocation.postMessage({});

        // Auto-reset if native doesn't respond in 10s
        setTimeout(resetBtn, 10000);
        return;
    }

    // Pass 1: Try High Accuracy (GPS)
    const geoOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 };

    const successCallback = (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        window._lastUserPos = { lat, lng, acc };

        console.log(`[Location] Locate-Me Success: ${lat.toFixed(6)}, ${lng.toFixed(6)} ±${Math.round(acc)}m`);

        if (locationMap) {
            if (userMarker) locationMap.removeLayer(userMarker);
            userMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'user-location-marker',
                    html: '<div class="user-dot-inner"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                })
            }).addTo(locationMap).bindPopup(`📍 You are here<br><small style="color:#999">${lat.toFixed(5)}, ${lng.toFixed(5)}</small>`);

            locationMap.setView([lat, lng], 16);
        }

        updateDistanceCard(lat, lng, acc);
        resetBtn();
    };

    const errorCallback = (err) => {
        console.warn(`[Location] Locate-Me Error (Code ${err.code}): ${err.message}`);

        if (err.code === err.PERMISSION_DENIED) {
            alert('Location access was denied. Please go to System Settings → Privacy & Security → Location Services and toggle ON for Workplace Monitor.');
            resetBtn();
            return;
        }

        // Pass 2 Fallback: If high accuracy fails/times out, try Standard accuracy (WiFi/Cell)
        if (geoOptions.enableHighAccuracy) {
            console.log('[Location] Retrying with Standard accuracy fallback...');
            geoOptions.enableHighAccuracy = false;
            geoOptions.timeout = 15000;
            navigator.geolocation.getCurrentPosition(successCallback, (err2) => {
                console.error('[Location] Standard accuracy fallback also failed:', err2.message);
                alert(`Could not get your location: ${err2.message}`);
                resetBtn();
            }, geoOptions);
        } else {
            alert(`Could not get your location: ${err.message}\n\nMake sure location access is granted in System Settings → Privacy & Security → Location Services.`);
            resetBtn();
        }
    };

    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, geoOptions);
}

// Global callback for native location bridge
window.onNativeLocation = (lat, lng, acc) => {
    window._lastUserPos = { lat, lng, acc };
    console.log(`[Location] Received Native Coordinates: ${lat}, ${lng} ±${Math.round(acc)}m (SetOffice: ${_isSettingOfficeLocation})`);

    // Check if this location update was specifically for setting the office
    if (_isSettingOfficeLocation) {
        // Construct a position object similar to the Geolocation API
        const pos = {
            coords: {
                latitude: lat,
                longitude: lng,
                accuracy: acc
            }
        };

        // Find the success callback logic from the setOfficeLocationBtn scope
        // Since we refactored, we need to handle the saving logic here or reuse the same logic
        saveOfficeLocation(pos);
    }

    if (locationMap) {
        if (userMarker) locationMap.removeLayer(userMarker);
        userMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'user-location-marker',
                html: '<div class="user-dot-inner"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(locationMap).bindPopup(`📍 You are here (Native GPS)<br><small style="color:#999">${lat.toFixed(5)}, ${lng.toFixed(5)}</small>`);

        locationMap.setView([lat, lng], 16);
    }

    updateDistanceCard(lat, lng, acc);

    // Reset the "Locate Me" button if it's currently in "Locating..." state
    if (locateMeBtn && locateMeBtn.innerText.includes('Locating')) {
        locateMeBtn.disabled = false;
        locateMeBtn.innerHTML = DOMPurify.sanitize(`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg> My Current Location`);
    }
};

async function saveOfficeLocation(position) {
    try {
        const { latitude, longitude } = position.coords;
        const radius = parseInt(officeRadiusSlider?.value) || 200;

        console.log(`[Location] Saving office location via bridge: ${latitude}, ${longitude}`);

        await fetch(`${API_BASE}/set-office-location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude, longitude, radius })
        });

        _isSettingOfficeLocation = false;
        resetLocationBtn();

        if (locationMap) loadLocationData();
        console.log('Office location successfully set via Native Bridge!');
    } catch (error) {
        console.error('[Location] Bridge save failed:', error);
        _isSettingOfficeLocation = false;
        resetLocationBtn();
    }
}

const mapTiles = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};

function initLocationView() {
    // Initialize map if not already done
    if (!locationMap) {
        locationMap = L.map('locationMap', {
            zoomControl: false,
            attributionControl: false
        }).setView([28.6, 77.2], 12);

        switchMapType('street');

        L.control.zoom({
            position: 'bottomright'
        }).addTo(locationMap);

        // Add Map Type Switcher Listeners
        document.querySelectorAll('.map-type-btn').forEach(btn => {
            btn.onclick = () => switchMapType(btn.dataset.type);
        });
    }

    // Fix tile rendering after view switch
    setTimeout(() => locationMap.invalidateSize(), 200);

    // Wire up "Locate Me" buttons
    if (locateMeBtn) locateMeBtn.onclick = centerOnUser;
    if (mapLocateMeBtn) mapLocateMeBtn.onclick = centerOnUser;

    // Load current settings and render
    loadLocationData();
}

async function loadLocationData() {
    console.log('[Location] Loading location data and requesting permission...');

    // Start live GPS tracking (single watchPosition, no race conditions)
    startLiveTracking();

    try {
        const res = await fetch(`${API_BASE}/settings`);
        const data = await res.json();

        const lat = parseFloat(data.officeLat);
        const lng = parseFloat(data.officeLng);
        const radius = parseInt(data.officeRadius) || 200;

        if (officeRadiusInput) officeRadiusInput.value = radius;
        updateRadiusUI(radius);

        if (!isNaN(lat) && !isNaN(lng) && data.officeLat !== '') {
            _currentOfficeLat = lat;
            _currentOfficeLng = lng;
            _currentOfficeRadius = radius;
            renderOfficeOnMap(lat, lng, radius);
            if (locationStatusBadge) {
                locationStatusBadge.textContent = 'Office Location Configured ✓';
                locationStatusBadge.className = 'status-badge status-active';
            }
            document.getElementById('locationAutoStatus').textContent = 'Live Monitoring Active';
            document.getElementById('locationAutoStatus').parentElement.classList.add('pulse-active');
            document.getElementById('locationAutoStatus').style.color = 'var(--secondary)';

            // Update distance card if user pos is already known
            if (window._lastUserPos) {
                updateDistanceCard(window._lastUserPos.lat, window._lastUserPos.lng);
            }
        } else {
            _currentOfficeLat = null;
            _currentOfficeLng = null;
            if (distanceCard) distanceCard.style.display = 'none';
            if (locationStatusBadge) {
                locationStatusBadge.textContent = 'Not Configured';
                locationStatusBadge.className = 'status-badge status-offline';
            }
            document.getElementById('locationAutoStatus').textContent = 'Monitoring Inactive';
            document.getElementById('locationAutoStatus').parentElement.classList.remove('pulse-active');
            document.getElementById('locationAutoStatus').style.color = '';

            // If office not configured and we have user pos, center on user
            if (window._lastUserPos) {
                locationMap.setView([window._lastUserPos.lat, window._lastUserPos.lng], 15);
            }
        }
    } catch (e) {
        console.error('Failed to load location data:', e);
    }
}

function renderOfficeOnMap(lat, lng, radius) {
    // Remove old markers
    if (officeMarker) locationMap.removeLayer(officeMarker);
    if (officeCircle) locationMap.removeLayer(officeCircle);
    if (officeOuterCircle) locationMap.removeLayer(officeOuterCircle);

    // Add office marker with premium pin and label
    const pinSVG = `
        <div class="office-marker-wrapper">
            <div class="marker-base-glow"></div>
            <svg class="marker-pin-svg" viewBox="0 0 24 24" fill="none">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="url(#pinGradient)"/>
                <circle cx="12" cy="10" r="3" fill="white"/>
                <defs>
                    <linearGradient id="pinGradient" x1="12" y1="3" x2="12" y2="23" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#a78bfa"/>
                        <stop offset="1" stop-color="#7c3aed"/>
                    </linearGradient>
                </defs>
            </svg>
        </div>
    `;

    officeMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'custom-office-marker',
            html: pinSVG,
            iconSize: [40, 40],
            iconAnchor: [20, 35]
        })
    }).addTo(locationMap);

    const popupContent = `
        <div class="premium-popup-inner">
            <span class="popup-title">WorkingHours Office</span>
            <span class="popup-address">Custom Location Set</span>
        </div>
    `;

    officeMarker.bindPopup(popupContent, {
        className: 'premium-popup',
        offset: [0, -30],
        closeButton: false
    }).openPopup();

    // Add geofence circle with high contrast and subtle inner fill
    officeCircle = L.circle([lat, lng], {
        color: '#a78bfa',
        fillColor: '#a78bfa',
        fillOpacity: 0.12,
        radius: radius,
        weight: 1,
        dashArray: '4 4'
    }).addTo(locationMap);

    // Add an outer border for that crisp edge in the mockup
    officeOuterCircle = L.circle([lat, lng], {
        color: '#a78bfa',
        fill: false,
        radius: radius,
        weight: 3,
        opacity: 0.4
    }).addTo(locationMap);

    // Fit map to the circle bounds
    locationMap.fitBounds(officeCircle.getBounds().pad(0.3));
}

function switchMapType(type) {
    if (!locationMap || !Object.hasOwn(mapTiles, type)) return;

    if (currentBaseLayer) {
        locationMap.removeLayer(currentBaseLayer);
    }

    currentBaseLayer = L.tileLayer((Object.hasOwn(mapTiles, type) ? Reflect.get(mapTiles, type) : Reflect.get(mapTiles, 'osm')), {
        maxZoom: type === 'satellite' ? 18 : 20,
        attribution: type === 'street' ? '&copy; OpenStreetMap' : ''
    }).addTo(locationMap);

    // Update UI
    document.querySelectorAll('.map-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });

    // Bring markers to front if needed
    if (officeCircle) officeCircle.bringToFront();
    if (officeMarker) officeMarker.bringToFront();
}

function updateRadiusUI(radius) {
    if (!radiusValDisplay || !officeRadiusSlider) return;

    radius = Math.max(100, Math.min(1000, parseInt(radius)));

    radiusValDisplay.textContent = radius;
    officeRadiusSlider.value = radius;
    if (officeRadiusInput) officeRadiusInput.value = radius;

    const displayLabel = document.getElementById('officeRadiusDisplay');
    if (displayLabel) displayLabel.textContent = radius + 'm';

    if (gaugeProgress) {
        const percent = (radius - 100) / 900;
        const dashOffset = 251.3 * (1 - percent);
        gaugeProgress.style.strokeDashoffset = dashOffset;
    }

    if (officeCircle) officeCircle.setRadius(radius);
    if (officeOuterCircle) officeOuterCircle.setRadius(radius);

    // Auto-save to server
    saveRadiusToServer(radius);
}

const saveRadiusToServer = debounce(async (radius) => {
    try {
        await fetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ officeRadius: radius })
        });
        console.log('Radius auto-saved:', radius);
    } catch (e) {
        console.error('Failed to auto-save radius:', e);
    }
}, 1000);

if (officeRadiusSlider) {
    officeRadiusSlider.oninput = (e) => {
        _currentOfficeRadius = parseInt(e.target.value);
        updateRadiusUI(e.target.value);
        // Refresh distance card with updated radius
        if (window._lastUserPos) {
            updateDistanceCard(window._lastUserPos.lat, window._lastUserPos.lng);
        }
    };
}

if (radiusDecrease) {
    radiusDecrease.onclick = () => {
        const val = parseInt(officeRadiusSlider.value) - 10;
        _currentOfficeRadius = val;
        updateRadiusUI(val);
        if (window._lastUserPos) updateDistanceCard(window._lastUserPos.lat, window._lastUserPos.lng);
    };
}

if (radiusIncrease) {
    radiusIncrease.onclick = () => {
        const val = parseInt(officeRadiusSlider.value) + 10;
        _currentOfficeRadius = val;
        updateRadiusUI(val);
        if (window._lastUserPos) updateDistanceCard(window._lastUserPos.lat, window._lastUserPos.lng);
    };
}

// Locate Me buttons


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

function formatWeekLabel(dateStr) {
    if (!dateStr) return '—';
    // Robust manual parsing of YYYY-MM-DD to avoid "Invalid Date" in some environments
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    try {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);

        const date = new Date(year, month, day);
        if (isNaN(date.getTime())) return dateStr;

        const options = { month: 'short', day: 'numeric' };
        const start = date.toLocaleDateString(undefined, options);

        const end = new Date(year, month, day + 6);
        const endStr = end.toLocaleDateString(undefined, options);

        return `${start} - ${endStr}`;
    } catch (e) {
        return dateStr;
    }
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

    if (forceSync) {
        // App was brought to foreground (e.g. from tray/widget)
        const monitorNav = document.querySelector('[data-view="monitor"]');
        if (monitorNav) monitorNav.click();
    }

    if (forceSync || (now - lastSyncRealTime >= syncInterval)) {
        try {
            const res = await fetch(`${API_BASE}/status`);
            const data = await res.json();


            // Check for smart break reminder
            checkPendingBreakReminder(data);

            // Store ground truth from server
            baseManualSeconds = data.manual.total_seconds || 0;
            baseAutoSeconds = data.automatic.total_seconds || 0;
            manualStatus = data.manual.status;
            autoStatus = data.automatic.status;

            // Updated rule: ensure project selector reflects active session's project
            let activeProjectId = null;
            if (manualStatus === 'active' || manualStatus === 'paused') {
                activeProjectId = data.manual.project_id;
            } else if (autoStatus === 'active' || autoStatus === 'paused') {
                activeProjectId = data.automatic.project_id;
            } else {
                // If idle, use the default project
                activeProjectId = defaultProjectId;
            }

            const projectSelect = document.getElementById('projectSelect');
            if (projectSelect) {
                const targetValue = (activeProjectId !== null && activeProjectId !== undefined) ? String(activeProjectId) : "";
                if (projectSelect.value !== targetValue) {
                    const exists = Array.from(projectSelect.options).some(o => o.value === targetValue);
                    if (exists) projectSelect.value = targetValue;
                }
            }

            // Critical: Align our local reference with the MOMENT of fetch completion
            lastSyncRealTime = Date.now();

            // Batch DOM updates
            requestAnimationFrame(() => {
                statusBadge.textContent = manualStatus;
                statusBadge.className = 'status-badge status-' + manualStatus;

                const arrivalTimeDisplay = document.getElementById('arrivalTimeDisplay');
                const arrivalTimeVal = document.getElementById('arrivalTimeVal');
                if (arrivalTimeDisplay && arrivalTimeVal && data.arrivalTime) {
                    const formatTimeVal = (timeStr) => {
                        if (!timeStr) return '--:--';
                        const timeOnly = timeStr.split(' ')[1] || timeStr;
                        const parts = timeOnly.split(':');
                        return `${parts[0].padStart(2, '0')}:${parts[1]}:${parts[2] || '00'}`;
                    };

                    arrivalTimeVal.textContent = formatTimeVal(data.arrivalTime);
                    arrivalTimeDisplay.style.display = 'block';
                } else if (arrivalTimeDisplay) {
                    arrivalTimeDisplay.style.display = 'none';
                }

                if (manualStatus === 'active') {
                    startBtn.disabled = true;
                    startBtn.classList.add('pulse');
                    startBtn.textContent = 'Session Active';
                    pauseBtn.style.display = '';

                    // Show Office Logo
                    document.getElementById('logoOffice').style.display = 'block';
                    document.getElementById('logoHome').style.display = 'none';

                    if (data.officeLat && data.officeLng) {
                        document.getElementById('aiIndicator').style.display = 'block';
                    } else {
                        document.getElementById('aiIndicator').style.display = 'none';
                    }

                } else if (manualStatus === 'paused') {
                    startBtn.disabled = false;
                    startBtn.classList.remove('pulse');
                    startBtn.textContent = 'Resume';
                    pauseBtn.style.display = 'none';

                    // Show Home Logo since workplace is not running
                    document.getElementById('logoOffice').style.display = 'none';
                    document.getElementById('logoHome').style.display = 'block';
                    document.getElementById('aiIndicator').style.display = 'none';

                } else {
                    startBtn.disabled = false;
                    startBtn.classList.remove('pulse');
                    startBtn.textContent = 'Start Session';
                    pauseBtn.style.display = 'none';

                    // Show Home Logo since workplace is not running
                    document.getElementById('logoOffice').style.display = 'none';
                    document.getElementById('logoHome').style.display = 'block';
                    document.getElementById('aiIndicator').style.display = 'none';
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
        // --- UI AUTOMATION: Toggle Hero Context ---
        const heroLabelText = domCache.heroLabelText || (domCache.heroLabelText = document.getElementById('heroLabelText'));
        const heroLabelIcon = domCache.heroLabelIcon || (domCache.heroLabelIcon = document.getElementById('heroLabelIcon'));

        let heroSeconds = displayManual;
        let isWorkplace = true;

        // If workplace (manual) is NOT active, but home (auto) IS active, show WFH in the hero card
        if (manualStatus !== 'active' && autoStatus === 'active') {
            heroSeconds = displayAuto;
            isWorkplace = false;
        }

        if (heroLabelText) {
            heroLabelText.textContent = isWorkplace ? 'Workplace Duration' : 'WFH Duration';
        }

        if (heroLabelIcon) {
            heroLabelIcon.innerHTML = isWorkplace
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>';
        }

        // Update the main timer display with the hero's time
        timerDisplay.textContent = formatTime(heroSeconds);

        // Goal progress is ALWAYS based on Workplace (manual) duration only
        const progress = Math.min((displayManual / goalSeconds) * 100, 100);
        progressBar.style.width = progress + '%';

        if (!domCache.progressPercent) {
            domCache.progressPercent = document.querySelector('.progress-percent');
        }
        if (domCache.progressPercent) {
            domCache.progressPercent.textContent = Math.floor(progress) + '%';
        }

        // Update goal ring (always workplace time)
        if (typeof updateGoalRing === 'function') updateGoalRing(displayManual);
    });
}


startBtn.onclick = async () => {
    const projectSelect = document.getElementById('projectSelect');
    const projectId = projectSelect ? (projectSelect.value || null) : null;
    await fetch(`${API_BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId ? parseInt(projectId) : null })
    });
    updateStatus(true);
};

// Add listener to project selector for real-time splitting when changed mid-session
document.getElementById('projectSelect').onchange = async (e) => {
    const projectId = e.target.value || null;

    // NEW: If any session is active/paused, split and update it
    if (manualStatus === 'active' || manualStatus === 'paused' ||
        autoStatus === 'active' || autoStatus === 'paused') {

        await fetch(`${API_BASE}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId ? parseInt(projectId) : null,
                // Tell server to check automatic too if no manual found
                include_automatic: true
            })
        });
        updateStatus(true);
    } else {
        // If system is IDLE, just tell the server to update the default project setting
        // This ensures the NEXT session starts with this project.
        await fetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defaultProjectId: projectId ? parseInt(projectId) : null })
        });
        defaultProjectId = projectId ? parseInt(projectId) : null;
        updateStatus(true);
    }
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
            // Automatically show the beautiful Daily AI Digest modal
            showAIDigestModal('today');
        }
    }
};

async function fetchReports() {
    try {
        if (currentTab === 'projects') {
            await renderProjectReport();
            return;
        }

        let url = `${API_BASE}/reports`;
        if (filterStartDate || filterEndDate) {
            const params = new URLSearchParams();
            if (filterStartDate) params.append('start', filterStartDate);
            if (filterEndDate) params.append('end', filterEndDate);
            url += `?${params.toString()}`;
        }

        const res = await fetch(url);
        reportsData = await res.json();
        renderActiveTab();
    } catch (e) {
        console.error("Failed to fetch reports", e);
    }
}

async function renderProjectReport() {
    const reportsList = document.getElementById('reportsList');
    if (!reportsList) return;

    reportsList.classList.remove('visits-grid');
    reportsList.classList.add('projects-grid');
    reportsList.innerHTML = DOMPurify.sanitize('<div class="chart-loading">Loading project stats...</div>');

    try {
        const res = await fetch(`${API_BASE}/project-reports`);
        const data = await res.json();
        const summary = data.summary || [];
        const history = data.history || [];

        const fragment = document.createDocumentFragment();

        // --- SUMMARY SECTION ---
        const summaryHeader = document.createElement('div');
        summaryHeader.className = 'report-item report-header';
        summaryHeader.style.marginTop = '0';
        summaryHeader.innerHTML = DOMPurify.sanitize(`
            <span>Project (Total)</span>
            <span>Total Time</span>
            <span>Sessions</span>
        `);
        fragment.appendChild(summaryHeader);

        if (summary.length > 0) {
            summary.forEach(item => {
                const row = document.createElement('div');
                row.className = 'report-item';
                row.innerHTML = DOMPurify.sanitize(`
                    <span style="display:flex; align-items:center; gap:8px;">
                        <span style="width:10px; height:10px; border-radius:50%; background:${item.color || 'var(--primary)'}"></span>
                        ${escapeHTML(item.name || 'No Project')}
                    </span>
                    <span style="font-weight:600; color:var(--primary)">${formatTime(item.total_seconds)}</span>
                    <span class="auto-total-dim">${item.session_count} total</span>
                `);
                fragment.appendChild(row);
            });
        }

        // --- MONTHLY SECTION ---
        const monthly = data.monthly || [];
        if (monthly.length > 0) {
            const monthlyHeader = document.createElement('div');
            monthlyHeader.className = 'report-item report-header';
            monthlyHeader.style.marginTop = '24px';
            monthlyHeader.innerHTML = DOMPurify.sanitize(`
                <span>Monthly Breakdown</span>
                <span>Time</span>
                <span>Month</span>
            `);
            fragment.appendChild(monthlyHeader);

            monthly.forEach(item => {
                const row = document.createElement('div');
                row.className = 'report-item';
                row.innerHTML = DOMPurify.sanitize(`
                    <span style="display:flex; align-items:center; gap:8px;">
                        <span style="width:10px; height:10px; border-radius:50%; background:${item.color || 'var(--primary)'}"></span>
                        ${escapeHTML(item.name || 'No Project')}
                    </span>
                    <span style="font-weight:600">${formatTime(item.total_seconds)}</span>
                    <span class="auto-total-dim">${escapeHTML(item.month)}</span>
                `);
                fragment.appendChild(row);
            });
        }

        // --- HISTORY SECTION ---
        const historyTitle = document.createElement('div');
        historyTitle.className = 'report-item report-header';
        historyTitle.style.marginTop = '24px';
        historyTitle.innerHTML = DOMPurify.sanitize(`
            <span>History (By Project)</span>
            <span>Duration</span>
            <span>Date</span>
        `);
        fragment.appendChild(historyTitle);

        if (history.length > 0) {
            history.forEach(item => {
                const row = document.createElement('div');
                row.className = 'report-item';
                row.innerHTML = DOMPurify.sanitize(`
                    <span style="display:flex; align-items:center; gap:8px;">
                        <span style="width:10px; height:10px; border-radius:50%; background:${item.project_color || '#555'}"></span>
                        ${escapeHTML(item.project_name || 'No Project')}
                    </span>
                    <span style="font-weight:600">${formatTime(item.total_seconds)}</span>
                    <span class="auto-total-dim">${escapeHTML(item.date)}</span>
                `);
                fragment.appendChild(row);
            });
        } else {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center; color:var(--text-dim); padding:40px;';
            empty.textContent = 'No project history recorded yet';
            fragment.appendChild(empty);
        }

        requestAnimationFrame(() => {
            reportsList.innerHTML = DOMPurify.sanitize('');
            reportsList.appendChild(fragment);
        });
    } catch (e) {
        reportsList.innerHTML = DOMPurify.sanitize('<div class="chart-loading">Error loading project report</div>');
    }
}

function renderActiveTab() {
    if (!reportsData) return;
    let data = reportsData[currentTab] || [];

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    // Add header
    const header = document.createElement('div');
    header.className = 'report-item report-header';

    if (currentTab === 'visits') {
        reportsList.classList.remove('projects-grid');
        reportsList.classList.add('visits-grid');
        header.innerHTML = DOMPurify.sanitize(`
            <span>Date</span>
            <span>In Time</span>
            <span>Out Time</span>
            <span>Office Span</span>
            <span>Workplace Duration</span>
            <span>Breaks</span>
        `);
    } else if (currentTab === 'timeline') {
        reportsList.classList.remove('projects-grid');
        reportsList.classList.remove('visits-grid');
        header.innerHTML = DOMPurify.sanitize(`
            <span>Date / Block</span>
            <span>Duration</span>
            <span>Type</span>
            <span>Details</span>
        `);
    } else {
        reportsList.classList.remove('projects-grid');
        reportsList.classList.remove('visits-grid');
        header.innerHTML = DOMPurify.sanitize(`
            <span>Period</span>
            <span>Workplace</span>
            <span>Day Total</span>
            <span>Breaks</span>
        `);
    }
    fragment.appendChild(header);

    if (data.length) {
        data.forEach(item => {
            const row = document.createElement('div');
            row.className = 'report-item';
            row.style.animation = 'fadeIn 0.3s ease-out';

            if (currentTab === 'visits') {
                const formatTimeVal = (timeStr) => {
                    if (!timeStr || timeStr === '—') return timeStr;
                    const parts = timeStr.split(':');
                    const h_24 = parseInt(parts[0]);
                    const m = parts[1];
                    const s = parts[2] || '00';

                    if (timeFormat === 'ampm') {
                        const ampm = h_24 >= 12 ? 'PM' : 'AM';
                        let h = h_24 % 12;
                        h = h ? h : 12;
                        return `${h}:${m} ${ampm}`;
                    }
                    return `${parts[0].padStart(2, '0')}:${m}:${s}`;
                };

                const safeExtractTime = (datetimeStr) => {
                    if (!datetimeStr) return '—';
                    const parts = datetimeStr.split(' ');
                    if (parts.length < 2) {
                        const tParts = datetimeStr.split('T');
                        if (tParts.length >= 2) {
                            return tParts[1].substring(0, 8);
                        }
                        return datetimeStr;
                    }
                    return parts[1].substring(0, 8);
                };

                const inTime = item.in_time ? formatTimeVal(safeExtractTime(item.in_time)) : '—';
                const outTime = item.out_time ? formatTimeVal(safeExtractTime(item.out_time)) : '—';
                row.innerHTML = DOMPurify.sanitize(`
                    <span>${escapeHTML(item.date)}</span>
                    <span style="color:var(--primary); font-weight:500;">${escapeHTML(inTime)}</span>
                    <span style="color:var(--accent); font-weight:500;">${escapeHTML(outTime)}</span>
                    <span style="color:var(--text-dim); font-style:italic;">${item.office_span > 0 ? formatTime(item.office_span) : '—'}</span>
                    <span class="auto-total-dim">${item.total_seconds > 0 ? formatTime(item.total_seconds) : '—'}</span>
                    <span>${item.break_count > 0 ? formatTime(item.break_duration) : '—'}</span>
                `);
            } else if (currentTab === 'timeline') {
                const dateHeader = document.createElement('div');
                dateHeader.className = 'report-item report-header';
                dateHeader.style.marginTop = '16px';
                dateHeader.style.background = 'rgba(255,255,255,0.05)';
                dateHeader.innerHTML = DOMPurify.sanitize(`<span style="grid-column: 1 / -1; text-align: center;">${escapeHTML(item.date)}</span>`);
                fragment.appendChild(dateHeader);

                item.blocks.forEach(b => {
                    const blockRow = document.createElement('div');
                    blockRow.className = 'report-item';
                    
                    const safeExtractTime = (datetimeStr) => {
                        if (!datetimeStr) return '—';
                        const d = new Date(datetimeStr.replace(' ', 'T') + 'Z');
                        if (isNaN(d.getTime())) return '—';
                        return d.toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit',
                            hour12: timeFormat === 'ampm' 
                        });
                    };
                    
                    const formatReason = (reason) => {
                        if (!reason) return '';
                        const map = {
                            'take_break': 'Took Break (UI)',
                            'lock_take_break': 'Took Break (UI)',
                            'lock_idle': 'System Idle',
                            'lock_system_idle': 'System Idle',
                            'lock_sleep': 'Computer Sleep',
                            'lock_screen_saver': 'Screen Saver',
                            'unlock_idle_return': 'Returned from Idle',
                            'unlock_unknown': 'System Unlock',
                            'lock_unknown': 'System Lock',
                            'lock_user_initiated': 'User Locked',
                        };
                        return map[reason] || reason.replace(/_/g, ' ');
                    };
                    
                    const startStr = safeExtractTime(b.start);
                    const endStr = safeExtractTime(b.end);
                    
                    const t1 = b.start ? new Date(b.start.replace(' ', 'T') + 'Z').getTime() : 0;
                    const t2 = b.end ? new Date(b.end.replace(' ', 'T') + 'Z').getTime() : 0;
                    const durationSec = Math.floor((t2 - t1) / 1000);
                    const durFormat = durationSec > 0 ? formatTime(durationSec) : '00:00:00';
                    
                    const typeColor = b.type === 'working' ? 'var(--primary)' : 'var(--accent)';
                    const typeLabel = b.type === 'working' ? '🟢 Working' : '☕ Break';
                    
                    let details = b.session_type + ' session #' + b.session_id;
                    if (b.type === 'break') {
                        const r1 = formatReason(b.reason);
                        const r2 = formatReason(b.end_reason);
                        if (r1 && r2) details += ` (${r1} → ${r2})`;
                        else if (r1 || r2) details += ` (${r1 || r2})`;
                        else if (b.reason) details += ` (${b.reason})`;
                    }
                    
                    blockRow.innerHTML = DOMPurify.sanitize(`
                        <span>${startStr} - ${endStr}</span>
                        <span>${durFormat}</span>
                        <span style="color:${typeColor}; font-weight:500;">${typeLabel}</span>
                        <span class="auto-total-dim">${escapeHTML(details)}</span>
                    `);
                    fragment.appendChild(blockRow);
                });
                return;
            } else {
                let label = item.date || item.week || item.month;
                if (currentTab === 'weekly' && item.week) {
                    label = formatWeekLabel(item.week);
                }

                row.innerHTML = DOMPurify.sanitize(`
                    <span>${escapeHTML(label)}</span>
                    <span>${item.manual_total > 0 ? formatTime(item.manual_total) : '—'}</span>
                    <span class="auto-total-dim">${item.auto_total > 0 ? formatTime(item.auto_total) : '—'}</span>
                    <span>${item.break_count > 0 ? formatTime(item.break_duration) : '—'}</span>
                `);
            }
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
        reportsList.innerHTML = DOMPurify.sanitize('');
        reportsList.appendChild(fragment);
    });
}

tabButtons.forEach(btn => {
    btn.onclick = () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;

        // Show/hide time format toggle
        if (timeFormatToggle) {
            timeFormatToggle.style.display = currentTab === 'visits' ? 'block' : 'none';
        }

        fetchReports();
    };
});

const timeFormatToggle = document.getElementById('timeFormatToggle');
if (timeFormatToggle) {
    timeFormatToggle.style.display = currentTab === 'visits' ? 'block' : 'none';
    timeFormatToggle.textContent = `Format: ${timeFormat.toUpperCase()}`;
    timeFormatToggle.onclick = () => {
        timeFormat = timeFormat === '24h' ? 'ampm' : '24h';
        localStorage.setItem('timeFormat', timeFormat);
        timeFormatToggle.textContent = `Format: ${timeFormat.toUpperCase()}`;
        if (currentTab === 'visits') renderActiveTab();
    };
}

document.getElementById('exportCsvBtn').onclick = async () => {
    console.log("CSV Export: Button clicked!");
    try {
        let url = `${API_BASE}/export-csv?tab=${currentTab}&timeFormat=${timeFormat}`;
        if (filterStartDate) url += `&start=${filterStartDate}`;
        if (filterEndDate) url += `&end=${filterEndDate}`;

        console.log("CSV Export: Fetching from url:", url);
        const res = await fetch(url);
        console.log("CSV Export: Fetch status:", res.status);
        if (!res.ok) throw new Error("Failed to export report. Status: " + res.status);
        const text = await res.text();
        console.log("CSV Export: Fetched text length:", text.length);

        // Check if running inside our macOS native WebView shell with download bridge
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.downloadFile) {
            console.log("CSV Export: Detected native bridge 'downloadFile'. Posting message.");
            window.webkit.messageHandlers.downloadFile.postMessage({
                filename: `${currentTab}_report.csv`,
                content: text
            });
        } else {
            console.log("CSV Export: Native bridge not found, running standard web browser download fallback.");
            // Standard web browser download fallback
            const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
            const blobUrl = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${currentTab}_report.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            console.log("CSV Export: Fallback trigger complete.");
        }
    } catch (e) {
        console.error("CSV Export Error:", e);
        alert("Failed to export report. Please check if the server is running.");
    }
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
                label: dayNames.at(d.getDay()),
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
            const topVal = d.manual + d.auto;
            const topCls = ''; // No specific color for the sum
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

        container.innerHTML = DOMPurify.sanitize(`
            <div class="chart-bars-area">
                <div class="chart-goal-line" style="bottom: ${goalPct}%"></div>
                <div class="chart-cols-row">${colsHTML}</div>
            </div>
            <div class="chart-day-labels-row">${labelsHTML}</div>
        `);
    } catch (e) {
        container.innerHTML = DOMPurify.sanitize('<div class="chart-loading">Unable to load</div>');
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

    globalTooltip.innerHTML = DOMPurify.sanitize(`
        <div class="tooltip-title">${label}</div>
        <div style="display:flex; justify-content:space-between; gap:16px;">
            <span style="color:var(--text-dim)">Workplace</span>
            <span class="tooltip-value">${formatHM(manual)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; gap:16px;">
            <span style="color:var(--text-dim)">Day Hours</span>
            <span class="tooltip-value">${formatHM(auto)}</span>
        </div>
    `);

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

    globalTooltip.innerHTML = DOMPurify.sanitize(`
        <div class="tooltip-title">${appName}</div>
        <div style="display:flex; justify-content:space-between; gap:16px;">
            <span style="color:var(--text-dim)">Time Spent</span>
            <span class="tooltip-value" style="color:#3b82f6">${formatHM(seconds)}</span>
        </div>
    `);

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
    pctEl.textContent = Math.floor(pct * 100) + '%';

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
            container.innerHTML = DOMPurify.sanitize('<div class="timeline-empty">No activity recorded today</div>');
            return;
        }

        container.innerHTML = events.map(ev => {
            const ts = ev.timestamp || '';
            let timeStr = '';
            try {
                const d = new Date(ts.replace(' ', 'T') + 'Z');
                timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            } catch (e) { timeStr = ts; }

            let label = 'Screen Locked';
            let dotClass = 'lock';
            const type = ev.event_type || '';

            if (type.startsWith('unlock')) {
                label = 'Screen Unlocked';
                dotClass = 'unlock';
                if (type === 'unlock_idle') {
                    label = 'Screen Unlocked (Returned from Idle)';
                }
            } else if (type.startsWith('lock')) {
                label = 'Screen Locked';
                dotClass = 'lock';
                if (type === 'lock_idle') {
                    label = 'Away (System Idle)';
                } else if (type === 'lock_take_break') {
                    label = 'Took a Wellness Break';
                    dotClass = 'wellness';
                } else if (type === 'lock_user_initiated') {
                    label = 'Screen Locked (Manual)';
                } else if (type === 'lock_session_resign') {
                    label = 'System Sleep';
                }
            } else if (type.startsWith('idle_respond')) {
                dotClass = 'wellness';
                if (type.includes('coffee')) {
                    label = 'Coffee / Personal Break ☕';
                } else if (type.includes('meeting')) {
                    label = 'Collaboration / Meeting 👥';
                } else if (type.includes('designing')) {
                    label = 'Off-screen Work / Designing 📝';
                } else {
                    label = 'Responded to Idle Prompt';
                }
            }

            return `
                <div class="timeline-item">
                    <div class="timeline-dot ${dotClass}"></div>
                    <span class="timeline-time">${timeStr}</span>
                    <span class="timeline-event">${label}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = DOMPurify.sanitize('<div class="timeline-empty">Unable to load events</div>');
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
            container.innerHTML = DOMPurify.sanitize('<div class="app-usage-empty">No app usage recorded today</div>');
            return;
        }

        const maxSeconds = usage[0].total_seconds || 1;
        const colorClasses = ['app-bar-1', 'app-bar-2', 'app-bar-3', 'app-bar-4', 'app-bar-5'];

        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();
        usage.slice(0, 10).forEach((app, i) => {
            const pct = Math.max((app.total_seconds / maxSeconds) * 100, 3);
            const color = i < colorClasses.length ? colorClasses.at(i) : 'app-bar-default';

            const row = document.createElement('div');
            row.className = 'app-row';
            row.innerHTML = DOMPurify.sanitize(`
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
            `);
            fragment.appendChild(row);
        });

        requestAnimationFrame(() => {
            container.innerHTML = DOMPurify.sanitize('');
            container.appendChild(fragment);
        });
    } catch (e) {
        container.innerHTML = DOMPurify.sanitize('<div class="app-usage-empty">Unable to load app usage</div>');
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
            container.innerHTML = DOMPurify.sanitize('<div class="category-empty">No app usage recorded today</div>');
            return;
        }

        const total = cats.reduce((sum, c) => sum + c.seconds, 0) || 1;
        const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#f97316', '#84cc16', '#d946ef'];

        // Find the top category for the center display
        const topCat = cats.reduce((max, cat) => cat.seconds > max.seconds ? cat : max, cats[0]);
        const topPct = (topCat.seconds / total * 100).toFixed(1);
        const topIndex = cats.indexOf(topCat);
        const topColor = colors.at(topIndex % colors.length);

        // Build SVG pie chart using conic segments via circle stroke-dasharray
        const radius = 70;
        const circumference = 2 * Math.PI * radius;
        let offset = 0;
        const slices = cats.map((cat, i) => {
            const pct = cat.seconds / total;
            const dashLen = pct * circumference;
            const color = colors.at(i % colors.length);
            const slice = `<circle cx="90" cy="90" r="${radius}" fill="none" stroke="${color}" stroke-width="25"
                stroke-dasharray="${dashLen} ${circumference - dashLen}" stroke-dashoffset="${-offset}"
                style="transition: stroke-dashoffset 0.5s ease; cursor: pointer; pointer-events: stroke;"
                onmouseenter="showAppTooltip(event, '${escapeHTML(cat.name)}', ${cat.seconds})"
                onmouseleave="hideColTooltip()"/>`;
            offset += dashLen;
            return slice;
        });

        const pieSvg = `
            <div class="donut-chart-container">
                <svg class="pie-svg" viewBox="0 0 180 180">${slices.join('')}</svg>
                <div class="donut-center-content">
                    <div class="donut-center-pct">${topPct}%</div>
                    <div class="donut-center-label" style="color: ${topColor}">${escapeHTML(topCat.name).toUpperCase()}</div>
                </div>
            </div>
        `;

        const legend = cats.map((cat, i) => {
            const color = colors.at(i % colors.length);
            return `
                <div class="category-item">
                    <div class="category-pill" style="background:${color}"></div>
                    <span class="category-name">${escapeHTML(cat.name)}</span>
                    <span class="category-time">${formatHM(cat.seconds)}</span>
                </div>
            `;
        }).join('');

        container.innerHTML = pieSvg + `<div class="category-legend">${legend}</div>`;
    } catch (e) {
        container.innerHTML = DOMPurify.sanitize('<div class="category-empty">Unable to load categories</div>');
    }
}

async function loadDashboardCharts() {
    renderWeeklyChart();
    renderStatsChart(currentStatsRange);
    renderAppUsage();
    renderCategoryChart();
    renderAppTimelineChart();
    renderActivityTimeline();
}

let appTimelineChartInstance = null;
async function renderAppTimelineChart() {
    const canvas = document.getElementById('appTimelineChart');
    if (!canvas) return;

    try {
        const timeRes = await fetch(`${API_BASE}/app-timeline`);
        const timeData = await timeRes.json();

        const topApps = timeData.topApps || [];
        const timeline = timeData.timeline || {};

        const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#f97316', '#84cc16', '#d946ef'];
        const appColorMap = {};
        topApps.forEach((appName, i) => {
            appColorMap[appName] = colors[i % colors.length];
        });

        const hoursWithData = Object.keys(timeline).map(Number).sort((a, b) => a - b);
        const currentHour = new Date().getHours();
        
        // Start from the first hour of activity, or default to 8am. Don't start later than current hour.
        let minHour = hoursWithData.length > 0 ? hoursWithData[0] : 8;
        minHour = Math.min(minHour, currentHour);
        
        // Ensure we always show at least 4 hours of context
        if (currentHour - minHour < 4) {
            minHour = Math.max(0, currentHour - 4);
        }

        const labels = [];
        for (let h = minHour; h <= currentHour; h++) {
            const ampm = h >= 12 ? 'p' : 'a';
            const hour12 = h % 12 || 12;
            labels.push(`${hour12}${ampm}`);
        }

        const datasets = [];
        topApps.forEach(appName => {
            const data = [];
            for (let h = minHour; h <= currentHour; h++) {
                const hourData = timeline[h] || {};
                const val = hourData[appName] || 0;
                data.push(val / 60); // display in minutes
            }
            datasets.push({
                label: appName,
                data: data,
                borderColor: appColorMap[appName],
                backgroundColor: appColorMap[appName] + '20', // transparent fill
                fill: true,
                borderWidth: 2,
                tension: 0.4,
                cubicInterpolationMode: 'monotone',
                pointRadius: 0,
                pointHoverRadius: 4
            });
        });

        if (appTimelineChartInstance) {
            appTimelineChartInstance.destroy();
        }

        appTimelineChartInstance = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) {
                                    label += Math.round(context.parsed.y) + ' mins';
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: 'var(--text-muted)' }
                    },
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { 
                            color: 'var(--text-muted)', 
                            maxTicksLimit: 12,
                            maxRotation: 0,
                            minRotation: 0
                        }
                    }
                }
            }
        });
    } catch (e) {
        console.error('Error rendering category timeline', e);
    }
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

        // Sync default project
        if (data.defaultProjectId) {
            defaultProjectId = String(data.defaultProjectId);
        }

        // Refresh project list to reflect default
        loadProjects();
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

// Global reference for loop management
let _mainUpdateInterval = null;

// Throttled update loop (1s resolution is plenty for a dashboard timer)
function startMainLoop() {
    if (_mainUpdateInterval) return;

    console.log('[App] Starting main update loop (1s interval)');
    _mainUpdateInterval = setInterval(() => {
        updateStatus(false);
    }, 1000);
}

function stopMainLoop() {
    if (_mainUpdateInterval) {
        console.log('[App] Stopping main update loop (power saving)');
        clearInterval(_mainUpdateInterval);
        _mainUpdateInterval = null;
    }
}

// Initial start
startMainLoop();

// --- POWER SAVING: Page Visibility API ---
// This stops all UI updates and heartbeats when the window is minimized or hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopMainLoop();
        document.body.classList.add('animations-paused'); // Pause orb CSS animations
    } else {
        startMainLoop();
        document.body.classList.remove('animations-paused'); // Resume orb CSS animations
        updateStatus(true); // Force sync when coming back to dashboard
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopMainLoop();
});

// --- NEW STATS CHART LOGIC ---


document.querySelectorAll('.stats-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.stats-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentStatsRange = parseInt(e.target.dataset.range);
        renderStatsChart(currentStatsRange);
    });
});

async function renderStatsChart(rangeDays) {
    try {
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
        const days = [];
        const today = new Date();
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // Build the days array for the selected range
        for (let i = rangeDays - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const found = daily.find(r => r.date === dateStr);
            days.push({
                dateObj: d,
                label: dayNames.at(d.getDay()),
                num: d.getDate(),
                manual: found ? found.manual_total : 0,
                auto: found ? found.auto_total : 0,
                isToday: i === 0
            });
        }

        // 1. Populate Date Scroller
        const scroller = document.getElementById('statsDateScroller');
        if (scroller) {
            scroller.innerHTML = days.map(d => `
                <div class="date-capsule ${d.isToday ? 'active' : ''}">
                    <span class="date-num">${d.num < 10 ? '0' + d.num : d.num}</span>
                    <span class="date-day">${d.label}</span>
                </div>
            `).join('');

            setTimeout(() => {
                scroller.scrollLeft = scroller.scrollWidth;
            }, 10);
        }

        // 2. Draw SVG Spline Chart
        const svgW = 800;
        const svgH = 250;
        const padX = 40;
        const padYTop = 20;
        const padYBot = 40;

        // Find max seconds to dynamically scale Y-Axis
        let maxSecsInWindow = Math.max(...days.map(d => Math.max(d.manual, d.auto)), 4 * 3600);
        let maxHrs = Math.ceil(maxSecsInWindow / 3600);
        if (maxHrs < 4) maxHrs = 4;
        const maxSecs = maxHrs * 3600;

        const drawH = svgH - padYTop - padYBot;
        const drawW = svgW - padX * 2;

        const stepX = days.length > 1 ? drawW / (days.length - 1) : 0;

        let manualPoints = [];
        let autoPoints = [];

        days.forEach((d, i) => {
            const x = padX + i * stepX;
            const mSecs = Math.min(d.manual, maxSecs);
            const aSecs = Math.min(d.auto, maxSecs);

            const mY = (padYTop + drawH) - ((mSecs / maxSecs) * drawH);
            const aY = (padYTop + drawH) - ((aSecs / maxSecs) * drawH);

            manualPoints.push({ x, y: mY });
            autoPoints.push({ x, y: aY });
        });

        // Catmull-Rom to Cubic Bezier spline algorithm
        function getPathData(pts) {
            if (pts.length === 0) return '';
            if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
            let d = `M ${pts[0].x},${pts[0].y}`;
            for (let i = 0; i < pts.length - 1; i++) {
                const tension = 0.2;
                const p0 = i === 0 ? pts.at(0) : pts.at(i - 1);
                const p1 = pts.at(i);
                const p2 = pts.at(i + 1);
                const p3 = i + 2 < pts.length ? pts.at(i + 2) : p2;

                const cp1x = p1.x + (p2.x - p0.x) * tension;
                const cp1y = p1.y + (p2.y - p0.y) * tension;
                const cp2x = p2.x - (p3.x - p1.x) * tension;
                const cp2y = p2.y - (p3.y - p1.y) * tension;

                d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
            }
            return d;
        }

        const solidPath = document.getElementById('splineSolidPath');
        if (solidPath) solidPath.setAttribute('d', getPathData(manualPoints));

        const dashedPath = document.getElementById('splineDashedPath');
        if (dashedPath) dashedPath.setAttribute('d', getPathData(autoPoints));

        const gradPath = document.getElementById('splineGradientPath');
        if (gradPath && manualPoints.length > 0) {
            const pathD = getPathData(manualPoints);
            const gradD = pathD + ` L ${manualPoints.at(-1).x},${padYTop + drawH} L ${manualPoints.at(0).x},${padYTop + drawH} Z`;
            gradPath.setAttribute('d', gradD);
        }

        const xAxisGrp = document.getElementById('splineXAxis');
        if (xAxisGrp) {
            xAxisGrp.innerHTML = days.map((d, i) => {
                const x = padX + i * stepX;
                const showLabel = days.length <= 7 || (i % Math.ceil(days.length / 7) === 0) || i === days.length - 1;
                if (!showLabel) return '';
                return `
                    <circle cx="${x}" cy="${padYTop + drawH}" r="3" fill="var(--border)" />
                    <text x="${x}" y="${padYTop + drawH + 20}" class="chart-label p-center">${d.num} ${d.label.substring(0, 1)}</text>
                `;
            }).join('');
        }

        const yAxisGrp = document.getElementById('splineYAxis');
        if (yAxisGrp) {
            let yLabelsHtml = '';
            // Generate dynamic labels based on maxHrs
            for (let i = maxHrs; i > 0; i -= Math.max(1, Math.floor(maxHrs / 4))) {
                const yPos = (padYTop + drawH) - ((i / maxHrs) * drawH);
                yLabelsHtml += `
                    <line x1="${padX}" y1="${yPos}" x2="${svgW}" y2="${yPos}" class="chart-grid-line" />
                    <text x="${padX - 10}" y="${yPos + 4}" class="chart-label p-right">${i}h</text>
                `;
            }
            yAxisGrp.innerHTML = yLabelsHtml;
        }

    } catch (e) {
        console.error('Failed to render stats chart', e);
    }
}


// ===== PROJECT MANAGEMENT =====
async function loadProjects() {
    try {
        const res = await fetch(`${API_BASE}/projects`);
        const data = await res.json();
        const projectSelect = document.getElementById('projectSelect');
        if (projectSelect) {
            const currentVal = projectSelect.value;
            projectSelect.innerHTML = DOMPurify.sanitize('<option value="">— No Project —</option>');
            (data.projects || []).forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                opt.style.color = p.color;
                projectSelect.appendChild(opt);
            });

            // If manual session is active, it will be set by updateStatus
            // If idle, set to default
            if (manualStatus === 'idle' && autoStatus === 'idle') {
                if (defaultProjectId) projectSelect.value = defaultProjectId;
                else projectSelect.value = "";
            } else if (currentVal) {
                projectSelect.value = currentVal;
            }
        }
        renderProjectsList(data.projects || []);
    } catch (e) {
        console.error('Failed to load projects:', e);
    }
}

function renderProjectsList(projects) {
    const list = document.getElementById('projectsList');
    if (!list) return;
    if (projects.length === 0) {
        list.innerHTML = DOMPurify.sanitize('<div class="category-mappings-empty">No projects yet. Add one above to start tracking by project.</div>');
        return;
    }
    list.innerHTML = projects.map(p => {
        const isDefault = String(p.id) === String(defaultProjectId);
        return `
            <div class="category-mapping-item">
                <div class="category-mapping-info">
                    <span class="project-color-dot" style="background: ${escapeHTML(p.color)};"></span>
                    <span class="category-mapping-app">${escapeHTML(p.name)}</span>
                    ${isDefault ? '<span class="default-project-badge">Default</span>' : ''}
                </div>
                <div style="display: flex; align-items: center;">
                    ${!isDefault ? `<button class="set-default-btn" data-project-id="${p.id}">Set Default</button>` : ''}
                    <button class="category-mapping-remove" data-project-id="${p.id}" title="Delete Project">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Set Default Handlers
    list.querySelectorAll('.set-default-btn').forEach(btn => {
        btn.onclick = async () => {
            const id = btn.dataset.projectId;
            try {
                // 1. Save setting
                await fetch(`${API_BASE}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ defaultProjectId: parseInt(id) })
                });
                defaultProjectId = id;

                // 2. If any session is active, split/update it to the new project immediately
                if (manualStatus === 'active' || manualStatus === 'paused' ||
                    autoStatus === 'active' || autoStatus === 'paused') {
                    await fetch(`${API_BASE}/start`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            project_id: parseInt(id),
                            include_automatic: true
                        })
                    });
                }

                loadProjects(); // Refresh UI
                updateStatus(true); // Sync dashboard
            } catch (e) {
                console.error('Failed to set default project:', e);
                alert('Failed to set default project.');
            }
        };
    });

    list.querySelectorAll('.category-mapping-remove').forEach(btn => {
        btn.onclick = async () => {
            const id = btn.dataset.projectId;
            if (!confirm('Delete this project? Time logged to it will become unassigned.')) return;
            try {
                await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
                // If deleted project was the default, clear it
                if (String(id) === String(defaultProjectId)) {
                    await fetch(`${API_BASE}/settings`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ defaultProjectId: null })
                    });
                    defaultProjectId = null;
                }
                loadProjects();
            } catch (e) { alert('Failed to delete project.'); }
        };
    });
}

const addProjectBtn = document.getElementById('addProjectBtn');
if (addProjectBtn) {
    addProjectBtn.onclick = async () => {
        const nameInput = document.getElementById('projectNameInput');
        const colorInput = document.getElementById('projectColorInput');
        const name = nameInput ? nameInput.value.trim() : '';
        const color = colorInput ? colorInput.value : '#8b5cf6';
        if (!name) { alert('Please enter a project name'); return; }
        try {
            const res = await fetch(`${API_BASE}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, color })
            });
            const data = await res.json();
            if (!res.ok) { alert(data.error || 'Failed to create project'); return; }
            if (nameInput) nameInput.value = '';
            loadProjects();
        } catch (e) { alert('Failed to create project.'); }
    };
}

const projectNameInput = document.getElementById('projectNameInput');
if (projectNameInput) {
    projectNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addProjectBtn.click(); }
    });
}

function initReportFilters() {
    const toggleBtn = document.getElementById('toggleFilterBtn');
    const closeBtn = document.getElementById('closeFilterBtn');
    const popup = document.getElementById('filterPopup');
    const activeDot = document.getElementById('filterActiveDot');

    const applyBtn = document.getElementById('applyFiltersBtn');
    const resetBtn = document.getElementById('resetFiltersBtn');
    const startInp = document.getElementById('filterStartDate');
    const endInp = document.getElementById('filterEndDate');
    const presets = document.querySelectorAll('.preset-btn');

    // Force reset on fresh load to prevent browser input persistence
    if (startInp) startInp.value = '';
    if (endInp) endInp.value = '';
    filterStartDate = null;
    filterEndDate = null;
    if (activeDot) activeDot.style.display = 'none';

    if (toggleBtn) {
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = popup.style.display === 'none';
            popup.style.display = isHidden ? 'flex' : 'none';
        };
    }

    if (closeBtn) {
        closeBtn.onclick = () => popup.style.display = 'none';
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (popup && !popup.contains(e.target) && e.target !== toggleBtn) {
            popup.style.display = 'none';
        }
    });

    if (applyBtn) {
        applyBtn.onclick = () => {
            filterStartDate = startInp.value || null;
            filterEndDate = endInp.value || null;
            presets.forEach(b => b.classList.remove('active'));
            if (activeDot) activeDot.style.display = (filterStartDate || filterEndDate) ? 'block' : 'none';
            popup.style.display = 'none';
            fetchReports();
        };
    }

    if (resetBtn) {
        resetBtn.onclick = () => {
            filterStartDate = null;
            filterEndDate = null;
            if (startInp) startInp.value = '';
            if (endInp) endInp.value = '';
            presets.forEach(b => b.classList.remove('active'));
            if (activeDot) activeDot.style.display = 'none';
            popup.style.display = 'none';
            fetchReports();
        };
    }

    presets.forEach(btn => {
        btn.onclick = () => {
            const range = btn.dataset.range;
            presets.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const now = new Date();
            let start = new Date();
            let end = new Date();

            if (range === '7') {
                start.setDate(now.getDate() - 7);
            } else if (range === '30') {
                start.setDate(now.getDate() - 30);
            } else if (range === 'this-month') {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
            }

            filterStartDate = start.toISOString().split('T')[0];
            filterEndDate = end.toISOString().split('T')[0];
            if (startInp) startInp.value = filterStartDate;
            if (endInp) endInp.value = filterEndDate;

            if (activeDot) activeDot.style.display = 'block';
            popup.style.display = 'none';
            fetchReports();
        };
    });
}

// Initializations
loadProjects();
initReportFilters();
initAIDigest();

// ===== CLOUD SYNC SETTINGS =====
let _cloudSyncEnabled = false;

async function loadCloudSettings() {
    try {
        const res = await fetch(`${API_BASE}/cloud-settings`);
        const data = await res.json();
        const urlInput = document.getElementById('cloudSyncUrl');
        const keyInput = document.getElementById('cloudApiKey');
        if (urlInput) urlInput.value = data.cloudSyncUrl || '';
        if (keyInput && data.cloudApiKey) keyInput.placeholder = data.cloudApiKey;
        _cloudSyncEnabled = data.cloudSyncEnabled;
        updateSyncToggleUI(data.cloudSyncEnabled);
        loadSyncStatus();
    } catch (e) { console.error('Failed to load cloud settings:', e); }
}

function updateSyncToggleUI(enabled) {
    const onBtn = document.getElementById('syncOnBtn');
    const offBtn = document.getElementById('syncOffBtn');
    if (onBtn) onBtn.classList.toggle('active', enabled);
    if (offBtn) offBtn.classList.toggle('active', !enabled);
}

async function loadSyncStatus() {
    try {
        const res = await fetch(`${API_BASE}/sync-status`);
        const data = await res.json();
        const statusEl = document.getElementById('syncStatusText');
        if (!statusEl) return;
        if (!data.enabled) {
            statusEl.textContent = 'Sync status: Disabled';
        } else if (data.lastResult) {
            statusEl.textContent = `Last sync: ${data.lastResult.status === 'ok' ? '✅' : '❌'} ${data.lastResult.message} (${new Date(data.lastResult.time).toLocaleTimeString()})`;
        } else {
            statusEl.textContent = 'Sync status: Enabled, waiting for first sync...';
        }
    } catch (e) { /* ignore */ }
}

const syncOnBtn = document.getElementById('syncOnBtn');
const syncOffBtn = document.getElementById('syncOffBtn');
if (syncOnBtn) syncOnBtn.onclick = () => { _cloudSyncEnabled = true; updateSyncToggleUI(true); };
if (syncOffBtn) syncOffBtn.onclick = () => { _cloudSyncEnabled = false; updateSyncToggleUI(false); };

const saveCloudBtn = document.getElementById('saveCloudSettings');
if (saveCloudBtn) {
    saveCloudBtn.onclick = async () => {
        const url = document.getElementById('cloudSyncUrl')?.value || '';
        const key = document.getElementById('cloudApiKey')?.value || '';
        const body = { cloudSyncUrl: url, cloudSyncEnabled: _cloudSyncEnabled };
        if (key && key !== '••••••••') body.cloudApiKey = key;
        try {
            await fetch(`${API_BASE}/cloud-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            alert('Cloud sync settings saved!');
            loadSyncStatus();
        } catch (e) { alert('Failed to save cloud settings.'); }
    };
}

const triggerSyncBtn = document.getElementById('triggerSyncNow');
if (triggerSyncBtn) {
    triggerSyncBtn.onclick = async () => {
        triggerSyncBtn.disabled = true;
        triggerSyncBtn.textContent = 'Syncing...';
        try {
            await fetch(`${API_BASE}/sync-now`, { method: 'POST' });
            loadSyncStatus();
        } catch (e) { alert('Sync failed.'); }
        triggerSyncBtn.disabled = false;
        triggerSyncBtn.textContent = 'Sync Now';
    };
}

// Load cloud settings when settings page loads
const _origLoadSettings = loadSettings;
loadSettings = async function () {
    await _origLoadSettings();
    loadCloudSettings();
};

// --- AI Digest Frontend Logic ---
let aiDigestData = null;
let currentDigestTab = 'today';

async function initAIDigest() {
    // 1. Inject the floating trigger capsule on the Dashboard greeting row
    const monitorView = document.getElementById('monitorView');
    if (monitorView) {
        const titleRow = monitorView.querySelector('.view-title');
        if (titleRow && !document.getElementById('aiDigestTriggerBtn')) {
            const triggerBtn = document.createElement('div');
            triggerBtn.id = 'aiDigestTriggerBtn';
            triggerBtn.className = 'ai-digest-trigger-capsule';
            triggerBtn.innerHTML = DOMPurify.sanitize(`
                <div class="ai-pulse-dot"></div>
                <span>AI Digest</span>
            `);
            triggerBtn.onclick = () => showAIDigestModal();
            titleRow.appendChild(triggerBtn);
        }
    }

    // 2. Bind DOM Events
    const closeBtn = document.getElementById('closeDigestBtn');
    const backdrop = document.getElementById('aiDigestBackdrop');
    const confirmBtn = document.getElementById('digestConfirmBtn');
    const toggleToday = document.getElementById('digestToggleToday');
    const toggleWeek = document.getElementById('digestToggleWeek');

    if (closeBtn) closeBtn.onclick = hideAIDigestModal;
    if (backdrop) backdrop.onclick = hideAIDigestModal;
    if (confirmBtn) confirmBtn.onclick = hideAIDigestModal;

    if (toggleToday) {
        toggleToday.onclick = () => {
            if (currentDigestTab === 'today') return;
            currentDigestTab = 'today';
            toggleToday.classList.add('active');
            if (toggleWeek) toggleWeek.classList.remove('active');
            renderAIDigestUI();
        };
    }

    if (toggleWeek) {
        toggleWeek.onclick = () => {
            if (currentDigestTab === 'week') return;
            currentDigestTab = 'week';
            toggleWeek.classList.add('active');
            if (toggleToday) toggleToday.classList.remove('active');
            renderAIDigestUI();
        };
    }
}

async function showAIDigestModal(defaultTab = 'today') {
    const modal = document.getElementById('aiDigestModal');
    if (!modal) return;

    currentDigestTab = defaultTab;
    const toggleToday = document.getElementById('digestToggleToday');
    const toggleWeek = document.getElementById('digestToggleWeek');

    if (toggleToday && toggleWeek) {
        if (defaultTab === 'today') {
            toggleToday.classList.add('active');
            toggleWeek.classList.remove('active');
        } else {
            toggleWeek.classList.add('active');
            toggleToday.classList.remove('active');
        }
    }

    // Reset UI to analyzing state
    document.getElementById('digestCommentaryText').textContent = "Synthesizing your productivity telemetry...";
    document.getElementById('digestTimeValue').textContent = "0.0";
    document.getElementById('digestTimeProgress').style.width = "0%";
    document.getElementById('digestAppValue').textContent = "Loading...";
    document.getElementById('digestProjectValue').textContent = "Loading...";
    document.getElementById('digestProjectsList').innerHTML = "";
    const digestAppsList = document.getElementById('digestAppsList');
    if (digestAppsList) digestAppsList.innerHTML = DOMPurify.sanitize("");

    // Show modal container (initial opacity/transform transition starts)
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.classList.add('active');
    });

    try {
        const res = await fetch(`${API_BASE}/ai-digest`);
        if (res.ok) {
            aiDigestData = await res.json();
            renderAIDigestUI();
        } else {
            document.getElementById('digestCommentaryText').textContent = "Unable to reach the AI engine right now. Please try again later.";
        }
    } catch (e) {
        console.error(e);
        document.getElementById('digestCommentaryText').textContent = "Network error. Failed to retrieve your AI digest.";
    }
}

function hideAIDigestModal() {
    const modal = document.getElementById('aiDigestModal');
    if (!modal) return;

    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 400); // Wait for transition finish
}

function renderAIDigestUI() {
    if (!aiDigestData) return;

    const data = aiDigestData[currentDigestTab];
    if (!data) return;

    // 1. Set commentary text
    document.getElementById('digestCommentaryText').textContent = data.commentary;

    // 2. Set hours worked and progress fills
    const hrs = data.total_hours;
    document.getElementById('digestTimeValue').textContent = hrs.toFixed(1);

    // Goal Calculations
    let goalPercent = 0;
    let goalLabel = "";
    if (currentDigestTab === 'today') {
        const goalH = parseInt(document.getElementById('goalHours')?.value || '4');
        const goalM = parseInt(document.getElementById('goalMinutes')?.value || '10');
        const goalSec = (goalH * 3600) + (goalM * 60);
        goalPercent = goalSec > 0 ? Math.min((data.total_seconds / goalSec) * 100, 100) : 0;
        goalLabel = `Goal: ${goalH}h ${goalM}m`;
    } else {
        // Standard 40h weekly goal
        const weeklyGoalSec = 40 * 3600;
        goalPercent = Math.min((data.total_seconds / weeklyGoalSec) * 100, 100);
        goalLabel = "Goal: 40h 0m";
    }

    document.getElementById('digestGoalHint').textContent = goalLabel;

    // Animate progress fill
    setTimeout(() => {
        document.getElementById('digestTimeProgress').style.width = `${goalPercent}%`;
    }, 50);

    // 3. Set top app info
    const appValEl = document.getElementById('digestAppValue');
    const appTimeEl = document.getElementById('digestAppTime');

    if (data.most_used_app) {
        appValEl.textContent = data.most_used_app;
        appValEl.title = data.most_used_app;
        appValEl.classList.add('truncate');

        const appHrs = Math.floor(data.most_used_app_seconds / 3600);
        const appMins = Math.floor((data.most_used_app_seconds % 3600) / 60);
        appTimeEl.textContent = `${appHrs}h ${appMins}m focus`;
    } else {
        appValEl.textContent = "None";
        appTimeEl.textContent = "No app active";
    }

    // 4. Set top project info
    const projValEl = document.getElementById('digestProjectValue');
    const projTimeEl = document.getElementById('digestProjectTime');
    const projPctEl = document.getElementById('digestProjectPct');

    if (data.top_project_name) {
        projValEl.textContent = data.top_project_name;
        projValEl.title = data.top_project_name;
        projValEl.classList.add('truncate');

        projPctEl.textContent = `${data.top_project_pct}%`;
        projPctEl.style.display = 'inline-block';
        if (data.top_project_color) {
            projPctEl.style.backgroundColor = `${data.top_project_color}1a`; // 10% opacity
            projPctEl.style.color = data.top_project_color;
            projPctEl.style.borderColor = `${data.top_project_color}33`; // 20% opacity
        }

        const projSec = data.projects.find(p => p.name === data.top_project_name)?.seconds || 0;
        const projHrs = Math.floor(projSec / 3600);
        const projMins = Math.floor((projSec % 3600) / 60);
        projTimeEl.textContent = `${projHrs}h ${projMins}m track`;
    } else {
        projValEl.textContent = "None";
        projPctEl.style.display = 'none';
        projTimeEl.textContent = "No project assigned";
    }

    // 5. Draw project allocation list
    const listContainer = document.getElementById('digestProjectsList');
    if (data.projects.length === 0) {
        listContainer.innerHTML = DOMPurify.sanitize('<div class="digest-projects-empty">No projects tracked during this period</div>');
    } else {
        listContainer.innerHTML = data.projects.map(proj => {
            const h = Math.floor(proj.seconds / 3600);
            const m = Math.floor((proj.seconds % 3600) / 60);

            return `
                <div class="digest-proj-row">
                    <div class="digest-proj-info">
                        <div class="digest-proj-name-group">
                            <div class="digest-proj-dot" style="background-color: ${proj.color || 'var(--primary)'}"></div>
                            <span class="digest-proj-name">${escapeHTML(proj.name)}</span>
                        </div>
                        <div class="digest-proj-stats">
                            <span class="digest-proj-duration">${h}h ${m}m</span>
                            <span class="digest-proj-pct" style="color: ${proj.color || 'var(--primary)'}">${proj.pct}%</span>
                        </div>
                    </div>
                    <div class="digest-proj-bar-track">
                        <div class="digest-proj-bar-fill" style="width: 0%; background-color: ${proj.color || 'var(--primary)'}" data-width="${proj.pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');

        // Staggered trigger width fill transition
        setTimeout(() => {
            listContainer.querySelectorAll('.digest-proj-bar-fill').forEach(fill => {
                fill.style.width = fill.dataset.width;
            });
        }, 100);
    }

    // 6. Draw top applications list
    const appsListContainer = document.getElementById('digestAppsList');
    if (appsListContainer) {
        if (!data.apps || data.apps.length === 0) {
            appsListContainer.innerHTML = DOMPurify.sanitize('<div class="digest-projects-empty">No applications tracked during this period</div>');
        } else {
            const appColors = [
                '#3b82f6', // Ocean Blue
                '#ec4899', // Pink
                '#10b981', // Emerald
                '#f59e0b', // Amber
                '#8b5cf6', // Purple
            ];

            appsListContainer.innerHTML = data.apps.map((app, index) => {
                const h = Math.floor(app.total_seconds / 3600);
                const m = Math.floor((app.total_seconds % 3600) / 60);
                const pct = data.total_seconds > 0 ? Math.min(Math.round((app.total_seconds / data.total_seconds) * 100), 100) : 0;
                const color = appColors.at(index % appColors.length);

                return `
                    <div class="digest-proj-row">
                        <div class="digest-proj-info">
                            <div class="digest-proj-name-group">
                                <div class="digest-proj-dot" style="background-color: ${color}"></div>
                                <span class="digest-proj-name">${escapeHTML(app.app_name)}</span>
                            </div>
                            <div class="digest-proj-stats">
                                <span class="digest-proj-duration">${h > 0 ? `${h}h ` : ''}${m}m</span>
                                <span class="digest-proj-pct" style="color: ${color}">${pct}%</span>
                            </div>
                        </div>
                        <div class="digest-proj-bar-track">
                            <div class="digest-proj-bar-fill" style="width: 0%; background-color: ${color}" data-width="${pct}%"></div>
                        </div>
                    </div>
                `;
            }).join('');

            // Staggered trigger width fill transition
            setTimeout(() => {
                appsListContainer.querySelectorAll('.digest-proj-bar-fill').forEach(fill => {
                    fill.style.width = fill.dataset.width;
                });
            }, 100);
        }
    }
}


// --- Smart Break Reminder Overlay & Controls ---
let currentBreakReminder = null;

function checkPendingBreakReminder(data) {
    const modal = document.getElementById('breakReminderModal');
    if (!modal) return;

    if (data.pending_break_reminder) {
        // If we already have this exact reminder open, don't re-trigger
        if (currentBreakReminder && currentBreakReminder.sessionId === data.pending_break_reminder.sessionId && currentBreakReminder.minutes === data.pending_break_reminder.minutes) {
            return;
        }

        currentBreakReminder = data.pending_break_reminder;

        const elapsedTextEl = document.getElementById('breakElapsedText');
        if (elapsedTextEl) {
            const mins = data.pending_break_reminder.minutes;
            elapsedTextEl.textContent = `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
        }

        const messageTextEl = document.getElementById('breakMessageText');
        if (messageTextEl) {
            messageTextEl.textContent = data.pending_break_reminder.message || 'Take a moment to stretch and rest your eyes.';
        }

        modal.style.display = 'flex';
        // Allow rendering display: flex before adding active class for transition
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
    } else {
        // Only hide if the server has cleared the reminder
        if (modal.classList.contains('active')) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                currentBreakReminder = null;
            }, 300);
        }
    }
}

async function takeLunchBreak() {
    try {
        // 1. Record the break event and pause active session
        await fetch(`${API_BASE}/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'lock', metadata: { reason: 'lunch' } })
        });

        // 2. Clear break reminder state on the server
        await fetch(`${API_BASE}/dismiss-break-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        // 3. Clear UI state
        const modal = document.getElementById('breakReminderModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                currentBreakReminder = null;
            }, 300);
        }

        // 4. Force state sync
        updateStatus(true);
    } catch (e) {
        console.error("Error initiating lunch break:", e);
    }
}

async function takeDinnerBreak() {
    try {
        // 1. Record the break event and pause active session
        await fetch(`${API_BASE}/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'lock', metadata: { reason: 'dinner' } })
        });

        // 2. Clear break reminder state on the server
        await fetch(`${API_BASE}/dismiss-break-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        // 3. Clear UI state
        const modal = document.getElementById('breakReminderModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                currentBreakReminder = null;
            }, 300);
        }

        // 4. Force state sync
        updateStatus(true);
    } catch (e) {
        console.error("Error initiating dinner break:", e);
    }
}

async function takeBreakNow() {
    try {
        // 1. Record the break event and pause active session
        await fetch(`${API_BASE}/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'lock', metadata: { reason: 'take_break' } })
        });

        // 2. Clear break reminder state on the server
        await fetch(`${API_BASE}/dismiss-break-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        // 3. Clear UI state
        const modal = document.getElementById('breakReminderModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                currentBreakReminder = null;
            }, 300);
        }

        // 4. Force state sync
        updateStatus(true);
    } catch (e) {
        console.error("Error initiating break:", e);
    }
}

async function snoozeBreakReminder(minutes = 10) {
    try {
        await fetch(`${API_BASE}/snooze-break-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minutes })
        });

        const modal = document.getElementById('breakReminderModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                currentBreakReminder = null;
            }, 300);
        }

        updateStatus(true);
    } catch (e) {
        console.error("Error snoozing break reminder:", e);
    }
}

async function dismissBreakReminder() {
    try {
        await fetch(`${API_BASE}/dismiss-break-reminder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const modal = document.getElementById('breakReminderModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                currentBreakReminder = null;
            }, 300);
        }

        updateStatus(true);
    } catch (e) {
        console.error("Error dismissing break reminder:", e);
    }
}

// Bind to window to allow HTML button invocation
window.checkPendingBreakReminder = checkPendingBreakReminder;
window.takeBreakNow = takeBreakNow;
window.takeLunchBreak = takeLunchBreak;
window.takeDinnerBreak = takeDinnerBreak;
window.snoozeBreakReminder = snoozeBreakReminder;
window.dismissBreakReminder = dismissBreakReminder;

// ─── Wellbeing Feature ───


// Wellbeing Feature moved to wellbeing.js

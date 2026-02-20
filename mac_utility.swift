import Foundation
import AppKit
import WebKit
import CoreGraphics

// MARK: - App Delegate
class AppDelegate: NSObject, NSApplicationDelegate {
    var menuBarUtility: MenuBarUtility!

    func applicationDidFinishLaunching(_ notification: Notification) {
        menuBarUtility = MenuBarUtility()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        menuBarUtility.showDashboard()
        return true
    }
}

// MARK: - Custom URL Scheme Handler
// Proxies all "app://" requests to "http://localhost:3000" via URLSession
// This completely bypasses WKWebView ATS restrictions
class LocalhostSchemeHandler: NSObject, WKURLSchemeHandler {
    let targetBase = "http://localhost:3000"
    private var activeTasks = Set<Int>()
    private let lock = NSLock()

    private func isTaskActive(_ hash: Int) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return activeTasks.contains(hash)
    }

    private func addTask(_ hash: Int) {
        lock.lock()
        activeTasks.insert(hash)
        lock.unlock()
    }

    private func removeTask(_ hash: Int) {
        lock.lock()
        activeTasks.remove(hash)
        lock.unlock()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let taskHash = ObjectIdentifier(urlSchemeTask as AnyObject).hashValue
        addTask(taskHash)

        guard let requestURL = urlSchemeTask.request.url,
              var components = URLComponents(url: requestURL, resolvingAgainstBaseURL: false) else {
            if isTaskActive(taskHash) {
                removeTask(taskHash)
                urlSchemeTask.didFailWithError(NSError(domain: "LocalhostSchemeHandler", code: -1))
            }
            return
        }

        // Rewrite app:// -> http://localhost:3000
        components.scheme = "http"
        components.host = "localhost"
        components.port = 3000

        guard let realURL = components.url else {
            if isTaskActive(taskHash) {
                removeTask(taskHash)
                urlSchemeTask.didFailWithError(NSError(domain: "LocalhostSchemeHandler", code: -2))
            }
            return
        }

        var request = URLRequest(url: realURL)
        request.httpMethod = urlSchemeTask.request.httpMethod ?? "GET"
        request.allHTTPHeaderFields = urlSchemeTask.request.allHTTPHeaderFields
        request.httpBody = urlSchemeTask.request.httpBody
        
        // CRITICAL: Disable Apple OS native caching for localhost requests
        // Without this, the WKWebView will aggressively cache CSS/JS files indefinitely.
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self, self.isTaskActive(taskHash) else { return }

            if let error = error {
                self.removeTask(taskHash)
                urlSchemeTask.didFailWithError(error)
                return
            }

            guard let data = data, let httpResponse = response as? HTTPURLResponse else {
                self.removeTask(taskHash)
                urlSchemeTask.didFailWithError(NSError(domain: "LocalhostSchemeHandler", code: -3))
                return
            }

            // Build a response with the correct MIME type
            var headers = httpResponse.allHeaderFields as? [String: String] ?? [:]
            // Ensure content type is set
            if headers["Content-Type"] == nil {
                let pathExt = realURL.pathExtension.lowercased()
                switch pathExt {
                case "html": headers["Content-Type"] = "text/html; charset=utf-8"
                case "css": headers["Content-Type"] = "text/css; charset=utf-8"
                case "js": headers["Content-Type"] = "application/javascript; charset=utf-8"
                case "json": headers["Content-Type"] = "application/json; charset=utf-8"
                default: headers["Content-Type"] = "application/octet-stream"
                }
            }

            let schemeResponse = HTTPURLResponse(
                url: requestURL, // Use original app:// URL
                statusCode: httpResponse.statusCode,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!

            guard self.isTaskActive(taskHash) else { return }
            self.removeTask(taskHash)
            urlSchemeTask.didReceive(schemeResponse)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        }
        task.resume()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        let taskHash = ObjectIdentifier(urlSchemeTask as AnyObject).hashValue
        removeTask(taskHash)
    }
}

// MARK: - Dashboard Window Controller
class DashboardWindowController: NSObject, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow?
    var webView: WKWebView?
    let serverURL: String
    let schemeHandler = LocalhostSchemeHandler()
    var retryCount = 0
    let maxRetries = 30

    init(serverURL: String) {
        self.serverURL = serverURL
        super.init()
    }

    func showWindow() {
        if let existingWindow = window {
            existingWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            NSApp.setActivationPolicy(.regular)
            // Trigger data refresh in the existing WebView
            webView?.evaluateJavaScript("if(typeof updateStatus==='function'){updateStatus(true);loadDashboardCharts();}", completionHandler: nil)
            return
        }

        // Configure WKWebView with custom scheme handler
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "app")

        // Inject script to override API_BASE before app.js runs
        let overrideScript = WKUserScript(
            source: "window.__API_BASE = 'app://localhost';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(overrideScript)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        self.webView = webView

        // Create window
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1200, height: 800)
        let windowWidth: CGFloat = min(1100, screenFrame.width * 0.8)
        let windowHeight: CGFloat = min(750, screenFrame.height * 0.8)
        let windowX = screenFrame.origin.x + (screenFrame.width - windowWidth) / 2
        let windowY = screenFrame.origin.y + (screenFrame.height - windowHeight) / 2

        let window = NSWindow(
            contentRect: NSRect(x: windowX, y: windowY, width: windowWidth, height: windowHeight),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Working Hours Monitor"
        window.minSize = NSSize(width: 700, height: 500)
        window.contentView = webView
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.backgroundColor = NSColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1.0)
        window.appearance = NSAppearance(named: .darkAqua)

        self.window = window

        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        // Load via custom scheme — all requests proxied through URLSession
        loadDashboard()
    }

    func loadDashboard() {
        retryCount = 0
        tryLoadDashboard()
    }

    func tryLoadDashboard() {
        // First check if server is ready via URLSession
        guard let checkURL = URL(string: "http://localhost:3000/status") else { return }
        URLSession.shared.dataTask(with: checkURL) { [weak self] _, response, error in
            guard let self = self else { return }
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                DispatchQueue.main.async {
                    // Server is ready — load via custom scheme
                    if let url = URL(string: "app://localhost/") {
                        self.webView?.load(URLRequest(url: url))
                    }
                }
            } else {
                self.retryCount += 1
                if self.retryCount < self.maxRetries {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        self.tryLoadDashboard()
                    }
                } else {
                    DispatchQueue.main.async {
                        self.webView?.loadHTMLString(self.errorHTML(), baseURL: nil)
                    }
                }
            }
        }.resume()
    }

    func errorHTML() -> String {
        return """
        <!DOCTYPE html>
        <html>
        <head><style>
            body {
                margin: 0; display: flex; align-items: center; justify-content: center;
                height: 100vh; background: radial-gradient(circle at top right, #1a1a2e, #16213e, #0f3460);
                font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #e0e0e0;
            }
            .error { text-align: center; }
            h2 { color: #ff5252; font-weight: 400; }
            p { color: #888; font-size: 14px; max-width: 400px; }
            button {
                margin-top: 20px; padding: 12px 30px; background: #bb86fc; color: #121212;
                border: none; border-radius: 12px; font-size: 14px; font-weight: 600;
                cursor: pointer;
            }
        </style></head>
        <body><div class="error">
            <h2>Unable to Connect</h2>
            <p>The local server is not responding. Please ensure the app was launched correctly.</p>
            <button onclick="window.location='app://localhost/'">Retry</button>
        </div></body>
        </html>
        """
    }

    // MARK: - WKNavigationDelegate
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("WebView navigation failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("WebView provisional navigation failed: \(error.localizedDescription)")
    }

    // MARK: - WKUIDelegate (handle JS alert/confirm dialogs)
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        let response = alert.runModal()
        completionHandler(response == .alertFirstButtonReturn)
    }

    // MARK: - NSWindowDelegate
    func windowWillClose(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        NSApp.setActivationPolicy(.accessory)
        return false
    }
}

// MARK: - Menu Bar Utility
class MenuBarUtility: NSObject {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let serverURL = "http://localhost:3000"
    var pollTimer: Timer?
    var uiTimer: Timer?
    var appTrackTimer: Timer?
    var baseSeconds: Int = 0
    var lastSyncTime: Date = Date()
    var currentStatus: String = "idle"
    var dashboardController: DashboardWindowController?
    var isScreenLocked: Bool = false
    var lastTrackedApp: String = ""
    var idleCheckTimer: Timer?
    var isIdle: Bool = false
    let idleThresholdSeconds: Double = 300 // 5 minutes

    override init() {
        super.init()
        dashboardController = DashboardWindowController(serverURL: serverURL)
        setupStatusItem()
        setupNotifications()
        startTimers()
    }

    func setupStatusItem() {
        if let button = statusItem.button {
            button.title = "🕒 00:00:00"
            button.action = #selector(menuBarClicked)
            button.target = self
        }
        
        let menu = NSMenu()

        let dashboardItem = NSMenuItem(title: "Open Dashboard", action: #selector(openDashboard), keyEquivalent: "d")
        dashboardItem.target = self
        menu.addItem(dashboardItem)

        menu.addItem(NSMenuItem.separator())

        let browserItem = NSMenuItem(title: "Open in Browser", action: #selector(openInBrowser), keyEquivalent: "b")
        browserItem.target = self
        menu.addItem(browserItem)

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    func setupNotifications() {
        // Screen lock/unlock
        let dnc = DistributedNotificationCenter.default()
        dnc.addObserver(forName: NSNotification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) { _ in
            self.isScreenLocked = true
            self.sendEvent("lock")
        }
        dnc.addObserver(forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) { _ in
            self.isScreenLocked = false
            self.sendEvent("unlock")
        }

        // System sleep/wake — sleep doesn't always trigger screen lock
        let wsnc = NSWorkspace.shared.notificationCenter
        wsnc.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { _ in
            self.isScreenLocked = true
            self.sendEvent("lock")
        }
        wsnc.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { _ in
            self.isScreenLocked = false
            self.sendEvent("unlock")
        }
    }

    func startTimers() {
        // Poll server every 10s for ground truth
        pollTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { _ in
            self.fetchStatus()
        }
        
        // Update UI every 1s for smoothness
        uiTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            self.updateUI()
        }

        // Track frontmost app every 5s
        appTrackTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
            self.trackFrontmostApp()
        }

        // Check for user idle every 30s
        idleCheckTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { _ in
            self.checkIdleState()
        }
        
        // Initial fetch
        self.fetchStatus()
    }

    func updateUI() {
        var displaySeconds = self.baseSeconds
        if self.currentStatus == "active" {
            let elapsed = Int(Date().timeIntervalSince(self.lastSyncTime))
            displaySeconds = self.baseSeconds + elapsed
        }
        
        let timeStr = self.formatTime(displaySeconds)
        DispatchQueue.main.async {
            if let button = self.statusItem.button {
                if self.currentStatus == "active" {
                    button.title = "🕒 \(timeStr)"
                } else if self.currentStatus == "paused" {
                    button.title = "🕒 \(timeStr) (Paused)"
                } else if self.currentStatus == "offline" {
                    button.title = "🕒 Offline"
                } else {
                    button.title = "🕒 Idle"
                }
            }
        }
    }

    func fetchStatus() {
        guard let url = URL(string: "\(serverURL)/status") else { return }
        URLSession.shared.dataTask(with: url) { data, _, error in
            if let _ = error {
                self.currentStatus = "offline"
                return
            }
            
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let manual = json["manual"] as? [String: Any] else { return }
            
            // Align ground truth and capture the sync moment immediately
            DispatchQueue.main.async {
                self.baseSeconds = manual["total_seconds"] as? Int ?? 0
                self.lastSyncTime = Date()
                self.currentStatus = manual["status"] as? String ?? "idle"
                self.updateUI() // Immediate update after sync
            }
        }.resume()
    }

    func trackFrontmostApp() {
        // Don't track when screen is locked, sleeping, or idle
        guard !isScreenLocked && !isIdle else { return }

        guard let frontApp = NSWorkspace.shared.frontmostApplication,
              let appName = frontApp.localizedName else { return }

        // Skip system processes that aren't real user apps
        let skipApps = ["loginwindow", "ScreenSaverEngine", "UserNotificationCenter"]
        guard !skipApps.contains(appName) else { return }

        // Send heartbeat — 5 seconds of usage for this app
        guard let url = URL(string: "\(serverURL)/app-heartbeat") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let json: [String: Any] = ["app_name": appName, "seconds": 5]
        request.httpBody = try? JSONSerialization.data(withJSONObject: json)
        URLSession.shared.dataTask(with: request).resume()
    }

    func checkIdleState() {
        guard !isScreenLocked else { return }

        let idleTime = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .mouseMoved)
        let idleKeyboard = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .keyDown)
        let minIdle = min(idleTime, idleKeyboard)

        if minIdle >= idleThresholdSeconds && !isIdle {
            isIdle = true
            sendEvent("lock") // Pause sessions due to idle
            print("User idle for \(Int(minIdle))s — pausing sessions")
        } else if minIdle < idleThresholdSeconds && isIdle {
            isIdle = false
            sendEvent("unlock") // Resume sessions — user is back
            print("User returned from idle — resuming sessions")
        }
    }

    func sendEvent(_ eventType: String) {
        guard let url = URL(string: "\(serverURL)/event") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let json: [String: Any] = ["event": eventType]
        request.httpBody = try? JSONSerialization.data(withJSONObject: json)
        URLSession.shared.dataTask(with: request).resume()
    }

    func formatTime(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        return String(format: "%02d:%02d:%02d", h, m, s)
    }

    func showDashboard() {
        dashboardController?.showWindow()
    }

    @objc func menuBarClicked() {
        // Fallback if no menu
    }

    @objc func openDashboard() {
        showDashboard()
    }

    @objc func openInBrowser() {
        if let url = URL(string: serverURL) {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func quitApp() {
        NSApplication.shared.terminate(nil)
    }
}

// Start the app
let app = NSApplication.shared
let appDelegate = AppDelegate()
app.delegate = appDelegate
app.setActivationPolicy(.accessory) // Menu bar only initially
app.run()

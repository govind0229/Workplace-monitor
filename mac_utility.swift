import AppKit
import WebKit
import CoreGraphics
import CoreLocation
import UserNotifications
import AVFoundation
import UniformTypeIdentifiers

// MARK: - App Delegate
class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    var menuBarUtility: MenuBarUtility!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // First run setup
        registerLaunchAgent()
        
        // Start the Node.js server first
        spawnServer()
        
        menuBarUtility = MenuBarUtility()
        
        // Setup Notifications
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                print("Notification permission granted.")
            } else if let error = error {
                print("Notification permission error: \(error.localizedDescription)")
            }
        }
    }

    func spawnServer() {
        // Find the resources directory
        guard let resourcePath = Bundle.main.resourcePath else {
            print("Error: Could not find resource path")
            return
        }
        
        var appPath = "\(resourcePath)/app"
        var nodePath = "\(appPath)/node"
        var serverScriptPath = "\(appPath)/server.js"
        
        // --- FALLBACK FOR LOCAL DEVELOPMENT ---
        // If Bundle resource path/app/server.js doesn't exist, check same folder as executable
        let fileManager = FileManager.default
        if !fileManager.fileExists(atPath: serverScriptPath) {
            let localNodePath = "./node"
            let localServerPath = "./server.js"
            if fileManager.fileExists(atPath: localServerPath) {
                print("Notice: Resource bundle not found, using local fallback in current directory.")
                appPath = FileManager.default.currentDirectoryPath
                nodePath = fileManager.fileExists(atPath: localNodePath) ? localNodePath : "/usr/local/bin/node"
                serverScriptPath = localServerPath
            }
        }
        
        // Final sanity check
        if !fileManager.fileExists(atPath: serverScriptPath) {
            print("Error: server.js not found at \(serverScriptPath)")
            return
        }
        
        print("Starting Node.js server from: \(appPath)")
        
        // Terminate any existing server.js instances to avoid duplicate zombies
        let killProcess = Process()
        killProcess.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
        killProcess.arguments = ["-f", "server.js"]
        try? killProcess.run()
        killProcess.waitUntilExit()
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [serverScriptPath]
        process.currentDirectoryURL = URL(fileURLWithPath: appPath)
        
        // Redirect output to a log file in the app support directory or resources
        // For development simplicity, we'll just let it run. In a real app, we'd handle pipes.
        
        do {
            try process.run()
            print("Server process started with PID: \(process.processIdentifier)")
        } catch {
            print("Failed to start server process: \(error.localizedDescription)")
        }
    }

    func registerLaunchAgent() {
        let label = "com.workplacemonitor.app"
        let plistName = "\(label).plist"
        let fileManager = FileManager.default
        
        let homeDirectory = FileManager.default.homeDirectoryForCurrentUser
        let launchAgentsDir = homeDirectory.appendingPathComponent("Library/LaunchAgents")
        let destPlistURL = launchAgentsDir.appendingPathComponent(plistName)
        
        // Check if plist exists and needs updating
        var needsUpdate = true
        if fileManager.fileExists(atPath: destPlistURL.path) {
            if let existingContent = try? String(contentsOf: destPlistURL, encoding: .utf8),
               existingContent.contains("mac_utility") {
                needsUpdate = false
            } else {
                print("Found outdated LaunchAgent (likely launcher.sh), will update...")
                // Unload old agent before overwriting
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/bin/launchctl")
                process.arguments = ["unload", destPlistURL.path]
                try? process.run()
                process.waitUntilExit()
            }
        }
        
        if !needsUpdate {
            return
        }
        
        print("Registering LaunchAgent...")
        
        // Find bundled plist
        guard let resourcePath = Bundle.main.resourcePath else { return }
        let sourcePlistPath = "\(resourcePath)/app/\(plistName)"
        guard fileManager.fileExists(atPath: sourcePlistPath) else {
            print("Error: source plist not found at \(sourcePlistPath)")
            return
        }
        
        do {
            try fileManager.createDirectory(at: launchAgentsDir, withIntermediateDirectories: true)
            
            // Read source plist
            var plistContent = try String(contentsOfFile: sourcePlistPath, encoding: .utf8)
            
            // Perform substitution: Replace /Applications/WorkingHours.app with actual bundle path
            let bundlePath = Bundle.main.bundlePath
            plistContent = plistContent.replacingOccurrences(of: "/Applications/WorkplaceMonitor.app", with: bundlePath)
            
            // Write to destination
            try plistContent.write(to: destPlistURL, atomically: true, encoding: .utf8)
            
            // Load the agent
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/launchctl")
            process.arguments = ["load", destPlistURL.path]
            try process.run()
            
            print("LaunchAgent registered successfully.")
        } catch {
            print("Failed to register LaunchAgent: \(error.localizedDescription)")
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Show banner even when app is in foreground
        if #available(macOS 11.0, *) {
            completionHandler([.banner, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
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
            if headers["Content-Type"] == nil && headers["content-type"] == nil {
                let pathExt = realURL.pathExtension.lowercased()
                switch pathExt {
                case "html": headers["Content-Type"] = "text/html; charset=utf-8"
                case "css": headers["Content-Type"] = "text/css; charset=utf-8"
                case "js": headers["Content-Type"] = "application/javascript; charset=utf-8"
                case "json": headers["Content-Type"] = "application/json; charset=utf-8"
                default: headers["Content-Type"] = "application/octet-stream"
                }
            }

            // Strip out Content-Disposition for app:// requests to avoid WebKit resource load failures or download interceptions
            headers.removeValue(forKey: "Content-Disposition")
            headers.removeValue(forKey: "content-disposition")

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
class DashboardWindowController: NSObject, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
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
            if existingWindow.isMiniaturized {
                existingWindow.deminiaturize(nil)
            }
            existingWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            NSApp.setActivationPolicy(.regular)
            // Trigger data refresh in the existing WebView
            webView?.evaluateJavaScript("if(typeof updateStatus==='function'){updateStatus(true);loadDashboardCharts();}", completionHandler: nil)
            return
        }

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "app")
        
        // Add Native Bridges
        config.userContentController.add(self, name: "requestLocation")
        config.userContentController.add(self, name: "requestStatus")
        config.userContentController.add(self, name: "downloadFile")
        config.userContentController.add(self, name: "consoleLog")
        
        // CRITICAL: Force clear WKWebView internal caches (Memory/Disk) on every launch
        let dataStore = WKWebsiteDataStore.default()
        let types: Set<String> = [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
        dataStore.removeData(ofTypes: types, modifiedSince: Date.distantPast) {
            print("WKWebView caches successfully cleared.")
        }

        // Inject script to override API_BASE and forward console logs to Swift before app.js runs
        let consoleAndBaseJS = """
        window.__API_BASE = 'app://localhost';
        (function() {
            var origLog = console.log;
            var origError = console.error;
            var origWarn = console.warn;
            
            console.log = function() {
                origLog.apply(console, arguments);
                var msg = Array.prototype.slice.call(arguments).map(function(x) { 
                    return typeof x === 'object' ? JSON.stringify(x) : String(x); 
                }).join(' ');
                window.webkit.messageHandlers.consoleLog.postMessage({type: "log", message: msg});
            };
            console.error = function() {
                origError.apply(console, arguments);
                var msg = Array.prototype.slice.call(arguments).map(function(x) { 
                    return typeof x === 'object' ? JSON.stringify(x) : String(x); 
                }).join(' ');
                window.webkit.messageHandlers.consoleLog.postMessage({type: "error", message: msg});
            };
            console.warn = function() {
                origWarn.apply(console, arguments);
                var msg = Array.prototype.slice.call(arguments).map(function(x) { 
                    return typeof x === 'object' ? JSON.stringify(x) : String(x); 
                }).join(' ');
                window.webkit.messageHandlers.consoleLog.postMessage({type: "warn", message: msg});
            };
            window.onerror = function(message, source, lineno, colno, error) {
                var msg = message + ' at ' + source + ':' + lineno + ':' + colno;
                window.webkit.messageHandlers.consoleLog.postMessage({type: "error", message: msg});
                return false;
            };
        })();
        """
        
        let overrideScript = WKUserScript(
            source: consoleAndBaseJS,
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
        window.title = "Workplace Monitor"
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

    // MARK: - WKScriptMessageHandler
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "requestLocation" {
            print("[Bridge] Web requested location")
            // Fetch current location from the MenuBarUtility
            if let appDelegate = NSApp.delegate as? AppDelegate,
               let menuBar = appDelegate.menuBarUtility,
               let loc = menuBar.locationManager?.location {
                sendLocationToWeb(loc)
            } else {
                print("[Bridge] Location not available yet, starting manager...")
                if let appDelegate = NSApp.delegate as? AppDelegate {
                    appDelegate.menuBarUtility?.locationManager?.startUpdatingLocation()
                }
            }
        } else if message.name == "requestStatus" {
            // Force a status refresh
            if let appDelegate = NSApp.delegate as? AppDelegate {
                appDelegate.menuBarUtility?.fetchStatus()
            }
        } else if message.name == "downloadFile" {
            print("[Bridge] Received downloadFile message!")
            guard let dict = message.body as? [String: Any] else {
                print("[Bridge] Error: message body is not [String: Any]. Type is: \(type(of: message.body))")
                return
            }
            guard let filename = dict["filename"] as? String else {
                print("[Bridge] Error: 'filename' is missing or not a String")
                return
            }
            guard let content = dict["content"] as? String else {
                print("[Bridge] Error: 'content' is missing or not a String")
                return
            }
            
            print("[Bridge] Filename: \(filename), content length: \(content.count) chars")
            
            DispatchQueue.main.async {
                print("[Bridge] Presenting NSSavePanel on main thread")
                // Force app activation so save panel is brought to the front
                NSApp.activate(ignoringOtherApps: true)
                
                let savePanel = NSSavePanel()
                savePanel.allowedContentTypes = [.commaSeparatedText]
                savePanel.nameFieldStringValue = filename
                savePanel.title = "Save Exported Report"
                
                if let window = self.window {
                    print("[Bridge] Presenting Save Panel as sheet modal")
                    savePanel.beginSheetModal(for: window) { response in
                        print("[Bridge] Save Panel sheet modal closed with response: \(response)")
                        if response == .OK, let url = savePanel.url {
                            print("[Bridge] Saving file to URL: \(url.path)")
                            do {
                                try content.write(to: url, atomically: true, encoding: .utf8)
                                print("[Bridge] File saved successfully")
                            } catch {
                                print("[Bridge] Error writing file: \(error.localizedDescription)")
                            }
                        }
                    }
                } else {
                    print("[Bridge] Presenting Save Panel as standalone modal")
                    savePanel.begin { response in
                        print("[Bridge] Save Panel modal closed with response: \(response)")
                        if response == .OK, let url = savePanel.url {
                            print("[Bridge] Saving file to URL: \(url.path)")
                            do {
                                try content.write(to: url, atomically: true, encoding: .utf8)
                                print("[Bridge] File saved successfully")
                            } catch {
                                print("[Bridge] Error writing file: \(error.localizedDescription)")
                            }
                        }
                    }
                }
            }
        } else if message.name == "consoleLog" {
            if let dict = message.body as? [String: Any],
               let type = dict["type"] as? String,
               let msg = dict["message"] as? String {
                print("[Console] [\(type.uppercased())] \(msg)")
            }
        }
    }

    func sendLocationToWeb(_ location: CLLocation) {
        let lat = location.coordinate.latitude
        let lng = location.coordinate.longitude
        let acc = location.horizontalAccuracy
        
        let js = "if(typeof onNativeLocation==='function'){ onNativeLocation(\(lat), \(lng), \(acc)); }"
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
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

// MARK: - Standalone Floating Break Popup Controller
class BreakPopupController: NSObject, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow?
    var webView: WKWebView?
    let serverURL: String
    let schemeHandler = LocalhostSchemeHandler()

    init(serverURL: String) {
        self.serverURL = serverURL
        super.init()
    }

    func showWindow() {
        if let existingWindow = window {
            NSApp.setActivationPolicy(.regular)
            existingWindow.orderFrontRegardless()
            existingWindow.makeKey()
            NSApp.activate(ignoringOtherApps: true)
            if let url = URL(string: "app://localhost/break-popup.html") {
                webView?.load(URLRequest(url: url))
            }
            return
        }

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "app")
        config.userContentController.add(self, name: "closeBreakPopup")
        config.userContentController.add(self, name: "updateHeight")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        self.webView = webView

        // Compact Dimensions
        let windowWidth: CGFloat = 400
        let windowHeight: CGFloat = 350

        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1200, height: 800)
        let windowX = screenFrame.origin.x + (screenFrame.width - windowWidth) / 2
        let windowY = screenFrame.origin.y + (screenFrame.height - windowHeight) / 2

        let window = NSWindow(
            contentRect: NSRect(x: windowX, y: windowY, width: windowWidth, height: windowHeight),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Break Reminder"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.standardWindowButton(.miniaturizeButton)?.isHidden = true
        window.standardWindowButton(.zoomButton)?.isHidden = true

        window.contentView = webView
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.backgroundColor = NSColor(red: 0.08, green: 0.08, blue: 0.12, alpha: 0.95)
        window.appearance = NSAppearance(named: .darkAqua)
        
        // Float on top of all windows & allow rendering across all virtual spaces / full-screen apps
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        self.window = window

        NSApp.setActivationPolicy(.regular)
        window.orderFrontRegardless()
        window.makeKey()
        NSApp.activate(ignoringOtherApps: true)

        if let url = URL(string: "app://localhost/break-popup.html") {
            webView.load(URLRequest(url: url))
        }
    }

    func hideWindow() {
        DispatchQueue.main.async {
            self.window?.orderOut(nil)
            // Restore accessory policy if dashboard is also not open/visible
            if let menuBar = (NSApp.delegate as? AppDelegate)?.menuBarUtility,
               menuBar.dashboardController?.window?.isVisible == true {
                // Keep .regular since dashboard is visible
            } else {
                NSApp.setActivationPolicy(.accessory)
            }
        }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        self.hideWindow()
        return false
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "closeBreakPopup" {
            self.hideWindow()
        } else if message.name == "updateHeight" {
            if let heightVal = message.body as? Double {
                DispatchQueue.main.async {
                    self.adjustWindowHeight(to: CGFloat(heightVal))
                }
            }
        }
    }

    func adjustWindowHeight(to height: CGFloat) {
        guard let window = self.window else { return }
        
        let minHeight: CGFloat = 200
        let maxHeight: CGFloat = 800
        let safeHeight = max(minHeight, min(maxHeight, height))
        
        var frame = window.frame
        let oldHeight = frame.size.height
        let delta = oldHeight - safeHeight
        
        frame.size.height = safeHeight
        frame.origin.y += delta // Anchor the top edge of the window
        
        window.setFrame(frame, display: true, animate: false)
    }
}


// MARK: - Menu Bar Utility
class MenuBarUtility: NSObject {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let apiBase = "http://localhost:3000"
    private let serverURL = "http://localhost:3000"
    var pollTimer: Timer?
    var uiTimer: Timer?
    var appTrackTimer: Timer?
    var manualSeconds: Int = 0
    var manualStatus: String = "idle"
    var autoSeconds: Int = 0
    var autoStatus: String = "idle"
    var lastSyncTime: Date = Date()
    
    // Location Manager
    var locationManager: CLLocationManager?
    
    var dashboardController: DashboardWindowController?
    var breakPopupController: BreakPopupController?
    var isScreenLocked: Bool = false
    var lastTrackedApp: String = ""
    var idleCheckTimer: Timer?
    var isIdle: Bool = false
    var idleStartTime: Date?
    let idleThresholdSeconds: Double = 300 // 5 minutes
    
    // Break reminder popup tracking
    var lastShownBreakSessionId: Int?
    var lastShownBreakMinutes: Int?
    
    var appMenu: NSMenu!

    // Optimized URLSession: short timeout, persistent connection, no caching
    lazy var localSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest  = 3   // 3s max per request
        config.timeoutIntervalForResource = 5
        config.requestCachePolicy         = .reloadIgnoringLocalCacheData
        config.httpMaximumConnectionsPerHost = 1 // Only one connection to localhost
        return URLSession(configuration: config)
    }()

    override init() {
        super.init()
        dashboardController = DashboardWindowController(serverURL: serverURL)
        breakPopupController = BreakPopupController(serverURL: serverURL)
        setupStatusItem()
        setupNotifications()
        setupLocationManager()
        startTimers()
        // Send initial screen-lock state to server after it's ready
        // This ensures the automatic session is not marked 'active' while screen is locked
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) {
            self.syncInitialScreenState()
        }
    }

    func setupStatusItem() {
        if let button = statusItem.button {
            button.title = "🕒 00:00:00"
            button.action = #selector(menuBarClicked(_:))
            button.target = self
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        
        let menu = NSMenu()

        let dashboardItem = NSMenuItem(title: "Open Dashboard", action: #selector(openDashboard), keyEquivalent: "d")
        dashboardItem.target = self
        menu.addItem(dashboardItem)

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        self.appMenu = menu
    }

    func setupNotifications() {
        // Screen lock/unlock
        let dnc = DistributedNotificationCenter.default()
        dnc.addObserver(forName: NSNotification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) { _ in
            self.isScreenLocked = true
            self.sendEvent("lock")
            self.stopUITimer() // Save CPU when screen is locked
        }
        dnc.addObserver(forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) { _ in
            self.isScreenLocked = false
            self.sendEvent("unlock")
            self.startUITimer() // Resume rendering
            self.fetchStatus(force: true) // Immediate refresh
        }

        // System sleep/wake — sleep doesn't always trigger screen lock
        let wsnc = NSWorkspace.shared.notificationCenter
        wsnc.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { _ in
            self.isScreenLocked = true
            
            // Heuristic: If idle for < 10s, user likely triggered sleep (lid close, menu, key chord)
            let idleTime = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .mouseMoved)
            let reason = (idleTime < 10.0) ? "user_initiated" : "system_idle"
            
            print("[Sleep] System going to sleep. Reason: \(reason) (Idle: \(Int(idleTime))s)")
            self.sendEvent("lock", metadata: ["reason": reason])
        }
        wsnc.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { _ in
            self.isScreenLocked = false
            self.sendEvent("unlock")
        }
        
        // Additional reliable observers for session state
        wsnc.addObserver(forName: NSWorkspace.sessionDidResignActiveNotification, object: nil, queue: .main) { _ in
            self.isScreenLocked = true
            self.sendEvent("lock", metadata: ["reason": "session_resign"])
        }
        wsnc.addObserver(forName: NSWorkspace.sessionDidBecomeActiveNotification, object: nil, queue: .main) { _ in
            self.isScreenLocked = false
            self.sendEvent("unlock")
        }
    }

    func setupLocationManager() {
        locationManager = CLLocationManager()
        locationManager?.delegate = self
        locationManager?.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        locationManager?.distanceFilter = 30.0 // Send updates when moved > 30 meters (power saving)
        
        // Request authorization then start updating
        print("Requesting Location Authorization...")
        locationManager?.requestAlwaysAuthorization()
        locationManager?.startUpdatingLocation()
    }

    func startTimers() {
        // Adaptive polling: started at 5s, will adjust based on server response
        startPollTimer(interval: 5.0)
        
        // Render UI every 1s — only when unlocked
        startUITimer()

        // Track frontmost app every 5s
        appTrackTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
            self.trackFrontmostApp()
        }

        // Check for user idle every 30s
        idleCheckTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { _ in
            self.checkIdleState()
        }

        // Fallback: Force a location update check every 5 minutes if no movement detected
        Timer.scheduledTimer(withTimeInterval: 300.0, repeats: true) { _ in
            print("[Location] Triggering fallback location update check...")
            self.locationManager?.stopUpdatingLocation()
            self.locationManager?.startUpdatingLocation()
        }
        
        // Initial fetch
        self.fetchStatus()
    }

    /// Called once on startup to ensure the server knows the current screen-lock state.
    /// Without this, if the machine was sleeping before the app started, the server
    /// would keep the automatic session 'paused' until the next real unlock event.
    func syncInitialScreenState() {
        // Try to detect screen lock via idle time as a proxy:
        // If the user has been idle for more than 30 seconds, treat as locked.
        let idleTime = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .mouseMoved)
        let idleKey  = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .keyDown)
        let minIdle  = min(idleTime, idleKey)

        let event = (isScreenLocked || minIdle > 30) ? "lock" : "unlock"
        print("[Startup] Syncing initial screen state: \(event) (idle: \(Int(minIdle))s, locked: \(isScreenLocked))")
        sendEvent(event)
    }

    func updateUI() {
        let elapsed = Int(Date().timeIntervalSince(self.lastSyncTime))
        
        var currentManualSeconds = self.manualSeconds
        if self.manualStatus == "active" {
            currentManualSeconds += elapsed
        }
        
        var currentAutoSeconds = self.autoSeconds
        if self.autoStatus == "active" && self.manualStatus != "active" {
            currentAutoSeconds += elapsed
        }
        
        DispatchQueue.main.async {
            guard let button = self.statusItem.button else { return }
            
            if self.manualStatus == "active" {
                button.title = "🏢 \(self.formatTime(currentManualSeconds))"
            } else if self.autoStatus == "active" {
                button.title = "🏠 \(self.formatTime(currentAutoSeconds))"
            } else if self.manualStatus == "paused" {
                button.title = "🏢 \(self.formatTime(currentManualSeconds)) (Paused)"
            } else if self.autoStatus == "paused" {
                button.title = "🏠 \(self.formatTime(currentAutoSeconds)) (Paused)"
            } else if self.manualStatus == "offline" {
                button.title = "🕒 Offline"
            } else {
                button.title = "🕒 Idle"
            }
        }
    }

    func startPollTimer(interval: Double) {
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { _ in
            self.fetchStatus()
        }
        print("[Timer] Poll interval set to \(interval)s")
    }

    func startUITimer() {
        uiTimer?.invalidate()
        // Slowed down to 60s because we no longer show seconds (battery saving)
        uiTimer = Timer.scheduledTimer(withTimeInterval: 60.0, repeats: true) { _ in
            self.updateUI()
        }
    }

    func stopUITimer() {
        uiTimer?.invalidate()
        uiTimer = nil
        print("[Timer] UI Rendering suspended (Power Saving)")
    }

    func fetchStatus(force: Bool = false) {
        guard let url = URL(string: "http://127.0.0.1:3000/status?consume=true") else { return }
        localSession.dataTask(with: url) { data, _, error in
            if let _ = error {
                DispatchQueue.main.async {
                    self.manualStatus = "offline"
                    self.autoStatus = "offline"
                    self.updateUI()
                }
                return
            }
            
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            
            DispatchQueue.main.async {
                if let manual = json["manual"] as? [String: Any] {
                    self.manualSeconds = manual["total_seconds"] as? Int ?? 0
                    self.manualStatus = manual["status"] as? String ?? "idle"
                }
                if let automatic = json["automatic"] as? [String: Any] {
                    self.autoSeconds = automatic["total_seconds"] as? Int ?? 0
                    self.autoStatus = automatic["status"] as? String ?? "idle"
                }

                // Adaptive Poll Logic: If the server suggests a new interval, adjust the timer
                if let suggestedMs = json["suggested_poll_ms"] as? Double {
                    let newInterval = suggestedMs / 1000.0
                    if self.pollTimer?.timeInterval != newInterval && !force {
                        self.startPollTimer(interval: newInterval)
                    }
                }

                // Geofence Optimization: Ensure native monitoring is active for office
                if let lat = json["officeLat"] as? String, let lng = json["officeLng"] as? String,
                   let latVal = Double(lat), let lngVal = Double(lng) {
                    let radius = json["officeRadius"] as? Double ?? 300.0
                    self.updateOfficeGeofence(lat: latVal, lng: lngVal, radius: radius)
                }

                // Handle Pending Notifications relayed from server
                if let notify = json["pending_notification"] as? [String: Any],
                   let title = notify["title"] as? String,
                   let message = notify["message"] as? String {
                    self.showNotification(title: title, message: message)
                }

                // Auto-popup Break Reminder window when continuous work limit reached
                if let breakReminder = json["pending_break_reminder"] as? [String: Any],
                   let minutes = breakReminder["minutes"] as? Int {
                    let sessionId = breakReminder["sessionId"] as? Int ?? 0
                    if sessionId != self.lastShownBreakSessionId || minutes != self.lastShownBreakMinutes {
                        self.lastShownBreakSessionId = sessionId
                        self.lastShownBreakMinutes = minutes
                        
                        print("[Break] New break reminder detected (\(minutes)m, session \(sessionId)). Spawning popup window.")
                        self.breakPopupController?.showWindow()
                    }
                } else {
                    // Reset when there is no pending break reminder
                    self.lastShownBreakSessionId = nil
                    self.lastShownBreakMinutes = nil
                    self.breakPopupController?.hideWindow()
                }

                self.lastSyncTime = Date()
                self.updateUI() // Keep UI fresh on every server sync (5s-20s)
            }
        }.resume()
    }

    func showNotification(title: String, message: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = message
        content.sound = .default
        
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Failed to show native notification: \(error.localizedDescription)")
            }
        }
    }

    // Map of browser names to their AppleScript for fetching the active tab URL
    let browserScripts: [String: String] = [
        "Google Chrome": "tell application \"Google Chrome\" to get URL of active tab of front window",
        "Brave Browser": "tell application \"Brave Browser\" to get URL of active tab of front window",
        "Microsoft Edge": "tell application \"Microsoft Edge\" to get URL of active tab of front window",
        "Arc": "tell application \"Arc\" to get URL of active tab of front window",
        "Safari": "tell application \"Safari\" to get URL of current tab of front window",
        "Firefox": "tell application \"System Events\" to tell process \"Firefox\" to get value of attribute \"AXDocument\" of window 1"
    ]

    /// Extract domain from a URL string (e.g., "https://mail.google.com/inbox" -> "mail.google.com")
    func domainFromURL(_ urlString: String) -> String? {
        guard let url = URL(string: urlString.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = url.host else { return nil }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    func trackFrontmostApp() {
        // Don't track when screen is locked, sleeping, or idle
        guard !isScreenLocked && !isIdle else { return }

        guard let frontApp = NSWorkspace.shared.frontmostApplication,
              let appName = frontApp.localizedName else { return }

        // Skip system processes that aren't real user apps
        let skipApps = ["loginwindow", "ScreenSaverEngine", "UserNotificationCenter"]
        guard !skipApps.contains(appName) else { return }

        var trackedName = appName

        // If it's a known browser, try to get the active tab URL via AppleScript
        if let scriptSource = browserScripts[appName] {
            if let script = NSAppleScript(source: scriptSource) {
                var errorInfo: NSDictionary?
                let result = script.executeAndReturnError(&errorInfo)
                if errorInfo == nil, let urlString = result.stringValue,
                   let domain = domainFromURL(urlString) {
                    trackedName = domain   // e.g., "github.com" instead of "Google Chrome"
                }
                // On error, fall through and use the browser name
            }
        }

        // Send heartbeat — 5 seconds of usage for this tracked name
        guard let url = URL(string: "\(serverURL)/app-heartbeat") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let json: [String: Any] = ["app_name": trackedName, "seconds": 5]
        request.httpBody = try? JSONSerialization.data(withJSONObject: json)
        URLSession.shared.dataTask(with: request).resume()
    }

    func checkIdleState() {
        guard !isScreenLocked else { return }

        // If a call is active (Mic or Camera is "On"), we are NOT idle
        if isCallHardwareActive() {
            if isIdle {
                isIdle = false
                idleStartTime = nil
                sendEvent("unlock")
                print("[Call] Call detected — resuming sessions from idle")
            }
            return
        }

        let idleTime = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .mouseMoved)
        let idleKeyboard = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .keyDown)
        let minIdle = min(idleTime, idleKeyboard)

        if minIdle >= idleThresholdSeconds && !isIdle {
            isIdle = true
            idleStartTime = Date()
            sendEvent("lock") // Pause sessions due to idle
            print("User idle for \(Int(minIdle))s — pausing sessions")
        } else if minIdle < idleThresholdSeconds && isIdle {
            isIdle = false
            var duration = 0
            if let start = idleStartTime {
                duration = Int(Date().timeIntervalSince(start))
            }
            idleStartTime = nil
            
            // Send unlock event with idle return metadata if duration is positive
            if duration > 0 {
                sendEvent("unlock", metadata: ["reason": "idle_return", "duration": duration])
            } else {
                sendEvent("unlock")
            }
            print("User returned from idle after \(duration)s — resuming sessions")
        }
    }

    /// Checks if any microphone or camera is currently active/recording on the system.
    func isCallHardwareActive() -> Bool {
        // Check Camera
        let videoDevices = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .externalUnknown],
            mediaType: .video,
            position: .unspecified
        ).devices
        
        for device in videoDevices {
            // isInUseByAnotherApplication is the most direct indicator for cameras
            if device.isInUseByAnotherApplication {
                return true
            }
        }

        // Check Microphone
        // Note: For Microphones, we check if any session is active.
        let audioSession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInMicrophone, .externalUnknown],
            mediaType: .audio,
            position: .unspecified
        ).devices

        for device in audioSession {
            if device.isInUseByAnotherApplication {
                return true
            }
        }

        return false
    }

    func sendEvent(_ eventType: String, metadata: [String: Any]? = nil) {
        guard let url = URL(string: "\(serverURL)/event") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        var json: [String: Any] = ["event": eventType]
        if let metadata = metadata {
            json["metadata"] = metadata
        }
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: json)
        URLSession.shared.dataTask(with: request).resume()
    }

    func formatTime(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        // Reduced to HH:mm to allow 60s refresh intervals (Power Saving)
        return String(format: "%02d:%02d", h, m)
    }

    func showDashboard() {
        dashboardController?.showWindow()
    }

    @objc func menuBarClicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else { return }
        
        if event.type == .rightMouseUp || event.modifierFlags.contains(.control) {
            statusItem.menu = appMenu
            statusItem.button?.performClick(nil)
            // Remove menu aggressively so next click is captured by button
            DispatchQueue.main.async {
                self.statusItem.menu = nil
            }
        } else {
            showDashboard()
        }
    }

    @objc func openDashboard() {
        showDashboard()
    }

    @objc func quitApp() {
        NSApplication.shared.terminate(nil)
    }
}

// MARK: - CoreLocation Delegate
extension MenuBarUtility: CLLocationManagerDelegate {
    @objc func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        
        let lat = location.coordinate.latitude
        let lng = location.coordinate.longitude
        let acc = location.horizontalAccuracy
        print("[Location] Native Updated: \(lat), \(lng) (Accuracy: \(acc)m)")
        
        // Push to dashboard if open
        dashboardController?.sendLocationToWeb(location)
        
        // Send location to local server
        sendLocationToServer(lat: lat, lng: lng, acc: acc)
        
        // --- POWER SAVING: AUTO-HIBERNATE GPS ---
        // If we have a stable location (accuracy < 50m) and no dashboard is open, 
        // we can stop active GPS and rely on geofencing transitions.
        if acc < 50 && (dashboardController?.window?.isVisible == false || dashboardController?.window == nil) {
            print("[Location] Stable location acquired. Hibernating GPS to save power.")
            manager.stopUpdatingLocation()
        }
    }
    
    func sendLocationToServer(lat: Double, lng: Double, acc: Double) {
        guard let url = URL(string: "\(serverURL)/location") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let json: [String: Any] = ["latitude": lat, "longitude": lng, "accuracy": acc]
        request.httpBody = try? JSONSerialization.data(withJSONObject: json)
        URLSession.shared.dataTask(with: request).resume()
    }
    
    // --- GEOFENCING DELEGATES ---
    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        print("[Geofence] ENTERED Office: \(region.identifier). Resuming GPS for precise tracking.")
        manager.startUpdatingLocation() // Get precise coordinates once moved into range
        fetchStatus(force: true)
    }
    
    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        print("[Geofence] EXITED Office: \(region.identifier).")
        fetchStatus(force: true)
        // Keep GPS off or limited until next significant move or transition
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[Location] Native Error: \(error.localizedDescription)")
    }
    
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status: CLAuthorizationStatus
        if #available(macOS 11.0, *) {
            status = manager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }
        
        print("[Location] Native Authorization Changed: \(status.rawValue)")
        if status == .authorizedAlways {
            manager.startUpdatingLocation()
        }
    }
}

// MARK: - Geofence Helpers
extension MenuBarUtility {
    func updateOfficeGeofence(lat: Double, lng: Double, radius: Double) {
        guard let manager = locationManager else { return }
        
        let identifier = "OfficeGeofence"
        
        // Check if we already have this region monitored to avoid redundant re-arms
        let monitored = manager.monitoredRegions
        if let existing = monitored.first(where: { $0.identifier == identifier }) as? CLCircularRegion {
            if existing.center.latitude == lat && existing.center.longitude == lng && existing.radius == radius {
                return // Already armed with same config
            }
            manager.stopMonitoring(for: existing)
        }
        
        let region = CLCircularRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lng), 
                                     radius: radius, 
                                identifier: identifier)
        region.notifyOnEntry = true
        region.notifyOnExit = true
        
        manager.startMonitoring(for: region)
        print("[Geofence] Armed: \(lat), \(lng) (Radius: \(radius)m)")
    }
}

// Start the app
let app = NSApplication.shared
let appDelegate = AppDelegate()
app.delegate = appDelegate
app.setActivationPolicy(.accessory) // Menu bar only initially
app.run()

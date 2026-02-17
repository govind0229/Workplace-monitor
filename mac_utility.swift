import Foundation
import AppKit

class MenuBarUtility: NSObject {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let serverURL = "http://localhost:3000"
    var pollTimer: Timer?
    var uiTimer: Timer?
    var baseSeconds: Int = 0
    var lastSyncTime: Date = Date()
    var currentStatus: String = "idle"

    override init() {
        super.init()
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
        menu.addItem(NSMenuItem(title: "Open Dashboard", action: #selector(openDashboard), keyEquivalent: "d"))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    func setupNotifications() {
        let dnc = DistributedNotificationCenter.default()
        dnc.addObserver(forName: NSNotification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) { _ in
            self.sendEvent("lock")
        }
        dnc.addObserver(forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) { _ in
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

    @objc func menuBarClicked() {
        // Fallback if no menu
    }

    @objc func openDashboard() {
        if let url = URL(string: serverURL) {
            NSWorkspace.shared.open(url)
        }
    }
}

// Start the app
let app = NSApplication.shared
let delegate = MenuBarUtility()
app.setActivationPolicy(.prohibited) // Hide from dock
app.run()

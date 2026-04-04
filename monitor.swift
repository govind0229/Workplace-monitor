import Foundation
import AppKit

let serverURL = URL(string: "http://localhost:3000/event")!

func sendEvent(_ eventType: String) {
    print("Detected event: \(eventType)")
    var request = URLRequest(url: serverURL)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let json: [String: Any] = ["event": eventType]
    request.httpBody = try? JSONSerialization.data(withJSONObject: json)
    
    let task = URLSession.shared.dataTask(with: request) { data, response, error in
        if let error = error {
            print("Error sending event: \(error)")
        } else {
            print("Successfully sent \(eventType) to server")
        }
    }
    task.resume()
}

// Register for notifications
let dnc = DistributedNotificationCenter.default()

// Lock notification
dnc.addObserver(forName: NSNotification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) { _ in
    sendEvent("lock")
}

// Unlock notification
dnc.addObserver(forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) { _ in
    sendEvent("unlock")
}

print("Monitoring macOS lock/unlock events...")
RunLoop.main.run()

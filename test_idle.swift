import Cocoa

let anyInput = CGEventType(rawValue: UInt32.max)!
let idleAny = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyInput)
let idleMouse = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .mouseMoved)

print("Any Input Idle: \(idleAny)")
print("Mouse Idle: \(idleMouse)")

using System;
using System.Diagnostics;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using Microsoft.Win32;

namespace WorkplaceMonitorTracker
{
    class Program
    {
        private static readonly string ServerUrl = "http://127.0.0.1:3000";
        private static readonly HttpClient HttpClient = new HttpClient();
        private static readonly double IdleThresholdSeconds = 60.0;
        
        private static bool _isIdle = false;
        private static DateTime? _idleStartTime = null;
        private static bool _isScreenLocked = false;
        private static string? _lastAppName = null;
        private static DateTime? _lastAppHeartbeatTime = null;
        
        private static readonly Mutex SingleInstanceMutex = new Mutex(true, "com.workplacemonitor.tracker");

        // Win32 API Imports
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

        [StructLayout(LayoutKind.Sequential)]
        private struct LASTINPUTINFO
        {
            public uint cbSize;
            public uint dwTime;
        }

        [STAThread]
        static void Main(string[] args)
        {
            // Enforce single instance
            if (!SingleInstanceMutex.WaitOne(TimeSpan.Zero, true))
            {
                Console.WriteLine("Another instance of Workplace Monitor Tracker is already running.");
                return;
            }

            Console.WriteLine("Workplace Monitor Tracker Started (Windows)");

            // Subscribe to Windows Session Switch Events (Lock / Unlock / Logoff)
            SystemEvents.SessionSwitch += OnSessionSwitch;

            // Start the main polling thread
            var trackingThread = new Thread(TrackingLoop)
            {
                IsBackground = true
            };
            trackingThread.SetApartmentState(ApartmentState.STA); // Required for UI Automation
            trackingThread.Start();

            // Keep the main thread alive waiting for exit signal
            var exitEvent = new ManualResetEvent(false);
            AppDomain.CurrentDomain.ProcessExit += (s, e) => exitEvent.Set();
            
            // Wait indefinitely
            exitEvent.WaitOne();
            
            // Cleanup
            SystemEvents.SessionSwitch -= OnSessionSwitch;
        }

        private static void TrackingLoop()
        {
            while (true)
            {
                try
                {
                    CheckIdleState();
                    TrackActiveApp();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error in tracking loop: {ex.Message}");
                }
                Thread.Sleep(5000); // Poll every 5 seconds
            }
        }

        private static void TrackActiveApp()
        {
            // Skip tracking if screen is locked or idle
            if (_isScreenLocked || _isIdle)
            {
                _lastAppHeartbeatTime = null;
                return;
            }

            IntPtr hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return;

            GetWindowThreadProcessId(hwnd, out uint pid);
            if (pid == 0) return;

            string rawProcessName = GetProcessName(pid);
            if (string.IsNullOrEmpty(rawProcessName) || rawProcessName.Equals("Unknown", StringComparison.OrdinalIgnoreCase)) return;

            // Filter out system processes
            string[] skipApps = { "idle", "lockapp", "logonui", "screensaver" };
            foreach (var skip in skipApps)
            {
                if (rawProcessName.Equals(skip, StringComparison.OrdinalIgnoreCase)) return;
            }

            string trackedName = NormalizeAppName(rawProcessName);

            // Browser check: extract URL if foreground app is a browser
            string[] browsers = { "chrome", "msedge", "brave", "firefox" };
            bool isBrowser = false;
            foreach (var b in browsers)
            {
                if (rawProcessName.Equals(b, StringComparison.OrdinalIgnoreCase))
                {
                    isBrowser = true;
                    break;
                }
            }

            if (isBrowser)
            {
                string? url = GetBrowserUrl(hwnd, rawProcessName);
                string? domain = ExtractDomain(url);
                if (!string.IsNullOrEmpty(domain))
                {
                    trackedName = domain; // Report domain name (e.g. "github.com")
                }
            }

            DateTime now = DateTime.UtcNow;
            int secondsToReport = 5;
            if (_lastAppHeartbeatTime.HasValue)
            {
                secondsToReport = (int)(now - _lastAppHeartbeatTime.Value).TotalSeconds;
            }
            _lastAppHeartbeatTime = now;

            // Cap at 60s to prevent enormous spikes
            if (secondsToReport > 60) secondsToReport = 60;
            if (secondsToReport <= 0) return;

            double minIdle = GetUserIdleSeconds();

            SendAppHeartbeat(trackedName, secondsToReport, minIdle);
        }

        private static void CheckIdleState()
        {
            if (_isScreenLocked) return;

            double minIdle = GetUserIdleSeconds();

            if (minIdle >= IdleThresholdSeconds && !_isIdle)
            {
                _isIdle = true;
                _idleStartTime = DateTime.UtcNow;
                SendSessionEvent("lock", "system_idle", 0);
                Console.WriteLine($"User idle for {minIdle:F1}s - pausing session.");
            }
            else if (minIdle < IdleThresholdSeconds && _isIdle)
            {
                _isIdle = false;
                int duration = 0;
                if (_idleStartTime.HasValue)
                {
                    duration = (int)(DateTime.UtcNow - _idleStartTime.Value).TotalSeconds;
                }
                _idleStartTime = null;

                int totalIdleDuration = duration > 0 ? duration + (int)IdleThresholdSeconds : 0;
                SendSessionEvent("unlock", "idle_return", totalIdleDuration);
                Console.WriteLine($"User returned from idle after {totalIdleDuration}s - resuming session.");
            }
        }

        private static void OnSessionSwitch(object sender, SessionSwitchEventArgs e)
        {
            if (e.Reason == SessionSwitchReason.SessionLock)
            {
                _isScreenLocked = true;
                _lastAppHeartbeatTime = null;
                SendSessionEvent("lock", "unknown", 0);
                Console.WriteLine("Windows Session Locked.");
            }
            else if (e.Reason == SessionSwitchReason.SessionUnlock)
            {
                _isScreenLocked = false;
                SendSessionEvent("unlock", "unknown", 0);
                Console.WriteLine("Windows Session Unlocked.");
            }
        }

        private static double GetUserIdleSeconds()
        {
            var lii = new LASTINPUTINFO();
            lii.cbSize = (uint)Marshal.SizeOf(lii);
            if (GetLastInputInfo(ref lii))
            {
                uint elapsedTicks = (uint)Environment.TickCount - lii.dwTime;
                return elapsedTicks / 1000.0;
            }
            return 0.0;
        }

        private static string GetProcessName(uint pid)
        {
            try
            {
                using (var proc = Process.GetProcessById((int)pid))
                {
                    return proc.ProcessName;
                }
            }
            catch
            {
                return "Unknown";
            }
        }

        private static string NormalizeAppName(string processName)
        {
            switch (processName.ToLower())
            {
                case "chrome": return "Google Chrome";
                case "msedge": return "Microsoft Edge";
                case "firefox": return "Firefox";
                case "brave": return "Brave Browser";
                case "devenv": return "Visual Studio";
                case "code": return "Visual Studio Code";
                case "explorer": return "Finder";
                case "slack": return "Slack";
                case "teams": return "Microsoft Teams";
                case "discord": return "Discord";
                case "spotify": return "Spotify";
                default:
                    if (string.IsNullOrEmpty(processName)) return "Unknown";
                    return char.ToUpper(processName[0]) + processName.Substring(1);
            }
        }

        private static string? GetBrowserUrl(IntPtr hwnd, string processName)
        {
            try
            {
                AutomationElement root = AutomationElement.FromHandle(hwnd);
                if (root == null) return null;

                if (processName.Equals("chrome", StringComparison.OrdinalIgnoreCase) ||
                    processName.Equals("msedge", StringComparison.OrdinalIgnoreCase) ||
                    processName.Equals("brave", StringComparison.OrdinalIgnoreCase))
                {
                    var editCondition = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit);
                    var edits = root.FindAll(TreeScope.Subtree, editCondition);
                    foreach (AutomationElement edit in edits)
                    {
                        if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out object pattern))
                        {
                            var valuePattern = (ValuePattern)pattern;
                            string value = valuePattern.Current.Value;
                            if (!string.IsNullOrEmpty(value) && value.Contains(".") && !value.Contains(" "))
                            {
                                return value;
                            }
                        }
                    }
                }
                else if (processName.Equals("firefox", StringComparison.OrdinalIgnoreCase))
                {
                    var editCondition = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit);
                    var edits = root.FindAll(TreeScope.Subtree, editCondition);
                    foreach (AutomationElement edit in edits)
                    {
                        if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out object pattern))
                        {
                            var valuePattern = (ValuePattern)pattern;
                            string value = valuePattern.Current.Value;
                            if (!string.IsNullOrEmpty(value) && value.Contains("."))
                            {
                                return value;
                            }
                        }
                    }
                }
            }
            catch
            {
                // UI automation might fail if window is busy or closed
            }
            return null;
        }

        private static string? ExtractDomain(string? url)
        {
            if (string.IsNullOrEmpty(url)) return null;

            url = url.Trim();
            if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                url = url.Substring(7);
            else if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                url = url.Substring(8);

            int slashIdx = url.IndexOf('/');
            if (slashIdx != -1) url = url.Substring(0, slashIdx);

            int colonIdx = url.IndexOf(':');
            if (colonIdx != -1) url = url.Substring(0, colonIdx);

            if (url.StartsWith("www.", StringComparison.OrdinalIgnoreCase) && url.Length > 4)
                url = url.Substring(4);

            return url;
        }

        private static void SendAppHeartbeat(string appName, int seconds, double minIdle)
        {
            try
            {
                string json = $"{{\"app_name\":\"{EscapeJson(appName)}\",\"seconds\":{seconds},\"minIdle\":{minIdle}}}";
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                HttpClient.PostAsync($"{ServerUrl}/app-heartbeat", content).ContinueWith(t => {
                    if (t.IsFaulted) Console.WriteLine($"Failed to send heartbeat: {t.Exception?.Message}");
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending heartbeat: {ex.Message}");
            }
        }

        private static void SendSessionEvent(string eventType, string reason, int duration)
        {
            try
            {
                string json = $"{{\"event\":\"{EscapeJson(eventType)}\",\"metadata\":{{\"reason\":\"{EscapeJson(reason)}\",\"duration\":{duration}}}}}";
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                HttpClient.PostAsync($"{ServerUrl}/event", content).ContinueWith(t => {
                    if (t.IsFaulted) Console.WriteLine($"Failed to send session event: {t.Exception?.Message}");
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending session event: {ex.Message}");
            }
        }

        private static string EscapeJson(string val)
        {
            if (string.IsNullOrEmpty(val)) return "";
            return val.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }
}

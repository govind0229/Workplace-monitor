class WorkplaceMonitor < Formula
  desc "Workplace activity tracker and status sync monitor"
  homepage "https://github.com/user/workplace-monitor"
  url "https://github.com/user/workplace-monitor/archive/refs/tags/v1.0.0.tar.gz"
  sha256 "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  license "MIT"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    # Write execution shim script
    (bin/"workplace-monitor").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/server.js" "$@"
    EOS
  end

  def post_install
    # Initialize workspace directories if needed
  end

  service do
    run [opt_bin/"workplace-monitor"]
    keep_alive true
    log_path var/"log/workplace-monitor.log"
    error_log_path var/"log/workplace-monitor.log"
  end

  test do
    system "#{bin}/workplace-monitor", "--version"
  end
end

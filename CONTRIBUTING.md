# Contributing to Workplace Monitor

First off, thank you for considering contributing to Workplace Monitor! It's people like you that make Workplace Monitor such a great tool.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct. (Please see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details).

## 🏷️ Issue Labels

We use labels to categorize issues. Here is what they mean:

| Label | Description |
| :--- | :--- |
| `bug` | Something isn't working correctly |
| `enhancement` | New feature or request |
| `performance` | CPU/Battery related optimizations |
| `ui` | Visual design or UX improvements |
| `mac-native` | Issues specific to the Swift utility |

## 🛠️ Development Setup

Getting started with Workplace Monitor is straightforward:

1. **Clone & Install**
   ```bash
   git clone https://github.com/your-repo/Workplace-monitor.git
   npm install
   ```

2. **Build Native Binary**
   ```bash
   sh build_app.sh
   ```

3. **Launch Dev Environment**
   ```bash
   sh start.sh
   ```

## 📐 Style Guide

| Component | Standard |
| :--- | :--- |
| **Logic (JS)** | ES6, 4-space indent, `async/await` |
| **Native (Swift)** | Apple API Design Guidelines |
| **Styles (CSS)** | CSS Variable tokens, Performance-first |
| **Commits** | [Conventional Commits](https://www.conventionalcommits.org/) |

## 🚀 Versioning

We use [SemVer](http://semver.org/) for versioning. Releases are automatically handled via the versioning script:
```bash
scripts/bump_version.sh
```

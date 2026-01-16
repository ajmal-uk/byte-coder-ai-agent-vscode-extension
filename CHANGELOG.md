# Changelog

All notable changes to the **Byte Coder AI Agent** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-01-16

### 🎉 Highlights
This patch release focuses on improving chat session management, fixing critical streaming issues, and adding keyboard navigation for popup menus.

### ✨ New Features
- **Arrow Key Navigation for Popups**: Navigate through `@` file mentions and `/` slash commands using **Arrow Up/Down** keys. Press **Enter** or **Tab** to select the highlighted item.
- **Session Restoration**: Chat sessions are now automatically restored when you reopen VS Code, so you can continue right where you left off.
- **Improved Message Tracking**: Added proper tracking of assistant message indices for more reliable message updates during streaming.

### 🐛 Bug Fixes
- **Fixed Streaming State Issues**: Resolved an issue where the streaming state was not properly reset when sending new user messages, which could cause responses to appear in the wrong message bubble.
- **Fixed Message History Sync**: Assistant messages are now properly synced with the message history during streaming, ensuring chat exports and session saves are accurate.
- **Fixed Session Loading**: Improved session loading to properly reset streaming state and hide thinking indicators, preventing ghost UI elements.
- **Fixed Error State Handling**: Error states now properly clean up streaming state, preventing the UI from getting stuck in a "generating" state.

### 🔧 Technical Improvements
- Added `currentAssistantMessageIndex` tracking for precise message updates
- Implemented `restoreLastSession()` method in `ChatViewProvider.ts` for automatic session recovery
- Enhanced `loadSession` handler to properly reset all streaming state
- Improved state persistence with `persistState()` calls after generation completes
- Added `commandPopupSelectedIndex` and `filePopupSelectedIndex` for keyboard navigation state
- Implemented `updateCommandPopupSelection()` and `updateFilePopupSelection()` helpers
- Enhanced keydown handler with ArrowUp/ArrowDown/Tab support for popup navigation

### 📁 Files Changed
| File | Changes |
|------|---------|
| `src/ChatViewHtml.ts` | +100 lines (keyboard navigation, session restoration, message tracking) |
| `src/ChatViewProvider.ts` | +15 lines (restoreLastSession implementation) |

---

## [1.0.0] - 2026-01-16

### 🎉 Initial Release

The first official release of **Byte Coder AI Agent** - your intelligent, context-aware coding companion.

### ✨ Features

#### 🤖 Multi-Agent Architecture
- **IntentAnalyzer Agent**: Understands your coding intent and extracts relevant keywords
- **FileFinder Agent**: Intelligently discovers relevant files in your workspace
- **CodeExtractor Agent**: AST-aware extraction of relevant code sections
- **RelevanceScorer Agent**: Scores and ranks code snippets for optimal context

#### 💬 Premium Chat Experience
- **Glassmorphism UI**: Beautiful, modern interface with smooth animations
- **@ File Mentions**: Reference any file in your workspace by typing `@`
- **/ Slash Commands**: Quick actions for common tasks (`/explain`, `/fix`, `/refactor`, etc.)
- **Session History**: Persistent conversation history with quick access drawer
- **Export to Markdown**: Save your conversations for documentation

#### ⌨️ Context Actions
- **Explain Selection** (`Cmd+Alt+E`): Get detailed explanations of selected code
- **Fix Bugs** (`Cmd+Alt+F`): Automatically detect and fix issues
- **Refactor Code** (`Cmd+Alt+R`): Improve code structure and readability
- **Quick Ask** (`Cmd+Alt+A`): Ask custom questions about selected code
- **Generate Tests**: Create unit tests for your code
- **Generate Docs**: Add documentation and comments
- **Optimize Performance**: Get optimization suggestions
- **Security Audit**: Check for security vulnerabilities
- **Code Review**: Get comprehensive code reviews

#### 🎨 UI/UX Highlights
- Dynamic theming that adapts to your VS Code theme
- Real-time streaming responses with typing indicators
- Copy code blocks with one click
- Stop generation anytime
- Responsive design for all panel sizes

#### ⚙️ Configuration Options
- Custom instructions to personalize AI behavior
- Auto-context mode for intelligent file gathering
- Debug mode for search agent transparency

### 📦 Technical Details
- Built with TypeScript for VS Code
- WebSocket-based communication for real-time streaming
- Semantic code search capabilities
- Context-aware file analysis

---

## How to Update

To update to the latest version:
1. Open VS Code
2. Go to Extensions (`Cmd+Shift+X`)
3. Find "Byte Coder AI Agent"
4. Click "Update" if available

Or install directly:
```bash
code --install-extension uthakkan.byte-coder-ai-agent
```

---

## Support

- **Issues**: [GitHub Issues](https://github.com/ajmal-uk/byte-coder-ai-agent/issues)
- **Sponsor**: [Buy Me a Coffee](https://www.buymeacoffee.com/ajmal.uk)
- **Website**: [uthakkan.pythonanywhere.com](https://uthakkan.pythonanywhere.com)

import { ChatViewHtml } from "./ChatViewHtml";

import * as vscode from 'vscode';
import { ByteAIClient } from './byteAIClient';
import { ContextManager } from './ContextManager';
import { SearchAgent } from './SearchAgent';

export class ChatPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'byteAI.chatView';
    private _view?: vscode.WebviewView;
    private _client: ByteAIClient;
    private _contextManager: ContextManager;
    private _searchAgent: SearchAgent;
    private _currentSessionId: string;
    private _history: Array<{ role: 'user' | 'assistant', text: string }> = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._client = new ByteAIClient();
        this._contextManager = new ContextManager();
        this._searchAgent = new SearchAgent();
        this._currentSessionId = Date.now().toString();
        this._history = [];
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('byteAI')) {
                this.handleGetSettings();
            }
        });

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.value);
                    break;
                case 'newChat':
                    this.clearChat();
                    break;
                case 'getSessions':
                    await this.getSessions();
                    break;
                case 'loadSession':
                    await this.loadSession(data.id);
                    break;
                case 'deleteSession':
                    await this.deleteSession(data.id);
                    break;
                case 'renameSession':
                    await this.renameSession(data.id, data.title);
                    break;
                case 'clearAllSessions':
                    await this.clearAllSessions();
                    break;
                case 'copyCode':
                    vscode.env.clipboard.writeText(data.value);
                    break;
                case 'insertCode':
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        editor.edit(editBuilder => {
                            if (editor.selection.isEmpty) {
                                editBuilder.insert(editor.selection.active, data.value);
                            } else {
                                editBuilder.replace(editor.selection, data.value);
                            }
                        });
                        vscode.window.showInformationMessage('Code inserted successfully!');
                    } else {
                        vscode.window.showWarningMessage('No active editor to insert code into.');
                    }
                    break;
                case 'getFiles':
                    const query = data.query ? data.query.toLowerCase() : '';
                    // Search for files (limit to 1000 to keep it fast but broad)
                    const allFiles = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**}', 1000);

                    const scoredFiles = allFiles.map(f => {
                        const relativePath = vscode.workspace.asRelativePath(f);
                        const fileName = relativePath.split('/').pop() || '';
                        const lowerPath = relativePath.toLowerCase();
                        const lowerName = fileName.toLowerCase();

                        let score = 0;
                        if (!query) {
                            score = 1; // Default visibility
                        } else {
                            // Exact filename match
                            if (lowerName === query) score = 100;
                            // Exact path match
                            else if (lowerPath === query) score = 90;
                            // Filename starts with query
                            else if (lowerName.startsWith(query)) score = 80;
                            // Path contains query
                            else if (lowerPath.includes(query)) score = 50;
                            else {
                                // Fuzzy match: characters must appear in order
                                let qIdx = 0;
                                let pIdx = 0;
                                let matchCount = 0;
                                while (qIdx < query.length && pIdx < lowerPath.length) {
                                    if (lowerPath[pIdx] === query[qIdx]) {
                                        matchCount++;
                                        qIdx++;
                                    }
                                    pIdx++;
                                }
                                // Only count if we matched most of the query
                                if (matchCount === query.length) score = 20;
                            }
                        }
                        return { file: f, path: relativePath, score };
                    });

                    // Sort: Descending score, then shorter paths, then alphabetical
                    const filteredFiles = scoredFiles
                        .filter(x => x.score > 0)
                        .sort((a, b) => {
                            if (a.score !== b.score) return b.score - a.score;
                            if (a.path.length !== b.path.length) return a.path.length - b.path.length;
                            return a.path.localeCompare(b.path);
                        })
                        .slice(0, 50) // Return top 50
                        .map(x => ({
                            path: x.path,
                            fullPath: x.file.fsPath
                        }));

                    // Add Special Items
                    const specialItems = [
                        { path: 'problems', fullPath: 'Current Problems & Errors' },
                        { path: 'clipboard', fullPath: 'Clipboard Content' }
                    ];

                    specialItems.forEach(item => {
                        if (item.path.includes(query) || item.path === query) {
                            filteredFiles.unshift(item);
                        }
                    });

                    this._view?.webview.postMessage({ type: 'fileList', files: filteredFiles });
                    break;
                case 'stopGeneration':
                    this._client.disconnect();
                    break;
                case 'exportChat':
                    await this.exportChatAsMarkdown();
                    break;
                case 'regenerate':
                    await this.handleRegenerate(data.index);
                    break;
                case 'editMessage':
                    await this.handleEditMessage(data.index);
                    break;
                case 'executeCommand':
                    await this.runCommand(data.command);
                    break;
                case 'error':
                    vscode.window.showErrorMessage('Webview Error: ' + data.value);
                    break;
                case 'getSettings':
                    await this.handleGetSettings();
                    break;
                case 'saveSettings':
                    await this.handleSaveSettings(data.value);
                    break;
            }
        });
    }

    public async clearChat() {
        this._client.resetSession();
        this._currentSessionId = Date.now().toString();
        this._history = [];
        this._view?.webview.postMessage({ type: 'loadSession', history: this._history });
        // Don't save empty sessions - they'll be saved when user sends first message
    }

    public async runCommand(command: string) {
        if (!this._view) {
            await vscode.commands.executeCommand('byteAI.chatView.focus');
        }

        const editor = vscode.window.activeTextEditor;
        let text = "";
        if (editor) {
            const selection = editor.selection;
            if (!selection.isEmpty) {
                text = editor.document.getText(selection);
            }
        }

        const prompts: { [key: string]: string } = {
            'explain': "Act as a Senior Software Architect. Deeply analyze the following code. Explain its logical flow, architectural pattern, potential side effects, and any performance bottlenecks. Use clear headings and bullet points.\n\nCode:\n```\n" + text + "\n```",
            'fix': "Act as an Expert Debugger. Analyze the following code for bugs, race conditions, memory leaks, and logical errors. Fix the issues and explain the root cause of each bug. Provide the corrected code block.\n\nCode:\n```\n" + text + "\n```",
            'refactor': "Act as a Clean Code Expert. Refactor the following code to strictly follow SOLID principles, DRY, and modern best practices (ES6+ for JS/TS). Improve readability, maintainability, and efficiency. Explain the key improvements made.\n\nCode:\n```\n" + text + "\n```",
            'test': "Generate comprehensive unit tests for the following code. Cover happy paths, edge cases, and potential failure modes. Use modern testing frameworks (e.g., Jest/Vitest for JS, Pytest for Python). Mock external dependencies where appropriate.\n\nCode:\n```\n" + text + "\n```",
            'doc': "Generate professional, industry-standard documentation (e.g., JSDoc/TSDoc/Docstring) for the following code. Include parameter descriptions, return values, exceptions, and usage examples.\n\nCode:\n```\n" + text + "\n```",
            'optimize': "Act as a Performance Engineer. Analyze this code for performance issues including time complexity, memory usage, unnecessary computations, and caching opportunities. Provide an optimized version with benchmarking suggestions.\n\nCode:\n```\n" + text + "\n```",
            'security': "Act as a Security Expert. Perform a thorough security audit on this code. Check for: XSS, SQL injection, CSRF, authentication flaws, data exposure, insecure dependencies, and other OWASP Top 10 vulnerabilities. Provide fixes for each issue found.\n\nCode:\n```\n" + text + "\n```",
            'review': "Act as a Senior Code Reviewer. Provide a comprehensive code review covering: code quality, best practices, potential bugs, edge cases, error handling, naming conventions, and architecture concerns. Rate the code quality 1-10 and provide actionable feedback.\n\nCode:\n```\n" + text + "\n```",
            'convert': "Convert this code to a different programming language while maintaining the same logic and structure. Ask me which language to convert to if not specified.\n\nCode:\n```\n" + text + "\n```"
        };

        const message = text ? prompts[command] : `/${command}`;

        if (message) {
            this._view?.webview.postMessage({ type: 'setAndSendMessage', value: message });
        }
    }

    public async quickAsk(question: string) {
        if (!this._view) {
            await vscode.commands.executeCommand('byteAI.chatView.focus');
        }

        const editor = vscode.window.activeTextEditor;
        let text = "";
        if (editor) {
            const selection = editor.selection;
            if (!selection.isEmpty) {
                text = editor.document.getText(selection);
            }
        }

        if (text) {
            const message = `${question}\n\nCode:\n\`\`\`\n${text}\n\`\`\``;
            this._view?.webview.postMessage({ type: 'setAndSendMessage', value: message });
        } else {
            this._view?.webview.postMessage({ type: 'setAndSendMessage', value: question });
        }
    }

    private async handleRegenerate(index?: number) {
        if (this._history.length === 0) return;

        // If index is provided, we need to remove everything from that index onwards
        // But we need to find the user message before it to re-run
        let userMsgText = "";

        if (index !== undefined) {
            // Validate index
            if (index < 0 || index >= this._history.length) return;

            const msg = this._history[index];
            if (msg.role === 'assistant') {
                // We want to regenerate this assistant response.
                // So we need to remove this message and everything after it.
                // And user message is at index-1
                if (index > 0 && this._history[index - 1].role === 'user') {
                    userMsgText = this._history[index - 1].text;
                    // Slice up to index-1 (exclusive), so we keep everything BEFORE the user message
                    this._history = this._history.slice(0, index - 1);
                } else {
                    return; // Can't regenerate if no preceding user message
                }
            }
        } else {
            // Fallback to old behavior (last message)
            const lastMsg = this._history[this._history.length - 1];
            if (lastMsg.role === 'assistant') {
                this._history.pop();
            }
            const lastUserMsg = this._history[this._history.length - 1];
            if (lastUserMsg && lastUserMsg.role === 'user') {
                userMsgText = lastUserMsg.text;
                // do not pop user message, just re-run response generation
            }
        }

        if (userMsgText) {
            // Update view to reflect history change
            this._view?.webview.postMessage({ type: 'loadSession', history: this._history });
            // Trigger generation
            await this.handleUserMessage(userMsgText, true);
        }
    }

    private async handleEditMessage(index: number) {
        if (this._history.length === 0) return;
        if (index < 0 || index >= this._history.length) return;

        const msg = this._history[index];
        if (msg.role === 'user') {
            // We want to edit this user message.
            // Remove this message and everything after it.
            this._history = this._history.slice(0, index);

            // Reload session view (to reflect removed messages)
            this._view?.webview.postMessage({ type: 'loadSession', history: this._history });

            // Set input box
            this._view?.webview.postMessage({ type: 'setAndSendMessage', value: msg.text, justSet: true });
        }
    }

    private async handleUserMessage(message: string, shouldUpdateView: boolean = false) {
        if (!this._view) return;

        try {
            this._history.push({ role: 'user', text: message });
            await this.saveCurrentSession();

            if (shouldUpdateView) {
                this._view.webview.postMessage({ type: 'addMessage', role: 'user', value: message });
                this._view.webview.postMessage({ type: 'setGenerating' }); // Show typing indicator
            }

            // 1. Resolve Context from @mentions or auto-detect current file
            let contextMsg = message;
            const mentionRegex = /@([^\s]+)/g;
            const matches = message.match(mentionRegex);

            if (matches && matches.length > 0) {
                // User explicitly mentioned files with @
                const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**}');
                let contextBlock = "\n\n--- CONTEXT ---\n";
                let filesFound = 0;

                for (const match of matches) {
                    const filename = match.substring(1); // remove @
                    const lowerFilename = filename.toLowerCase();

                    // 1. Handle @problems
                    if (lowerFilename === 'problems') {
                        const diagnostics = vscode.languages.getDiagnostics();
                        let problemsText = "";
                        diagnostics.forEach(([uri, diags]) => {
                            if (diags.length > 0) {
                                problemsText += `File: ${vscode.workspace.asRelativePath(uri)}\n`;
                                diags.forEach(d => {
                                    problemsText += `  - [${vscode.DiagnosticSeverity[d.severity]}] Line ${d.range.start.line + 1}: ${d.message}\n`;
                                });
                            }
                        });
                        if (problemsText) {
                            contextBlock += `\n### PROBLEMS REPORT\n\`\`\`\n${problemsText}\n\`\`\`\n`;
                            filesFound++;
                        } else {
                            contextBlock += `\n### PROBLEMS REPORT\nNo problems found.\n`;
                            filesFound++;
                        }
                        continue;
                    }

                    // 2. Handle @clipboard
                    if (lowerFilename === 'clipboard') {
                        const clipText = await vscode.env.clipboard.readText();
                        contextBlock += `\n### CLIPBOARD CONTENT\n\`\`\`\n${clipText}\n\`\`\`\n`;
                        filesFound++;
                        continue;
                    }

                    // 3. Find best matching file with multiple strategies

                    // Find best matching file with multiple strategies
                    let file = files.find(f => {
                        const relativePath = vscode.workspace.asRelativePath(f).toLowerCase();
                        const fsPath = f.fsPath.toLowerCase();
                        const baseName = relativePath.split('/').pop() || '';

                        if (relativePath === lowerFilename) return true;
                        if (relativePath.endsWith(lowerFilename)) return true;
                        if (fsPath.endsWith(lowerFilename)) return true;
                        if (baseName === lowerFilename) return true;
                        if (relativePath.includes(lowerFilename)) return true;

                        return false;
                    });

                    if (file) {
                        try {
                            const content = await vscode.workspace.fs.readFile(file);
                            const textContent = new TextDecoder().decode(content);
                            const relativePath = vscode.workspace.asRelativePath(file);
                            const ext = relativePath.split('.').pop() || 'text';

                            // Use ContextManager for smart extraction
                            const contextItem = this._contextManager.addFileWithQuery(
                                relativePath,
                                textContent,
                                ext,
                                message
                            );

                            const extractedNote = contextItem.extracted
                                ? ` (smart extracted from ${contextItem.fullSize} chars)`
                                : '';
                            contextBlock += `File: ${relativePath}${extractedNote}\n\`\`\`${ext}\n${contextItem.content}\n\`\`\`\n\n`;
                            filesFound++;
                        } catch (e) {
                            console.error('Error reading context file:', file.fsPath, e);
                            contextBlock += `File: ${filename} (Error reading file)\n\n`;
                        }
                    } else {
                        contextBlock += `File: ${filename} (Not found in workspace)\n\n`;
                    }
                }

                if (filesFound > 0) {
                    contextMsg += contextBlock;
                }
            } else if (vscode.workspace.getConfiguration('byteAI').get<boolean>('autoContext')) {
                // No @ mentions - use SearchAgent to find relevant context
                const editor = vscode.window.activeTextEditor;
                const activeFilePath = editor ? vscode.workspace.asRelativePath(editor.document.uri) : undefined;

                // Use SearchAgent to find relevant files
                const searchContext = await this._searchAgent.search(message, activeFilePath);

                if (searchContext) {
                    contextMsg += searchContext;
                } else if (editor) {
                    // Fallback: include active file if no search results
                    const document = editor.document;
                    const fileName = vscode.workspace.asRelativePath(document.uri);
                    const language = document.languageId;
                    const content = document.getText();

                    const contextItem = this._contextManager.addFileWithQuery(
                        fileName,
                        content,
                        language,
                        message
                    );

                    const extractedNote = contextItem.extracted
                        ? ` (smart extracted from ${contextItem.fullSize} chars)`
                        : '';
                    let contextBlock = "\n\n--- CURRENT FILE CONTEXT ---\n";
                    contextBlock += `**Active File:** ${fileName} (${language})${extractedNote}\n`;
                    contextBlock += `\`\`\`${language}\n${contextItem.content}\n\`\`\`\n`;
                    contextMsg += contextBlock;
                }
            }

            // Track conversation for context continuity
            this._contextManager.addConversationTurn('user', message);

            // Stream response
            let fullResponse = "";
            await this._client.streamResponse(contextMsg, (chunk) => {
                fullResponse += chunk;
                this._view?.webview.postMessage({ type: 'addResponse', value: fullResponse, isStream: true });
            }, (err) => {
                this._view?.webview.postMessage({ type: 'error', value: err.message });
            });

            this._history.push({ role: 'assistant', text: fullResponse });
            this._contextManager.addConversationTurn('assistant', fullResponse);
            this._view.webview.postMessage({ type: 'addResponse', value: fullResponse, isStream: false });
            await this.saveCurrentSession();

        } catch (error: any) {
            console.error('Chat Error:', error);
            this._view.webview.postMessage({ type: 'error', value: error.message || "Unknown error" });
        }
    }

    private async handleNewChat() {
        this.clearChat();
    }

    private async saveCurrentSession() {
        // Only save sessions that have actual user messages
        if (this._history.length === 0) {
            return;
        }

        const sessions = this._context.globalState.get<any[]>('byteAI_sessions') || [];
        const existingIdx = sessions.findIndex(s => s.id === this._currentSessionId);

        // Get first user message for title, skip empty sessions
        const firstUserMessage = this._history.find(m => m.role === 'user')?.text;
        if (!firstUserMessage) {
            return; // Don't save sessions without user messages
        }

        const sessionData = {
            id: this._currentSessionId,
            title: firstUserMessage.slice(0, 50),
            timestamp: Date.now(),
            history: this._history
        };

        if (existingIdx !== -1) {
            sessions[existingIdx] = sessionData;
        } else {
            sessions.unshift(sessionData);
        }

        while (sessions.length > 20) sessions.pop(); // Limit to 20
        await this._context.globalState.update('byteAI_sessions', sessions);
    }

    private async getSessions() {
        const sessions = this._context.globalState.get<any[]>('byteAI_sessions') || [];
        // Filter out any sessions that have no history or empty titles
        const validSessions = sessions.filter(s =>
            s.history && s.history.length > 0 && s.title && s.title !== 'New Session'
        );
        this._view?.webview.postMessage({
            type: 'sessionList',
            sessions: validSessions.map(s => ({ id: s.id, title: s.title, timestamp: s.timestamp })),
            currentSessionId: this._currentSessionId
        });
    }

    private async loadSession(id: string) {
        const sessions = this._context.globalState.get<any[]>('byteAI_sessions') || [];
        const session = sessions.find(s => s.id === id);
        if (session) {
            this._currentSessionId = session.id;
            this._history = session.history || [];
            this._view?.webview.postMessage({ type: 'loadSession', history: this._history });
        }
    }

    private async deleteSession(id: string) {
        let sessions = this._context.globalState.get<any[]>('byteAI_sessions') || [];
        sessions = sessions.filter(s => s.id !== id);
        await this._context.globalState.update('byteAI_sessions', sessions);
        await this.getSessions();
        if (id === this._currentSessionId) this.handleNewChat();
    }

    private async renameSession(id: string, currentTitle: string) {
        const newTitle = await vscode.window.showInputBox({
            prompt: 'Rename Session',
            value: currentTitle,
            placeHolder: 'Enter new session name'
        });

        if (newTitle && newTitle !== currentTitle) {
            const sessions = this._context.globalState.get<any[]>('byteAI_sessions') || [];
            const idx = sessions.findIndex(s => s.id === id);
            if (idx !== -1) {
                sessions[idx].title = newTitle;
                await this._context.globalState.update('byteAI_sessions', sessions);
                await this.getSessions();
            }
        }
    }

    private async clearAllSessions() {
        await this._context.globalState.update('byteAI_sessions', []);
        this.handleNewChat();
    }

    private async exportChatAsMarkdown() {
        if (this._history.length === 0) {
            vscode.window.showWarningMessage('No messages to export.');
            return;
        }

        let markdown = `# Byte AI Chat Export\n\n`;
        markdown += `**Date:** ${new Date().toLocaleString()}\n\n`;
        markdown += `---\n\n`;

        for (const msg of this._history) {
            if (msg.role === 'user') {
                markdown += `## 👤 User\n\n${msg.text}\n\n`;
            } else {
                markdown += `## 🤖 Byte AI\n\n${msg.text}\n\n`;
            }
            markdown += `---\n\n`;
        }

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`byte-ai-chat-${Date.now()}.md`),
            filters: { 'Markdown': ['md'], 'All Files': ['*'] }
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(markdown, 'utf8'));
            vscode.window.showInformationMessage(`Chat exported to ${uri.fsPath}`);
        }
    }


    private _getHtmlForWebview(webview: vscode.Webview) {
        const icons = {
            user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
            bot: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>',
            send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
            plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
            history: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
            copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
            check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            zap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
            trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
            stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>',
            download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
            thumbsUp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>',
            thumbsDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path></svg>',
            file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>',
            edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
            refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
            settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>'
        };

        return ChatViewHtml.getHtml(webview, this._extensionUri, icons);
    }
    private async handleGetSettings() {
        const config = vscode.workspace.getConfiguration('byteAI');
        const settings = {
            customInstructions: config.get<string>('customInstructions'),
            temperature: config.get<number>('temperature'),
            autoContext: config.get<boolean>('autoContext')
        };
        this._view?.webview.postMessage({ type: 'updateSettings', value: settings });
    }

    private async handleSaveSettings(settings: any) {
        const config = vscode.workspace.getConfiguration('byteAI');
        await config.update('customInstructions', settings.customInstructions, vscode.ConfigurationTarget.Global);
        await config.update('temperature', settings.temperature, vscode.ConfigurationTarget.Global);
        await config.update('autoContext', settings.autoContext, vscode.ConfigurationTarget.Global);
        await this.handleGetSettings();
    }
}

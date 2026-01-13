import * as vscode from 'vscode';
import { ByteAIClient } from './byteAIClient';
import { TerminalManager } from './terminalAccess';

export class ChatPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'byteAI.chatView';
    private _view?: vscode.WebviewView;
    private _client: ByteAIClient;
    private _terminalManager: TerminalManager;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._client = new ByteAIClient();
        this._terminalManager = new TerminalManager();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.value);
                    break;
            }
        });
    }

    public clearChat() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearChat' });
        }
    }

    // Called by the extension commands (e.g., from Right Click)
    public async runCommand(command: 'explain' | 'fix' | 'doc') {
        if (!this._view) {
            // Focus the view if it's not visible (best effort)
            await vscode.commands.executeCommand('byteAI.chatView.focus');
        }

        let message = "";
        switch (command) {
            case 'explain': message = "/explain"; break;
            case 'fix': message = "/fix"; break;
            case 'doc': message = "/doc"; break;
        }

        // Simulate user typing this
        if (this._view) {
            this._view.webview.postMessage({ type: 'addResponse', value: `*Running command: ${message}*` });
            await this.handleUserMessage(message);
        }
    }

    private async handleUserMessage(message: string) {
        if (!this._view) { return; }

        let fullPrompt = message;

        // 1. Gather Context & Diagnostics
        const editor = vscode.window.activeTextEditor;
        let contextBlock = "";
        let diagnosticsBlock = "";

        if (editor) {
            const document = editor.document;
            const selection = editor.selection;
            const text = selection.isEmpty ? document.getText() : document.getText(selection);
            const rangeInfo = selection.isEmpty ? "Full File" : `Lines ${selection.start.line + 1}-${selection.end.line + 1}`;

            // Fetch Diagnostics (Errors/Warnings)
            const diagnostics = vscode.languages.getDiagnostics(document.uri);
            if (diagnostics.length > 0) {
                const diagStrings = diagnostics.map(d =>
                    `[${vscode.DiagnosticSeverity[d.severity]}] Line ${d.range.start.line + 1}: ${d.message}`
                ).join('\n');
                diagnosticsBlock = `\n\nERRORS DETECTED:\n${diagStrings}\n`;
            }

            contextBlock = `\n\nCONTEXT:\nFile: ${document.fileName}\nRange: ${rangeInfo}\nLanguage: ${document.languageId}\n${diagnosticsBlock}Code:\n\`\`\`${document.languageId}\n${text}\n\`\`\`\n`;
        }

        // 2. Parse Slash Commands
        if (message.startsWith('/')) {
            const cmd = message.split(' ')[0];
            if (cmd === '/explain') {
                fullPrompt = `Explain the following code in detail:${contextBlock}`;
            } else if (cmd === '/fix') {
                fullPrompt = `Analyze the following code, especially the errors, and provide a fixed version:${contextBlock}`;
            } else if (cmd === '/doc') {
                fullPrompt = `Generate documentation (docstrings/comments) for the following code:${contextBlock}`;
            } else {
                // Generic slash command or just passing through
                fullPrompt = `${message}\n${contextBlock}`;
            }
        } else {
            // Normal chat - only append context if it seems relevant or always?
            // Copilot usually appends context implicitly.
            // We'll append it but tell AI to use it if needed.
            // To avoid token limits on huge files, we might stick to selection or just sending it.
            // For now, let's send it.
            fullPrompt = `${message}\n${contextBlock}`;
        }

        try {
            // Stream response and wait for completion
            const fullResponse = await this._client.streamResponse(
                fullPrompt,
                (chunk) => {
                    this._view?.webview.postMessage({ type: 'addResponse', value: chunk });
                },
                (err) => {
                    this._view?.webview.postMessage({ type: 'addResponse', value: `Error: ${err}` });
                    vscode.window.showErrorMessage(`Byte AI Connection Error: ${err}`);
                }
            );

            // Process commands after response is complete
            if (fullResponse) {
                await this._terminalManager.processAndExecute(fullResponse);
            }

        } catch (e) {
            vscode.window.showErrorMessage(`Byte AI Error: ${e}`);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Byte AI</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-sideBar-background);
                }
                .chat-container {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    padding: 15px;
                    padding-bottom: 60px; /* Space for input */
                }
                .message {
                    padding: 12px 16px;
                    border-radius: 12px;
                    position: relative;
                    word-wrap: break-word;
                    line-height: 1.5;
                    font-size: 13px;
                }
                .user {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    align-self: flex-end;
                    max-width: 85%;
                    border-bottom-right-radius: 2px;
                }
                .assistant {
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-widget-border);
                    align-self: flex-start;
                    max-width: 90%;
                    border-bottom-left-radius: 2px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .assistant pre {
                    background: var(--vscode-textBlockQuote-background);
                    padding: 8px;
                    border-radius: 4px;
                    overflow-x: auto;
                }
                .input-container {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: var(--vscode-sideBar-background);
                    padding: 15px;
                    border-top: 1px solid var(--vscode-panel-border);
                    display: flex;
                }
                input {
                    flex: 1;
                    padding: 10px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    outline: none;
                }
                input:focus {
                    border-color: var(--vscode-focusBorder);
                }
            </style>
        </head>
        <body>
            <div class="chat-container" id="chat"></div>
            <div class="input-container">
                 <input type="text" id="input" placeholder="Ask Byte Coder Agent..." />
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const chat = document.getElementById('chat');
                const input = document.getElementById('input');
                let currentAssistantMessageDiv = null;

                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const text = input.value;
                        if (!text) return;
                        addMessage('user', text);
                        vscode.postMessage({ type: 'sendMessage', value: text });
                        input.value = '';
                        currentAssistantMessageDiv = null;
                    }
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'addResponse':
                            updateAssistantMessage(message.value);
                            break;
                        case 'clearChat':
                            chat.innerHTML = '';
                            break;
                    }
                });

                function addMessage(role, text) {
                    const div = document.createElement('div');
                    div.className = 'message ' + role;
                    div.innerText = text;
                    chat.appendChild(div);
                    window.scrollTo(0, document.body.scrollHeight);
                }

                function updateAssistantMessage(text) {
                    if (!currentAssistantMessageDiv) {
                        currentAssistantMessageDiv = document.createElement('div');
                        currentAssistantMessageDiv.className = 'message assistant';
                        chat.appendChild(currentAssistantMessageDiv);
                    }
                    currentAssistantMessageDiv.innerText = text; 
                    window.scrollTo(0, document.body.scrollHeight);
                }
            </script>
        </body>
        </html>`;
    }
}

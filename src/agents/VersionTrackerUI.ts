/**
 * VersionTrackerUI - Real-time version tracking interface components
 * Provides side panel version history and inline version indicators
 */

import * as vscode from 'vscode';
import { RealTimeVersionTracker } from './RealTimeVersionTracker';

export class VersionTrackerUI {
    private versionTracker: RealTimeVersionTracker;
    private sidePanel: vscode.WebviewPanel | undefined;
    private inlineVersionProvider: InlineVersionProvider;

    constructor(versionTracker: RealTimeVersionTracker) {
        this.versionTracker = versionTracker;
        this.inlineVersionProvider = new InlineVersionProvider();
    }

    public activate(context: vscode.ExtensionContext): void {
        // Create side panel
        this.createSidePanel();
        
        // Register inline version provider
        this.inlineVersionProvider.activate(context);
        
        // Register UI commands
        const commands = [
            vscode.commands.registerCommand('versionUI.toggleSidePanel', () => this.toggleSidePanel()),
            vscode.commands.registerCommand('versionUI.showInlineVersion', () => this.showInlineVersion()),
            vscode.commands.registerCommand('versionUI.quickRevert', () => this.quickRevert()),
            vscode.commands.registerCommand('versionUI.quickCompare', () => this.quickCompare()),
            vscode.commands.registerCommand('versionUI.createCheckpoint', () => this.createCheckpoint()),
        ];

        context.subscriptions.push(...commands);
    }

    private createSidePanel(): void {
        this.sidePanel = vscode.window.createWebviewPanel(
            'versionTrackerSidePanel',
            'Version History',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.updateSidePanelContent();
        
        this.sidePanel.onDidDispose(() => {
            this.sidePanel = undefined;
        });

        this.sidePanel.webview.onDidReceiveMessage(async (message) => {
            await this.handlePanelMessage(message);
        });
    }

    private updateSidePanelContent(): void {
        if (!this.sidePanel) {return;}

        this.sidePanel.webview.html = this.getSidePanelHtml(this.sidePanel.webview);
    }

    private getSidePanelHtml(webview: vscode.Webview): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Version Tracker</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Segoe UI', system-ui, sans-serif; 
                    background: var(--vscode-editor-background, #1e1e1e);
                    color: var(--vscode-editor-foreground, #d4d4d4);
                    padding: 16px;
                    height: 100vh;
                    overflow: hidden;
                }
                .container {
                    display: flex; flex-direction: column; height: 100vh;
                }
                .header {
                    padding: 16px 0; border-bottom: 1px solid var(--vscode-panel-border, #e1e1e1);
                    margin-bottom: 16px;
                }
                .header-title {
                    font-size: 18px; font-weight: 600; margin-bottom: 8px;
                }
                .actions {
                    display: flex; gap: 8px; flex-wrap: wrap;
                }
                .btn {
                    padding: 8px 16px; font-size: 12px; border: none; border-radius: 6px;
                    background: var(--vscode-button-background, #007acc); color: white; cursor: pointer;
                    display: flex; align-items: center; gap: 6px;
                }
                .btn:hover { background: var(--vscode-button-hoverBackground, #0062a3); }
                .btn.secondary { background: var(--vscode-button-secondaryBackground, #333); }
                .btn.danger { background: var(--vscode-errorForeground, #f14c4c); }
                .btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .content {
                    flex: 1; overflow-y: auto; padding-bottom: 16px;
                }
                .file-item {
                    margin-bottom: 16px; border: 1px solid var(--vscode-panel-border, #e1e1e1);
                    border-radius: 8px; overflow: hidden;
                }
                .file-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 12px 16px; background: var(--vscode-sideBar-background, #252526);
                    cursor: pointer;
                }
                .file-header:hover { background: var(--vscode-list-hoverBackground, #2a2d2a); }
                .file-name { font-weight: 600; font-size: 14px; }
                .file-status { 
                    padding: 2px 8px; border-radius: 12px; font-size: 11px;
                    background: var(--vscode-button-background, #007acc); color: white;
                }
                .versions {
                    background: var(--vscode-editor-background, #1e1e1e);
                }
                .version-item {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 8px 16px; border-left: 3px solid var(--vscode-panel-border, #e1e1e1);
                    position: relative; font-size: 12px;
                }
                .version-item:hover { background: var(--vscode-list-hoverBackground, #2a2d2a); }
                .version-item.current { border-left-color: var(--vscode-button-background, #007acc); }
                .version-number { font-weight: 600; color: var(--vscode-button-background, #007acc); }
                .version-time { color: var(--vscode-descriptionForeground, #969696); font-size: 11px; }
                .version-actions { display: flex; gap: 6px; }
                .icon { width: 14px; height: 14px; }
                .icon:hover { transform: scale(1.1); }
                .keep-checkbox { width: 16px; height: 16px; cursor: pointer; }
                .keep-checkbox:checked + label { color: var(--vscode-button-background, #007acc); }
                .stats {
                    display: flex; gap: 16px; padding: 12px 0; font-size: 11px;
                    color: var(--vscode-descriptionForeground, #969696);
                    border-bottom: 1px solid var(--vscode-panel-border, #e1e1e1);
                    margin-bottom: 16px;
                }
                .stat-item { display: flex; flex-direction: column; gap: 4px; }
                .stat-value { font-size: 16px; font-weight: 600; color: var(--vscode-button-background, #007acc); }
                .empty-state {
                    text-align: center; padding: 32px; color: var(--vscode-descriptionForeground, #969696);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-title">📋 Real-Time Version Tracker</div>
                    <div class="actions">
                        <button class="btn" onclick="createCheckpoint()">
                            📸 Checkpoint
                        </button>
                        <button class="btn secondary" onclick="showHistory()">
                            📚 History
                        </button>
                        <button class="btn danger" onclick="clearAll()">
                            🗑️ Clear All
                        </button>
                    </div>
                </div>
                
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-value" id="totalVersions">0</div>
                        <div>Total Versions</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="trackedFiles">0</div>
                        <div>Tracked Files</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="currentVersion">v0</div>
                        <div>Current Version</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="todayChanges">0</div>
                        <div>Today's Changes</div>
                    </div>
                </div>
                
                <div class="content" id="fileList">
                    <div class="empty-state">
                        <p>No tracked files yet.</p>
                        <p>Right-click files in explorer and select "Track File" to start versioning.</p>
                    </div>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function createCheckpoint() {
                    vscode.postMessage({ command: 'createCheckpoint' });
                }
                
                function showHistory() {
                    vscode.postMessage({ command: 'showHistory' });
                }
                
                function clearAll() {
                    vscode.postMessage({ command: 'clearAll' });
                }
                
                function toggleFile(filePath, element) {
                    vscode.postMessage({ 
                        command: 'toggleFile', 
                        data: { filePath, element } 
                    });
                }
                
                function revertVersion(filePath, version) {
                    vscode.postMessage({ 
                        command: 'revertVersion', 
                        data: { filePath, version } 
                    });
                }
                
                function compareVersions(filePath, versionA, versionB) {
                    vscode.postMessage({ 
                        command: 'compareVersions', 
                        data: { filePath, versionA, versionB } 
                    });
                }
                
                function keepVersion(filePath, version) {
                    vscode.postMessage({ 
                        command: 'keepVersion', 
                        data: { filePath, version } 
                    });
                }
                
                // Initialize
                vscode.postMessage({ command: 'initialize' });
            </script>
        </body>
        </html>`;
    }

    private async handlePanelMessage(message: any): Promise<void> {
        try {
            switch (message.command) {
                case 'initialize':
                    await this.updatePanelData();
                    break;
                case 'createCheckpoint':
                    await vscode.commands.executeCommand('versionTracker.createSnapshot');
                    break;
                case 'showHistory':
                    await vscode.commands.executeCommand('versionTracker.showHistory');
                    break;
                case 'clearAll':
                    await vscode.commands.executeCommand('versionTracker.clearHistory');
                    break;
                case 'toggleFile':
                    await vscode.commands.executeCommand('versionTracker.toggleFileTracking', vscode.Uri.file(message.data.filePath));
                    break;
                case 'revertVersion':
                    await vscode.commands.executeCommand('versionTracker.revertVersion', vscode.Uri.file(message.data.filePath));
                    break;
                case 'compareVersions':
                    await vscode.commands.executeCommand('versionTracker.compareVersions', message.data.filePath, message.data.versionA, message.data.versionB);
                    break;
                case 'keepVersion':
                    // Implement version keep functionality
                    break;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`UI command failed: ${error}`);
        }
    }

    private async updatePanelData(): Promise<void> {
        if (!this.sidePanel) {return;}

        // Get version data from tracker
        // This would need to be implemented in the tracker class
        const data = {
            totalVersions: 0,
            trackedFiles: 0,
            currentVersion: 'v0',
            todayChanges: 0,
            files: []
        };

        this.sidePanel.webview.postMessage({
            command: 'updateData',
            data: data
        });
    }

    private toggleSidePanel(): void {
        if (this.sidePanel) {
            this.sidePanel.reveal();
        } else {
            this.createSidePanel();
        }
    }

    public async showInlineVersion(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const version = this.inlineVersionProvider.getCurrentVersion(filePath);
        
        if (version) {
            vscode.window.showInformationMessage(
                `${filePath} - Current version: v${version.number} (${version.timestamp.toLocaleTimeString()})`
            );
        }
    }

    public async quickRevert(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const versions = this.inlineVersionProvider.getVersions(filePath);
        
        if (!versions || versions.length < 2) {
            vscode.window.showWarningMessage(`No previous versions to revert for ${filePath}`);
            return;
        }

        // Show quick pick for version selection
        const versionItems = versions.slice(-5).reverse().map((v, i) => ({
            label: `v${v.number} - ${v.timestamp.toLocaleTimeString()}`,
            description: v.message || 'No message',
            version: v
        }));

        const selected = await vscode.window.showQuickPick(versionItems, {
            placeHolder: 'Select version to revert to...'
        });

        if (selected) {
            await vscode.commands.executeCommand('versionTracker.revertVersion', editor.document.uri);
        }
    }

    public async quickCompare(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const versions = this.inlineVersionProvider.getVersions(filePath);
        
        if (!versions || versions.length < 2) {
            vscode.window.showWarningMessage(`Need at least 2 versions to compare for ${filePath}`);
            return;
        }

        // Show version comparison options
        const versionItems = versions.slice(-5).reverse().map((v, i) => ({
            label: `v${v.number} - ${v.timestamp.toLocaleTimeString()}`,
            description: v.message || 'No message',
            version: v
        }));

        const versionA = await vscode.window.showQuickPick(versionItems, {
            placeHolder: 'Select first version to compare...'
        });

        if (!versionA) {return;}

        const versionB = await vscode.window.showQuickPick(
            versionItems.filter(v => v.version !== versionA.version),
            { placeHolder: 'Select second version to compare...' }
        );

        if (!versionB) {return;}

        await vscode.commands.executeCommand('versionTracker.compareVersions', filePath, versionA.version, versionB.version);
    }

    public async createCheckpoint(): Promise<void> {
        const name = await vscode.window.showInputBox({
            placeHolder: 'Checkpoint name (optional)',
            prompt: 'Enter a name for this checkpoint'
        });

        await vscode.commands.executeCommand('versionTracker.createSnapshot');
        
        vscode.window.showInformationMessage(`Checkpoint created: ${name || 'Unnamed'}`);
    }

    public dispose(): void {
        if (this.sidePanel) {
            this.sidePanel.dispose();
            this.sidePanel = undefined;
        }
        this.inlineVersionProvider.dispose();
    }
}

class InlineVersionProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri[]>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
    private disposables: vscode.Disposable[] = [];

    activate(context: vscode.ExtensionContext): void {
        this.disposables.push(
            vscode.window.registerFileDecorationProvider(this),
            vscode.commands.registerCommand('versionUI.showInlineVersion', () => this.showInlineVersion())
        );
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const filePath = vscode.workspace.asRelativePath(uri);
        const version = this.getCurrentVersion(filePath);
        
        if (!version) {return undefined;}

        return {
            color: new vscode.ThemeColor('statusBarItem.warningBackground'),
            badge: `v${version.number}`,
            tooltip: `Version ${version.number}\\n${version.timestamp.toLocaleString()}\\n${version.message || 'No message'}`,
            propagate: false
        };
    }

    getCurrentVersion(filePath: string): { number: number; timestamp: Date; message?: string } | undefined {
        // This would integrate with the version tracker state
        // For now, return a mock implementation
        return undefined;
    }

    getVersions(filePath: string): Array<{ number: number; timestamp: Date; message?: string }> {
        // This would integrate with the version tracker state
        // For now, return a mock implementation
        return [];
    }

    showInlineVersion(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const version = this.getCurrentVersion(filePath);
        
        if (version) {
            vscode.window.showInformationMessage(
                `${filePath} - Current version: v${version.number} (${version.timestamp.toLocaleTimeString()})`
            );
        }
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
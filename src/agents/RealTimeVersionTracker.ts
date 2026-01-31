/**
 * RealTimeVersionTracker - Advanced version tracking for VS Code
 * Displays real-time file changes, version history, and provides visual diff indicators
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface FileVersion {
    version: number;
    timestamp: Date;
    content: string;
    changes: VersionChange[];
    author?: string;
    message?: string;
    hash: string;
}

export interface VersionChange {
    line: number;
    type: 'added' | 'removed' | 'modified';
    content: string;
    previousContent?: string;
}

export interface VersionState {
    currentVersion: number;
    versions: Map<string, FileVersion[]>;
    selectedFiles: Set<string>;
    activeDiff?: { file: string; versionA: number; versionB: number };
}

export class RealTimeVersionTracker {
    private state: VersionState;
    private statusBarItem: vscode.StatusBarItem;
    private outputChannel: vscode.OutputChannel;
    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
    private decorationProvider: FileDecorationProvider;
    private versionHistoryProvider: VersionHistoryProvider;

    constructor() {
        this.state = {
            currentVersion: 0,
            versions: new Map(),
            selectedFiles: new Set(),
            activeDiff: undefined
        };

        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.statusBarItem.tooltip = 'Real-Time Version Tracker';

        // Create output channel
        this.outputChannel = vscode.window.createOutputChannel('Version Tracker');

        // Register decoration provider
        this.decorationProvider = new FileDecorationProvider();
        
        // Register history provider
        this.versionHistoryProvider = new VersionHistoryProvider(this.state);
        
        // Register commands and providers
        
        // Register decoration provider
        vscode.window.registerFileDecorationProvider(this.decorationProvider);

        // Register status bar
        this.statusBarItem.show();

        // Watch for file changes
        this.watchFileChanges();

        // Update status bar
        this.updateStatusBar();
    }

    private watchFileChanges(): void {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {return;}

        // Watch all files in workspace
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');
        
        watcher.onDidChange(async (uri) => {
            await this.handleFileChange(uri.fsPath, 'modified');
        });

        watcher.onDidCreate(async (uri) => {
            await this.handleFileChange(uri.fsPath, 'created');
        });

        watcher.onDidDelete(async (uri) => {
            await this.handleFileChange(uri.fsPath, 'deleted');
        });

        this.watchers.set('workspace', watcher);
    }

    private async handleFileChange(filePath: string, changeType: 'created' | 'modified' | 'deleted'): Promise<void> {
        if (!this.isTrackedFile(filePath)) {return;}

        try {
            let content = '';
            if (changeType !== 'deleted' && fs.existsSync(filePath)) {
                content = fs.readFileSync(filePath, 'utf8');
            }

            const relativePath = vscode.workspace.asRelativePath(vscode.Uri.file(filePath));
            const fileVersions = this.state.versions.get(relativePath) || [];
            
            let newVersion: FileVersion;
            
            if (changeType === 'deleted') {
                newVersion = {
                    version: fileVersions.length,
                    timestamp: new Date(),
                    content: '',
                    changes: [],
                    hash: this.generateHash(''),
                    message: 'File deleted'
                };
            } else {
                const previousVersion = fileVersions[fileVersions.length - 1];
                const changes = this.detectChanges(previousVersion?.content || '', content);
                
                newVersion = {
                    version: fileVersions.length,
                    timestamp: new Date(),
                    content,
                    changes,
                    hash: this.generateHash(content),
                    message: this.generateChangeMessage(changeType, changes)
                };
            }

            fileVersions.push(newVersion);
            this.state.versions.set(relativePath, fileVersions);
            this.state.currentVersion = newVersion.version;
            
            // Update decorations
            this.decorationProvider.updateFileDecorations(relativePath, newVersion.changes);
            
            // Update tree view
            this.versionHistoryProvider.refresh();
            
            // Update status bar
            this.updateStatusBar();
            
            // Log to output channel
            this.logChange(relativePath, changeType, newVersion);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to track version for ${filePath}: ${error}`);
        }
    }

    private isTrackedFile(filePath: string): boolean {
        const relativePath = vscode.workspace.asRelativePath(vscode.Uri.file(filePath));
        return this.state.selectedFiles.has(relativePath);
    }

    private detectChanges(oldContent: string, newContent: string): VersionChange[] {
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const changes: VersionChange[] = [];
        
        // Simple line-based diff
        const maxLines = Math.max(oldLines.length, newLines.length);
        
        for (let i = 0; i < maxLines; i++) {
            const oldLine = oldLines[i];
            const newLine = newLines[i];
            
            if (oldLine === undefined && newLine !== undefined) {
                changes.push({
                    line: i + 1,
                    type: 'added',
                    content: newLine
                });
            } else if (oldLine !== undefined && newLine === undefined) {
                changes.push({
                    line: i + 1,
                    type: 'removed',
                    content: oldLine,
                    previousContent: oldLine
                });
            } else if (oldLine !== newLine) {
                changes.push({
                    line: i + 1,
                    type: 'modified',
                    content: newLine,
                    previousContent: oldLine
                });
            }
        }
        
        return changes;
    }

    private generateChangeMessage(changeType: string, changes: VersionChange[]): string {
        const summary = changes.map(c => {
            if (c.type === 'added') {return 'added lines';}
            if (c.type === 'removed') {return 'removed lines';}
            if (c.type === 'modified') {return 'modified lines';}
            return 'changed';
        }).join(', ');
        
        return `${changeType} - ${summary}`;
    }

    private generateHash(content: string): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    private updateStatusBar(): void {
        const totalVersions = Array.from(this.state.versions.values())
            .reduce((sum, versions) => sum + versions.length, 0);
            
        const selectedCount = this.state.selectedFiles.size;
        
        this.statusBarItem.text = `📋 v${this.state.currentVersion} (${selectedCount} tracked, ${totalVersions} total)`;
        this.statusBarItem.tooltip = `Current Version: ${this.state.currentVersion}\\nTracked Files: ${selectedCount}\\nTotal Versions: ${totalVersions}\\nClick to view history`;
    }

    private logChange(filePath: string, changeType: string, version: FileVersion): void {
                const timeStr = version.timestamp.toLocaleTimeString();
                const changeIcon = changeType === 'created' ? '🆕' : changeType === 'modified' ? '✏️' : changeType === 'deleted' ? '🗑️' : '📝';
                
                this.outputChannel.appendLine(`${changeIcon} ${timeStr} - ${filePath} (v${version.version})`);
                this.outputChannel.appendLine(`   ${version.message || changeType}`);
                
                if (version.changes.length > 0) {
                    this.outputChannel.appendLine(`   Changes: ${version.changes.length} lines affected`);
                }
        
        this.outputChannel.show(true);
    }

    private async showVersionHistory(): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'versionHistory',
            'Version History',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getVersionHistoryHtml(panel.webview);
        
        // Handle messages from webview
        panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleHistoryMessage(message, panel);
        });
    }

    private getVersionHistoryHtml(webview: vscode.Webview): string {
        const versionsData = this.prepareVersionsData();
        
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Version History</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Segoe UI', system-ui, sans-serif; 
                    background: var(--vscode-editor-background, #1e1e1e);
                    color: var(--vscode-editor-foreground, #d4d4d4);
                    padding: 20px;
                    height: 100vh;
                    overflow: hidden;
                }
                .header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 12px 0; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-panel-border, #e1e1e1);
                }
                .version-count {
                    background: var(--vscode-button-background, #007acc);
                    color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;
                }
                .version-list {
                    flex: 1; overflow-y: auto; max-height: calc(100vh - 80px);
                }
                .file-section { margin-bottom: 24px; }
                .file-header { 
                    font-weight: 600; font-size: 14px; 
                    margin-bottom: 8px; color: var(--vscode-button-background, #007acc);
                }
                .version-item {
                    margin-left: 16px; padding: 8px; border-left: 3px solid var(--vscode-panel-border, #e1e1e1);
                    position: relative; margin-bottom: 8px;
                }
                .version-item:hover { background: var(--vscode-list-hoverBackground, #2a2d2a); }
                .version-item.current { border-left-color: var(--vscode-button-background, #007acc); }
                .version-header {
                    display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;
                }
                .version-number { font-weight: 600; color: var(--vscode-button-background, #007acc); }
                .version-time { font-size: 11px; color: var(--vscode-descriptionForeground, #969696); }
                .version-message { font-size: 12px; margin-bottom: 8px; }
                .version-actions { display: flex; gap: 8px; }
                .btn {
                    padding: 4px 8px; font-size: 11px; border: none; border-radius: 4px;
                    background: var(--vscode-button-background, #007acc); color: white; cursor: pointer;
                }
                .btn:hover { background: var(--vscode-button-hoverBackground, #0062a3); }
                .btn.secondary { background: var(--vscode-descriptionForeground, #969696); }
                .btn.secondary:hover { background: var(--vscode-editor-foreground, #d4d4d4); }
                .changes { font-family: 'Courier New', monospace; font-size: 11px; 
                    background: var(--vscode-textBlockQuote-background, #1a1a1a); 
                    padding: 8px; border-radius: 4px; margin-top: 8px;
                }
                .added { color: #4ec9b0; }
                .removed { color: #f56e6e; }
                .modified { color: #f39c12; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>Version History</h2>
                <span class="version-count">${versionsData.totalVersions} versions</span>
            </div>
            <div class="version-list">${versionsData.html}</div>
            <script>
                const vscode = acquireVsCodeApi();
                
                function revertToVersion(filePath, version) {
                    vscode.postMessage({
                        command: 'revert',
                        data: { filePath, version }
                    });
                }
                
                function compareVersions(filePath, versionA, versionB) {
                    vscode.postMessage({
                        command: 'compare',
                        data: { filePath, versionA, versionB }
                    });
                }
                
                function toggleTracking(filePath) {
                    vscode.postMessage({
                        command: 'toggleTracking',
                        data: { filePath }
                    });
                }
            </script>
        </body>
        </html>`;
    }

    private prepareVersionsData(): { html: string; totalVersions: number } {
        let html = '';
        let totalVersions = 0;

        for (const [filePath, versions] of this.state.versions) {
            if (versions.length === 0) {continue;}
            
            html += `
                <div class="file-section">
                    <div class="file-header">
                        📄 ${filePath}
                        <button class="btn secondary" onclick="toggleTracking('${filePath}')">
                            ${this.state.selectedFiles.has(filePath) ? '🛑️ Untrack' : '📋 Track'}
                        </button>
                    </div>`;
            
            for (let i = versions.length - 1; i >= 0; i--) {
                const version = versions[i];
                totalVersions++;
                
                const isCurrent = version.version === this.state.currentVersion;
                
                html += `
                    <div class="version-item ${isCurrent ? 'current' : ''}">
                        <div class="version-header">
                            <span class="version-number">v${version.version}</span>
                            <span class="version-time">${version.timestamp.toLocaleTimeString()}</span>
                        </div>
                        <div class="version-message">${version.message || 'No message'}</div>
                        <div class="version-actions">
                            <button class="btn" onclick="revertToVersion('${filePath}', ${version.version})">
                                ↶ Revert
                            </button>
                            <button class="btn" onclick="compareVersions('${filePath}', ${version.version}, ${version.version - 1})">
                                ⊕ Diff
                            </button>
                        </div>`;
                
                if (version.changes.length > 0) {
                    html += '<div class="changes">';
                    for (const change of version.changes) {
                        const changeClass = change.type;
                        const icon = change.type === 'added' ? '+' : change.type === 'removed' ? '-' : '~';
                        html += `<span class="${changeClass}">${icon} Line ${change.line}: ${change.content}</span><br>`;
                    }
                    html += '</div>';
                }
                
                html += '</div>';
            }
            
            html += '</div>';
        }

        return { html, totalVersions };
    }

    private async handleHistoryMessage(message: any, panel: vscode.WebviewPanel): Promise<void> {
        try {
            switch (message.command) {
                case 'revert':
                    await this.revertToVersion(vscode.Uri.file(message.data.filePath), message.data.version);
                    break;
                case 'compare':
                    await this.compareVersions(message.data.filePath, message.data.versionA, message.data.versionB);
                    break;
                case 'toggleTracking':
                    await this.toggleFileTracking(vscode.Uri.file(message.data.filePath));
                    break;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Operation failed: ${error}`);
        }
    }

    public async revertToVersion(uri: vscode.Uri, versionNumber: number): Promise<void> {
        const filePath = uri.fsPath;
        const relativePath = vscode.workspace.asRelativePath(uri);
        const versions = this.state.versions.get(relativePath);
        
        if (!versions || versionNumber >= versions.length) {
            vscode.window.showErrorMessage(`Version ${versionNumber} not found for ${relativePath}`);
            return;
        }

        const version = versions[versionNumber];
        
        try {
            // Create backup before reverting
            await this.createSnapshot();
            
            // Write version content
            fs.writeFileSync(filePath, version.content);
            
            // Show success message
            vscode.window.showInformationMessage(`Reverted ${relativePath} to version ${versionNumber}`);
            
            // Update current version
            this.state.currentVersion = versionNumber;
            this.updateStatusBar();
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to revert ${relativePath}: ${error}`);
        }
    }

    public async compareVersions(filePath: string, versionA: number, versionB: number): Promise<void> {
        const versions = this.state.versions.get(filePath);
        
        if (!versions || versionA >= versions.length || versionB >= versions.length) {
            vscode.window.showErrorMessage('Invalid version numbers for comparison');
            return;
        }

        const contentA = versions[versionA].content;
        const contentB = versions[versionB].content;

        // Create diff document
        const diffTitle = `Diff: ${filePath} (v${versionA} vs v${versionB})`;
        const diffContent = this.generateDiff(contentA, contentB, `Version ${versionA}`, `Version ${versionB}`);
        
        const diffUri = vscode.Uri.parse(`untitled:${diffTitle}.diff`);
        await vscode.workspace.openTextDocument(diffUri);
        
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(0, 0), diffContent);
            });
        }
    }

    private generateDiff(contentA: string, contentB: string, labelA: string, labelB: string): string {
        const linesA = contentA.split('\n');
        const linesB = contentB.split('\n');
        
        let diff = `--- ${labelA}\n+++ ${labelB}\n`;
        
        // Simple unified diff
        for (let i = 0; i < Math.max(linesA.length, linesB.length); i++) {
            const lineA = linesA[i];
            const lineB = linesB[i];
            
            if (lineA === lineB) {
                diff += ` ${lineB}\n`;
            } else if (lineA === undefined) {
                diff += `+${lineB}\n`;
            } else if (lineB === undefined) {
                diff += `-${lineA}\n`;
            } else {
                diff += `-${lineA}\n+${lineB}\n`;
            }
        }
        
        return diff;
    }

    public async createSnapshot(): Promise<void> {
        const snapshotName = `snapshot_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        
        // Get all tracked files' current versions
        const snapshot = new Map<string, { version: number; content: string; timestamp: Date }>();
        
        for (const [filePath, versions] of this.state.versions) {
            if (versions.length > 0 && this.state.selectedFiles.has(filePath)) {
                const currentVersion = versions[versions.length - 1];
                snapshot.set(filePath, {
                    version: currentVersion.version,
                    content: currentVersion.content,
                    timestamp: currentVersion.timestamp
                });
            }
        }
        
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot && snapshot.size > 0) {
            const snapshotDir = path.join(workspaceRoot, '.versiontracker', 'snapshots');
            
            try {
                fs.mkdirSync(snapshotDir, { recursive: true });
                
                const snapshotFile = path.join(snapshotDir, `${snapshotName}.json`);
                fs.writeFileSync(snapshotFile, JSON.stringify({
                    name: snapshotName,
                    timestamp: new Date(),
                    files: Object.fromEntries(snapshot)
                }, null, 2));
                
                vscode.window.showInformationMessage(`Created snapshot: ${snapshotName}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create snapshot: ${error}`);
            }
        }
    }

    public async toggleFileTracking(uri: vscode.Uri): Promise<void> {
        const relativePath = vscode.workspace.asRelativePath(uri);
        
        if (this.state.selectedFiles.has(relativePath)) {
            this.state.selectedFiles.delete(relativePath);
        } else {
            this.state.selectedFiles.add(relativePath);
            
            // Initialize tracking for new file
            if (fs.existsSync(uri.fsPath)) {
                const content = fs.readFileSync(uri.fsPath, 'utf8');
                const version: FileVersion = {
                    version: 0,
                    timestamp: new Date(),
                    content,
                    changes: [],
                    hash: this.generateHash(content),
                    message: 'Initial version'
                };
                
                this.state.versions.set(relativePath, [version]);
            }
        }
        
        this.updateStatusBar();
        this.versionHistoryProvider.refresh();
        this.decorationProvider.updateFileDecorations(relativePath, []);
        
        vscode.window.showInformationMessage(
            `${relativePath} ${this.state.selectedFiles.has(relativePath) ? 'tracked' : 'untracked'}`
        );
    }

    public async undo(): Promise<void> {
        // Implement undo functionality
        vscode.window.showInformationMessage('Undo operation - feature coming soon');
    }

    public async redo(): Promise<void> {
        // Implement redo functionality
        vscode.window.showInformationMessage('Redo operation - feature coming soon');
    }

    public async clearVersionHistory(): Promise<void> {
        const selection = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all version history?',
            'Clear',
            'Cancel'
        );
        
        if (selection === 'Clear') {
            this.state.versions.clear();
            this.state.selectedFiles.clear();
            this.state.currentVersion = 0;
            
            this.updateStatusBar();
            this.versionHistoryProvider.refresh();
            
            vscode.window.showInformationMessage('Version history cleared');
        }
    }

    public async exportVersionHistory(): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('version-history.json'),
            filters: { 'JSON Files': ['json'] }
        });
        
        if (uri) {
            const exportData = {
                timestamp: new Date(),
                currentVersion: this.state.currentVersion,
                selectedFiles: Array.from(this.state.selectedFiles),
                versions: Object.fromEntries(this.state.versions)
            };
            
            await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(exportData, null, 2)));
            vscode.window.showInformationMessage(`Exported version history to ${uri.fsPath}`);
        }
    }

    public async openDiffView(): Promise<void> {
        // Open diff view for active file
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active file to compare');
            return;
        }
        
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const versions = this.state.versions.get(filePath);
        
        if (!versions || versions.length < 2) {
            vscode.window.showWarningMessage(`Not enough versions to compare for ${filePath}`);
            return;
        }
        
        // Compare current with previous version
        const currentVersion = versions[versions.length - 1];
        const previousVersion = versions[versions.length - 2];
        
        await this.compareVersions(filePath, currentVersion.version, previousVersion.version);
    }

    public async openComparisonView(): Promise<void> {
        // Open advanced comparison view
        vscode.window.showInformationMessage('Advanced comparison view - feature coming soon');
    }

    public dispose(): void {
        this.statusBarItem.dispose();
        this.outputChannel.dispose();
        this.watchers.forEach(watcher => watcher.dispose());
    }
}

// Supporting classes
class FileDecorationProvider implements vscode.FileDecorationProvider {
    private decorations: Map<string, vscode.FileDecoration> = new Map();

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const relativePath = vscode.workspace.asRelativePath(uri);
        return this.decorations.get(relativePath);
    }

    updateFileDecorations(filePath: string, changes: VersionChange[]): void {
        const decoration: vscode.FileDecoration = {
            color: changes.length > 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined,
            badge: changes.length > 0 ? `${changes.length} changes` : 'tracked',
            tooltip: `Version tracking enabled. ${changes.length} recent changes.`
        };
        
        this.decorations.set(filePath, decoration);
        this._onDidChangeFileDecorations.fire([vscode.Uri.file(filePath)]);
    }

    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
}

class VersionHistoryProvider implements vscode.TreeDataProvider<VersionTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<VersionTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private state: VersionState) {}

    getTreeItem(element: VersionTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: VersionTreeItem): Thenable<VersionTreeItem[]> {
        if (!element) {
            // Return root level items
            const items: VersionTreeItem[] = [];
            // Implementation would return tracked files as root items
            return Promise.resolve(items);
        }
        return Promise.resolve([]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}

class VersionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}
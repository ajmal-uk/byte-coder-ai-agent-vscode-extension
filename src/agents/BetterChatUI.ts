/**
 * Better Chat UI with Enhanced File Creation
 * Simple, robust file creation with natural language processing
 */

import * as vscode from 'vscode';

export interface FileCreationRequest {
    content: string;
    fileName: string;
    language?: string;
}

export interface FileCreationResult {
    success: boolean;
    filePath?: string;
    message: string;
    error?: string;
}

export interface FileCreationSuggestion {
    fileName: string;
    content: string;
    language: string;
    description: string;
    confidence: number;
}

export class BetterChatUI {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Better Chat UI');
    }

    public async createFileFromNaturalLanguage(request: string): Promise<void> {
        try {
            // Parse the request
            const fileCreation = this.parseFileCreationRequest(request);
            
            if (!fileCreation) {
                vscode.window.showInformationMessage('Please specify what you want to create. Example: "create file sum.py with code to sum digits"');
                return;
            }

            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Creating File',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: `Creating ${fileCreation.fileName}...` });
                
                // Create the file
                const result = await this.createFile(fileCreation);
                
                if (result.success) {
                    progress.report({ increment: 100, message: 'File created successfully!' });
                    vscode.window.showInformationMessage(`✅ File "${fileCreation.fileName}" created successfully!`);
                } else {
                    progress.report({ increment: 100, message: 'File creation failed' });
                    vscode.window.showErrorMessage(`❌ Failed to create file "${fileCreation.fileName}"`);
                }
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private parseFileCreationRequest(message: string): FileCreationRequest | null {
        const lowerMessage = message.toLowerCase().trim();
        
        // Pattern: create file named X with code Y
        const pattern1 = /create(?: file)? named ["']([^"']+)["'](?: and|with|containing|that includes)? (?:code|content|the following) ["']([^"']+)["']/i;
        
        let match = lowerMessage.match(pattern1);
        if (match) {
            return {
                fileName: match[1].trim(),
                content: match[2].trim(),
                language: this.detectLanguageFromFileName(match[1])
            };
        }

        // Pattern: create X.py with code to sum digits
        const pattern2 = /create ([^"'\s]+\.(?:py|js|ts|java|cpp|c|html|css|js|jsx|tsx))(?: and)? (?:add|with|containing|that includes)? (?:code|content|the following) ["']([^"']+)["']/i;
        
        match = lowerMessage.match(pattern2);
        if (match) {
            const fileName = match[1].trim();
            const content = match[2].trim();
            
            return {
                fileName,
                content,
                language: this.detectLanguageFromFileName(fileName)
            };
        }

        return null;
    }

    private async createFile(request: FileCreationRequest): Promise<FileCreationResult> {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                throw new Error('No workspace folder open');
            }

            const filePath = this.joinPath(workspaceRoot, request.fileName);

            // Create directory if needed
            const dir = this.dirname(filePath);
            await this.ensureDirectory(dir);

            // Write file
            const uri = vscode.Uri.file(filePath);
            const fileContent = Buffer.from(request.content, 'utf8');
            await vscode.workspace.fs.writeFile(uri, fileContent);

            // Open in editor
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);

            return {
                success: true,
                filePath,
                message: `Successfully created ${request.fileName}`
            };

        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : String(error),
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private dirname(filePath: string): string {
        const parts = filePath.split('/');
        return parts.slice(0, -1).join('/');
    }

    private joinPath(dir: string, file: string): string {
        if (dir && dir.length > 0) {
            return dir + '/' + file;
        }
        return file;
    }

    private async ensureDirectory(dirPath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(dirPath);
            await vscode.workspace.fs.createDirectory(uri);
        } catch {
            // Directory might already exist, which is fine
        }
    }

    private detectLanguageFromFileName(fileName: string): string {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const extensions: Record<string, string> = { 'py': 'python', 'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript', 'java': 'java', 'cpp': 'cpp', 'c': 'c', 'h': 'c', 'hpp': 'cpp', 'html': 'html', 'css': 'css', 'json': 'json' };
        return extensions[ext] || 'text';
    }

    public showOutputChannel(): void {
        this.outputChannel.show(true);
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}
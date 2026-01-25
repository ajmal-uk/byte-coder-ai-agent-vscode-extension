/**
 * VersionControllerAgent - Automatic checkpoint system for Byte Coder
 * Creates checkpoints, manages rollbacks, and tracks file changes
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent, AgentOutput, Checkpoint } from '../core/AgentTypes';

import * as crypto from 'crypto';

export interface VersionControllerInput {
    action: 'create_checkpoint' | 'rollback' | 'list_checkpoints' | 'delete_checkpoint' | 'delete_session_checkpoints' | 'get_file_content' | 'get_diff' | 'search_history';
    checkpointId?: string;
    files?: string[];
    description?: string;
    sessionId?: string;
    requestId?: string;
    searchQuery?: string;
}

export interface VersionControllerResult {
    success: boolean;
    checkpoint?: Checkpoint;
    checkpoints?: Checkpoint[];
    restoredFiles?: string[];
    message: string;
    content?: string;
    diff?: string;
}

export class VersionControllerAgent extends BaseAgent<VersionControllerInput, VersionControllerResult> {
    private checkpointDir: string = '';
    private checkpoints: Map<string, Checkpoint> = new Map();
    private fileSnapshots: Map<string, Map<string, string>> = new Map();  // checkpointId -> (filePath -> content)

    constructor(private context?: vscode.ExtensionContext) {
        super({ name: 'VersionController', timeout: 30000 });
        this.initCheckpointDir();
        this.loadAllCheckpoints();
    }

    /**
     * Initialize the checkpoint directory
     */
    private initCheckpointDir(): void {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
            this.checkpointDir = path.join(workspaceRoot, '.bytecoder', 'checkpoints');
            try {
                if (!fs.existsSync(this.checkpointDir)) {
                    fs.mkdirSync(this.checkpointDir, { recursive: true });
                }
            } catch {
                // Unable to create directory, will use in-memory only
            }
        }
    }

    async execute(input: VersionControllerInput): Promise<AgentOutput<VersionControllerResult>> {
        const startTime = Date.now();

        try {
            let result: VersionControllerResult;

            switch (input.action) {
                case 'create_checkpoint':
                    result = await this.createCheckpoint(input.files || [], input.description, input.sessionId, input.requestId);
                    break;
                case 'rollback':
                    result = await this.rollback(input.checkpointId!);
                    break;
                case 'list_checkpoints':
                    result = this.listCheckpoints();
                    break;
                case 'delete_checkpoint':
                    result = this.deleteCheckpoint(input.checkpointId!);
                    break;
                case 'delete_session_checkpoints':
                    result = await this.deleteSessionCheckpoints(input.sessionId!);
                    break;
                case 'get_file_content':
                    result = await this.getFileContent(input.checkpointId!, input.files?.[0]!);
                    break;
                case 'get_diff':
                    result = await this.getDiff(input.checkpointId!, input.files?.[0]);
                    break;
                case 'search_history':
                    result = await this.searchHistory(input.searchQuery!);
                    break;
                default:
                    result = { success: false, message: 'Unknown action' };
            }

            return this.createOutput(
                result.success ? 'success' : 'failed',
                result,
                result.success ? 0.95 : 0.3,
                startTime,
                { reasoning: result.message }
            );

        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Delete all checkpoints
     */
    async deleteAllCheckpoints(): Promise<VersionControllerResult> {
        try {
            // Clear in-memory maps
            this.checkpoints.clear();
            this.fileSnapshots.clear();

            // Clear disk storage
            if (this.checkpointDir && fs.existsSync(this.checkpointDir)) {
                fs.rmSync(this.checkpointDir, { recursive: true, force: true });
                // Re-create empty directory
                this.initCheckpointDir();
            }

            // Clear extension state
            if (this.context) {
                await this.context.workspaceState.update('byteAI.checkpoints', []);
            }

            return {
                success: true,
                message: 'All checkpoints deleted successfully'
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to delete checkpoints: ${error}`
            };
        }
    }

    /**
     * Load all checkpoints from disk
     */
    private loadAllCheckpoints(): void {
        if (!this.checkpointDir || !fs.existsSync(this.checkpointDir)) return;

        try {
            const files = fs.readdirSync(this.checkpointDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const filePath = path.join(this.checkpointDir, file);
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (data.checkpoint && data.checkpoint.checkpointId) {
                        this.checkpoints.set(data.checkpoint.checkpointId, data.checkpoint);
                        // We don't load snapshots into memory to save resources
                        // They will be loaded on demand during rollback
                    }
                } catch (e) {
                    console.error(`Failed to load checkpoint ${file}:`, e);
                }
            }
        } catch (e) {
            console.error('Failed to read checkpoint directory:', e);
        }
    }

    /**
     * Create a new checkpoint
     */
    private async createCheckpoint(files: string[], description?: string, sessionId?: string, requestId?: string): Promise<VersionControllerResult> {
        // REGENERATION LOGIC:
        // If a checkpoint exists for this requestId, it means we are re-running/regenerating the same turn.
        // In this case, we should rollback to the state BEFORE the previous run to ensure a clean slate.
        if (requestId) {
            const existing = Array.from(this.checkpoints.values()).find(cp => cp.requestId === requestId);
            if (existing) {
                // We found a checkpoint created for this exact request ID.
                // This implies the previous run started here.
                // Rolling back to this checkpoint restores the state to what it was at the start of that run.
                return this.rollback(existing.checkpointId);
            }
        }

        const checkpointId = this.generateCheckpointId();
        const timestamp = new Date();
        const snapshots = new Map<string, string>();

        // If no specific files provided, get all open documents
        if (files.length === 0) {
            const openDocs = vscode.workspace.textDocuments.filter(d => !d.isUntitled && !d.uri.scheme.startsWith('git'));
            files = openDocs.map(d => d.uri.fsPath);
        }

        // Capture file contents
        for (const filePath of files) {
            try {
                const uri = vscode.Uri.file(filePath);
                const document = await vscode.workspace.openTextDocument(uri);
                snapshots.set(filePath, document.getText());
            } catch {
                // File doesn't exist, skip
            }
        }

        // Create checkpoint
        const checkpoint: Checkpoint = {
            checkpointId,
            timestamp,
            modifiedFiles: Array.from(snapshots.keys()),
            diffHash: this.generateHash(Array.from(snapshots.values()).join('\n')),
            rollbackCommand: `bytecoder rollback ${checkpointId}`,
            description: description || `Checkpoint at ${timestamp.toISOString()}`,
            sessionId,
            requestId
        };

        // Store checkpoint
        this.checkpoints.set(checkpointId, checkpoint);
        this.fileSnapshots.set(checkpointId, snapshots);

        // Persist to disk if possible
        await this.persistCheckpoint(checkpointId, checkpoint, snapshots);

        // Store in extension state
        if (this.context) {
            const storedCheckpoints = this.context.workspaceState.get<Checkpoint[]>('byteAI.checkpoints', []);
            storedCheckpoints.push(checkpoint);
            await this.context.workspaceState.update('byteAI.checkpoints', storedCheckpoints.slice(-20));  // Keep last 20
        }

        return {
            success: true,
            checkpoint,
            message: `Created checkpoint ${checkpointId} with ${snapshots.size} files`
        };
    }

    /**
     * Delete all checkpoints for a specific session
     */
    private async deleteSessionCheckpoints(sessionId: string): Promise<VersionControllerResult> {
        const toDelete = Array.from(this.checkpoints.values())
            .filter(cp => cp.sessionId === sessionId);
            
        let deletedCount = 0;
        for (const cp of toDelete) {
            const res = this.deleteCheckpoint(cp.checkpointId);
            if (res.success) deletedCount++;
        }
        
        return {
            success: true,
            message: `Deleted ${deletedCount} checkpoints for session ${sessionId}`
        };
    }

    /**
     * Get file content from a checkpoint
     */
    private async getFileContent(checkpointId: string, filePath: string): Promise<VersionControllerResult> {
        // Ensure snapshots are loaded
        if (!this.fileSnapshots.has(checkpointId)) {
            await this.loadCheckpoint(checkpointId);
        }

        const snapshots = this.fileSnapshots.get(checkpointId);
        if (!snapshots) {
            return { success: false, message: `Checkpoint ${checkpointId} not found` };
        }

        const content = snapshots.get(filePath);
        if (content === undefined) {
            return { success: false, message: `File ${filePath} not found in checkpoint ${checkpointId}` };
        }

        return {
            success: true,
            content,
            message: `Retrieved content for ${filePath} from ${checkpointId}`
        };
    }

    /**
     * Get diff between current workspace and a checkpoint
     * If filePath is provided, diffs only that file. Otherwise, diffs all common files.
     */
    private async getDiff(checkpointId: string, filePath?: string): Promise<VersionControllerResult> {
        // Ensure snapshots are loaded
        if (!this.fileSnapshots.has(checkpointId)) {
            await this.loadCheckpoint(checkpointId);
        }

        const snapshots = this.fileSnapshots.get(checkpointId);
        if (!snapshots) {
            return { success: false, message: `Checkpoint ${checkpointId} not found` };
        }

        let diffOutput = '';
        const filesToDiff = filePath ? [filePath] : Array.from(snapshots.keys());

        for (const file of filesToDiff) {
            const oldContent = snapshots.get(file);
            if (oldContent === undefined) continue;

            try {
                // Get current content
                let newContent = '';
                if (fs.existsSync(file)) {
                    newContent = fs.readFileSync(file, 'utf8');
                }

                if (oldContent !== newContent) {
                    diffOutput += `--- ${file} (Checkpoint ${checkpointId})\n`;
                    diffOutput += `+++ ${file} (Current)\n`;
                    // Simple line-based diff (can be replaced with a diff library if available)
                    // For now, we just show that it changed.
                    // Ideally, we'd generate a real patch.
                    diffOutput += this.generateSimpleDiff(oldContent, newContent) + '\n\n';
                }
            } catch (e) {
                diffOutput += `Error reading current file ${file}: ${e}\n`;
            }
        }

        if (!diffOutput) {
            diffOutput = 'No changes detected.';
        }

        return {
            success: true,
            diff: diffOutput,
            message: `Generated diff for checkpoint ${checkpointId}`
        };
    }

    private generateSimpleDiff(oldText: string, newText: string): string {
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        let diff = '';
        
        let i = 0; 
        let j = 0;
        
        while(i < oldLines.length || j < newLines.length) {
            if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
                // matching
                i++; j++;
            } else {
                if (i < oldLines.length) {
                    diff += `- ${oldLines[i]}\n`;
                    i++;
                }
                if (j < newLines.length) {
                    diff += `+ ${newLines[j]}\n`;
                    j++;
                }
            }
        }
        return diff;
    }

    /**
     * Search history (checkpoints) for a query
     * Searches in description and file contents
     */
    private async searchHistory(query: string): Promise<VersionControllerResult> {
        const lowerQuery = query.toLowerCase();
        const matches: Checkpoint[] = [];
        
        // 1. Search metadata (fast)
        for (const cp of this.checkpoints.values()) {
            if (cp.description.toLowerCase().includes(lowerQuery) || 
                cp.checkpointId.includes(lowerQuery) ||
                (cp.sessionId && cp.sessionId.includes(lowerQuery))) {
                matches.push(cp);
            }
        }

        // 2. Search content (slower, but deeper)
        // We iterate through all checkpoints on disk to find content matches
        // This simulates "researching" previous versions
        if (this.checkpointDir && fs.existsSync(this.checkpointDir)) {
             const files = fs.readdirSync(this.checkpointDir).filter(f => f.endsWith('.json'));
             for (const file of files) {
                 try {
                     const filePath = path.join(this.checkpointDir, file);
                     const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                     const snapshots = data.snapshots;
                     
                     let contentMatch = false;
                     for (const [fPath, content] of Object.entries(snapshots)) {
                         if ((content as string).toLowerCase().includes(lowerQuery)) {
                             contentMatch = true;
                             break;
                         }
                     }

                     if (contentMatch) {
                         // Add if not already added by metadata search
                         if (!matches.find(m => m.checkpointId === data.checkpoint.checkpointId)) {
                             matches.push(data.checkpoint);
                         }
                     }
                 } catch {}
             }
        }

        return {
            success: true,
            checkpoints: matches,
            message: `Found ${matches.length} checkpoints matching '${query}'`
        };
    }

    /**
     * Rollback to a checkpoint
     */
    private async rollback(checkpointId: string): Promise<VersionControllerResult> {
        const snapshots = this.fileSnapshots.get(checkpointId);

        if (!snapshots) {
            // Try to load from disk
            const loaded = await this.loadCheckpoint(checkpointId);
            if (!loaded) {
                return {
                    success: false,
                    message: `Checkpoint ${checkpointId} not found`
                };
            }
        }

        const files = this.fileSnapshots.get(checkpointId)!;
        const restoredFiles: string[] = [];

        for (const [filePath, content] of files) {
            try {
                const uri = vscode.Uri.file(filePath);

                // Check if file exists
                try {
                    const document = await vscode.workspace.openTextDocument(uri);

                    // Replace content
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(
                        uri,
                        new vscode.Range(
                            new vscode.Position(0, 0),
                            new vscode.Position(document.lineCount, 0)
                        ),
                        content
                    );

                    await vscode.workspace.applyEdit(edit);
                    await document.save();
                    restoredFiles.push(filePath);
                } catch {
                    // File was deleted, recreate it
                    const dirPath = path.dirname(filePath);
                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }
                    fs.writeFileSync(filePath, content);
                    restoredFiles.push(filePath);
                }
            } catch (error) {
                console.error(`Failed to restore ${filePath}:`, error);
            }
        }

        return {
            success: restoredFiles.length > 0,
            restoredFiles,
            message: `Restored ${restoredFiles.length} files from checkpoint ${checkpointId}`
        };
    }

    /**
     * List all checkpoints
     */
    private listCheckpoints(): VersionControllerResult {
        const checkpoints = Array.from(this.checkpoints.values());

        return {
            success: true,
            checkpoints,
            message: `Found ${checkpoints.length} checkpoints`
        };
    }

    /**
     * Delete a checkpoint
     */
    private deleteCheckpoint(checkpointId: string): VersionControllerResult {
        const existed = this.checkpoints.delete(checkpointId);
        this.fileSnapshots.delete(checkpointId);

        // Remove from disk
        if (this.checkpointDir) {
            const checkpointPath = path.join(this.checkpointDir, `${checkpointId}.json`);
            try {
                if (fs.existsSync(checkpointPath)) {
                    fs.unlinkSync(checkpointPath);
                }
            } catch { }
        }

        return {
            success: existed,
            message: existed ? `Deleted checkpoint ${checkpointId}` : `Checkpoint ${checkpointId} not found`
        };
    }

    /**
     * Persist checkpoint to disk atomically
     */
    private async persistCheckpoint(
        id: string,
        checkpoint: Checkpoint,
        snapshots: Map<string, string>
    ): Promise<void> {
        if (!this.checkpointDir) return;

        try {
            const data = {
                checkpoint,
                snapshots: Object.fromEntries(snapshots)
            };
            const filePath = path.join(this.checkpointDir, `${id}.json`);
            const tempPath = `${filePath}.tmp`;

            // Write to temp file first
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
            
            // Rename to final file (atomic operation)
            fs.renameSync(tempPath, filePath);
        } catch (error) {
            console.error(`Failed to persist checkpoint ${id}:`, error);
            // Don't fail the operation, in-memory checkpoint is still valid
        }
    }

    /**
     * Load checkpoint from disk
     */
    private async loadCheckpoint(id: string): Promise<boolean> {
        if (!this.checkpointDir) return false;

        try {
            const filePath = path.join(this.checkpointDir, `${id}.json`);
            if (!fs.existsSync(filePath)) return false;

            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            this.checkpoints.set(id, data.checkpoint);
            this.fileSnapshots.set(id, new Map(Object.entries(data.snapshots)));
            return true;
        } catch {
            return false;
        }
    }


    /**
     * Generate a checkpoint ID
     */
    private generateCheckpointId(): string {
        const now = new Date();
        const dateStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 17); // Include millis (3 digits)
        return `cp_${dateStr}`;
    }

    /**
     * Generate a robust hash
     */
    private generateHash(input: string): string {
        return crypto.createHash('sha256').update(input).digest('hex');
    }

    /**
     * Get the most recent checkpoint
     */
    getLatestCheckpoint(): Checkpoint | undefined {
        const checkpoints = Array.from(this.checkpoints.values());
        if (checkpoints.length === 0) return undefined;
        return checkpoints.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )[0];
    }

    async cleanup(keepCount: number = 10): Promise<void> {
        const checkpoints = Array.from(this.checkpoints.entries())
            .sort((a, b) => new Date(b[1].timestamp).getTime() - new Date(a[1].timestamp).getTime());

        for (const [id] of checkpoints.slice(keepCount)) {
            this.deleteCheckpoint(id);
        }
    }
}

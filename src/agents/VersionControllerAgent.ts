/**
 * VersionControllerAgent - Automatic checkpoint system for Byte Coder
 * Creates checkpoints, manages rollbacks, and tracks file changes
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent, AgentOutput, Checkpoint } from '../core/AgentTypes';

export interface VersionControllerInput {
    action: 'create_checkpoint' | 'rollback' | 'list_checkpoints' | 'delete_checkpoint';
    checkpointId?: string;
    files?: string[];
    description?: string;
}

export interface VersionControllerResult {
    success: boolean;
    checkpoint?: Checkpoint;
    checkpoints?: Checkpoint[];
    restoredFiles?: string[];
    message: string;
}

export class VersionControllerAgent extends BaseAgent<VersionControllerInput, VersionControllerResult> {
    private checkpointDir: string = '';
    private checkpoints: Map<string, Checkpoint> = new Map();
    private fileSnapshots: Map<string, Map<string, string>> = new Map();  // checkpointId -> (filePath -> content)

    constructor(private context?: vscode.ExtensionContext) {
        super({ name: 'VersionController', timeout: 30000 });
        this.initCheckpointDir();
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
                    result = await this.createCheckpoint(input.files || [], input.description);
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
     * Create a new checkpoint
     */
    private async createCheckpoint(files: string[], description?: string): Promise<VersionControllerResult> {
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
            description: description || `Checkpoint at ${timestamp.toISOString()}`
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
     * Persist checkpoint to disk
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
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch {
            // Silent fail - in-memory checkpoint still valid
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
        const dateStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        return `cp_${dateStr}`;
    }

    /**
     * Generate a simple hash
     */
    private generateHash(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `sha256:${Math.abs(hash).toString(16).padStart(8, '0')}`;
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

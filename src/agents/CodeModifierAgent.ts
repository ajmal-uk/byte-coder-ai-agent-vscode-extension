/**
 * CodeModifierAgent - Surgical code editor for Byte Coder
 * Applies precise line-level diffs with validation
 */

import * as vscode from 'vscode';
import { BaseAgent, AgentOutput, CodeModification, Checkpoint } from '../core/AgentTypes';

export interface CodeModifierInput {
    modifications: CodeModification[];
    dryRun?: boolean;
    createCheckpoint?: boolean;
}

export interface ModificationResult {
    file: string;
    success: boolean;
    linesModified: number;
    error?: string;
    diff?: string;
}

export interface CodeModifierResult {
    results: ModificationResult[];
    checkpoint?: Checkpoint;
    rollbackAvailable: boolean;
    totalFilesModified: number;
    totalLinesModified: number;
}

export class CodeModifierAgent extends BaseAgent<CodeModifierInput, CodeModifierResult> {
    // Store original content for rollback
    private originalContents: Map<string, string> = new Map();

    constructor() {
        super({ name: 'CodeModifier', timeout: 30000 });
    }

    async execute(input: CodeModifierInput): Promise<AgentOutput<CodeModifierResult>> {
        const startTime = Date.now();

        try {
            const results: ModificationResult[] = [];
            let checkpoint: Checkpoint | undefined;

            // Create checkpoint if requested
            if (input.createCheckpoint && !input.dryRun) {
                checkpoint = await this.createCheckpoint(input.modifications);
            }

            // Apply modifications
            for (const mod of input.modifications) {
                const result = await this.applyModification(mod, input.dryRun);
                results.push(result);
            }

            const successCount = results.filter(r => r.success).length;
            const totalLines = results.reduce((sum, r) => sum + r.linesModified, 0);

            const result: CodeModifierResult = {
                results,
                checkpoint,
                rollbackAvailable: !!checkpoint,
                totalFilesModified: successCount,
                totalLinesModified: totalLines
            };

            const confidence = successCount / input.modifications.length;

            return this.createOutput('success', result, confidence, startTime, {
                reasoning: `Modified ${successCount}/${input.modifications.length} files, ${totalLines} lines changed`
            });

        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Apply a single modification
     */
    private async applyModification(
        mod: CodeModification,
        dryRun: boolean = false
    ): Promise<ModificationResult> {
        try {
            // Read the file
            const uri = vscode.Uri.file(mod.filePath);
            let document: vscode.TextDocument;

            try {
                document = await vscode.workspace.openTextDocument(uri);
            } catch {
                return {
                    file: mod.filePath,
                    success: false,
                    linesModified: 0,
                    error: `File not found: ${mod.filePath}`
                };
            }

            const currentContent = document.getText();
            const lines = currentContent.split('\n');

            // Store original for rollback
            if (!dryRun && !this.originalContents.has(mod.filePath)) {
                this.originalContents.set(mod.filePath, currentContent);
            }

            // Find the target block
            const searchBlock = mod.searchBlock.trim();
            const startLine = mod.startLine - 1; // Convert to 0-indexed
            const endLine = mod.endLine - 1;

            // Validate line range
            if (startLine < 0 || endLine >= lines.length) {
                return {
                    file: mod.filePath,
                    success: false,
                    linesModified: 0,
                    error: `Invalid line range: ${mod.startLine}-${mod.endLine} (file has ${lines.length} lines)`
                };
            }

            // Get the target section
            const targetSection = lines.slice(startLine, endLine + 1).join('\n');

            // Verify the search block exists in the target section
            if (!targetSection.includes(searchBlock)) {
                // Try fuzzy match
                const fuzzyMatch = this.fuzzyFind(targetSection, searchBlock);
                if (!fuzzyMatch) {
                    return {
                        file: mod.filePath,
                        success: false,
                        linesModified: 0,
                        error: `Search block not found in lines ${mod.startLine}-${mod.endLine}`
                    };
                }
            }

            // Apply the replacement
            const newContent = targetSection.replace(searchBlock, mod.replaceBlock);
            const newLines = [
                ...lines.slice(0, startLine),
                ...newContent.split('\n'),
                ...lines.slice(endLine + 1)
            ];
            const finalContent = newLines.join('\n');

            // Generate diff for display
            const diff = this.generateDiff(mod.filePath, searchBlock, mod.replaceBlock);

            if (dryRun) {
                return {
                    file: mod.filePath,
                    success: true,
                    linesModified: Math.abs(mod.replaceBlock.split('\n').length - searchBlock.split('\n').length) + 1,
                    diff
                };
            }

            // Apply the edit
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                uri,
                new vscode.Range(
                    new vscode.Position(startLine, 0),
                    new vscode.Position(endLine, lines[endLine]?.length || 0)
                ),
                newContent
            );

            const applied = await vscode.workspace.applyEdit(edit);

            if (!applied) {
                return {
                    file: mod.filePath,
                    success: false,
                    linesModified: 0,
                    error: 'Failed to apply edit'
                };
            }

            // Save the document
            await document.save();

            return {
                file: mod.filePath,
                success: true,
                linesModified: Math.abs(newContent.split('\n').length - (endLine - startLine + 1)) + 1,
                diff
            };

        } catch (error) {
            return {
                file: mod.filePath,
                success: false,
                linesModified: 0,
                error: (error as Error).message
            };
        }
    }

    /**
     * Create a checkpoint before modifications
     */
    private async createCheckpoint(modifications: CodeModification[]): Promise<Checkpoint> {
        const modifiedFiles = [...new Set(modifications.map(m => m.filePath))];
        const checkpointId = `cp_${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`;

        // Store original contents
        for (const filePath of modifiedFiles) {
            try {
                const uri = vscode.Uri.file(filePath);
                const document = await vscode.workspace.openTextDocument(uri);
                this.originalContents.set(filePath, document.getText());
            } catch {
                // File doesn't exist yet, that's okay
            }
        }

        return {
            checkpointId,
            timestamp: new Date(),
            modifiedFiles,
            diffHash: this.generateHash(modifiedFiles.join(',')),
            rollbackCommand: `bytecoder rollback ${checkpointId}`,
            description: `Checkpoint before modifying ${modifiedFiles.length} files`
        };
    }

    /**
     * Rollback to a checkpoint
     */
    async rollback(checkpointId?: string): Promise<boolean> {
        try {
            for (const [filePath, content] of this.originalContents) {
                const uri = vscode.Uri.file(filePath);

                try {
                    // Create full file replace edit
                    const document = await vscode.workspace.openTextDocument(uri);
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
                } catch {
                    // File was created, delete it
                    try {
                        await vscode.workspace.fs.delete(uri);
                    } catch { }
                }
            }

            this.originalContents.clear();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Fuzzy find a block in content
     */
    private fuzzyFind(content: string, searchBlock: string): boolean {
        // Normalize whitespace for comparison
        const normalizedContent = content.replace(/\s+/g, ' ').trim();
        const normalizedSearch = searchBlock.replace(/\s+/g, ' ').trim();

        return normalizedContent.includes(normalizedSearch);
    }

    /**
     * Generate a diff string for display
     */
    private generateDiff(filePath: string, oldContent: string, newContent: string): string {
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const lines: string[] = [];

        lines.push(`--- a/${filePath.split('/').pop()}`);
        lines.push(`+++ b/${filePath.split('/').pop()}`);
        lines.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);

        for (const line of oldLines) {
            lines.push(`-${line}`);
        }
        for (const line of newLines) {
            lines.push(`+${line}`);
        }

        return lines.join('\n');
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
     * Clear stored original contents
     */
    clearCache(): void {
        this.originalContents.clear();
    }
}

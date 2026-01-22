/**
 * PipelineEngine - Dynamic pipeline executor for Byte Coder
 * Executes agent pipelines with parallel support, dependency resolution, and error recovery
 */

import * as vscode from 'vscode';
import {
    PipelineStep,
    AgentOutput,
    ManagerDecision,
    ExecutionResult,
    Checkpoint
} from './AgentTypes';

// Agent type imports (we'll import actual agents later)
import { IntentAnalyzer, SearchIntent } from '../agents/IntentAnalyzer';
import { FileFinderAgent, FileMatch } from '../agents/FileFinderAgent';
import { CodeExtractorAgent, ExtractionResult } from '../agents/CodeExtractorAgent';
import { RelevanceScorerAgent, ScoredResult, ScoredChunk } from '../agents/RelevanceScorerAgent';

export interface PipelineContext {
    query: string;
    activeFilePath?: string;
    selectionText?: string;
    decision: ManagerDecision;
    results: Map<string, AgentOutput>;
    checkpoints: Checkpoint[];
    startTime: number;
}

export interface PipelineStatus {
    phase: string;
    currentAgent: string;
    progress: number;  // 0-100
    message: string;
    isComplete: boolean;
    hasError: boolean;
}

type StatusCallback = (status: PipelineStatus) => void;

export class PipelineEngine {
    private intentAnalyzer: IntentAnalyzer;
    private fileFinder: FileFinderAgent;
    private codeExtractor: CodeExtractorAgent;
    private relevanceScorer: RelevanceScorerAgent;

    // Agent registry for dynamic dispatch
    private agents: Map<string, any> = new Map();

    constructor() {
        // Initialize existing agents
        this.intentAnalyzer = new IntentAnalyzer();
        this.fileFinder = new FileFinderAgent();
        this.codeExtractor = new CodeExtractorAgent();
        this.relevanceScorer = new RelevanceScorerAgent();

        // Register agents
        this.agents.set('IntentAnalyzer', this.intentAnalyzer);
        this.agents.set('FileSearch', this.fileFinder);
        this.agents.set('CodeExtractor', this.codeExtractor);
        this.agents.set('RelevanceScorer', this.relevanceScorer);
    }

    /**
     * Execute a pipeline from a manager decision
     */
    async execute(
        decision: ManagerDecision,
        query: string,
        activeFilePath?: string,
        selectionText?: string,
        onStatus?: StatusCallback
    ): Promise<{
        context: string;
        results: Map<string, AgentOutput>;
        debugSummary: string;
    }> {
        const context: PipelineContext = {
            query,
            activeFilePath,
            selectionText,
            decision,
            results: new Map(),
            checkpoints: [],
            startTime: Date.now()
        };

        const totalSteps = decision.pipeline.length;
        let completedSteps = 0;

        // Group steps by parallel execution capability
        const stepGroups = this.groupSteps(decision.pipeline);

        for (const group of stepGroups) {
            // Emit status
            this.emitStatus(onStatus, {
                phase: this.getPhaseForAgent(group[0].agent),
                currentAgent: group.map(s => s.agent).join(', '),
                progress: Math.round((completedSteps / totalSteps) * 100),
                message: `Running ${group.length > 1 ? 'parallel' : ''} agents: ${group.map(s => s.agent).join(', ')}`,
                isComplete: false,
                hasError: false
            });

            if (group.length === 1) {
                // Sequential execution
                await this.executeStep(group[0], context);
            } else {
                // Parallel execution
                await Promise.all(group.map(step => this.executeStep(step, context)));
            }

            completedSteps += group.length;
        }

        // Build final context output
        const contextOutput = await this.buildContext(context);
        const debugSummary = this.buildDebugSummary(context);

        this.emitStatus(onStatus, {
            phase: 'Complete',
            currentAgent: '',
            progress: 100,
            message: 'Pipeline execution complete',
            isComplete: true,
            hasError: false
        });

        return {
            context: contextOutput,
            results: context.results,
            debugSummary
        };
    }

    /**
     * Execute the legacy search pipeline (for backward compatibility)
     */
    async search(
        query: string,
        activeFilePath?: string,
        onStatus?: (phase: string, message: string) => void
    ): Promise<string> {
        const statusAdapter: StatusCallback = (status) => {
            onStatus?.(status.phase, status.message);
        };

        // 1. Analyze intent
        this.emitStatus(statusAdapter, {
            phase: 'Analyzing',
            currentAgent: 'IntentAnalyzer',
            progress: 10,
            message: 'Analyzing query intent...',
            isComplete: false,
            hasError: false
        });

        const intent = this.intentAnalyzer.analyze(query);

        // 2. Find files
        this.emitStatus(statusAdapter, {
            phase: 'Searching',
            currentAgent: 'FileSearch',
            progress: 30,
            message: `Searching for relevant files...`,
            isComplete: false,
            hasError: false
        });

        const fileMatches = await this.fileFinder.find(intent, activeFilePath);

        if (fileMatches.length === 0) {
            return this.formatNoResults(intent);
        }

        // 3. Extract code
        this.emitStatus(statusAdapter, {
            phase: 'Extracting',
            currentAgent: 'CodeExtractor',
            progress: 50,
            message: `Extracting code from ${fileMatches.length} files...`,
            isComplete: false,
            hasError: false
        });

        const extractionPromises = fileMatches.map(match =>
            this.codeExtractor.extract(match.uri.fsPath, match.relativePath, intent)
        );
        const extractions = await Promise.all(extractionPromises);

        // 4. Score and select
        this.emitStatus(statusAdapter, {
            phase: 'Scoring',
            currentAgent: 'RelevanceScorer',
            progress: 80,
            message: 'Ranking results by relevance...',
            isComplete: false,
            hasError: false
        });

        const scored = this.relevanceScorer.score(extractions, fileMatches, intent);
        const selection = this.relevanceScorer.selectForContext(scored);

        // 5. Format output
        this.emitStatus(statusAdapter, {
            phase: 'Complete',
            currentAgent: '',
            progress: 100,
            message: 'Context ready',
            isComplete: true,
            hasError: false
        });

        return this.formatContext(scored, selection, intent, Date.now());
    }

    /**
     * Group pipeline steps for parallel execution
     */
    private groupSteps(pipeline: PipelineStep[]): PipelineStep[][] {
        const groups: PipelineStep[][] = [];
        let currentGroup: PipelineStep[] = [];

        for (const step of pipeline) {
            if (step.parallel && currentGroup.length > 0 && currentGroup[0].parallel) {
                // Add to parallel group if dependencies are met
                if (!step.dependency || this.isDependencyInGroup(step.dependency, currentGroup)) {
                    currentGroup.push(step);
                } else {
                    // Start new group
                    groups.push(currentGroup);
                    currentGroup = [step];
                }
            } else {
                if (currentGroup.length > 0) {
                    groups.push(currentGroup);
                }
                currentGroup = [step];
            }
        }

        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }

        return groups;
    }

    private isDependencyInGroup(dep: number, group: PipelineStep[]): boolean {
        return group.some(s => s.step === dep);
    }

    /**
     * Execute a single pipeline step
     */
    private async executeStep(step: PipelineStep, context: PipelineContext): Promise<void> {
        const agent = this.agents.get(step.agent);

        if (!agent) {
            // Agent not yet implemented - log and continue
            context.results.set(step.agent, {
                agent: step.agent,
                status: 'partial',
                confidence: 0,
                executionTimeMs: 0,
                payload: null,
                reasoning: `Agent ${step.agent} not yet implemented`
            });
            return;
        }

        try {
            const startTime = Date.now();
            let result: any;

            // Route to appropriate agent method
            switch (step.agent) {
                case 'IntentAnalyzer':
                    result = this.intentAnalyzer.analyze(context.query);
                    break;
                case 'FileSearch':
                    result = await this.fileFinder.find(
                        context.results.get('IntentAnalyzer')?.payload || this.intentAnalyzer.analyze(context.query),
                        context.activeFilePath
                    );
                    break;
                case 'CodeExtractor':
                    const files = context.results.get('FileSearch')?.payload as FileMatch[] || [];
                    const intent = context.results.get('IntentAnalyzer')?.payload || this.intentAnalyzer.analyze(context.query);
                    result = await Promise.all(files.map(f =>
                        this.codeExtractor.extract(f.uri.fsPath, f.relativePath, intent)
                    ));
                    break;
                case 'RelevanceScorer':
                    const extractions = context.results.get('CodeExtractor')?.payload as ExtractionResult[] || [];
                    const fileMatches = context.results.get('FileSearch')?.payload as FileMatch[] || [];
                    const searchIntent = context.results.get('IntentAnalyzer')?.payload;
                    result = this.relevanceScorer.score(extractions, fileMatches, searchIntent);
                    break;
                default:
                    result = null;
            }

            context.results.set(step.agent, {
                agent: step.agent,
                status: 'success',
                confidence: 0.9,
                executionTimeMs: Date.now() - startTime,
                payload: result
            });

        } catch (error) {
            context.results.set(step.agent, {
                agent: step.agent,
                status: 'failed',
                confidence: 0,
                executionTimeMs: 0,
                payload: null,
                error: {
                    type: (error as Error).name,
                    message: (error as Error).message
                }
            });
        }
    }

    /**
     * Build context string from pipeline results
     */
    private async buildContext(context: PipelineContext): Promise<string> {
        const scored = context.results.get('RelevanceScorer')?.payload as ScoredResult[] || [];
        const selection = this.relevanceScorer.selectForContext(scored);
        const intent = context.results.get('IntentAnalyzer')?.payload;

        return this.formatContext(scored, selection, intent, context.startTime);
    }

    /**
     * Format context output for AI consumption
     */
    private formatContext(
        results: ScoredResult[],
        selection: Map<string, ScoredChunk[]>,
        intent: SearchIntent,
        startTime: number
    ): string {
        if (selection.size === 0) {
            return this.formatNoResults(intent);
        }

        const lines: string[] = [];
        lines.push('=== RELEVANT CODE CONTEXT ===');
        lines.push(`Query type: ${intent.queryType} | Keywords: ${intent.keywords.slice(0, 5).join(', ')}`);
        lines.push(`Files analyzed: ${results.length} | Time: ${Date.now() - startTime}ms`);
        lines.push('');

        for (const [filePath, chunks] of selection) {
            const result = results.find(r => r.relativePath === filePath);
            if (!result) continue;

            lines.push(`--- FILE: ${filePath} (${result.language}) ---`);
            lines.push(`Score: ${result.overallScore.toFixed(1)} | Mode: ${result.extractionMode}`);
            lines.push('');

            for (const chunk of chunks) {
                if (chunk.name) {
                    lines.push(`// ${chunk.type}: ${chunk.name} (lines ${chunk.startLine}-${chunk.endLine})`);
                }
                lines.push(chunk.content);
                lines.push('');
            }
        }

        lines.push('=== END CONTEXT ===');
        return lines.join('\n');
    }

    private formatNoResults(intent: SearchIntent): string {
        return `No relevant files found for: ${intent.keywords.join(', ')}\n` +
            `Query type: ${intent.queryType}\n` +
            `Try being more specific or check if the files exist in the workspace.`;
    }

    /**
     * Build debug summary of pipeline execution
     */
    private buildDebugSummary(context: PipelineContext): string {
        const lines: string[] = ['Pipeline Execution Summary:'];

        for (const [agent, result] of context.results) {
            lines.push(`  ${agent}: ${result.status} (${result.executionTimeMs}ms, confidence: ${result.confidence})`);
            if (result.error) {
                lines.push(`    Error: ${result.error.message}`);
            }
        }

        lines.push(`Total time: ${Date.now() - context.startTime}ms`);
        return lines.join('\n');
    }

    /**
     * Get the phase name for an agent
     */
    private getPhaseForAgent(agent: string): string {
        const phases: Record<string, string> = {
            'IntentAnalyzer': 'Analysis',
            'FileSearch': 'Discovery',
            'FilePartSearcher': 'Discovery',
            'ContextSearch': 'Discovery',
            'Vision': 'Analysis',
            'ProcessPlanner': 'Planning',
            'CodePlanner': 'Planning',
            'TaskPlanner': 'Planning',
            'FileReader': 'Execution',
            'CommandGenerator': 'Execution',
            'CodeModifier': 'Execution',
            'Executor': 'Validation',
            'VersionController': 'Safety',
            'DocWriter': 'Documentation'
        };
        return phases[agent] || 'Processing';
    }

    private emitStatus(callback: StatusCallback | undefined, status: PipelineStatus): void {
        callback?.(status);
    }

    /**
     * Clear all agent caches
     */
    clearCache(): void {
        this.fileFinder.clearCache();
    }

    /**
     * Get project map (for context)
     */
    async getProjectMap(): Promise<string> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) return 'No workspace open';

        const lines: string[] = ['Project Structure:'];

        try {
            const files = await vscode.workspace.findFiles(
                '**/*.{ts,tsx,js,jsx,py,java,cs,go,rb,php,vue,svelte,json,md}',
                '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**}'
            );

            // Group by directory
            const dirs = new Map<string, string[]>();
            for (const file of files) {
                const rel = vscode.workspace.asRelativePath(file);
                const parts = rel.split('/');
                const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
                const fileName = parts[parts.length - 1];

                if (!dirs.has(dir)) dirs.set(dir, []);
                dirs.get(dir)!.push(fileName);
            }

            // Format output
            const sortedDirs = [...dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            for (const [dir, fileNames] of sortedDirs.slice(0, 20)) {
                lines.push(`  ${dir}/`);
                for (const file of fileNames.slice(0, 5)) {
                    lines.push(`    ${file}`);
                }
                if (fileNames.length > 5) {
                    lines.push(`    ... and ${fileNames.length - 5} more`);
                }
            }

            if (sortedDirs.length > 20) {
                lines.push(`  ... and ${sortedDirs.length - 20} more directories`);
            }

        } catch (e) {
            lines.push('  (Unable to read project structure)');
        }

        return lines.join('\n');
    }
}

// Re-export for convenience
export { SearchIntent } from '../agents/IntentAnalyzer';

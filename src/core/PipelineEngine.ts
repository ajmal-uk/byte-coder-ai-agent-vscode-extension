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
    Checkpoint,
    TaskNode,
    PipelineStatus
} from './AgentTypes';

// Agent type imports
import { IntentAnalyzer, SearchIntent } from '../agents/IntentAnalyzer';
import { FileFinderAgent, FileMatch } from '../agents/FileFinderAgent';
import { ContextPlanner, ContextPlan } from '../agents/ContextPlanner';
import { ContextAnalyzer, AnalyzedContext } from '../agents/ContextAnalyzer';
import { ContextSearchAgent } from '../agents/ContextSearchAgent';
import { FilePartSearcherAgent } from '../agents/FilePartSearcherAgent';
import { ProcessPlannerAgent, ProcessPlannerInput } from '../agents/ProcessPlannerAgent';
import { CodePlannerAgent } from '../agents/CodePlannerAgent';
import { TaskPlannerAgent, TaskPlannerResult } from '../agents/TaskPlannerAgent';
import { VersionControllerAgent } from '../agents/VersionControllerAgent';
import { CommandGeneratorAgent } from '../agents/CommandGeneratorAgent';
import { CodeModifierAgent, CodeModifierInput } from '../agents/CodeModifierAgent';
import { CodeGeneratorAgent } from '../agents/CodeGeneratorAgent';
import { ExecutorAgent } from '../agents/ExecutorAgent';
import { DocWriterAgent } from '../agents/DocWriterAgent';

export interface PipelineContext {
    query: string;
    activeFilePath?: string;
    selectionText?: string;
    decision: ManagerDecision;
    results: Map<string, AgentOutput>;
    checkpoints: Checkpoint[];
    startTime: number;
    currentPlan?: TaskNode[];
}

type StatusCallback = (status: PipelineStatus) => void;

export class PipelineEngine {
    private intentAnalyzer: IntentAnalyzer;
    private fileFinder: FileFinderAgent;
    private contextPlanner: ContextPlanner;
    private contextAnalyzer: ContextAnalyzer;
    private contextSearch: ContextSearchAgent;
    private filePartSearcher: FilePartSearcherAgent;
    private processPlanner: ProcessPlannerAgent;
    private codePlanner: CodePlannerAgent;
    private taskPlanner: TaskPlannerAgent;
    private versionController: VersionControllerAgent;
    private commandGenerator: CommandGeneratorAgent;
    private codeGenerator: CodeGeneratorAgent;
    private codeModifier: CodeModifierAgent;
    private executor: ExecutorAgent;
    private docWriter: DocWriterAgent;

    // Agent registry for dynamic dispatch
    private agents: Map<string, any> = new Map();

    constructor() {
        // Initialize agents
        this.intentAnalyzer = new IntentAnalyzer();
        this.fileFinder = new FileFinderAgent();
        this.contextPlanner = new ContextPlanner();
        this.contextAnalyzer = new ContextAnalyzer();
        this.contextSearch = new ContextSearchAgent();
        this.filePartSearcher = new FilePartSearcherAgent();
        this.processPlanner = new ProcessPlannerAgent();
        this.codePlanner = new CodePlannerAgent();
        this.taskPlanner = new TaskPlannerAgent();
        this.versionController = new VersionControllerAgent();
        this.commandGenerator = new CommandGeneratorAgent();
        this.codeGenerator = new CodeGeneratorAgent();
        this.codeModifier = new CodeModifierAgent();
        this.executor = new ExecutorAgent();
        this.docWriter = new DocWriterAgent();

        // Register agents
        this.agents.set('IntentAnalyzer', this.intentAnalyzer);
        this.agents.set('FileSearch', this.fileFinder);
        this.agents.set('ContextPlanner', this.contextPlanner);
        this.agents.set('ContextAnalyzer', this.contextAnalyzer);
        this.agents.set('ContextSearch', this.contextSearch);
        this.agents.set('FilePartSearcher', this.filePartSearcher);
        this.agents.set('ProcessPlanner', this.processPlanner);
        this.agents.set('CodePlanner', this.codePlanner);
        this.agents.set('TaskPlanner', this.taskPlanner);
        this.agents.set('VersionController', this.versionController);
        this.agents.set('CommandGenerator', this.commandGenerator);
        this.agents.set('CodeGenerator', this.codeGenerator);
        this.agents.set('CodeModifier', this.codeModifier);
        this.agents.set('Executor', this.executor);
        this.agents.set('DocWriter', this.docWriter);
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
            startTime: Date.now(),
            currentPlan: undefined
        };

        const totalSteps = decision.pipeline.length;
        let completedSteps = 0;

        // Group steps by parallel execution capability
        const stepGroups = this.groupSteps(decision.pipeline);

        for (const group of stepGroups) {
            // Update plan status to in_progress
            group.forEach(step => this.updatePlanStatus(context, step.agent, 'in_progress'));

            // Emit status
            this.emitStatus(onStatus, {
                phase: this.getPhaseForAgent(group[0].agent),
                currentAgent: group.map(s => s.agent).join(', '),
                progress: Math.round((completedSteps / totalSteps) * 100),
                message: group.length > 1
                    ? `Running parallel agents: ${group.map(s => s.agent).join(', ')}`
                    : `Running ${group[0].agent}...`,
                isComplete: false,
                hasError: false,
                plan: context.currentPlan,
                activeTaskId: this.getActiveTaskId(context, group[0].agent)
            });

            if (group.length === 1) {
                // Sequential execution
                await this.executeStep(group[0], context);
            } else {
                // Parallel execution
                await Promise.all(group.map(step => this.executeStep(step, context)));
            }

            // Check for failures
            const groupResults = group.map(step => context.results.get(step.agent));
            const failedStep = group.find(step => {
                const res = context.results.get(step.agent);
                return res?.status === 'failed';
            });

            if (failedStep) {
                const failureRes = context.results.get(failedStep.agent);
                this.updatePlanStatus(context, failedStep.agent, 'failed');
                
                // Emit failure status
                this.emitStatus(onStatus, {
                    phase: 'Error',
                    currentAgent: failedStep.agent,
                    progress: Math.round((completedSteps / totalSteps) * 100),
                    message: `Pipeline stopped: ${failureRes?.error?.message || 'Unknown error'}`,
                    isComplete: false,
                    hasError: true,
                    plan: context.currentPlan,
                    activeTaskId: this.getActiveTaskId(context, failedStep.agent)
                });

                // Add a dynamic "Fix/Recovery" task if we have a plan
                if (context.currentPlan) {
                    const failedTaskIndex = this.getTaskIndexForAgent(failedStep.agent);
                    if (failedTaskIndex >= 0) {
                        // Add recovery task
                        const recoveryTask: TaskNode = {
                            id: `recovery-${Date.now()}`,
                            description: `Fix issues from ${failedStep.agent} failure`,
                            dependencies: [context.currentPlan[failedTaskIndex].id],
                            status: 'pending'
                        };
                        context.currentPlan.splice(failedTaskIndex + 1, 0, recoveryTask);
                        
                        // Emit updated plan
                        this.emitStatus(onStatus, {
                            phase: 'Planning',
                            currentAgent: 'TaskPlanner',
                            progress: Math.round((completedSteps / totalSteps) * 100),
                            message: 'Added recovery task to plan',
                            isComplete: false,
                            hasError: true, // Keep error flag so UI knows
                            plan: context.currentPlan
                        });
                    }
                }

                // Stop execution for now (until we implement actual recovery agent loop)
                break; 
            }

            // Update plan status to completed for successful steps
            group.forEach(step => this.updatePlanStatus(context, step.agent, 'completed'));

            // Update plan if TaskPlanner was executed
            if (context.results.has('TaskPlanner')) {
                const taskResult = context.results.get('TaskPlanner')?.payload as TaskPlannerResult;
                if (taskResult && taskResult.taskGraph) {
                    context.currentPlan = taskResult.taskGraph;
                    
                    // Retroactively update plan for steps that already ran
                    this.retroactivePlanUpdate(context);

                    // Emit status with new plan
                    this.emitStatus(onStatus, {
                        phase: 'Planning',
                        currentAgent: 'TaskPlanner',
                        progress: Math.round(((completedSteps + 1) / totalSteps) * 100),
                        message: 'Implementation plan generated',
                        isComplete: false,
                        hasError: false,
                        plan: context.currentPlan
                    });
                }
            }

            completedSteps += group.length;
        }

        // Build final context output
        let contextOutput = '';
        if (context.results.has('ContextAnalyzer')) {
            const analysis = context.results.get('ContextAnalyzer')?.payload as AnalyzedContext;
            contextOutput = analysis ? analysis.summary : await this.buildContext(context);
        } else {
            contextOutput = await this.buildContext(context);
        }

        const debugSummary = this.buildDebugSummary(context);

        this.emitStatus(onStatus, {
            phase: 'Complete',
            currentAgent: '',
            progress: 100,
            message: 'Pipeline execution complete',
            isComplete: true,
            hasError: false,
            plan: context.currentPlan
        });

        return {
            context: contextOutput,
            results: context.results,
            debugSummary
        };
    }

    /**
     * Smart Context Search (New Architecture)
     */
    async search(
        query: string,
        activeFilePath?: string,
        onStatus?: (phase: string, message: string) => void
    ): Promise<string> {
        const statusAdapter: StatusCallback = (status) => {
            onStatus?.(status.phase, status.message);
        };

        const startTime = Date.now();

        // 1. Planning Phase
        this.emitStatus(statusAdapter, {
            phase: 'Planning',
            currentAgent: 'ContextPlanner',
            progress: 10,
            message: 'Thought: Analyzing query to determine context strategy...',
            isComplete: false,
            hasError: false
        });

        const plan = this.contextPlanner.analyze(query, activeFilePath);

        this.emitStatus(statusAdapter, {
            phase: 'Discovery',
            currentAgent: 'FileSearch',
            progress: 30,
            message: `Thought: Strategy determined. Searching for files (Scope: ${plan.scope})...`,
            isComplete: false,
            hasError: false
        });

        // 2. Discovery Phase (Parallel Search)
        // Convert Plan to Search Intent for legacy FileFinder compatibility for now
        // Ideally FileFinder should accept the Plan directly
        const searchIntent: SearchIntent = {
            keywords: plan.searchTerms,
            queryType: mapScopeToQueryType(plan.scope),
            codeTerms: [],
            filePatterns: plan.filePatterns,
            complexity: 'simple',
            mentionedFiles: [],
            symbols: plan.symbolSearch
        };

        const fileMatches = await this.fileFinder.find(searchIntent, activeFilePath);

        // Filter by plan's file patterns if strict
        const filteredFiles = fileMatches.filter(f => {
            // Simple extension check from plan.filePatterns
            if (plan.filePatterns.length === 0) return true;
            return plan.filePatterns.some(pat => f.uri.fsPath.endsWith(pat.replace('*', '')));
        });

        if (filteredFiles.length === 0) {
            return "No relevant files found. Please try clarifying your request.";
        }

        // 3. Analysis Phase (Parallel Processing)
        this.emitStatus(statusAdapter, {
            phase: 'Analysis',
            currentAgent: 'ContextAnalyzer',
            progress: 60,
            message: `Thought: Analyzing ${filteredFiles.length} files for relevance...`,
            isComplete: false,
            hasError: false
        });

        // Read files in parallel
        const fileContents = await Promise.all(filteredFiles.map(async f => {
            try {
                const doc = await vscode.workspace.openTextDocument(f.uri);
                return {
                    uri: f.uri,
                    relativePath: f.relativePath,
                    content: doc.getText(),
                    languageId: doc.languageId
                };
            } catch (e) {
                return null;
            }
        }));

        const validFiles = fileContents.filter(f => f !== null) as any[];

        // Analyze
        const analysis = this.contextAnalyzer.analyze(
            validFiles,
            plan.searchTerms,
            plan.symbolSearch,
            20000 // Token limit
        );

        this.emitStatus(statusAdapter, {
            phase: 'Complete',
            currentAgent: '',
            progress: 100,
            message: 'Context ready',
            isComplete: true,
            hasError: false
        });

        return analysis.summary;
    }

    /**
     * Group pipeline steps for parallel execution
     */
    private groupSteps(pipeline: PipelineStep[]): PipelineStep[][] {
        const groups: PipelineStep[][] = [];
        let currentGroup: PipelineStep[] = [];

        for (const step of pipeline) {
            if (step.parallel && currentGroup.length > 0 && currentGroup[0].parallel) {
                // If step has a dependency, ensure it's NOT in the current group (cannot run parallel with dependency)
                const hasDependencyInGroup = step.dependency !== undefined && this.isDependencyInGroup(step.dependency, currentGroup);

                if (!hasDependencyInGroup) {
                    currentGroup.push(step);
                } else {
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

        let attempts = 0;
        const maxRetries = step.agent === 'Executor' || step.agent === 'CodeModifier' ? 0 : 2;

        while (attempts <= maxRetries) {
            try {
                const startTime = Date.now();
                let result: any;

                switch (step.agent) {
                    case 'ContextPlanner':
                        result = this.contextPlanner.analyze(context.query, context.activeFilePath);
                        break;
                    case 'ContextAnalyzer': {
                        // Requires files to be found first (dependency)
                        const filesFound = context.results.get('FileSearch')?.payload as FileMatch[] || [];

                        if (filesFound.length === 0) {
                            result = { summary: "No files to analyze", chunks: [] };
                            break;
                        }

                        // Read files in parallel
                        const fileContents = await Promise.all(filesFound.map(async f => {
                            try {
                                const doc = await vscode.workspace.openTextDocument(f.uri);
                                return {
                                    uri: f.uri,
                                    content: doc.getText()
                                };
                            } catch (e) {
                                return null;
                            }
                        }));

                        const validFiles = fileContents.filter(f => f !== null) as { uri: vscode.Uri, content: string }[];

                        // Get terms from planner or intent
                        const plan = context.results.get('ContextPlanner')?.payload as ContextPlan;
                        const intent = context.results.get('IntentAnalyzer')?.payload as any;

                        const searchTerms = plan?.searchTerms || intent?.keywords || [];
                        const symbolSearch = plan?.symbolSearch || intent?.symbols || [];

                        result = this.contextAnalyzer.analyze(
                            validFiles,
                            searchTerms,
                            symbolSearch,
                            20000 // Token limit
                        );
                        break;
                    }
                    case 'ContextSearch':
                        result = await this.contextSearch.execute({
                            query: context.query,
                            lookForPreviousFixes: step.args?.lookForPreviousFixes
                        });
                        break;
                    case 'FilePartSearcher':
                        // If refineSearch is requested, we need files to search in
                        const foundFiles = context.results.get('FileSearch')?.payload as FileMatch[] || [];
                        const activeFile = context.activeFilePath;

                        // If we have an active file, search there
                        if (activeFile) {
                            result = await this.filePartSearcher.execute({
                                filePath: activeFile,
                                searchFor: { text: context.query } // Simplified
                            });
                        } else if (foundFiles.length > 0) {
                            // Search up to 5 files in parallel
                            const filesToSearch = foundFiles.slice(0, 5);
                            const searchResults = await Promise.all(filesToSearch.map(f =>
                                this.filePartSearcher.execute({
                                    filePath: f.uri.fsPath,
                                    searchFor: { text: context.query }
                                })
                            ));
                            // Aggregate all matches
                            result = searchResults.flatMap(r => r.payload || []);
                        } else {
                            result = [];
                        }
                        break;
                    case 'IntentAnalyzer':
                        result = this.intentAnalyzer.analyze(context.query);
                        break;
                    case 'FileSearch':
                        const intent = context.results.get('IntentAnalyzer')?.payload || this.intentAnalyzer.analyze(context.query);
                        result = await this.fileFinder.find(intent, context.activeFilePath);
                        break;
                    case 'ProcessPlanner':
                        result = await this.processPlanner.execute({
                            query: context.query,
                            projectType: step.args?.projectType
                        });
                        break;
                    case 'CodePlanner':
                        const processPlan = context.results.get('ProcessPlanner')?.payload;
                        const searchFiles = context.results.get('FileSearch')?.payload as FileMatch[] || [];
                        const existingFiles = searchFiles.map(f => f.relativePath);

                        result = await this.codePlanner.execute({
                            query: context.query,
                            projectType: processPlan?.projectType || step.args?.projectType || 'web',
                            existingFiles: existingFiles,
                            techStack: processPlan?.techStack
                        });
                        break;
                    case 'TaskPlanner':
                        const cPlan = context.results.get('CodePlanner')?.payload;
                        result = await this.taskPlanner.execute({
                            query: context.query,
                            projectType: step.args?.projectType || 'web',
                            fileStructure: cPlan?.fileStructure || [],
                            interfaces: cPlan?.interfaces || [],
                            apiEndpoints: cPlan?.apiEndpoints
                        });
                        break;
                    case 'VersionController':
                        result = await this.versionController.execute({
                            action: step.args?.action || 'create_checkpoint',
                            description: 'Pipeline execution checkpoint'
                        } as any);
                        break;
                    case 'CommandGenerator':
                        const tPlan = context.results.get('TaskPlanner')?.payload;
                        result = await this.commandGenerator.execute({
                            taskPlan: tPlan,
                            generateStructure: step.args?.generateStructure
                        } as any);
                        break;
                    case 'CodeGenerator':
                        const tPlanForGen = context.results.get('TaskPlanner')?.payload;
                        const cPlanForGen = context.results.get('CodePlanner')?.payload;
                        result = await this.codeGenerator.execute({
                            taskPlan: tPlanForGen,
                            codePlan: cPlanForGen
                        });
                        break;
                    case 'CodeModifier':
                        const codeGenModifications = context.results.get('CodeGenerator')?.payload?.modifications || [];
                        result = await this.codeModifier.execute({
                            modifications: codeGenModifications,
                            createCheckpoint: false
                        });
                        break;
                    case 'Executor':
                        const cmdGenResult = context.results.get('CommandGenerator')?.payload;
                        const codeGenResult = context.results.get('CodeGenerator')?.payload;

                        const commands = [
                            ...(cmdGenResult?.commands || []),
                            ...(codeGenResult?.commands || [])
                        ];

                        result = await this.executor.execute({
                            commands: commands,
                            cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath
                        } as any);
                        break;
                    case 'DocWriter':
                        result = await this.docWriter.execute({
                            context: Object.fromEntries(context.results)
                        } as any);
                        break;
                    case 'ContentRetriever':
                        let fullContent = "";
                        // 1. Try active file
                        if (context.activeFilePath) {
                             const root = vscode.workspace.workspaceFolders?.[0]?.uri;
                             if (root) {
                                 try {
                                     const fullUri = vscode.Uri.joinPath(root, context.activeFilePath);
                                     const doc = await vscode.workspace.openTextDocument(fullUri);
                                     fullContent = `File: ${context.activeFilePath} (FULL CONTENT)\n\`\`\`${doc.languageId}\n${doc.getText()}\n\`\`\``;
                                 } catch (e) {
                                     // ignore
                                 }
                             }
                        }

                        // 2. If no active file or failed, search for file in query
                        if (!fullContent) {
                            const intent = context.results.get('IntentAnalyzer')?.payload || this.intentAnalyzer.analyze(context.query);
                            const foundFiles = await this.fileFinder.find(intent, context.activeFilePath);
                            
                            if (foundFiles && foundFiles.length > 0) {
                                 const f = foundFiles[0];
                                 const doc = await vscode.workspace.openTextDocument(f.uri);
                                 fullContent = `File: ${f.relativePath} (FULL CONTENT)\n\`\`\`${doc.languageId}\n${doc.getText()}\n\`\`\``;
                            }
                        }
                        
                        result = fullContent || "Could not retrieve full content. Please specify a valid file.";
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
                return; // Success, exit retry loop

            } catch (error) {
                attempts++;
                if (attempts > maxRetries) {
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
                } else {
                    // Exponential backoff
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
                }
            }
        }
    }

    /**
     * Build context string from pipeline results
     * (Legacy fallback)
     */
    /**
     * Build context string from pipeline results
     */
    private async buildContext(context: PipelineContext): Promise<string> {
        let contextOutput = "";

        // 0. Add Full Content (if requested)
        if (context.results.has('ContentRetriever')) {
            const content = context.results.get('ContentRetriever')?.payload;
            contextOutput += `\n### 📖 Full Content\n${content}\n`;
        }

        // 1. Add Plan Summary
        if (context.results.has('ContextPlanner')) {
            const plan = context.results.get('ContextPlanner')?.payload as ContextPlan;
            contextOutput += `\n### 🧠 Context Plan\n- Scope: ${plan.scope}\n- Strategy: ${plan.priority}\n`;
        }

        // 2. Add Intent Analysis
        if (context.results.has('IntentAnalyzer')) {
            const intent = context.results.get('IntentAnalyzer')?.payload;
            contextOutput += `\n### 🎯 Intent Analysis\n- Type: ${intent.queryType}\n- Complexity: ${intent.complexity}\n`;
        }

        // 3. Add Analyzed Code Context
        // (This might have been added by ContextAnalyzer result already, but if not...)
        if (context.results.has('ContextAnalyzer')) {
            const analysis = context.results.get('ContextAnalyzer')?.payload as AnalyzedContext;
            contextOutput += `\n### 📦 Code Context (${analysis.totalFiles} files analyzed)\n`;
            for (const chunk of analysis.chunks) {
                contextOutput += `\nFile: ${chunk.filePath} (lines ${chunk.startLine}-${chunk.endLine})\n`;
                contextOutput += `\`\`\`${chunk.filePath.split('.').pop()}\n${chunk.content}\n\`\`\`\n`;
            }
        } else if (context.results.has('FileSearch')) {
            // Fallback to raw file list if analysis failed/skipped
            const files = context.results.get('FileSearch')?.payload as FileMatch[];
            if (files && files.length > 0) {
                contextOutput += `\n### 📂 Found Files\n${files.map(f => `- ${f.relativePath}`).join('\n')}\n`;
            }
        }

        // 4. Add Project Plan (if applicable)
        if (context.results.has('TaskPlanner')) {
            const tasks = context.results.get('TaskPlanner')?.payload as TaskPlannerResult;
            contextOutput += `\n### 📋 Implementation Plan\n`;
            for (const task of tasks.taskGraph) {
                contextOutput += `- [ ] ${task.description}\n`;
                if (task.dependencies.length > 0) {
                    contextOutput += `  - Dependencies: ${task.dependencies.join(', ')}\n`;
                }
            }
        }

        // 5. Add Previous/Historical Context
        if (context.results.has('ContextSearch')) {
            const history = context.results.get('ContextSearch')?.payload;
            if (history) {
                contextOutput += `\n### 📜 Relevant History\n${history}\n`;
            }
        }

        return contextOutput;
    }

    /**
     * Build debug summary of pipeline execution
     */
    private buildDebugSummary(context: PipelineContext): string {
        const lines: string[] = ['Pipeline Execution Summary:'];
        for (const [agent, result] of context.results) {
            lines.push(`  ${agent}: ${result.status} (${result.executionTimeMs}ms)`);
            if (result.error) lines.push(`    Error: ${result.error.message}`);
        }
        lines.push(`Total time: ${Date.now() - context.startTime}ms`);
        return lines.join('\n');
    }

    /**
     * Get the phase name for an agent
     */
    private getPhaseForAgent(agent: string): string {
        const phases: Record<string, string> = {
            'ContextPlanner': 'Planning',
            'ContextAnalyzer': 'Analysis',
            'IntentAnalyzer': 'Analysis',
            'FileSearch': 'Discovery',
            'CodeGenerator': 'Execution',
            'CommandGenerator': 'Execution',
            'CodeModifier': 'Execution',
            'Executor': 'Validation',
        };
        return phases[agent] || 'Processing';
    }

    private emitStatus(callback: StatusCallback | undefined, status: PipelineStatus): void {
        callback?.(status);
    }

    clearCache(): void {
        this.fileFinder.clearCache();
    }

    async getProjectMap(): Promise<string> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) return 'No workspace open';
        return "Project Structure (Simulated)";
    }

    /**
     * Get the active task ID for the current agent
     */
    private getActiveTaskId(context: PipelineContext, agent: string): string | undefined {
        if (!context.currentPlan) return undefined;
        const index = this.getTaskIndexForAgent(agent);
        if (index >= 0 && index < context.currentPlan.length) {
            return context.currentPlan[index].id;
        }
        return undefined;
    }

    /**
     * Update plan status based on agent execution
     */
    private updatePlanStatus(context: PipelineContext, agent: string, status: 'in_progress' | 'completed' | 'failed') {
        if (!context.currentPlan) return;

        const targetTaskIndex = this.getTaskIndexForAgent(agent);

        if (targetTaskIndex >= 0 && targetTaskIndex < context.currentPlan.length) {
            context.currentPlan[targetTaskIndex].status = status;
        }
    }

    /**
     * Retroactively update plan for already executed steps
     */
    private retroactivePlanUpdate(context: PipelineContext) {
        if (!context.currentPlan) return;
        
        // If ContextAnalyzer ran, mark Analysis task as completed
        if (context.results.has('ContextAnalyzer') || context.results.has('IntentAnalyzer')) {
            this.updatePlanStatus(context, 'ContextAnalyzer', 'completed');
        }
        
        // Mark Planning task as completed
        this.updatePlanStatus(context, 'TaskPlanner', 'completed');
    }

    /**
     * Map agent to task index in the generic plan
     */
    private getTaskIndexForAgent(agent: string): number {
        const lowerAgent = agent.toLowerCase();

        if (['context', 'intent', 'filesearch', 'vision'].some(k => lowerAgent.includes(k))) {
            return 0; // Analyze
        } else if (['planner'].some(k => lowerAgent.includes(k))) {
            return 1; // Plan
        } else if (['modify', 'generate', 'command'].some(k => lowerAgent.includes(k))) {
            return 2; // Execute
        } else if (['executor', 'test', 'validate'].some(k => lowerAgent.includes(k))) {
            return 3; // Verify
        }
        return -1;
    }
}

function mapScopeToQueryType(scope: 'file' | 'folder' | 'workspace' | 'minimal'): 'general' | 'explain' | 'fix' {
    switch (scope) {
        case 'workspace': return 'general';
        case 'folder': return 'general';
        case 'file': return 'explain';
        case 'minimal': return 'general';
        default: return 'general';
    }
}

// Re-export for convenience
export { SearchIntent } from '../agents/IntentAnalyzer';

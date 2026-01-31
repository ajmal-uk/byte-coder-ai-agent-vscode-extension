import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';
import { ManagerAgent, ManagerInput } from './ManagerAgent';
import { TaskNode } from './AgentTypes';
import { ExecutorAgent } from '../agents/ExecutorAgent';
import { VersionControllerAgent } from '../agents/VersionControllerAgent';
import { CodeModifierAgent } from '../agents/CodeModifierAgent';
import { CodeGeneratorAgent } from '../agents/CodeGeneratorAgent';
import { TaskPlannerAgent, TaskPlannerResult } from '../agents/TaskPlannerAgent';
import { ContextSearchAgent } from '../agents/ContextSearchAgent';
import { ArchitectAgent, ArchitectureDesign } from '../agents/ArchitectAgent';
import { QualityAssuranceAgent, QAInput } from '../agents/QualityAssuranceAgent';
import { DocWriterAgent, DocWriterInput } from '../agents/DocWriterAgent';
import { PersonaManager, PersonaType } from './PersonaManager';

export interface AgenticAction {
    type: 'create_file' | 'modify_file' | 'run_command' | 'create_directory' | 'delete_file' | 'partial_edit' | 'create_folder';
    path?: string;
    content?: string;
    command?: string;
    description: string;
    result?: string;
    success?: boolean;
}

export interface AgenticResult {
    success: boolean;
    actions: AgenticAction[];
    summary: string;
    checkpointId?: string;
}

/**
 * AgentOrchestrator
 * 
 * The central nervous system of the Byte Coder Multi-Agent System.
 * It implements a "Think-Act-Verify" architecture to handle complex software engineering tasks.
 * 
 * =========================================================================================
 *                                PIPELINE ARCHITECTURE DIAGRAM
 * =========================================================================================
 * 
 *  User Request ──► [ Phase 0: MANAGER AGENT ]
 *                          │
 *                          ▼
 *                  Analyzes Intent & Complexity
 *                          │
 *          ┌───────────────┴───────────────┐
 *          ▼                               ▼
 *   (Complex/Design)                 (Simple/Fix)
 *          │                               │
 * [ Phase 1.1: ARCHITECT ]                 │
 *          │                               │
 *          ▼                               │
 * [ Phase 1.2: TASK PLANNER ] ◄────────────┘
 *          │
 *          ▼
 *    Generates DAG (Directed Acyclic Graph) of Tasks
 *          │
 *          ▼
 * [ Phase 2: EXECUTION ENGINE ] ◄───────────────┐
 *          │                                    │
 *    (Parallel Execution Loop)                  │
 *    ┌─────┬─────┬─────┬─────┐                  │
 *    ▼     ▼     ▼     ▼     ▼                  │
 * [Code] [Exec] [QA] [Doc] [Mod]           (Recovery)
 *    │     │     │     │     │                  │
 *    └─────┴──┬──┴─────┴─────┘                  │
 *             │                                 │
 *        Task Failed? ──────────────────────────┘
 *             │
 *        Task Success
 *             │
 *             ▼
 * [ Phase 3: VERIFICATION ]
 *             │
 *             ▼
 *      Final Result
 * 
 * =========================================================================================
 * 
 * DETAILED PROCESS FLOWS:
 * 
 * -----------------------------------------------------------------------------------------
 * PHASE 0: MANAGER AGENT (Intent Analysis)
 * -----------------------------------------------------------------------------------------
 * 
 *  Input (Query) ──► [ Intent Classifier ] ──► [ Complexity Scorer ] ──► Decision
 *                          │                           │
 *                          ▼                           ▼
 *                    (Build/Fix/Modify)         (Simple/Medium/Complex)
 * 
 * -----------------------------------------------------------------------------------------
 * PHASE 1.2: TASK PLANNER (Dependency Graph Generation)
 * -----------------------------------------------------------------------------------------
 * 
 *  High-Level Goal ──► [ Decomposition ] ──► [ Dependency Analysis ] ──► Task Graph (DAG)
 *                                                                             │
 *           ┌───────────────┬─────────────────┐                               │
 *           ▼               ▼                 ▼                               ▼
 *      [ Task A ] ──► [ Task B ] ──► [ Task C ]                       (Execution Order)
 *           │               │
 *           └───────────────┘
 *             (Dependencies)
 * 
 * -----------------------------------------------------------------------------------------
 * PHASE 2: EXECUTION ENGINE (The "Act" Loop)
 * -----------------------------------------------------------------------------------------
 * 
 *  Queue ──► [ Scheduler ] ──► Is Dependency Met? ──Yes──► [ Dispatch to Agent ]
 *                 ▲                   │                           │
 *                 │                   No                          ▼
 *                 │                   │                    [ Execute Action ]
 *                 └───────────────────┘                           │
 *                                                                 ▼
 *                                                          [ Verify Result ]
 *                                                                 │
 *                                         Success ◄───────────────┴──────────────► Failure
 *                                            │                                       │
 *                                            ▼                                       ▼
 *                                    [ Mark Complete ]                       [ Error Recovery ]
 *                                            │                                       │
 *                                            ▼                                       ▼
 *                                    [ Update Graph ] ◄────────────────────── [ Re-plan Task ]
 * 
 * =========================================================================================
 * 
 * PROCESS FLOW DETAILS:
 * 
 * 1. MANAGER AGENT (Phase 0):
 *    - Inputs: User Query, Active File, Project Type.
 *    - Outputs: Intent (Build, Fix, Modify...), Complexity (Simple, Medium, Complex).
 *    - Role: Routes the request to the appropriate pipeline path.
 * 
 * 2. ARCHITECT AGENT (Phase 1.1 - Conditional):
 *    - Triggered for: 'Complex' tasks, 'Build' or 'Design' intents.
 *    - Role: Analyzes codebase, proposes high-level system design, patterns, and structure.
 * 
 * 3. TASK PLANNER AGENT (Phase 1.2):
 *    - Role: Breaks down the high-level goal (or Design) into granular, executable tasks.
 *    - Output: A Task Graph with dependencies (e.g., "Create File A" must happen before "Edit File A").
 * 
 * 4. EXECUTION ENGINE (Phase 2):
 *    - Parallel Processing: Executes tasks that have no pending dependencies simultaneously.
 *    - Agents:
 *      - CodeGenerator: Writes new code or refactors existing code using LLMs.
 *      - Executor: Runs shell commands (npm install, git, etc.).
 *      - CodeModifier: Performs specific edits (redirected to CodeGenerator for intelligence).
 *      - QualityAssurance: Reviews code against requirements.
 *      - DocWriter: Generates documentation (README, inline comments).
 *    - Self-Correction: If a task fails, the Orchestrator attempts to "Recover" by asking the TaskPlanner to generate a fix.
 * 
 * 5. VERIFICATION (Phase 3):
 *    - Runs validation commands (tests, builds) associated with tasks to ensure correctness.
 */

export class AgentOrchestrator {
    private managerAgent: ManagerAgent;
    private executorAgent: ExecutorAgent;
    private versionController: VersionControllerAgent;
    private codeModifier: CodeModifierAgent;
    private codeGenerator: CodeGeneratorAgent;
    private taskPlanner: TaskPlannerAgent;
    private contextSearch: ContextSearchAgent;
    private architect: ArchitectAgent;
    private qualityAssurance: QualityAssuranceAgent;
    private docWriter: DocWriterAgent;
    private personaManager: PersonaManager;
    private workspaceRoot: string;

    // State management
    private currentAgentMode: 'plan' | 'build' = 'build';
    private currentContext: { message: string; filePath?: string } = { message: '' };

    constructor(private context: vscode.ExtensionContext) {
        this.managerAgent = new ManagerAgent();
        this.executorAgent = new ExecutorAgent();
        this.versionController = new VersionControllerAgent(context);
        this.codeModifier = new CodeModifierAgent();
        this.codeGenerator = new CodeGeneratorAgent();
        this.taskPlanner = new TaskPlannerAgent();
        this.contextSearch = new ContextSearchAgent(context);
        this.architect = new ArchitectAgent();
        this.qualityAssurance = new QualityAssuranceAgent();
        this.docWriter = new DocWriterAgent();
        this.personaManager = new PersonaManager();
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    // =========================================================================
    // Core Architecture: "Think-Act-Verify" Loop
    // =========================================================================

    /**
     * Main Entry Point: Execute a user request end-to-end
     * Implements the "Think-Act-Verify" loop
     */
    public async executeRequest(query: string, activeFilePath?: string): Promise<string> {
        try {
            // 0. MANAGER: Analyze Request
            console.log('[AgentOrchestrator] Phase 0: Manager Analysis...');
            const projectType = await this.detectProjectType();
            
            const managerInput: ManagerInput = {
                query,
                activeFilePath,
                projectType
            };
            
            const managerResult = await this.managerAgent.execute(managerInput);
            
            // Check if manager failed
            if (managerResult.status === 'failed') {
                console.warn('[AgentOrchestrator] Manager analysis failed, proceeding with default flow.');
            }
            
            const decision = managerResult.payload;
            console.log(`[AgentOrchestrator] Manager Decision: ${decision.intent} (${decision.complexity})`);

            // 1. THINK: Generate a Plan
            console.log('[AgentOrchestrator] Phase 1: Planning...');
            const fileStructure = await this.getFileStructure();

            // 1.1 ARCHITECT: Design the solution
            let design: ArchitectureDesign | undefined;
            
            // Only run Architect for complex/medium tasks or explicit design intent
            // This optimization saves time for simple fixes or questions
            if (decision.complexity === 'complex' || decision.intent === 'Design' || decision.intent === 'Build') {
                console.log('[AgentOrchestrator] Phase 1.1: Architectural Design...');
                const designResult = await this.architect.execute({
                    query,
                    projectType,
                    existingFiles: fileStructure
                });

                if (designResult.status === 'success' && designResult.payload) {
                    design = designResult.payload;
                    console.log(`[AgentOrchestrator] Architecture designed: ${design.architecture}`);
                }
            } else {
                console.log('[AgentOrchestrator] Skipping Architecture phase for simple/direct task.');
            }

            // 1.2 PLAN: Generate Tasks based on Design
            console.log('[AgentOrchestrator] Phase 1.2: Task Planning...');
            const planResult = await this.taskPlanner.execute({
                query,
                projectType,
                fileStructure,
                activeFilePath,
                interfaces: [],
                design // Pass the design to the planner
            });

            if (planResult.status !== 'success' || !planResult.payload || planResult.payload.taskGraph.length === 0) {
                return `Failed to generate a valid plan. Error: ${planResult.error?.message || 'Unknown planning error'}`;
            }

            const tasks = planResult.payload.taskGraph;
            const executionOrder = planResult.payload.executionOrder;
            
            // Sort tasks based on execution order
            const sortedTasks = executionOrder
                .map(id => tasks.find(t => t.id === id))
                .filter((t): t is TaskNode => !!t);
            
            // Add any tasks that might have been missed in executionOrder (safety fallback)
            const scheduledIds = new Set(sortedTasks.map(t => t.id));
            tasks.forEach(t => {
                if (!scheduledIds.has(t.id)) {
                    sortedTasks.push(t);
                }
            });

            console.log(`[AgentOrchestrator] Generated ${sortedTasks.length} tasks.`);

            // 2. ACT & VERIFY: Execute the plan
            Logger.log('[AgentOrchestrator] Phase 2: Execution & Verification...');
            await this.executeTaskGraph(sortedTasks, query);

            return "Request completed successfully.";

        } catch (error) {
            console.error('[AgentOrchestrator] Execution failed:', error);
            return `Execution failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    /**
     * Execute a graph of tasks with parallel processing capabilities
     */
    private async executeTaskGraph(tasks: TaskNode[], originalQuery: string): Promise<void> {
        const completedTasks = new Set<string>();
        const taskMap = new Map(tasks.map(t => [t.id, t]));
        let remainingTasks = [...tasks];

        while (remainingTasks.length > 0) {
            // 1. Identify all tasks ready to execute (dependencies met)
            const executableTasks = remainingTasks.filter(task => {
                const depsMet = task.dependencies.every(d => completedTasks.has(d));
                return depsMet;
            });

            if (executableTasks.length === 0) {
                const pendingIds = remainingTasks.map(t => t.id).join(', ');
                throw new Error(`Deadlock detected or invalid dependencies. Pending tasks: ${pendingIds}`);
            }

            console.log(`[AgentOrchestrator] Executing batch of ${executableTasks.length} parallel tasks...`);

            // 2. Execute parallel batch
            const batchPromises = executableTasks.map(async (task) => {
                console.log(`[AgentOrchestrator] Starting Task: ${task.description} (${task.assignedAgent})`);
                try {
                    await this.executeSingleTask(task, originalQuery);
                    return { taskId: task.id, success: true };
                } catch (error) {
                    // Attempt recovery inside the parallel execution wrapper
                    console.warn(`[AgentOrchestrator] Task failed: ${task.description}. Attempting recovery...`);
                    try {
                        const recovered = await this.attemptRecovery(task, error as Error, originalQuery);
                        if (recovered) {
                            return { taskId: task.id, success: true };
                        }
                    } catch (recError) {
                        // Recovery failed
                        console.error(`[AgentOrchestrator] Recovery failed for task ${task.id}:`, recError);
                    }
                    return { taskId: task.id, success: false, error };
                }
            });

            const results = await Promise.all(batchPromises);

            // 3. Process results
            const failedResults = results.filter(r => !r.success);
            if (failedResults.length > 0) {
                const errors = failedResults.map(r => r.error).join('; ');
                throw new Error(`Batch execution failed. Errors: ${errors}`);
            }

            // 4. Update state
            results.forEach(r => completedTasks.add(r.taskId));
            remainingTasks = remainingTasks.filter(t => !completedTasks.has(t.id));
        }
    }

    private async executeSingleTask(task: TaskNode, contextQuery: string): Promise<void> {
        const agentName = task.assignedAgent || 'Executor'; 
        
        if (agentName === 'CodeGenerator') {
            const singleTaskPlan: TaskPlannerResult = {
                taskGraph: [task],
                executionOrder: [task.id],
                validationCommands: [],
                criticalPath: []
            };
            await this.codeGenerator.execute({
                taskPlan: singleTaskPlan,
                codePlan: { 
                    fileStructure: [], 
                    interfaces: [],
                    dependencies: [],
                    devDependencies: [],
                    configFiles: [],
                    folderPurposes: []
                }, 
                context: { knowledge: [{ summary: contextQuery, relevance: 1 }] }
            });
            
        } else if (agentName === 'Executor') {
             const commandToRun = task.command || (task.type === 'command' ? task.description : null);
             if (commandToRun) {
                 await this.executorAgent.execute({
                     command: commandToRun,
                     cwd: this.workspaceRoot
                 });
             } else if (task.validationCommand) {
                  await this.executorAgent.execute({
                     command: task.validationCommand,
                     cwd: this.workspaceRoot
                  });
             } else {
                 throw new Error(`Task ${task.id} (Executor) has no command or validationCommand to run.`);
             }
        } else if (agentName === 'CodeModifier') {
             // Redirect CodeModifier tasks to CodeGenerator unless specific modification blocks are provided.
             // CodeGenerator uses LLM to implement high-level modification descriptions.
             console.log(`[AgentOrchestrator] Redirecting CodeModifier task '${task.description}' to CodeGenerator for LLM-based implementation.`);
             const singleTaskPlan: TaskPlannerResult = {
                taskGraph: [task],
                executionOrder: [task.id],
                validationCommands: [],
                criticalPath: []
            };
             await this.codeGenerator.execute({
                 taskPlan: singleTaskPlan,
                 codePlan: { 
                    fileStructure: [], 
                    interfaces: [],
                    dependencies: [],
                    devDependencies: [],
                    configFiles: [],
                    folderPurposes: []
                },
                 context: { knowledge: [{ summary: contextQuery, relevance: 1 }] }
             });
        } else if (agentName === 'QualityAssurance') {
            console.log(`[AgentOrchestrator] Running Quality Assurance for task: ${task.id}`);
            const qaInput: QAInput = {
                originalRequirements: contextQuery,
                implementedFiles: task.filePath ? [task.filePath] : []
            };
            const qaResult = await this.qualityAssurance.execute(qaInput);
            if (qaResult.status === 'failed' || (qaResult.payload && !qaResult.payload.passed)) {
                const issues = qaResult.payload?.issues?.map(i => `${i.severity}: ${i.description}`).join('; ') || 'No specific issues reported';
                throw new Error(`QA Validation Failed: ${issues}`);
            }
        } else if (agentName === 'DocWriter') {
            console.log(`[AgentOrchestrator] Running DocWriter for task: ${task.id}`);
            const docInput: DocWriterInput = {
                type: task.description.toLowerCase().includes('readme') ? 'readme' : 'inline_comments',
                content: contextQuery,
                filePath: task.filePath
            };
            const docResult = await this.docWriter.execute(docInput);
            
            if (docResult.status === 'success' && docResult.payload.documentation) {
                const targetPath = task.filePath ? path.resolve(this.workspaceRoot, task.filePath) : null;
                
                if (targetPath) {
                    // Handle standalone documentation files
                    if (['readme', 'changelog', 'api_reference', 'decision_record'].includes(docInput.type)) {
                        try {
                            fs.writeFileSync(targetPath, docResult.payload.documentation, 'utf8');
                            console.log(`[AgentOrchestrator] Wrote documentation to ${targetPath}`);
                        } catch (err: any) {
                             throw new Error(`Failed to write documentation to ${targetPath}: ${err.message}`);
                        }
                    } 
                    // Handle inline insertion if location provided
                    else if (docResult.payload.insertLocation && fs.existsSync(targetPath)) {
                        try {
                            const fileContent = fs.readFileSync(targetPath, 'utf8');
                            const lines = fileContent.split('\n');
                            const insertLine = docResult.payload.insertLocation.line - 1; // 1-based to 0-based
                            
                            if (insertLine >= 0 && insertLine <= lines.length) {
                                lines.splice(insertLine, 0, docResult.payload.documentation);
                                fs.writeFileSync(targetPath, lines.join('\n'), 'utf8');
                                console.log(`[AgentOrchestrator] Inserted documentation into ${targetPath} at line ${insertLine + 1}`);
                            }
                        } catch (err: any) {
                            console.warn(`[AgentOrchestrator] Failed to insert inline docs: ${err.message}`);
                        }
                    }
                }
            }
        } else {
            console.warn(`[AgentOrchestrator] Unknown agent: ${agentName}. Attempting execution via Executor as fallback.`);
            // Fallback to Executor if command is present
            const commandToRun = task.command || (task.type === 'command' ? task.description : null);
             if (commandToRun) {
                 await this.executorAgent.execute({
                     command: commandToRun,
                     cwd: this.workspaceRoot
                 });
             } else {
                 throw new Error(`Task ${task.id} assigned to unknown agent '${agentName}' and has no executable command.`);
             }
        }

        // VERIFY
        if (task.validationCommand) {
            console.log(`[AgentOrchestrator] Verifying task with: ${task.validationCommand}`);
            const validation = await this.executorAgent.execute({
                command: task.validationCommand,
                cwd: this.workspaceRoot
            });
            
            if (validation.status === 'failed' || (validation.payload && validation.payload.exitCode !== 0)) {
                throw new Error(`Validation failed for task ${task.id}: ${validation.payload?.stderr || 'Unknown error'}`);
            }
        }
    }

    private async attemptRecovery(failedTask: TaskNode, error: Error, contextQuery: string): Promise<boolean> {
        console.log(`[AgentOrchestrator] Analyzing failure for task: ${failedTask.id}`);
        
        // Try to read the file if it exists to see current state
        let fileContext = '';
        if (failedTask.filePath) {
             const targetPath = path.resolve(this.workspaceRoot, failedTask.filePath);
             if (fs.existsSync(targetPath)) {
                try {
                    const content = fs.readFileSync(targetPath, 'utf8');
                    // Truncate if too long
                    const truncated = content.length > 2000 ? content.substring(0, 2000) + '... (truncated)' : content;
                    fileContext = `\nCurrent content of ${failedTask.filePath}:\n\`\`\`\n${truncated}\n\`\`\`\n`;
                } catch (e) {
                    console.warn(`[AgentOrchestrator] Failed to read file for recovery context: ${e}`);
                }
             }
        }

        const recoveryQuery = `Task '${failedTask.description}' failed with error: ${error.message}.
Context: ${contextQuery}
${fileContext}
Analyze the error and generate a recovery plan.`;

        console.log(`[AgentOrchestrator] Generating recovery plan for: ${failedTask.id}`);

        const recoveryPlan = await this.taskPlanner.execute({
            query: recoveryQuery,
            projectType: 'recovery',
            fileStructure: [],
            activeFilePath: failedTask.filePath,
            interfaces: []
        });

        if (recoveryPlan.status === 'success' && recoveryPlan.payload && recoveryPlan.payload.taskGraph.length > 0) {
            try {
                await this.executeTaskGraph(recoveryPlan.payload.taskGraph, contextQuery);
                return true;
            } catch (e) {
                console.error('Recovery failed:', e);
                return false;
            }
        }
        return false;
    }

    // =========================================================================
    // Compatibility Layer for ChatViewProvider (Legacy Support)
    // =========================================================================

    public setAgentMode(mode: 'plan' | 'build') {
        this.currentAgentMode = mode;
    }

    public async clearAllData() {
        this.currentContext = { message: '' };
        await this.versionController.execute({ action: 'delete_session_checkpoints', sessionId: 'current' });
    }

    public setContextFromMessage(message: string, filePath?: string) {
        this.currentContext = { message, filePath };
    }

    public detectPersona(message: string, intent: string): PersonaType {
        return this.personaManager.detectPersona(message, intent);
    }

    /**
     * Parses the raw text response from the LLM to extract XML actions.
     * Used by ChatViewProvider to enable conversational actions.
     */
    public parseAIResponse(response: string, persona: PersonaType): AgenticAction[] {
        const actions: AgenticAction[] = [];
        
        // Improved regex to be more robust with attributes
        // Matches <byte_action attributes...>content</byte_action>
        const tagRegex = /<byte_action\s+([^>]+)>([\s\S]*?)<\/byte_action>/g;
        
        let match;
        while ((match = tagRegex.exec(response)) !== null) {
            const [_, attributesStr, content] = match;
            
            // Extract attributes using a more robust regex that handles both single and double quotes
            const getAttribute = (name: string): string | null => {
                const regex = new RegExp(`${name}=["']([^"']+)["']`);
                const match = attributesStr.match(regex);
                return match ? match[1] : null;
            };
            
            const type = getAttribute('type');
            const pathAttr = getAttribute('path');
            const commandAttr = getAttribute('command');
            
            if (type) {
                // Clean up content (remove leading/trailing whitespace/newlines)
                let cleanContent = content ? content.trim() : '';
                
                // Remove CDATA if present
                if (cleanContent.startsWith('<![CDATA[') && cleanContent.endsWith(']]>')) {
                    cleanContent = cleanContent.substring(9, cleanContent.length - 3);
                }

                actions.push({
                    type: type as any,
                    path: pathAttr || undefined,
                    command: commandAttr || undefined,
                    content: cleanContent,
                    description: `${type} ${pathAttr || commandAttr || ''}`
                });
            }
        }
        
        return actions;
    }

    /**
     * Executes a list of actions extracted from the chat response.
     * Used by ChatViewProvider.
     */
    public async executeInstructions(
        actions: AgenticAction[], 
        onProgress: (msg: string) => void
    ): Promise<AgenticResult> {
        
        // 1. Check permissions (read-only mode)
        if (this.currentAgentMode === 'plan') {
            return { 
                success: false, 
                actions: [], 
                summary: 'Agent is in Plan Mode (Read-Only). Switch to Build Mode to execute actions.' 
            };
        }

        // 2. Create checkpoint
        const cpResult = await this.versionController.execute({ 
            action: 'create_checkpoint', 
            files: actions.map(a => a.path).filter(p => !!p) as string[],
            description: "Before Agent Execution" 
        });
        const checkpointId = cpResult.payload?.checkpoint?.checkpointId;
        
        const executedActions: AgenticAction[] = [];
        let successCount = 0;

        for (const action of actions) {
            onProgress(`Executing: ${action.description}`);
            
            try {
                let resultMsg = '';
                let success = false;

                switch (action.type) {
                    case 'create_file':
                    case 'modify_file':
                        if (action.path && action.content) {
                            const uri = vscode.Uri.file(path.isAbsolute(action.path) ? action.path : path.join(this.workspaceRoot, action.path));
                            // Ensure directory exists
                            await vscode.workspace.fs.createDirectory(vscode.Uri.parse(path.dirname(uri.fsPath)));
                            await vscode.workspace.fs.writeFile(uri, Buffer.from(action.content));
                            resultMsg = `Successfully wrote to ${action.path}`;
                            success = true;
                        } else {
                            resultMsg = 'Missing path or content';
                        }
                        break;
                    
                    case 'create_folder':
                    case 'create_directory':
                        if (action.path) {
                             const uri = vscode.Uri.file(path.isAbsolute(action.path) ? action.path : path.join(this.workspaceRoot, action.path));
                             await vscode.workspace.fs.createDirectory(uri);
                             resultMsg = `Created directory ${action.path}`;
                             success = true;
                        }
                        break;

                    case 'delete_file':
                        if (action.path) {
                             const uri = vscode.Uri.file(path.isAbsolute(action.path) ? action.path : path.join(this.workspaceRoot, action.path));
                             await vscode.workspace.fs.delete(uri);
                             resultMsg = `Deleted ${action.path}`;
                             success = true;
                        }
                        break;

                    case 'run_command':
                        const cmd = action.command || action.content;
                        if (cmd) {
                            const result = await this.executorAgent.execute({
                                command: cmd,
                                cwd: this.workspaceRoot
                            });
                            
                            if (result.status === 'success') {
                                resultMsg = `Command output: ${result.payload?.stdout?.slice(0, 100)}...`;
                                success = true;
                            } else {
                                resultMsg = `Command failed: ${result.payload?.stderr}`;
                            }
                        }
                        break;
                        
                    case 'partial_edit':
                        if (action.path && action.content) {
                            // Parse <search> and <replace> from the content
                            // Content is expected to be:
                            // <search>...</search>
                            // <replace>...</replace>
                            // Improved regex to allow optional whitespace around content
                            const searchMatch = /<search>\s*([\s\S]*?)\s*<\/search>/.exec(action.content);
                            const replaceMatch = /<replace>\s*([\s\S]*?)\s*<\/replace>/.exec(action.content);
                            
                            if (searchMatch) {
                                const searchBlock = searchMatch[1]; 
                                const replaceBlock = replaceMatch ? replaceMatch[1] : '';
                                
                                // Delegate to CodeModifierAgent for robust fuzzy matching and application
                                const modification = {
                                    filePath: path.isAbsolute(action.path) ? action.path : path.join(this.workspaceRoot, action.path),
                                    searchBlock: searchBlock,
                                    replaceBlock: replaceBlock,
                                    action: 'replace' as const, // Default to replace
                                    startLine: -1, // Let CodeModifier find it
                                    endLine: -1
                                };
                                
                                console.log(`[AgentOrchestrator] Applying partial edit to ${action.path}`);
                                const modResult = await this.codeModifier.execute({
                                    modifications: [modification],
                                    dryRun: false,
                                    createCheckpoint: false // We already created a checkpoint at the start of executeInstructions
                                });
                                
                                if (modResult.status === 'success' && modResult.payload?.results[0]?.success) {
                                    resultMsg = `Successfully edited ${action.path}`;
                                    success = true;
                                } else {
                                    const err = modResult.payload?.results[0]?.error || modResult.error?.message || 'Unknown error';
                                    resultMsg = `Edit failed: ${err}`;
                                }
                            } else {
                                resultMsg = 'Missing <search> block in partial_edit content. Format: <search>...</search><replace>...</replace>';
                            }
                        } else {
                             resultMsg = 'Missing path or content for partial_edit';
                        }
                        break;
                }

                executedActions.push({
                    ...action,
                    result: resultMsg,
                    success
                });

                if (success) {successCount++;}

            } catch (error: any) {
                console.error(`Action failed: ${action.type}`, error);
                executedActions.push({
                    ...action,
                    result: `Error: ${error.message}`,
                    success: false
                });
            }
        }

        return {
            success: successCount === actions.length,
            actions: executedActions,
            summary: `Executed ${successCount}/${actions.length} actions.`,
            checkpointId
        };
    }

    // Helpers
    private async getFileStructure(): Promise<string[]> {
        if (!this.workspaceRoot) {return [];}
        try {
            // Simple recursive read or top-level
            const files = await fs.promises.readdir(this.workspaceRoot);
            return files;
        } catch {
            return [];
        }
    }

    private async detectProjectType(): Promise<string> {
        const files = await this.getFileStructure();
        if (files.includes('package.json')) {return 'node';}
        if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {return 'python';}
        if (files.includes('Cargo.toml')) {return 'rust';}
        if (files.includes('go.mod')) {return 'go';}
        return 'generic';
    }

    public getLastReferencedFile(): string | null {
        return this.currentContext.filePath || null;
    }
}
/**
 * AgentOrchestrator - Executes agentic tasks with real file/command operations
 * This is the bridge between AI responses and actual code changes
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ManagerAgent } from './ManagerAgent';
import { ManagerDecision, AgentOutput } from './AgentTypes';
import { ExecutorAgent, ExecutorOutput } from '../agents/ExecutorAgent';
import { VersionControllerAgent } from '../agents/VersionControllerAgent';
import { CodeModifierAgent, CodeModifierResult } from '../agents/CodeModifierAgent';
import { CommandGeneratorAgent, CommandGeneratorResult } from '../agents/CommandGeneratorAgent';
import { ContextSearchAgent } from '../agents/ContextSearchAgent';
import { ProcessPlannerAgent, ProcessPlannerResult } from '../agents/ProcessPlannerAgent';
import { CodePlannerAgent, CodePlannerResult } from '../agents/CodePlannerAgent';
import { TaskPlannerAgent, TaskPlannerResult } from '../agents/TaskPlannerAgent';

export interface AgenticAction {
    type: 'create_file' | 'modify_file' | 'run_command' | 'create_directory' | 'delete_file';
    path?: string;
    content?: string;
    command?: string;
    description: string;
}

export interface AgenticResult {
    success: boolean;
    actions: { action: AgenticAction; result: string; success: boolean }[];
    summary: string;
    checkpointId?: string;
}

export interface ParsedInstruction {
    type: 'create_file' | 'create_folder' | 'run_command' | 'modify_file' | 'explanation';
    path?: string;
    content?: string;
    command?: string;
    language?: string;
}

export class AgentOrchestrator {
    private managerAgent: ManagerAgent;
    private executorAgent: ExecutorAgent;
    private versionController: VersionControllerAgent;
    private codeModifier: CodeModifierAgent;
    private commandGenerator: CommandGeneratorAgent;
    private contextSearch: ContextSearchAgent;
    private processPlanner: ProcessPlannerAgent;
    private codePlanner: CodePlannerAgent;
    private taskPlanner: TaskPlannerAgent;
    private workspaceRoot: string;

    constructor(private context: vscode.ExtensionContext) {
        this.managerAgent = new ManagerAgent();
        this.executorAgent = new ExecutorAgent();
        this.versionController = new VersionControllerAgent(context);
        this.codeModifier = new CodeModifierAgent();
        this.commandGenerator = new CommandGeneratorAgent();
        this.contextSearch = new ContextSearchAgent(context);
        this.processPlanner = new ProcessPlannerAgent();
        this.codePlanner = new CodePlannerAgent();
        this.taskPlanner = new TaskPlannerAgent();
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    /**
     * Analyze a user query and determine what actions to take
     */
    async analyzeIntent(query: string): Promise<AgentOutput<ManagerDecision>> {
        return this.managerAgent.execute({
            query,
            hasImage: false,
            hasSelection: false
        });
    }

    /**
     * Parse AI response for executable instructions
     * This catches many different ways the AI might describe file creation
     */
    parseAIResponse(response: string): ParsedInstruction[] {
        const instructions: ParsedInstruction[] = [];
        const addedPaths = new Set<string>();

        // Extract all code blocks first
        const codeBlocks: { language: string; content: string; index: number }[] = [];
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        let match;
        while ((match = codeBlockRegex.exec(response)) !== null) {
            codeBlocks.push({
                language: match[1] || 'text',
                content: match[2].trim(),
                index: match.index
            });
        }

        // Pattern 1: File mentioned before code block
        // Matches: "created `filename.py`" or "file named filename.py" or "file: filename.py"
        const fileNameMentionRegex = /(?:creat(?:e|ed|ing)|file\s*(?:named?|called)?|named?|called)\s*[:\s]*[`"']?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[`"']?/gi;

        while ((match = fileNameMentionRegex.exec(response)) !== null) {
            const fileName = match[1].trim();
            if (addedPaths.has(fileName)) continue;

            // Find the code block that comes after this mention
            const mentionEnd = match.index + match[0].length;
            const nextBlock = codeBlocks.find(b => b.index > mentionEnd - 200);

            if (nextBlock && nextBlock.content) {
                instructions.push({
                    type: 'create_file',
                    path: fileName,
                    language: nextBlock.language || this.getLanguageFromExtension(fileName),
                    content: nextBlock.content
                });
                addedPaths.add(fileName);
            }
        }

        // Pattern 2: Code block starts with filename comment
        // Matches: # filename.py or // filename.js at the start of code block
        for (const block of codeBlocks) {
            const firstLine = block.content.split('\n')[0];
            const fileCommentMatch = firstLine.match(/^(?:#|\/\/|\/\*)\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/);

            if (fileCommentMatch) {
                const fileName = fileCommentMatch[1];
                if (!addedPaths.has(fileName)) {
                    instructions.push({
                        type: 'create_file',
                        path: fileName,
                        language: block.language || this.getLanguageFromExtension(fileName),
                        content: block.content
                    });
                    addedPaths.add(fileName);
                }
            }
        }

        // Pattern 3: Explicit "Create file X:" or "File: X" followed by code block
        const explicitFileRegex = /(?:create\s+(?:a\s+)?file|file)\s*[:\s]+[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[`"]?\s*(?:with|containing|:)?\s*```(\w*)\n([\s\S]*?)```/gi;
        while ((match = explicitFileRegex.exec(response)) !== null) {
            const fileName = match[1].trim();
            if (!addedPaths.has(fileName)) {
                instructions.push({
                    type: 'create_file',
                    path: fileName,
                    language: match[2] || this.getLanguageFromExtension(fileName),
                    content: match[3].trim()
                });
                addedPaths.add(fileName);
            }
        }

        // Pattern 4: "Here is the code" with filename in preceding context
        const hereIsCodeRegex = /(?:here\s+is|here's|content\s+of)\s+(?:the\s+)?(?:code|file)?[:\s]*[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)?[`"]?[:\s]*\n*```(\w*)\n([\s\S]*?)```/gi;
        while ((match = hereIsCodeRegex.exec(response)) !== null) {
            if (match[1]) {
                const fileName = match[1].trim();
                if (!addedPaths.has(fileName)) {
                    instructions.push({
                        type: 'create_file',
                        path: fileName,
                        language: match[2] || this.getLanguageFromExtension(fileName),
                        content: match[3].trim()
                    });
                    addedPaths.add(fileName);
                }
            }
        }

        // Pattern 5: Create folder/directory
        const folderRegex = /(?:create|make|add)\s+(?:a\s+)?(?:folder|directory)\s+[`"']?([a-zA-Z0-9_\-./]+)[`"']?/gi;
        while ((match = folderRegex.exec(response)) !== null) {
            instructions.push({
                type: 'create_folder',
                path: match[1].trim()
            });
        }

        // Pattern 6: Run commands in bash/shell blocks
        const bashBlockRegex = /```(?:bash|shell|sh|cmd|terminal)\n([\s\S]*?)```/gi;
        while ((match = bashBlockRegex.exec(response)) !== null) {
            const commands = match[1].trim().split('\n').filter(c => c.trim() && !c.startsWith('#'));
            for (const cmd of commands) {
                if (!instructions.some(i => i.command === cmd.trim())) {
                    instructions.push({
                        type: 'run_command',
                        command: cmd.trim()
                    });
                }
            }
        }

        // Pattern 7: npm/npx/yarn commands anywhere
        const npmRegex = /(?:^|\n)\s*(?:\$\s*)?((?:npm|npx|yarn|pnpm|pip|python|node)\s+[^\n]+)/gm;
        while ((match = npmRegex.exec(response)) !== null) {
            const cmd = match[1].trim();
            if (!instructions.some(i => i.command === cmd)) {
                instructions.push({
                    type: 'run_command',
                    command: cmd
                });
            }
        }

        console.log('[AgentOrchestrator] Parsed instructions:', instructions.length, instructions.map(i => ({ type: i.type, path: i.path, cmd: i.command })));

        return instructions;
    }

    /**
     * Get language from file extension
     */
    private getLanguageFromExtension(fileName: string): string {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const langMap: Record<string, string> = {
            'py': 'python',
            'js': 'javascript',
            'ts': 'typescript',
            'jsx': 'jsx',
            'tsx': 'tsx',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'md': 'markdown',
            'sh': 'bash',
            'yml': 'yaml',
            'yaml': 'yaml'
        };
        return langMap[ext] || ext;
    }


    /**
     * Execute parsed instructions with real file/command operations
     */
    async executeInstructions(
        instructions: ParsedInstruction[],
        onProgress: (msg: string) => void
    ): Promise<AgenticResult> {
        const results: { action: AgenticAction; result: string; success: boolean }[] = [];
        let checkpointId: string | undefined;

        // Create checkpoint before making changes
        if (instructions.some(i => i.type === 'create_file' || i.type === 'modify_file')) {
            onProgress('📸 Creating checkpoint before changes...');
            const checkpointResult = await this.versionController.execute({
                action: 'create_checkpoint',
                description: `Auto-checkpoint before ${instructions.length} operations`
            });
            if (checkpointResult.status === 'success') {
                checkpointId = checkpointResult.payload.checkpoint?.checkpointId;
            }
        }

        for (const instruction of instructions) {
            try {
                switch (instruction.type) {
                    case 'create_file': {
                        const filePath = this.resolvePath(instruction.path!);
                        onProgress(`📝 Creating file: ${instruction.path}`);

                        // Ensure directory exists
                        const dir = path.dirname(filePath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }

                        // Write file
                        fs.writeFileSync(filePath, instruction.content || '');

                        // Open the file in VS Code
                        const doc = await vscode.workspace.openTextDocument(filePath);
                        await vscode.window.showTextDocument(doc, { preview: false });

                        results.push({
                            action: {
                                type: 'create_file',
                                path: instruction.path,
                                content: instruction.content,
                                description: `Created ${instruction.path}`
                            },
                            result: `✅ Created ${instruction.path}`,
                            success: true
                        });
                        break;
                    }

                    case 'create_folder': {
                        const folderPath = this.resolvePath(instruction.path!);
                        onProgress(`📁 Creating folder: ${instruction.path}`);

                        if (!fs.existsSync(folderPath)) {
                            fs.mkdirSync(folderPath, { recursive: true });
                        }

                        results.push({
                            action: {
                                type: 'create_directory',
                                path: instruction.path,
                                description: `Created directory ${instruction.path}`
                            },
                            result: `✅ Created directory ${instruction.path}`,
                            success: true
                        });
                        break;
                    }

                    case 'run_command': {
                        const command = instruction.command!;

                        // Safety check - skip dangerous commands
                        if (this.isDangerousCommand(command)) {
                            onProgress(`⚠️ Skipping potentially dangerous command: ${command}`);
                            results.push({
                                action: {
                                    type: 'run_command',
                                    command,
                                    description: `Skipped dangerous command`
                                },
                                result: `⚠️ Command requires manual execution: ${command}`,
                                success: false
                            });
                            continue;
                        }

                        onProgress(`🔧 Running: ${command}`);

                        const execResult = await this.executorAgent.execute({
                            command,
                            cwd: this.workspaceRoot,
                            timeout: 60000,
                            parseErrors: true
                        });

                        const success = execResult.payload.success;
                        results.push({
                            action: {
                                type: 'run_command',
                                command,
                                description: `Executed: ${command}`
                            },
                            result: success
                                ? `✅ ${command}\n${execResult.payload.stdout.slice(0, 200)}`
                                : `❌ ${command}\n${execResult.payload.stderr.slice(0, 200)}`,
                            success
                        });
                        break;
                    }
                }
            } catch (error) {
                const errorMsg = (error as Error).message;
                onProgress(`❌ Error: ${errorMsg}`);
                results.push({
                    action: {
                        type: instruction.type as any,
                        path: instruction.path,
                        command: instruction.command,
                        description: `Failed: ${errorMsg}`
                    },
                    result: `❌ Error: ${errorMsg}`,
                    success: false
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;

        return {
            success: successCount === totalCount,
            actions: results,
            summary: `Completed ${successCount}/${totalCount} operations`,
            checkpointId
        };
    }

    /**
     * Create a project structure from a plan
     */
    async createProjectFromPlan(
        query: string,
        onProgress: (msg: string) => void
    ): Promise<{ plan: ProcessPlannerResult; structure: CodePlannerResult }> {
        onProgress('🏗️ Planning project structure...');

        const processResult = await this.processPlanner.execute({
            query,
            projectType: this.detectProjectType(query)
        });

        const codeResult = await this.codePlanner.execute({
            query,
            projectType: processResult.payload.techStack ? 'fullstack' : 'web',
            techStack: processResult.payload.techStack
        });

        return {
            plan: processResult.payload,
            structure: codeResult.payload
        };
    }

    /**
     * Execute a full project build
     */
    async buildProject(
        plan: CodePlannerResult,
        onProgress: (msg: string) => void
    ): Promise<AgenticResult> {
        const instructions: ParsedInstruction[] = [];

        // Create folders
        for (const file of plan.fileStructure) {
            if (file.endsWith('/')) {
                instructions.push({ type: 'create_folder', path: file.slice(0, -1) });
            }
        }

        // Create config files
        for (const config of plan.configFiles) {
            instructions.push({
                type: 'create_file',
                path: config.name,
                content: this.generateConfigContent(config.name, plan)
            });
        }

        return this.executeInstructions(instructions, onProgress);
    }

    /**
     * Rollback to a checkpoint
     */
    async rollback(checkpointId?: string): Promise<boolean> {
        const result = await this.versionController.execute({
            action: 'rollback',
            checkpointId
        });
        return result.status === 'success';
    }

    /**
     * Add context for future queries
     */
    addContext(key: string, value: any): void {
        this.contextSearch.setSessionContext(key, value);
    }

    /**
     * Store conversation turn
     */
    addConversationTurn(role: 'user' | 'assistant', content: string): void {
        this.contextSearch.addConversationTurn(role, content);
    }

    /**
     * Get conversation summary
     */
    getConversationSummary(): string {
        return this.contextSearch.getConversationSummary();
    }

    // ===== HELPER METHODS =====

    private resolvePath(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.join(this.workspaceRoot, filePath);
    }

    private isDangerousCommand(command: string): boolean {
        const dangerous = [
            /rm\s+-rf/i,
            /del\s+\/s/i,
            /rmdir\s+\/s/i,
            /format\s+/i,
            /sudo\s+rm/i,
            />\s*\/dev\//i,
            /drop\s+database/i
        ];
        return dangerous.some(p => p.test(command));
    }

    private detectProjectType(query: string): string {
        const lower = query.toLowerCase();
        if (lower.includes('api') || lower.includes('backend')) return 'api';
        if (lower.includes('fullstack') || lower.includes('full stack')) return 'fullstack';
        if (lower.includes('ecommerce') || lower.includes('e-commerce')) return 'fullstack';
        return 'web';
    }

    private generateConfigContent(filename: string, plan: CodePlannerResult): string {
        switch (filename) {
            case 'package.json':
                return JSON.stringify({
                    name: 'my-project',
                    version: '1.0.0',
                    scripts: {
                        dev: 'vite',
                        build: 'vite build',
                        start: 'node dist/index.js',
                        test: 'jest'
                    },
                    dependencies: Object.fromEntries(
                        plan.dependencies.map(d => [d, 'latest'])
                    ),
                    devDependencies: Object.fromEntries(
                        plan.devDependencies.map(d => [d, 'latest'])
                    )
                }, null, 2);

            case 'tsconfig.json':
                return JSON.stringify({
                    compilerOptions: {
                        target: 'ES2020',
                        module: 'ESNext',
                        moduleResolution: 'bundler',
                        strict: true,
                        jsx: 'react-jsx',
                        esModuleInterop: true,
                        skipLibCheck: true,
                        outDir: 'dist'
                    },
                    include: ['src']
                }, null, 2);

            case '.gitignore':
                return `node_modules/
dist/
.env
.env.local
*.log
.DS_Store
`;

            case '.env.example':
                return `DATABASE_URL=
API_KEY=
SECRET_KEY=
`;

            default:
                return `// ${filename}\n`;
        }
    }
}

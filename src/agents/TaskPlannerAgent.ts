/**
 * TaskPlannerAgent - Executable task generator
 * Creates dependency graphs and validation commands for implementation
 */

import { BaseAgent, AgentOutput, TaskNode } from '../core/AgentTypes';
import { ByteAIClient } from '../byteAIClient';

export interface TaskPlannerInput {
    query: string;
    projectType: string;
    fileStructure: string[];
    interfaces: string[];
    apiEndpoints?: { method: string; path: string; description: string }[];
    activeFilePath?: string;
}

export interface TaskPlannerResult {
    taskGraph: TaskNode[];
    executionOrder: string[];
    validationCommands: { task: string; command: string }[];
    criticalPath: string[];
}

export class TaskPlannerAgent extends BaseAgent<TaskPlannerInput, TaskPlannerResult> {
    private taskIdCounter = 0;
    private client: ByteAIClient;

    constructor() {
        super({ name: 'TaskPlanner', timeout: 10000 });
        this.client = new ByteAIClient();
    }

    async execute(input: TaskPlannerInput): Promise<AgentOutput<TaskPlannerResult>> {
        const startTime = Date.now();
        this.taskIdCounter = 0;

        try {
            // Generate task graph
            const taskGraph = await this.generateTaskGraph(input);

            // Calculate execution order (topological sort)
            const executionOrder = this.topologicalSort(taskGraph);

            // Generate validation commands
            const validationCommands = this.generateValidationCommands(taskGraph, input.projectType);

            // Identify critical path
            const criticalPath = this.identifyCriticalPath(taskGraph, executionOrder);

            const result: TaskPlannerResult = {
                taskGraph,
                executionOrder,
                validationCommands,
                criticalPath
            };

            return this.createOutput('success', result, 0.85, startTime, {
                reasoning: `Generated ${taskGraph.length} tasks with ${criticalPath.length} on critical path`
            });

        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Detect the type of task based on input analysis
     */
    private detectTaskType(input: TaskPlannerInput): 'script_execution' | 'scaffold' | 'stress_test' | 'command_sequence' | 'simple_modification' | 'complex_modification' | 'generic' {
        const query = input.query.toLowerCase();
        
        // 1. Explicit project type override
        if (input.projectType === 'script') return 'script_execution';
        
        // 2. Check for Stress Test / Max Time / Loop intent
        if (query.includes('max time') || query.includes('stress test') || query.includes('load test') || query.includes('run for')) {
            return 'stress_test';
        }

        // 3. Check for Complex Modification (multi-step, architectural, or ambiguous)
        const complexKeywords = ['refactor', 'rewrite', 'optimize', 'structure', 'architecture', 'pattern', 'implement feature'];
        const multiStepKeywords = [' and ', ' then ', ' also ', ',', ';'];
        
        const isComplex = complexKeywords.some(k => query.includes(k));
        const isMultiStep = multiStepKeywords.filter(k => query.includes(k)).length >= 1;
        
        if (isComplex || (isMultiStep && query.length > 30)) {
            return 'complex_modification';
        }

        // 4. Check for Simple Modification (create/edit/delete specific lines or files)
        // Heuristic: specific line numbers, "remove line", "edit line", "create file" with content
        const hasLineNumbers = /\b(line|lines)\s+\d+/.test(query);
        const hasImplicitLineAction = /(remove|delete|edit|change)\s+\d+/.test(query);
        const hasSimpleAction = /(create|make|remove|delete|edit|change|update)\s+(file|line)/.test(query);
        const isShort = query.split(' ').length < 30; // Increased threshold slightly
        
        if (isShort && (hasLineNumbers || hasImplicitLineAction || hasSimpleAction) && !query.includes('project') && !query.includes('app')) {
            return 'simple_modification';
        }

        // 5. Check for Multi-Step Command Sequence OR Single Shell Command
        // Keywords indicating sequence or specific terminal operations
        const sequenceKeywords = ['then', 'after', 'and', 'clone', 'commit', 'push', 'pull', 'install', 'curl', 'wget', 'git'];
        const commonBinaries = ['ls', 'pwd', 'cp', 'mv', 'rm', 'mkdir', 'cat', 'echo', 'touch', 'grep', 'find', 'sed', 'awk', 'tar', 'zip', 'unzip', 'ps', 'kill', 'top', 'htop', 'df', 'du', 'npx', 'npm', 'yarn', 'pnpm', 'node', 'python', 'pip'];

        const hasSequence = sequenceKeywords.some(k => query.includes(' ' + k + ' ')) || query.includes(' && ') || query.includes(';');
        const isGitOperation = query.startsWith('git') || query.includes('clone repo') || query.includes('commit code');
        const isShellCommand = commonBinaries.some(bin => query.startsWith(bin + ' ') || query === bin);
        
        if (hasSequence || isGitOperation || isShellCommand) {
            return 'command_sequence';
        }

        // 4. Analyze for execution intent
        // Look for action verbs combined with context
        const executionVerbs = ['run', 'execute', 'calculate', 'compute', 'evaluate', 'start', 'launch', 'test'];
        const hasExecutionVerb = executionVerbs.some(v => query.includes(v));
        
        // Look for script/code indicators
        const codeIndicators = ['script', 'code', 'function', 'snippet', 'file', 'program', 'python', 'js', 'ts', 'node', 'bash', 'shell', 'ruby', 'go', 'rust'];
        const hasCodeIndicator = codeIndicators.some(i => query.includes(i));

        // Look for math expressions (e.g., 2+2, 5*10, etc.)
        const hasMathExpression = /[\d]+\s*[\+\-\*\/]\s*[\d]+/.test(query);

        // If user says "run this" or "calculate result", it's an execution task
        if (hasExecutionVerb || (hasCodeIndicator && query.length < 50) || hasMathExpression) { 
            return 'script_execution';
        }

        // 4. Analyze for scaffolding intent
        // If file structure is provided and significant, it's likely scaffolding
        if (input.fileStructure && input.fileStructure.length > 2) {
            return 'scaffold';
        }
        
        // 5. Default to generic planning
        return 'generic';
    }

    /**
     * Generate tasks for stress testing / long running verification
     */
    private generateStressTestTasks(input: TaskPlannerInput): TaskNode[] {
        const tasks: TaskNode[] = [];
        const query = input.query.toLowerCase();
        
        // 1. Setup Phase
        tasks.push(this.createTask(
            'Prepare Stress Test Environment',
            'stress_test_config.json',
            [],
            undefined
        ));

        // 2. Implementation Phase - create a robust test script
        const scriptName = 'stress_test_runner.ts';
        tasks.push(this.createTask(
            'Implement Stress Test Logic (Loop/Timer)',
            scriptName,
            [tasks[0].id],
            'npx ts-node --check ' + scriptName // Syntax check
        ));

        // 3. Execution Phase
        tasks.push(this.createTask(
            'Run Stress Test (High Duration)',
            undefined,
            [tasks[1].id],
            `npx ts-node ${scriptName}`
        ));

        // 4. Analysis Phase
        tasks.push(this.createTask(
            'Analyze Test Results & Logs',
            'test_report.md',
            [tasks[2].id],
            undefined
        ));

        return tasks;
    }

    private generateSimpleModificationTasks(input: TaskPlannerInput): TaskNode[] {
        const tasks: TaskNode[] = [];
        const query = input.query;
        
        // Identify target file if possible
        let filePath = input.activeFilePath;
        // Try to extract filename from query
        const words = query.split(' ');
        for (const word of words) {
            if (word.includes('.') && word.length > 2) {
                // Potential filename
                filePath = word;
            }
        }

        tasks.push(this.createTask(
            input.query, // Use the user query directly as the task description
            filePath,
            [],
            undefined
        ));

        return tasks;
    }

    /**
     * Generate task graph from input
     */
    private async generateTaskGraph(input: TaskPlannerInput): Promise<TaskNode[]> {
        const taskType = this.detectTaskType(input);

        let initialTasks: TaskNode[] = [];

        switch (taskType) {
            case 'stress_test':
                initialTasks = this.generateStressTestTasks(input);
                break;
            case 'simple_modification':
                initialTasks = this.generateSimpleModificationTasks(input);
                break;
            case 'complex_modification':
                initialTasks = await this.generateComplexModificationTasks(input);
                break;
            case 'command_sequence':
                initialTasks = this.generateCommandSequenceTasks(input);
                break;
            case 'script_execution':
                initialTasks = this.generateScriptTasks(input);
                break;
            case 'scaffold':
                initialTasks = this.generateScaffoldTasks(input);
                break;
            case 'generic':
            default:
                initialTasks = await this.generateDynamicTasks(input);
                break;
        }

        // Apply recursive decomposition for 'complex' tasks
        return await this.recursiveDecomposition(initialTasks, input);
    }

    /**
     * Recursively decompose tasks marked as 'complex' into sub-tasks
     */
    private async recursiveDecomposition(tasks: TaskNode[], input: TaskPlannerInput, depth: number = 0): Promise<TaskNode[]> {
        if (depth > 1) return tasks; // Limit recursion depth to prevent infinite loops

        const resultTasks: TaskNode[] = [];
        let hasDecomposition = false;

        for (const task of tasks) {
            // Only decompose if marked complex AND has a description (not a simple command)
            if (task.complexity === 'complex' && task.type !== 'command' && !task.description.includes('mkdir')) {
                console.log(`Decomposing complex task: ${task.description}`);
                const subTasks = await this.decomposeTask(task, input);
                
                if (subTasks.length > 0) {
                    hasDecomposition = true;
                    // Add subtasks instead of the original task
                    resultTasks.push(...subTasks);
                } else {
                    resultTasks.push(task);
                }
            } else {
                resultTasks.push(task);
            }
        }

        // If we decomposed anything, we might need another pass (though depth limit handles this)
        // For now, let's just do one level of recursion for safety and performance
        return resultTasks;
    }

    /**
     * Decompose a single complex task into smaller steps
     */
    private async decomposeTask(parentTask: TaskNode, input: TaskPlannerInput): Promise<TaskNode[]> {
        const prompt = `
You are a Senior Technical Lead.
Parent Task: "${parentTask.description}"
Target File: "${parentTask.filePath || 'Unknown'}"
Project Context: ${input.projectType}

The parent task is too complex to be executed as a single unit. 
Decompose it into 2-5 smaller, atomic sub-tasks.

Output a JSON array of task objects.
Format:
[
  {
    "id": "subtask_${parentTask.id}_1",
    "description": "Specific sub-task action",
    "type": "code" | "command" | "test",
    "dependencies": [], // Dependencies relative to this sub-list
    "filePath": "src/path/to/file.ts",
    "validationCommand": "shell command to verify",
    "parallelGroup": "${parentTask.parallelGroup || ''}",
    "assignedAgent": "${parentTask.assignedAgent || 'CodeGenerator'}",
    "complexity": "simple" | "medium"
  }
]

Rules:
1. Sub-tasks must be concrete and actionable.
2. Maintain the intent of the parent task.
3. Inherit context (file path, agent) if applicable, but refine if needed.
4. Ensure dependencies are correct within the sub-task list.
5. Output ONLY JSON.
`;

        try {
            const response = await this.client.streamResponse(
                prompt,
                () => {},
                (err: Error) => console.warn('Decomposition LLM error:', err)
            );

            const subTasks = this.parseTaskResponse(response);
            
            // Post-process to ensure IDs and dependencies link up correctly
            // (If the parent had dependencies, the first subtask should inherit them? 
            // Or the whole group is a replacement? 
            // In a flattened graph, if Task B depended on Task A, and Task A becomes A1, A2.
            // Then A1 should have A's dependencies.
            // Task B should depend on A2 (the last one).
            // This is complex graph rewriting. 
            // For now, let's assume 'complex' tasks are usually standalone chunks or we just replace the node.)
            
            // Simple approach: 
            // 1. First subtask inherits parent's dependencies.
            // 2. Subsequent subtasks depend on previous subtask.
            // 3. (External nodes depending on Parent need to be updated to depend on Last Subtask - this is hard without graph access)
            
            // Since we are iterating the list, we don't easily update other nodes pointing to this one.
            // HOWEVER, we are replacing the task in the list.
            // We need to preserve the ID of the parent task effectively, or map it.
            // Strategy: The LAST subtask should take the ID of the parent task? 
            // Or we keep the parent ID on the last subtask so downstream deps still work.
            
            if (subTasks.length > 0) {
                // Fix dependencies
                subTasks[0].dependencies = [...(parentTask.dependencies || [])];
                
                // Chain internal dependencies
                for (let i = 1; i < subTasks.length; i++) {
                    subTasks[i].dependencies = [subTasks[i-1].id];
                }

                // If we want to preserve graph integrity for downstream nodes:
                // The downstream nodes depend on 'parentTask.id'.
                // We should probably make the last subtask have 'parentTask.id' OR alias it.
                // But IDs must be unique.
                // Let's just update the IDs of the new tasks to be distinct, 
                // AND we need to find who depended on 'parentTask.id' and update them to 'lastSubTask.id'.
                // But 'recursiveDecomposition' returns a list, it doesn't see the whole graph easily to update others.
                
                // Workaround: 
                // We return the subtasks. The caller (generateTaskGraph) gets a flat list.
                // We haven't updated downstream dependencies.
                // This is a limitation.
                
                // Better Strategy for IDs:
                // Make the LAST subtask reuse the Parent's ID.
                // Make previous subtasks have new IDs (parent_id_part_X).
                
                const lastIndex = subTasks.length - 1;
                const parentId = parentTask.id;
                
                // Rename all except last
                for (let i = 0; i < lastIndex; i++) {
                    subTasks[i].id = `${parentId}_part_${i+1}`;
                }
                
                // Last one takes the parent ID (so downstream waits for it)
                subTasks[lastIndex].id = parentId;
                
                // Fix internal deps again with new IDs
                for (let i = 1; i < subTasks.length; i++) {
                    subTasks[i].dependencies = [subTasks[i-1].id];
                }
                
                return subTasks;
            }

            return [];
        } catch (error) {
            console.warn('Decomposition failed:', error);
            return [];
        }
    }

    /**
     * Generate complex modification tasks using LLM
     */
    private async generateComplexModificationTasks(input: TaskPlannerInput): Promise<TaskNode[]> {
        const prompt = `
You are a Senior Software Architect.
User Request: "${input.query}"
Project Type: ${input.projectType}
Existing Files: ${input.fileStructure.slice(0, 50).join(', ')}

The user wants to perform a complex modification. 
Break this down into a series of granular, atomic modification steps.
Each step should target a specific file or component.
Ensure the order is logical (e.g., update interface -> implement class -> update tests).

Output a JSON array of task objects.
Format:
[
  {
    "id": "task_1",
    "description": "Specific task description",
    "type": "code" | "command" | "test",
    "dependencies": [],
    "filePath": "Target file path if known",
    "validationCommand": "shell command to verify success",
    "parallelGroup": "optional_group_id",
    "assignedAgent": "CodeGenerator" | "CodeModifier" | "Executor" | "WebSearch",
    "complexity": "simple" | "medium" | "complex"
  }
]
Rules:
1. Break down large changes into smaller, testable steps.
2. If multiple files need changes, create separate tasks for each.
3. Include verification/test updates as the last step.
4. Identify tasks that can run in parallel (e.g. creating independent files) and assign them the same 'parallelGroup' ID.
5. Assign the most appropriate agent for each task.
6. Provide a 'validationCommand' for each step if possible.
7. Output ONLY JSON.
`;

        try {
            const response = await this.client.streamResponse(
                prompt,
                () => {},
                (err: Error) => console.warn('Planning LLM error:', err)
            );

            const tasks = this.parseTaskResponse(response);
            if (tasks.length > 0) return tasks;
            
            return this.generateGenericTasks(input);
        } catch (error) {
            console.error('Complex planning failed:', error);
            return this.generateGenericTasks(input);
        }
    }

    /**
     * Generate dynamic tasks using LLM for generic/complex requests
     */
    private async generateDynamicTasks(input: TaskPlannerInput): Promise<TaskNode[]> {
        const prompt = this.constructDynamicPlanningPrompt(input);
        
        try {
            const response = await this.client.streamResponse(
                prompt,
                () => {},
                (err: Error) => console.warn('Planning LLM error:', err)
            );

            const tasks = this.parseTaskResponse(response);
            if (tasks.length > 0) return tasks;
            
            // Fallback if parsing fails
            return this.generateGenericTasks(input);
        } catch (error) {
            console.error('Dynamic planning failed:', error);
            return this.generateGenericTasks(input);
        }
    }

    private constructDynamicPlanningPrompt(input: TaskPlannerInput): string {
        return `You are a Senior Technical Project Manager and Systems Architect.
User Request: "${input.query}"
Project Type: ${input.projectType}
Existing Files: ${input.fileStructure.slice(0, 100).join(', ')}

Your goal is to break this request down into a precise, executable plan for an AI Agent team.

### Rules for Task Generation:
1. **Granularity**: Break complex tasks into small, atomic, verifiable steps.
   - Bad: "Create authentication system"
   - Good: "Create User model", "Implement JWT utility", "Create login route", "Create register route"
2. **Dependencies**: Ensure logical order.
   - Files must be created before they are imported.
   - Interfaces/Types must be defined before usage.
3. **Verification**: Each task MUST have a way to verify it was successful.
   - Provide a \`validationCommand\` (e.g., \`ls src/user.ts\`, \`npm test\`, \`node scripts/verify_user.js\`).
4. **Safety**: For risky operations (deletions, huge refactors), add a "Backup" or "Dry Run" task first.
5. **Context**: Use the provided file list to avoid creating duplicate files. Modify existing ones if appropriate.
6. **Parallelism & Efficiency**: 
   - Identify tasks that can run in parallel (e.g. creating independent files). Assign them the same 'parallelGroup' ID.
   - Group related tasks to minimize context switching.
7. **Agent Assignment**: Assign the most appropriate agent:
   - 'CodeGenerator': Creating new files or writing substantial code.
   - 'CodeModifier': Editing existing files (refactoring, bug fixes).
   - 'Executor': Running commands (npm install, tests, shell scripts).
   - 'WebSearch': Researching documentation or libraries.

### Output Format:
Return ONLY a JSON array of task objects matching this structure:
[
  {
    "id": "task_unique_id",
    "description": "Clear, actionable instruction",
    "type": "code" | "command" | "test",
    "filePath": "src/path/to/file.ts", // REQUIRED for code/test tasks
    "dependencies": ["task_id_of_dependency"],
    "validationCommand": "shell command to verify success",
    "critical": boolean,
    "parallelGroup": "optional_group_id", // Use same ID for parallel tasks
    "assignedAgent": "CodeGenerator" | "CodeModifier" | "Executor" | "WebSearch",
    "complexity": "simple" | "medium" | "complex"
  }
]

Do not include markdown formatting or explanations. Just the JSON.
`;
    }

    private parseTaskResponse(response: string): TaskNode[] {
        try {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return [];
            
            const tasks = JSON.parse(jsonMatch[0]);
            if (Array.isArray(tasks)) {
                return tasks.map((t: any) => ({
                    id: t.id || `task_${this.taskIdCounter++}`,
                    description: t.description,
                    filePath: t.filePath,
                    dependencies: t.dependencies || [],
                    status: 'pending',
                    type: t.type || 'code',
                    command: t.command,
                    validationCommand: t.validationCommand,
                    retryCount: 0,
                    parallelGroup: t.parallelGroup,
                    assignedAgent: t.assignedAgent,
                    complexity: t.complexity
                }));
            }
            return [];
        } catch (e) {
            console.error('Failed to parse planner JSON', e);
            return [];
        }
    }

    /**
     * Generate tasks for sequential command execution
     */
    private generateCommandSequenceTasks(input: TaskPlannerInput): TaskNode[] {
        const tasks: TaskNode[] = [];
        const query = input.query;
        
        // Simple heuristic to split commands by "then", "and", ",", ";"
        // This allows logical chaining like "clone repo X then run npm install"
        const steps = query.split(/(?:\s+then\s+|\s+and\s+|,\s*|;\s*)/i)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        let previousTaskId: string | undefined;

        steps.forEach((stepDesc, index) => {
            // Infer command from description
            let command: string | undefined;
            let validationCommand: string | undefined;
            let description = stepDesc;

            // Normalize description for better command inference
            const lowerDesc = stepDesc.toLowerCase();

            if (lowerDesc.includes('clone')) {
                const urlMatch = stepDesc.match(/(?:https?|git|ssh):\/\/[^\s]+/);
                if (urlMatch) {
                    command = `git clone ${urlMatch[0]}`;
                    // Extract repo name to validate
                    const repoName = urlMatch[0].split('/').pop()?.replace('.git', '');
                    if (repoName) validationCommand = `test -d ${repoName}`;
                } else {
                    command = 'git clone <repo_url>'; // Placeholder
                }
            }
            else if (lowerDesc.includes('install')) {
                if (lowerDesc.includes('npm')) {
                    command = 'npm install';
                    validationCommand = 'npm list --depth=0';
                }
                else if (lowerDesc.includes('pip')) {
                    command = 'pip install -r requirements.txt';
                    validationCommand = 'pip list';
                }
                else if (lowerDesc.includes('yarn')) {
                    command = 'yarn install';
                    validationCommand = 'yarn list --depth=0';
                }
                else {
                    command = 'npm install'; // Default
                    validationCommand = 'npm list --depth=0';
                }
            }
            else if (lowerDesc.includes('commit')) {
                const msgMatch = stepDesc.match(/['"]([^'"]+)['"]/);
                const msg = msgMatch ? msgMatch[1] : 'update';
                command = `git add . && git commit -m "${msg}"`;
                validationCommand = 'git log -1 --oneline';
            }
            else if (lowerDesc.includes('push')) {
                command = 'git push';
                validationCommand = 'git status';
            }
            else if (lowerDesc.includes('test api') || lowerDesc.includes('check url') || lowerDesc.includes('curl')) {
                const urlMatch = stepDesc.match(/(?:https?):\/\/[^\s]+/);
                if (urlMatch) {
                    command = `curl -I ${urlMatch[0]}`;
                } else {
                    command = 'curl <url>';
                }
            }
            else if (lowerDesc.startsWith('run ') || lowerDesc.startsWith('exec ')) {
                 command = stepDesc.replace(/^(run|exec)\s+/, '');
            }
            // Default fallback for other commands (e.g., 'ls -la', 'git status', 'mkdir foo')
            else {
                // If it looks like a shell command (starts with a known binary or has arguments)
                // We'll assume it's a direct command
                command = stepDesc;
            }

            // Create task
            const taskId = `task_${this.taskIdCounter++}`;
            const deps = previousTaskId ? [previousTaskId] : [];

            tasks.push({
                id: taskId,
                description: description,
                dependencies: deps,
                status: 'pending',
                command: command,
                validationCommand: validationCommand,
                type: 'command',
                retryCount: 0
            });

            previousTaskId = taskId;
        });

        return tasks;
    }

    /**
     * Generate tasks for script/automation requests
     */
    private generateScriptTasks(input: TaskPlannerInput): TaskNode[] {
        const tasks: TaskNode[] = [];
        const query = input.query.toLowerCase();
        
        // Dynamic Language Detection
        const languageMap: { [key: string]: { ext: string, cmd: string, name: string } } = {
            'python': { ext: 'py', cmd: 'python3', name: 'python' },
            'javascript': { ext: 'js', cmd: 'node', name: 'javascript' },
            'js': { ext: 'js', cmd: 'node', name: 'javascript' },
            'typescript': { ext: 'ts', cmd: 'npx ts-node', name: 'typescript' },
            'ts': { ext: 'ts', cmd: 'npx ts-node', name: 'typescript' },
            'bash': { ext: 'sh', cmd: 'bash', name: 'bash' },
            'shell': { ext: 'sh', cmd: 'bash', name: 'bash' },
            'sh': { ext: 'sh', cmd: 'bash', name: 'bash' },
            'go': { ext: 'go', cmd: 'go run', name: 'go' },
            'golang': { ext: 'go', cmd: 'go run', name: 'go' },
            'rust': { ext: 'rs', cmd: 'cargo run', name: 'rust' }, // Requires cargo project usually, but single file runner exists
            'ruby': { ext: 'rb', cmd: 'ruby', name: 'ruby' },
            'php': { ext: 'php', cmd: 'php', name: 'php' },
            'java': { ext: 'java', cmd: 'java', name: 'java' } // Single file source code execution (Java 11+)
        };

        // Default to Python if no specific language found
        let langConfig = languageMap['python'];

        // Check query for language keywords
        for (const [key, config] of Object.entries(languageMap)) {
            if (query.includes(key)) {
                langConfig = config;
                break;
            }
        }

        // Check existing files for hints
        if (input.fileStructure.length > 0) {
             const existingExt = input.fileStructure[0].split('.').pop();
             if (existingExt) {
                 for (const config of Object.values(languageMap)) {
                     if (config.ext === existingExt) {
                         langConfig = config;
                         break;
                     }
                 }
             }
        }

        const fileName = input.fileStructure.find(f => f.endsWith(`.${langConfig.ext}`)) || `script.${langConfig.ext}`;
        
        // 1. Create Script (only if it doesn't exist or we aren't just running)
        // If query is explicitly "run <file>", we might skip creation if file exists
        // But generally, "create and run" is safer
        const isRunOnly = query.startsWith('run ') && input.fileStructure.includes(fileName);
        
        if (!isRunOnly) {
            tasks.push(this.createTask(
                `Create ${langConfig.name} script to solve: ${input.query.slice(0, 50)}...`,
                fileName,
                [],
                undefined
            ));
        }

        // 2. Run Script
        // Always add run task if the intent is execution, regardless of explicit "run" keyword
        // because detectTaskType already classified this as 'script_execution'
        const deps = tasks.length > 0 ? [tasks[0].id] : [];
        tasks.push(this.createTask(
            `Run ${fileName} and report result`,
            undefined,
            deps,
            `${langConfig.cmd} ${fileName}`
        ));

        return tasks;
    }

    /**
     * Generate generic tasks for non-scaffold requests
     */
    private generateGenericTasks(input: TaskPlannerInput): TaskNode[] {
        const tasks: TaskNode[] = [];
        const query = input.query.toLowerCase();
        
        // 1. Analysis Phase
        tasks.push(this.createTask(
            'Analyze Context & Requirements',
            undefined,
            [],
            undefined
        ));

        // 2. Planning Phase
        tasks.push(this.createTask(
            'Plan Implementation Details',
            undefined,
            [tasks[0].id],
            undefined
        ));

        // 3. Execution Phase
        // Customize based on query keywords
        let execDesc = 'Execute Changes';
        if (query.includes('fix')) execDesc = 'Apply Fixes';
        else if (query.includes('refactor')) execDesc = 'Perform Refactoring';
        else if (query.includes('test')) execDesc = 'Implement Tests';
        
        tasks.push(this.createTask(
            execDesc,
            undefined,
            [tasks[1].id],
            undefined
        ));

        // 4. Validation Phase
        tasks.push(this.createTask(
            'Verify & Validate',
            undefined,
            [tasks[2].id],
            'npm test' // Default validation
        ));

        return tasks;
    }

    /**
     * Generate tasks for project scaffolding
     */
    private generateScaffoldTasks(input: TaskPlannerInput): TaskNode[] {
        const tasks: TaskNode[] = [];

        // 1. Project setup tasks
        tasks.push(this.createTask(
            'Initialize project with package.json',
            undefined,
            [],
            'npm init -y'
        ));

        tasks.push(this.createTask(
            'Install dependencies',
            undefined,
            [tasks[0].id],
            'npm install'
        ));

        tasks.push(this.createTask(
            'Configure TypeScript',
            'tsconfig.json',
            [tasks[0].id],
            'npx tsc --init'
        ));

        // 2. Directory structure tasks
        const folders = input.fileStructure.filter(f => f.endsWith('/'));
        if (folders.length > 0) {
            tasks.push(this.createTask(
                'Create directory structure',
                undefined,
                [tasks[0].id],
                `mkdir -p ${folders.join(' ')}`
            ));
        }

        // 3. Interface/Type definition tasks
        if (input.interfaces.length > 0) {
            tasks.push(this.createTask(
                'Create type definitions',
                'src/types/index.ts',
                [tasks[2].id],
                'npm run typecheck'
            ));
        }

        // 4. API route tasks (if applicable)
        if (input.apiEndpoints?.length) {
            const setupId = tasks[tasks.length - 1].id;

            tasks.push(this.createTask(
                'Create API router setup',
                'src/routes/index.ts',
                [setupId]
            ));

            // Group endpoints by resource
            const resources = new Map<string, typeof input.apiEndpoints>();
            for (const endpoint of input.apiEndpoints) {
                const resource = endpoint.path.split('/')[2] || 'root';
                if (!resources.has(resource)) resources.set(resource, []);
                const resourceList = resources.get(resource);
                if (resourceList) {
                    resourceList.push(endpoint);
                }
            }

            // Create route file tasks
            for (const [resource, endpoints] of resources) {
                tasks.push(this.createTask(
                    `Implement ${resource} routes (${endpoints.length} endpoints)`,
                    `src/routes/${resource}.routes.ts`,
                    [tasks[tasks.length - 1].id],
                    `curl http://localhost:3000/api/${resource}`
                ));
            }
        }

        // 5. Component tasks (for web projects)
        const componentFiles = input.fileStructure.filter(f =>
            f.includes('/components/') && f.endsWith('.tsx')
        );

        if (componentFiles.length > 0) {
            const typesTaskId = tasks.find(t => t.description.includes('type definitions'))?.id || tasks[0].id;

            tasks.push(this.createTask(
                'Create base UI components',
                'src/components/ui/index.ts',
                [typesTaskId]
            ));

            for (const componentFile of componentFiles.slice(0, 5)) {
                const componentName = componentFile.split('/').pop()?.replace('.tsx', '');
                tasks.push(this.createTask(
                    `Implement ${componentName} component`,
                    componentFile,
                    [tasks[tasks.length - 1].id]
                ));
            }
        }

        // 6. Testing tasks
        tasks.push(this.createTask(
            'Setup testing framework',
            undefined,
            [tasks[1].id],
            'npm install -D jest ts-jest @types/jest'
        ));

        tasks.push(this.createTask(
            'Write initial tests',
            'tests/index.test.ts',
            [tasks[tasks.length - 1].id],
            'npm run test'
        ));

        return tasks;
    }

    /**
     * Create a task node
     */
    private createTask(
        description: string,
        filePath?: string,
        dependencies: string[] = [],
        validationCommand?: string
    ): TaskNode {
        return {
            id: `task_${String(this.taskIdCounter++).padStart(3, '0')}`,
            description,
            filePath,
            dependencies,
            validationCommand,
            status: 'pending'
        };
    }

    /**
     * Topological sort for execution order
     */
    private topologicalSort(tasks: TaskNode[]): string[] {
        const result: string[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const taskMap = new Map(tasks.map(t => [t.id, t]));

        const visit = (id: string) => {
            if (visited.has(id)) return;
            if (visiting.has(id)) throw new Error('Circular dependency detected');

            visiting.add(id);
            const task = taskMap.get(id);

            if (task) {
                for (const dep of task.dependencies) {
                    visit(dep);
                }
            }

            visiting.delete(id);
            visited.add(id);
            result.push(id);
        };

        for (const task of tasks) {
            visit(task.id);
        }

        return result;
    }

    /**
     * Generate validation commands for tasks
     */
    private generateValidationCommands(
        tasks: TaskNode[],
        projectType: string
    ): { task: string; command: string }[] {
        const commands: { task: string; command: string }[] = [];

        for (const task of tasks) {
            if (task.validationCommand) {
                commands.push({ task: task.id, command: task.validationCommand });
            } else if (task.filePath) {
                // Generate default validation based on file type
                if (task.filePath.endsWith('.ts') || task.filePath.endsWith('.tsx')) {
                    commands.push({ task: task.id, command: 'npm run typecheck' });
                }
            }
        }

        // Add overall validation commands
        commands.push({ task: 'final', command: 'npm run build' });

        if (projectType === 'api') {
            commands.push({ task: 'final', command: 'npm run test' });
        } else if (projectType === 'web' || projectType === 'fullstack') {
            commands.push({ task: 'final', command: 'npm run lint && npm run build' });
        }

        return commands;
    }

    /**
     * Identify critical path (longest path through task graph)
     */
    private identifyCriticalPath(tasks: TaskNode[], executionOrder: string[]): string[] {
        const taskMap = new Map(tasks.map(t => [t.id, t]));
        const distances = new Map<string, number>();
        const predecessors = new Map<string, string>();

        // Initialize distances
        for (const id of executionOrder) {
            distances.set(id, 0);
        }

        // Calculate longest paths
        for (const id of executionOrder) {
            const task = taskMap.get(id);
            if (!task) continue;

            for (const depId of task.dependencies) {
                const newDist = (distances.get(depId) || 0) + 1;
                if (newDist > (distances.get(id) || 0)) {
                    distances.set(id, newDist);
                    predecessors.set(id, depId);
                }
            }
        }

        // Find the task with the longest path
        let maxDist = 0;
        let endTask = executionOrder[0];
        for (const [id, dist] of distances) {
            if (dist > maxDist) {
                maxDist = dist;
                endTask = id;
            }
        }

        // Reconstruct path
        const path: string[] = [endTask];
        let current = endTask;
        while (predecessors.has(current)) {
            current = predecessors.get(current)!;
            path.unshift(current);
        }

        return path;
    }

    /**
     * Format task graph as human-readable output
     */
    formatTaskGraph(result: TaskPlannerResult): string {
        const lines: string[] = ['## Task Execution Plan\n'];

        lines.push('### Execution Order:');
        for (let i = 0; i < result.executionOrder.length; i++) {
            const taskId = result.executionOrder[i];
            const task = result.taskGraph.find(t => t.id === taskId);
            if (task) {
                const isCritical = result.criticalPath.includes(taskId);
                const prefix = isCritical ? '🔴' : '⚪';
                lines.push(`${i + 1}. ${prefix} [${taskId}] ${task.description}`);
                if (task.filePath) {
                    lines.push(`   📁 ${task.filePath}`);
                }
            }
        }

        lines.push('\n### Validation Commands:');
        for (const { task, command } of result.validationCommands.slice(0, 5)) {
            lines.push(`- \`${task}\`: \`${command}\``);
        }

        lines.push('\n### Critical Path:');
        lines.push(result.criticalPath.join(' → '));

        return lines.join('\n');
    }
}

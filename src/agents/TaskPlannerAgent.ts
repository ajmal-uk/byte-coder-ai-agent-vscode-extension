/**
 * TaskPlannerAgent - Executable task generator
 * Creates dependency graphs and validation commands for implementation
 */

import { BaseAgent, AgentOutput, TaskNode } from '../core/AgentTypes';

export interface TaskPlannerInput {
    query: string;
    projectType: string;
    fileStructure: string[];
    interfaces: string[];
    apiEndpoints?: { method: string; path: string; description: string }[];
}

export interface TaskPlannerResult {
    taskGraph: TaskNode[];
    executionOrder: string[];
    validationCommands: { task: string; command: string }[];
    criticalPath: string[];
}

export class TaskPlannerAgent extends BaseAgent<TaskPlannerInput, TaskPlannerResult> {
    private taskIdCounter = 0;

    constructor() {
        super({ name: 'TaskPlanner', timeout: 10000 });
    }

    async execute(input: TaskPlannerInput): Promise<AgentOutput<TaskPlannerResult>> {
        const startTime = Date.now();
        this.taskIdCounter = 0;

        try {
            // Generate task graph
            const taskGraph = this.generateTaskGraph(input);

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
     * Generate task graph from input
     */
    private generateTaskGraph(input: TaskPlannerInput): TaskNode[] {
        // If we have file structure defined, it's likely a scaffolding task
        if (input.fileStructure && input.fileStructure.length > 0) {
            return this.generateScaffoldTasks(input);
        }
        
        // Otherwise, generate a generic execution plan based on the query
        return this.generateGenericTasks(input);
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
                resources.get(resource)!.push(endpoint);
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

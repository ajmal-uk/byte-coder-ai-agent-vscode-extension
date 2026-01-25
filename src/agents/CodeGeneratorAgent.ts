/**
 * CodeGeneratorAgent - Generates code content and modifications based on plans
 * Bridges the gap between TaskPlanner and CommandGenerator/CodeModifier
 */

import * as vscode from 'vscode';
import { BaseAgent, AgentOutput, CodeModification, CommandSpec } from '../core/AgentTypes';
import { TaskPlannerResult } from './TaskPlannerAgent';
import { CodePlannerResult } from './CodePlannerAgent';

export interface CodeGeneratorInput {
    taskPlan: TaskPlannerResult;
    codePlan: CodePlannerResult;
    context?: {
        knowledge?: any[];
        files?: any[];
    };
}

export interface CodeGeneratorResult {
    commands: any[]; // specific CommandSpec structure
    modifications: CodeModification[];
    generatedFiles: string[];
}

export class CodeGeneratorAgent extends BaseAgent<CodeGeneratorInput, CodeGeneratorResult> {
    constructor() {
        super({ name: 'CodeGenerator', timeout: 20000 });
    }

    async execute(input: CodeGeneratorInput): Promise<AgentOutput<CodeGeneratorResult>> {
        const startTime = Date.now();

        try {
            const commands: any[] = [];
            const modifications: CodeModification[] = [];
            const generatedFiles: string[] = [];

            // Process tasks to generate code
            for (const task of input.taskPlan.taskGraph) {
                if (task.filePath && !task.description.includes('mkdir')) {
                    // This task involves a file
                    const content = this.generateContentForFile(task.filePath, task.description, input.codePlan, input.context);
                    
                    // For now, we assume we are creating new files (CommandGenerator will handle it)
                    // In a real scenario, we'd check if file exists to decide between create vs modify
                    
                    // We generate a "create_file" command spec
                    // Note: We are creating a generic command spec that CommandGenerator can understand
                    // OR we can output direct file content that PipelineEngine can feed to CommandGenerator
                    
                    commands.push({
                        operation: 'create_file',
                        target: task.filePath,
                        content: content
                    });
                    
                    generatedFiles.push(task.filePath);
                }
            }

            const result: CodeGeneratorResult = {
                commands,
                modifications,
                generatedFiles
            };

            return this.createOutput('success', result, 0.8, startTime, {
                reasoning: `Generated content for ${generatedFiles.length} files based on task plan`
            });

        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Generate content for a file based on its type and description
     */
    private generateContentForFile(filePath: string, description: string, codePlan: CodePlannerResult, context?: CodeGeneratorInput['context']): string {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const fileName = filePath.split('/').pop()?.split('.')[0] || 'Component';

        // Extract relevant knowledge if available
        let additionalContext = '';
        if (context?.knowledge && context.knowledge.length > 0) {
            // Simple keyword matching to find relevant knowledge
            const relevantKnowledge = context.knowledge.filter(k => {
                const keywords = description.toLowerCase().split(' ').filter(w => w.length > 3);
                return keywords.some(w => k.summary.toLowerCase().includes(w) || k.content?.toLowerCase().includes(w));
            });

            if (relevantKnowledge.length > 0) {
                additionalContext = `\n// RELEVANT CONTEXT:\n// ${relevantKnowledge.map(k => k.summary).join('\n// ')}\n`;
            }
        }

        // 1. React Component
        if ((filePath.includes('components/') || filePath.includes('pages/')) && (ext === 'tsx' || ext === 'jsx')) {
            let innerContent = `{/* TODO: Implement ${description} */}`;
            
            // Inject context into the component if relevant
            if (additionalContext) {
                 innerContent += `\n            {/* \n              CONTEXT:\n              ${context?.knowledge?.map(k => k.summary).join('\n              ')} \n            */}`;
                 // Also try to intelligently inject strings
                 context?.knowledge?.forEach(k => {
                     if (k.summary.includes('founder') || k.summary.includes('owner')) {
                         innerContent += `\n            <p>Founder: ${k.summary.split(':')[1]?.trim() || 'Unknown'}</p>`;
                     }
                 });
            }

            return `import React from 'react';

interface ${fileName}Props {
    // TODO: Define props
    children?: React.ReactNode;
}

export const ${fileName}: React.FC<${fileName}Props> = ({ children }) => {
    return (
        <div className="${fileName.toLowerCase()}-container">
            ${innerContent}
            <h2>${fileName}</h2>
            {children}
        </div>
    );
};

export default ${fileName};`;
        }

        // 2. TypeScript/JavaScript File
        if (ext === 'ts' || ext === 'js') {
            if (filePath.includes('types/') || filePath.includes('interfaces')) {
                return `// Type definitions for ${fileName}
// Generated by Byte Coder

export interface I${fileName} {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}
`;
            }

            if (filePath.includes('utils/') || filePath.includes('helpers')) {
                return `/**
 * Utility functions for ${fileName}
 */

export const process${fileName} = (data: any): void => {
    // TODO: Implement processing logic
    console.log('Processing', data);
};
`;
            }
        }

        // 3. CSS/Styles
        if (ext === 'css' || ext === 'scss') {
            return `/* Styles for ${fileName} */
.${fileName.toLowerCase()}-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
`;
        }

        // 4. Python Script
        if (ext === 'py') {
            // Check if it's a math/calculation task
            if (description.toLowerCase().includes('solve') || description.toLowerCase().includes('calculate')) {
                // Extract potential math expression from description (simple heuristic)
                // Looks for sequences of numbers and operators
                const mathMatch = description.match(/[\d\s\+\-\*\/\(\)\.]+/);
                const expression = mathMatch ? mathMatch[0].trim() : '"Could not parse expression"';
                
                return `# Python script to ${description}
def solve():
    try:
        result = ${expression}
        print(f"Result: {result}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    solve()
`;
            }

            return `# ${fileName}.py
# ${description}

def main():
    print("Executing ${fileName}...")
    # TODO: Implement logic

if __name__ == "__main__":
    main()
`;
        }

        // 5. Shell Script
        if (ext === 'sh') {
            return `#!/bin/bash
# ${description}

echo "Running ${fileName}..."
# TODO: Implement commands
`;
        }

        // 6. JSON Config
        if (ext === 'json') {
            return `{\n  "name": "${fileName}",\n  "version": "1.0.0"\n}`;
        }

        // Default
        return `// ${fileName}
// ${description}
// TODO: Implement this file
`;
    }
}

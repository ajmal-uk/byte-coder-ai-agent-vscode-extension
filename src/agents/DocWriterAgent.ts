/**
 * DocWriterAgent - Self-documenting system for Byte Coder
 * Generates documentation, comments, and decision records
 */

import * as vscode from 'vscode';
import { BaseAgent, AgentOutput } from '../core/AgentTypes';

export interface DocWriterInput {
    type: 'inline_comments' | 'readme' | 'api_reference' | 'decision_record' | 'changelog';
    content?: string;
    filePath?: string;
    context?: {
        functionName?: string;
        className?: string;
        changes?: string[];
        decision?: string;
        options?: string[];
        rationale?: string;
    };
}

export interface DocWriterResult {
    documentation: string;
    format: 'markdown' | 'jsdoc' | 'tsdoc' | 'plain';
    insertLocation?: { file: string; line: number };
}

export class DocWriterAgent extends BaseAgent<DocWriterInput, DocWriterResult> {
    constructor() {
        super({ name: 'DocWriter', timeout: 10000 });
    }

    async execute(input: DocWriterInput): Promise<AgentOutput<DocWriterResult>> {
        const startTime = Date.now();

        try {
            let result: DocWriterResult;

            switch (input.type) {
                case 'inline_comments':
                    result = this.generateInlineComments(input);
                    break;
                case 'readme':
                    result = this.generateReadme(input);
                    break;
                case 'api_reference':
                    result = this.generateApiReference(input);
                    break;
                case 'decision_record':
                    result = this.generateDecisionRecord(input);
                    break;
                case 'changelog':
                    result = this.generateChangelog(input);
                    break;
                default:
                    result = { documentation: '', format: 'plain' };
            }

            return this.createOutput('success', result, 0.85, startTime, {
                reasoning: `Generated ${input.type} documentation`
            });

        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Generate inline comments for code
     */
    private generateInlineComments(input: DocWriterInput): DocWriterResult {
        const lines: string[] = [];
        const ctx = input.context;

        if (ctx?.functionName) {
            lines.push('/**');
            lines.push(` * ${this.generateFunctionDescription(ctx.functionName)}`);
            lines.push(' *');

            // Add parameter placeholders
            lines.push(' * @param {type} paramName - Parameter description');
            lines.push(' * @returns {type} Return value description');
            lines.push(' *');
            lines.push(' * @example');
            lines.push(` * ${ctx.functionName}()`);
            lines.push(' */');
        } else if (ctx?.className) {
            lines.push('/**');
            lines.push(` * ${this.generateClassDescription(ctx.className)}`);
            lines.push(' *');
            lines.push(' * @class');
            lines.push(` * @classdesc ${ctx.className} class description`);
            lines.push(' */');
        } else if (input.content) {
            // Analyze content and generate appropriate comments
            const analysis = this.analyzeCode(input.content);
            lines.push(...analysis.comments);
        }

        return {
            documentation: lines.join('\n'),
            format: 'tsdoc'
        };
    }

    /**
     * Generate README section
     */
    private generateReadme(input: DocWriterInput): DocWriterResult {
        const lines: string[] = [];
        const changes = input.context?.changes || [];

        lines.push('## Recent Changes\n');

        if (changes.length > 0) {
            lines.push('### What\'s New\n');
            for (const change of changes) {
                lines.push(`- ${change}`);
            }
            lines.push('');
        }

        lines.push('### Features\n');
        lines.push('- Feature description here');
        lines.push('');

        lines.push('### Usage\n');
        lines.push('```typescript');
        lines.push('// Example usage code');
        lines.push('```');
        lines.push('');

        lines.push('### Installation\n');
        lines.push('```bash');
        lines.push('npm install');
        lines.push('```');

        return {
            documentation: lines.join('\n'),
            format: 'markdown'
        };
    }

    /**
     * Generate API reference documentation
     */
    private generateApiReference(input: DocWriterInput): DocWriterResult {
        const lines: string[] = [];

        lines.push('# API Reference\n');
        lines.push('## Endpoints\n');

        lines.push('### `GET /api/resource`\n');
        lines.push('Description of the endpoint.\n');
        lines.push('**Parameters:**');
        lines.push('| Name | Type | Required | Description |');
        lines.push('|------|------|----------|-------------|');
        lines.push('| id | string | Yes | Resource ID |');
        lines.push('');

        lines.push('**Response:**');
        lines.push('```json');
        lines.push('{');
        lines.push('  "success": true,');
        lines.push('  "data": { }');
        lines.push('}');
        lines.push('```');
        lines.push('');

        lines.push('**Status Codes:**');
        lines.push('- `200` - Success');
        lines.push('- `400` - Bad Request');
        lines.push('- `404` - Not Found');
        lines.push('- `500` - Server Error');

        return {
            documentation: lines.join('\n'),
            format: 'markdown'
        };
    }

    /**
     * Generate Architecture Decision Record (ADR)
     */
    private generateDecisionRecord(input: DocWriterInput): DocWriterResult {
        const ctx = input.context;
        const date = new Date().toISOString().split('T')[0];
        const lines: string[] = [];

        lines.push(`## ${ctx?.decision || 'Architecture Decision'}`);
        lines.push(`**Date:** ${date}`);
        lines.push('');

        lines.push('### Context');
        lines.push('Describe the context and problem that led to this decision.');
        lines.push('');

        lines.push('### Decision Drivers');
        lines.push('- Driver 1');
        lines.push('- Driver 2');
        lines.push('');

        lines.push('### Options Considered');
        if (ctx?.options) {
            for (let i = 0; i < ctx.options.length; i++) {
                lines.push(`${i + 1}. **${ctx.options[i]}**`);
                lines.push('   - Pros: ...');
                lines.push('   - Cons: ...');
            }
        } else {
            lines.push('1. **Option A**');
            lines.push('   - Pros: ...');
            lines.push('   - Cons: ...');
        }
        lines.push('');

        lines.push('### Decision');
        lines.push(ctx?.rationale || 'Explanation of the chosen option and why.');
        lines.push('');

        lines.push('### Consequences');
        lines.push('- Impact 1');
        lines.push('- Impact 2');

        return {
            documentation: lines.join('\n'),
            format: 'markdown'
        };
    }

    /**
     * Generate changelog entry
     */
    private generateChangelog(input: DocWriterInput): DocWriterResult {
        const date = new Date().toISOString().split('T')[0];
        const changes = input.context?.changes || [];
        const lines: string[] = [];

        lines.push(`## [Unreleased] - ${date}\n`);

        // Categorize changes
        const added: string[] = [];
        const changed: string[] = [];
        const fixed: string[] = [];
        const removed: string[] = [];

        for (const change of changes) {
            const lower = change.toLowerCase();
            if (lower.startsWith('add') || lower.startsWith('new') || lower.startsWith('implement')) {
                added.push(change);
            } else if (lower.startsWith('fix') || lower.startsWith('resolve') || lower.startsWith('correct')) {
                fixed.push(change);
            } else if (lower.startsWith('remove') || lower.startsWith('delete')) {
                removed.push(change);
            } else {
                changed.push(change);
            }
        }

        if (added.length > 0) {
            lines.push('### Added');
            added.forEach(c => lines.push(`- ${c}`));
            lines.push('');
        }

        if (changed.length > 0) {
            lines.push('### Changed');
            changed.forEach(c => lines.push(`- ${c}`));
            lines.push('');
        }

        if (fixed.length > 0) {
            lines.push('### Fixed');
            fixed.forEach(c => lines.push(`- ${c}`));
            lines.push('');
        }

        if (removed.length > 0) {
            lines.push('### Removed');
            removed.forEach(c => lines.push(`- ${c}`));
            lines.push('');
        }

        return {
            documentation: lines.join('\n'),
            format: 'markdown'
        };
    }

    /**
     * Generate function description from name
     */
    private generateFunctionDescription(name: string): string {
        // Convert camelCase/PascalCase to words
        const words = name.replace(/([A-Z])/g, ' $1').toLowerCase().trim().split(' ');

        // Common verb patterns
        const verbPatterns: Record<string, string> = {
            'get': 'Retrieves',
            'set': 'Sets',
            'create': 'Creates',
            'update': 'Updates',
            'delete': 'Deletes',
            'add': 'Adds',
            'remove': 'Removes',
            'handle': 'Handles',
            'process': 'Processes',
            'validate': 'Validates',
            'check': 'Checks',
            'is': 'Checks if',
            'has': 'Checks if it has',
            'can': 'Checks if it can',
            'find': 'Finds',
            'search': 'Searches for',
            'fetch': 'Fetches',
            'load': 'Loads',
            'save': 'Saves',
            'init': 'Initializes',
            'parse': 'Parses',
            'format': 'Formats',
            'render': 'Renders',
            'calculate': 'Calculates',
            'compute': 'Computes'
        };

        const firstWord = words[0];
        const verb = verbPatterns[firstWord] || 'Performs';
        const rest = words.slice(1).join(' ');

        return `${verb} ${rest || 'the operation'}`;
    }

    /**
     * Generate class description from name
     */
    private generateClassDescription(name: string): string {
        const words = name.replace(/([A-Z])/g, ' $1').trim();

        // Common suffix patterns
        if (name.endsWith('Agent')) {
            return `${words} - Specialized agent for handling ${words.replace(' Agent', '').toLowerCase()} operations`;
        }
        if (name.endsWith('Service')) {
            return `${words} - Service layer for ${words.replace(' Service', '').toLowerCase()} functionality`;
        }
        if (name.endsWith('Controller')) {
            return `${words} - Controls ${words.replace(' Controller', '').toLowerCase()} flow`;
        }
        if (name.endsWith('Provider')) {
            return `${words} - Provides ${words.replace(' Provider', '').toLowerCase()} functionality`;
        }
        if (name.endsWith('Manager')) {
            return `${words} - Manages ${words.replace(' Manager', '').toLowerCase()} operations`;
        }

        return `${words} class`;
    }

    /**
     * Analyze code and generate appropriate comments
     */
    private analyzeCode(content: string): { comments: string[] } {
        const comments: string[] = [];
        const lines = content.split('\n');

        // Look for function declarations
        const funcMatch = content.match(/(?:async\s+)?function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
        if (funcMatch) {
            const funcName = funcMatch[1] || funcMatch[2];
            comments.push('/**');
            comments.push(` * ${this.generateFunctionDescription(funcName)}`);
            comments.push(' */');
        }

        return { comments };
    }
}

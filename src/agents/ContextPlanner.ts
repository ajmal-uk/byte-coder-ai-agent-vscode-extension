/**
 * ContextPlanner - Analyzes requests and determines optimal context gathering strategy
 * Part of the Smart Context System (Antigravity-inspired architecture)
 */

import * as vscode from 'vscode';
import { BaseAgent, AgentOutput } from '../core/AgentTypes';

export interface ContextPlan {
    scope: 'file' | 'folder' | 'workspace' | 'minimal';
    searchTerms: string[];
    symbolSearch: string[];
    filePatterns: string[];
    excludePatterns: string[];
    maxFiles: number;
    maxContentPerFile: number;
    priority: 'speed' | 'accuracy' | 'balanced';
    contextType: ('code' | 'docs' | 'config' | 'tests')[];
}

export interface ContextPlannerInput {
    query: string;
    activeFile?: string;
    hasSelection?: boolean;
    selectionText?: string;
}

export class ContextPlanner extends BaseAgent<ContextPlannerInput, ContextPlan> {

    // Keywords that suggest different scope levels
    private readonly scopeIndicators = {
        file: ['this file', 'current file', 'here', 'this function', 'this class'],
        folder: ['this folder', 'in this directory', 'nearby files', 'related files'],
        workspace: ['project', 'codebase', 'entire', 'all files', 'everywhere'],
        minimal: ['quick', 'simple', 'just', 'only', 'briefly']
    };

    // Keywords that suggest context types
    private readonly contextTypeIndicators = {
        code: ['function', 'class', 'method', 'variable', 'implement', 'code', 'logic'],
        docs: ['readme', 'documentation', 'docs', 'explain', 'guide'],
        config: ['config', 'settings', 'package.json', 'tsconfig', 'env', 'configuration'],
        tests: ['test', 'spec', 'coverage', 'jest', 'mocha', 'testing']
    };

    constructor() {
        super({ name: 'ContextPlanner', timeout: 5000 });
    }

    async execute(input: ContextPlannerInput): Promise<AgentOutput<ContextPlan>> {
        const startTime = Date.now();

        try {
            const plan = this.createPlan(input);

            return this.createOutput('success', plan, 0.9, startTime, {
                reasoning: `Planned ${plan.scope} scope with ${plan.searchTerms.length} search terms`
            });
        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Public definition for direct usage
     */
    public analyze(query: string, activeFile?: string): ContextPlan {
        return this.createPlan({
            query,
            activeFile,
            hasSelection: false
        });
    }

    private createPlan(input: ContextPlannerInput): ContextPlan {
        const query = input.query.toLowerCase();

        // Determine scope
        const scope = this.determineScope(query, input);

        // Extract search terms
        const searchTerms = this.extractSearchTerms(input.query);

        // Extract symbol references
        const symbolSearch = this.extractSymbolRefs(input.query);

        // Determine context types
        const contextType = this.determineContextTypes(query);

        // Determine file patterns based on context type
        const filePatterns = this.getFilePatterns(contextType, input.activeFile);

        // Standard excludes
        const excludePatterns = [
            '**/node_modules/**',
            '**/.git/**',
            '**/dist/**',
            '**/build/**',
            '**/*.min.js',
            '**/coverage/**'
        ];

        // Determine limits based on scope
        const limits = this.getLimits(scope);

        // Determine priority
        const priority = this.determinePriority(query, scope);

        return {
            scope,
            searchTerms,
            symbolSearch,
            filePatterns,
            excludePatterns,
            maxFiles: limits.maxFiles,
            maxContentPerFile: limits.maxContent,
            priority,
            contextType
        };
    }

    private determineScope(query: string, input: ContextPlannerInput): ContextPlan['scope'] {
        // Check for explicit scope indicators
        for (const [scope, indicators] of Object.entries(this.scopeIndicators)) {
            if (indicators.some(ind => query.includes(ind))) {
                return scope as ContextPlan['scope'];
            }
        }

        // If has selection, likely file scope
        if (input.hasSelection && input.selectionText) {
            return 'file';
        }

        // Short queries often need broader context
        if (query.length < 50) {
            return 'folder';
        }

        // Default to balanced scope
        return 'folder';
    }

    private extractSearchTerms(query: string): string[] {
        const stopWords = new Set([
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
            'what', 'how', 'why', 'when', 'where', 'which', 'who', 'whom', 'whose',
            'this', 'that', 'these', 'those', 'am', 'and', 'but', 'or', 'if', 'then',
            'so', 'than', 'too', 'very', 'just', 'only', 'both', 'each', 'any', 'all',
            'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'own', 'same',
            'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'up', 'down',
            'into', 'out', 'about', 'after', 'before', 'above', 'below', 'between',
            'please', 'help', 'want', 'make', 'create', 'add', 'remove', 'fix', 'change'
        ]);

        // Extract meaningful words
        const words = query
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));

        // Also extract quoted phrases
        const quotedPhrases = query.match(/["']([^"']+)["']/g) || [];
        const phrases = quotedPhrases.map(p => p.replace(/["']/g, ''));

        return [...new Set([...words, ...phrases])];
    }

    private extractSymbolRefs(query: string): string[] {
        const symbols: string[] = [];

        // Match PascalCase (class names)
        const pascalCase = query.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) || [];
        symbols.push(...pascalCase);

        // Match camelCase (function/variable names)
        const camelCase = query.match(/\b[a-z]+(?:[A-Z][a-z]+)+\b/g) || [];
        symbols.push(...camelCase);

        // Match snake_case
        const snakeCase = query.match(/\b[a-z]+(?:_[a-z]+)+\b/g) || [];
        symbols.push(...snakeCase);

        // Match backtick-quoted code
        const backtickedCode = query.match(/`([^`]+)`/g) || [];
        symbols.push(...backtickedCode.map(b => b.replace(/`/g, '')));

        return [...new Set(symbols)];
    }

    private determineContextTypes(query: string): ContextPlan['contextType'] {
        const types: ContextPlan['contextType'] = [];

        for (const [type, indicators] of Object.entries(this.contextTypeIndicators)) {
            if (indicators.some(ind => query.includes(ind))) {
                types.push(type as any);
            }
        }

        // Default to code if nothing specific
        if (types.length === 0) {
            types.push('code');
        }

        return types;
    }

    private getFilePatterns(contextTypes: ContextPlan['contextType'], activeFile?: string): string[] {
        const patterns: string[] = [];

        for (const type of contextTypes) {
            switch (type) {
                case 'code':
                    patterns.push('**/*.{ts,tsx,js,jsx,py,java,go,rs,c,cpp,h}');
                    break;
                case 'docs':
                    patterns.push('**/*.{md,txt,rst}');
                    patterns.push('**/README*');
                    break;
                case 'config':
                    patterns.push('**/*.{json,yaml,yml,toml}');
                    patterns.push('**/.*rc');
                    break;
                case 'tests':
                    patterns.push('**/*.{test,spec}.{ts,tsx,js,jsx}');
                    patterns.push('**/test/**');
                    patterns.push('**/__tests__/**');
                    break;
            }
        }

        // If we have an active file, prioritize similar files
        if (activeFile) {
            const ext = activeFile.split('.').pop();
            if (ext) {
                patterns.unshift(`**/*.${ext}`);
            }
        }

        return [...new Set(patterns)];
    }

    private getLimits(scope: ContextPlan['scope']): { maxFiles: number; maxContent: number } {
        switch (scope) {
            case 'minimal':
                return { maxFiles: 3, maxContent: 2000 };
            case 'file':
                return { maxFiles: 5, maxContent: 4000 };
            case 'folder':
                return { maxFiles: 15, maxContent: 3000 };
            case 'workspace':
                return { maxFiles: 30, maxContent: 2000 };
            default:
                return { maxFiles: 10, maxContent: 3000 };
        }
    }

    private determinePriority(query: string, scope: ContextPlan['scope']): ContextPlan['priority'] {
        const speedIndicators = ['quick', 'fast', 'brief', 'simple'];
        const accuracyIndicators = ['detailed', 'thorough', 'complete', 'all'];

        if (speedIndicators.some(ind => query.includes(ind)) || scope === 'minimal') {
            return 'speed';
        }
        if (accuracyIndicators.some(ind => query.includes(ind)) || scope === 'workspace') {
            return 'accuracy';
        }
        return 'balanced';
    }
}

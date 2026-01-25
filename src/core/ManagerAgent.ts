/**
 * ManagerAgent - Central orchestrator (System Brain) for Byte Coder
 * Analyzes intent, constructs adaptive pipelines, and routes to specialized agents
 */

import * as vscode from 'vscode';
import {
    BaseAgent,
    AgentOutput,
    ManagerDecision,
    PipelineStep,
    IntentType,
    Complexity,
    CONFIDENCE_THRESHOLDS,
    getDecisionAction
} from './AgentTypes';

export interface ManagerInput {
    query: string;
    activeFilePath?: string;
    hasSelection?: boolean;
    selectionText?: string;
    hasImage?: boolean;
    projectType?: string;
    recentErrors?: string[];
}

interface IntentPattern {
    keywords: string[];
    weight: number;
}

export class ManagerAgent extends BaseAgent<ManagerInput, ManagerDecision> {
    // Intent classification patterns
    private readonly INTENT_PATTERNS: Record<IntentType, IntentPattern> = {
        'Fix': {
            keywords: ['fix', 'bug', 'error', 'issue', 'broken', 'not working', 'fail', 'crash', 'wrong', 'debug'],
            weight: 1.0
        },
        'Build': {
            keywords: ['create', 'build', 'make', 'new', 'generate', 'implement', 'add', 'setup', 'initialize', 'start'],
            weight: 1.0
        },
        'Modify': {
            keywords: ['change', 'update', 'modify', 'edit', 'refactor', 'improve', 'optimize', 'enhance', 'replace'],
            weight: 0.9
        },
        'Explain': {
            keywords: ['explain', 'what', 'how', 'why', 'who', 'understand', 'describe', 'tell', 'show', 'mean', 'work'],
            weight: 0.8
        },
        'Design': {
            keywords: ['design', 'architect', 'plan', 'structure', 'organize', 'pattern', 'layout', 'schema'],
            weight: 0.9
        },
        'Audit': {
            keywords: ['review', 'check', 'audit', 'security', 'test', 'validate', 'analyze', 'scan', 'inspect'],
            weight: 0.85
        },
        'Expand': {
            keywords: ['full', 'entire', 'complete', 'rest', 'continue', 'more', 'expand', 'extend', 'give full'],
            weight: 0.95
        }
    };

    // Complexity indicators
    private readonly COMPLEXITY_INDICATORS = {
        complex: ['entire', 'all', 'whole', 'complete', 'full', 'application', 'system', 'project', 'codebase'],
        medium: ['feature', 'component', 'module', 'function', 'class', 'file', 'service'],
        simple: ['line', 'variable', 'name', 'typo', 'string', 'value', 'style', 'color']
    };

    constructor() {
        super({ name: 'Manager', timeout: 5000 });
    }

    async execute(input: ManagerInput): Promise<AgentOutput<ManagerDecision>> {
        const startTime = Date.now();

        try {
            // 1. Classify intent
            const { intent, intentConfidence } = this.classifyIntent(input.query);

            // 2. Assess complexity
            const complexity = this.assessComplexity(input);

            // 3. Calculate overall confidence
            const confidence = this.calculateConfidence(input, intent, intentConfidence);

            // 4. Determine action based on confidence
            const action = getDecisionAction(confidence);

            // 5. Construct pipeline based on intent and context
            const pipeline = this.constructPipeline(intent, complexity, input, action);

            // 6. Generate reasoning
            const reasoning = this.generateReasoning(intent, complexity, confidence, input);

            const decision: ManagerDecision = {
                intent,
                confidence,
                complexity,
                pipeline,
                safetyThreshold: complexity === 'complex' ? 0.8 : 0.65,
                reasoning,
                executionMode: this.shouldRunParallel(pipeline) ? 'parallel_with_dependencies' : 'sequential',
                userMessage: this.generateUserMessage(intent, confidence)
            };

            return this.createOutput('success', decision, confidence, startTime, {
                reasoning
            });

        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Classify the intent of the user query
     */
    private classifyIntent(query: string): { intent: IntentType; intentConfidence: number } {
        const lowerQuery = query.toLowerCase();
        const scores: Record<IntentType, number> = {
            'Fix': 0, 'Build': 0, 'Modify': 0, 'Explain': 0, 'Design': 0, 'Audit': 0, 'Expand': 0
        };

        // Score each intent based on keyword matches
        for (const [intent, pattern] of Object.entries(this.INTENT_PATTERNS)) {
            for (const keyword of pattern.keywords) {
                if (lowerQuery.includes(keyword)) {
                    scores[intent as IntentType] += pattern.weight;
                }
            }
        }

        // Boost Explain intent for direct questions
        if (/^(who|what|where|when|why|how)\s/.test(lowerQuery)) {
            scores['Explain'] += 1.5;
        }

        // Find the highest scoring intent
        let maxIntent: IntentType = 'Explain';
        let maxScore = 0;
        let totalScore = 0;

        for (const [intent, score] of Object.entries(scores)) {
            totalScore += score;
            if (score > maxScore) {
                maxScore = score;
                maxIntent = intent as IntentType;
            }
        }

        // Calculate confidence based on score distribution
        const intentConfidence = totalScore > 0
            ? Math.min(0.95, 0.5 + (maxScore / totalScore) * 0.45)
            : 0.5;

        return { intent: maxIntent, intentConfidence };
    }

    /**
     * Assess the complexity of the request
     */
    private assessComplexity(input: ManagerInput): Complexity {
        const query = input.query.toLowerCase();

        // Check for complexity indicators
        for (const indicator of this.COMPLEXITY_INDICATORS.complex) {
            if (query.includes(indicator)) return 'complex';
        }

        for (const indicator of this.COMPLEXITY_INDICATORS.medium) {
            if (query.includes(indicator)) return 'medium';
        }

        // Context-based complexity
        if (!input.activeFilePath && !input.hasSelection) {
            // No context = potentially complex (need to search)
            return 'medium';
        }

        if (input.hasSelection && input.selectionText && input.selectionText.length < 200) {
            return 'simple';
        }

        return 'medium';
    }

    /**
     * Calculate overall confidence based on multiple factors
     */
    private calculateConfidence(input: ManagerInput, intent: IntentType, intentConfidence: number): number {
        let confidence = intentConfidence;

        // Boost confidence for Expand intent (usually context-dependent and short)
        if (intent === 'Expand') {
            confidence += 0.3;
        }

        // Boost confidence if we have context
        if (input.activeFilePath) confidence += 0.1;
        if (input.hasSelection) confidence += 0.1;

        // Reduce confidence if query is vague
        if (input.query.split(' ').length < 3) confidence -= 0.1;

        // Reduce confidence if no project context
        if (!vscode.workspace.workspaceFolders?.length) confidence -= 0.2;

        return Math.max(0.1, Math.min(0.99, confidence));
    }

    /**
     * Construct the appropriate pipeline based on intent and context
     */
    private constructPipeline(
        intent: IntentType,
        complexity: Complexity,
        input: ManagerInput,
        action: string
    ): PipelineStep[] {
        const pipeline: PipelineStep[] = [];
        let step = 1;

        // DISCOVERY PHASE (for low confidence or vague queries)
        if (action === 'discover' || action === 'verify' || action === 'handoff') {
            pipeline.push({
                step: step++,
                agent: 'IntentAnalyzer',
                parallel: false,
                required: true
            });
        }

        // EXPAND PHASE
        if (intent === 'Expand') {
            pipeline.push({
                step: step++,
                agent: 'ContentRetriever',
                parallel: false,
                required: true
            });
            
            // Also search context for conversational expansion
            if (input.query.toLowerCase().includes('about') || input.query.toLowerCase().includes('tell me')) {
                 pipeline.push({
                    step: step++,
                    agent: 'ContextSearch',
                    parallel: true,
                    args: { 
                        lookForPreviousFixes: false,
                        query: input.query
                    }
                });
            }
        }

        // SEARCH PHASE
        // We now allow search even for 'simple' queries if they might be general knowledge questions
        if (intent !== 'Expand') {
            pipeline.push({
                step: step++,
                agent: 'FileSearch',
                parallel: true,
                required: false, // Make it optional for simple queries
                condition: 'needs_file_search', // Logic to be handled by engine or skipped if empty
                args: { query: input.query, activeFile: input.activeFilePath }
            });

            pipeline.push({
                step: step++,
                agent: 'FilePartSearcher',
                parallel: true,
                dependency: step - 1,
                args: { refineSearch: true }
            });

            // Add context search (Knowledge Base + History)
            // Always run this for knowledge retrieval
            pipeline.push({
                step: step++,
                agent: 'ContextSearch',
                parallel: true,
                args: { 
                    lookForPreviousFixes: intent === 'Fix',
                    query: input.query
                }
            });

            // Analyze Context (if files were found)
            pipeline.push({
                step: step++,
                agent: 'ContextAnalyzer',
                parallel: false, // Must run after FileSearch
                dependency: step - 3 // Depends on FileSearch (approximate, PipelineEngine handles exact dependency logic via results)
            });
        }

        // VISION PHASE (if image attached)
        if (input.hasImage) {
            pipeline.push({
                step: step++,
                agent: 'Vision',
                parallel: false,
                required: true,
                condition: 'image_attached'
            });
        }

        // PLANNING PHASE (for complex or build intents)
        if (intent === 'Build' || intent === 'Design' || complexity === 'complex') {
            const processPlannerStep = step;
            pipeline.push({
                step: step++,
                agent: 'ProcessPlanner',
                parallel: false
            });

            const codePlannerStep = step;
            pipeline.push({
                step: step++,
                agent: 'CodePlanner',
                parallel: false,
                dependency: processPlannerStep
            });

            pipeline.push({
                step: step++,
                agent: 'TaskPlanner',
                parallel: false,
                dependency: codePlannerStep
            });
        }

        // EXECUTION PHASE (for modify/fix/build)
        if (intent !== 'Explain' && intent !== 'Audit' && intent !== 'Expand') {
            // Create checkpoint before modifications
            pipeline.push({
                step: step++,
                agent: 'VersionController',
                parallel: false,
                required: true,
                args: { action: 'create_checkpoint' }
            });

            // Run CodeGenerator for Build, Modify, and Fix
            if (intent === 'Build' || intent === 'Modify' || intent === 'Fix') {
                pipeline.push({
                    step: step++,
                    agent: 'CodeGenerator',
                    parallel: false
                });

                pipeline.push({
                    step: step++,
                    agent: 'CommandGenerator',
                    parallel: false,
                    args: { generateStructure: intent === 'Build' }
                });
            }

            pipeline.push({
                step: step++,
                agent: 'CodeModifier',
                parallel: false,
                required: true
            });

            pipeline.push({
                step: step++,
                agent: 'Executor',
                parallel: false,
                required: true,
                args: { runTests: true }
            });
        }

        // DOCUMENTATION PHASE (for build or complex changes)
        if (intent === 'Build' || complexity === 'complex') {
            pipeline.push({
                step: step++,
                agent: 'DocWriter',
                parallel: false
            });
        }

        return pipeline;
    }

    /**
     * Determine if pipeline steps can run in parallel
     */
    private shouldRunParallel(pipeline: PipelineStep[]): boolean {
        return pipeline.some(step => step.parallel === true);
    }

    /**
     * Generate human-readable reasoning for the decision
     */
    private generateReasoning(
        intent: IntentType,
        complexity: Complexity,
        confidence: number,
        input: ManagerInput
    ): string {
        const parts: string[] = [];

        parts.push(`Detected intent: ${intent} (${(confidence * 100).toFixed(0)}% confidence)`);
        parts.push(`Complexity assessment: ${complexity}`);

        if (input.activeFilePath) {
            parts.push(`Working in: ${input.activeFilePath.split('/').pop()}`);
        }

        if (input.hasSelection) {
            parts.push('Using selected code as context');
        }

        if (confidence < CONFIDENCE_THRESHOLDS.VERIFY) {
            parts.push('Low confidence - initiating discovery phase');
        }

        return parts.join('. ');
    }

    /**
     * Generate a user-facing message about current processing
     */
    private generateUserMessage(intent: IntentType, confidence: number): string {
        const messages: Record<IntentType, string> = {
            'Fix': 'Analyzing code and searching for the issue...',
            'Build': 'Planning project structure and dependencies...',
            'Modify': 'Locating relevant code sections...',
            'Explain': 'Gathering context to explain...',
            'Design': 'Analyzing requirements and architecting solution...',
            'Audit': 'Scanning codebase for issues...',
            'Expand': 'Retrieving full content...'
        };

        return messages[intent] || 'Processing your request...';
    }
}

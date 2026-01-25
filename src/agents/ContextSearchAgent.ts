/**
 * ContextSearchAgent - Memory fabric integrator for Byte Coder
 * Manages session context, project history, and pattern matching
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent, AgentOutput, ContextMemory } from '../core/AgentTypes';

export interface ContextSearchInput {
    query: string;
    lookForPreviousFixes?: boolean;
    maxResults?: number;
    recencyDays?: number;
}

export interface ContextSearchResult {
    memories: ContextMemory[];
    conversationContext: string[];
    relevantPatterns: string[];
    summary: string;
}

export class ContextSearchAgent extends BaseAgent<ContextSearchInput, ContextSearchResult> {
    // In-memory session context (cleared on restart)
    private sessionContext: Map<string, any> = new Map();
    private conversationHistory: { role: 'user' | 'assistant'; content: string; timestamp: Date }[] = [];

    // Maximum context items to keep
    private readonly MAX_CONVERSATION_TURNS = 10;
    private readonly MAX_MEMORIES = 50;

    // Relevance scoring weights
    private readonly WEIGHTS = {
        relevance: 0.7,
        recency: 0.2,
        specificity: 0.1
    };

    // Synonyms for semantic matching
    private readonly SYNONYMS: { [key: string]: string[] } = {
        'creator': ['founder', 'owner', 'author', 'maker', 'developer', 'ajmal', 'ajmal uk'],
        'created': ['founded', 'made', 'built', 'developed', 'founder', 'creator', 'origin'],
        'create': ['build', 'develop', 'make', 'found', 'originate'],
        'maker': ['founder', 'creator', 'owner', 'developer'],
        'owner': ['founder', 'creator', 'holder', 'proprietor', 'ajmal'],
        'who': ['founder', 'creator', 'owner', 'developer', 'person', 'identity'],
        'identity': ['who', 'creator', 'founder', 'owner', 'developer'],
        'company': ['uthakkan', 'studio', 'business', 'organization', 'firm'],
        'uthakkan': ['company', 'studio', 'creator', 'founder'],
        'contact': ['email', 'phone', 'address', 'reach', 'mail', 'telegram', 'whatsapp'],
        'mail': ['email', 'inbox', 'gmail'],
        'site': ['website', 'url', 'link', 'page', 'portal'],
        'web': ['website', 'url', 'internet', 'online'],
        'link': ['url', 'website', 'address'],
        'job': ['career', 'hiring', 'freelance', 'work', 'project'],
        'hire': ['freelance', 'job', 'work', 'gig']
    };

    constructor(private context?: vscode.ExtensionContext) {
        super({ name: 'ContextSearch', timeout: 5000 });
    }

    async execute(input: ContextSearchInput): Promise<AgentOutput<ContextSearchResult>> {
        const startTime = Date.now();

        try {
            const memories: ContextMemory[] = [];

            // 1. Search session context
            const sessionMatches = this.searchSessionContext(input.query);
            memories.push(...sessionMatches);

            // 2. Search conversation history
            const conversationMatches = this.searchConversationHistory(input.query);

            // 3. Search workspace state (persistent storage)
            if (this.context) {
                const workspaceMemories = await this.searchWorkspaceState(input);
                memories.push(...workspaceMemories);
            }

            // 4. Search Knowledge Base (Static Data)
            const knowledgeMemories = await this.searchKnowledgeBase(input.query);
            memories.push(...knowledgeMemories);

            // 5. Find relevant patterns
            const patterns = this.findRelevantPatterns(input.query);

            // 6. Score and sort memories
            const scoredMemories = this.scoreMemories(memories, input.query, input.recencyDays ?? 7);
            const topMemories = scoredMemories.slice(0, input.maxResults ?? 5);

            // 6. Build summary
            const summary = this.buildSummary(topMemories, conversationMatches);

            const result: ContextSearchResult = {
                memories: topMemories,
                conversationContext: conversationMatches,
                relevantPatterns: patterns,
                summary
            };

            const confidence = topMemories.length > 0
                ? Math.min(0.95, 0.5 + topMemories[0].relevance * 0.45)
                : 0.3;

            return this.createOutput('success', result, confidence, startTime, {
                reasoning: `Found ${topMemories.length} relevant memories, ${conversationMatches.length} conversation matches`
            });

        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Search session context for matches
     */
    private searchSessionContext(query: string): ContextMemory[] {
        const memories: ContextMemory[] = [];
        const queryTerms = this.extractTerms(query);

        for (const [key, value] of this.sessionContext) {
            const relevance = this.calculateTermRelevance(key, queryTerms);
            if (relevance > 0.3) {
                memories.push({
                    type: 'file_history',
                    date: new Date(),
                    summary: `Session: \`${key}\``,
                    relevance,
                    data: value
                });
            }
        }

        return memories;
    }

    /**
     * Search conversation history
     */
    private searchConversationHistory(query: string): string[] {
        const queryTerms = this.extractTerms(query);
        const matches: string[] = [];

        for (const turn of this.conversationHistory) {
            const content = turn.content.toLowerCase();
            const hasMatch = queryTerms.some(term => content.includes(term));

            if (hasMatch) {
                matches.push(`[${turn.role}]: ${turn.content.slice(0, 200)}...`);
            }
        }

        return matches.slice(-5); // Return last 5 matches
    }

    /**
     * Search workspace state for persistent memories
     */
    private async searchWorkspaceState(input: ContextSearchInput): Promise<ContextMemory[]> {
        if (!this.context) return [];

        const memories: ContextMemory[] = [];

        // Get stored memories from extension state
        const storedMemories = this.context.workspaceState.get<ContextMemory[]>('byteAI.memories', []);

        const queryTerms = this.extractTerms(input.query);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - (input.recencyDays ?? 7));

        for (const memory of storedMemories) {
            const memoryDate = new Date(memory.date);
            if (memoryDate < cutoffDate) continue;

            const relevance = this.calculateTermRelevance(memory.summary, queryTerms);
            if (relevance > 0.2) {
                memories.push({
                    ...memory,
                    relevance
                });
            }
        }

        // If looking for previous fixes, boost fix-type memories
        if (input.lookForPreviousFixes) {
            for (const memory of memories) {
                if (memory.type === 'previous_fix') {
                    memory.relevance *= 1.5;
                }
            }
        }

        return memories;
    }

    /**
     * Find relevant code patterns for the query
     */
    private findRelevantPatterns(query: string): string[] {
        const patterns: string[] = [];
        const lowerQuery = query.toLowerCase();

        // Common pattern mappings
        const patternMap: Record<string, string[]> = {
            'auth': ['JWT', 'OAuth', 'session management', 'token refresh'],
            'login': ['authentication flow', 'credential validation', 'session creation'],
            'api': ['REST endpoints', 'request handling', 'response formatting'],
            'database': ['ORM patterns', 'connection pooling', 'query optimization'],
            'react': ['component lifecycle', 'hooks', 'state management'],
            'test': ['unit testing', 'mocking', 'test fixtures'],
            'error': ['error handling', 'try-catch', 'error boundaries'],
            'performance': ['caching', 'lazy loading', 'memoization']
        };

        for (const [key, suggestions] of Object.entries(patternMap)) {
            if (lowerQuery.includes(key)) {
                patterns.push(...suggestions);
            }
        }

        return [...new Set(patterns)].slice(0, 5);
    }

    /**
     * Search static knowledge base (JSON)
     */
    private async searchKnowledgeBase(query: string): Promise<ContextMemory[]> {
        const memories: ContextMemory[] = [];
        const queryTerms = this.extractTerms(query);

        try {
            let knowledgePath: string | undefined;

            // 1. Priority: Extension root data folder (packaged)
            if (this.context) {
                const extensionDataPath = path.join(this.context.extensionPath, 'data', 'knowledge', 'uthakkan_data.json');
                if (fs.existsSync(extensionDataPath)) {
                    knowledgePath = extensionDataPath;
                }
            }

            // 2. Fallback: Workspace root (for development)
            if (!knowledgePath) {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (workspaceRoot) {
                    // Check new location first
                    const devPathNew = path.join(workspaceRoot, 'data', 'knowledge', 'uthakkan_data.json');
                    const devPathOld = path.join(workspaceRoot, 'src', 'data', 'knowledge', 'uthakkan_data.json');
                    
                    if (fs.existsSync(devPathNew)) {
                        knowledgePath = devPathNew;
                    } else if (fs.existsSync(devPathOld)) {
                        knowledgePath = devPathOld;
                    } else {
                        // Fallback: Infer knowledge from package.json if standard KB missing
                        const packageJsonPath = path.join(workspaceRoot, 'package.json');
                        if (fs.existsSync(packageJsonPath)) {
                            try {
                                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                                const projectKnowledge = {
                                    name: pkg.name,
                                    scripts: pkg.scripts,
                                    dependencies: { ...pkg.dependencies, ...pkg.devDependencies },
                                    type: 'inferred_project_context'
                                };
                                
                                // Inject inferred knowledge
                                memories.push({
                                    type: 'knowledge',
                                    date: new Date(),
                                    summary: `Project Context: ${pkg.name} (${Object.keys(pkg.dependencies || {}).join(', ')})`,
                                    relevance: 0.8,
                                    data: projectKnowledge
                                });
                                
                                // Also search scripts for query relevance
                                if (pkg.scripts) {
                                    for (const [script, cmd] of Object.entries(pkg.scripts)) {
                                         const scriptRelevance = this.calculateTermRelevance(script, queryTerms);
                                         if (scriptRelevance > 0.4) {
                                             memories.push({
                                                 type: 'knowledge',
                                                 date: new Date(),
                                                 summary: `Script: npm run ${script} -> ${cmd}`,
                                                 relevance: scriptRelevance * 1.3,
                                                 data: { script, cmd }
                                             });
                                         }
                                    }
                                }
                            } catch (e) {
                                // Ignore malformed package.json
                            }
                        }
                    }
                }
            }

            // 2. If not found, search the workspace for the file
            if (!knowledgePath) {
                const files = await vscode.workspace.findFiles('**/uthakkan_data.json', '**/node_modules/**', 1);
                if (files.length > 0) {
                    knowledgePath = files[0].fsPath;
                }
            }

            if (!knowledgePath || !fs.existsSync(knowledgePath)) {
                // Silent return if not found - might not be a UTHAKKAN project
                return [];
            }

            const data = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));

            // Recursive search function
            const searchObj = (obj: any, prefix: string = '') => {
                if (typeof obj === 'string') {
                    const relevance = this.calculateTermRelevance(obj, queryTerms);
                    if (relevance > 0.4) { // Higher threshold for static knowledge
                        memories.push({
                            type: 'knowledge',
                            date: new Date(), // Always fresh
                            summary: `${prefix}: ${obj}`,
                            relevance: relevance * 1.2, // Boost knowledge relevance
                            data: { source: 'knowledge_base' }
                        });
                    }
                } else if (Array.isArray(obj)) {
                    obj.forEach((item, index) => searchObj(item, `${prefix}[${index}]`));
                } else if (typeof obj === 'object' && obj !== null) {
                    for (const [key, value] of Object.entries(obj)) {
                        // Boost relevance if key matches query
                        const keyRelevance = this.calculateTermRelevance(key, queryTerms);
                        const newPrefix = prefix ? `${prefix}.${key}` : key;

                        // Lowered threshold to 0.5 to catch partial matches like "products" in "what are products"
                        if (keyRelevance >= 0.5) {
                            // If key matches strongly, include the whole object summary
                            const contentStr = typeof value === 'string' ? value : JSON.stringify(value).slice(0, 200);
                            memories.push({
                                type: 'knowledge',
                                date: new Date(),
                                summary: `${newPrefix}: ${contentStr}`,
                                relevance: keyRelevance * 1.5,
                                data: value
                            });
                        }

                        searchObj(value, newPrefix);
                    }
                }
            };

            searchObj(data, 'UTHAKKAN');

        } catch (error) {
            console.error('Error searching knowledge base:', error);
        }

        return memories;
    }

    /**
     * Score memories by relevance, recency, and specificity
     */
    private scoreMemories(memories: ContextMemory[], query: string, recencyDays: number): ContextMemory[] {
        const now = Date.now();
        const msPerDay = 24 * 60 * 60 * 1000;

        return memories
            .map(memory => {
                const daysAgo = (now - new Date(memory.date).getTime()) / msPerDay;
                const recencyScore = Math.max(0, 1 - (daysAgo / recencyDays));
                const specificityScore = memory.filePath ? 1 : 0.5;

                const finalScore =
                    memory.relevance * this.WEIGHTS.relevance +
                    recencyScore * this.WEIGHTS.recency +
                    specificityScore * this.WEIGHTS.specificity;

                return { ...memory, relevance: finalScore };
            })
            .sort((a, b) => b.relevance - a.relevance);
    }

    /**
     * Extract searchable terms from query
     */
    private extractTerms(query: string): string[] {
        // Extended stop words list to filter out question words and pronouns for better keyword density
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'this', 'that', 'it', 'its', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
            'your', 'my', 'our', 'their', 'you', 'me']);

        return query
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));
    }

    /**
     * Calculate relevance of text to query terms
     */
    private calculateTermRelevance(text: string, terms: string[]): number {
        if (!text) return 0;
        const lowerText = text.toLowerCase();
        let matches = 0;

        // Identity query detection for boosting
        const identityTerms = ['who', 'created', 'owner', 'founder', 'creator', 'uthakkan', 'ajmal'];
        const isIdentityQuery = terms.some(t => identityTerms.includes(t));

        for (const term of terms) {
            let termMatched = false;

            // 1. Direct match
            if (lowerText.includes(term)) {
                termMatched = true;
            }
            // 2. Synonym match
            else {
                const synonyms = this.SYNONYMS[term] || [];
                for (const syn of synonyms) {
                    if (lowerText.includes(syn)) {
                        termMatched = true;
                        break;
                    }
                }
            }

            if (termMatched) {
                matches++;
            }
        }

        let relevance = terms.length > 0 ? matches / terms.length : 0;

        // Boost identity relevance
        if (isIdentityQuery && relevance > 0) {
            relevance *= 1.5;
        }

        return Math.min(1.0, relevance);
    }

    /**
     * Build a summary of the search results
     */
    private buildSummary(memories: ContextMemory[], conversations: string[]): string {
        const parts: string[] = [];

        if (memories && memories.length > 0) {
            const types = [...new Set(memories.map(m => m.type))];
            parts.push(`Found ${memories.length} relevant memories (${types.join(', ')})`);
        }

        if (conversations.length > 0) {
            parts.push(`${conversations.length} related conversation turns`);
        }

        return parts.join('. ') || 'No relevant context found';
    }

    // === PUBLIC API FOR MANAGING CONTEXT ===

    /**
     * Add a conversation turn to history
     */
    addConversationTurn(role: 'user' | 'assistant', content: string): void {
        this.conversationHistory.push({
            role,
            content,
            timestamp: new Date()
        });

        // Trim to max size
        if (this.conversationHistory.length > this.MAX_CONVERSATION_TURNS) {
            this.conversationHistory = this.conversationHistory.slice(-this.MAX_CONVERSATION_TURNS);
        }
    }

    /**
     * Store a memory for future reference
     */
    async storeMemory(memory: Omit<ContextMemory, 'date'>): Promise<void> {
        if (!this.context) return;

        const memories = this.context.workspaceState.get<ContextMemory[]>('byteAI.memories', []);

        memories.push({
            ...memory,
            date: new Date()
        });

        // Trim to max size
        const trimmed = memories.slice(-this.MAX_MEMORIES);
        await this.context.workspaceState.update('byteAI.memories', trimmed);
    }

    /**
     * Set session context
     */
    setSessionContext(key: string, value: any): void {
        this.sessionContext.set(key, value);
    }

    /**
     * Get session context
     */
    getSessionContext(key: string): any {
        return this.sessionContext.get(key);
    }

    /**
     * Clear all context
     */
    clear(): void {
        this.sessionContext.clear();
        this.conversationHistory = [];
    }

    /**
     * Get conversation summary for AI context
     */
    getConversationSummary(): string {
        if (this.conversationHistory.length === 0) {
            return 'No previous conversation context.';
        }

        const recent = this.conversationHistory.slice(-3);
        return recent.map(t => `${t.role}: ${t.content.slice(0, 100)}...`).join('\n');
    }
}

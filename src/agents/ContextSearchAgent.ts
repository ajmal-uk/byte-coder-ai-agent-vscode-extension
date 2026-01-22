/**
 * ContextSearchAgent - Memory fabric integrator for Byte Coder
 * Manages session context, project history, and pattern matching
 */

import * as vscode from 'vscode';
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

            // 4. Find relevant patterns
            const patterns = this.findRelevantPatterns(input.query);

            // 5. Score and sort memories
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
                    summary: `Session: ${key}`,
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
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'what', 'how', 'why', 'when', 'where', 'which', 'who', 'this', 'that',
            'it', 'its', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from']);

        return query
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));
    }

    /**
     * Calculate relevance score based on term matches
     */
    private calculateTermRelevance(text: string, terms: string[]): number {
        const lowerText = text.toLowerCase();
        let matches = 0;

        for (const term of terms) {
            if (lowerText.includes(term)) {
                matches++;
            }
        }

        return terms.length > 0 ? matches / terms.length : 0;
    }

    /**
     * Build a summary of the search results
     */
    private buildSummary(memories: ContextMemory[], conversations: string[]): string {
        const parts: string[] = [];

        if (memories.length > 0) {
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

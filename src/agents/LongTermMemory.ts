/**
 * LongTermMemory - Cross-session memory agent for Byte Coder
 * Extracts entities from conversations and stores them persistently
 * Enables remembering information across different chat sessions
 */

import * as vscode from 'vscode';

export interface MemoryEntry {
    id: string;
    type: 'fact' | 'preference' | 'project_info' | 'user_info' | 'code_pattern';
    key: string;
    value: string;         // e.g., "John", "TypeScript"
    source: string;        // Session ID where learned
    timestamp: number;
    confidence: number;    // 0-1 how confident we are in this memory
    lastAccessed?: number; // For LRU-style relevance
}

export interface MemorySearchResult {
    entries: MemoryEntry[];
    contextString: string;
    query: string;
}

// Entity extraction patterns
interface ExtractionPattern {
    regex: RegExp;
    type: MemoryEntry['type'];
    keyExtractor: (match: RegExpMatchArray) => string;
    valueExtractor: (match: RegExpMatchArray) => string;
    confidence: number;
}

export class LongTermMemory {
    private static readonly STORAGE_KEY = 'byteAI.longTermMemory';
    private static readonly MAX_MEMORIES = 200;
    private static readonly SESSION_STORAGE_KEY = 'byteAI_sessions';

    // Patterns for extracting entities from conversations
    private readonly extractionPatterns: ExtractionPattern[] = [
        // User identity patterns
        {
            regex: /(?:my name is|i'm called|call me|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
            type: 'user_info',
            keyExtractor: () => 'user_name',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.95
        },
        {
            regex: /(?:my (?:nick)?name is|they call me)\s+["']?(\w+)["']?/gi,
            type: 'user_info',
            keyExtractor: () => 'user_nickname',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.9
        },
        // Preferences
        {
            regex: /(?:i prefer|i like using|my favorite (?:language|framework|tool) is)\s+(\w+(?:\s+\w+)?)/gi,
            type: 'preference',
            keyExtractor: () => 'preferred_tool',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.85
        },
        {
            regex: /(?:always use|prefer to use|usually use)\s+(\w+)\s+(?:for|when)/gi,
            type: 'preference',
            keyExtractor: () => 'tool_preference',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.8
        },
        // Project info
        {
            regex: /(?:working on|building|developing)\s+(?:a |an |the )?(\w+(?:\s+\w+){0,3})\s+(?:project|app|application|website|system)/gi,
            type: 'project_info',
            keyExtractor: () => 'current_project',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.85
        },
        {
            regex: /(?:the project is called|project name is)\s+["']?([^"'\n]+)["']?/gi,
            type: 'project_info',
            keyExtractor: () => 'project_name',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.9
        },
        // Technical preferences
        {
            regex: /(?:use|using)\s+(typescript|javascript|python|java|go|rust|php|ruby)\s+(?:for this|in this|here)/gi,
            type: 'preference',
            keyExtractor: () => 'coding_language',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.9
        },
        // Contact/email
        {
            regex: /(?:my email is|email me at|contact me at)\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
            type: 'user_info',
            keyExtractor: () => 'user_email',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.95
        },
        // Company/organization
        // Relationships
        {
            regex: /(?:my|the) (?:girlfriend|boyfriend|partner|spouse|wife|husband|friend)(?:'s)? (?:name is|is called|is named)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
            type: 'user_info',
            keyExtractor: () => 'relationship_name',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.9
        },
        {
            regex: /(?:girlfriend|boyfriend|partner|spouse|wife|husband|friend) is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
            type: 'user_info',
            keyExtractor: () => 'relationship_name',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.85
        },
        // General Definitions / Facts
        {
            regex: /(?:the) (?:api key|token|password|secret|endpoint|url) (?:is|for) (.+)/gi,
            type: 'fact',
            keyExtractor: (m) => 'defined_fact',
            valueExtractor: (m) => m[1].trim(),
            confidence: 0.9
        }
    ];

    constructor(private context: vscode.ExtensionContext) { }

    /**
     * Extract entities from a message and store them
     */
    async extractAndStore(message: string, sessionId: string): Promise<MemoryEntry[]> {
        const extracted: MemoryEntry[] = [];

        for (const pattern of this.extractionPatterns) {
            const matches = message.matchAll(pattern.regex);
            for (const match of matches) {
                const key = pattern.keyExtractor(match);
                const value = pattern.valueExtractor(match);

                if (value && value.length > 1) {
                    const entry: MemoryEntry = {
                        id: `${key}_${Date.now()}`,
                        type: pattern.type,
                        key,
                        value,
                        source: sessionId,
                        timestamp: Date.now(),
                        confidence: pattern.confidence
                    };

                    extracted.push(entry);
                    await this.storeMemory(entry);
                }
            }
        }

        return extracted;
    }

    /**
     * Store a memory entry (updates if same key exists with higher confidence)
     */
    async storeMemory(entry: MemoryEntry): Promise<void> {
        const memories = this.getMemories();

        // Check for existing entry with same key AND similar value (fuzzy check could occur here, but rigid for now)
        // Or check if we already have a memory for "relationship_name" that contradicts? 
        // For now, simpler: key + value matching logic or just key. 
        // We often want multiple facts. Let's rely on unique IDs unless key is unique-by-definition (like user_name).

        const existingIdx = memories.findIndex(m => m.key === entry.key && m.value === entry.value);
        if (existingIdx !== -1) {
            // Already known, just update timestamp
            memories[existingIdx].timestamp = Date.now();
            memories[existingIdx].confidence = Math.max(memories[existingIdx].confidence, entry.confidence);
        } else {
            // Check if we have a conflicting singleton (like user_name)
            const singletonKeys = ['user_name', 'user_email'];
            if (singletonKeys.includes(entry.key)) {
                const singletonIdx = memories.findIndex(m => m.key === entry.key);
                if (singletonIdx !== -1) {
                    memories[singletonIdx] = entry; // Overwrite
                } else {
                    memories.push(entry);
                }
            } else {
                memories.push(entry);
            }
        }

        // Trim to max size (remove oldest, lowest confidence)
        if (memories.length > LongTermMemory.MAX_MEMORIES) {
            memories.sort((a, b) => {
                const scoreA = a.confidence + (a.lastAccessed || a.timestamp) / Date.now();
                const scoreB = b.confidence + (b.lastAccessed || b.timestamp) / Date.now();
                return scoreB - scoreA;
            });
            memories.length = LongTermMemory.MAX_MEMORIES;
        }

        await this.context.globalState.update(LongTermMemory.STORAGE_KEY, memories);
    }

    /**
     * Get all stored memories
     */
    getMemories(): MemoryEntry[] {
        return this.context.globalState.get<MemoryEntry[]>(LongTermMemory.STORAGE_KEY, []);
    }

    /**
     * Search memories by query
     */
    searchMemories(query: string): MemorySearchResult {
        const memories = this.getMemories();
        const queryTerms = this.extractTerms(query);
        const queryLower = query.toLowerCase();

        // Check for specific question patterns
        const questionPatterns: { regex: RegExp; keys: string[] }[] = [
            { regex: /what(?:'s| is) my name/i, keys: ['user_name', 'user_nickname'] },
            { regex: /who am i/i, keys: ['user_name', 'user_nickname', 'company'] },
            { regex: /what (?:do i|language|tool)/i, keys: ['preferred_tool', 'coding_language', 'tool_preference'] },
            { regex: /what(?:'s| is) (?:my |the )?project/i, keys: ['project_name', 'current_project'] },
            { regex: /(?:my |what(?:'s| is) my )?email/i, keys: ['user_email'] },
            { regex: /where do i work|my company/i, keys: ['company'] },
            { regex: /(?:girlfriend|boyfriend|partner|friend) name/i, keys: ['relationship_name'] }
        ];

        let targetKeys: string[] = [];
        for (const pattern of questionPatterns) {
            if (pattern.regex.test(query)) {
                targetKeys = pattern.keys;
                break;
            }
        }

        // Score each memory
        const scored = memories.map(memory => {
            let score = 0;

            // Direct key match (highest priority)
            if (targetKeys.includes(memory.key)) {
                score += 100;
            }

            // Term matches
            const memoryText = `${memory.key} ${memory.value} ${memory.type}`.toLowerCase();
            let matches = 0;
            for (const term of queryTerms) {
                if (memoryText.includes(term)) {
                    score += 15; // Increased weight per term
                    matches++;
                }
            }

            // Boost if many terms match
            if (matches >= queryTerms.length && queryTerms.length > 0) score += 30;

            // Recency boost
            const daysSince = (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 5 - daysSince * 0.1);

            // Confidence boost
            score += memory.confidence * 10;

            return { memory, score };
        });

        // Filter and sort
        const relevant = scored
            .filter(s => s.score > 20) // Raised threshold slightly
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(s => s.memory);

        // Update lastAccessed for returned memories
        for (const mem of relevant) {
            mem.lastAccessed = Date.now();
        }

        // Build context string
        const contextString = this.buildContextString(relevant, query);

        return {
            entries: relevant,
            contextString,
            query
        };
    }

    /**
     * Search all past sessions for relevant information
     */
    async searchAllSessions(query: string): Promise<string[]> {
        const sessions = this.context.globalState.get<any[]>(LongTermMemory.SESSION_STORAGE_KEY, []);
        const queryTerms = this.extractTerms(query);
        const results: { content: string; score: number; sessionTitle: string }[] = [];

        // Pre-compute lower case query for phrase matching
        const queryLower = query.toLowerCase();

        for (const session of sessions) {
            if (!session.history) continue;

            for (const msg of session.history) {
                // Skip assistant messages if short/generic, but keep user messages and long assistant explanations
                if (msg.role === 'assistant' && msg.text.length < 50) continue;

                const content = msg.text?.toLowerCase() || '';
                let score = 0;
                let matchedTerms = 0;

                for (const term of queryTerms) {
                    if (content.includes(term)) {
                        score += 10;
                        matchedTerms++;
                    }
                }

                // Boost for multiple term matches (AND logic preference)
                if (matchedTerms > 0) {
                    score += Math.pow(matchedTerms, 2) * 5;
                }

                // Boost for exact phrase match
                if (queryTerms.length > 1 && content.includes(queryLower)) {
                    score += 100;
                }

                if (score > 15) { // Minimum threshold
                    results.push({
                        content: msg.text?.slice(0, 400) + (msg.text.length > 400 ? '...' : '') || '',
                        score,
                        sessionTitle: session.title || 'Untitled'
                    });
                }
            }
        }

        // Sort by score and return top matches
        // Filter duplicates (by content similarity) to avoid noise
        const uniqueResults: { content: string; score: number; sessionTitle: string }[] = [];
        const seenContent = new Set<string>();

        results.sort((a, b) => b.score - a.score);

        for (const r of results) {
            const signature = r.content.slice(0, 50); // simplified dedup
            if (!seenContent.has(signature)) {
                seenContent.add(signature);
                uniqueResults.push(r);
            }
            if (uniqueResults.length >= 5) break;
        }

        return uniqueResults.map(r => `[From "${r.sessionTitle}"]: ${r.content}`);
    }

    /**
     * Get relevant context for a query (combines memories + session search)
     */
    async getRelevantContext(query: string): Promise<string> {
        let combinedContext = "";

        // 1. Structured Memories (Regex Patterns)
        const memoryResult = this.searchMemories(query);
        if (memoryResult.entries.length > 0) {
            combinedContext += memoryResult.contextString + "\n";
        }

        // 2. Unstructured History Search (Deep Search)
        // Always run this to catch things that patterns miss
        const sessionMatches = await this.searchAllSessions(query);
        if (sessionMatches.length > 0) {
            combinedContext += `\n--- RELEVANT PAST CONVERSATIONS ---\n${sessionMatches.join('\n\n')}\n--- END ---\n`;
        }

        return combinedContext;
    }

    /**
     * Build a context string from memories
     */
    private buildContextString(memories: MemoryEntry[], query: string): string {
        if (memories.length === 0) return '';

        const lines = ['\n--- REMEMBERED INFORMATION ---'];

        for (const mem of memories) {
            const typeLabel = this.getTypeLabel(mem.type);
            lines.push(`• ${typeLabel}: ${mem.key.replace(/_/g, ' ')} = "${mem.value}"`);
        }

        lines.push('--- END REMEMBERED INFO ---\n');
        return lines.join('\n');
    }

    private getTypeLabel(type: MemoryEntry['type']): string {
        const labels: Record<string, string> = {
            'user_info': '👤 User',
            'preference': '⚙️ Preference',
            'project_info': '📁 Project',
            'fact': '📝 Fact',
            'code_pattern': '💻 Pattern'
        };
        return labels[type] || type;
    }

    private extractTerms(query: string): string[] {
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'have', 'has', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'what', 'how', 'why', 'when', 'where', 'which', 'who', 'this', 'that',
            'it', 'its', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'my']);

        return query
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));
    }

    async clearMemories(): Promise<void> {
        await this.context.globalState.update(LongTermMemory.STORAGE_KEY, []);
    }

    getStats(): { total: number; byType: Record<string, number> } {
        const memories = this.getMemories();
        const byType: Record<string, number> = {};

        for (const mem of memories) {
            byType[mem.type] = (byType[mem.type] || 0) + 1;
        }

        return { total: memories.length, byType };
    }
}

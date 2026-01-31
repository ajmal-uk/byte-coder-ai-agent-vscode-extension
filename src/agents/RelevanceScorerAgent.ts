/**
 * RelevanceScorerAgent - Multi-factor relevance scoring sub-agent
 * Ranks and scores extracted code chunks for optimal context
 */

import { SearchIntent } from './IntentAnalyzer';
import { FileMatch } from './FileFinderAgent';
import { ExtractionResult, CodeChunk } from './CodeExtractorAgent';

export interface ScoredResult {
    filePath: string;
    relativePath: string;
    language: string;
    overallScore: number;
    chunks: ScoredChunk[];
    extractionMode: string;
    summary: {
        totalLines: number;
        includedLines: number;
        topMatches: string[];
    };
}

export interface ScoredChunk extends CodeChunk {
    finalScore: number;
    scoreBreakdown: {
        keywordScore: number;
        symbolScore: number;
        structureScore: number;
        positionScore: number;
    };
}

export class RelevanceScorerAgent {
    private readonly MAX_TOTAL_CHARS = 25000;  // Max total context size
    private readonly MAX_CHARS_PER_FILE = 8000; // Max per file

    // Weights for different scoring factors
    private readonly WEIGHTS = {
        keyword: 1.0,
        symbol: 2.0,
        structure: 1.5,
        position: 0.5,
        fileMatch: 1.2,
    };

    /**
     * Score and rank extraction results
     */
    public score(
        results: ExtractionResult[],
        fileMatches: FileMatch[],
        intent: SearchIntent
    ): ScoredResult[] {
        const fileMatchMap = new Map(fileMatches.map(f => [f.relativePath, f]));
        const scoredResults: ScoredResult[] = [];

        for (const result of results) {
            const fileMatch = fileMatchMap.get(result.relativePath);
            const scoredChunks = this.scoreChunks(result.chunks, intent, fileMatch);

            // Calculate overall file score
            const overallScore = this.calculateOverallScore(scoredChunks, fileMatch);

            // Get top matches for summary
            const topMatches = this.getTopMatches(scoredChunks, intent);

            scoredResults.push({
                filePath: result.filePath,
                relativePath: result.relativePath,
                language: result.language,
                overallScore,
                chunks: scoredChunks,
                extractionMode: result.extractionMode,
                summary: {
                    totalLines: result.totalLines,
                    includedLines: scoredChunks.reduce((sum, c) => sum + (c.endLine - c.startLine + 1), 0),
                    topMatches
                }
            });
        }

        // Sort by overall score
        scoredResults.sort((a, b) => b.overallScore - a.overallScore);
        return scoredResults;
    }

    /**
     * Score individual chunks
     */
    private scoreChunks(chunks: CodeChunk[], intent: SearchIntent, fileMatch?: FileMatch): ScoredChunk[] {
        return chunks.map((chunk, index) => {
            const breakdown = {
                keywordScore: this.scoreKeywords(chunk.content, intent.keywords),
                symbolScore: this.scoreSymbols(chunk.content, intent.symbols),
                structureScore: this.scoreStructure(chunk),
                positionScore: this.scorePosition(index, chunks.length),
            };

            // Calculate weighted final score
            let finalScore =
                breakdown.keywordScore * this.WEIGHTS.keyword +
                breakdown.symbolScore * this.WEIGHTS.symbol +
                breakdown.structureScore * this.WEIGHTS.structure +
                breakdown.positionScore * this.WEIGHTS.position;

            // Boost if file matched
            if (fileMatch && fileMatch.score > 10) {
                finalScore *= this.WEIGHTS.fileMatch;
            }

            return {
                ...chunk,
                finalScore,
                scoreBreakdown: breakdown
            };
        });
    }

    /**
     * Score keyword occurrences
     */
    private scoreKeywords(content: string, keywords: string[]): number {
        const lowerContent = content.toLowerCase();
        let score = 0;

        for (const kw of keywords) {
            const regex = new RegExp(`\\b${this.escapeRegex(kw)}\\b`, 'gi');
            const matches = content.match(regex);
            if (matches) {
                // Diminishing returns for multiple matches
                score += Math.min(matches.length * 2, 10);
            }
        }

        return score;
    }

    /**
     * Score symbol (function/class name) matches
     */
    private scoreSymbols(content: string, symbols: string[]): number {
        let score = 0;

        for (const symbol of symbols) {
            // Exact match (case-sensitive for code)
            if (content.includes(symbol)) {
                score += 15;
            }
            // Partial match
            else if (content.toLowerCase().includes(symbol.toLowerCase())) {
                score += 5;
            }
        }

        return score;
    }

    /**
     * Score based on code structure type
     */
    private scoreStructure(chunk: CodeChunk): number {
        const typeScores: { [key: string]: number } = {
            'function': 10,
            'class': 12,
            'imports': 3,
            'block': 5,
            'context': 2,
        };

        let score = typeScores[chunk.type] || 1;

        // Bonus for named chunks
        if (chunk.name) {
            score += 3;
        }

        // Penalty for very large chunks (harder to read)
        if (chunk.content.length > 3000) {
            score -= 2;
        }

        return score;
    }

    /**
     * Score based on position (earlier chunks slightly preferred)
     */
    private scorePosition(index: number, total: number): number {
        if (total <= 1) {return 5;}
        // Higher score for earlier chunks
        return 5 * (1 - index / total);
    }

    /**
     * Calculate overall file score
     */
    private calculateOverallScore(chunks: ScoredChunk[], fileMatch?: FileMatch): number {
        if (chunks.length === 0) {return 0;}

        // Sum of chunk scores with diminishing returns
        let totalScore = 0;
        for (let i = 0; i < chunks.length; i++) {
            totalScore += chunks[i].finalScore / (i + 1);
        }

        // Add file match score
        if (fileMatch) {
            totalScore += fileMatch.score * 0.5;
        }

        return totalScore;
    }

    /**
     * Get top matching elements for summary
     */
    private getTopMatches(chunks: ScoredChunk[], intent: SearchIntent): string[] {
        const matches: string[] = [];

        // Add chunk names
        for (const chunk of chunks.slice(0, 3)) {
            if (chunk.name) {
                matches.push(chunk.name);
            }
        }

        // Add matched keywords
        const allContent = chunks.map(c => c.content).join(' ').toLowerCase();
        for (const kw of intent.keywords.slice(0, 5)) {
            if (allContent.includes(kw) && !matches.includes(kw)) {
                matches.push(kw);
            }
        }

        return matches.slice(0, 5);
    }

    /**
     * Select and budget chunks for final context
     */
    public selectForContext(results: ScoredResult[]): Map<string, ScoredChunk[]> {
        const selection = new Map<string, ScoredChunk[]>();
        let totalChars = 0;

        for (const result of results) {
            if (totalChars >= this.MAX_TOTAL_CHARS) {break;}

            const selectedChunks: ScoredChunk[] = [];
            let fileChars = 0;

            // Sort chunks by score
            const sortedChunks = [...result.chunks].sort((a, b) => b.finalScore - a.finalScore);

            for (const chunk of sortedChunks) {
                const chunkSize = chunk.content.length;

                if (fileChars + chunkSize <= this.MAX_CHARS_PER_FILE &&
                    totalChars + chunkSize <= this.MAX_TOTAL_CHARS) {
                    selectedChunks.push(chunk);
                    fileChars += chunkSize;
                    totalChars += chunkSize;
                }
            }

            if (selectedChunks.length > 0) {
                selection.set(result.relativePath, selectedChunks);
            }
        }

        return selection;
    }

    /**
     * Escape special regex characters
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

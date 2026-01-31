/**
 * CodeExtractorAgent - Smart code extraction sub-agent
 * Extracts relevant code chunks from files using AST-aware parsing
 */

import * as vscode from 'vscode';
import { SearchIntent } from './IntentAnalyzer';

export interface CodeChunk {
    content: string;
    startLine: number;
    endLine: number;
    type: 'function' | 'class' | 'block' | 'imports' | 'context';
    name?: string;
    score: number;
    context?: string;  // Surrounding context (imports, related code)
}

export interface ExtractionResult {
    filePath: string;
    relativePath: string;
    language: string;
    chunks: CodeChunk[];
    totalLines: number;
    extractionMode: 'full' | 'chunked' | 'smart';
}

export class CodeExtractorAgent {
    private readonly MAX_CHUNK_SIZE = 4000;      // Max chars per chunk
    private readonly MAX_FILE_FULL = 6000;       // Max file size to include fully
    private readonly CONTEXT_LINES = 3;          // Lines of context around matches
    private readonly MAX_CHUNKS_PER_FILE = 5;    // Max chunks to extract per file

    // Pattern to detect code block starts
    private readonly BLOCK_PATTERNS: { [lang: string]: RegExp[] } = {
        'ts': [
            /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)/,
            /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)/,
            /^(\s*)(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\(/,
            /^(\s*)(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?function/,
            /^(\s*)(export\s+)?interface\s+(\w+)/,
            /^(\s*)(export\s+)?type\s+(\w+)/,
            /^(\s*)(export\s+)?enum\s+(\w+)/,
        ],
        'js': [
            /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)/,
            /^(\s*)(export\s+)?class\s+(\w+)/,
            /^(\s*)(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\(/,
        ],
        'py': [
            /^(\s*)def\s+(\w+)\s*\(/,
            /^(\s*)async\s+def\s+(\w+)\s*\(/,
            /^(\s*)class\s+(\w+)/,
        ],
        'go': [
            /^(\s*)func\s+(\w+)\s*\(/,
            /^(\s*)type\s+(\w+)\s+struct/,
            /^(\s*)type\s+(\w+)\s+interface/,
        ],
        'rs': [
            /^(\s*)fn\s+(\w+)\s*\(/,
            /^(\s*)pub\s+fn\s+(\w+)\s*\(/,
            /^(\s*)struct\s+(\w+)/,
            /^(\s*)impl\s+(\w+)/,
            /^(\s*)trait\s+(\w+)/,
        ],
        'java': [
            /^(\s*)(public|protected|private|static|\s)*class\s+(\w+)/,
            /^(\s*)(public|protected|private|static|\s)*interface\s+(\w+)/,
            /^(\s*)(public|protected|private|static|\s)*\w+\s+(\w+)\s*\([^)]*\)\s*\{/,
        ],
        'cpp': [
            /^(\s*)(class|struct)\s+(\w+)/,
            /^(\s*)(\w+)\s+(\w+)\s*\([^)]*\)\s*\{/,
        ],
    };

    /**
     * Extract relevant code chunks from a file
     */
    public async extract(
        filePath: string,
        relativePath: string,
        intent: SearchIntent,
        fileContent?: string
    ): Promise<ExtractionResult> {
        const extension = relativePath.split('.').pop() || 'text';
        let text: string;

        try {
            if (fileContent !== undefined) {
                text = fileContent;
            } else {
                const uri = vscode.Uri.file(filePath);
                const content = await vscode.workspace.fs.readFile(uri);
                text = new TextDecoder().decode(content);
            }
        } catch (e) {
            console.error('CodeExtractorAgent: Error reading file', filePath, e);
            return {
                filePath,
                relativePath,
                language: extension,
                chunks: [],
                totalLines: 0,
                extractionMode: 'full'
            };
        }

        const lines = text.split('\n');
        const totalLines = lines.length;

        // For small files, include everything
        if (text.length <= this.MAX_FILE_FULL) {
            return {
                filePath,
                relativePath,
                language: extension,
                chunks: [{
                    content: text,
                    startLine: 0,
                    endLine: lines.length - 1,
                    type: 'block',
                    score: 10,
                }],
                totalLines,
                extractionMode: 'full'
            };
        }

        // For large files, use smart chunking
        const chunks = await this.smartChunk(lines, extension, intent);

        return {
            filePath,
            relativePath,
            language: extension,
            chunks: chunks.slice(0, this.MAX_CHUNKS_PER_FILE),
            totalLines,
            extractionMode: 'smart'
        };
    }

    /**
     * Smart chunking - extracts code blocks based on structure and relevance
     */
    private async smartChunk(lines: string[], extension: string, intent: SearchIntent): Promise<CodeChunk[]> {
        const chunks: CodeChunk[] = [];
        const langPatterns = this.BLOCK_PATTERNS[extension] || this.BLOCK_PATTERNS['ts'];

        // Always try to get imports section
        const importChunk = this.extractImports(lines, extension);
        if (importChunk) {
            chunks.push(importChunk);
        }

        // Find code blocks (functions, classes)
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];

            // Check if this line starts a block
            let blockMatch: { name: string; type: CodeChunk['type'] } | null = null;

            for (const pattern of langPatterns) {
                const match = line.match(pattern);
                if (match) {
                    // Extract name from appropriate capture group
                    const name = match[4] || match[3] || match[2] || 'anonymous';
                    const type = line.includes('class') ? 'class' :
                        line.includes('interface') ? 'block' :
                            line.includes('type ') ? 'block' : 'function';
                    blockMatch = { name, type };
                    break;
                }
            }

            if (blockMatch) {
                // Found a block start, extract it
                const blockEnd = this.findBlockEnd(lines, i, extension);
                const blockContent = lines.slice(i, blockEnd + 1).join('\n');

                // Score the block based on keyword matches
                const score = this.scoreChunk(blockContent, intent);

                if (score > 0 && blockContent.length <= this.MAX_CHUNK_SIZE) {
                    chunks.push({
                        content: blockContent,
                        startLine: i,
                        endLine: blockEnd,
                        type: blockMatch.type,
                        name: blockMatch.name,
                        score
                    });
                }

                i = blockEnd + 1;
            } else {
                i++;
            }
        }

        // If we found few chunks, also search for keyword matches
        if (chunks.length < 3) {
            const keywordChunks = this.extractKeywordContext(lines, intent);
            chunks.push(...keywordChunks);
        }

        // Sort by score and return
        chunks.sort((a, b) => b.score - a.score);
        return chunks;
    }

    /**
     * Extract import statements section
     */
    private extractImports(lines: string[], extension: string): CodeChunk | null {
        const importPatterns: { [key: string]: RegExp } = {
            'ts': /^import\s+/,
            'tsx': /^import\s+/,
            'js': /^import\s+|^const\s+\w+\s*=\s*require\(/,
            'jsx': /^import\s+/,
            'py': /^import\s+|^from\s+\w+\s+import/,
        };

        const pattern = importPatterns[extension] || importPatterns['ts'];
        let start = -1;
        let end = -1;

        for (let i = 0; i < Math.min(lines.length, 50); i++) {
            if (pattern.test(lines[i].trim())) {
                if (start === -1) {start = i;}
                end = i;
            } else if (start !== -1 && lines[i].trim() !== '' && !lines[i].trim().startsWith('//')) {
                break;
            }
        }

        if (start !== -1 && end !== -1) {
            return {
                content: lines.slice(start, end + 1).join('\n'),
                startLine: start,
                endLine: end,
                type: 'imports',
                score: 5  // Imports are always somewhat relevant
            };
        }

        return null;
    }

    /**
     * Find the end of a code block (matching braces/indentation)
     */
    private findBlockEnd(lines: string[], start: number, extension: string): number {
        if (extension === 'py') {
            // Python: use indentation
            const startIndent = this.getIndent(lines[start]);
            for (let i = start + 1; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim() === '') {continue;}
                if (this.getIndent(line) <= startIndent && line.trim() !== '') {
                    return i - 1;
                }
            }
            return lines.length - 1;
        }

        // Brace-based languages (JS, TS, etc.)
        let braceCount = 0;
        let foundFirstBrace = false;

        for (let i = start; i < lines.length; i++) {
            const line = lines[i];
            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;

            if (braceCount > 0) {foundFirstBrace = true;}

            if (foundFirstBrace && braceCount <= 0) {
                return i;
            }

            // Safety limit
            if (i - start > 500) {return i;}
        }

        return Math.min(start + 100, lines.length - 1);
    }

    /**
     * Get indentation level of a line
     */
    private getIndent(line: string): number {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    /**
     * Score a chunk based on keyword matches
     */
    private scoreChunk(content: string, intent: SearchIntent): number {
        let score = 0;
        const lowerContent = content.toLowerCase();

        // Score keywords
        for (const kw of intent.keywords) {
            if (lowerContent.includes(kw)) {
                score += 2;
            }
        }

        // Score code symbols (higher weight)
        for (const symbol of intent.symbols) {
            if (content.includes(symbol)) {
                score += 5;
            }
        }

        // Bonus for code terms
        for (const term of intent.codeTerms) {
            if (content.includes(term)) {
                score += 4;
            }
        }

        return score;
    }

    /**
     * Extract chunks around keyword matches
     */
    private extractKeywordContext(lines: string[], intent: SearchIntent): CodeChunk[] {
        const chunks: CodeChunk[] = [];
        const usedLines = new Set<number>();

        for (let i = 0; i < lines.length; i++) {
            if (usedLines.has(i)) {continue;}

            const line = lines[i];
            let matchScore = 0;

            // Check for matches
            for (const symbol of intent.symbols) {
                if (line.includes(symbol)) {matchScore += 5;}
            }
            for (const kw of intent.keywords) {
                if (line.toLowerCase().includes(kw)) {matchScore += 2;}
            }

            if (matchScore > 0) {
                // Extract context around match
                const start = Math.max(0, i - this.CONTEXT_LINES);
                const end = Math.min(lines.length - 1, i + this.CONTEXT_LINES);

                for (let j = start; j <= end; j++) {usedLines.add(j);}

                const content = lines.slice(start, end + 1).join('\n');
                if (content.length <= this.MAX_CHUNK_SIZE) {
                    chunks.push({
                        content,
                        startLine: start,
                        endLine: end,
                        type: 'context',
                        score: matchScore
                    });
                }
            }
        }

        return chunks;
    }
}

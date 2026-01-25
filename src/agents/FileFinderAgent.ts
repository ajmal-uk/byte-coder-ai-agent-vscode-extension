/**
 * FileFinderAgent - Intelligent file discovery sub-agent
 * Finds relevant files using fuzzy matching and scoring
 */

import * as vscode from 'vscode';
import { SearchIntent } from './IntentAnalyzer';

export interface FileMatch {
    uri: vscode.Uri;
    relativePath: string;
    fileName: string;
    extension: string;
    score: number;
    matchedKeywords: string[];
    matchType: 'exact' | 'fuzzy' | 'semantic';
}

export class FileFinderAgent {
    private readonly MAX_FILES = 12;  // Increased for better coverage
    private readonly MIN_SCORE = 1;   // Lowered to catch more relevant files

    // Cache for workspace files
    private fileCache: vscode.Uri[] | null = null;
    private fileCacheTime = 0;
    private readonly CACHE_TTL = 30000; // 30 seconds

    // File importance weights
    private readonly IMPORTANCE_WEIGHTS: { [key: string]: number } = {
        'index': 3,
        'main': 3,
        'app': 3,
        'config': 2,
        'util': 2,
        'helper': 2,
        'service': 2,
        'provider': 2,
        'controller': 2,
        'handler': 2,
    };

    // Extensions to search
    private readonly SEARCHABLE_EXTENSIONS =
        '**/*.{ts,tsx,js,jsx,py,java,cs,go,rb,php,vue,svelte,json,yaml,yml,md,css,scss,html,c,cpp,h,hpp,rs}';

    private readonly EXCLUDE_PATTERNS =
        '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.next/**,**/coverage/**,**/.gemini/**,**/.bytecoder/**}';

    /**
     * Find relevant files based on search intent
     */
    public async find(intent: SearchIntent, activeFilePath?: string): Promise<FileMatch[]> {
        const allFiles = await this.getWorkspaceFiles();
        const matches: FileMatch[] = [];
        const processedPaths = new Set<string>();

        for (const fileUri of allFiles) {
            const relativePath = vscode.workspace.asRelativePath(fileUri);
            if (processedPaths.has(relativePath)) continue;
            processedPaths.add(relativePath);

            const match = this.scoreFile(fileUri, relativePath, intent, activeFilePath);

            if (match.score >= this.MIN_SCORE || relativePath === activeFilePath) {
                // Boost active file significantly
                if (relativePath === activeFilePath) {
                    match.score += 100;
                }
                matches.push(match);
            }
        }

        // Sort by score and return top matches
        matches.sort((a, b) => b.score - a.score);

        // Fallback: If no good matches, include important files
        if (matches.length === 0 || matches[0].score < 3) {
            const importantFiles = await this.getImportantFiles(allFiles);
            for (const file of importantFiles) {
                if (!matches.some(m => m.uri.fsPath === file.uri.fsPath)) {
                    matches.push(file);
                }
            }
        }

        return matches.slice(0, this.MAX_FILES);
    }

    /**
     * Get important project files as fallback
     */
    private async getImportantFiles(allFiles: vscode.Uri[]): Promise<FileMatch[]> {
        const important: FileMatch[] = [];
        const importantNames = ['index', 'main', 'app', 'server', 'package.json', 'readme'];

        for (const uri of allFiles) {
            const name = uri.fsPath.split('/').pop()?.toLowerCase() || '';
            for (const imp of importantNames) {
                if (name.includes(imp)) {
                    important.push({
                        uri,
                        relativePath: vscode.workspace.asRelativePath(uri),
                        fileName: name,
                        extension: name.split('.').pop() || '',
                        score: 5,
                        matchedKeywords: ['important'],
                        matchType: 'semantic'
                    });
                    break;
                }
            }
        }

        return important.slice(0, 4);
    }

    /**
     * Get cached workspace files
     */
    private async getWorkspaceFiles(): Promise<vscode.Uri[]> {
        const now = Date.now();

        if (this.fileCache && (now - this.fileCacheTime) < this.CACHE_TTL) {
            return this.fileCache;
        }

        // Limit to 2000 files to prevent performance issues in large repos
        this.fileCache = await vscode.workspace.findFiles(
            this.SEARCHABLE_EXTENSIONS,
            this.EXCLUDE_PATTERNS,
            2000 
        );
        this.fileCacheTime = now;

        return this.fileCache;
    }

    /**
     * Calculate fuzzy match score (0-100)
     * Handles non-contiguous matching (e.g. 'fba' matches 'foo-bar-app')
     */
    private calculateFuzzyScore(query: string, target: string): number {
        if (!query || !target) return 0;
        const q = query.toLowerCase();
        const t = target.toLowerCase();
        
        // Exact match
        if (t === q) return 100;
        // Contains match
        if (t.includes(q)) return 80;
        
        // Non-contiguous sequence match
        let qIdx = 0;
        let tIdx = 0;
        let matches = 0;
        
        while (qIdx < q.length && tIdx < t.length) {
            if (q[qIdx] === t[tIdx]) {
                matches++;
                qIdx++;
            }
            tIdx++;
        }
        
        if (matches === q.length) {
            // Penalize based on length difference to prefer tighter matches
            const lengthPenalty = Math.max(0, (t.length - q.length) * 2);
            return Math.max(10, 60 - lengthPenalty);
        }
        
        return 0;
    }

    /**
     * Score a file's relevance to the search intent
     */
    private scoreFile(uri: vscode.Uri, relativePath: string, intent: SearchIntent, activeFile?: string): FileMatch {
        let score = 0;
        const matchedKeywords: string[] = [];
        let matchType: FileMatch['matchType'] = 'semantic';

        const lowerPath = relativePath.toLowerCase();
        const pathParts = relativePath.split('/');
        const fileName = pathParts[pathParts.length - 1] || '';
        const lowerFileName = fileName.toLowerCase();
        const extension = fileName.split('.').pop() || '';

        // Check mentioned files (highest priority)
        for (const mentioned of intent.mentionedFiles) {
            // Use fuzzy scoring for mentioned files too
            const fuzzyScore = this.calculateFuzzyScore(mentioned, fileName);
            if (fuzzyScore > 50) {
                score += fuzzyScore; // 50-100 points
                matchType = 'exact';
                matchedKeywords.push(mentioned);
            }
        }

        // Check code symbols in filename
        for (const symbol of intent.symbols) {
            const fuzzyScore = this.calculateFuzzyScore(symbol, fileName);
            if (fuzzyScore > 0) {
                score += (fuzzyScore * 0.5); // Scale down a bit for symbols
                matchType = 'fuzzy';
                matchedKeywords.push(symbol);
            }
        }

        // Check keywords with fuzzy matching
        for (const kw of intent.keywords) {
            // Direct inclusion check (fast)
            if (lowerFileName.includes(kw)) {
                score += 20;
                matchedKeywords.push(kw);
                if (matchType !== 'exact') matchType = 'fuzzy';
            } 
            // Path inclusion check
            else if (lowerPath.includes(kw)) {
                score += 10;
                matchedKeywords.push(kw);
            }
            // Smart fuzzy check (slower but catches 'usr' -> 'user')
            else {
                const fuzzyScore = this.calculateFuzzyScore(kw, fileName);
                if (fuzzyScore > 40) {
                    score += (fuzzyScore * 0.3);
                    matchedKeywords.push(kw);
                    matchType = 'fuzzy';
                }
            }
        }

        // Apply importance weights for special filenames
        for (const [pattern, weight] of Object.entries(this.IMPORTANCE_WEIGHTS)) {
            if (lowerFileName.includes(pattern)) {
                score += weight;
            }
        }

        // Query type-specific boosts
        if (intent.queryType === 'test') {
            if (lowerFileName.includes('test') || lowerFileName.includes('spec')) {
                score += 10;
            }
        } else if (intent.queryType === 'fix') {
            if (lowerFileName.includes('error') || lowerFileName.includes('handler')) {
                score += 5;
            }
        } else if (intent.queryType === 'refactor' || intent.queryType === 'explain') {
            // Boost main code files
            if (['ts', 'tsx', 'js', 'jsx', 'py'].includes(extension)) {
                score += 2;
            }
        }

        // Slight penalty for config/lock files on non-config queries
        if (intent.queryType !== 'general') {
            if (lowerFileName.includes('lock') || lowerFileName.includes('.d.ts')) {
                score -= 5;
            }
        }

        return {
            uri,
            relativePath,
            fileName,
            extension,
            score,
            matchedKeywords: [...new Set(matchedKeywords)],
            matchType
        };
    }

    /**
     * Clear the file cache (useful when workspace changes)
     */
    public clearCache(): void {
        this.fileCache = null;
        this.fileCacheTime = 0;
    }
}

/**
 * IntentAnalyzer - Advanced query intent analysis sub-agent
 * Extracts keywords, code patterns, and determines search strategy
 */

import * as vscode from 'vscode';

export interface SearchIntent {
    keywords: string[];
    codeTerms: string[];
    filePatterns: string[];
    queryType: 'fix' | 'explain' | 'refactor' | 'test' | 'optimize' | 'security' | 'general';
    complexity: 'simple' | 'medium' | 'complex';
    mentionedFiles: string[];
    symbols: string[];  // Function/class names extracted
}

export class IntentAnalyzer {
    // Stop words to filter from keyword extraction
    private readonly STOP_WORDS = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
        'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
        'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
        'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
        'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'code',
        'file', 'function', 'class', 'method', 'variable', 'please', 'help',
        'want', 'need', 'make', 'create', 'add', 'get', 'set', 'use', 'show',
        'tell', 'give', 'find', 'look', 'see', 'know', 'think', 'take', 'come'
    ]);

    // Query type detection patterns
    private readonly QUERY_PATTERNS: { [key: string]: RegExp[] } = {
        'fix': [/\bfix\b/i, /\bbug\b/i, /\berror\b/i, /\bissue\b/i, /\bproblem\b/i, /\bbroken\b/i, /\bwrong\b/i, /\bfail/i, /\bcrash/i, /\bnot working/i],
        'explain': [/\bexplain\b/i, /\bwhat\b/i, /\bhow\b/i, /\bwhy\b/i, /\bunderstand\b/i, /\bdescribe\b/i, /\bwalk.*through\b/i, /\bwho\b/i, /\bwhere\b/i, /\bwhen\b/i],
        'refactor': [/\brefactor\b/i, /\bimprove\b/i, /\boptimize\b/i, /\bclean\b/i, /\bbetter\b/i, /\benhance\b/i, /\brewrite\b/i],
        'test': [/\btest\b/i, /\btests\b/i, /\bunit\b/i, /\bspec\b/i, /\bcoverage\b/i, /\bmock\b/i],
        'optimize': [/\bperformance\b/i, /\bspeed\b/i, /\bfast\b/i, /\bslow\b/i, /\bmemory\b/i, /\befficient\b/i],
        'security': [/\bsecurity\b/i, /\bvulnerab/i, /\bauth/i, /\bpassword\b/i, /\btoken\b/i, /\bencrypt/i, /\bsanitize\b/i]
    };

    // Semantic expansion map for related terms
    private readonly SEMANTIC_MAP: { [key: string]: string[] } = {
        'login': ['auth', 'authentication', 'signin', 'session', 'user', 'credential'],
        'auth': ['login', 'authentication', 'session', 'token', 'jwt', 'oauth'],
        'error': ['exception', 'catch', 'throw', 'fail', 'bug', 'crash'],
        'bug': ['error', 'issue', 'fix', 'problem', 'wrong', 'broken'],
        'api': ['endpoint', 'route', 'request', 'response', 'http', 'rest', 'fetch'],
        'database': ['db', 'sql', 'query', 'model', 'schema', 'orm', 'prisma', 'mongo'],
        'test': ['spec', 'jest', 'mocha', 'assert', 'expect', 'mock', 'stub'],
        'style': ['css', 'scss', 'styled', 'theme', 'color', 'layout'],
        'config': ['configuration', 'settings', 'env', 'options', 'dotenv'],
        'component': ['view', 'ui', 'screen', 'page', 'widget', 'element'],
        'hook': ['useEffect', 'useState', 'useMemo', 'useCallback', 'useRef'],
        'state': ['reducer', 'store', 'context', 'redux', 'zustand'],
        'route': ['router', 'navigation', 'path', 'url', 'link'],
        'service': ['client', 'api', 'http', 'provider'],
        'controller': ['handler', 'endpoint', 'action'],
        'message': ['chat', 'notification', 'alert', 'toast'],
        'search': ['find', 'query', 'filter', 'lookup'],
        'cache': ['store', 'memory', 'persist', 'storage'],
        'validate': ['check', 'verify', 'sanitize', 'parse'],
        'render': ['display', 'show', 'view', 'draw'],
    };

    // File type associations
    private readonly FILE_TYPE_HINTS: { [key: string]: string[] } = {
        'component': ['tsx', 'jsx', 'vue', 'svelte'],
        'style': ['css', 'scss', 'sass', 'less'],
        'config': ['json', 'yaml', 'yml', 'toml', 'ini'],
        'test': ['spec.ts', 'test.ts', 'spec.js', 'test.js'],
        'type': ['d.ts', 'types.ts', 'interface'],
        'util': ['utils', 'helper', 'lib'],
    };

    /**
     * Analyze a query and extract structured search intent
     */
    public analyze(query: string): SearchIntent {
        const queryType = this.detectQueryType(query);
        const mentionedFiles = this.extractMentionedFiles(query);
        const symbols = this.extractSymbols(query);
        const keywords = this.extractKeywords(query);
        const expandedKeywords = this.expandKeywords(keywords);
        const filePatterns = this.generateFilePatterns(expandedKeywords, mentionedFiles, queryType);
        const complexity = this.assessComplexity(query, keywords);

        return {
            keywords: expandedKeywords,
            codeTerms: symbols,
            filePatterns,
            queryType,
            complexity,
            mentionedFiles,
            symbols
        };
    }

    /**
     * Detect the type of query (fix, explain, refactor, etc.)
     */
    private detectQueryType(query: string): SearchIntent['queryType'] {
        for (const [type, patterns] of Object.entries(this.QUERY_PATTERNS)) {
            if (patterns.some(p => p.test(query))) {
                return type as SearchIntent['queryType'];
            }
        }
        return 'general';
    }

    /**
     * Extract @mentioned files from query
     */
    private extractMentionedFiles(query: string): string[] {
        const mentions = query.match(/@[\w./\\-]+/g) || [];
        return mentions.map(m => m.substring(1));
    }

    /**
     * Extract code symbols (function/class names) from query
     */
    private extractSymbols(query: string): string[] {
        const symbols: string[] = [];

        // CamelCase identifiers
        const camelCase = query.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g) || [];
        symbols.push(...camelCase);

        // PascalCase identifiers (class names)
        const pascalCase = query.match(/\b[A-Z][a-z][a-zA-Z0-9]*\b/g) || [];
        symbols.push(...pascalCase);

        // snake_case identifiers
        const snakeCase = query.match(/\b[a-z]+_[a-z_]+\b/g) || [];
        symbols.push(...snakeCase);

        // Function calls
        const funcCalls = query.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/g) || [];
        symbols.push(...funcCalls.map(f => f.replace(/\s*\($/, '')));

        return [...new Set(symbols)];
    }

    /**
     * Extract and filter keywords from query
     */
    private extractKeywords(query: string): string[] {
        const words = query.toLowerCase()
            .replace(/[^\w\s@/.-]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !this.STOP_WORDS.has(w));

        // Also extract parts of camelCase words
        const codeTerms = this.extractSymbols(query);
        const codeParts: string[] = [];

        for (const term of codeTerms) {
            // Split camelCase
            const separated = term.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
            const parts = separated.split(/[_\s]+/);
            for (const part of parts) {
                const lowered = part.toLowerCase();
                if (lowered.length > 2 && !this.STOP_WORDS.has(lowered)) {
                    codeParts.push(lowered);
                }
            }
        }

        return [...new Set([...words, ...codeParts])];
    }

    /**
     * Expand keywords using semantic map
     */
    private expandKeywords(keywords: string[]): string[] {
        const expanded = new Set(keywords);

        for (const keyword of keywords) {
            const expansions = this.SEMANTIC_MAP[keyword];
            if (expansions) {
                expansions.forEach(e => expanded.add(e));
            }
        }

        return Array.from(expanded);
    }

    /**
     * Generate file patterns based on keywords and query type
     */
    private generateFilePatterns(keywords: string[], mentionedFiles: string[], queryType: string): string[] {
        const patterns: string[] = [];

        // Add mentioned files with highest priority
        for (const file of mentionedFiles) {
            patterns.push(`**/*${file}*`);
        }

        // Add keyword-based patterns
        for (const kw of keywords) {
            if (kw.length > 3) {
                patterns.push(`**/*${kw}*`);
            }
        }

        // Add type-specific patterns
        if (queryType === 'test') {
            patterns.push('**/*.test.*', '**/*.spec.*', '**/test/**', '**/__tests__/**');
        } else if (queryType === 'fix') {
            patterns.push('**/*error*', '**/*handler*', '**/*util*');
        }

        return patterns;
    }

    /**
     * Assess query complexity to determine search depth
     */
    private assessComplexity(query: string, keywords: string[]): SearchIntent['complexity'] {
        const wordCount = query.split(/\s+/).length;
        const keywordCount = keywords.length;

        if (wordCount > 20 || keywordCount > 10) {
            return 'complex';
        } else if (wordCount > 8 || keywordCount > 4) {
            return 'medium';
        }
        return 'simple';
    }
}

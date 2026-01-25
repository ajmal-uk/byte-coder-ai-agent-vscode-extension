/**
 * ProcessPlannerAgent - Strategic architect for large projects
 * Defines phases, deliverables, and high-level project structure
 */

import * as vscode from 'vscode';
import { BaseAgent, AgentOutput, ProjectPhase } from '../core/AgentTypes';

export interface ProcessPlannerInput {
    query: string;
    projectType?: string;  // 'web', 'api', 'cli', 'library', etc.
    existingStructure?: string[];
    constraints?: string[];
    contextKnowledge?: any[]; // Knowledge base results
}

export interface ProcessPlannerResult {
    phases: ProjectPhase[];
    techStack: {
        frontend?: string;
        backend?: string;
        database?: string;
        tools?: string[];
    };
    estimatedDuration: string;
    riskFactors: string[];
    recommendations: string[];
}

export class ProcessPlannerAgent extends BaseAgent<ProcessPlannerInput, ProcessPlannerResult> {
    // Project type templates
    private readonly PROJECT_TEMPLATES: Record<string, Partial<ProcessPlannerResult>> = {
        'web': {
            techStack: {
                frontend: 'React 18 + TypeScript + Tailwind CSS',
                backend: 'Node.js + Express',
                database: 'PostgreSQL',
                tools: ['ESLint', 'Prettier', 'Jest', 'Vite']
            },
            phases: [
                { name: 'Project Setup', deliverables: ['Initialize project', 'Configure TypeScript', 'Setup linting'], dependencies: [] },
                { name: 'Core UI', deliverables: ['Base components', 'Layout system', 'Theme configuration'], dependencies: ['Project Setup'] },
                { name: 'Features', deliverables: ['Core feature implementation'], dependencies: ['Core UI'] },
                { name: 'Testing', deliverables: ['Unit tests', 'Integration tests'], dependencies: ['Features'] },
                { name: 'Deployment', deliverables: ['Build optimization', 'CI/CD setup'], dependencies: ['Testing'] }
            ]
        },
        'api': {
            techStack: {
                backend: 'Node.js + Express + TypeScript',
                database: 'PostgreSQL + TypeORM',
                tools: ['ESLint', 'Jest', 'Swagger']
            },
            phases: [
                { name: 'Project Setup', deliverables: ['Initialize project', 'Database configuration', 'ORM setup'], dependencies: [] },
                { name: 'Core API', deliverables: ['Route structure', 'Middleware', 'Error handling'], dependencies: ['Project Setup'] },
                { name: 'Authentication', deliverables: ['JWT implementation', 'Session management'], dependencies: ['Core API'] },
                { name: 'Business Logic', deliverables: ['Service layer', 'Data models'], dependencies: ['Authentication'] },
                { name: 'Documentation', deliverables: ['API documentation', 'Swagger/OpenAPI'], dependencies: ['Business Logic'] }
            ]
        },
        'fullstack': {
            techStack: {
                frontend: 'Next.js 14 + TypeScript + Tailwind CSS',
                backend: 'Next.js API Routes',
                database: 'PostgreSQL + Prisma',
                tools: ['ESLint', 'Prettier', 'Jest', 'Playwright']
            },
            phases: [
                { name: 'Project Setup', deliverables: ['Next.js initialization', 'Prisma setup', 'Environment configuration'], dependencies: [] },
                { name: 'Authentication', deliverables: ['NextAuth setup', 'User model', 'Protected routes'], dependencies: ['Project Setup'] },
                { name: 'Core Features', deliverables: ['Main pages', 'API routes', 'Database models'], dependencies: ['Authentication'] },
                { name: 'UI Polish', deliverables: ['Responsive design', 'Animations', 'Accessibility'], dependencies: ['Core Features'] },
                { name: 'Testing & Deploy', deliverables: ['E2E tests', 'Vercel deployment'], dependencies: ['UI Polish'] }
            ]
        }
    };

    constructor() {
        super({ name: 'ProcessPlanner', timeout: 10000 });
    }

    async execute(input: ProcessPlannerInput): Promise<AgentOutput<ProcessPlannerResult>> {
        const startTime = Date.now();

        try {
            // Detect project type from query if not provided
            const projectType = input.projectType || this.detectProjectType(input.query);

            // Get template or build custom phases
            const template = this.PROJECT_TEMPLATES[projectType];

            // Customize phases based on query
            const phases = this.customizePhases(
                template?.phases || this.buildDefaultPhases(),
                input.query,
                input.existingStructure
            );

            // Determine tech stack
            const techStack = this.determineTechStack(input.query, template?.techStack, input.contextKnowledge);

            // Estimate duration
            const estimatedDuration = this.estimateDuration(phases);

            // Identify risk factors
            const riskFactors = this.identifyRisks(input.query, phases);

            // Generate recommendations
            const recommendations = this.generateRecommendations(input.query, projectType);

            const result: ProcessPlannerResult = {
                phases,
                techStack,
                estimatedDuration,
                riskFactors,
                recommendations
            };

            return this.createOutput('success', result, 0.85, startTime, {
                reasoning: `Planned ${phases.length} phases for ${projectType} project`
            });

        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Detect project type from query
     */
    private detectProjectType(query: string): string {
        const lowerQuery = query.toLowerCase();

        if (lowerQuery.includes('api') || lowerQuery.includes('backend') || lowerQuery.includes('server')) {
            return 'api';
        }
        if (lowerQuery.includes('fullstack') || lowerQuery.includes('full stack') || lowerQuery.includes('full-stack')) {
            return 'fullstack';
        }
        if (lowerQuery.includes('website') || lowerQuery.includes('web app') || lowerQuery.includes('frontend')) {
            return 'web';
        }
        if (lowerQuery.includes('cli') || lowerQuery.includes('command line')) {
            return 'cli';
        }
        if (lowerQuery.includes('library') || lowerQuery.includes('package')) {
            return 'library';
        }
        if (lowerQuery.includes('game')) {
            return 'game';
        }

        // Default to web
        return 'web';
    }

    /**
     * Customize phases based on query and existing structure
     */
    private customizePhases(
        basePhases: ProjectPhase[],
        query: string,
        existingStructure?: string[]
    ): ProjectPhase[] {
        const phases = [...basePhases];
        const lowerQuery = query.toLowerCase();

        // Add authentication phase if not present but mentioned
        if (lowerQuery.includes('auth') || lowerQuery.includes('login')) {
            const hasAuth = phases.some(p => p.name.toLowerCase().includes('auth'));
            if (!hasAuth) {
                const insertIndex = phases.findIndex(p => p.name.toLowerCase().includes('feature')) || 1;
                phases.splice(insertIndex, 0, {
                    name: 'Authentication',
                    deliverables: ['User registration', 'Login/logout', 'Session management', 'Password reset'],
                    dependencies: ['Project Setup']
                });
            }
        }

        // Add payment phase if mentioned
        if (lowerQuery.includes('payment') || lowerQuery.includes('checkout') || lowerQuery.includes('stripe')) {
            phases.push({
                name: 'Payment Integration',
                deliverables: ['Stripe setup', 'Checkout flow', 'Subscription handling'],
                dependencies: ['Authentication']
            });
        }

        // Mark phases as completed if they exist
        if (existingStructure?.length) {
            for (const phase of phases) {
                if (phase.name === 'Project Setup') {
                    phase.status = 'completed';
                }
            }
        }

        return phases;
    }

    /**
     * Build default phases for unknown project types
     */
    private buildDefaultPhases(): ProjectPhase[] {
        return [
            { name: 'Planning', deliverables: ['Requirements analysis', 'Architecture design'], dependencies: [] },
            { name: 'Setup', deliverables: ['Project initialization', 'Configuration'], dependencies: ['Planning'] },
            { name: 'Implementation', deliverables: ['Core features', 'Business logic'], dependencies: ['Setup'] },
            { name: 'Testing', deliverables: ['Unit tests', 'Integration tests'], dependencies: ['Implementation'] },
            { name: 'Deployment', deliverables: ['Build', 'Deploy', 'Documentation'], dependencies: ['Testing'] }
        ];
    }

    /**
     * Determine technology stack based on requirements and knowledge
     */
    private determineTechStack(query: string, defaultStack?: any, knowledge?: any[]): any {
        const stack = { ...defaultStack };
        const lowerQuery = query.toLowerCase();

        // Check knowledge base for forced stack choices
        if (knowledge) {
            knowledge.forEach(k => {
                const summary = k.summary.toLowerCase();
                if (summary.includes('react')) stack.frontend = 'React';
                if (summary.includes('vue')) stack.frontend = 'Vue.js';
                if (summary.includes('angular')) stack.frontend = 'Angular';
                if (summary.includes('svelte')) stack.frontend = 'Svelte';
                
                if (summary.includes('python') || summary.includes('django') || summary.includes('flask')) stack.backend = 'Python';
                if (summary.includes('go') || summary.includes('golang')) stack.backend = 'Go';
                if (summary.includes('node')) stack.backend = 'Node.js';
                
                if (summary.includes('mongo')) stack.database = 'MongoDB';
                if (summary.includes('postgres')) stack.database = 'PostgreSQL';
                if (summary.includes('mysql')) stack.database = 'MySQL';
                if (summary.includes('firebase')) stack.database = 'Firebase';
            });
        }

        // Override with explicit query requirements
        if (lowerQuery.includes('react')) stack.frontend = 'React 18 + TypeScript';
        if (lowerQuery.includes('next.js') || lowerQuery.includes('nextjs')) {
            stack.frontend = 'Next.js 14 + TypeScript';
        } else if (lowerQuery.includes('vue')) {
            stack.frontend = 'Vue 3 + TypeScript + Vite';
        } else if (lowerQuery.includes('svelte')) {
            stack.frontend = 'SvelteKit + TypeScript';
        }

        // Database preferences
        if (lowerQuery.includes('mongodb') || lowerQuery.includes('mongo')) {
            stack.database = 'MongoDB + Mongoose';
        } else if (lowerQuery.includes('mysql')) {
            stack.database = 'MySQL + Prisma';
        } else if (lowerQuery.includes('sqlite')) {
            stack.database = 'SQLite';
        }

        return stack;
    }

    /**
     * Estimate duration based on phases
     */
    private estimateDuration(phases: ProjectPhase[]): string {
        const baseHoursPerPhase = 4;
        let totalHours = 0;

        for (const phase of phases) {
            totalHours += baseHoursPerPhase + (phase.deliverables.length * 2);
        }

        if (totalHours <= 8) return '1 day';
        if (totalHours <= 24) return '2-3 days';
        if (totalHours <= 40) return '1 week';
        if (totalHours <= 80) return '2 weeks';
        return '3+ weeks';
    }

    /**
     * Identify potential risks
     */
    private identifyRisks(query: string, phases: ProjectPhase[]): string[] {
        const risks: string[] = [];
        const lowerQuery = query.toLowerCase();

        if (phases.length > 5) {
            risks.push('Complex project - consider breaking into smaller milestones');
        }

        if (lowerQuery.includes('payment') || lowerQuery.includes('checkout')) {
            risks.push('Payment integration requires PCI compliance considerations');
        }

        if (lowerQuery.includes('auth')) {
            risks.push('Authentication security is critical - use established libraries');
        }

        if (lowerQuery.includes('realtime') || lowerQuery.includes('websocket')) {
            risks.push('Real-time features add infrastructure complexity');
        }

        if (!risks.length) {
            risks.push('No significant risks identified');
        }

        return risks;
    }

    /**
     * Generate project recommendations
     */
    private generateRecommendations(query: string, projectType: string): string[] {
        const recommendations: string[] = [];

        recommendations.push('Start with a clear folder structure');
        recommendations.push('Set up linting and formatting early');

        if (projectType === 'web' || projectType === 'fullstack') {
            recommendations.push('Implement responsive design from the start');
            recommendations.push('Consider SSR/SSG for SEO-critical pages');
        }

        if (projectType === 'api') {
            recommendations.push('Document API endpoints with OpenAPI/Swagger');
            recommendations.push('Implement rate limiting and input validation');
        }

        return recommendations;
    }
}

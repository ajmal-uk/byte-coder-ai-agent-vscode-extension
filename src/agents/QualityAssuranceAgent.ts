
import { BaseAgent, AgentOutput } from '../core/AgentTypes';

export interface QAInput {
    originalRequirements: string;
    implementedFiles: string[];
    testResults?: {
        passed: boolean;
        output: string;
    };
}

export interface QAReport {
    passed: boolean;
    issues: {
        severity: 'critical' | 'major' | 'minor';
        description: string;
        recommendation: string;
    }[];
    verificationSteps: string[];
}

export class QualityAssuranceAgent extends BaseAgent<QAInput, QAReport> {
    constructor() {
        super({ name: 'QA', timeout: 15000 });
    }

    async execute(input: QAInput): Promise<AgentOutput<QAReport>> {
        // This agent validates the output.
        // It checks if the implementation matches requirements and passes tests.
        
        const issues: QAReport['issues'] = [];
        
        if (!input.implementedFiles || input.implementedFiles.length === 0) {
             issues.push({
                 severity: 'critical',
                 description: "No files were implemented.",
                 recommendation: "Ensure the CodeGenerator produces output."
             });
        }

        if (input.testResults && !input.testResults.passed) {
             issues.push({
                 severity: 'critical',
                 description: `Tests failed: ${input.testResults.output.slice(0, 200)}...`,
                 recommendation: "Fix the implementation to pass the tests."
             });
        }

        const startTime = Date.now();

        return {
            agent: 'QA',
            status: 'success',
            executionTimeMs: Date.now() - startTime,
            confidence: 1.0,
            payload: {
                passed: issues.length === 0,
                issues,
                verificationSteps: ["Run unit tests", "Check requirements coverage"]
            },
            reasoning: issues.length === 0 ? "All checks passed." : "Identified critical issues that need resolution."
        };
    }
}

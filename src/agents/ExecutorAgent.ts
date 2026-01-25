/**
 * ExecutorAgent - Validation engine for Byte Coder
 * Executes commands and analyzes results for error recovery
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import { BaseAgent, AgentOutput, ExecutionResult, FileLocation, CodeModification } from '../core/AgentTypes';

import * as fs from 'fs';
import * as path from 'path';

export interface ExecutorInput {
    command?: string;
    commands?: any[]; // Supports strings, CommandSpecs, or operation objects
    cwd?: string;
    timeout?: number;
    expectSuccess?: boolean;
    parseErrors?: boolean;
}

export interface ExecutorOutput extends ExecutionResult {
    duration: number;
    results?: ExecutionResult[]; // For multiple commands
    parsed?: {
        errorType: string;
        errorMessage: string;
        suggestions: string[];
    };
}

export class ExecutorAgent extends BaseAgent<ExecutorInput, ExecutorOutput> {
    // Error pattern matchers
    private readonly ERROR_PATTERNS: { pattern: RegExp; type: string }[] = [
        { pattern: /TypeError: (.+)/i, type: 'TypeError' },
        { pattern: /ReferenceError: (.+)/i, type: 'ReferenceError' },
        { pattern: /SyntaxError: (.+)/i, type: 'SyntaxError' },
        { pattern: /Error: (.+)/i, type: 'Error' },
        { pattern: /Cannot find module '(.+)'/i, type: 'ModuleNotFound' },
        { pattern: /Property '(.+)' does not exist/i, type: 'PropertyError' },
        { pattern: /Type '(.+)' is not assignable/i, type: 'TypeMismatch' },
        { pattern: /Expected (\d+) arguments?, but got (\d+)/i, type: 'ArgumentCount' },
        { pattern: /ENOENT: no such file or directory/i, type: 'FileNotFound' },
        { pattern: /EACCES: permission denied/i, type: 'PermissionDenied' }
    ];

    // File location patterns
    private readonly LOCATION_PATTERNS = [
        /at (.+):(\d+):(\d+)/,  // Standard stack trace
        /(.+\.(?:ts|js|tsx|jsx)):(\d+):(\d+)/,  // TypeScript/JavaScript
        /File "(.+)", line (\d+)/,  // Python
        /(.+\.go):(\d+):/  // Go
    ];

    constructor() {
        super({ name: 'Executor', timeout: 60000 });
    }

    async execute(input: ExecutorInput): Promise<AgentOutput<ExecutorOutput>> {
        const startTime = Date.now();

        try {
            let result: ExecutorOutput;

            // Handle multiple commands
            if (input.commands && input.commands.length > 0) {
                const results: ExecutionResult[] = [];
                let overallSuccess = true;
                let combinedStdout = '';
                let combinedStderr = '';

                for (const cmd of input.commands) {
                    let cmdResult: ExecutorOutput;

                    if (typeof cmd === 'string') {
                        cmdResult = await this.runCommand({ ...input, command: cmd });
                    } else if (cmd.operation === 'create_file') {
                        // Handle file creation directly
                        try {
                             // Ensure directory exists
                             const dir = path.dirname(cmd.target);
                             if (!fs.existsSync(dir)) {
                                 fs.mkdirSync(dir, { recursive: true });
                             }
                             fs.writeFileSync(cmd.target, cmd.content);
                             cmdResult = {
                                 command: `create_file ${cmd.target}`,
                                 exitCode: 0,
                                 stdout: `Created file: ${cmd.target}`,
                                 stderr: '',
                                 success: true,
                                 duration: 0,
                                 recoveryOptions: []
                             };
                        } catch (e) {
                             cmdResult = {
                                 command: `create_file ${cmd.target}`,
                                 exitCode: 1,
                                 stdout: '',
                                 stderr: (e as Error).message,
                                 success: false,
                                 duration: 0,
                                 recoveryOptions: []
                             };
                        }
                    } else if (cmd.command) {
                        // CommandSpec object
                        cmdResult = await this.runCommand({ ...input, command: cmd.command });
                    } else {
                        // Unknown format
                        continue;
                    }

                    results.push(cmdResult);
                    combinedStdout += cmdResult.stdout + '\n';
                    combinedStderr += cmdResult.stderr + '\n';
                    if (!cmdResult.success) overallSuccess = false;
                }

                result = {
                    command: 'multiple_commands',
                    exitCode: overallSuccess ? 0 : 1,
                    stdout: combinedStdout,
                    stderr: combinedStderr,
                    success: overallSuccess,
                    duration: Date.now() - startTime,
                    recoveryOptions: [],
                    results
                };

            } else if (input.command) {
                // Single command
                result = await this.runCommand(input);
            } else {
                throw new Error("No command provided to Executor");
            }

            // Parse errors if requested
            if (input.parseErrors && !result.success) {
                result.parsed = this.parseError(result.stderr || result.stdout);
                result.recoveryOptions = this.generateRecoveryOptions(result);
            }

            const confidence = result.success ? 0.95 : 0.6;

            return this.createOutput(
                result.success ? 'success' : 'partial',
                result,
                confidence,
                startTime,
                {
                    reasoning: result.success
                        ? `Command(s) completed successfully in ${result.duration}ms`
                        : `Command(s) failed with exit code ${result.exitCode}: ${result.parsed?.errorType || 'Unknown error'}`
                }
            );

        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Run a command and capture output
     */
    private runCommand(input: ExecutorInput): Promise<ExecutorOutput> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const cwd = input.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
            const timeout = input.timeout || this.timeout;

            // Ensure command is a string
            const cmdString = input.command || 'echo "No command provided"';

            const child = cp.exec(cmdString, {
                cwd,
                timeout,
                maxBuffer: 10 * 1024 * 1024,  // 10MB buffer
                env: { ...process.env, FORCE_COLOR: '0' }  // Disable color codes
            }, (error: any, stdout: string | Buffer, stderr: string | Buffer) => {
                const duration = Date.now() - startTime;
                const exitCode = error ? (error as any).code || 1 : 0;
                const success = input.expectSuccess !== false ? exitCode === 0 : true;

                const stdoutStr = typeof stdout === 'string' ? stdout : stdout.toString();
                const stderrStr = typeof stderr === 'string' ? stderr : stderr.toString();

                // Try to extract error location
                const errorLocation = this.extractErrorLocation(stderrStr || stdoutStr);

                resolve({
                    command: cmdString,
                    exitCode,
                    stdout: stdoutStr.slice(0, 5000),  // Limit output size
                    stderr: stderrStr.slice(0, 5000),
                    success,
                    duration,
                    errorLocation,
                    recoveryOptions: []
                });
            });

            // Handle timeout
            setTimeout(() => {
                if (child && !child.killed) {
                    try {
                        child.kill();
                    } catch (e) {
                        // ignore
                    }
                }
            }, timeout);
        });
    }

    /**
     * Extract error location from output
     */
    private extractErrorLocation(output: string): FileLocation | undefined {
        for (const pattern of this.LOCATION_PATTERNS) {
            const match = output.match(pattern);
            if (match) {
                return {
                    file: match[1],
                    startLine: parseInt(match[2], 10),
                    endLine: parseInt(match[2], 10),
                    confidence: 0.85,
                    reason: 'Extracted from error output'
                };
            }
        }
        return undefined;
    }

    /**
     * Parse error message for type and details
     */
    private parseError(output: string): { errorType: string; errorMessage: string; suggestions: string[] } {
        for (const { pattern, type } of this.ERROR_PATTERNS) {
            const match = output.match(pattern);
            if (match) {
                return {
                    errorType: type,
                    errorMessage: match[1] || match[0],
                    suggestions: this.getSuggestionsForError(type, match[1])
                };
            }
        }

        return {
            errorType: 'Unknown',
            errorMessage: output.split('\n')[0].slice(0, 200),
            suggestions: ['Check the full error output for details']
        };
    }

    /**
     * Get suggestions for specific error types
     */
    private getSuggestionsForError(errorType: string, details: string): string[] {
        const suggestions: string[] = [];

        switch (errorType) {
            case 'ModuleNotFound':
                suggestions.push(`Run: npm install ${details}`);
                suggestions.push('Check if the module name is spelled correctly');
                suggestions.push('Verify the import path is correct');
                break;
            case 'TypeError':
                suggestions.push('Check if the variable is defined before use');
                suggestions.push('Verify the type matches expected usage');
                suggestions.push('Add null/undefined checks');
                break;
            case 'SyntaxError':
                suggestions.push('Check for missing brackets, quotes, or semicolons');
                suggestions.push('Verify the syntax is valid for your language version');
                break;
            case 'PropertyError':
                suggestions.push('Check if the property name is spelled correctly');
                suggestions.push('Verify the object type has this property');
                suggestions.push('Add the property to the interface if needed');
                break;
            case 'TypeMismatch':
                suggestions.push('Check the expected type and convert if needed');
                suggestions.push('Update the interface to allow this type');
                suggestions.push('Use type assertion if the types are compatible');
                break;
            case 'FileNotFound':
                suggestions.push('Check if the file path is correct');
                suggestions.push('Create the missing file or directory');
                suggestions.push('Verify the current working directory');
                break;
            default:
                suggestions.push('Review the error message for details');
                suggestions.push('Search for similar issues online');
        }

        return suggestions;
    }

    /**
     * Generate recovery options for failed execution
     */
    private generateRecoveryOptions(result: ExecutorOutput): ExecutionResult['recoveryOptions'] {
        const options: ExecutionResult['recoveryOptions'] = [];

        if (!result.parsed) return options;

        switch (result.parsed.errorType) {
            case 'ModuleNotFound':
                const moduleName = result.stderr.match(/Cannot find module '([^']+)'/)?.[1];
                if (moduleName) {
                    options.push({
                        strategy: 'install_missing_module',
                        confidence: 0.9,
                        requiredChanges: []
                    });
                }
                break;
            case 'TypeMismatch':
            case 'PropertyError':
                if (result.errorLocation) {
                    options.push({
                        strategy: 'fix_type_error',
                        confidence: 0.7,
                        requiredChanges: [{
                            filePath: result.errorLocation.file,
                            startLine: result.errorLocation.startLine,
                            endLine: result.errorLocation.endLine,
                            searchBlock: '',  // Would need to be determined
                            replaceBlock: ''  // Would need AI to generate fix
                        }]
                    });
                }
                break;
            case 'SyntaxError':
                options.push({
                    strategy: 'fix_syntax',
                    confidence: 0.6
                });
                break;
        }

        // Always add retry option
        options.push({
            strategy: 'retry_with_verbose',
            confidence: 0.3
        });

        return options;
    }

    /**
     * Run a command and stream output
     */
    async executeWithStreaming(
        input: ExecutorInput,
        onStdout: (data: string) => void,
        onStderr: (data: string) => void
    ): Promise<ExecutorOutput> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const cwd = input.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
            const cmdString = input.command || 'echo "No command provided"';

            let stdout = '';
            let stderr = '';

            const child = cp.spawn(cmdString, {
                shell: true,
                cwd,
                env: { ...process.env, FORCE_COLOR: '0' }
            });

            child.stdout.on('data', (data: Buffer) => {
                const str = data.toString();
                stdout += str;
                onStdout(str);
            });

            child.stderr.on('data', (data: Buffer) => {
                const str = data.toString();
                stderr += str;
                onStderr(str);
            });

            child.on('close', (code: number | null) => {
                resolve({
                    command: cmdString,
                    exitCode: code || 0,
                    stdout: stdout.slice(0, 5000),
                    stderr: stderr.slice(0, 5000),
                    success: code === 0,
                    duration: Date.now() - startTime,
                    recoveryOptions: []
                });
            });

            child.on('error', (error: Error) => {
                resolve({
                    command: cmdString,
                    exitCode: 1,
                    stdout: '',
                    stderr: error.message,
                    success: false,
                    duration: Date.now() - startTime,
                    recoveryOptions: []
                });
            });
        });
    }
}

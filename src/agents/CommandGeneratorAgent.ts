/**
 * CommandGeneratorAgent - OS-aware command builder for Byte Coder
 * Generates safe, platform-specific system commands
 */

import * as os from 'os';
import { BaseAgent, AgentOutput, CommandSpec } from '../core/AgentTypes';
import { TaskPlannerResult } from './TaskPlannerAgent';

export interface CommandGeneratorInput {
    operation?: 'create_file' | 'create_dir' | 'copy' | 'move' | 'delete' | 'run_script' | 'install_deps' | 'custom';
    taskPlan?: TaskPlannerResult;
    target?: string;
    source?: string;
    content?: string;
    customCommand?: string;
    safe?: boolean;
}

export interface CommandGeneratorResult {
    commands: CommandSpec[];
    platform: string;
    requiresConfirmation: boolean;
    warningMessage?: string;
}

export class CommandGeneratorAgent extends BaseAgent<CommandGeneratorInput, CommandGeneratorResult> {
    private platform: 'darwin' | 'linux' | 'windows';

    // Dangerous command patterns that require confirmation
    private readonly DANGEROUS_PATTERNS = [
        /rm\s+-rf/i,
        /del\s+\/s/i,
        /rmdir\s+\/s/i,
        /format\s+/i,
        /dd\s+if=/i,
        />\s*\/dev\//i,
        /chmod\s+777/i,
        /sudo\s+rm/i,
        /drop\s+database/i,
        /truncate\s+table/i
    ];

    constructor() {
        super({ name: 'CommandGenerator', timeout: 5000 });

        const platform = os.platform();
        if (platform === 'darwin') this.platform = 'darwin';
        else if (platform === 'win32') this.platform = 'windows';
        else this.platform = 'linux';
    }

    async execute(input: CommandGeneratorInput): Promise<AgentOutput<CommandGeneratorResult>> {
        const startTime = Date.now();

        try {
            const commands: CommandSpec[] = [];
            let requiresConfirmation = false;
            let warningMessage: string | undefined;

            // Handle task plan if provided
            if (input.taskPlan) {
                for (const task of input.taskPlan.taskGraph) {
                    if (task.validationCommand) {
                        commands.push({
                            command: task.validationCommand,
                            args: [],
                            platform: 'all',
                            description: task.description
                        });
                    }
                }
            }

            switch (input.operation) {
                    case 'create_file':
                    commands.push(...this.generateCreateFileCommands(input.target!, input.content));
                    break;
                case 'create_dir':
                    commands.push(this.generateMkdirCommand(input.target!));
                    break;
                case 'copy':
                    commands.push(this.generateCopyCommand(input.source!, input.target!));
                    break;
                case 'move':
                    commands.push(this.generateMoveCommand(input.source!, input.target!));
                    break;
                case 'delete':
                    const deleteResult = this.generateDeleteCommand(input.target!);
                    commands.push(deleteResult.command);
                    requiresConfirmation = true;
                    warningMessage = deleteResult.warning;
                    break;
                case 'run_script':
                    commands.push(this.generateRunScriptCommand(input.target!));
                    break;
                case 'install_deps':
                    commands.push(this.generateInstallCommand());
                    break;
                case 'custom':
                    if (input.customCommand) {
                        const customResult = this.processCustomCommand(input.customCommand);
                        commands.push(customResult.command);
                        requiresConfirmation = customResult.dangerous;
                        if (customResult.dangerous) {
                            warningMessage = 'This command may have destructive effects';
                        }
                    }
                    break;
            }

            // Check for dangerous patterns in all commands
            for (const cmd of commands) {
                if (this.isDangerousCommand(cmd.command)) {
                    requiresConfirmation = true;
                    warningMessage = 'Command contains potentially destructive operations';
                    cmd.requiresConfirmation = true;
                }
            }

            const result: CommandGeneratorResult = {
                commands,
                platform: this.platform,
                requiresConfirmation,
                warningMessage
            };

            return this.createOutput('success', result, 0.9, startTime, {
                reasoning: `Generated ${commands.length} commands for ${this.platform}`
            });

        } catch (error) {
            return this.handleError(error as Error, startTime);
        }
    }

    /**
     * Generate file creation commands
     */
    private generateCreateFileCommands(filePath: string, content?: string): CommandSpec[] {
        const commands: CommandSpec[] = [];
        const dir = filePath.split('/').slice(0, -1).join('/');

        // Create parent directory if needed
        if (dir) {
            commands.push(this.generateMkdirCommand(dir));
        }

        if (content) {
            // Use heredoc or echo based on content complexity
            if (content.includes('\n')) {
                if (this.platform === 'windows') {
                    // Windows: Use echo with append
                    const lines = content.split('\n');
                    commands.push({
                        command: `echo.>${filePath}`,
                        args: [],
                        platform: 'windows',
                        description: 'Create empty file'
                    });
                    for (const line of lines) {
                        commands.push({
                            command: `echo ${this.escapeForShell(line)}>>${filePath}`,
                            args: [],
                            platform: 'windows',
                            description: 'Append line'
                        });
                    }
                } else {
                    // Unix: Use cat with heredoc
                    commands.push({
                        command: `cat > ${filePath} << 'EOF'\n${content}\nEOF`,
                        args: [],
                        platform: 'all',
                        description: `Create file with content: ${filePath}`
                    });
                }
            } else {
                commands.push({
                    command: this.platform === 'windows'
                        ? `echo ${this.escapeForShell(content)}>${filePath}`
                        : `echo '${this.escapeForShell(content)}' > ${filePath}`,
                    args: [],
                    platform: this.platform,
                    description: `Create file: ${filePath}`
                });
            }
        } else {
            // Create empty file
            commands.push({
                command: this.platform === 'windows' ? `type nul > ${filePath}` : `touch ${filePath}`,
                args: [],
                platform: this.platform,
                description: `Create empty file: ${filePath}`
            });
        }

        return commands;
    }

    /**
     * Generate mkdir command
     */
    private generateMkdirCommand(dir: string): CommandSpec {
        return {
            command: this.platform === 'windows'
                ? `mkdir "${dir}"`
                : `mkdir -p "${dir}"`,
            args: [],
            platform: this.platform,
            description: `Create directory: ${dir}`
        };
    }

    /**
     * Generate copy command
     */
    private generateCopyCommand(source: string, target: string): CommandSpec {
        const cmd = this.platform === 'windows'
            ? `copy "${source}" "${target}"`
            : `cp "${source}" "${target}"`;

        return {
            command: cmd,
            args: [],
            platform: this.platform,
            description: `Copy ${source} to ${target}`
        };
    }

    /**
     * Generate move command
     */
    private generateMoveCommand(source: string, target: string): CommandSpec {
        const cmd = this.platform === 'windows'
            ? `move "${source}" "${target}"`
            : `mv "${source}" "${target}"`;

        return {
            command: cmd,
            args: [],
            platform: this.platform,
            description: `Move ${source} to ${target}`
        };
    }

    /**
     * Generate delete command with safety warning
     */
    private generateDeleteCommand(target: string): { command: CommandSpec; warning: string } {
        const isDirectory = !target.includes('.');
        let cmd: string;

        if (this.platform === 'windows') {
            cmd = isDirectory ? `rmdir /s /q "${target}"` : `del "${target}"`;
        } else {
            cmd = isDirectory ? `rm -rf "${target}"` : `rm "${target}"`;
        }

        return {
            command: {
                command: cmd,
                args: [],
                platform: this.platform,
                requiresConfirmation: true,
                description: `Delete: ${target}`
            },
            warning: `This will permanently delete ${target}. This action cannot be undone.`
        };
    }

    /**
     * Generate script run command
     */
    private generateRunScriptCommand(script: string): CommandSpec {
        let cmd: string;

        if (script.endsWith('.ts')) {
            cmd = `npx ts-node ${script}`;
        } else if (script.endsWith('.js')) {
            cmd = `node ${script}`;
        } else if (script.endsWith('.py')) {
            cmd = `python3 ${script}`;
        } else if (script.endsWith('.sh')) {
            cmd = this.platform === 'windows' ? `bash ${script}` : `sh ${script}`;
        } else {
            cmd = this.platform === 'windows' ? script : `./${script}`;
        }

        return {
            command: cmd,
            args: [],
            platform: this.platform,
            description: `Run script: ${script}`
        };
    }

    /**
     * Generate package install command
     */
    private generateInstallCommand(): CommandSpec {
        return {
            command: 'npm install',
            args: [],
            platform: 'all',
            description: 'Install dependencies'
        };
    }

    /**
     * Process custom command with safety check
     */
    private processCustomCommand(command: string): { command: CommandSpec; dangerous: boolean } {
        const dangerous = this.isDangerousCommand(command);

        return {
            command: {
                command,
                args: [],
                platform: 'all',
                requiresConfirmation: dangerous,
                description: dangerous ? 'Custom command (requires confirmation)' : 'Custom command'
            },
            dangerous
        };
    }

    /**
     * Check if command is dangerous
     */
    private isDangerousCommand(command: string): boolean {
        return this.DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
    }

    /**
     * Escape string for shell
     */
    private escapeForShell(str: string): string {
        if (this.platform === 'windows') {
            return str.replace(/[&|<>^]/g, '^$&').replace(/"/g, '""');
        } else {
            return str.replace(/'/g, "'\"'\"'");
        }
    }

    /**
     * Format commands as executable script
     */
    formatAsScript(result: CommandGeneratorResult): string {
        const lines: string[] = [];

        if (this.platform === 'windows') {
            lines.push('@echo off');
        } else {
            lines.push('#!/bin/bash');
            lines.push('set -e');
        }
        lines.push('');

        for (const cmd of result.commands) {
            lines.push(`echo "Running: ${cmd.description}"`);
            lines.push(cmd.command);
            lines.push('');
        }

        return lines.join('\n');
    }
}

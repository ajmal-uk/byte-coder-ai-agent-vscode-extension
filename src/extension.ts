import * as vscode from 'vscode';
import { ChatPanel } from './ChatViewProvider';
import { Logger } from './core/Logger';

export function activate(context: vscode.ExtensionContext) {
    Logger.initialize('Byte Coder AI');
    Logger.info('Byte AI Coding Assistant is now active!');

    const provider = new ChatPanel(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatPanel.viewType, provider)
    );

    // Auto-focus the chat view on load
    vscode.commands.executeCommand('byteAI.chatView.focus');

    context.subscriptions.push(
        vscode.commands.registerCommand('byteAI.clearChat', () => {
            provider.clearChat();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('byteAI.explainCode', () => {
            provider.runCommand('explain');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('byteAI.fixCode', () => {
            provider.runCommand('fix');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('byteAI.refactorCode', () => {
            provider.runCommand('refactor');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('byteAI.generateTest', () => {
            provider.runCommand('test');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('byteAI.generateDocs', () => {
            provider.runCommand('doc');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('byteAI.quickAsk', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showWarningMessage('Please select some code first.');
                return;
            }

            const question = await vscode.window.showInputBox({
                prompt: 'What would you like to know about this code?',
                placeHolder: 'e.g., How does this function work?'
            });

            if (question) {
                provider.quickAsk(question);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('byteAI.optimizeCode', () => {
            provider.runCommand('optimize');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('byteAI.securityCheck', () => {
            provider.runCommand('security');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('byteAI.reviewCode', () => {
            provider.runCommand('review');
        })
    );
}

export function deactivate() { }

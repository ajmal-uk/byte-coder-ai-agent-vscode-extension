import * as vscode from 'vscode';

export class Logger {
    private static _outputChannel: vscode.OutputChannel;

    public static initialize(channelName: string) {
        this._outputChannel = vscode.window.createOutputChannel(channelName);
    }

    public static log(message: string, ...args: any[]) {
        if (!this._outputChannel) {
            console.log(message, ...args);
            return;
        }
        const timestamp = new Date().toLocaleTimeString();
        const formattedArgs = args.length ? ` ${JSON.stringify(args)}` : '';
        this._outputChannel.appendLine(`[${timestamp}] ${message}${formattedArgs}`);
    }

    public static info(message: string, ...args: any[]) {
        this.log(`INFO: ${message}`, ...args);
    }

    public static error(message: string, error?: any) {
        this.log(`ERROR: ${message}`, error ? error : '');
        if (error instanceof Error && error.stack) {
            this._outputChannel.appendLine(error.stack);
        }
    }

    public static warn(message: string, ...args: any[]) {
        this.log(`WARN: ${message}`, ...args);
    }

    public static show() {
        this._outputChannel?.show(true);
    }
}

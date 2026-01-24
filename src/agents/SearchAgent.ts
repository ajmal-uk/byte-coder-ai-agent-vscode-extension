import * as vscode from 'vscode';

export class SearchAgent {
    
    async getProjectMap(): Promise<string> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) return 'No workspace open';
        
        try {
            // Get top level files and directories
            const rootPath = folders[0].uri;
            const entries = await vscode.workspace.fs.readDirectory(rootPath);
            
            let structure = "Project Structure (Root):\n";
            let count = 0;
            
            for (const [name, type] of entries) {
                if (name.startsWith('.') || name === 'node_modules' || name === 'dist' || name === 'out' || name === 'build') continue;
                if (count > 20) {
                    structure += `  ... (and more)\n`;
                    break;
                }
                
                const typeName = type === vscode.FileType.Directory ? 'DIR' : 'FILE';
                structure += `  - ${name} [${typeName}]\n`;
                count++;
            }
            
            return structure;
        } catch (e) {
            return "Could not read project structure.";
        }
    }

    async search(query: string, activeFilePath?: string): Promise<string> {
        if (!query || query.length < 3) return '';

        try {
            // 1. Search for files by name
            const fileMatches = await vscode.workspace.findFiles(`**/*${query.split(' ').join('*')}*`, '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/.bytecoder/**}', 10);
            
            let result = "";
            
            if (fileMatches.length > 0) {
                result += `\n**Found Files:**\n`;
                for (const file of fileMatches) {
                    const relativePath = vscode.workspace.asRelativePath(file);
                    result += `- [${relativePath}](${file.fsPath})\n`;
                }
            }

            // 2. Search for content (grep)
            // Use a simplified grep via findTextInFiles or similar if available, or just skip for now to avoid performance hit
            // We'll rely on VS Code's text search if needed, but for now file search is safer/faster.
            
            return result;
        } catch (e) {
            console.error('SearchAgent Error:', e);
            return '';
        }
    }
}

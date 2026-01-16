
import * as vscode from 'vscode';

export class ChatViewHtml {
    public static getHtml(webview: vscode.Webview, extensionUri: vscode.Uri, icons: any): string {
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'images', 'logo.png'));

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; img-src ${webview.cspSource} https: data:; font-src https:;">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            
            <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

            <style>
                :root {
                    /* Base Colors */
                    --bg-app: var(--vscode-sideBar-background);
                    --bg-hover: var(--vscode-list-hoverBackground);
                    --text-primary: var(--vscode-editor-foreground);
                    --text-secondary: var(--vscode-descriptionForeground);
                    --border: var(--vscode-panel-border);
                    --accent: var(--vscode-button-background);
                    --accent-foreground: var(--vscode-button-foreground);
                    --accent-hover: var(--vscode-button-hoverBackground);
                    --input-bg: var(--vscode-input-background);
                    --input-fg: var(--vscode-input-foreground);
                    --input-border: var(--vscode-input-border);
                    
                    /* Premium Gradients & Effects */
                    /* Logo Palette: Blue -> Cyan -> Yellow -> Orange */
                    /* Logo Palette: Cyan -> Blue -> Gold -> Orange */
                    --gradient-primary: linear-gradient(135deg, #00C6FF 0%, #0072FF 40%, #FFD700 70%, #FF7F00 100%);
                    --accent: #0072FF;
                    --gradient-overlay: linear-gradient(180deg, rgba(255,255,255,0.02), transparent);
                    --glass-bg: rgba(30, 30, 30, 0.6);
                    --glass-border: rgba(255, 255, 255, 0.08);
                    
                    /* Shadows */
                    --shadow-sm: 0 2px 8px rgba(0,0,0,0.1);
                    --shadow-md: 0 6px 16px rgba(0,0,0,0.15);
                    --shadow-lg: 0 12px 32px rgba(0,0,0,0.25);
                    --shadow-glow: 0 0 20px rgba(59, 130, 246, 0.15);
                    
                    /* Code Blocks */
                    --code-bg: var(--vscode-editor-background);
                    --code-header-bg: var(--vscode-editorGroupHeader-tabsBackground);
                    
                    /* Font Fallbacks */
                    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
                }

                body {
                    margin: 0; padding: 0;
                    background: var(--bg-app);
                    color: var(--text-primary);
                    font-family: var(--vscode-font-family, 'Inter', system-ui, sans-serif);
                    height: 100vh;
                    display: flex; flex-direction: column;
                    overflow: hidden;
                    background-image: radial-gradient(circle at top right, rgba(59, 130, 246, 0.05), transparent 600px);
                }
                
                body::before {
                    content: ''; position: absolute; inset: 0;
                    background-image: radial-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px);
                    background-size: 20px 20px; pointer-events: none; z-index: -1;
                    opacity: 0.5;
                }

                /* Premium Scrollbar */
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-thumb { background: rgba(127,127,127,0.2); border-radius: 3px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(127,127,127,0.4); }
                ::-webkit-scrollbar-track { background: transparent; }

                /* Glass Header */
                header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 0 16px; height: 52px;
                    border-bottom: 1px solid var(--glass-border);
                    background: rgba(30, 30, 30, 0.6); position: sticky; top: 0; z-index: 100;
                    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
                    box-shadow: 0 4px 20px -5px rgba(0,0,0,0.3);
                }
                
                header::after {
                    content: ''; position: absolute; bottom: -1px; left: 0; right: 0;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, var(--accent), transparent);
                    opacity: 0.6;
                }

                .brand {
                    font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 10px;
                    background: var(--gradient-primary);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    letter-spacing: -0.01em;
                }
                .logo-img { 
                    width: 24px; height: 24px; object-fit: contain; 
                    filter: drop-shadow(0 2px 4px rgba(59, 130, 246, 0.25)); 
                    transition: transform 0.3s ease;
                }
                .brand:hover .logo-img { transform: rotate(10deg) scale(1.05); }
                
                .header-actions { display: flex; align-items: center; gap: 6px; }

                .btn-icon {
                    background: transparent; border: 1px solid transparent; color: var(--text-secondary);
                    cursor: pointer; padding: 6px; border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .btn-icon:hover { 
                    background: var(--bg-hover); color: var(--text-primary); 
                    transform: translateY(-1px);
                    box-shadow: var(--shadow-sm);
                }
                .btn-icon:active { transform: translateY(0); }

                /* Chat Area */
                #chat-container {
                    flex: 1; overflow-y: auto; padding: 14px 18px;
                    display: flex; flex-direction: column; gap: 12px;
                    scroll-behavior: smooth;
                    mask-image: linear-gradient(to bottom, transparent, black 16px);
                    -webkit-mask-image: linear-gradient(to bottom, transparent, black 16px);
                }

                /* Messages */
                .message { 
                    display: flex; flex-direction: column; gap: 6px; 
                    max-width: 100%; 
                    animation: slideIn 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); 
                }
                @keyframes slideIn { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
                
                .content { position: relative; font-size: 14px; line-height: 1.6; word-wrap: break-word; }
                
                /* User Message */
                .message.user { align-items: flex-end; }
                .message.user .content {
                    background: var(--accent); color: var(--accent-foreground);
                    padding: 12px 18px; border-radius: 18px;
                    border-bottom-right-radius: 4px;
                    max-width: 85%;
                    box-shadow: var(--shadow-md);
                    border: 1px solid rgba(255,255,255,0.1);
                    background-image: var(--gradient-overlay);
                }

                .message.assistant { align-items: flex-start; width: 100%; }
                .message.assistant .content {
                    background: transparent;
                    border: none;
                    padding: 4px 0;
                    max-width: 100%;
                    color: var(--text-primary);
                }

                /* Inline Thinking Indicator - Minimal Design */
                .thinking-indicator {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: rgba(59, 130, 246, 0.08);
                    border-radius: 12px;
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    animation: fadeIn 0.3s ease;
                    max-width: fit-content;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                .thinking-dots {
                    display: flex;
                    gap: 4px;
                }
                
                .thinking-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--accent);
                    animation: dotPulse 1.4s ease-in-out infinite;
                }
                
                .thinking-dot:nth-child(1) { animation-delay: 0s; }
                .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
                .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
                
                @keyframes dotPulse {
                    0%, 80%, 100% { 
                        opacity: 0.3;
                        transform: scale(0.8);
                    }
                    40% { 
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                
                .thinking-text {
                    font-size: 13px;
                    color: var(--accent);
                    font-weight: 500;
                }

                /* Markdown Styles */
                .content p { margin: 8px 0; }
                .content p:first-child { margin-top: 0; }
                .content p:last-child { margin-bottom: 0; }
                .content strong { font-weight: 600; color: var(--text-primary); }
                .content a { color: var(--accent); text-decoration: none; }
                .content a:hover { text-decoration: underline; }
                
                /* Inline Code */
                .content :not(pre) > code {
                    font-family: var(--font-mono); font-size: 12px;
                    background: rgba(127,127,127,0.12); padding: 3px 6px; border-radius: 6px; 
                    color: var(--text-primary);
                    border: 1px solid rgba(127,127,127,0.1);
                }
                
                /* Code Blocks - Premium */
                .content pre {
                    background: var(--code-bg);
                    border: 1px solid var(--border); border-radius: 12px;
                    margin: 16px 0; overflow: hidden;
                    box-shadow: var(--shadow-md);
                    transition: all 0.2s ease;
                }
                .content pre:hover {
                    box-shadow: var(--shadow-lg);
                    border-color: var(--accent);
                }
                
                .code-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 10px 16px; background: var(--code-header-bg);
                    border-bottom: 1px solid var(--border);
                }
                
                .window-dots { display: flex; gap: 6px; opacity: 0.7; }
                .dot { width: 10px; height: 10px; border-radius: 50%; }
                .dot.red { background: #ff5f56; }
                .dot.yellow { background: #ffbd2e; }
                .dot.green { background: #27c93f; }
                
                .code-lang { 
                    font-size: 11px; font-weight: 700; color: var(--text-secondary); 
                    text-transform: uppercase; letter-spacing: 0.5px;
                }
                
                .code-actions { display: flex; gap: 8px; }

                .copy-btn {
                    padding: 4px 8px; font-size: 11px; border-radius: 6px;
                    background: rgba(255,255,255,0.05); border: 1px solid transparent;
                    color: var(--text-secondary); cursor: pointer;
                    display: flex; align-items: center; gap: 6px;
                    transition: all 0.2s; font-weight: 500;
                }
                .copy-btn:hover { 
                    background: var(--accent); color: white; border-color: transparent;
                    transform: translateY(-1px);
                }
                
                .content pre code { 
                    display: block; padding: 16px; overflow-x: auto; 
                    font-size: 13px; line-height: 1.5;
                }

                /* Simple Typing Indicator - fallback */
                .typing-indicator {
                    display: none;
                }

                /* Input Section - Floating Style */
                .input-section {
                    padding: 20px; background: transparent;
                    position: relative; z-index: 20;
                }
                /* Gradient Mask for scroll transition */
                .input-section::before {
                    content: ''; position: absolute; inset: 0;
                    background: var(--bg-app);
                    mask-image: linear-gradient(to bottom, transparent, black 12px);
                    -webkit-mask-image: linear-gradient(to bottom, transparent, black 12px);
                    backdrop-filter: blur(8px);
                    z-index: -1;
                    border-top: 1px solid var(--border);
                }

                .input-box {
                    background: var(--input-bg); border: 1px solid var(--border);
                    border-radius: 16px; padding: 12px 14px;
                    display: flex; flex-direction: column; gap: 8px;
                    transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
                    box-shadow: var(--shadow-md);
                }
                
                /* Highlighting */
                .input-wrapper { position: relative; width: 100%; }
                .input-highlight {
                    position: absolute; top: 0; left: 0; right: 0;
                    pointer-events: none; white-space: pre-wrap; word-wrap: break-word;
                    font-family: inherit; font-size: 14px; line-height: 1.4;
                    padding: 4px 0; color: transparent;
                    max-height: 200px; overflow: hidden;
                }
                .input-highlight .mention {
                    color: transparent; background: rgba(0, 198, 255, 0.15);
                    border-radius: 6px; padding: 0 6px;
                    border: 1px solid rgba(0, 198, 255, 0.3);
                }
                .input-highlight .command {
                    color: transparent; background: rgba(255, 127, 0, 0.15);
                    border-radius: 6px; padding: 0 6px;
                    border: 1px solid rgba(255, 127, 0, 0.3);
                }
                
                /* Scroll to Bottom Button */
                #scrollToBottomBtn {
                    position: fixed; bottom: 100px; right: 24px;
                    width: 38px; height: 38px; border-radius: 50%;
                    background: var(--accent); color: white;
                    border: none; cursor: pointer; display: none;
                    align-items: center; justify-content: center;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    z-index: 90; backdrop-filter: blur(8px);
                }
                #scrollToBottomBtn:hover { transform: translateY(-4px) scale(1.1); box-shadow: var(--shadow-glow); }
                #scrollToBottomBtn.show { display: flex; animation: bounceIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                @keyframes bounceIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }

                textarea {
                    position: relative; z-index: 1;
                    width: 100%; border: none; background: transparent; color: var(--input-fg);
                    font-family: inherit; font-size: 14px; resize: none; outline: none;
                    max-height: 200px; min-height: 24px; padding: 4px 0; line-height: 1.4;
                }
                
                .input-actions { display: flex; justify-content: flex-end; align-items: center; }
                
                .btn-send {
                    background: var(--accent); color: white; border: none;
                    border-radius: 10px; width: 34px; height: 34px;
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                    box-shadow: var(--shadow-sm);
                }
                .btn-send:hover { background: var(--accent-hover); transform: scale(1.1) rotate(-10deg); box-shadow: var(--shadow-glow); }
                .btn-send span { display: none; }

                .btn-stop {
                    background: #ef4444; color: white; border: none;
                    border-radius: 10px; width: 34px; height: 34px;
                    cursor: pointer; display: none; align-items: center; justify-content: center;
                    transition: all 0.2s;
                }
                .btn-stop:hover { background: #dc2626; transform: scale(1.05); }

                /* Session Drawer - Full Window Overlay */
                #session-drawer {
                    position: absolute; top: 0; right: 0; bottom: 0; width: 0;
                    background: var(--bg-app); 
                    transition: width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
                    overflow: hidden; z-index: 100;
                    display: flex; flex-direction: column;
                }
                #session-drawer.open { width: 100%; }
                
                .drawer-header {
                    padding: 0; border-bottom: 1px solid var(--border);
                    background: var(--bg-app);
                    display: flex; flex-direction: column;
                }

                .drawer-top-bar {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 16px 20px 8px 20px;
                    font-size: 13px; font-weight: 600; color: var(--text-secondary);
                }

                .search-container {
                    padding: 0 16px 16px 16px;
                }
                
                .session-search-input {
                    box-sizing: border-box; /* ensure padding doesn't overflow */
                    width: 100%;
                    padding: 8px 12px;
                    border-radius: 8px;
                    background: var(--input-bg);
                    border: 1px solid var(--border);
                    color: var(--text-primary);
                    font-family: inherit; font-size: 13px;
                    outline: none; transition: all 0.2s;
                }
                .session-search-input:focus {
                    border-color: var(--accent);
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                }
                .session-search-input::placeholder { color: var(--text-secondary); opacity: 0.7; }

                .session-list { flex: 1; overflow-y: auto; padding: 12px 16px; }
                
                /* Session Group Header */
                .session-group-header {
                    padding: 8px 4px; font-size: 11px; font-weight: 600; 
                    color: var(--text-secondary); text-transform: uppercase; 
                    margin-top: 12px; letter-spacing: 0.5px;
                }
                .session-group-header:first-child { margin-top: 0; }

                /* Session Item Card */
                .session-link {
                    padding: 12px; border-radius: 12px; cursor: pointer;
                    display: flex; justify-content: space-between; align-items: center;
                    margin-bottom: 6px; border: 1px solid transparent;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    background: transparent;
                }
                .session-link:hover { 
                    background: var(--bg-hover); 
                    transform: translateY(-1px);
                    box-shadow: var(--shadow-sm);
                }
                
                /* Current Active Session Styling */
                .session-link.active { 
                    background: rgba(59, 130, 246, 0.1); 
                    border: 1px solid rgba(59, 130, 246, 0.2); 
                }
                .session-link.active .session-title { color: var(--accent); font-weight: 600; }
                
                .session-info { display: flex; flex-direction: column; gap: 4px; overflow: hidden; flex: 1; margin-right: 12px; }
                
                .session-title {
                    font-size: 13px; color: var(--text-primary);
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .session-meta {
                    display: flex; align-items: center; gap: 6px;
                    font-size: 11px; color: var(--text-secondary);
                }

                .session-actions {
                    display: flex; align-items: center; gap: 4px; opacity: 0;
                    transition: opacity 0.2s;
                }
                .session-link:hover .session-actions, .session-link.active .session-actions { opacity: 1; }
                
                .btn-session-action {
                    color: var(--text-secondary); cursor: pointer; padding: 6px; 
                    border-radius: 6px; transition: all 0.2s;
                    display: flex; align-items: center; justify-content: center;
                    border: none; background: transparent;
                }
                .btn-session-action:hover { background: var(--bg-hover); color: var(--text-primary); }
                .btn-session-action.delete:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
                
                .drawer-footer { padding: 16px; border-top: 1px solid var(--border); background: var(--bg-app); }
                .btn-clear {
                    width: 100%; border: 1px solid var(--border); color: #ef4444; background: transparent;
                    padding: 10px; border-radius: 8px; font-size: 12px; cursor: pointer; font-weight: 500;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    transition: all 0.2s;
                }
                .btn-clear:hover { background: rgba(239, 68, 68, 0.08); border-color: #ef4444; transform: translateY(-1px); }

                @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }

                /* Premium Empty State */
                .empty-state {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    text-align: center; height: 100%; padding-bottom: 40px;
                    position: relative;
                }
                
                /* Floating Particles Background */
                .empty-state::before {
                    content: ''; position: absolute; width: 200px; height: 200px;
                    background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
                    border-radius: 50%; filter: blur(40px);
                    animation: float 10s infinite ease-in-out;
                    z-index: -1;
                }
                @keyframes float { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-20px, 20px) scale(1.1); } }

                .empty-greeting {
                    font-size: 36px; font-weight: 800; 
                    background: var(--gradient-primary); 
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                    margin-bottom: 12px; letter-spacing: -1px;
                    filter: drop-shadow(0 4px 12px rgba(0, 114, 255, 0.25));
                    animation: slideDown 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
                }
                @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
                
                .empty-subtitle {
                    font-size: 15px; color: var(--text-secondary); margin-bottom: 40px; max-width: 320px; line-height: 1.6;
                    opacity: 0.8;
                }
                
                .quick-actions {
                    display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; max-width: 360px;
                }
                .action-card {
                    background: var(--bg-hover); border: 1px solid var(--border);
                    border-radius: 16px; padding: 20px; cursor: pointer;
                    display: flex; flex-direction: column; gap: 10px; align-items: flex-start;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
                    position: relative; overflow: hidden;
                    backdrop-filter: blur(10px);
                    animation: cardEnter 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
                }
                .action-card:nth-child(1) { animation-delay: 0.1s; }
                .action-card:nth-child(2) { animation-delay: 0.2s; }
                .action-card:nth-child(3) { animation-delay: 0.3s; }
                .action-card:nth-child(4) { animation-delay: 0.4s; }

                @keyframes cardEnter {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .action-card:hover { 
                    transform: translateY(-5px);
                    box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.3);
                    border-color: var(--accent);
                    background: linear-gradient(180deg, var(--bg-hover) 0%, rgba(0, 114, 255, 0.08) 100%);
                }
                
                .action-icon {
                    width: 44px; height: 44px; border-radius: 12px;
                    background: linear-gradient(135deg, rgba(0,198,255,0.1), rgba(0,114,255,0.1));
                    color: var(--accent);
                    display: flex; align-items: center; justify-content: center; font-size: 20px;
                    transition: all 0.3s ease; box-shadow: 0 4px 6px -2px rgba(0,0,0,0.05);
                }
                .action-card:hover .action-icon { 
                    transform: scale(1.1) rotate(5deg); 
                    background: var(--gradient-primary); 
                    color: white;
                    box-shadow: 0 8px 15px -4px rgba(0, 114, 255, 0.4);
                }
                
                .action-title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-top: 4px; }
                .action-desc { font-size: 11px; color: var(--text-secondary); line-height: 1.4; font-weight: 500; text-align: left; }

                /* Command Popup Styling */
                .command-popup {
                    position: absolute; bottom: 100%; left: 0; right: 0;
                    background: var(--bg-app); border: 1px solid var(--border);
                    border-radius: 12px; padding: 6px; margin-bottom: 12px;
                    box-shadow: var(--shadow-lg);
                    display: none; animation: slideUp 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                    backdrop-filter: blur(16px);
                }
                .command-popup.show { display: block; }
                @keyframes slideUp { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
                
                .command-item {
                    padding: 8px 12px; border-radius: 8px; cursor: pointer;
                    display: flex; align-items: center; gap: 10px;
                    transition: all 0.1s ease;
                }
                .command-item:hover, .command-item.selected { background: var(--accent); color: white; }
                .command-item:hover .cmd-key, .command-item.selected .cmd-key { color: white; }
                .command-item:hover .cmd-desc, .command-item.selected .cmd-desc { color: rgba(255,255,255,0.8); }

                .cmd-key {
                    font-family: var(--font-mono); font-size: 12px;
                    font-weight: 600; color: var(--accent); min-width: 80px;
                }
                .cmd-desc { font-size: 12px; color: var(--text-secondary); }

                /* File Popup */
                .file-popup {
                    position: absolute; bottom: 100%; left: 0; right: 0;
                    background: var(--bg-app); border: 1px solid var(--border);
                    border-radius: 12px; padding: 6px; margin-bottom: 12px;
                    box-shadow: var(--shadow-lg);
                    max-height: 240px; overflow-y: auto;
                    display: none; animation: slideUp 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                    backdrop-filter: blur(16px);
                }
                .file-popup.show { display: block; }

                .file-item {
                    padding: 6px 10px; border-radius: 8px; cursor: pointer;
                    display: flex; align-items: center; gap: 8px;
                    font-size: 13px; color: var(--text-secondary);
                    transition: all 0.1s ease;
                }
                .file-item:hover, .file-item.selected { background: var(--accent); color: white; }
                .file-item:hover .file-path, .file-item.selected .file-path { color: rgba(255,255,255,0.7); }
                .file-item:hover .file-icon, .file-item.selected .file-icon { color: white !important; }
                
                .file-icon { 
                    font-size: 16px; width: 16px; height: 16px; 
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0.8;
                }
                
                .file-info {
                    display: flex; flex-direction: column; overflow: hidden;
                }
                .file-name {
                    font-weight: 500; font-size: 12px; color: var(--text-primary);
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .file-path {
                    font-size: 9px; color: var(--text-secondary); opacity: 0.7;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                
                /* Icon Colors */
                .icon-ts { color: #3178c6; }
                .icon-js { color: #f7df1e; }
                .icon-json { color: #f1c40f; }
                .icon-md { color: #adadad; }
                .icon-css { color: #264de4; }
                .icon-html { color: #e34c26; }
                .icon-py { color: #3572A5; }

                /* Settings Drawer */
                #settings-drawer {
                    position: absolute; top: 0; right: 0; bottom: 0; width: 0;
                    background: var(--bg-app);
                    transition: width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
                    overflow: hidden; z-index: 100;
                    display: flex; flex-direction: column;
                }
                #settings-drawer.open { width: 100%; }

                .settings-content { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
                
                .setting-group { display: flex; flex-direction: column; gap: 8px; }
                .setting-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
                .setting-icon { opacity: 0.7; display: flex; align-items: center; }
                .setting-info { flex: 1; }
                .setting-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
                .setting-desc { font-size: 12px; color: var(--text-secondary); opacity: 0.8; line-height: 1.4; }
                .settings-divider { height: 1px; background: var(--border); margin: 4px 0; }
                .drawer-title { display: flex; align-items: center; gap: 8px; font-weight: 600; }
                
                .setting-input {
                    background: var(--input-bg); border: 1px solid var(--border); color: var(--text-primary);
                    padding: 12px; border-radius: 8px; font-family: inherit; font-size: 13px; resize: vertical;
                    min-height: 100px; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
                }
                .setting-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(0, 114, 255, 0.15); }
                .setting-input::placeholder { color: var(--text-secondary); opacity: 0.6; }

                /* Keyboard Shortcuts */
                .keyboard-shortcuts .setting-header { margin-bottom: 12px; }
                .shortcuts-grid { display: flex; flex-direction: column; gap: 8px; }
                .shortcut-item { 
                    display: flex; justify-content: space-between; align-items: center; 
                    padding: 8px 12px; background: var(--bg-hover); border-radius: 6px;
                }
                .shortcut-key { 
                    font-family: var(--font-mono); font-size: 11px; font-weight: 500;
                    background: var(--bg-app); padding: 4px 8px; border-radius: 4px;
                    border: 1px solid var(--border); color: var(--text-primary);
                }
                .shortcut-action { font-size: 12px; color: var(--text-secondary); }
                
                /* Save Button */
                .btn-save {
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    width: 100%; padding: 12px 16px; border: none; border-radius: 8px;
                    background: var(--accent); color: var(--accent-foreground);
                    font-size: 13px; font-weight: 500; cursor: pointer;
                    transition: all 0.2s; box-shadow: var(--shadow-sm);
                }
                .btn-save:hover { background: var(--accent-hover); transform: translateY(-1px); box-shadow: var(--shadow-md); }



                /* Toggle Switch */
                .setting-row { display: flex; justify-content: space-between; align-items: center; }
                .switch { position: relative; display: inline-block; width: 40px; height: 20px; }
                .switch input { opacity: 0; width: 0; height: 0; }
                .slider {
                    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                    background-color: var(--bg-hover); transition: .4s; border-radius: 20px;
                }
                .slider:before {
                    position: absolute; content: ""; height: 16px; width: 16px;
                    left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%;
                }
                input:checked + .slider { background-color: var(--accent); }
                input:checked + .slider:before { transform: translateX(20px); }

                /* Toast Notifications */
                #toast-container {
                    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
                    z-index: 1000; display: flex; flex-direction: column; gap: 8px;
                    width: 90%; max-width: 400px; pointer-events: none;
                }
                .toast {
                    background: var(--bg-app); border: 1px solid rgba(239, 68, 68, 0.3);
                    border-left: 3px solid #ef4444;
                    padding: 12px 16px; border-radius: 8px;
                    box-shadow: var(--shadow-lg); pointer-events: auto;
                    display: flex; align-items: flex-start; gap: 10px;
                    animation: toastSlide 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
                    backdrop-filter: blur(12px);
                }
                @keyframes toastSlide { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
                .toast-icon { color: #ef4444; flex-shrink: 0; margin-top: 2px; }
                .toast-content { flex: 1; font-size: 13px; color: var(--text-primary); line-height: 1.4; }
                .toast-close {
                    color: var(--text-secondary); cursor: pointer; padding: 4px;
                    border-radius: 4px; border: none; background: transparent;
                    transition: all 0.2s;
                }
                .toast-close:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

            </style>
        </head>
        <body>
            <header>
                <div class="brand">
                    <img src="${logoUri}" class="logo-img" alt="Logo">
                    <span style="font-size: 10px; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; border: 1px solid var(--accent); padding: 1px 4px; border-radius: 4px; margin-left: -2px; font-weight: 800; opacity: 0.9; letter-spacing: 0.5px;">PRO</span>
                </div>
                <div class="header-actions">
                    <button class="btn-icon" onclick="exportChat()" title="Export Chat">${icons.download}</button>
                    <button class="btn-icon" onclick="newChat()" title="New Chat">${icons.plus}</button>
                    <button class="btn-icon" onclick="toggleDrawer()" title="History">${icons.history}</button>
                    <button class="btn-icon" onclick="toggleSettings()" title="Settings">${icons.settings}</button>
                </div>
            </header>

            <div id="session-drawer">
                <div class="drawer-header">
                    <div class="drawer-top-bar">
                        <span>Select a conversation</span>
                        <button class="btn-icon" onclick="toggleDrawer()" title="Close">×</button>
                    </div>
                    <div class="search-container">
                        <input type="text" class="session-search-input" id="sessionSearchInput" placeholder="Search conversations...">
                    </div>
                </div>
                <div class="session-list" id="sessionList"></div>
                <div class="drawer-footer">
                    <button class="btn-clear" onclick="clearAllSessions()">${icons.trash} Clear All</button>
                </div>
            </div>

            <div id="settings-drawer">
                <div class="drawer-header">
                    <div class="drawer-top-bar">
                        <span class="drawer-title">${icons.settings} Settings</span>
                        <button class="btn-icon" onclick="toggleSettings()" title="Close">${icons.close}</button>
                    </div>
                </div>
                <div class="settings-content">
                    <div class="setting-group">
                        <div class="setting-header">
                            <span class="setting-icon">${icons.edit}</span>
                            <div class="setting-label">CUSTOM INSTRUCTIONS</div>
                        </div>
                        <div class="setting-desc">Customize the AI's behavior and persona for this workspace.</div>
                        <textarea id="customInstructions" class="setting-input" rows="5" placeholder="E.g. You are an expert Python developer. Always include type hints. Be concise."></textarea>
                    </div>

                    <div class="settings-divider"></div>

                    <div class="setting-group">
                         <div class="setting-row">
                             <div class="setting-info">
                                 <div class="setting-header">
                                     <span class="setting-icon">${icons.code}</span>
                                     <div class="setting-label">AUTO-CONTEXT</div>
                                 </div>
                                 <div class="setting-desc">Automatically include relevant code context from your project.</div>
                             </div>
                             <label class="switch">
                                 <input type="checkbox" id="autoContext" checked>
                                 <span class="slider round"></span>
                             </label>
                         </div>
                    </div>

                    <div class="settings-divider"></div>

                    <div class="setting-group keyboard-shortcuts">
                        <div class="setting-header">
                            <span class="setting-icon">⌨️</span>
                            <div class="setting-label">KEYBOARD SHORTCUTS</div>
                        </div>
                        <div class="shortcuts-grid">
                            <div class="shortcut-item">
                                <span class="shortcut-key">Enter</span>
                                <span class="shortcut-action">Send message</span>
                            </div>
                            <div class="shortcut-item">
                                <span class="shortcut-key">Shift + Enter</span>
                                <span class="shortcut-action">New line</span>
                            </div>
                            <div class="shortcut-item">
                                <span class="shortcut-key">ESC</span>
                                <span class="shortcut-action">Close popups</span>
                            </div>
                            <div class="shortcut-item">
                                <span class="shortcut-key">@</span>
                                <span class="shortcut-action">Mention file</span>
                            </div>
                            <div class="shortcut-item">
                                <span class="shortcut-key">/</span>
                                <span class="shortcut-action">Quick command</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="drawer-footer">
                    <button class="btn-save" onclick="saveSettings()">${icons.check} Save Changes</button>
                </div>
            </div>



            <div id="chat-container">
                <div id="emptyState" class="empty-state">
                    <div class="empty-greeting">What can I help you build?</div>
                    <div class="empty-subtitle">Ask me anything about your code, or try one of these quick actions</div>
                    <div class="quick-actions">
                        <div class="action-card" onclick="executeCommand('explain')">
                            <div class="action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
                            <div class="action-title">Explain</div>
                            <div class="action-desc">Understand code logic</div>
                        </div>
                        <div class="action-card" onclick="executeCommand('fix')">
                            <div class="action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg></div>
                            <div class="action-title">Fix Bugs</div>
                            <div class="action-desc">Debug & repair issues</div>
                        </div>
                        <div class="action-card" onclick="executeCommand('refactor')">
                            <div class="action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></div>
                            <div class="action-title">Refactor</div>
                            <div class="action-desc">Improve code quality</div>
                        </div>
                        <div class="action-card" onclick="executeCommand('test')">
                            <div class="action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg></div>
                            <div class="action-title">Test</div>
                            <div class="action-desc">Generate unit tests</div>
                        </div>
                    </div>
                </div>
            </div>

            <button id="scrollToBottomBtn" onclick="scrollToBottom()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 13l5 5 5-5M7 6l5 5 5-5"></path></svg>
            </button>
            
            <div class="input-section">
                <div class="command-popup" id="commandPopup">
                    <div class="command-item" onclick="selectCommand('explain')">
                        <span class="cmd-key">/explain</span> <span class="cmd-desc">Explain selected code</span>
                    </div>
                    <div class="command-item" onclick="selectCommand('fix')">
                        <span class="cmd-key">/fix</span> <span class="cmd-desc">Fix bugs in selection</span>
                    </div>
                    <div class="command-item" onclick="selectCommand('refactor')">
                        <span class="cmd-key">/refactor</span> <span class="cmd-desc">Refactor selection</span>
                    </div>
                    <div class="command-item" onclick="selectCommand('test')">
                        <span class="cmd-key">/test</span> <span class="cmd-desc">Generate unit tests</span>
                    </div>
                    <div class="command-item" onclick="selectCommand('doc')">
                        <span class="cmd-key">/doc</span> <span class="cmd-desc">Generate documentation</span>
                    </div>
                    <div class="command-item" onclick="selectCommand('optimize')">
                        <span class="cmd-key">/optimize</span> <span class="cmd-desc">Optimize performance</span>
                    </div>
                    <div class="command-item" onclick="selectCommand('security')">
                        <span class="cmd-key">/security</span> <span class="cmd-desc">Security audit</span>
                    </div>
                    <div class="command-item" onclick="selectCommand('review')">
                        <span class="cmd-key">/review</span> <span class="cmd-desc">Code review</span>
                    </div>
                    <div class="command-item" onclick="selectCommand('convert')">
                        <span class="cmd-key">/convert</span> <span class="cmd-desc">Convert to other language</span>
                    </div>
                </div>
                
                <div class="file-popup" id="filePopup"></div>
                <div class="input-box">
                    <div class="input-wrapper">
                        <div class="input-highlight" id="inputHighlight"></div>
                        <textarea id="messageInput" placeholder="Ask anything, @ to mention, / for command..." rows="1"></textarea>
                    </div>
                    <div class="input-actions">
                        <button class="btn-send" id="sendBtn" title="Send">${icons.send}</button>
                        <button class="btn-stop" id="stopBtn" title="Stop Generation">${icons.stop}</button>
                    </div>
                </div>
            </div>

            <div id="toast-container"></div>
            <script>
                const vscode = acquireVsCodeApi();
                const initialState = vscode.getState() || {};
                
                // Global Error Handler
                window.onerror = function(msg, source, lineno, colno, error) {
                    const div = document.createElement('div');
                    div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:9999;font-family:monospace;font-size:12px;';
                    div.innerText = 'JS Error: ' + msg;
                    document.body.appendChild(div);
                    return false;
                };

                const chatContainer = document.getElementById('chat-container');
                const messageInput = document.getElementById('messageInput');
                const inputHighlight = document.getElementById('inputHighlight');
                const sendBtn = document.getElementById('sendBtn');
                const stopBtn = document.getElementById('stopBtn');
                const sessionDrawer = document.getElementById('session-drawer');
                const sessionList = document.getElementById('sessionList');
                const commandPopup = document.getElementById('commandPopup');
                const filePopup = document.getElementById('filePopup');
                const emptyState = document.getElementById('emptyState');
                
                // Popup navigation state
                let commandPopupSelectedIndex = -1;
                let filePopupSelectedIndex = -1;
                
                // Helper: Update visual selection in command popup
                function updateCommandPopupSelection() {
                    const items = commandPopup.querySelectorAll('.command-item');
                    items.forEach((item, idx) => {
                        if (idx === commandPopupSelectedIndex) {
                            item.classList.add('selected');
                        } else {
                            item.classList.remove('selected');
                        }
                    });
                    // Scroll selected item into view
                    if (commandPopupSelectedIndex >= 0 && items[commandPopupSelectedIndex]) {
                        items[commandPopupSelectedIndex].scrollIntoView({ block: 'nearest' });
                    }
                }
                
                // Helper: Update visual selection in file popup
                function updateFilePopupSelection() {
                    const items = filePopup.querySelectorAll('.file-item');
                    items.forEach((item, idx) => {
                        if (idx === filePopupSelectedIndex) {
                            item.classList.add('selected');
                        } else {
                            item.classList.remove('selected');
                        }
                    });
                    // Scroll selected item into view
                    if (filePopupSelectedIndex >= 0 && items[filePopupSelectedIndex]) {
                        items[filePopupSelectedIndex].scrollIntoView({ block: 'nearest' });
                    }
                }
                
                // Reset popup selection when popup is shown
                function resetCommandPopupSelection() {
                    commandPopupSelectedIndex = 0;
                    updateCommandPopupSelection();
                }
                
                function resetFilePopupSelection() {
                    filePopupSelectedIndex = 0;
                    updateFilePopupSelection();
                }
                
                // Inline thinking indicator state
                let thinkingIndicatorEl = null;
                
                // Update the highlight overlay with colored @mentions and /commands
                function updateHighlight() {
                    let text = messageInput.value;
                    // Escape HTML to prevent XSS
                    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    // Highlight @mentions (blue) - match @word patterns immediately
                    text = text.replace(/@([a-zA-Z0-9_./-]+)/g, '<span class="mention">@$1</span>');
                    // Highlight /commands (purple) - match /word at start or after space, no trailing space needed
                    text = text.replace(/(^|\\s)(\\/[a-zA-Z]+)/g, '$1<span class="command">$2</span>');
                    // Set the highlighted HTML
                    inputHighlight.innerHTML = text;
                }
                
                // Initialize highlighting on page load
                setTimeout(updateHighlight, 0);
                
                marked.setOptions({
                    highlight: function(code, lang) {
                        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                        return hljs.highlight(code, { language }).value;
                    },
                    langPrefix: 'hljs language-'
                });

                let isGenerating = false;
                let currentAssistantMessageDiv = null;
                let currentAssistantMessageIndex = null;
                
                function createThinkingIndicator() {
                    const wrapper = document.createElement('div');
                    wrapper.id = 'thinkingIndicator';
                    wrapper.className = 'message assistant';
                    
                    const indicator = document.createElement('div');
                    indicator.className = 'thinking-indicator';
                    indicator.innerHTML = \`
                        <div class="thinking-dots">
                            <span class="thinking-dot"></span>
                            <span class="thinking-dot"></span>
                            <span class="thinking-dot"></span>
                        </div>
                        <span class="thinking-text" id="thinkingText">Thinking...</span>
                    \`;
                    wrapper.appendChild(indicator);
                    return wrapper;
                }
                
                function showThinkingIndicator() {
                    hideThinkingIndicator();
                    thinkingIndicatorEl = createThinkingIndicator();
                    chatContainer.appendChild(thinkingIndicatorEl);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
                
                function hideThinkingIndicator() {
                    if (thinkingIndicatorEl) {
                        thinkingIndicatorEl.remove();
                        thinkingIndicatorEl = null;
                    }
                }
                
                function handleAgentStatus(phase, messageText) {
                    if (!thinkingIndicatorEl) {
                        showThinkingIndicator();
                    }
                    
                    // Update the thinking text with current phase
                    const textEl = thinkingIndicatorEl.querySelector('#thinkingText');
                    if (textEl) {
                        textEl.textContent = phase + '...';
                    }
                    
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
                
                function handleAgentDebugText(text) {
                    console.log('Agent Debug:', text);
                }
                
                function handleAgentStatusDone() {
                    // Just hide the indicator when done - the response will replace it
                }
                
                // Debounce utility
                function debounce(fn, delay) {
                    let timeoutId;
                    return function(...args) {
                        clearTimeout(timeoutId);
                        timeoutId = setTimeout(() => fn.apply(this, args), delay);
                    };
                }
                
                // Debounced file search
                // Debounced file search (Faster)
                const debouncedFileSearch = debounce((query) => {
                    vscode.postMessage({ type: 'getFiles', query: query });
                }, 100);

                // Auto-resize & Input Handler
                messageInput.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = (this.scrollHeight) + 'px';
                    if (this.value === '') this.style.height = '24px';
                    
                    // Update syntax highlighting
                    updateHighlight();
                    
                    const val = this.value;
                    
                    // Mention Logic (@)
                    const lastAt = val.lastIndexOf('@');
                    if (lastAt !== -1) {
                         const searchStr = val.substring(lastAt + 1);
                         if (!searchStr.includes(' ') && !searchStr.includes('\\n')) {
                             debouncedFileSearch(searchStr);
                             if (!filePopup.classList.contains('show')) {
                                 filePopupSelectedIndex = 0;
                             }
                             filePopup.classList.add('show');
                             return;
                         }
                    }
                    filePopup.classList.remove('show');
                    
                    // Command Logic (/)
                    const lastSlash = val.lastIndexOf('/');
                    if (lastSlash !== -1) {
                        // Check if it's at start or after space
                        const charBefore = lastSlash > 0 ? val[lastSlash - 1] : ' ';
                        if (charBefore === ' ') {
                             const cmdStr = val.substring(lastSlash);
                             if (!cmdStr.includes(' ') && !cmdStr.includes('\\n')) {
                                if (!commandPopup.classList.contains('show')) {
                                    commandPopupSelectedIndex = 0;
                                    setTimeout(updateCommandPopupSelection, 10);
                                }
                                commandPopup.classList.add('show');
                                return;
                             }
                        }
                    }
                    commandPopup.classList.remove('show');
                    persistState();
                });
                
                // Send Message
                function sendMessage() {
                    const text = messageInput.value.trim();
                    if (!text || isGenerating) return;
                    
                    currentAssistantMessageDiv = null;
                    currentAssistantMessageIndex = null;
                    
                    addMessage('user', text);
                    messageInput.value = '';
                    messageInput.style.height = '24px';
                    updateHighlight();
                    commandPopup.classList.remove('show');
                    filePopup.classList.remove('show');
                    
                    isGenerating = true;
                    updateUIState();
                    
                    // Show inline thinking indicator instead of simple dots
                    showThinkingIndicator();
                    
                    vscode.postMessage({ type: 'sendMessage', value: text });
                    persistState();
                }
                
                function showTypingIndicator() {
                    // Now uses the thinking indicator
                    showThinkingIndicator();
                }
                
                function hideTypingIndicator() {
                    hideThinkingIndicator();
                }

                sendBtn.addEventListener('click', sendMessage);
                
                stopBtn.addEventListener('click', () => {
                    vscode.postMessage({ type: 'stopGeneration' });
                    isGenerating = false;
                    updateUIState();
                    persistState();
                });

                messageInput.addEventListener('keydown', (e) => {
                    const isFilePopupOpen = filePopup.classList.contains('show');
                    const isCommandPopupOpen = commandPopup.classList.contains('show');
                    
                    // Arrow key navigation for file popup
                    if (isFilePopupOpen) {
                        const items = filePopup.querySelectorAll('.file-item');
                        const itemCount = items.length;
                        
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            filePopupSelectedIndex = (filePopupSelectedIndex + 1) % itemCount;
                            updateFilePopupSelection();
                            return;
                        }
                        if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            filePopupSelectedIndex = filePopupSelectedIndex <= 0 ? itemCount - 1 : filePopupSelectedIndex - 1;
                            updateFilePopupSelection();
                            return;
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            const selectedItem = items[filePopupSelectedIndex] || items[0];
                            if (selectedItem) selectedItem.click();
                            return;
                        }
                        if (e.key === 'Tab') {
                            e.preventDefault();
                            const selectedItem = items[filePopupSelectedIndex] || items[0];
                            if (selectedItem) selectedItem.click();
                            return;
                        }
                    }
                    
                    // Arrow key navigation for command popup
                    if (isCommandPopupOpen) {
                        const items = commandPopup.querySelectorAll('.command-item');
                        const itemCount = items.length;
                        
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            commandPopupSelectedIndex = (commandPopupSelectedIndex + 1) % itemCount;
                            updateCommandPopupSelection();
                            return;
                        }
                        if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            commandPopupSelectedIndex = commandPopupSelectedIndex <= 0 ? itemCount - 1 : commandPopupSelectedIndex - 1;
                            updateCommandPopupSelection();
                            return;
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            const selectedItem = items[commandPopupSelectedIndex] || items[0];
                            if (selectedItem) selectedItem.click();
                            return;
                        }
                        if (e.key === 'Tab') {
                            e.preventDefault();
                            const selectedItem = items[commandPopupSelectedIndex] || items[0];
                            if (selectedItem) selectedItem.click();
                            return;
                        }
                    }
                    
                    // Regular Enter to send message
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                    
                    // Escape to close popups
                    if (e.key === 'Escape') {
                        commandPopup.classList.remove('show');
                        filePopup.classList.remove('show');
                        commandPopupSelectedIndex = -1;
                        filePopupSelectedIndex = -1;
                    }
                });

                function updateUIState() {
                    if (isGenerating) {
                        sendBtn.style.display = 'none';
                        stopBtn.style.display = 'flex';
                        messageInput.disabled = true;
                    } else {
                        sendBtn.style.display = 'flex';
                        stopBtn.style.display = 'none';
                        messageInput.disabled = false;
                        messageInput.focus();
                    }
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'addResponse':
                            hideTypingIndicator();
                            if (currentAssistantMessageDiv) {
                                currentAssistantMessageDiv.innerHTML = marked.parse(message.value);
                                enhanceCodeBlocks(currentAssistantMessageDiv.parentElement);
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                                
                                if (currentAssistantMessageIndex !== null &&
                                    currentAssistantMessageIndex >= 0 &&
                                    currentAssistantMessageIndex < messageHistory.length) {
                                    const msg = messageHistory[currentAssistantMessageIndex];
                                    if (msg.role === 'assistant') {
                                        msg.text = message.value;
                                    }
                                }
                            } else {
                                addMessage('assistant', message.value);
                            }
                            
                            if (!message.isStream) {
                                isGenerating = false;
                                currentAssistantMessageDiv = null;
                                currentAssistantMessageIndex = null;
                                updateUIState();
                                persistState();
                            }
                            break;
                        
                        case 'agentStatus':
                            handleAgentStatus(message.phase, message.message);
                            break;
                        
                        case 'agentDebugText':
                            handleAgentDebugText(message.value);
                            break;

                        case 'agentStatusDone':
                            handleAgentStatusDone();
                            break;
                            
                        case 'setAndSendMessage':
                            messageInput.value = message.value;
                            updateHighlight();
                            if (!message.justSet) {
                                sendMessage();
                            } else {
                                messageInput.focus();
                                persistState();
                            }
                            break;
                            
                        case 'sessionList':
                             renderSessionList(message.sessions, message.currentSessionId);
                             break;
                             
                        case 'loadSession':
                             chatContainer.innerHTML = '';
                             resetMessageIndex();
                             hideThinkingIndicator();
                             currentAssistantMessageDiv = null;
                             currentAssistantMessageIndex = null;
                             if (message.history.length === 0) {
                                 chatContainer.innerHTML = \`<div id="emptyState" class="empty-state">
                                     <div class="empty-greeting">Byte Ai Agent</div>
                                     <div class="empty-subtitle">Ask me anything about your code, or try one of these quick actions</div>
                                     <div class="quick-actions">
                                         <div class="action-card" onclick="setInputValue('/explain ')">
                                             <div class="action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
                                             <div class="action-title">Explain</div>
                                             <div class="action-desc">Analyze project logic</div>
                                         </div>
                                         <div class="action-card" onclick="setInputValue('/fix ')">
                                              <div class="action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg></div>
                                             <div class="action-title">Fix Bugs</div>
                                             <div class="action-desc">Debug & repair issues</div>
                                         </div>
                                         <div class="action-card" onclick="setInputValue('/refactor ')">
                                              <div class="action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></div>
                                             <div class="action-title">Refactor</div>
                                             <div class="action-desc">Improve architecture</div>
                                         </div>
                                         <div class="action-card" onclick="setInputValue('/test ')">
                                             <div class="action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></div>
                                             <div class="action-title">Test</div>
                                             <div class="action-desc">Generate unit tests</div>
                                         </div>
                                     </div>
                                 </div>\`;
                             } else {
                                 message.history.forEach(msg => {
                                     addMessage(msg.role, msg.text);
                                 });
                             }
                             break;

                        case 'addMessage':
                           addMessage(message.role, message.value);
                           break;

                        case 'setGenerating':
                           isGenerating = true;
                           updateUIState();
                           showTypingIndicator();
                           persistState();
                           break;

                        case 'error':
                           hideTypingIndicator();
                           isGenerating = false;
                           currentAssistantMessageDiv = null;
                           currentAssistantMessageIndex = null;
                           updateUIState();
                           window.showToast(message.value);
                           persistState();
                           break;

                        case 'fileList':
                           renderFiles(message.files);
                           break;

                        case 'updateSettings':
                           const s = message.value;
                           if (s) {
                               const customInstructionsEl = document.getElementById('customInstructions');
                               const autoContextEl = document.getElementById('autoContext');
                               if (customInstructionsEl) customInstructionsEl.value = s.customInstructions || '';
                               if (autoContextEl) autoContextEl.checked = s.autoContext !== false;
                           }
                           break;
                    }
                });

                let messageIndex = 0;
                let messageHistory = [];
                
                function addMessage(role, text) {
                    const currentIdx = messageIndex++;
                    messageHistory.push({ role, text });
                    const div = document.createElement('div');
                    div.className = 'message ' + role;
                    div.dataset.index = currentIdx;

                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'content';
                    contentDiv.innerHTML = marked.parse(text);

                    div.appendChild(contentDiv);

                    // Add Action Buttons
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'msg-actions';
                    actionsDiv.style.cssText = 'display:flex; gap:8px; margin-top:4px; opacity:0; transition:opacity 0.2s;';

                    if (role === 'assistant') {
                        // Regenerate Button
                        const regenBtn = document.createElement('button');
                        regenBtn.className = 'btn-icon';
                        regenBtn.innerHTML = '${icons.refresh}';
                        regenBtn.title = 'Regenerate this response';
                        regenBtn.onclick = () => {
                            vscode.postMessage({ type: 'regenerate', index: currentIdx });
                        };
                        actionsDiv.appendChild(regenBtn);
                    } else {
                        // Edit Button
                        const editBtn = document.createElement('button');
                        editBtn.className = 'btn-icon';
                        editBtn.innerHTML = '${icons.edit}';
                        editBtn.title = 'Edit and resend from here';
                        editBtn.onclick = () => {
                            vscode.postMessage({ type: 'editMessage', index: currentIdx });
                        };
                        actionsDiv.appendChild(editBtn);
                    }
                    div.appendChild(actionsDiv);

                    // Hover effect
                    div.onmouseenter = () => { actionsDiv.style.opacity = '1'; };
                    div.onmouseleave = () => { actionsDiv.style.opacity = '0'; };

                    chatContainer.appendChild(div);

                    // Auto-scroll
                    requestAnimationFrame(() => {
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    });

                    if (role === 'assistant') {
                        currentAssistantMessageDiv = contentDiv;
                        currentAssistantMessageIndex = currentIdx;
                        enhanceCodeBlocks(div);
                    }

                    // Remove empty state dynamically
                    const es = document.getElementById('emptyState');
                    if (es) es.remove();
                    persistState();
                }
                
                function resetMessageIndex() {
                    messageIndex = 0;
                    messageHistory = [];
                    persistState();
                }

                function persistState() {
                    vscode.setState({
                        messages: messageHistory,
                        inputValue: messageInput.value,
                        isGenerating
                    });
                }

                if (initialState && Array.isArray(initialState.messages) && initialState.messages.length > 0) {
                    chatContainer.innerHTML = '';
                    resetMessageIndex();
                    initialState.messages.forEach(msg => {
                        addMessage(msg.role, msg.text);
                    });
                }

                if (initialState && typeof initialState.inputValue === 'string' && initialState.inputValue.length > 0) {
                    messageInput.value = initialState.inputValue;
                    messageInput.style.height = 'auto';
                    messageInput.style.height = (messageInput.scrollHeight) + 'px';
                    if (messageInput.value === '') messageInput.style.height = '24px';
                    updateHighlight();
                }

                if (initialState && initialState.isGenerating) {
                    isGenerating = true;
                    updateUIState();
                    showThinkingIndicator();
                }

                function enhanceCodeBlocks(container) {
                    const contentDiv = container.querySelector('.content');
                    if (!contentDiv) return;

                    contentDiv.querySelectorAll('pre').forEach((pre) => {
                        if (pre.querySelector('.code-header')) return;

                        const code = pre.querySelector('code');
                        if (!code) return;

                        hljs.highlightElement(code);

                        const langClass = Array.from(code.classList).find(c => c.startsWith('language-'));
                        const lang = langClass ? langClass.replace('language-', '') : 'text';

                        const header = document.createElement('div');
                        header.className = 'code-header';
                        header.innerHTML = '<div class="window-dots"><div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div></div><span class="code-lang">' + lang.toUpperCase() + '</span>';
                        
                        const actions = document.createElement('div');
                        actions.className = 'code-actions';
                        
                        const copyBtn = document.createElement('button');
                        copyBtn.className = 'copy-btn';
                        copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                        copyBtn.title = 'Copy Code';
                        copyBtn.onclick = () => {
                            vscode.postMessage({ type: 'copyCode', value: code.innerText });
                            copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#27c93f"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                            setTimeout(() => copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>', 2000);
                        };
                        actions.appendChild(copyBtn);
                        
                        const insertBtn = document.createElement('button');
                        insertBtn.className = 'copy-btn';
                        insertBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>';
                        insertBtn.title = 'Insert at Cursor';
                        insertBtn.onclick = () => {
                            vscode.postMessage({ type: 'insertCode', value: code.innerText });
                            insertBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#27c93f"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                            setTimeout(() => insertBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>', 2000);
                        };
                        actions.appendChild(insertBtn);
                        
                        header.appendChild(actions);
                        pre.insertBefore(header, code);
                    });
                }
                
                function executeCommand(cmd) {
                    vscode.postMessage({ type: 'runCommand', command: cmd });
                }
                
                function selectCommand(cmd) {
                    messageInput.value = '/' + cmd + ' ';
                    updateHighlight();
                    messageInput.focus();
                    commandPopup.classList.remove('show');
                }

                function renderFiles(files) {
                    filePopup.innerHTML = '';
                    if (!files || files.length === 0) {
                        filePopup.classList.remove('show');
                        filePopupSelectedIndex = -1;
                        return;
                    }
                    
                    // Reset selection to first item when new files are loaded
                    filePopupSelectedIndex = 0;
                    
                    files.forEach((file, index) => {
                        const div = document.createElement('div');
                        div.className = 'file-item';
                        if (index === filePopupSelectedIndex) div.classList.add('selected');

                        // Determine Icon
                        const ext = file.path.split('.').pop().toLowerCase();
                        let iconChar = '📄';
                        let iconClass = 'file-icon';
                        
                        // Simple icon mapping
                        switch(ext) {
                            case 'ts': case 'tsx': iconChar = '{}'; iconClass += ' icon-ts'; break;
                            case 'js': case 'jsx': iconChar = '{}'; iconClass += ' icon-js'; break;
                            case 'json': iconChar = '{}'; iconClass += ' icon-json'; break;
                            case 'md': iconChar = 'M↓'; iconClass += ' icon-md'; break;
                            case 'css': case 'scss': iconChar = '#'; iconClass += ' icon-css'; break;
                            case 'html': iconChar = '<>'; iconClass += ' icon-html'; break;
                            case 'py': iconChar = 'py'; iconClass += ' icon-py'; break;
                            case 'png': case 'svg': case 'jpg': iconChar = '🖼️'; break;
                        }

                        // Split path for display
                        const pathParts = file.path.split('/');
                        const fileName = pathParts.pop();
                        const dirPath = pathParts.join('/');

                        div.innerHTML = \`
                            <span class="\${iconClass}">\${iconChar}</span>
                            <div class="file-info">
                                <span class="file-name">\${fileName}</span>
                                <span class="file-path">\${dirPath || './'}</span>
                            </div>
                        \`;
                        div.onclick = () => {
                            // Use cursor-aware replacement
                            const val = messageInput.value;
                            const cursorPos = messageInput.selectionStart;
                            const textBeforeCursor = val.substring(0, cursorPos);
                            const textAfterCursor = val.substring(cursorPos);
                            
                            // Find where the @ mention starts
                            const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
                            const beforeAt = lastSpaceIndex === -1 ? '' : textBeforeCursor.substring(0, lastSpaceIndex + 1);
                            
                            // Insert formatted file tag: @[path] for cleaner parsing if you want, 
                            // or just @path. User mentioned "@[images/logo.png]" earlier.
                            // Let's stick to simple path for now, or match user preference.
                            // Actually, let's just insert the path, standard logic.
                            messageInput.value = beforeAt + '@' + file.path + ' ' + textAfterCursor.trim();
                            
                            filePopup.classList.remove('show');
                            messageInput.focus();
                            
                            // Set cursor position
                            const newPos = beforeAt.length + file.path.length + 2;
                            messageInput.setSelectionRange(newPos, newPos);
                            
                            // Update highlighting immediately
                            updateHighlight();
                        };
                        filePopup.appendChild(div);
                    });
                }
                
                
                // Override addMessage to hide empty state and reset streaming state for new user messages
                const originalAddMessage = addMessage;
                addMessage = function(role, text) {
                    if (role === 'user') {
                        currentAssistantMessageDiv = null;
                        currentAssistantMessageIndex = null;
                    }
                    const es = document.getElementById('emptyState');
                    if (es) es.remove();
                    return originalAddMessage(role, text);
                };

                function newChat() {
                    vscode.postMessage({ type: 'newChat' });
                }

                function exportChat() {
                    vscode.postMessage({ type: 'exportChat' });
                }

                function toggleDrawer() { 
                    try {
                        const sessionDrawer = document.getElementById('session-drawer');
                        const settingsDrawer = document.getElementById('settings-drawer');
                        
                        if (settingsDrawer && settingsDrawer.classList.contains('open')) {
                            settingsDrawer.classList.remove('open');
                        }

                        sessionDrawer.classList.toggle('open');
                        if (sessionDrawer.classList.contains('open')) vscode.postMessage({ type: 'getSessions' });
                    } catch (e) { console.error(e); }
                }

                function clearAllSessions() { 
                    vscode.postMessage({ type: 'clearAllSessions' }); 
                    toggleDrawer();
                }

                // Add Search Listener
                const searchInput = document.getElementById('sessionSearchInput');
                if (searchInput) {
                    searchInput.addEventListener('input', (e) => {
                        const sessions = window.currentSessions || [];
                        const currentId = window.currentSessionId;
                        renderSessionList(sessions, currentId, e.target.value);
                    });
                }

                function timeAgo(date) {
                    const seconds = Math.floor((new Date() - date) / 1000);
                    let interval = seconds / 31536000;
                    if (interval > 1) return Math.floor(interval) + "y ago";
                    interval = seconds / 2592000;
                    if (interval > 1) return Math.floor(interval) + "mo ago";
                    interval = seconds / 86400;
                    if (interval > 1) return Math.floor(interval) + "d ago";
                    interval = seconds / 3600;
                    if (interval > 1) return Math.floor(interval) + "h ago";
                    interval = seconds / 60;
                    if (interval > 1) return Math.floor(interval) + "m ago";
                    return "Just now";
                }

                function renderSessionList(sessions, currentId, searchQuery = '') {
                    // Cache for search
                    window.currentSessions = sessions;
                    window.currentSessionId = currentId;

                    sessionList.innerHTML = '';
                    
                    const filtered = sessions.filter(s => 
                        (s.title || 'New Chat').toLowerCase().includes(searchQuery.toLowerCase())
                    );

                    if (filtered.length === 0) {
                        sessionList.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5; font-size:12px;">No conversations found</div>';
                        return;
                    }

                    // Grouping Logic
                    const groups = {
                        'Current': [],
                        'Recent in ByteAiCoder': [],
                        'Other Conversations': []
                    };
                    
                    const now = new Date();
                    filtered.forEach(s => {
                         if (s.id === currentId) {
                             groups['Current'].push(s);
                         } else {
                             // Recent: last 24h
                             const date = new Date(s.timestamp || Date.now());
                             const isRecent = (now - date) < (24 * 60 * 60 * 1000);
                             if (isRecent) groups['Recent in ByteAiCoder'].push(s);
                             else groups['Other Conversations'].push(s);
                         }
                    });

                    // Render Groups
                    for (const [groupName, groupSessions] of Object.entries(groups)) {
                        if (groupSessions.length === 0) continue;

                        const header = document.createElement('div');
                        header.className = 'session-group-header';
                        header.innerText = groupName;
                        sessionList.appendChild(header);

                        groupSessions.forEach(s => {
                            const date = new Date(s.timestamp || Date.now());
                            const isActive = s.id === currentId;
                            
                            const div = document.createElement('div');
                            div.className = 'session-link' + (isActive ? ' active' : '');
                            
                            // Native Click on card loads session
                            div.onclick = () => {
                                if (isActive) return;
                                vscode.postMessage({ type: 'loadSession', id: s.id });
                                sessionDrawer.classList.remove('open');
                            };
                            
                            div.innerHTML = \`
                                <div class="session-info">
                                    <div class="session-title">\${escapeHtml(s.title || 'New Chat')}</div>
                                </div>
                                <div class="session-meta">
                                    <span>\${timeAgo(date)}</span>
                                    <div class="session-actions">
                                        <button class="btn-session-action" title="Rename" onclick="event.stopPropagation(); renameSession('\${s.id}', '\${escapeHtml(s.title || '')}')">
                                            ${icons.edit}
                                        </button>
                                        <button class="btn-session-action delete" title="Delete" onclick="event.stopPropagation(); deleteSession('\${s.id}')">
                                            ${icons.trash}
                                        </button>
                                    </div>
                                </div>
                            \`;
                            sessionList.appendChild(div);
                        });
                    }
                }
                
                function renameSession(id, currentTitle) {
                    vscode.postMessage({ type: 'renameSession', id: id, title: currentTitle });
                }
                
                function deleteSession(id) {
                    vscode.postMessage({ type: 'deleteSession', id: id });
                }

                function escapeHtml(text) {
                     const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
                     return text.replace(/[&<>"']/g, function(m) { return map[m]; });
                }

                // Window helpers for older onclicks if needed (though we moved to closure)
                window.loadSession = (id) => {
                     vscode.postMessage({ type: 'loadSession', id: id });
                     sessionDrawer.classList.remove('open');
                };
                
                window.deleteSession = (id) => {
                    event.stopPropagation();
                    vscode.postMessage({ type: 'deleteSession', id: id });
                };

                // Settings Functions
                window.toggleSettings = () => {
                    try {
                        const settingsDrawer = document.getElementById('settings-drawer');
                        const sessionDrawer = document.getElementById('session-drawer');
                        
                        if (sessionDrawer && sessionDrawer.classList.contains('open')) {
                            sessionDrawer.classList.remove('open');
                        }

                        const isOpen = settingsDrawer.classList.contains('open');
                        if (!isOpen) {
                            vscode.postMessage({ type: 'getSettings' });
                            settingsDrawer.classList.add('open');
                        } else {
                            settingsDrawer.classList.remove('open');
                        }
                    } catch (e) {
                        console.error(e);
                        if(window.showToast) window.showToast("Error opening settings: " + e.message);
                    }
                };

                window.saveSettings = () => {
                    const settings = {
                        customInstructions: document.getElementById('customInstructions').value,
                        autoContext: document.getElementById('autoContext').checked
                    };
                    vscode.postMessage({ type: 'saveSettings', value: settings });
                    document.getElementById('settings-drawer').classList.remove('open');
                };

                window.scrollToBottom = () => {
                    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
                };

                chatContainer.addEventListener('scroll', () => {
                    const btn = document.getElementById('scrollToBottomBtn');
                    if (!btn) return;
                    if (chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight > 800) {
                        btn.classList.add('show');
                    } else {
                        btn.classList.remove('show');
                    }
                });

                window.executeCommand = (cmd) => {
                    vscode.postMessage({ type: 'executeCommand', command: cmd });
                };

                window.setInputValue = (val) => {
                    messageInput.value = val;
                    // Trigger auto-resize
                    messageInput.style.height = 'auto';
                    messageInput.style.height = (messageInput.scrollHeight) + 'px';
                    messageInput.focus();
                    updateHighlight();
                    
                    // Add subtle click feedback
                    const el = event?.currentTarget;
                    if (el) {
                        el.style.transform = 'scale(0.95)';
                        setTimeout(() => el.style.transform = '', 100);
                    }
                };

                // Toast Helper
                // Toast Helper (DOM optimized)
                window.showToast = (message, duration = 5000) => {
                    const container = document.getElementById('toast-container');
                    if (!container) return;
                    
                    const toast = document.createElement('div');
                    toast.className = 'toast';
                    
                    const icon = document.createElement('div');
                    icon.className = 'toast-icon';
                    icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
                    
                    const content = document.createElement('div');
                    content.className = 'toast-content';
                    content.textContent = message;
                    
                    const close = document.createElement('button');
                    close.className = 'toast-close';
                    close.innerHTML = '✕';
                    close.onclick = function() { toast.remove(); };
                    
                    toast.appendChild(icon);
                    toast.appendChild(content);
                    toast.appendChild(close);
                    
                    container.appendChild(toast);
                    
                    setTimeout(() => {
                        toast.style.opacity = '0';
                        toast.style.transform = 'translateY(-10px)';
                        setTimeout(() => toast.remove(), 300);
                    }, duration);
                };

            </script>
        </body>
        </html>`;
    }
}

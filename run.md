# Build Instructions

Based on the `package.json` file and standard VS Code extension development practices, here are the commands to build and package your extension:

### 1. Compile the Source Code
This compiles the TypeScript files to JavaScript.
```bash
npm run compile
```

### 2. Watch Mode (Development)
This runs the compiler in watch mode, automatically recompiling when you make changes.
```bash
npm run watch
```

### 3. Package the Extension (.vsix)
This creates the installable `.vsix` file. It automatically runs the `vscode:prepublish` script before packaging.
```bash
npx vsce package
```

### Summary of Scripts in `package.json`
| Script | Command | Description |
| :--- | :--- | :--- |
| `compile` | `tsc -p ./` | Compiles the project once. |
| `watch` | `tsc -watch -p ./` | Compiles in watch mode for development. |
| `vscode:prepublish` | `tsc -p ./` | Runs automatically before packaging. |

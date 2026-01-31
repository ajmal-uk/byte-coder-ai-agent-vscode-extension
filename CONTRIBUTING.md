# Contributing to Byte Coder AI Agent

First off, huge thanks for investing your time in contributing to Byte Coder! 🙌

We are building an **autonomous AI software engineer** with a sophisticated "Think-Act-Verify" architecture. Your contributions help push the boundaries of what's possible in AI-assisted development.

---

## 🧠 Understanding the Architecture

Byte Coder uses a **Multi-Agent Pipeline** to plan, execute, and verify tasks:

```
src/
├── agents/                     # 🤖 Sub-Agent System
│   ├── IntentAnalyzer.ts      # Query understanding
│   ├── TaskPlannerAgent.ts    # 📋 Generates dependency graphs
│   ├── CodeModifierAgent.ts   # ✂️ Surgical code edits
│   ├── ExecutorAgent.ts       # 💻 Shell command execution
│   └── ...
├── core/
│   ├── AgentOrchestrator.ts   # 🎼 "Conductor" of the pipeline
│   ├── ManagerAgent.ts        # 🧠 "Project Manager"
│   └── PipelineEngine.ts      # 🚂 Execution state machine
└── extension.ts               # 🚀 VS Code entry point
```

---

## 📚 Knowledge Base Integration

Since v1.0.2, Byte Coder includes an offline knowledge base (`data/knowledge/uthakkan_data.json`).
- **Purpose**: Provides the agent with core identity rules and factual knowledge without needing online retrieval.
- **Updating**: If you add significant features, consider if the agent needs to "know" about them in its static memory.
- **Format**: JSON array of memory objects with `id`, `title`, `content`, and `keywords`.

---

## 🛠️ How to Contribute

### 1. Fork & Clone

```bash
git clone https://github.com/ajmal-uk/byte-coder-ai-agent.git
cd byte-coder-ai-agent
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create a Branch

```bash
git checkout -b feature/amazing-new-feature
# or
git checkout -b fix/annoying-bug
```

### 4. Development & Debugging

1. Open the project in **VS Code**
2. Press **F5** to start the Extension Development Host
3. Make changes; reload the host (`Cmd+R` / `Ctrl+R`) to see updates

### 5. Compile & Test

```bash
npm run compile     # TypeScript compilation
npm run watch       # Watch mode for development
npm run lint        # Check for code style issues
```

### 6. Commit Guidelines

Use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat(planner): improve dependency resolution for cyclic graphs"
git commit -m "fix(orchestrator): handle recovery for failed shell commands"
git commit -m "docs: update architecture diagrams"
```

### 7. Submit a Pull Request

- Describe your changes clearly
- Link to related issues
- Include screenshots/GIFs for UI changes
- Ensure all tests pass

---

## 📐 Coding Standards

| Area | Guideline |
|------|-----------|
| **TypeScript** | Strict mode. Avoid `any`. Use proper interfaces (see `AgentTypes.ts`). |
| **Agents** | Must implement the standard `BaseAgent` interface. |
| **Pipeline** | All file operations must use `<byte_action>` XML tags. |
| **UI** | Use VS Code theme variables for colors. |
| **Comments** | Document complex logic, especially in the Orchestrator. |

---

## 🔧 Key Areas for Contribution

- **New Agents** — Add specialized agents (e.g., `SecurityAuditAgent`, `RefactoringAgent`).
- **Language Support** — Extend AST patterns in `CodeExtractorAgent.ts` for more languages.
- **Recovery Strategies** — Improve how the system handles errors during execution.
- **UI Improvements** — Enhance the chat experience in `ChatViewHtml.ts`
- **Performance** — Optimize search and caching strategies
- **Documentation** — Improve README, add tutorials

---

## 🐛 Found a Bug?

[Open an issue](https://github.com/ajmal-uk/byte-coder-ai-agent/issues) with:
1. Steps to reproduce
2. Expected vs. actual behavior
3. Screenshots or logs

---

Thank you for helping us build the future of AI-assisted coding! 🚀

/**
 * Agent System Test Suite
 * Comprehensive tests to verify all agents work correctly
 * Run with: npx ts-node src/tests/agent-tests.ts
 */

// Mock vscode module for testing outside VS Code
const mockVscode = {
    workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
        getConfiguration: () => ({ get: () => true }),
        openTextDocument: async () => ({ getText: () => '' }),
        fs: { readFile: async () => new Uint8Array() }
    },
    window: {
        activeTextEditor: null,
        showTextDocument: async () => { },
        showInformationMessage: async () => { }
    },
    Uri: { file: (p: string) => ({ fsPath: p }) },
    ExtensionContext: {}
};

// Provide mock for imports
(global as any).vscode = mockVscode;

import { ManagerAgent } from '../core/ManagerAgent';
import { ProcessPlannerAgent } from '../agents/ProcessPlannerAgent';
import { CodePlannerAgent } from '../agents/CodePlannerAgent';
import { TaskPlannerAgent } from '../agents/TaskPlannerAgent';
import { CommandGeneratorAgent } from '../agents/CommandGeneratorAgent';
import { DocWriterAgent } from '../agents/DocWriterAgent';

// Test utilities
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(msg: string, color: string = colors.reset) {
    console.log(`${color}${msg}${colors.reset}`);
}

function pass(testName: string) {
    log(`  ✅ ${testName}`, colors.green);
}

function fail(testName: string, error: string) {
    log(`  ❌ ${testName}: ${error}`, colors.red);
}

function section(name: string) {
    log(`\n${'='.repeat(50)}`, colors.blue);
    log(`  ${name}`, colors.blue);
    log('='.repeat(50), colors.blue);
}

// ===== TESTS =====

async function testManagerAgent() {
    section('Testing ManagerAgent');

    const agent = new ManagerAgent();

    // Test 1: Build intent classification
    try {
        const result = await agent.execute({
            query: 'Build a full e-commerce website with React',
            hasImage: false,
            hasSelection: false
        });

        if (result.status === 'success' && result.payload.intent === 'Build') {
            pass('Build intent classification');
        } else {
            fail('Build intent classification', `Got ${result.payload.intent}`);
        }
    } catch (e) {
        fail('Build intent classification', (e as Error).message);
    }

    // Test 2: Fix intent classification
    try {
        const result = await agent.execute({
            query: 'Fix the login bug that crashes the app',
            hasImage: false,
            hasSelection: false
        });

        if (result.status === 'success' && result.payload.intent === 'Fix') {
            pass('Fix intent classification');
        } else {
            fail('Fix intent classification', `Got ${result.payload.intent}`);
        }
    } catch (e) {
        fail('Fix intent classification', (e as Error).message);
    }

    // Test 3: Pipeline generation
    try {
        const result = await agent.execute({
            query: 'Create a new user authentication system',
            hasImage: false,
            hasSelection: false
        });

        if (result.status === 'success' && result.payload.pipeline.length > 0) {
            pass(`Pipeline generation (${result.payload.pipeline.length} steps)`);
        } else {
            fail('Pipeline generation', 'No pipeline steps generated');
        }
    } catch (e) {
        fail('Pipeline generation', (e as Error).message);
    }

    // Test 4: Complexity assessment
    try {
        const simpleResult = await agent.execute({
            query: 'Explain this function',
            hasImage: false,
            hasSelection: true
        });

        const complexResult = await agent.execute({
            query: 'Build a full-stack e-commerce platform with payment integration',
            hasImage: false,
            hasSelection: false
        });

        if (simpleResult.payload.complexity === 'simple' || complexResult.payload.complexity === 'complex') {
            pass('Complexity assessment');
        } else {
            fail('Complexity assessment', `Simple: ${simpleResult.payload.complexity}, Complex: ${complexResult.payload.complexity}`);
        }
    } catch (e) {
        fail('Complexity assessment', (e as Error).message);
    }
}

async function testProcessPlanner() {
    section('Testing ProcessPlannerAgent');

    const agent = new ProcessPlannerAgent();

    // Test 1: E-commerce project planning
    try {
        const result = await agent.execute({
            query: 'Build a full e-commerce website with cart and checkout',
            projectType: 'fullstack'
        });

        if (result.status === 'success' && result.payload.phases.length > 0) {
            pass(`E-commerce planning (${result.payload.phases.length} phases)`);
            log(`    Tech Stack: ${JSON.stringify(result.payload.techStack)}`, colors.yellow);
        } else {
            fail('E-commerce planning', 'No phases generated');
        }
    } catch (e) {
        fail('E-commerce planning', (e as Error).message);
    }

    // Test 2: API project planning
    try {
        const result = await agent.execute({
            query: 'Create a REST API for user management',
            projectType: 'api'
        });

        if (result.status === 'success' && result.payload.techStack?.backend) {
            pass('API project tech stack');
        } else {
            fail('API project tech stack', 'No backend tech stack');
        }
    } catch (e) {
        fail('API project tech stack', (e as Error).message);
    }
}

async function testCodePlanner() {
    section('Testing CodePlannerAgent');

    const agent = new CodePlannerAgent();

    // Test 1: File structure generation
    try {
        const result = await agent.execute({
            query: 'Build an e-commerce app with authentication and payments',
            projectType: 'fullstack',
            features: ['authentication', 'payments', 'products', 'cart']
        });

        if (result.status === 'success' && result.payload.fileStructure.length > 0) {
            pass(`File structure (${result.payload.fileStructure.length} files/folders)`);
        } else {
            fail('File structure', 'No files generated');
        }
    } catch (e) {
        fail('File structure', (e as Error).message);
    }

    // Test 2: Interface generation
    try {
        const result = await agent.execute({
            query: 'Build an e-commerce app',
            projectType: 'fullstack',
            features: ['authentication', 'products']
        });

        if (result.status === 'success' && result.payload.interfaces.length > 0) {
            pass(`Interface generation (${result.payload.interfaces.length} interfaces)`);
        } else {
            fail('Interface generation', 'No interfaces generated');
        }
    } catch (e) {
        fail('Interface generation', (e as Error).message);
    }

    // Test 3: API endpoint generation
    try {
        const result = await agent.execute({
            query: 'Build an API',
            projectType: 'api',
            features: ['authentication', 'products']
        });

        if (result.status === 'success' && result.payload.apiEndpoints && result.payload.apiEndpoints.length > 0) {
            pass(`API endpoints (${result.payload.apiEndpoints.length} endpoints)`);
        } else {
            fail('API endpoints', 'No endpoints generated');
        }
    } catch (e) {
        fail('API endpoints', (e as Error).message);
    }
}

async function testTaskPlanner() {
    section('Testing TaskPlannerAgent');

    const agent = new TaskPlannerAgent();

    // Test 1: Task graph generation
    try {
        const result = await agent.execute({
            query: 'Build an e-commerce app',
            projectType: 'fullstack',
            fileStructure: ['src/', 'src/components/', 'src/pages/'],
            interfaces: ['User', 'Product']
        });

        if (result.status === 'success' && result.payload.taskGraph.length > 0) {
            pass(`Task graph (${result.payload.taskGraph.length} tasks)`);
        } else {
            fail('Task graph', 'No tasks generated');
        }
    } catch (e) {
        fail('Task graph', (e as Error).message);
    }

    // Test 2: Execution order
    try {
        const result = await agent.execute({
            query: 'Build an app',
            projectType: 'web',
            fileStructure: ['src/'],
            interfaces: []
        });

        if (result.status === 'success' && result.payload.executionOrder.length > 0) {
            pass(`Execution order (${result.payload.executionOrder.length} steps)`);
        } else {
            fail('Execution order', 'No execution order');
        }
    } catch (e) {
        fail('Execution order', (e as Error).message);
    }

    // Test 3: Critical path
    try {
        const result = await agent.execute({
            query: 'Build an app',
            projectType: 'web',
            fileStructure: ['src/'],
            interfaces: []
        });

        if (result.status === 'success' && result.payload.criticalPath.length > 0) {
            pass(`Critical path (${result.payload.criticalPath.length} tasks)`);
        } else {
            fail('Critical path', 'No critical path');
        }
    } catch (e) {
        fail('Critical path', (e as Error).message);
    }
}

async function testCommandGenerator() {
    section('Testing CommandGeneratorAgent');

    const agent = new CommandGeneratorAgent();

    // Test 1: Create file command
    try {
        const result = await agent.execute({
            operation: 'create_file',
            target: 'test.txt',
            content: 'Hello World'
        });

        if (result.status === 'success' && result.payload.commands.length > 0) {
            pass('Create file command');
        } else {
            fail('Create file command', 'No commands generated');
        }
    } catch (e) {
        fail('Create file command', (e as Error).message);
    }

    // Test 2: Install deps command
    try {
        const result = await agent.execute({
            operation: 'install_deps'
        });

        if (result.status === 'success' && result.payload.commands[0].command === 'npm install') {
            pass('Install deps command');
        } else {
            fail('Install deps command', 'Wrong command');
        }
    } catch (e) {
        fail('Install deps command', (e as Error).message);
    }

    // Test 3: Dangerous command detection
    try {
        const result = await agent.execute({
            operation: 'custom',
            customCommand: 'rm -rf /'
        });

        if (result.status === 'success' && result.payload.requiresConfirmation === true) {
            pass('Dangerous command detection');
        } else {
            fail('Dangerous command detection', 'Not flagged as dangerous');
        }
    } catch (e) {
        fail('Dangerous command detection', (e as Error).message);
    }
}

async function testDocWriter() {
    section('Testing DocWriterAgent');

    const agent = new DocWriterAgent();

    // Test 1: Inline comments
    try {
        const result = await agent.execute({
            type: 'inline_comments',
            context: { functionName: 'handleUserLogin' }
        });

        if (result.status === 'success' && result.payload.documentation.includes('/**')) {
            pass('Inline comments generation');
        } else {
            fail('Inline comments generation', 'No JSDoc generated');
        }
    } catch (e) {
        fail('Inline comments generation', (e as Error).message);
    }

    // Test 2: Changelog
    try {
        const result = await agent.execute({
            type: 'changelog',
            context: {
                changes: [
                    'Added user authentication',
                    'Fixed login bug',
                    'Removed deprecated API'
                ]
            }
        });

        if (result.status === 'success' && result.payload.documentation.includes('### Added')) {
            pass('Changelog generation');
        } else {
            fail('Changelog generation', 'No changelog format');
        }
    } catch (e) {
        fail('Changelog generation', (e as Error).message);
    }
}

async function testEcommerceScenario() {
    section('E-COMMERCE BUILD SCENARIO');

    log('\nSimulating: "Build a full e-commerce app"', colors.yellow);

    const managerAgent = new ManagerAgent();
    const processPlanner = new ProcessPlannerAgent();
    const codePlanner = new CodePlannerAgent();
    const taskPlanner = new TaskPlannerAgent();

    try {
        // Step 1: Intent analysis
        const intent = await managerAgent.execute({
            query: 'Build a full e-commerce app with products, cart, checkout, and user authentication',
            hasImage: false,
            hasSelection: false
        });

        log(`\n1. Intent: ${intent.payload.intent} (confidence: ${intent.payload.confidence.toFixed(2)})`, colors.green);
        log(`   Complexity: ${intent.payload.complexity}`, colors.green);
        log(`   Pipeline: ${intent.payload.pipeline.length} steps`, colors.green);

        // Step 2: Process planning
        const process = await processPlanner.execute({
            query: 'Build e-commerce app',
            projectType: 'fullstack'
        });

        log(`\n2. Project Phases:`, colors.green);
        process.payload.phases.forEach((p, i) => {
            log(`   ${i + 1}. ${p.name} (${p.deliverables.length} deliverables)`, colors.yellow);
        });

        log(`   Tech Stack:`, colors.green);
        log(`     Frontend: ${process.payload.techStack?.frontend}`, colors.yellow);
        log(`     Backend: ${process.payload.techStack?.backend}`, colors.yellow);
        log(`     Database: ${process.payload.techStack?.database}`, colors.yellow);

        // Step 3: Code structure planning
        const code = await codePlanner.execute({
            query: 'E-commerce app',
            projectType: 'fullstack',
            techStack: process.payload.techStack,
            features: ['authentication', 'products', 'cart', 'checkout', 'payments']
        });

        log(`\n3. Code Structure:`, colors.green);
        log(`   Files/Folders: ${code.payload.fileStructure.length}`, colors.yellow);
        log(`   Interfaces: ${code.payload.interfaces.length}`, colors.yellow);
        log(`   API Endpoints: ${code.payload.apiEndpoints?.length || 0}`, colors.yellow);
        log(`   Dependencies: ${code.payload.dependencies.length}`, colors.yellow);

        // Step 4: Task planning
        const tasks = await taskPlanner.execute({
            query: 'E-commerce app',
            projectType: 'fullstack',
            fileStructure: code.payload.fileStructure,
            interfaces: code.payload.interfaces,
            apiEndpoints: code.payload.apiEndpoints
        });

        log(`\n4. Task Execution Plan:`, colors.green);
        log(`   Total Tasks: ${tasks.payload.taskGraph.length}`, colors.yellow);
        log(`   Critical Path: ${tasks.payload.criticalPath.length} tasks`, colors.yellow);
        log(`   Validation Commands: ${tasks.payload.validationCommands.length}`, colors.yellow);

        log(`\n✅ E-COMMERCE SCENARIO PASSED`, colors.green);

    } catch (e) {
        log(`\n❌ E-COMMERCE SCENARIO FAILED: ${(e as Error).message}`, colors.red);
    }
}

// ===== RUN ALL TESTS =====

async function runAllTests() {
    log('\n🧪 BYTE CODER AGENT SYSTEM TEST SUITE\n', colors.blue);

    await testManagerAgent();
    await testProcessPlanner();
    await testCodePlanner();
    await testTaskPlanner();
    await testCommandGenerator();
    await testDocWriter();
    await testEcommerceScenario();

    log('\n' + '='.repeat(50), colors.blue);
    log('  TEST SUITE COMPLETE', colors.blue);
    log('='.repeat(50) + '\n', colors.blue);
}

// Run tests
runAllTests().catch(console.error);

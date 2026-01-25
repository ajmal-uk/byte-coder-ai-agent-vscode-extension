
import { BaseAgent, AgentOutput } from '../core/AgentTypes';

export interface ArchitectInput {
    query: string;
    projectType?: string;
    existingFiles?: string[];
}

export interface ArchitectureDesign {
    architecture: string;
    techStack: string[];
    fileStructure: string[];
    components: {
        name: string;
        description: string;
        responsibilities: string[];
    }[];
    designPatterns: string[];
}

export class ArchitectAgent extends BaseAgent<ArchitectInput, ArchitectureDesign> {
    constructor() {
        super({ name: 'Architect', timeout: 20000 });
    }

    async execute(input: ArchitectInput): Promise<AgentOutput<ArchitectureDesign>> {
        const startTime = Date.now();
        const query = input.query.toLowerCase();
        
        // Determine Project Type & Tech Stack
        let design: ArchitectureDesign = {
            architecture: "Standard MVC",
            techStack: [],
            fileStructure: [],
            components: [],
            designPatterns: []
        };

        if (query.includes('ecommerce') || query.includes('shop')) {
            design = this.getEcommerceDesign(input.projectType || 'node');
        } else if (query.includes('react') || input.projectType === 'react') {
            design = this.getReactDesign();
        } else if (query.includes('cli') || query.includes('tool')) {
            design = this.getCLIDesign();
        } else {
            design = this.getGenericDesign();
        }

        return this.createOutput('success', design, 1.0, startTime, {
            reasoning: `Generated ${design.architecture} architecture with ${design.fileStructure.length} files.`
        });
    }

    private getEcommerceDesign(type: string): ArchitectureDesign {
        return {
            architecture: "Clean Architecture (Layered)",
            techStack: ["Node.js", "Express", "MongoDB", "JWT"],
            fileStructure: [
                "src/server.ts",
                "src/app.ts",
                "src/config/database.ts",
                "src/controllers/authController.ts",
                "src/controllers/productController.ts",
                "src/controllers/orderController.ts",
                "src/models/User.ts",
                "src/models/Product.ts",
                "src/models/Order.ts",
                "src/routes/authRoutes.ts",
                "src/routes/productRoutes.ts",
                "src/routes/orderRoutes.ts",
                "src/middleware/auth.ts",
                "src/utils/errorHandler.ts",
                "package.json",
                ".env.example"
            ],
            components: [
                { name: "Auth Service", description: "Handles user registration and login", responsibilities: ["Login", "Register", "Token Management"] },
                { name: "Product Catalog", description: "Manages product listings", responsibilities: ["CRUD Products", "Search"] },
                { name: "Order Processing", description: "Handles order lifecycle", responsibilities: ["Create Order", "Update Status", "History"] }
            ],
            designPatterns: ["Repository Pattern", "Factory Pattern", "Middleware Pattern"]
        };
    }

    private getReactDesign(): ArchitectureDesign {
        return {
            architecture: "Component-Based",
            techStack: ["React", "TypeScript", "Vite", "TailwindCSS"],
            fileStructure: [
                "src/main.tsx",
                "src/App.tsx",
                "src/components/Header.tsx",
                "src/components/Footer.tsx",
                "src/components/Button.tsx",
                "src/pages/Home.tsx",
                "src/pages/About.tsx",
                "src/hooks/useAuth.ts",
                "src/context/ThemeContext.tsx",
                "src/api/client.ts",
                "package.json",
                "vite.config.ts"
            ],
            components: [
                { name: "App Root", description: "Main application container", responsibilities: ["Routing", "Global Layout"] },
                { name: "UI Library", description: "Reusable atomic components", responsibilities: ["Buttons", "Inputs", "Cards"] }
            ],
            designPatterns: ["Compound Components", "Custom Hooks", "Context API"]
        };
    }

    private getCLIDesign(): ArchitectureDesign {
        return {
            architecture: "Command Pattern",
            techStack: ["Node.js", "Commander", "Chalk", "Inquirer"],
            fileStructure: [
                "bin/cli.js",
                "src/index.ts",
                "src/commands/init.ts",
                "src/commands/build.ts",
                "src/utils/logger.ts",
                "src/utils/fileSystem.ts",
                "package.json",
                "tsconfig.json"
            ],
            components: [
                { name: "CLI Entry", description: "Parses arguments", responsibilities: ["Arg Parsing", "Help Menu"] },
                { name: "Command Handlers", description: "Executes specific logic", responsibilities: ["Init", "Build"] }
            ],
            designPatterns: ["Command Pattern", "Singleton (Logger)"]
        };
    }

    private getGenericDesign(): ArchitectureDesign {
        return {
            architecture: "Simple Modular",
            techStack: ["TypeScript", "Node.js"],
            fileStructure: [
                "src/index.ts",
                "src/utils/helper.ts",
                "package.json",
                "tsconfig.json",
                "README.md"
            ],
            components: [
                { name: "Main", description: "Entry point", responsibilities: ["Orchestration"] }
            ],
            designPatterns: ["Module Pattern"]
        };
    }
}

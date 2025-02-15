import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { elizaLogger } from '@elizaos/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GeneratorConfig {
    plugins: string[];
    character: string;
    outputDir: string;
}

function generateImports(plugins: string[]): string {
    const imports: string[] = [];

    // Add core imports
    imports.push(
        `import { AgentRuntime, CacheManager, elizaLogger } from '@elizaos/core';`,
    );

    // Add plugin imports
    for (const plugin of plugins) {
        imports.push(
            `import { ${plugin}Plugin } from '@elizaos/plugin-${plugin}';`,
        );
    }

    return imports.join('\n');
}

function generatePluginInitialization(plugins: string[]): string {
    return `
    const enabledPlugins = [
        ${plugins.map((p) => `${p}Plugin`).join(',\n        ')}
    ].filter(Boolean);
    `;
}

export async function generateAgent(config: GeneratorConfig) {
    // Output to a builds directory within service
    const buildsDir = path.join(__dirname, '../builds');
    const outputDir = path.resolve(buildsDir, config.outputDir);

    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate imports based on selected plugins
    const imports = generateImports(config.plugins);

    // Generate plugin initialization code
    const pluginInit = generatePluginInitialization(config.plugins);

    // Read the base template
    const templatePath = path.join(__dirname, './templates/index.template.ts');
    let template = fs.readFileSync(templatePath, 'utf8');

    // Replace placeholders
    template = template
        .replace('/* IMPORTS */', imports)
        .replace('/* PLUGIN_INITIALIZATION */', pluginInit);

    // Write generated index.ts
    const outputPath = path.join(outputDir, 'index.ts');
    fs.writeFileSync(outputPath, template);

    // Copy character config
    const characterPath = path.resolve(process.cwd(), config.character);
    if (fs.existsSync(characterPath)) {
        fs.copyFileSync(characterPath, path.join(outputDir, 'character.json'));
    }

    // Generate package.json
    const packageTemplate = {
        name: `@elizaos/agent-${path.basename(config.outputDir)}`,
        version: '1.0.0',
        type: 'module',
        scripts: {
            build: 'tsc',
            start: 'node dist/index.js',
        },
        dependencies: {
            '@elizaos/core': 'latest',
            ...config.plugins.reduce(
                (acc, plugin) => ({
                    ...acc,
                    [`@elizaos/plugin-${plugin}`]: 'latest',
                }),
                {},
            ),
        },
    };

    fs.writeFileSync(
        path.join(outputDir, 'package.json'),
        JSON.stringify(packageTemplate, null, 2),
    );

    // Generate Dockerfile that references the main Eliza image
    const dockerfile = `
FROM eliza:latest as base

WORKDIR /app/custom-agent

# Copy generated agent files
COPY . .

# Install dependencies
RUN pnpm install

# Build the agent
RUN pnpm run build

# Create data directory
RUN mkdir -p data

# Expose agent port
EXPOSE 3000

# Start the agent
CMD ["pnpm", "start"]
`;

    fs.writeFileSync(path.join(outputDir, 'Dockerfile'), dockerfile);

    elizaLogger.info(`Generated agent in ${outputDir}`);
    return outputDir;
}

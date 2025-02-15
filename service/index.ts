import { Kafka } from 'kafkajs';
import { elizaLogger } from '../packages/core/src/index.js';
import { generateAgent } from './generator';
import { exec } from 'child_process';
import { promisify } from 'util';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const execAsync = promisify(exec);

interface AgentCreationEvent {
    plugins: string[];
    character: string;
    agentId: string;
    dockerRegistry?: string;
}

async function pushToDockerHub(
    imageName: string,
    registry?: string,
): Promise<void> {
    const registryUrl = registry || 'docker.io';
    const fullImageName = `${registryUrl}/${imageName}`;

    try {
        await execAsync(`docker tag ${imageName} ${fullImageName}`);
        await execAsync(`docker push ${fullImageName}`);
        elizaLogger.info(`Successfully pushed ${fullImageName} to registry`);
    } catch (error) {
        elizaLogger.error(`Failed to push image to registry: ${error}`);
        throw error;
    }
}

async function processAgentCreation(event: AgentCreationEvent) {
    try {
        elizaLogger.info('Processing agent creation:', event);

        // Generate the agent
        const outputDir = await generateAgent({
            plugins: event.plugins,
            character: event.character,
            outputDir: event.agentId,
        });

        // Check if Docker is running
        try {
            await execAsync('docker info');

            // Build main Eliza image first
            elizaLogger.info('Building main Eliza image...');
            await execAsync('cd .. && docker build -t eliza .');
            elizaLogger.info('Successfully built main Eliza image');

            // Then build the custom agent
            const imageName = `custom-agent-${event.agentId}`;
            await execAsync(
                `cd ${outputDir} && docker build -t ${imageName} .`,
            );
            elizaLogger.info(`Built Docker image: ${imageName}`);

            // Push to registry if specified
            if (event.dockerRegistry) {
                await pushToDockerHub(imageName, event.dockerRegistry);
            }
        } catch (error) {
            elizaLogger.warn(
                'Docker setup failed. Skipping Docker build and push.',
            );
            elizaLogger.info(`Agent files generated in: ${outputDir}`);
            elizaLogger.info('To build manually:');
            elizaLogger.info('1. Start Docker');
            elizaLogger.info('2. cd ..');
            elizaLogger.info('3. docker build -t eliza .');
            elizaLogger.info(`4. cd ${outputDir}`);
            elizaLogger.info(
                `5. docker build -t custom-agent-${event.agentId} .`,
            );
            if (event.dockerRegistry) {
                elizaLogger.info(
                    `6. docker push ${event.dockerRegistry}/custom-agent-${event.agentId}`,
                );
            }
            return;
        }

        elizaLogger.info(
            `Successfully processed agent creation for ${event.agentId}`,
        );
    } catch (error) {
        elizaLogger.error('Error processing agent creation event:', error);
        throw error;
    }
}

async function startKafkaService() {
    const kafka = new Kafka({
        clientId: 'agent-builder',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    });

    const consumer = kafka.consumer({ groupId: 'agent-builder-group' });

    await consumer.connect();
    await consumer.subscribe({ topic: 'agent-creation', fromBeginning: true });

    elizaLogger.info('Agent Builder Service started, waiting for events...');

    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                const event: AgentCreationEvent = JSON.parse(
                    message.value?.toString() || '',
                );
                await processAgentCreation(event);
            } catch (error) {
                elizaLogger.error(
                    'Error processing agent creation event:',
                    error,
                );
            }
        },
    });
}

async function startDevMode() {
    const argv = await yargs(hideBin(process.argv))
        .option('plugins', {
            type: 'string',
            description: 'Comma-separated list of plugins',
            demandOption: true,
        })
        .option('character', {
            type: 'string',
            description: 'Path to character file',
            demandOption: true,
        })
        .option('agentId', {
            type: 'string',
            description: 'Unique ID for the agent',
            demandOption: true,
        })
        .option('registry', {
            type: 'string',
            description: 'Docker registry URL',
        })
        .parse();

    const event: AgentCreationEvent = {
        plugins: argv.plugins.split(',').map((p) => p.trim()),
        character: argv.character,
        agentId: argv.agentId,
        dockerRegistry: argv.registry,
    };

    await processAgentCreation(event);
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    elizaLogger.info('Received SIGTERM, shutting down...');
    process.exit(0);
});

// Start service based on environment
if (process.env.NODE_ENV === 'development') {
    startDevMode().catch((error) => {
        elizaLogger.error('Failed to process in dev mode:', error);
        process.exit(1);
    });
} else {
    startKafkaService().catch((error) => {
        elizaLogger.error('Failed to start Kafka service:', error);
        process.exit(1);
    });
}

import fs from 'fs';
import {
    AgentRuntime,
    CacheManager,
    CacheStore,
    elizaLogger,
    initializeDatabase,
    initializeCache,
    getTokenForProvider,
    initializeClients,
} from '@elizaos/core';

import { AgentRuntime, CacheManager, elizaLogger } from '@elizaos/core';
import { thirdWebPlugin } from '@elizaos/plugin-thirdWeb';

const startAgent = async () => {
    try {
        // Load character configuration
        const character = JSON.parse(
            fs.readFileSync('./character.json', 'utf8'),
        );

        // Initialize database
        const db = initializeDatabase('./data');
        await db.init();

        // Initialize cache
        const cache = initializeCache(
            process.env.CACHE_STORE ?? CacheStore.DATABASE,
            character,
            '',
            db,
        );

        const token = getTokenForProvider(character.modelProvider, character);

        
    const enabledPlugins = [
        thirdWebPlugin
    ].filter(Boolean);
    

        // Create agent runtime
        const runtime = new AgentRuntime({
            databaseAdapter: db,
            token,
            modelProvider: character.modelProvider,
            character,
            plugins: enabledPlugins,
            providers: [],
            managers: [],
            cacheManager: cache,
        });

        // Initialize and start the agent
        await runtime.initialize();
        runtime.clients = await initializeClients(character, runtime);

        elizaLogger.info(`Started ${character.name} as ${runtime.agentId}`);
    } catch (error) {
        elizaLogger.error('Error starting agent:', error);
        process.exit(1);
    }
};

startAgent();

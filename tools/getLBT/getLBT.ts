import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import parameters from './parameters.json';
import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';
import { fetchEventsInBatches, executeInBatches } from '../utils';
import { AgglayerBridge } from '../../typechain-types';

const DEFAULT_BLOCK_RANGE = 100000;
const DEFAULT_CONCURRENCY_LIMIT = 10;

async function main() {
    /*
     * Check parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryParameters = ['agglayerBridgeAddress'];
    checkParams(parameters, mandatoryParameters);

    const { agglayerBridgeAddress, options } = parameters;
    const dateStr = new Date().toISOString();

    // Get bridge instance
    const bridgeFactory = await ethers.getContractFactory('AgglayerBridge');
    const contract = bridgeFactory.attach(agglayerBridgeAddress) as AgglayerBridge;

    const latest = await ethers.provider.getBlockNumber();

    // //////////////////////////////
    //  Get events NewWrappedToken //
    // //////////////////////////////
    const blockRange = options?.blockRange || DEFAULT_BLOCK_RANGE;
    const concurrencyLimit = options?.concurrencyLimit || DEFAULT_CONCURRENCY_LIMIT;
    const events = [];
    logger.info(`Bridge address: ${agglayerBridgeAddress}`);

    if (options?.getEventsFromFile) {
        logger.info(`Getting events from file events.json`);
        const eventsFile = fs.readFileSync(path.join(__dirname, `events.json`), 'utf-8');
        const eventsJson = JSON.parse(eventsFile);
        events.push(...eventsJson);
    } else {
        logger.info(`Events fetching from block 0 to ${latest} with blockRange ${blockRange} and concurrencyLimit ${concurrencyLimit}`);

        // Create event filter
        const newWrappedTokenFilter = contract.filters.NewWrappedToken();

        // Fetch events in parallel batches
        const allResults = await fetchEventsInBatches(
            contract,
            newWrappedTokenFilter,
            blockRange,
            latest,
            concurrencyLimit,
            'NewWrappedToken events',
        );

        logger.info(`Processing fetched events...`);
        // Process results in order
        // eslint-disable-next-line no-restricted-syntax
        for (const result of allResults) {
            const { events: fetchedEvents } = result;

            if (fetchedEvents.length > 0) {
                // eslint-disable-next-line no-restricted-syntax
                for (const event of fetchedEvents) {
                    events.push({
                        blockNumber: event.blockNumber.toString(),
                        originNetwork: event.args[0].toString(),
                        originTokenAddress: event.args[1],
                        wrappedTokenAddress: event.args[2],
                    });
                    logger.info(
                        `Block number: ${event.blockNumber.toString()} - wrappedTokenAddress: ${event.args[2]}`,
                    );
                }
            }
        }
    }

    logger.info(`Collecting totalSupply of every wrapped token (${events.length} tokens)...`);

    // Fetch totalSupply in parallel batches
    await executeInBatches(
        events,
        async (event) => {
            const { wrappedTokenAddress } = event;
            const contractToken = await ethers.getContractAt('TokenWrapped', wrappedTokenAddress);
            const totalSupply = await contractToken.totalSupply();
            event.totalSupply = totalSupply.toString();
        },
        concurrencyLimit,
        'Collecting totalSupply',
    );

    if (options?.printEvents) {
        fs.writeFileSync(path.join(__dirname, `events-${dateStr}.json`), JSON.stringify(events, null, 2));
    }

    const objectInitialize = {
        originNetwork: [],
        originTokenAddress: [],
        totalSupply: [],
    };

    // eslint-disable-next-line no-restricted-syntax
    for (const event of events) {
        objectInitialize.originNetwork.push(event.originNetwork);
        objectInitialize.originTokenAddress.push(event.originTokenAddress);
        objectInitialize.totalSupply.push(event.totalSupply);
    }

    fs.writeFileSync(
        path.join(__dirname, `initializeLBT-${dateStr}.json`),
        JSON.stringify(objectInitialize, null, 2),
    );
    logger.info(`File initializeLBT-${dateStr}.json created`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

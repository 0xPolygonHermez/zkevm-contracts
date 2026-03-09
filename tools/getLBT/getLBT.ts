import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';
import { fetchEventsInBatches, executeInBatches } from '../utils';
import { AgglayerBridge } from '../../typechain-types';

const DEFAULT_BLOCK_RANGE = 1000;
const DEFAULT_CONCURRENCY_LIMIT = 100;

export interface LBTEntry {
    wrappedTokenAddress: string;
    originNetwork: string | number;
    originTokenAddress: string;
    balance: string;
}

export interface GetLBTOptions {
    blockNumber?: number | 'latest';
    blockRange?: number;
    concurrencyLimit?: number;
}

export interface GetLBTResult {
    LBTObject: LBTEntry[];
    initNativeSupply: string;
    tokenAddresses: string[];
}

/**
 * Fetches LBT (Local Balance Tree) data from a bridge contract.
 *
 * @param provider - Ethers provider to use for fetching data
 * @param bridgeAddress - Address of the AgglayerBridge contract
 * @param options - Optional configuration
 * @returns LBT data including LBTObject, initNativeSupply, and tokenAddresses
 */
export async function getLBTData(
    provider: typeof ethers.provider,
    bridgeAddress: string,
    options?: GetLBTOptions,
): Promise<GetLBTResult> {
    const blockRange = options?.blockRange || DEFAULT_BLOCK_RANGE;
    const concurrencyLimit = options?.concurrencyLimit || DEFAULT_CONCURRENCY_LIMIT;

    // Get bridge instance
    const bridgeFactory = (await ethers.getContractFactory('AgglayerBridge')).connect(provider);
    const AgglayerBridgeContract = (await bridgeFactory.attach(bridgeAddress)) as AgglayerBridge;

    // Determine block number
    let blockNumber: number;
    if (options?.blockNumber && options.blockNumber !== 'latest') {
        blockNumber = options.blockNumber;
        // eslint-disable-next-line no-restricted-globals
        if (isNaN(blockNumber) || blockNumber < 0) {
            throw new Error(`Invalid blockNumber: ${options.blockNumber}. Must be a non-negative number or "latest"`);
        }
    } else {
        blockNumber = await provider.getBlockNumber();
    }

    logger.info(`Bridge address: ${bridgeAddress}`);
    logger.info(`Block number: ${blockNumber}`);

    // //////////////////////////////
    //  Get events NewWrappedToken //
    // //////////////////////////////
    const events: {
        blockNumber: string;
        originNetwork: string;
        originTokenAddress: string;
        wrappedTokenAddress: string;
        totalSupply?: string;
    }[] = [];

    logger.info(
        `Events fetching from block 0 to ${blockNumber} with blockRange ${blockRange} and concurrencyLimit ${concurrencyLimit}`,
    );

    // Create event filter
    const newWrappedTokenFilter = AgglayerBridgeContract.filters.NewWrappedToken();

    // Fetch events in parallel batches
    const allResults = await fetchEventsInBatches(
        AgglayerBridgeContract,
        newWrappedTokenFilter,
        blockRange,
        blockNumber,
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
                logger.info(`Block number: ${event.blockNumber.toString()} - wrappedTokenAddress: ${event.args[2]}`);
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
            const totalSupply = await contractToken.totalSupply({ blockTag: blockNumber });
            event.totalSupply = totalSupply.toString();
        },
        concurrencyLimit,
        'Collecting totalSupply',
    );

    const tokenAddresses: string[] = [];
    const LBTObject: LBTEntry[] = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const event of events) {
        tokenAddresses.push(event.wrappedTokenAddress);
        LBTObject.push({
            wrappedTokenAddress: event.wrappedTokenAddress,
            originNetwork: event.originNetwork,
            originTokenAddress: event.originTokenAddress,
            balance: event.totalSupply!,
        });
    }

    // Get initial native supply
    const initNativeSupply = await provider.getBalance(bridgeAddress, 0);
    const currentNativeSupply = await provider.getBalance(bridgeAddress, blockNumber);
    const currentNativeUnlocked = initNativeSupply - currentNativeSupply;

    // Add native supply to LBT object
    LBTObject.push({
        wrappedTokenAddress: ethers.ZeroAddress,
        originNetwork: (await AgglayerBridgeContract.gasTokenNetwork()).toString(),
        originTokenAddress: await AgglayerBridgeContract.gasTokenAddress(),
        balance: currentNativeUnlocked.toString(),
    });

    // Get WETH token address, this only works if the network has a gas token
    const weth = await AgglayerBridgeContract.WETHToken();
    if (weth !== ethers.ZeroAddress) {
        // Get WETH total supply
        const wethContract = await ethers.getContractAt('TokenWrapped', weth);
        const wethTotalSupply = await wethContract.totalSupply({ blockTag: blockNumber });

        LBTObject.push({
            wrappedTokenAddress: weth,
            originNetwork: '0', // ether
            originTokenAddress: ethers.ZeroAddress, // ether
            balance: wethTotalSupply.toString(),
        });
    }

    return {
        LBTObject,
        initNativeSupply: initNativeSupply.toString(),
        tokenAddresses,
    };
}

async function main() {
    /*
     * Load parameters from file
     */
    const parametersPath = path.join(__dirname, 'parameters.json');
    if (!fs.existsSync(parametersPath)) {
        throw new Error(`Parameters file not found: ${parametersPath}`);
    }
    const parameters = JSON.parse(fs.readFileSync(parametersPath, 'utf8'));

    /*
     * Check parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryParameters = ['agglayerBridgeAddress'];
    checkParams(parameters, mandatoryParameters);

    const { agglayerBridgeAddress, options } = parameters;
    const dateStr = new Date().toISOString();

    // Parse block number from options
    let blockNumber: number | 'latest' | undefined;
    if (options?.blockNumber) {
        if (options.blockNumber === 'latest') {
            blockNumber = 'latest';
        } else {
            blockNumber = parseInt(options.blockNumber, 10);
        }
    }

    // Call the exported function
    const result = await getLBTData(ethers.provider, agglayerBridgeAddress, {
        blockNumber,
        blockRange: options?.blockRange,
        concurrencyLimit: options?.concurrencyLimit,
    });

    // Write events file if requested
    if (options?.printEvents) {
        // Re-fetch events for file output (with totalSupply)
        const eventsWithSupply = result.LBTObject.filter(
            (entry) => entry.wrappedTokenAddress !== ethers.ZeroAddress,
        ).map((entry) => ({
            originNetwork: entry.originNetwork.toString(),
            originTokenAddress: entry.originTokenAddress,
            wrappedTokenAddress: entry.wrappedTokenAddress,
            totalSupply: entry.balance,
        }));
        fs.writeFileSync(path.join(__dirname, `events.json`), JSON.stringify(eventsWithSupply, null, 2));
    }

    // Write tokens file if requested
    if (options?.printTokens) {
        const printObject = {
            initNativeSupply: result.initNativeSupply,
            tokenAddresses: result.tokenAddresses,
        };
        const writeTokensPath = path.join(__dirname, `WTokens-${dateStr}.json`);
        fs.writeFileSync(writeTokensPath, JSON.stringify(printObject, null, 2));
        logger.info(`File ${writeTokensPath} created`);
    }

    // Write LBT file
    const writeLBTPath = path.join(__dirname, `LBT-${dateStr}.json`);

    fs.writeFileSync(writeLBTPath, JSON.stringify(result.LBTObject, null, 2));
    logger.info(`File ${writeLBTPath} created`);
}

// Only run main() when this file is executed directly, not when imported
if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

/* eslint-disable no-extend-native */
if (!Object.prototype.hasOwnProperty.call(BigInt.prototype, 'toJSON')) {
    Object.defineProperty(BigInt.prototype, 'toJSON', {
        get() {
            return () => String(this);
        },
    });
}

/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
import * as ethers from 'ethers';
import { getGitInfo } from '../src/utils';
import { SUPPORT_BRIDGE_PROXY } from '../src/constants';
import { logger } from '../src/logger';

export function genOperation(target, value, data, predecessor, salt) {
    const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256', 'bytes', 'uint256', 'bytes32'],
        [target, value, data, predecessor, salt],
    );
    const id = ethers.keccak256(abiEncoded);
    return {
        id,
        target,
        value,
        data,
        predecessor,
        salt,
    };
}

export const transactionTypes = {
    EOA: 'EOA',
    MULTISIG: 'Multisig',
    TIMELOCK: 'Timelock',
};

// Function to recursively convert BigInts to Numbers
export function convertBigIntsToNumbers(obj) {
    if (typeof obj === 'bigint') {
        if (obj > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error(`convertBigIntsToNumbers: BigInt exceeds maximum safe integer: ${obj}`);
        }
        return Number(obj); // Convert BigInt to Number
    }

    if (Array.isArray(obj)) {
        return obj.map(convertBigIntsToNumbers); // Recursively process each element in the array
    }

    if (typeof obj === 'object' && obj !== null) {
        const newObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                newObj[key] = convertBigIntsToNumbers(obj[key]); // Recursively process each property
            }
        }
        return newObj;
    }

    return obj; // Return the value if it's not a BigInt, object, or array
}

export function checkBridgeAddress(genesis, expectedBridgeAddress) {
    // get bridge address in genesis file
    let genesisBridgeAddress = ethers.ZeroAddress;
    let bridgeContractName = '';

    for (let i = 0; i < genesis.genesis.length; i++) {
        if (SUPPORT_BRIDGE_PROXY.includes(genesis.genesis[i].contractName)) {
            genesisBridgeAddress = genesis.genesis[i].address;
            bridgeContractName = genesis.genesis[i].contractName;
            break;
        }
    }

    if (expectedBridgeAddress.toLowerCase() !== genesisBridgeAddress.toLowerCase()) {
        throw new Error(
            `checkBridgeAddress: '${bridgeContractName}' address in the 'genesis.json' does not match the 'expectedBridgeAddress'`,
        );
    }
}

/**
 * Function to add extra info output (TODO: add more info)
 * @param {Object} output - output json object
 * @param {Boolean} criticalTooling - (optional) if true, throws an error if no tag
 * @returns {Object} output - output json object with git info added
 */
export function addInfoOutput(output, criticalTooling = false) {
    output.gitInfo = getGitInfo(criticalTooling);
    return output;
}

/**
 * Fetch contract events in parallel batches
 * @param contract - The contract instance
 * @param eventFilter - Event filter created using contract.filters.EventName(...)
 * @param blockRange - Size of each block range
 * @param latestBlock - Latest block number
 * @param concurrencyLimit - Maximum number of parallel queries
 * @param eventLabel - Optional label for logging (e.g., "NewWrappedToken")
 * @returns Array of all events found
 */
export async function fetchEventsInBatches(
    contract: any,
    eventFilter: any,
    blockRange: number,
    latestBlock: number,
    concurrencyLimit: number,
    eventLabel: string = 'events',
) {
    if (blockRange <= 0) {
        throw new Error(`blockRange must be greater than zero, received: ${blockRange}`);
    }
    if (latestBlock < 0) {
        throw new Error(`latestBlock must be non-negative, received: ${latestBlock}`);
    }
    if (concurrencyLimit <= 0) {
        throw new Error(`concurrencyLimit must be greater than zero, received: ${concurrencyLimit}`);
    }

    const totalRanges = Math.ceil((latestBlock + 1) / blockRange);
    const allResults = [];

    logger.info(`Fetching ${eventLabel} with concurrency limit of ${concurrencyLimit}...`);

    for (let batchStart = 0; batchStart < totalRanges; batchStart += concurrencyLimit) {
        const batchEnd = Math.min(batchStart + concurrencyLimit, totalRanges);
        const batchPromises = [];

        const batchFromBlock = blockRange * batchStart;
        const batchToBlock = Math.min(blockRange * batchEnd - 1, latestBlock);

        for (let i = batchStart; i < batchEnd; i++) {
            const from = blockRange * i;
            const to = Math.min(blockRange * (i + 1) - 1, latestBlock);

            batchPromises.push(
                contract.queryFilter(eventFilter, from, to).then((events: any) => ({
                    from,
                    to,
                    events,
                })),
            );
        }

        // eslint-disable-next-line no-await-in-loop
        const batchResults = await Promise.all(batchPromises);
        allResults.push(...batchResults);

        const percentage = ((batchEnd / totalRanges) * 100).toFixed(2);
        const batchNumber = Math.floor(batchStart / concurrencyLimit) + 1;
        const totalBatches = Math.ceil(totalRanges / concurrencyLimit);
        logger.info(
            `Fetched batch ${batchNumber}/${totalBatches} [${percentage}%] (blocks ${batchFromBlock}-${batchToBlock})`,
        );
    }

    return allResults;
}

/**
 * Execute tasks in parallel batches
 * @param items - Array of items to process
 * @param taskFn - Function that processes each item
 * @param concurrencyLimit - Maximum number of parallel tasks
 * @param progressLabel - Label for progress logging
 * @returns Array of results
 */
export async function executeInBatches<T, R>(
    items: T[],
    taskFn: (item: T) => Promise<R>,
    concurrencyLimit: number,
    progressLabel: string,
): Promise<R[]> {
    if (concurrencyLimit <= 0) {
        throw new Error(`concurrencyLimit must be greater than zero, received: ${concurrencyLimit}`);
    }

    const allResults: R[] = [];
    const totalBatches = Math.ceil(items.length / concurrencyLimit);

    for (let batchStart = 0; batchStart < items.length; batchStart += concurrencyLimit) {
        const batchEnd = Math.min(batchStart + concurrencyLimit, items.length);
        const batchPromises: Promise<R>[] = [];

        for (let i = batchStart; i < batchEnd; i++) {
            batchPromises.push(taskFn(items[i]));
        }

        // eslint-disable-next-line no-await-in-loop
        const batchResults = await Promise.all(batchPromises);
        allResults.push(...batchResults);

        const percentage = ((batchEnd / items.length) * 100).toFixed(2);
        const batchNumber = Math.floor(batchStart / concurrencyLimit) + 1;
        logger.info(`${progressLabel} batch ${batchNumber}/${totalBatches} [${percentage}%]`);
    }

    return allResults;
}

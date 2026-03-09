/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, no-inner-declarations, no-undef, import/no-unresolved, import/extensions */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers, network } from 'hardhat';
import { AgglayerManager } from '../../typechain-types';
import { transactionTypes, genOperation, encodeMultiSendCallOnly } from '../utils';
import '../../deployment/helpers/utils';
import { OBSOLETE_ROLLUP_TYPE_ROLE } from '../../src/constants';
import { logger } from '../../src/logger';
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters } from '../../src/utils';
import obsoleteRollupTypesParameters from './obsoleteRollupType.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dateStr = new Date().toISOString();
const pathOutputJson = path.join(__dirname, `./obsoleteRollupTypeOutput-${dateStr}.json`);

async function main() {
    /*
     * Check parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryDeploymentParameters = ['type', 'mode', 'agglayerManagerAddress'];

    // check create rollup type
    switch (obsoleteRollupTypesParameters.type) {
        case transactionTypes.EOA:
        case transactionTypes.MULTISIG:
            break;
        case transactionTypes.TIMELOCK:
            mandatoryDeploymentParameters.push('timelockDelay');
            break;
        default:
            throw new Error(`Invalid type ${obsoleteRollupTypesParameters.type}`);
    }

    checkParams(obsoleteRollupTypesParameters, mandatoryDeploymentParameters);

    // Validate mode parameter
    const paramsWithMode = obsoleteRollupTypesParameters as any;
    const { mode } = paramsWithMode;

    if (!['inclusion', 'exclusion', 'purge'].includes(mode)) {
        throw new Error(`Invalid mode "${mode}". Must be one of: inclusion, exclusion, purge`);
    }

    // For inclusion and exclusion modes, list is required
    if ((mode === 'inclusion' || mode === 'exclusion') && !paramsWithMode.list) {
        throw new Error(`Mode "${mode}" requires a "list" parameter`);
    }

    logger.info(`Starting script to obsolete rollup types from ${obsoleteRollupTypesParameters.type}`);
    logger.info(`Mode: ${mode}`);

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(obsoleteRollupTypesParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, obsoleteRollupTypesParameters, ethers);
    logger.info(`Using deployer: ${deployer.address}`);

    const { agglayerManagerAddress } = obsoleteRollupTypesParameters;

    // Load Rollup manager
    const AgglayerManagerFactory = await ethers.getContractFactory('AgglayerManager', deployer);
    const rollupManagerContract = AgglayerManagerFactory.attach(agglayerManagerAddress) as AgglayerManager;

    let rollupTypesToObsolete: number[] = [];

    if (mode === 'inclusion') {
        // Mode 1: Inclusion - obsolete specified rollup types
        logger.info('Processing inclusion mode: obsolete specified rollup types');
        rollupTypesToObsolete = paramsWithMode.list;

        if (rollupTypesToObsolete.length === 0) {
            throw new Error('No rollup types to obsolete');
        }

        logger.info('Checking if any rollup types are already obsolete (parallel fetching)...');

        // Fetch all rollup type data in parallel
        const rollupTypePromises = rollupTypesToObsolete.map((rollupTypeID) =>
            rollupManagerContract
                .rollupTypeMap(rollupTypeID)
                .then((rollupType) => ({ rollupTypeID, rollupType, success: true as const }))
                .catch((error) => ({ rollupTypeID, error, success: false as const })),
        );

        const rollupTypeResults = await Promise.all(rollupTypePromises);

        // Process results
        // eslint-disable-next-line no-restricted-syntax
        for (const result of rollupTypeResults) {
            if (!result.success) {
                logger.error(`ERROR: Failed to check rollup type ${result.rollupTypeID}:`, (result as any).error);
                process.exit(1);
            }
            if ((result as any).rollupType.obsolete) {
                logger.error(`ERROR: Rollup type ${result.rollupTypeID} is already obsolete!`);
                process.exit(1);
            }
            logger.info(`✓ Rollup type ${result.rollupTypeID} is not obsolete`);
        }
        logger.info('All rollup types are valid and not obsolete');
    } else if (mode === 'exclusion') {
        // Mode 2: Exclusion - obsolete all rollup types except specified ones
        logger.info('Processing exclusion mode: obsolete all rollup types except excluded ones');
        const excludedRollupTypesID = paramsWithMode.list;

        // Get the total number of rollup types
        logger.info('Fetching all rollup types from AgglayerManager...');
        const rollupTypeCount = await rollupManagerContract.rollupTypeCount();
        logger.info(`Total rollup types count: ${rollupTypeCount}`);

        const excludedSet = new Set(excludedRollupTypesID);
        logger.info(`Excluded rollup types: [${Array.from(excludedSet).join(', ')}]`);
        logger.info('Scanning rollup types (parallel fetching)...');

        // Fetch all rollup type data in parallel
        const rollupTypePromises = [];
        for (let i = 1; i <= rollupTypeCount; i++) {
            rollupTypePromises.push(
                rollupManagerContract
                    .rollupTypeMap(i)
                    .then((rollupType) => ({ rollupTypeID: i, rollupType, success: true as const }))
                    .catch((error) => ({ rollupTypeID: i, error, success: false as const })),
            );
        }

        const rollupTypeResults = await Promise.all(rollupTypePromises);

        // Process results
        // eslint-disable-next-line no-restricted-syntax
        for (const result of rollupTypeResults) {
            if (result.success) {
                if ((result as any).rollupType.obsolete) {
                    logger.info(`  Rollup type ${result.rollupTypeID}: Already obsolete (skipping)`);
                } else if (excludedSet.has(result.rollupTypeID)) {
                    logger.info(`  Rollup type ${result.rollupTypeID}: In excluded list (skipping)`);
                } else {
                    logger.info(`  Rollup type ${result.rollupTypeID}: Will be obsoleted`);
                    rollupTypesToObsolete.push(result.rollupTypeID);
                }
            } else {
                logger.warn(`  Rollup type ${result.rollupTypeID}: Failed to fetch (skipping)`, (result as any).error);
            }
        }

        logger.info(`Total rollup types to obsolete: ${rollupTypesToObsolete.length}`);
        logger.info(`Rollup types to obsolete: [${rollupTypesToObsolete.join(', ')}]`);

        if (rollupTypesToObsolete.length === 0) {
            logger.info('No rollup types to obsolete. Exiting.');
            return;
        }
    } else if (mode === 'purge') {
        // Mode 3: Purge - obsolete all rollup types not used by any rollup
        logger.info('Processing purge mode: obsolete all rollup types not used by any rollup');

        // Get all rollups and their rollupTypeIDs
        logger.info('Fetching all rollups from AgglayerManager...');
        const rollupCount = await rollupManagerContract.rollupCount();
        logger.info(`Total rollups count: ${rollupCount}`);

        const usedRollupTypes = new Set<number>();
        logger.info('Scanning rollups to find used rollup types (parallel fetching)...');

        // Fetch all rollup data in parallel
        const rollupPromises = [];
        for (let rollupID = 1; rollupID <= rollupCount; rollupID++) {
            rollupPromises.push(
                rollupManagerContract
                    .rollupIDToRollupDataV2(rollupID)
                    .then((rollupData) => ({ rollupID, rollupData, success: true as const }))
                    .catch((error) => ({ rollupID, error, success: false as const })),
            );
        }

        const rollupResults = await Promise.all(rollupPromises);

        // Process results
        // eslint-disable-next-line no-restricted-syntax
        for (const result of rollupResults) {
            if (result.success) {
                const rollupTypeID = Number((result as any).rollupData.rollupTypeID);
                usedRollupTypes.add(rollupTypeID);
            } else {
                logger.warn(`  Rollup ${result.rollupID}: Failed to fetch (skipping)`, (result as any).error);
            }
        }

        logger.info(
            `Used rollup types: [${Array.from(usedRollupTypes)
                .sort((a, b) => a - b)
                .join(', ')}]`,
        );

        // Get all rollup types and filter out the used ones
        logger.info('Fetching all rollup types from AgglayerManager...');
        const rollupTypeCount = await rollupManagerContract.rollupTypeCount();
        logger.info(`Total rollup types count: ${rollupTypeCount}`);
        logger.info('Scanning rollup types to find unused ones (parallel fetching)...');

        // Fetch all rollup type data in parallel
        const rollupTypePromises = [];
        for (let i = 1; i <= rollupTypeCount; i++) {
            rollupTypePromises.push(
                rollupManagerContract
                    .rollupTypeMap(i)
                    .then((rollupType) => ({ rollupTypeID: i, rollupType, success: true as const }))
                    .catch((error) => ({ rollupTypeID: i, error, success: false as const })),
            );
        }

        const rollupTypeResults = await Promise.all(rollupTypePromises);

        // Process results
        // eslint-disable-next-line no-restricted-syntax
        for (const result of rollupTypeResults) {
            if (result.success) {
                if ((result as any).rollupType.obsolete) {
                    logger.info(`  Rollup type ${result.rollupTypeID}: Already obsolete (skipping)`);
                } else if (usedRollupTypes.has(result.rollupTypeID)) {
                    logger.info(`  Rollup type ${result.rollupTypeID}: In use by rollup(s) (skipping)`);
                } else {
                    logger.info(`  Rollup type ${result.rollupTypeID}: Not used, will be obsoleted`);
                    rollupTypesToObsolete.push(result.rollupTypeID);
                }
            } else {
                logger.warn(`  Rollup type ${result.rollupTypeID}: Failed to fetch (skipping)`, (result as any).error);
            }
        }

        logger.info(`Total rollup types to obsolete: ${rollupTypesToObsolete.length}`);
        logger.info(`Rollup types to obsolete: [${rollupTypesToObsolete.join(', ')}]`);

        if (rollupTypesToObsolete.length === 0) {
            logger.info(
                'No rollup types to obsolete. All rollup types are either in use or already obsolete. Exiting.',
            );
            return;
        }
    }

    const outputsJson = [] as any;

    // Timelock vars
    const operations = {} as any;
    operations.target = [];
    operations.value = [];
    operations.data = [];
    const predecessor = ethers.ZeroHash;
    const salt = (obsoleteRollupTypesParameters as any).timelockSalt || ethers.ZeroHash;

    // MultiSend vars for Multisig with multiple actions
    const multisigTransactions = [] as any;

    // Check role once before the loop for EOA type
    if (obsoleteRollupTypesParameters.type === transactionTypes.EOA) {
        if ((await rollupManagerContract.hasRole(OBSOLETE_ROLLUP_TYPE_ROLE, deployer.address)) === false) {
            throw new Error(`Address ${deployer.address} does not have the OBSOLETE_ROLLUP_TYPE_ROLE role`);
        }
    }

    for (let i = 0; i < rollupTypesToObsolete.length; i++) {
        const outputJson = {} as any;
        const rollupTypeID = rollupTypesToObsolete[i];

        outputJson.networkName = network.name;
        outputJson.agglayerManagerAddress = agglayerManagerAddress;
        outputJson.rollupTypeID = rollupTypeID;

        if (obsoleteRollupTypesParameters.type === transactionTypes.EOA) {
            logger.info(`Obsoleting rollup type ${rollupTypeID}...`);
            try {
                const tx = await rollupManagerContract.obsoleteRollupType(rollupTypeID);
                const receipt = await tx.wait();
                if (receipt) {
                    logger.info(`Transaction hash: ${receipt.hash}`);
                }
                outputJson.successObsolete = true;
            } catch (e) {
                outputJson.successObsolete = false;
                logger.error(`Error obsoleting rollup type ${rollupTypeID}`);
                logger.error(e);
            }
        } else if (obsoleteRollupTypesParameters.type === transactionTypes.TIMELOCK) {
            logger.info(`Creating timelock txs for obsolete rollup type ${rollupTypeID}...`);
            const operation = genOperation(
                agglayerManagerAddress,
                0, // value
                AgglayerManagerFactory.interface.encodeFunctionData('obsoleteRollupType', [rollupTypeID]),
                predecessor, // predecessor
                salt, // salt
            );
            operations.target.push(operation.target);
            operations.value.push(operation.value);
            operations.data.push(operation.data);
        } else {
            logger.info(`Creating calldata for obsolete rollup type from multisig ${rollupTypeID}...`);
            const txObsoleteRollupType = AgglayerManagerFactory.interface.encodeFunctionData('obsoleteRollupType', [
                rollupTypeID,
            ]);
            outputJson.txObsoleteRollupType = txObsoleteRollupType;

            // Store transaction for MultiSendCallOnly encoding
            multisigTransactions.push({
                to: agglayerManagerAddress,
                value: 0,
                data: txObsoleteRollupType,
            });
        }
        outputsJson.push(outputJson);
    }

    // if type === Timelock --> get scheduleData & executeData
    if (obsoleteRollupTypesParameters.type === transactionTypes.TIMELOCK) {
        logger.info(`Build scheduleData & executeData`);
        const { timelockDelay } = obsoleteRollupTypesParameters;
        // load timelock
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);

        // Schedule operation
        const scheduleData = timelockContractFactory.interface.encodeFunctionData('scheduleBatch', [
            operations.target,
            operations.value,
            operations.data,
            predecessor,
            salt,
            timelockDelay,
        ]);

        // Execute operation
        const executeData = timelockContractFactory.interface.encodeFunctionData('executeBatch', [
            operations.target,
            operations.value,
            operations.data,
            predecessor,
            salt,
        ]);

        // Decode the scheduleData for better readability
        const timelockTx = timelockContractFactory.interface.parseTransaction({
            data: scheduleData,
        });
        const paramsArray = timelockTx?.fragment.inputs;
        const objectDecoded: any = {};

        for (let i = 0; i < (paramsArray?.length || 0); i++) {
            const currentParam = paramsArray![i];
            objectDecoded[currentParam.name] = timelockTx?.args[i];

            if (currentParam.name === 'payloads') {
                // for each payload
                const payloads = timelockTx?.args[i];
                for (let j = 0; j < payloads.length; j++) {
                    const data = payloads[j];
                    const decodedAgglayerManager = AgglayerManagerFactory.interface.parseTransaction({
                        data,
                    });

                    const resultDecodeAgglayerManager: any = {};
                    resultDecodeAgglayerManager.signature = decodedAgglayerManager?.signature;
                    resultDecodeAgglayerManager.selector = decodedAgglayerManager?.selector;

                    const paramsArrayData = decodedAgglayerManager?.fragment.inputs;

                    for (let n = 0; n < (paramsArrayData?.length || 0); n++) {
                        const currentParamData = paramsArrayData![n];
                        resultDecodeAgglayerManager[currentParamData.name] = decodedAgglayerManager?.args[n];
                    }
                    objectDecoded[`decodePayload_${j}`] = resultDecodeAgglayerManager;
                }
            }
        }
        const outputTimelock = {
            rollupTypes: outputsJson,
            scheduleData,
            executeData,
            decodeScheduleData: objectDecoded,
        };

        fs.writeFileSync(pathOutputJson, JSON.stringify(outputTimelock, null, 1));
    } else if (obsoleteRollupTypesParameters.type === transactionTypes.MULTISIG && multisigTransactions.length > 1) {
        // If Multisig with multiple actions, add MultiSendCallOnly encoding
        logger.info(`Building MultiSendCallOnly data for ${multisigTransactions.length} transactions...`);

        // Use utility function to encode transactions
        const multiSendCallOnlyData = encodeMultiSendCallOnly(multisigTransactions);

        // Build multiSendCallOnly object with optional address
        const multiSendCallOnly = {
            ...multiSendCallOnlyData,
            ...((obsoleteRollupTypesParameters as any).multiSendCallOnlyAddress && {
                multiSendCallOnlyAddress: (obsoleteRollupTypesParameters as any).multiSendCallOnlyAddress,
            }),
        };

        const outputWithMultiSend = {
            rollupTypes: outputsJson,
            multiSendCallOnly,
        };

        fs.writeFileSync(pathOutputJson, JSON.stringify(outputWithMultiSend, null, 1));
    } else {
        fs.writeFileSync(pathOutputJson, JSON.stringify(outputsJson, null, 1));
    }

    logger.info(`Finished script, output saved at: ${pathOutputJson}`);
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});

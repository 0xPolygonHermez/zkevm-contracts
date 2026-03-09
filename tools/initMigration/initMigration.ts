/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, import/extensions */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { AgglayerManager } from '../../typechain-types';
import { transactionTypes, genOperation } from '../utils';
import initMigrationParams from './initMigration.json';
import { UPDATE_ROLLUP_ROLE } from '../../src/constants';
import { checkParams, getDeployerFromParameters, getProviderAdjustingMultiplierGas } from '../../src/utils';
import { logger } from '../../src/logger';
import { decodeScheduleData } from '../../upgrade/utils';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dateStr = new Date().toISOString();
const pathOutputJson = path.join(__dirname, `./initMigration-${dateStr}.json`);

async function main() {
    /*
     * Check parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryParameters = ['type', 'rollupID', 'newRollupTypeID', 'upgradeData', 'polygonRollupManagerAddress'];

    // check create rollup type
    switch (initMigrationParams.type) {
        case transactionTypes.EOA:
        case transactionTypes.MULTISIG:
            break;
        case transactionTypes.TIMELOCK:
            mandatoryParameters.push('timelockDelay');
            break;
        default:
            throw new Error(`Invalid type ${initMigrationParams.type}`);
    }

    checkParams(initMigrationParams, mandatoryParameters);

    logger.info(`Starting script to update rollup from ${initMigrationParams.type}`);

    // Load provider
    logger.info('Load provider');
    const currentProvider = getProviderAdjustingMultiplierGas(initMigrationParams, ethers);

    // Load deployer
    logger.info('Load deployer');
    const deployer = await getDeployerFromParameters(currentProvider, initMigrationParams, ethers);
    logger.info(`Using with: ${deployer.address}`);

    const { type, polygonRollupManagerAddress, rollupID, newRollupTypeID, upgradeData } = initMigrationParams;

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager', deployer);
    const rollupManagerContract = PolygonRollupManagerFactory.attach(polygonRollupManagerAddress) as AgglayerManager;

    const outputJson = {} as any;

    if (type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock tx to add default vkey...');
        const salt = initMigrationParams.timelockSalt || ethers.ZeroHash;
        const predecessor = initMigrationParams.predecessor || ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
        const operation = genOperation(
            polygonRollupManagerAddress,
            0, // value
            PolygonRollupManagerFactory.interface.encodeFunctionData('initMigration', [
                rollupID,
                newRollupTypeID,
                upgradeData,
            ]),
            predecessor, // predecessor
            salt, // salt
        );
        // Schedule operation
        const scheduleData = timelockContractFactory.interface.encodeFunctionData('schedule', [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
            initMigrationParams.timelockDelay,
        ]);
        // Execute operation
        const executeData = timelockContractFactory.interface.encodeFunctionData('execute', [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        ]);
        logger.info(`scheduleData: ${JSON.stringify(scheduleData, null, 2)}`);
        logger.info(`executeData: ${JSON.stringify(executeData, null, 2)}`);
        outputJson.scheduleData = scheduleData;
        outputJson.executeData = executeData;
        // Decode the scheduleData for better readability
        outputJson.decodedScheduleData = await decodeScheduleData(scheduleData, PolygonRollupManagerFactory);
    } else if (type === transactionTypes.MULTISIG) {
        logger.info('Creating calldata to initMigration from multisig...');
        const tx = PolygonRollupManagerFactory.interface.encodeFunctionData('initMigration', [
            rollupID,
            newRollupTypeID,
            upgradeData,
        ]);
        outputJson.polygonRollupManagerAddress = polygonRollupManagerAddress;
        outputJson.rollupID = rollupID;
        outputJson.newRollupTypeID = newRollupTypeID;
        outputJson.tx = tx;
    } else {
        logger.info('Send tx to initMigration...');
        logger.info('Check deployer role');
        if ((await rollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, deployer.address)) === false) {
            logger.error(
                'Deployer does not have admin role. Use the test flag on deploy_parameters if this is a test deployment',
            );
            process.exit(1);
        }
        logger.info('Sending transaction to initMigration...');
        try {
            const tx = await rollupManagerContract
                .connect(deployer)
                .initMigration(rollupID, newRollupTypeID, upgradeData);
            await tx.wait();
            outputJson.polygonRollupManagerAddress = polygonRollupManagerAddress;
            outputJson.rollupID = rollupID;
            outputJson.newRollupTypeID = newRollupTypeID;
            outputJson.txHash = tx.hash;
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            process.exit(1);
        }
        logger.info('Transaction successful');
    }

    // Save output
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
    logger.info('Finished script, output saved at: ', pathOutputJson);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

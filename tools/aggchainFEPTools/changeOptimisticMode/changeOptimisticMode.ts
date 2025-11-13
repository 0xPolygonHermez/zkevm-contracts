import path = require('path');
import fs = require('fs');

import params from './parameters.json';
import { AggchainFEP } from '../../../typechain-types';
import { transactionTypes, genOperation, addInfoOutput } from '../../utils';
import { decodeScheduleData } from '../../../upgrade/utils';
import { logger } from '../../../src/logger';
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters } from '../../../src/utils';

async function main() {
    logger.info('Starting tool enable/disable optimistic mode');

    /// //////////////////////////
    ///        CONSTANTS      ///
    /// //////////////////////////
    const outputJson = {} as any;
    const dateStr = new Date().toISOString();
    const destPath = params.outputPath
        ? path.join(__dirname, params.outputPath)
        : path.join(__dirname, `optimistic_mode_output_${params.type}_${dateStr}.json`);

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = ['type', 'rollupAddress', 'optimisticMode'];

    switch (params.type) {
        case transactionTypes.EOA:
        case transactionTypes.MULTISIG:
            break;
        case transactionTypes.TIMELOCK:
            mandatoryParameters.push('timelockDelay');
            break;
        default:
            logger.error(`Invalid type ${params.type}`);
            process.exit(1);
    }

    checkParams(params, mandatoryParameters);

    const { type, rollupAddress, optimisticMode } = params;

    // Load provider
    logger.info('Load provider');
    const currentProvider = getProviderAdjustingMultiplierGas(params, ethers);

    // Load optimisticManager
    logger.info('Load optimisticManager');
    const optimisticManager = await getDeployerFromParameters(currentProvider, params, ethers);

    logger.info(`Using with: ${optimisticManager.address}`);

    // --network <input>
    logger.info('Load AggchainFEP contract');
    const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP', optimisticManager);
    const aggchainFEP = (await AggchainFEPFactory.attach(rollupAddress)) as AggchainFEP;

    logger.info(`AggchainFEP address: ${aggchainFEP.target}`);
    let func = '';
    if (optimisticMode) {
        func = 'enableOptimisticMode';
    } else {
        func = 'disableOptimisticMode';
    }

    if (type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock tx to change optimistic mode....');
        const salt = params.timelockSalt || ethers.ZeroHash;
        const predecessor = params.predecessor || ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', optimisticManager);
        const operation = genOperation(
            rollupAddress,
            0, // value
            AggchainFEPFactory.interface.encodeFunctionData(func, []),
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
            params.timelockDelay,
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
        outputJson.decodedScheduleData = await decodeScheduleData(scheduleData, AggchainFEPFactory);
    } else if (type === transactionTypes.MULTISIG) {
        logger.info('Creating calldata to add default vkey from multisig...');
        const txUpdateOptimisticMode = AggchainFEPFactory.interface.encodeFunctionData(func, []);
        outputJson.rollupAddress = rollupAddress;
        outputJson.optimisticMode = optimisticMode;
        outputJson.txUpdateOptimisticMode = txUpdateOptimisticMode;
    } else {
        logger.info('Send tx to change optimistic mode...');
        logger.info('Check optimisticModeManager');
        if ((await aggchainFEP.optimisticModeManager()) !== optimisticManager.address) {
            logger.error('Invalid optimisticModeManager');
            process.exit(1);
        }
        logger.info(`Sending ${func} transaction to AggchainFEP ${rollupAddress}...`);
        try {
            let tx;
            if (optimisticMode) {
                tx = await aggchainFEP.enableOptimisticMode();
            } else {
                tx = await aggchainFEP.disableOptimisticMode();
            }
            await tx.wait();
            outputJson.rollupAddress = rollupAddress;
            outputJson.optimisticMode = optimisticMode;
            outputJson.txHash = tx.hash;
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            process.exit(1);
        }
        logger.info('Transaction successful');
    }
    // Save output
    const finalOutput = addInfoOutput(outputJson);
    fs.writeFileSync(destPath, JSON.stringify(finalOutput, null, 1));
    logger.info(`Finished script, output saved at: ${destPath}`);
}
main().then(
    () => {
        process.exit(0);
    },
    (err) => {
        logger.error(err.message);
        logger.error(err.stack);
        process.exit(1);
    },
);

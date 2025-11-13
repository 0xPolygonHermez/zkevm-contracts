import path = require('path');
import fs = require('fs');

import params from './parameters.json';
import { AggchainFEP } from '../../../typechain-types';
import { transactionTypes, genOperation, addInfoOutput } from '../../utils';
import { decodeScheduleData } from '../../../upgrade/utils';
import { logger } from '../../../src/logger';
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters } from '../../../src/utils';

async function main() {
    logger.info('Starting tool to update aggregationVkey');

    /// //////////////////////////
    ///        CONSTANTS      ///
    /// //////////////////////////
    const outputJson = {} as any;
    const dateStr = new Date().toISOString();
    const destPath = params.outputPath
        ? path.join(__dirname, params.outputPath)
        : path.join(__dirname, `update_aggragationvkey_output_${params.type}_${dateStr}.json`);

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = ['type', 'rollupAddress', 'aggregationVkey'];

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

    const { type, rollupAddress, aggregationVkey } = params;

    // Load provider
    logger.info('Load provider');
    const currentProvider = getProviderAdjustingMultiplierGas(params, ethers);

    // Load aggchainManager
    logger.info('Load aggchainManager');
    const aggchainManager = await getDeployerFromParameters(currentProvider, params, ethers);

    logger.info(`Using with: ${aggchainManager.address}`);

    // --network <input>
    logger.info('Load AggchainFEP contract');
    const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP', aggchainManager);
    const aggchainFEP = (await AggchainFEPFactory.attach(rollupAddress)) as AggchainFEP;

    logger.info(`AggchainFEP address: ${aggchainFEP.target}`);

    if (type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock tx to update aggregationVkey....');
        const salt = params.timelockSalt || ethers.ZeroHash;
        const predecessor = params.predecessor || ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', aggchainManager);
        const operation = genOperation(
            rollupAddress,
            0, // value
            AggchainFEPFactory.interface.encodeFunctionData('updateAggregationVkey', [aggregationVkey]),
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
        logger.info('Creating calldata to update aggregationVkey from multisig...');
        const txUpdateAggregationVkey = AggchainFEPFactory.interface.encodeFunctionData('updateAggregationVkey', [
            aggregationVkey,
        ]);
        outputJson.rollupAddress = rollupAddress;
        outputJson.aggregationVkey = aggregationVkey;
        outputJson.txUpdateAggregationVkey = txUpdateAggregationVkey;
    } else {
        logger.info('Send tx to update aggregationVkey...');
        logger.info('Check aggchainManager');
        if ((await aggchainFEP.aggchainManager()) !== aggchainManager.address) {
            logger.error('Invalid aggchainManager');
            process.exit(1);
        }
        logger.info(`Sending updateAggregationVkey transaction to AggchainFEP ${rollupAddress}...`);
        try {
            const tx = await aggchainFEP.updateAggregationVkey(aggregationVkey);
            await tx.wait();
            outputJson.rollupAddress = rollupAddress;
            outputJson.aggregationVkey = aggregationVkey;
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

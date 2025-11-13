import path = require('path');
import fs = require('fs');

import params from './parameters.json';
import { AggchainFEP } from '../../../typechain-types';
import { transactionTypes, genOperation, addInfoOutput } from '../../utils';
import { decodeScheduleData } from '../../../upgrade/utils';
import { logger } from '../../../src/logger';
import { checkParams, getProviderAdjustingMultiplierGas } from '../../../src/utils';

async function main() {
    logger.info('Starting tool to transfer aggchain manager role');

    /// //////////////////////////
    ///        CONSTANTS      ///
    /// //////////////////////////
    const outputJson = {} as any;
    const dateStr = new Date().toISOString();
    const destPath = params.outputPath
        ? path.join(__dirname, params.outputPath)
        : path.join(__dirname, `transfer_aggchain_manager_role_output_${params.type}_${dateStr}.json`);

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = ['type', 'rollupAddress'];

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

    const { type, rollupAddress } = params;

    // Load provider
    logger.info('Load provider');
    const currentProvider = getProviderAdjustingMultiplierGas(params, ethers);

    logger.info('Load aggchainManager & newAggchainManager');
    // Load ggchainManager & newAggchainManager
    let aggchainManager;
    let newAggchainManager;
    if (params.aggchainManagerPvk && params.newAggchainManagerPvk) {
        aggchainManager = new ethers.Wallet(params.aggchainManagerPvk, currentProvider);
        newAggchainManager = new ethers.Wallet(params.newAggchainManagerPvk, currentProvider);
    } else if (process.env.MNEMONIC) {
        aggchainManager = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
        newAggchainManager = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/1",
        ).connect(currentProvider);
    } else {
        [aggchainManager, newAggchainManager] = await ethers.getSigners();
    }

    logger.info(`aggchainManager: ${aggchainManager.address} newAggchainManager: ${newAggchainManager.address}`);

    // --network <input>
    logger.info('Load AggchainFEP contract');
    const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP', aggchainManager);
    const aggchainFEP = (await AggchainFEPFactory.attach(rollupAddress)) as AggchainFEP;

    logger.info(`AggchainFEP address: ${aggchainFEP.target}`);

    if (type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock tx to transfer aggchain manager Role...');
        const salt = params.timelockSalt || ethers.ZeroHash;
        const predecessor = params.predecessor || ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', aggchainManager);
        const operation = genOperation(
            rollupAddress,
            0, // value
            AggchainFEPFactory.interface.encodeFunctionData('transferAggchainManagerRole', [
                newAggchainManager.address,
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
        logger.info('Function transferAggchainManagerRole:');
        logger.info(`scheduleData: ${JSON.stringify(scheduleData, null, 2)}`);
        logger.info(`executeData: ${JSON.stringify(executeData, null, 2)}`);
        outputJson.transferAggchainManagerRole = {} as any;
        outputJson.transferAggchainManagerRole.scheduleData = scheduleData;
        outputJson.transferAggchainManagerRole.executeData = executeData;
        // Decode the scheduleData for better readability
        outputJson.transferAggchainManagerRole.decodedScheduleData = await decodeScheduleData(
            scheduleData,
            AggchainFEPFactory,
        );

        const operation2 = genOperation(
            rollupAddress,
            0, // value
            AggchainFEPFactory.interface.encodeFunctionData('acceptAggchainManagerRole', []),
            predecessor, // predecessor
            salt, // salt
        );
        // Schedule operation
        const scheduleData2 = timelockContractFactory.interface.encodeFunctionData('schedule', [
            operation2.target,
            operation2.value,
            operation2.data,
            operation2.predecessor,
            operation2.salt,
            params.timelockDelay,
        ]);
        // Execute operation
        const executeData2 = timelockContractFactory.interface.encodeFunctionData('execute', [
            operation2.target,
            operation2.value,
            operation2.data,
            operation2.predecessor,
            operation2.salt,
        ]);
        logger.info('Creating timelock tx to accept aggchain manager Role...');
        logger.info('Function acceptAggchainManagerRole:');
        logger.info(`scheduleData: ${JSON.stringify(scheduleData2, null, 2)}`);
        logger.info(`executeData: ${JSON.stringify(executeData2, null, 2)}`);
        outputJson.acceptAggchainManagerRole = {} as any;
        outputJson.acceptAggchainManagerRole.scheduleData = scheduleData2;
        outputJson.acceptAggchainManagerRole.executeData = executeData2;
        // Decode the scheduleData for better readability
        outputJson.acceptAggchainManagerRole.decodedScheduleData = await decodeScheduleData(
            scheduleData2,
            AggchainFEPFactory,
        );
    } else if (type === transactionTypes.MULTISIG) {
        logger.info('Creating calldata to transfer aggchain manager role from multisig...');
        const txTransferOptimiticModeManagerRole = AggchainFEPFactory.interface.encodeFunctionData(
            'transferAggchainManagerRole',
            [newAggchainManager.address],
        );
        logger.info('Creating calldata to accept aggchain manager role from multisig...');
        const txAcceptOptimiticModeManagerRole = AggchainFEPFactory.interface.encodeFunctionData(
            'acceptAggchainManagerRole',
            [],
        );
        outputJson.rollupAddress = rollupAddress;
        outputJson.aggchainManager = aggchainManager.address;
        outputJson.newAggchainManager = newAggchainManager.address;
        outputJson.txTransfer = txTransferOptimiticModeManagerRole;
        outputJson.txAccept = txAcceptOptimiticModeManagerRole;
    } else {
        logger.info('Send txs to transfer aggchain manager role...');
        logger.info('Check AggchainManager');
        if ((await aggchainFEP.aggchainManager()) !== aggchainManager.address) {
            logger.error('Invalid aggchainManager');
            process.exit(1);
        }
        logger.info(`Sending transferAggchainManagerRole transaction to AggchainFEP ${rollupAddress}...`);
        let txTransfer;
        try {
            txTransfer = await aggchainFEP.transferAggchainManagerRole(newAggchainManager.address);
            await txTransfer.wait();
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            process.exit(1);
        }
        logger.info('Transaction successful');
        logger.info(`Sending acceptAggchainManagerRole transaction to AggchainFEP ${rollupAddress}...`);
        let txAccept;
        try {
            txAccept = await aggchainFEP.connect(newAggchainManager).acceptAggchainManagerRole();
            await txAccept.wait();
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            // eslint-disable-next-line no-console
            console.log(e);
            process.exit(1);
        }
        logger.info('Transaction successful');
        outputJson.rollupAddress = rollupAddress;
        outputJson.aggchainManager = aggchainManager.address;
        outputJson.newAggchainManager = newAggchainManager.address;
        outputJson.txTransferHash = txTransfer.hash;
        outputJson.txAccept = txAccept.hash;
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

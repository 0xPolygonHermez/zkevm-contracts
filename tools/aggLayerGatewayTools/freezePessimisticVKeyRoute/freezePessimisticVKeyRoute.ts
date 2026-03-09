/* eslint-disable no-console */
import path = require('path');
import fs = require('fs');

import { ethers } from 'hardhat';
import params from './parameters.json';
import { AgglayerGateway } from '../../../typechain-types';
import { DEFAULT_ADMIN_ROLE, AL_FREEZE_PP_ROUTE_ROLE } from '../../../src/constants';
import { transactionTypes, genOperation } from '../../utils';
import { decodeScheduleData } from '../../../upgrade/utils';
import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';

async function main() {
    logger.info('Starting tool to freeze vkey route to AgglayerGateway contract');

    /// //////////////////////////
    ///        CONSTANTS      ///
    /// //////////////////////////
    const outputJson = {} as any;
    const dateStr = new Date().toISOString();
    const destPath = params.outputPath
        ? path.join(__dirname, params.outputPath)
        : path.join(__dirname, `freeze_pp_route_output_${params.type}_${dateStr}.json`);

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = ['type', 'aggLayerGatewayAddress', 'pessimisticVKeySelector'];

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

    try {
        checkParams(params, mandatoryParameters);
    } catch (e) {
        logger.error(`Error checking parameters. ${e.message}`);
        process.exit(1);
    }

    const { type, aggLayerGatewayAddress, pessimisticVKeySelector } = params;

    // Load provider
    logger.info('Load provider');
    let currentProvider = ethers.provider;
    if (params.multiplierGas || params.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            ) as any;
            if (params.maxPriorityFeePerGas && params.maxFeePerGas) {
                logger.info(
                    `Hardcoded gas used: MaxPriority${params.maxPriorityFeePerGas} gwei, MaxFee${params.maxFeePerGas} gwei`,
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(params.maxFeePerGas, 'gwei'),
                    ethers.parseUnits(params.maxPriorityFeePerGas, 'gwei'),
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                logger.info(`Multiplier gas used: ${params.multiplierGas}`);
                // eslint-disable-next-line no-inner-declarations
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(params.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(params.multiplierGas)) / 1000n,
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    logger.info('Load deployer');
    // Load deployer
    let deployer;
    if (params.deployerPvtKey) {
        deployer = new ethers.Wallet(params.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    logger.info(`Using with: ${deployer.address}`);

    // --network <input>
    logger.info('Load AgglayerGateway contract');
    const AgglayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway', deployer);
    const aggLayerGateway = (await AgglayerGatewayFactory.attach(aggLayerGatewayAddress)) as AgglayerGateway;

    logger.info(`AgglayerGateway address: ${aggLayerGateway.target}`);

    if (type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock tx to freeze pessimistic vkey route...');
        const salt = params.timelockSalt || ethers.ZeroHash;
        const predecessor = params.predecessor || ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
        const operation = genOperation(
            aggLayerGatewayAddress,
            0, // value
            AgglayerGatewayFactory.interface.encodeFunctionData('freezePessimisticVKeyRoute', [
                pessimisticVKeySelector,
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
        logger.info(`scheduleData: ${JSON.stringify(scheduleData, null, 2)}`);
        logger.info(`executeData: ${JSON.stringify(executeData, null, 2)}`);
        outputJson.scheduleData = scheduleData;
        outputJson.executeData = executeData;
        // Decode the scheduleData for better readability
        outputJson.decodedScheduleData = await decodeScheduleData(scheduleData, AgglayerGatewayFactory);
    } else if (type === transactionTypes.MULTISIG) {
        logger.info('Creating calldata to freeze pessimistic vkey route from multisig...');
        const txAddDefaultAggchainVKey = AgglayerGatewayFactory.interface.encodeFunctionData(
            'freezePessimisticVKeyRoute',
            [pessimisticVKeySelector],
        );
        outputJson.aggLayerGatewayAddress = aggLayerGatewayAddress;
        outputJson.pessimisticVKeySelector = pessimisticVKeySelector;
        outputJson.txAddDefaultAggchainVKey = txAddDefaultAggchainVKey;
    } else {
        logger.info('Send tx to freeze pessimistic vkey route...');
        logger.info('Check deployer role');
        if ((await aggLayerGateway.hasRole(AL_FREEZE_PP_ROUTE_ROLE, deployer.address)) === false) {
            if ((await aggLayerGateway.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) === false) {
                logger.error(
                    'Deployer does not have admin role. Use the test flag on deploy_parameters if this is a test deployment',
                );
                process.exit(1);
            }
            // Grant role AL_FREEZE_PP_ROUTE_ROLE to deployer
            await aggLayerGateway.grantRole(AL_FREEZE_PP_ROUTE_ROLE, deployer.address);
        }
        logger.info('Sending transaction to freeze pessimistic vkey route...');
        try {
            const tx = await aggLayerGateway.freezePessimisticVKeyRoute(pessimisticVKeySelector);
            await tx.wait();
            outputJson.aggLayerGatewayAddress = aggLayerGatewayAddress;
            outputJson.pessimisticVKeySelector = pessimisticVKeySelector;
            outputJson.txHash = tx.hash;
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            process.exit(1);
        }
        logger.info('Transaction successful');
    }
    // Save output
    fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
    logger.info(`Finished script, output saved at: ${destPath}`);
}
main().then(
    () => {
        process.exit(0);
    },
    (err) => {
        console.log(err.message);
        console.log(err.stack);
        process.exit(1);
    },
);

/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');
import { utils } from 'ffjavascript';
import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { logger } from '../../src/logger';
import { PolygonRollupManagerPessimistic, PolygonZkEVMBridgeV2 } from '../../typechain-types';
import { genTimelockOperation, verifyContractEtherscan, decodeScheduleData } from '../utils';
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters, getGitInfo } from '../../src/utils';
import * as upgradeParameters from './upgrade_parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pathOutputJson = path.join(__dirname, './upgrade_output.json');

async function main() {
    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = [
        'rollupManagerAddress',
        'aggLayerGatewayAddress',
        'timelockDelay',
        'tagSCPreviousVersion',
    ];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const {
        rollupManagerAddress,
        timelockDelay,
        aggLayerGatewayAddress,
        tagSCPreviousVersion,
        unsafeSkipStorageCheck,
    } = upgradeParameters;
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

    // Load onchain parameters
    const polygonRMPreviousFactory = await ethers.getContractFactory('PolygonRollupManagerPessimistic');
    const rollupManagerPessimisticContract = (await polygonRMPreviousFactory.attach(
        rollupManagerAddress,
    )) as PolygonRollupManagerPessimistic;

    const globalExitRootManagerAddress = await rollupManagerPessimisticContract.globalExitRootManager();
    const polAddress = await rollupManagerPessimisticContract.pol();
    const bridgeAddress = await rollupManagerPessimisticContract.bridgeAddress();

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(upgradeParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, upgradeParameters, ethers);
    logger.info(`deploying implementation with: ${deployer.address}`);

    const proxyAdmin = await upgrades.admin.getInstance();

    // Assert correct admin
    expect(await upgrades.erc1967.getAdminAddress(rollupManagerAddress as string)).to.be.equal(proxyAdmin.target);

    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);

    // prepare upgrades

    // Upgrade to rollup manager v3
    const PolygonRollupManagerFactory = await ethers.getContractFactory('PolygonRollupManager', deployer);

    const implRollupManager = await upgrades.prepareUpgrade(rollupManagerAddress, PolygonRollupManagerFactory, {
        constructorArgs: [globalExitRootManagerAddress, polAddress, bridgeAddress, aggLayerGatewayAddress],
        unsafeAllow: ['constructor'],
    });

    logger.info('#######################\n');
    logger.info(`Polygon rollup manager implementation deployed at: ${implRollupManager}`);

    await verifyContractEtherscan(implRollupManager as string, [
        globalExitRootManagerAddress,
        polAddress,
        bridgeAddress,
        aggLayerGatewayAddress,
    ]);

    const operationRollupManager = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
            rollupManagerAddress,
            implRollupManager,
            PolygonRollupManagerFactory.interface.encodeFunctionData('initialize', []),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );

    // Upgrade bridge
    const bridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2', deployer);

    let impBridge;
    if (unsafeSkipStorageCheck === true) {
        logger.warn('Unsafe skip storage check is enabled, this may lead to issues if the storage layout has changed.');
        impBridge = (await upgrades.prepareUpgrade(bridgeAddress, bridgeFactory, {
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            unsafeSkipStorageCheck: true,
        })) as string;
    } else {
        impBridge = (await upgrades.prepareUpgrade(bridgeAddress, bridgeFactory, {
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as string;
    }

    logger.info('#######################\n');
    logger.info(`Polygon bridge implementation deployed at: ${impBridge}`);

    await verifyContractEtherscan(impBridge, []);

    // Verify bytecodeStorer
    const bridgeContract = bridgeFactory.attach(impBridge) as PolygonZkEVMBridgeV2;
    const bytecodeStorerAddress = await bridgeContract.wrappedTokenBytecodeStorer();
    await verifyContractEtherscan(bytecodeStorerAddress, []);
    logger.info('#######################\n');
    logger.info(`wrappedTokenBytecodeStorer deployed at: ${bytecodeStorerAddress}`);

    // Verify wrappedTokenBridgeImplementation
    const wrappedTokenBridgeImplementationAddress = await bridgeContract.getWrappedTokenBridgeImplementation();
    await verifyContractEtherscan(wrappedTokenBridgeImplementationAddress, []);
    logger.info('#######################\n');
    logger.info(`wrappedTokenBridge Implementation deployed at: ${wrappedTokenBridgeImplementationAddress}`);

    const operationBridge = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
            bridgeAddress,
            impBridge,
            bridgeFactory.interface.encodeFunctionData('initialize()', []),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );

    /// Upgrade PolygonZkEVMGlobalExitRootV2
    const globalExitRootManagerFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootV2', deployer);
    const globalExitRootManagerImp = await upgrades.prepareUpgrade(
        globalExitRootManagerAddress,
        globalExitRootManagerFactory,
        {
            constructorArgs: [rollupManagerAddress, bridgeAddress],
            unsafeAllow: ['constructor', 'missing-initializer'],
        },
    );
    logger.info('#######################\n');
    logger.info(`Polygon global exit root manager implementation deployed at: ${globalExitRootManagerImp}`);

    await verifyContractEtherscan(globalExitRootManagerImp as string, [rollupManagerAddress, bridgeAddress]);

    const operationGlobalExitRoot = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgrade', [globalExitRootManagerAddress, globalExitRootManagerImp]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData('scheduleBatch', [
        [operationRollupManager.target, operationBridge.target, operationGlobalExitRoot.target],
        [operationRollupManager.value, operationBridge.value, operationGlobalExitRoot.value],
        [operationRollupManager.data, operationBridge.data, operationGlobalExitRoot.data],
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData('executeBatch', [
        [operationRollupManager.target, operationBridge.target, operationGlobalExitRoot.target],
        [operationRollupManager.value, operationBridge.value, operationGlobalExitRoot.value],
        [operationRollupManager.data, operationBridge.data, operationGlobalExitRoot.data],
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    logger.info({ scheduleData });
    logger.info({ executeData });
    // Get current block number, used in the shallow fork tests
    const blockNumber = await ethers.provider.getBlockNumber();
    const outputJson = {
        tagSCPreviousVersion,
        gitInfo: getGitInfo(),
        scheduleData,
        executeData,
        timelockContractAddress: timelockAddress,
        implementationDeployBlockNumber: blockNumber,
    };

    // Decode the scheduleData for better readability
    const objectDecoded = await decodeScheduleData(scheduleData, proxyAdmin);

    outputJson.decodedScheduleData = objectDecoded;

    outputJson.deployedContracts = {
        rollupManagerImplementation: implRollupManager,
        bridgeImplementation: impBridge,
        globalExitRootManagerImplementation: globalExitRootManagerImp,
        wrappedTokenBytecodeStorer: bytecodeStorerAddress,
        wrappedTokenBridgeImplementation: wrappedTokenBridgeImplementationAddress,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(utils.stringifyBigInts(outputJson), null, 2));
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});

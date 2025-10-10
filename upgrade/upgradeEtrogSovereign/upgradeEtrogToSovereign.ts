/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');
import { utils } from 'ffjavascript';
import { ethers, upgrades } from 'hardhat';
import * as dotenv from 'dotenv';
import { logger } from '../../src/logger';
import { TimelockController } from '../../typechain-types';
import { genTimelockOperation, decodeScheduleData } from '../utils';
import { checkParams, getDeployerFromParameters, getProviderAdjustingMultiplierGas } from '../../src/utils';

import upgradeParameters from './upgrade_parameters.json';
import { addInfoOutput } from '../../tools/utils';

// You can replace this import with the actual values obtained from getLBT
import { originNetwork, originTokenAddress, totalSupply } from './initializeLBT.json';
// import { getLBT } from './getLBT';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pathOutputJson = path.join(__dirname, './upgrade_output.json');

async function main() {
    // Check for unsafe mode from parameters
    const isUnsafeMode = (upgradeParameters as any).unsafeMode || false;
    if (isUnsafeMode) {
        logger.warn('⚠️  UNSAFE MODE ENABLED: criticalTooling checks disabled');
    }

    let outputJson = {};
    // Add git info using addInfoOutput with criticalTooling flag
    outputJson = addInfoOutput(outputJson, !isUnsafeMode);

    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = [
        'bridgeManager',
        'bridgeL2',
        'gerL2',
        'proxiedTokensManagerAddress',
        'emergencyBridgePauserAddress',
        'emergencyBridgeUnpauserAddress',
        'globalExitRootUpdater',
        'globalExitRootRemover',
    ];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

    const {
        bridgeManager,
        proxiedTokensManagerAddress,
        emergencyBridgePauserAddress,
        emergencyBridgeUnpauserAddress,
        bridgeL2,
        gerL2,
        globalExitRootUpdater,
        globalExitRootRemover,
        // creationBridgeL2Block
    } = upgradeParameters;

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(upgradeParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, upgradeParameters, ethers);
    logger.info(`Deploying implementation with: ${deployer.address}`);

    // Force import hardhat manifest
    logger.info('Force import hardhat manifest');
    // As this contract is deployed in the genesis of a L2 network, no open zeppelin network file is created, we need to force import it
    const bridgeFactory = await ethers.getContractFactory('AgglayerBridgeL2FromEtrog', deployer);
    await upgrades.forceImport(bridgeL2, bridgeFactory, {
        constructorArgs: [],
        kind: 'transparent',
    });
    const gerFactory = await ethers.getContractFactory('AgglayerGERL2', deployer);
    await upgrades.forceImport(gerL2, gerFactory, {
        constructorArgs: [bridgeL2],
        kind: 'transparent',
    });

    // get proxy admin and timelock
    logger.info('Get proxy admin information');
    // Get proxy admin
    const proxyAdmin = await upgrades.admin.getInstance();

    // Assert correct admin
    expect(await upgrades.erc1967.getAdminAddress(gerL2 as string)).to.be.equal(proxyAdmin.target);
    expect(await upgrades.erc1967.getAdminAddress(bridgeL2 as string)).to.be.equal(proxyAdmin.target);

    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
    const timelockContract = (await timelockContractFactory.attach(timelockAddress)) as TimelockController;
    // take params delay, or minimum timelock delay
    const timelockDelay = upgradeParameters.timelockDelay || (await timelockContract.getMinDelay());

    // Upgrade AgglayerBridge -> AgglayerBridgeL2FromEtrog
    const impBridge = await upgrades.prepareUpgrade(bridgeL2, bridgeFactory, {
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        redeployImplementation: 'always',
    });

    logger.info('#######################\n');
    logger.info(`Polygon sovereign bridge implementation deployed at: ${impBridge}`);

    // Upgrade AgglayerGER --> AgglayerGERL2
    const impGER = await upgrades.prepareUpgrade(gerL2, gerFactory, {
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        redeployImplementation: 'always',
        constructorArgs: [bridgeL2],
    });

    logger.info(`Polygon sovereign GER implementation deployed at: ${impGER}`);

    // Create schedule and execute operation
    logger.info('Create schedule and execute operation');
    logger.info('Operation Bridge');
    // Get LBT initialization parameters (if not imported, import getLBT and use it)
    // const { originNetwork, originTokenAddress, totalSupply } = await getLBT(bridgeL2, creationBridgeL2Block);
    const operationBridge = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
            bridgeL2,
            impBridge,
            bridgeFactory.interface.encodeFunctionData(
                'initializeFromEtrog(address,address,address,address,uint32[],address[],uint256[])',
                [
                    bridgeManager,
                    emergencyBridgePauserAddress,
                    emergencyBridgeUnpauserAddress,
                    proxiedTokensManagerAddress,
                    originNetwork,
                    originTokenAddress,
                    totalSupply,
                ],
            ),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );
    logger.info('Operation GER');
    const operationGER = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
            gerL2,
            impGER,
            gerFactory.interface.encodeFunctionData('initialize(address,address)', [
                globalExitRootUpdater,
                globalExitRootRemover,
            ]),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );
    logger.info('scheduleData & executeData');
    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData('scheduleBatch', [
        [operationBridge.target, operationGER.target],
        [operationBridge.value, operationGER.value],
        [operationBridge.data, operationGER.data],
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData('executeBatch', [
        [operationBridge.target, operationGER.target],
        [operationBridge.value, operationGER.value],
        [operationBridge.data, operationGER.data],
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    logger.info({ scheduleData });
    logger.info({ executeData });

    // Get current block number, used in the shallow fork tests
    const blockNumber = await ethers.provider.getBlockNumber();
    outputJson = {
        scheduleData,
        executeData,
        timelockContractAddress: timelockAddress,
        implementationDeployBlockNumber: blockNumber,
        bridgeImplementationAddress: impBridge,
        GERImplementationAddress: impGER,
        inputs: {
            bridgeManager,
            proxiedTokensManagerAddress,
            emergencyBridgePauserAddress,
            emergencyBridgeUnpauserAddress,
            globalExitRootUpdater,
            globalExitRootRemover,
            bridgeL2,
            gerL2,
        },
    };

    // Decode the scheduleData for better readability
    const objectDecoded = await decodeScheduleData(scheduleData, proxyAdmin);
    (outputJson as any).decodedScheduleData = objectDecoded;

    fs.writeFileSync(pathOutputJson, JSON.stringify(utils.stringifyBigInts(outputJson), null, 1));
    logger.info(`Output saved to: ${pathOutputJson}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

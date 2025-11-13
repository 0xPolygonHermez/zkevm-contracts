/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { logger } from '../../src/logger';
import { TimelockController } from '../../typechain-types';
import { genTimelockOperation, decodeScheduleData } from '../utils';
import { checkParams, getDeployerFromParameters, getProviderAdjustingMultiplierGas, getGitInfo } from '../../src/utils';
import upgradeParameters from './upgrade_parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const dateStr = new Date().toISOString();
const pathOutputJson = path.join(__dirname, `./upgrade_output_${dateStr}.json`);

async function main() {
    upgrades.silenceWarnings();

    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    logger.info('Check input paraneters');

    const mandatoryUpgradeParameters = [
        'tagSCPreviousVersion',
        'bridgeL2SovereignChainAddress',
        'proxiedTokensManagerAddress',
        'emergencyBridgeUnpauserAddress',
    ];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const { bridgeL2SovereignChainAddress, emergencyBridgeUnpauserAddress, proxiedTokensManagerAddress } =
        upgradeParameters;
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

    // Load deployer
    const currentProvider = getProviderAdjustingMultiplierGas(upgradeParameters, ethers);
    const deployer = await getDeployerFromParameters(currentProvider, upgradeParameters, ethers);
    logger.info(`Deploying implementation with: ${deployer.address}`);

    // Force import hardhat manifest
    logger.info('Force import hardhat manifest');
    // As this contract is deployed in the genesis of a L2 network, no open zeppelin network file is created, we need to force import it
    const bridgeFactory = await ethers.getContractFactory('BridgeL2SovereignChain', deployer);
    await upgrades.forceImport(bridgeL2SovereignChainAddress, bridgeFactory, {
        constructorArgs: [],
        kind: 'transparent',
    });

    // get proxy admin and timelock
    logger.info('Get proxy admin information');
    const proxyAdmin = await upgrades.admin.getInstance();

    // Assert correct admin
    expect(await upgrades.erc1967.getAdminAddress(bridgeL2SovereignChainAddress as string)).to.be.equal(
        proxyAdmin.target,
    );

    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
    const timelockContract = (await timelockContractFactory.attach(timelockAddress)) as TimelockController;
    // take params delay, or minimum timelock dela
    const timelockDelay = upgradeParameters.timelockDelay || (await timelockContract.getMinDelay());

    // Upgrade BridgeL2SovereignChain
    const impBridge = await upgrades.prepareUpgrade(bridgeL2SovereignChainAddress, bridgeFactory, {
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        redeployImplementation: 'always',
    });

    logger.info(`Polygon sovereign bridge implementation deployed at: ${impBridge}`);

    // Create schedule and execute operation
    logger.info('Create schedule and execute operation');

    const operationBridge = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
            bridgeL2SovereignChainAddress,
            impBridge,
            bridgeFactory.interface.encodeFunctionData('initialize(bytes32[],uint256[],address,address)', [
                [],
                [],
                emergencyBridgeUnpauserAddress,
                proxiedTokensManagerAddress,
            ]),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData('schedule', [
        operationBridge.target,
        operationBridge.value,
        operationBridge.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData('execute', [
        operationBridge.target,
        operationBridge.value,
        operationBridge.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    logger.info({ scheduleData });
    logger.info({ executeData });

    // Get current block number, used in the shallow fork tests
    const outputJson = {
        tagSCPreviousVersion: upgradeParameters.tagSCPreviousVersion,
        gitInfo: getGitInfo(),
        inputs: {
            bridgeL2SovereignChainAddress,
            emergencyBridgeUnpauserAddress,
            proxiedTokensManagerAddress,
            timelockDelay,
            salt,
        },
        timelockContractAddress: timelockAddress,
        bridgeImplementationAddress: impBridge,
        scheduleData,
        executeData,
    } as any;

    // Decode the scheduleData for better readability
    const objectDecoded = await decodeScheduleData(scheduleData, proxyAdmin);
    outputJson.decodedScheduleData = objectDecoded;

    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
    logger.info(`Output saved to: ${pathOutputJson}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

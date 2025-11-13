/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');
import { utils } from 'ffjavascript';
import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { logger } from '../../src/logger';
import { PolygonRollupManager } from '../../typechain-types';
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
        'timelockDelay',
        'tagSCPreviousVersion',
        'tagSCNewVersion',
    ];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const { rollupManagerAddress, timelockDelay, tagSCPreviousVersion } = upgradeParameters;
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

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
    // Upgrade to rollup manager v0.3.1
    const rollupManagerFactory = await ethers.getContractFactory('PolygonRollupManager', deployer);
    const rollupManagerContract = (await rollupManagerFactory.attach(rollupManagerAddress)) as PolygonRollupManager;

    const globalExitRootManagerAddress = await rollupManagerContract.globalExitRootManager();
    const polAddress = await rollupManagerContract.pol();
    const bridgeAddress = await rollupManagerContract.bridgeAddress();
    let aggLayerGatewayAddress;
    if (upgradeParameters.test === true) {
        // WARNING: only for testing purposes, in case of testing the upgrade from zkevm to pp, aggLayerGatewayAddress is not needed but is mandatory
        // a random value is used for testing purposes
        aggLayerGatewayAddress = globalExitRootManagerAddress;
    } else {
        aggLayerGatewayAddress = await rollupManagerContract.aggLayerGateway();
    }

    const implRollupManager = await upgrades.prepareUpgrade(rollupManagerAddress, rollupManagerFactory, {
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
            rollupManagerFactory.interface.encodeFunctionData('initialize', []),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData('schedule', [
        operationRollupManager.target,
        operationRollupManager.value,
        operationRollupManager.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData('execute', [
        operationRollupManager.target,
        operationRollupManager.value,
        operationRollupManager.data,
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
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(utils.stringifyBigInts(outputJson), null, 2));
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});

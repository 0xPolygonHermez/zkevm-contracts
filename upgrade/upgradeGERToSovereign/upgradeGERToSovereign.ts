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

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pathOutputJson = path.join(__dirname, './upgrade_output.json');

const OLD_GER_L2 = 'PolygonZkEVMGlobalExitRootL2Pessimistic';

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
        'bridgeL2',
        'gerL2',
        'ger_initializationParameters.globalExitRootUpdater',
        'ger_initializationParameters.globalExitRootRemover',
    ];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;
    const { bridgeL2, gerL2 } = upgradeParameters;
    const { globalExitRootUpdater, globalExitRootRemover } = upgradeParameters.ger_initializationParameters;

    // _globalExitRootUpdater can't be set to zero
    // _globalExitRootRemover can be set to zero if the chain doesn't want to have this feature
    if (globalExitRootUpdater === '0x0000000000000000000000000000000000000000') {
        throw new Error('globalExitRootUpdater cannot be zero address');
    }

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(upgradeParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, upgradeParameters, ethers);
    logger.info(`Deploying implementation with: ${deployer.address}`);

    const contractGER = await ethers.getContractAt(OLD_GER_L2, gerL2);
    const bridgeL2Address = await contractGER.bridgeAddress();
    const gerL2Address = '0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa';

    expect(gerL2Address).to.be.equal(gerL2.toLocaleLowerCase(), 'The GERL2 address is not correct.');
    expect(bridgeL2Address.toLocaleLowerCase()).to.be.equal(
        bridgeL2.toLocaleLowerCase(),
        'bridgeL2 address mismatch between GER and input',
    );

    // Force import hardhat manifest
    logger.info('Force import hardhat manifest');
    // As this contract is deployed in the genesis of a L2 network, no open zeppelin network file is created, we need to force import it
    const gerOldFactory = await ethers.getContractFactory(OLD_GER_L2, deployer);
    await upgrades.forceImport(gerL2, gerOldFactory, {
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

    // Upgrade PolygonZkEVMGlobalExitRootL2Pessimistic --> AgglayerGERL2
    const gerNewFactory = await ethers.getContractFactory('AgglayerGERL2', deployer);
    const impGER = await upgrades.prepareUpgrade(gerL2, gerNewFactory, {
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        constructorArgs: [bridgeL2],
    });

    logger.info(`Polygon sovereign GER implementation deployed at: ${impGER}`);

    // Create schedule and execute operation
    logger.info('Create schedule and execute operation');

    logger.info('Operation GER');
    const operationGER = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
            gerL2,
            impGER,
            gerNewFactory.interface.encodeFunctionData('initialize(address,address)', [
                globalExitRootUpdater,
                globalExitRootRemover,
            ]),
        ]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );
    logger.info('scheduleData & executeData');
    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData('schedule', [
        operationGER.target,
        operationGER.value,
        operationGER.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData('execute', [
        operationGER.target,
        operationGER.value,
        operationGER.data,
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    logger.info({ scheduleData });
    logger.info({ executeData });

    // Get current block number, used in the shallow fork tests
    const blockNumber = await ethers.provider.getBlockNumber();
    outputJson = {
        ...outputJson,
        scheduleData,
        executeData,
        timelockContractAddress: timelockAddress,
        implementationDeployBlockNumber: blockNumber,
        GERImplementationAddress: impGER,
        inputs: {
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

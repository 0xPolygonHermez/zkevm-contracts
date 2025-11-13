/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');

import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { time, reset, setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { logger } from '../../src/logger';
import { TimelockController, BridgeL2SovereignChain } from '../../typechain-types';
import { genTimelockOperation } from '../utils';
import { checkParams } from '../../src/utils';
import upgradeParameters from './upgrade_parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    upgrades.silenceWarnings();

    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    logger.info('Check input paraneters');

    const mandatoryUpgradeParameters = [
        'bridgeL2SovereignChainAddress',
        'proxiedTokensManagerAddress',
        'emergencyBridgeUnpauserAddress',
    ];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    // load params
    const { bridgeL2SovereignChainAddress, emergencyBridgeUnpauserAddress, proxiedTokensManagerAddress } =
        upgradeParameters;
    const salt = upgradeParameters.timelockSalt || ethers.ZeroHash;

    // ############
    // FORK config
    // ############
    // load fork params
    const { forkParams } = upgradeParameters;
    checkParams(forkParams, ['rpc', 'timelockAdmin']);

    const { rpc, timelockAdmin } = forkParams;
    await reset(rpc);

    logger.info(`Using fork RPC: ${rpc}`);

    // Get timelock multisig
    await ethers.provider.send('hardhat_impersonateAccount', [timelockAdmin]);
    const timelockSigner = await ethers.getSigner(timelockAdmin as any);
    await setBalance(timelockAdmin, 100n ** 18n);

    logger.info(`Upgrading with: ${timelockSigner.address}`);

    // Force import hardhat manifest
    logger.info('Force import hardhat manifest');
    // As this contract is deployed in the genesis of a L2 network, no open zeppelin network file is created, we need to force import it
    const bridgeFactory = await ethers.getContractFactory('BridgeL2SovereignChain', timelockSigner);
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
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', timelockSigner);
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

    // Simulate send schedule & execute transaction
    logger.info('Send schedule & execute transaction');
    // send mutlsig transaction
    const txSchedule = {
        to: timelockContract.target,
        data: scheduleData,
    };
    await (await timelockSigner.sendTransaction(txSchedule)).wait();

    await time.increase(timelockDelay);

    const txExecute = {
        to: timelockContract.target,
        data: executeData,
    };
    await (await timelockSigner.sendTransaction(txExecute)).wait();

    logger.info('Upgrade executed successfully');

    // sanity checks
    const BRIDGE_SOVEREIGN_VERSION = 'v10.1.0';
    const bridgeContract = bridgeFactory.attach(bridgeL2SovereignChainAddress) as BridgeL2SovereignChain;

    expect(await bridgeContract.BRIDGE_SOVEREIGN_VERSION()).to.equal(BRIDGE_SOVEREIGN_VERSION);
    expect(await bridgeContract.proxiedTokensManager()).to.equal(proxiedTokensManagerAddress);
    expect(await bridgeContract.emergencyBridgeUnpauser()).to.equal(emergencyBridgeUnpauserAddress);
    expect(await bridgeContract.bridgeManager()).to.equal(timelockSigner.address);
    expect(await bridgeContract.pendingProxiedTokensManager()).to.equal(ethers.ZeroAddress);
    expect(await bridgeContract.gasTokenAddress()).to.equal(ethers.ZeroAddress);

    logger.info('Sanity checks successfully passed');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

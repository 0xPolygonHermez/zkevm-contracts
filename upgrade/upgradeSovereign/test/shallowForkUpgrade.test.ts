/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');

import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { time, reset, setBalance, mine } from '@nomicfoundation/hardhat-network-helpers';
import {
    PolygonZkEVMTimelock,
    GlobalExitRootManagerL2SovereignChainPessimistic,
    GlobalExitRootManagerL2SovereignChain,
    BridgeL2SovereignChainPessimistic,
    BridgeL2SovereignChain,
} from '../../../typechain-types';

import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    const AL_VERSION = 'al-v0.3.1';
    const mandatoryParameters = ['timelockAdminAddress', 'rpc'];
    checkParams(upgradeParams, mandatoryParameters);
    const rpc =
        typeof upgradeParams.rpc === 'undefined'
            ? `https://${upgradeParams.network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            : upgradeParams.rpc;

    // hard fork
    logger.info(`Shallow forking ${upgradeParams.rpc}`);
    await reset(rpc, upgradeOutput.implementationDeployBlockNumber + 1);
    await mine();
    const forkedBlock = await ethers.provider.getBlockNumber();
    // If forked block is lower than implementation deploy block, wait until it is reached
    while (forkedBlock <= upgradeOutput.implementationDeployBlockNumber) {
        logger.info(
            `Forked block is ${forkedBlock}, waiting until ${upgradeOutput.implementationDeployBlockNumber}, wait 1 minute...`,
        );
        await new Promise((r) => {
            setTimeout(r, 60000);
        });
        logger.info('Retrying fork...');
        await reset(rpc);
    }
    logger.info('Shallow fork Succeed!');
    // Check bridge implementation exists
    const bridgeImpCode = await ethers.provider.getCode(upgradeOutput.bridgeImplementationAddress);
    expect(bridgeImpCode.length).to.be.greaterThan(2);
    // In case globalExitRootManagerL2SovereignChainAddress is not provided, use the default one, used by most chains in the genesis
    const globalExitRootManagerL2SovereignChainAddress =
        typeof upgradeParams.globalExitRootManagerL2SovereignChainAddress === 'undefined'
            ? '0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa'
            : upgradeParams.globalExitRootManagerL2SovereignChainAddress;
    // Get contracts
    const gerManagerL2SovereignChainPessimisticFactory = await ethers.getContractFactory(
        'GlobalExitRootManagerL2SovereignChainPessimistic',
    );
    const gerManagerL2SovereignContractPessimistic = gerManagerL2SovereignChainPessimisticFactory.attach(
        globalExitRootManagerL2SovereignChainAddress,
    ) as GlobalExitRootManagerL2SovereignChainPessimistic;

    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(gerManagerL2SovereignContractPessimistic.target);
    const proxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    );
    const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress);
    const ownerAddress = await proxyAdmin.owner();
    expect(upgradeOutput.timelockContractAddress).to.be.equal(ownerAddress);
    logger.info('✓ proxy admin role is same as upgrade output file timelock address');

    // Check proposed timelock admin address has proposer and executor role
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
    const timelockContract = (await timelockContractFactory.attach(ownerAddress)) as PolygonZkEVMTimelock;
    const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
    const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');
    const proposerRoleAddress = upgradeParams.timelockAdminAddress;
    const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, proposerRoleAddress);
    const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, proposerRoleAddress);
    if (!hasProposerRole || !hasExecutorRole) {
        throw new Error('Timelock admin address does not have proposer and executor role');
    }
    logger.info(`Proposer/executor timelock role address: ${proposerRoleAddress}`);
    await ethers.provider.send('hardhat_impersonateAccount', [proposerRoleAddress]);
    const proposerRoleSigner = await ethers.getSigner(proposerRoleAddress as any);
    await setBalance(proposerRoleAddress, 100n ** 18n);
    logger.info(`✓ Funded proposer account ${proposerRoleAddress}`);

    // Get current sov ger contract params to compare after upgrade
    const globalExitRootUpdater = await gerManagerL2SovereignContractPessimistic.globalExitRootUpdater();
    const globalExitRootRemover = await gerManagerL2SovereignContractPessimistic.globalExitRootRemover();

    // Get current sov bridge contract params to compare after upgrade
    const bridgeAddress = await gerManagerL2SovereignContractPessimistic.bridgeAddress();
    const bridgePessimisticFactory = await ethers.getContractFactory('BridgeL2SovereignChainPessimistic');
    const bridgePessimisticContract = bridgePessimisticFactory.attach(
        bridgeAddress,
    ) as BridgeL2SovereignChainPessimistic;
    const bridgeGlobalExitRootManager = await bridgePessimisticContract.globalExitRootManager();
    const bridgeLastUpdatedDepositCount = await bridgePessimisticContract.lastUpdatedDepositCount();
    const bridgeRollupManager = await bridgePessimisticContract.polygonRollupManager();
    const bridgeGasTokenAddress = await bridgePessimisticContract.gasTokenAddress();
    const bridgeGasTokenNetwork = await bridgePessimisticContract.gasTokenNetwork();
    const bridgeGasTokenMetadata = await bridgePessimisticContract.gasTokenMetadata();

    // Send schedule transaction
    const txScheduleUpgrade = {
        to: upgradeOutput.timelockContractAddress,
        data: upgradeOutput.scheduleData,
    };
    await (await proposerRoleSigner.sendTransaction(txScheduleUpgrade)).wait();
    logger.info('✓ Sent schedule transaction');
    // Increase time to bypass the timelock delay
    const timelockDelay = upgradeOutput.decodedScheduleData.delay;
    await time.increase(Number(timelockDelay));
    logger.info(`✓ Increase time ${timelockDelay} seconds to bypass timelock delay`);
    // Send execute transaction
    const txExecuteUpgrade = {
        to: upgradeOutput.timelockContractAddress,
        data: upgradeOutput.executeData,
    };
    await (await proposerRoleSigner.sendTransaction(txExecuteUpgrade)).wait();
    logger.info(`✓ Sent execute transaction`);
    const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory(
        'GlobalExitRootManagerL2SovereignChain',
    );
    const gerManagerL2SovereignContract = GlobalExitRootManagerL2SovereignChainFactory.attach(
        globalExitRootManagerL2SovereignChainAddress,
    ) as GlobalExitRootManagerL2SovereignChain;
    expect(await gerManagerL2SovereignContract.globalExitRootUpdater()).to.equal(globalExitRootUpdater);
    expect(await gerManagerL2SovereignContract.globalExitRootRemover()).to.equal(globalExitRootRemover);

    logger.info(`✓ Checked GlobalExitRootManagerL2SovereignChain contract storage parameters`);

    // Check bridge params after upgrade
    const bridgeFactory = await ethers.getContractFactory('BridgeL2SovereignChain');
    const bridgeContract = bridgeFactory.attach(bridgeAddress) as BridgeL2SovereignChain;
    expect(await bridgeContract.BRIDGE_SOVEREIGN_VERSION()).to.equal(AL_VERSION);
    expect(await bridgeContract.globalExitRootManager()).to.equal(bridgeGlobalExitRootManager);
    expect(await bridgeContract.lastUpdatedDepositCount()).to.equal(bridgeLastUpdatedDepositCount);
    expect(await bridgeContract.polygonRollupManager()).to.equal(bridgeRollupManager);
    expect(await bridgeContract.gasTokenAddress()).to.equal(bridgeGasTokenAddress);
    expect(await bridgeContract.gasTokenNetwork()).to.equal(bridgeGasTokenNetwork);
    expect(await bridgeContract.gasTokenMetadata()).to.equal(bridgeGasTokenMetadata);
    expect(await bridgeContract.proxiedTokensManager()).to.equal(upgradeParams.proxiedTokensManagerAddress);
    expect(await bridgeContract.emergencyBridgePauser()).to.equal(upgradeParams.emergencyBridgePauserAddress);
    expect(await bridgeContract.emergencyBridgeUnpauser()).to.equal(upgradeParams.emergencyBridgeUnpauserAddress);

    logger.info(`✓ Checked BridgeL2SovereignChain contract storage parameters`);
    logger.info('Finished shallow fork upgrade');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
import { expect } from 'chai';
import path = require('path');

import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { time, reset, setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { PolygonZkEVMTimelock, AgglayerBridgeL2 } from '../../../typechain-types';
import upgradeParams from '../upgrade_parameters.json';
import upgradeOutput from '../upgrade_output.json';
import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';
import { ProxyAdmin } from '../../../typechain-types/@openzeppelin/contracts4/proxy/transparent';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    // Assert upgrade version
    const BRIDGE_L2_EXPECTED_VERSION = 'v1.2.0';

    const mandatoryParameters = ['timelockAdminAddress', 'rpc'];
    checkParams((upgradeParams as any).forkParams, mandatoryParameters);

    const rpc =
        typeof (upgradeParams as any).forkParams.rpc === 'undefined'
            ? `https://${(upgradeParams as any).forkParams.network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            : (upgradeParams as any).forkParams.rpc;

    // hard fork
    logger.info(`Shadow forking ${rpc}`);

    try {
        await reset(rpc, upgradeOutput.implementationDeployBlockNumber);
    } catch (e) {
        console.log(e);
    }

    logger.info(`Shadow forked block number: ${await ethers.provider.getBlockNumber()}`);

    // Check timelock contract
    const { bridgeL2Address } = upgradeOutput.inputs;
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(bridgeL2Address);
    const proxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    );
    const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress) as ProxyAdmin;
    const ownerAddress = await proxyAdmin.owner();
    expect(upgradeOutput.timelockContractAddress).to.be.equal(ownerAddress);
    logger.info('✓ Proxy admin owner matches timelock address from upgrade output');

    // Check proposed timelock admin address has proposer and executor role
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
    const timelockContract = (await timelockContractFactory.attach(ownerAddress)) as PolygonZkEVMTimelock;
    const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
    const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');
    const proposerRoleAddress = (upgradeParams as any).forkParams.timelockAdminAddress;
    const hasProposerRole = await timelockContract.hasRole(PROPOSER_ROLE, proposerRoleAddress);
    const hasExecutorRole = await timelockContract.hasRole(EXECUTOR_ROLE, proposerRoleAddress);

    if (!hasProposerRole || !hasExecutorRole) {
        throw new Error('Timelock admin address does not have proposer and executor role');
    }
    logger.info(`✓ Proposer/executor timelock role address: ${proposerRoleAddress}`);

    // Impersonate the proposer role address
    await ethers.provider.send('hardhat_impersonateAccount', [proposerRoleAddress]);
    const proposerRoleSigner = await ethers.getSigner(proposerRoleAddress as any);
    await setBalance(proposerRoleAddress, 100n ** 18n);
    logger.info(`✓ Funded proposer account ${proposerRoleAddress}`);

    // Get current bridge version before upgrade (same logic as upgradeSovereignBridge.ts)
    const bridgeFactory = await ethers.getContractFactory('AgglayerBridgeL2');
    const bridgeContract = bridgeFactory.attach(bridgeL2Address) as AgglayerBridgeL2;

    const allowedVersions = ['v1.0.0', 'v1.1.0', 'v1.2.0'];
    let bridgeVersionBefore: string;
    try {
        bridgeVersionBefore = await bridgeContract.version();
        if (!allowedVersions.includes(bridgeVersionBefore)) {
            throw new Error(
                `AgglayerBridgeL2 version() returned '${bridgeVersionBefore}', expected one of: ${allowedVersions.join(', ')}`,
            );
        }
        logger.info(`Bridge version before upgrade: ${bridgeVersionBefore}`);
    } catch (e: any) {
        // version() doesn't exist, check BRIDGE_SOVEREIGN_VERSION instead
        try {
            const oldBridgeFactory = await ethers.getContractFactory('BridgeL2SovereignChainV1010');
            const oldBridgeL2Contract = oldBridgeFactory.attach(bridgeL2Address) as any;

            bridgeVersionBefore = await oldBridgeL2Contract.BRIDGE_SOVEREIGN_VERSION();
            if (bridgeVersionBefore !== 'v10.1.2') {
                throw new Error(`BRIDGE_SOVEREIGN_VERSION returned '${bridgeVersionBefore}', expected 'v10.1.2'`);
            }
            logger.info(`Bridge version before upgrade (BRIDGE_SOVEREIGN_VERSION): ${bridgeVersionBefore}`);
        } catch {
            throw new Error(`Neither version() nor BRIDGE_SOVEREIGN_VERSION() found on contract: ${e.message}`);
        }
    }

    // Get storage values before upgrade for comparison
    const lastUpdatedDepositCountBefore = await bridgeContract.lastUpdatedDepositCount();
    const polygonRollupManagerBefore = await bridgeContract.polygonRollupManager();
    const gasTokenAddressBefore = await bridgeContract.gasTokenAddress();
    const gasTokenNetworkBefore = await bridgeContract.gasTokenNetwork();
    const gasTokenMetadataBefore = await bridgeContract.gasTokenMetadata();
    logger.info(`✓ Retrieved storage values before upgrade`);

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
    logger.info(`✓ Increased time by ${timelockDelay} seconds to bypass timelock delay`);

    // Send execute transaction
    const txExecuteUpgrade = {
        to: upgradeOutput.timelockContractAddress,
        data: upgradeOutput.executeData,
    };
    const receiptTx = await (await proposerRoleSigner.sendTransaction(txExecuteUpgrade)).wait();
    logger.info(`✓ Sent execute transaction`);
    logger.info(`  Transaction hash: ${receiptTx?.hash}`);
    logger.info(`  Block number: ${receiptTx?.blockNumber}`);

    // Check bridge params after upgrade
    const bridgeVersionAfter = await bridgeContract.version();
    expect(bridgeVersionAfter).to.equal(BRIDGE_L2_EXPECTED_VERSION);
    logger.info(`✓ Bridge version after upgrade: ${bridgeVersionAfter}`);

    // Verify storage values preserved after upgrade
    const lastUpdatedDepositCountAfter = await bridgeContract.lastUpdatedDepositCount();
    expect(lastUpdatedDepositCountAfter).to.equal(lastUpdatedDepositCountBefore);

    const polygonRollupManagerAfter = await bridgeContract.polygonRollupManager();
    expect(polygonRollupManagerAfter).to.equal(polygonRollupManagerBefore);

    const gasTokenAddressAfter = await bridgeContract.gasTokenAddress();
    expect(gasTokenAddressAfter).to.equal(gasTokenAddressBefore);

    const gasTokenNetworkAfter = await bridgeContract.gasTokenNetwork();
    expect(gasTokenNetworkAfter).to.equal(gasTokenNetworkBefore);

    const gasTokenMetadataAfter = await bridgeContract.gasTokenMetadata();
    expect(gasTokenMetadataAfter).to.equal(gasTokenMetadataBefore);

    logger.info('');
    logger.info('='.repeat(60));
    logger.info('Shadow fork upgrade test completed successfully!');
    logger.info('='.repeat(60));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

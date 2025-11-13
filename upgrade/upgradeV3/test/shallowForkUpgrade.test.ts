/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { time, reset, setBalance, mine } from '@nomicfoundation/hardhat-network-helpers';
import {
    PolygonRollupManager,
    PolygonZkEVMTimelock,
    PolygonRollupManagerPessimistic,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMBridgeV2Pessimistic,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMGlobalExitRootV2Pessimistic,
} from '../../typechain-types';

import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';

import upgradeParams from '../upgrade_parameters.json';
import upgradeOutput from '../upgrade_output.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

describe('Should shallow fork network, execute upgrade and validate Upgrade', () => {
    it('Should shallow fork network, execute upgrade and validate Upgrade', async () => {
        const AL_VERSION = 'al-v0.3.0';
        const mandatoryParameters = ['rollupManagerAddress'];
        checkParams(upgradeParams, mandatoryParameters);
        if (!['mainnet', 'sepolia'].includes(upgradeParams.forkParams.network)) {
            throw new Error('Invalid network');
        }

        // hard fork
        const rpc =
            typeof upgradeParams.forkParams.rpc === 'undefined'
                ? `https://${upgradeParams.forkParams.network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
                : upgradeParams.forkParams.rpc;
        logger.info(`Shallow forking ${rpc}`);
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

        // Get contracts
        const rollupManagerPessimisticFactory = await ethers.getContractFactory('PolygonRollupManagerPessimistic');
        const rollupManagerPessimisticContract = rollupManagerPessimisticFactory.attach(
            upgradeParams.rollupManagerAddress,
        ) as PolygonRollupManagerPessimistic;

        const bridgeAddress = await rollupManagerPessimisticContract.bridgeAddress();
        const bridgePessimisticFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
        const bridgePessimisticContract = bridgePessimisticFactory.attach(
            bridgeAddress,
        ) as PolygonZkEVMBridgeV2Pessimistic;

        const globalExitRootManager = await rollupManagerPessimisticContract.globalExitRootManager();
        const gerPessimisticFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootV2Pessimistic');
        const gerPessimisticContract = gerPessimisticFactory.attach(
            globalExitRootManager,
        ) as PolygonZkEVMGlobalExitRootV2Pessimistic;

        // Get admin address from grant role events, should be a timelock and add balance
        const adminRoleFilter = rollupManagerPessimisticContract.filters.RoleGranted(ethers.ZeroHash, null, null);
        const adminRoleEvents = await rollupManagerPessimisticContract.queryFilter(adminRoleFilter, 0, 'latest');
        if (adminRoleEvents.length === 0) {
            throw new Error('No admin role granted');
        }
        const adminRoleAddress = adminRoleEvents[0].args.account;
        logger.info(`Default Admin rollup manager role address: ${adminRoleAddress}`);
        // Expect upgrade param timelock address to equal admin role address
        expect(upgradeOutput.timelockContractAddress).to.be.equal(adminRoleAddress);
        logger.info('✓ admin role is same as upgrade output file timelock address');

        // Get timelock admin role
        // TODO: move this logic to utils
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
        const timelockContract = (await timelockContractFactory.attach(adminRoleAddress)) as PolygonZkEVMTimelock;
        const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
        const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');
        let proposerRoleAddress = upgradeParams.timelockAdminAddress;
        if (typeof proposerRoleAddress === 'undefined') {
            // Try retrieve timelock admin address from events
            const proposerRoleFilter = timelockContract.filters.RoleGranted(PROPOSER_ROLE, null, null);
            const proposerRoleEvents = await timelockContract.queryFilter(proposerRoleFilter, 0, 'latest');
            if (proposerRoleEvents.length === 0) {
                throw new Error('No proposer role granted for timelock');
            }
            proposerRoleAddress = proposerRoleEvents[0].args.account;
        }
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

        // Get current rollupManager params to compare after upgrade
        const rollupManagerVersion = await rollupManagerPessimisticContract.ROLLUP_MANAGER_VERSION();
        expect(rollupManagerVersion).to.equal('pessimistic');
        // Rollup manager prev params
        const calculateRewardPerBatch = await rollupManagerPessimisticContract.calculateRewardPerBatch();
        const batchFee = await rollupManagerPessimisticContract.getBatchFee();
        const forcedBatchFee = await rollupManagerPessimisticContract.getForcedBatchFee();
        const isEmergencyState = await rollupManagerPessimisticContract.isEmergencyState();
        const lastAggregationTimestamp = await rollupManagerPessimisticContract.lastAggregationTimestamp();
        const lastDeactivatedEmergencyStateTimestamp =
            await rollupManagerPessimisticContract.lastDeactivatedEmergencyStateTimestamp();
        const pol = await rollupManagerPessimisticContract.pol();
        const rollupCount = await rollupManagerPessimisticContract.rollupCount();
        const rollupTypeCount = await rollupManagerPessimisticContract.rollupTypeCount();
        const totalSequencedBatches = await rollupManagerPessimisticContract.totalSequencedBatches();
        const totalVerifiedBatches = await rollupManagerPessimisticContract.totalVerifiedBatches();

        // Bridge prev params
        const bridgeGlobalExitRootManager = await bridgePessimisticContract.globalExitRootManager();
        const bridgeLastUpdatedDepositCount = await bridgePessimisticContract.lastUpdatedDepositCount();
        const bridgeRollupManager = await bridgePessimisticContract.polygonRollupManager();
        const bridgeGasTokenAddress = await bridgePessimisticContract.gasTokenAddress();
        const bridgeGasTokenNetwork = await bridgePessimisticContract.gasTokenNetwork();
        const bridgeGasTokenMetadata = await bridgePessimisticContract.gasTokenMetadata();

        // GER prev params
        const gerBridgeAddress = await gerPessimisticContract.bridgeAddress();
        const gerRollupManger = await gerPessimisticContract.rollupManager();

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

        // Check rollup manager contract
        const rollupMangerFactory = await ethers.getContractFactory('PolygonRollupManager');
        const rollupManagerContract = rollupMangerFactory.attach(
            upgradeParams.rollupManagerAddress,
        ) as PolygonRollupManager;
        expect(await rollupManagerContract.ROLLUP_MANAGER_VERSION()).to.equal(AL_VERSION);
        expect(await rollupManagerContract.bridgeAddress()).to.equal(bridgeAddress);
        expect(await rollupManagerContract.calculateRewardPerBatch()).to.equal(calculateRewardPerBatch);
        expect(await rollupManagerContract.getBatchFee()).to.equal(batchFee);
        expect(await rollupManagerContract.getForcedBatchFee()).to.equal(forcedBatchFee);
        expect(await rollupManagerContract.globalExitRootManager()).to.equal(globalExitRootManager);
        expect(await rollupManagerContract.isEmergencyState()).to.equal(isEmergencyState);

        expect(await rollupManagerContract.lastAggregationTimestamp()).to.equal(lastAggregationTimestamp);
        expect(await rollupManagerContract.lastDeactivatedEmergencyStateTimestamp()).to.equal(
            lastDeactivatedEmergencyStateTimestamp,
        );
        expect(await rollupManagerContract.pol()).to.equal(pol);
        expect(await rollupManagerContract.rollupCount()).to.equal(rollupCount);
        expect(await rollupManagerContract.rollupTypeCount()).to.equal(rollupTypeCount);
        expect(await rollupManagerContract.totalSequencedBatches()).to.equal(totalSequencedBatches);
        expect(await rollupManagerContract.totalVerifiedBatches()).to.equal(totalVerifiedBatches);
        logger.info(`✓ Checked rollup manager contract storage parameters and new version`);

        // Check bridge contract
        const bridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2');
        const bridgeContract = bridgeFactory.attach(bridgeAddress) as PolygonZkEVMBridgeV2;
        expect(await bridgeContract.BRIDGE_VERSION()).to.equal(AL_VERSION);
        expect(await bridgeContract.globalExitRootManager()).to.equal(bridgeGlobalExitRootManager);
        expect(await bridgeContract.lastUpdatedDepositCount()).to.equal(bridgeLastUpdatedDepositCount);
        expect(await bridgeContract.polygonRollupManager()).to.equal(bridgeRollupManager);
        expect(await bridgeContract.gasTokenAddress()).to.equal(bridgeGasTokenAddress);
        expect(await bridgeContract.gasTokenNetwork()).to.equal(bridgeGasTokenNetwork);
        expect(await bridgeContract.gasTokenMetadata()).to.equal(bridgeGasTokenMetadata);
        expect(await bridgeContract.getProxiedTokensManager()).to.equal(upgradeOutput.timelockContractAddress);
        expect(await bridgeContract.getWrappedTokenBridgeImplementation()).to.equal(
            upgradeOutput.deployedContracts.wrappedTokenBridgeImplementation,
        );
        expect(await bridgeContract.wrappedTokenBytecodeStorer()).to.equal(
            upgradeOutput.deployedContracts.wrappedTokenBytecodeStorer,
        );
        logger.info(`✓ Checked bridge contract storage parameters`);

        // Check ger contract
        const gerFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootV2');
        const gerContract = gerFactory.attach(globalExitRootManager) as PolygonZkEVMGlobalExitRootV2;
        expect(await gerContract.GER_VERSION()).to.equal(AL_VERSION);
        expect(await gerContract.bridgeAddress()).to.equal(gerBridgeAddress);
        expect(await gerContract.rollupManager()).to.equal(gerRollupManger);
        logger.info(`✓ Checked global exit root contract storage parameters`);

        logger.info('Finished shallow fork upgrade');
    }).timeout(0);
});

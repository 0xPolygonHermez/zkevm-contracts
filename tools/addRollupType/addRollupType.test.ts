/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { time, reset, setBalance, mine } from '@nomicfoundation/hardhat-network-helpers';
import { AgglayerManager, PolygonZkEVMTimelock } from '../../typechain-types';

import { logger } from '../../src/logger';

import addRollupTypeParams from './add_rollup_type.json';
import addRollupTypeOutput from './add_rollup_type_output.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

describe('Should shallow fork network, add rollup type', () => {
    it('Should shallow fork network, add rollup type', async () => {
        // hard fork
        const { rpc } = addRollupTypeParams.forkParams;
        const { polygonRollupManagerAddress } = addRollupTypeParams;
        const { timelockContractAddress } = addRollupTypeOutput;
        logger.info(`Shallow forking ${rpc}`);
        await reset(rpc);
        await mine();
        logger.info('Shallow fork Succeed!');

        logger.info(`TimelockAddress: ${timelockContractAddress}`);

        // Get timelock admin role
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
        const timelockContract = (await timelockContractFactory.attach(
            timelockContractAddress,
        )) as PolygonZkEVMTimelock;
        const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
        const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');
        let proposerRoleAddress = addRollupTypeParams.timelockAdminAddress;
        if (typeof proposerRoleAddress === 'undefined') {
            // Try retrieve timelock admin address from events
            const proposerRoleFilter = timelockContract.filters.RoleGranted(PROPOSER_ROLE, null, null);
            const proposerRoleEvents = await timelockContract.queryFilter(proposerRoleFilter, 0, 'latest');
            if (proposerRoleEvents.length === 0) {
                throw new Error('No proposer role granted for timelock');
            }
            proposerRoleAddress = proposerRoleEvents[proposerRoleEvents.length - 1].args.account;
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

        // Get contract
        const rollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
        const rollupManagerContract = rollupManagerFactory.attach(polygonRollupManagerAddress) as AgglayerManager;

        // Bridge prev params
        const rollupTypeCount = await rollupManagerContract.rollupTypeCount();
        logger.info(`Current rollup Type Count: ${Number(rollupTypeCount)}`);

        // Send schedule transaction
        const txSchedule = {
            to: addRollupTypeOutput.timelockContractAddress,
            data: addRollupTypeOutput.scheduleData,
        };
        await (await proposerRoleSigner.sendTransaction(txSchedule)).wait();
        logger.info('✓ Sent schedule transaction');
        // Increase time to bypass the timelock delay
        const timelockDelay = addRollupTypeOutput.decodedScheduleData.delay;
        await time.increase(Number(timelockDelay));
        logger.info(`✓ Increase time ${timelockDelay} seconds to bypass timelock delay`);
        // Send execute transaction
        const txExecute = {
            to: addRollupTypeOutput.timelockContractAddress,
            data: addRollupTypeOutput.executeData,
        };
        await (await proposerRoleSigner.sendTransaction(txExecute)).wait();
        logger.info(`✓ Sent execute transaction`);

        // Check bridge contract
        expect(await rollupManagerContract.rollupTypeCount()).to.equal(Number(rollupTypeCount) + 1);

        logger.info('Finished shallow fork add rollup type test successfully!');
    }).timeout(0);
});

/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');

import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { time, reset, setBalance, mine } from '@nomicfoundation/hardhat-network-helpers';
import { PolygonZkEVMTimelock, AgglayerGERL2, PolygonZkEVMGlobalExitRootL2Pessimistic } from '../../../typechain-types';
import upgradeParams from '../upgrade_parameters.json';
import upgradeOutput from '../upgrade_output.json';
import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';
import { ProxyAdmin } from '../../../typechain-types/@openzeppelin/contracts4/proxy/transparent';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    // Assert upgrade version
    const GER_VERSION = 'v1.0.0';
    const mandatoryParameters = ['timelockAdminAddress', 'rpc'];
    checkParams(upgradeParams.forkParams, mandatoryParameters);
    const rpc =
        typeof upgradeParams.forkParams.rpc === 'undefined'
            ? `https://${upgradeParams.forkParams.network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            : upgradeParams.forkParams.rpc;

    // hard fork
    logger.info(`Shadow forking ${rpc}`);
    try {
        await reset(rpc, upgradeOutput.implementationDeployBlockNumber + 1);
        await mine();
    } catch (e) {
        console.log(e);
    }

    logger.info(`Shadow forked block number: ${await ethers.provider.getBlockNumber()}`);
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
    logger.info('Shadow fork Succeed!');
    const gerImplAddress = upgradeOutput.GERImplementationAddress;

    // Check implementations exist
    const gerImpCode = await ethers.provider.getCode(gerImplAddress);
    expect(gerImpCode.length).to.be.greaterThan(2);

    // Check timelock contract
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(upgradeParams.bridgeL2);
    const proxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    );
    const proxyAdmin = proxyAdminFactory.attach(proxyAdminAddress) as ProxyAdmin;
    const ownerAddress = await proxyAdmin.owner();
    expect(upgradeOutput.timelockContractAddress).to.be.equal(ownerAddress);
    logger.info('✓ proxy admin role is same as upgrade output file timelock address');

    // Check proposed timelock admin address has proposer and executor role
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
    const timelockContract = (await timelockContractFactory.attach(ownerAddress)) as PolygonZkEVMTimelock;
    const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
    const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');
    const proposerRoleAddress = upgradeParams.forkParams.timelockAdminAddress;
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

    // get current storage values before upgrade
    const polygonZkEVMGERL2 = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootL2Pessimistic');
    const gerOldContract = polygonZkEVMGERL2.attach(upgradeParams.gerL2) as PolygonZkEVMGlobalExitRootL2Pessimistic;
    const gerBridgeAddress = await gerOldContract.bridgeAddress();

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

    // Check ger params after upgrade
    const agglayerGERL2Factory = await ethers.getContractFactory('AgglayerGERL2');
    const gerL2Contract = agglayerGERL2Factory.attach(upgradeParams.gerL2) as AgglayerGERL2;
    expect(await gerL2Contract.globalExitRootUpdater()).to.equal(
        upgradeParams.ger_initializationParameters.globalExitRootUpdater,
    );
    expect(await gerL2Contract.globalExitRootRemover()).to.equal(
        upgradeParams.ger_initializationParameters.globalExitRootRemover,
    );
    expect(await gerL2Contract.GER_SOVEREIGN_VERSION()).to.equal(GER_VERSION);
    expect(await gerL2Contract.bridgeAddress()).to.equal(gerBridgeAddress);

    logger.info(`✓ Checked AgglayerGERL2 contract storage parameters`);

    logger.info('Finished shadow fork upgrade');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

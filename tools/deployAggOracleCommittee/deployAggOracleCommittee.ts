/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */

import { expect } from 'chai';
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters, getGitInfo } from '../../src/utils';
import { verifyContractEtherscan } from '../../upgrade/utils';
import { AggOracleCommittee } from '../../typechain-types';
import deployParameters from './deploy_parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const pathOutput = path.join(__dirname, `./deploy_output.json`);

async function main() {
    const mandatoryUpgradeParameters = [
        'globalExitRootManagerL2SovereignAddress',
        'ownerAddress',
        'aggOracleMembers',
        'quorum',
    ];
    checkParams(deployParameters, mandatoryUpgradeParameters);
    const { globalExitRootManagerL2SovereignAddress, ownerAddress, aggOracleMembers, quorum } = deployParameters;

    // Check zero address for globalExitRootManagerL2Sovereign
    if (globalExitRootManagerL2SovereignAddress === ethers.ZeroAddress) {
        throw new Error('globalExitRootManagerL2SovereignAddress cannot be zero address');
    }

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(deployParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, deployParameters, ethers);
    console.log('deploying with: ', deployer.address);

    const proxyAdmin = await upgrades.admin.getInstance();
    const proxyAdminOwnerAddress = await proxyAdmin.owner();

    /*
     * Deployment of AggOracleCommittee
     */
    const aggOracleCommitteeFactory = await ethers.getContractFactory('AggOracleCommittee', deployer);
    const aggOracleCommitteeContract = await upgrades.deployProxy(
        aggOracleCommitteeFactory,
        [ownerAddress, aggOracleMembers, quorum],
        {
            constructorArgs: [globalExitRootManagerL2SovereignAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        },
    );
    await aggOracleCommitteeContract.waitForDeployment();

    console.log('#######################\n');
    console.log('aggOracleCommitteeContract deployed to:', aggOracleCommitteeContract.target);
    console.log('#######################\n\n');

    expect(await upgrades.erc1967.getAdminAddress(aggOracleCommitteeContract.target as string)).to.be.equal(
        proxyAdmin.target,
    );

    await verifyContractEtherscan(aggOracleCommitteeContract.target as string, [
        globalExitRootManagerL2SovereignAddress,
    ]);

    // Check deployment
    const aggOracleCommittee = aggOracleCommitteeFactory.attach(
        aggOracleCommitteeContract.target,
    ) as AggOracleCommittee;
    // Check already initialized
    await expect(aggOracleCommittee.initialize(ownerAddress, aggOracleMembers, quorum)).to.be.revertedWithCustomError(
        aggOracleCommitteeContract,
        'InvalidInitialization',
    );

    // Check initializer params
    // Check owner
    const contractOwner = await aggOracleCommittee.owner();
    expect(contractOwner).to.be.equal(ownerAddress);

    // Check quorum
    const contractQuorum = await aggOracleCommittee.quorum();
    expect(contractQuorum).to.be.equal(BigInt(quorum));

    // Check oracle members
    const contractOracleMembers = await aggOracleCommittee.getAllAggOracleMembers();
    expect(contractOracleMembers.length).to.be.equal(aggOracleMembers.length);
    for (let i = 0; i < aggOracleMembers.length; i++) {
        expect(contractOracleMembers[i]).to.be.equal(aggOracleMembers[i]);
        // Also check that the oracle member is properly initialized
        const lastProposedGER = await aggOracleCommittee.addressToLastProposedGER(aggOracleMembers[i]);
        expect(lastProposedGER).to.be.equal(await aggOracleCommittee.INITIAL_PROPOSED_GER());
    }

    // Check globalExitRootManagerL2Sovereign
    const contractGlobalExitRootManager = await aggOracleCommittee.globalExitRootManagerL2Sovereign();
    expect(contractGlobalExitRootManager).to.be.equal(globalExitRootManagerL2SovereignAddress);

    // Check members count
    const membersCount = await aggOracleCommittee.getAggOracleMembersCount();
    expect(membersCount).to.be.equal(BigInt(aggOracleMembers.length));

    // Compute output
    const outputJson = {
        gitInfo: getGitInfo(),
        aggOracleCommitteeAddress: aggOracleCommitteeContract.target,
        deployer: deployer.address,
        proxyAdminAddress: proxyAdmin.target,
        proxyAdminOwnerAddress,
        aggOracleOwnerAddress: ownerAddress,
        globalExitRootManagerL2SovereignAddress,
        aggOracleMembers,
        quorum,
    };

    fs.writeFileSync(pathOutput, JSON.stringify(outputJson, null, 1));
    console.log('Finished deploying AggOracleCommittee');
    console.log('Output saved to: ', pathOutput);
    console.log('#######################\n');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

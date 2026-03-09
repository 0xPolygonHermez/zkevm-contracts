/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */

import { expect } from 'chai';
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters, getGitInfo } from '../../src/utils';
import { verifyContractEtherscan } from '../../upgrade/utils';
import { AgglayerGateway } from '../../typechain-types';
import {
    DEFAULT_ADMIN_ROLE,
    AGGCHAIN_DEFAULT_VKEY_ROLE,
    AL_ADD_PP_ROUTE_ROLE,
    AL_FREEZE_PP_ROUTE_ROLE,
    AL_MULTISIG_ROLE,
} from '../../src/constants';
import deployParameters from './deploy_parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const pathOutput = path.join(__dirname, `./deploy_output.json`);

async function main() {
    const mandatoryUpgradeParameters = [
        'defaultAdminAddress',
        'aggchainDefaultVKeyRoleAddress',
        'addRouteRoleAddress',
        'freezeRouteRoleAddress',
        'verifierAddress',
        'ppVKey',
        'ppVKeySelector',
        'multisigRoleAddress',
    ];
    checkParams(deployParameters, mandatoryUpgradeParameters);
    const {
        defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress,
        verifierAddress,
        ppVKey,
        ppVKeySelector,
        multisigRoleAddress,
        signersToAdd = [],
        newThreshold = 0,
    } = deployParameters;
    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(deployParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, deployParameters, ethers);
    console.log('deploying with: ', deployer.address);

    const proxyAdmin = await upgrades.admin.getInstance();
    const proxyOwnerAddress = await proxyAdmin.owner();

    /*
     * Deployment of AgglayerGateway
     */
    const aggLayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway', deployer);
    const aggLayerGatewayContract = await upgrades.deployProxy(
        aggLayerGatewayFactory,
        [
            defaultAdminAddress,
            aggchainDefaultVKeyRoleAddress,
            addRouteRoleAddress,
            freezeRouteRoleAddress,
            ppVKeySelector,
            verifierAddress,
            ppVKey,
            multisigRoleAddress,
            signersToAdd,
            newThreshold,
        ],
        {
            unsafeAllow: ['constructor'],
        },
    );
    await aggLayerGatewayContract.waitForDeployment();

    console.log('#######################\n');
    console.log('aggLayerGatewayContract deployed to:', aggLayerGatewayContract.target);
    console.log('#######################\n\n');

    expect(await upgrades.erc1967.getAdminAddress(aggLayerGatewayContract.target as string)).to.be.equal(
        proxyAdmin.target,
    );

    await verifyContractEtherscan(aggLayerGatewayContract.target as string, []);

    // Check deployment
    const aggLayerGateway = aggLayerGatewayFactory.attach(aggLayerGatewayContract.target) as AgglayerGateway;
    // Check already initialized
    await expect(
        aggLayerGateway.initialize(
            defaultAdminAddress,
            aggchainDefaultVKeyRoleAddress,
            addRouteRoleAddress,
            freezeRouteRoleAddress,
            ppVKeySelector,
            verifierAddress,
            ppVKey,
            multisigRoleAddress,
            signersToAdd,
            newThreshold,
        ),
    ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'InvalidInitialization');

    // Check initializer params (ROLES)
    // Admin role
    const hasRoleDefaultAdmin = await aggLayerGateway.hasRole(DEFAULT_ADMIN_ROLE, defaultAdminAddress);
    expect(hasRoleDefaultAdmin).to.be.equal(true);
    // Other roles
    const hasRoleAggchainDefaultVKey = await aggLayerGateway.hasRole(
        AGGCHAIN_DEFAULT_VKEY_ROLE,
        aggchainDefaultVKeyRoleAddress,
    );
    expect(hasRoleAggchainDefaultVKey).to.be.equal(true);
    const hasRoleAddRoute = await aggLayerGateway.hasRole(AL_ADD_PP_ROUTE_ROLE, addRouteRoleAddress);
    expect(hasRoleAddRoute).to.be.equal(true);
    const hasRoleFreezeRoute = await aggLayerGateway.hasRole(AL_FREEZE_PP_ROUTE_ROLE, freezeRouteRoleAddress);
    expect(hasRoleFreezeRoute).to.be.equal(true);
    const hasRoleMultisig = await aggLayerGateway.hasRole(AL_MULTISIG_ROLE, multisigRoleAddress);
    expect(hasRoleMultisig).to.be.equal(true);

    // Compute output
    const outputJson = {
        gitInfo: getGitInfo(),
        aggLayerGatewayAddress: aggLayerGatewayContract.target,
        deployer: deployer.address,
        proxyAdminAddress: proxyAdmin.target,
        proxyOwnerAddress,
        defaultAdminRoleAddress: defaultAdminAddress,
        aggchainDefaultVKeyRoleAddress,
        addRouteRoleAddress,
        freezeRouteRoleAddress,
        ppVKey,
        ppVKeySelector,
        verifierAddress,
    };

    fs.writeFileSync(pathOutput, JSON.stringify(outputJson, null, 1));
    console.log('Finished deploying AgglayerGateway');
    console.log('Output saved to: ', pathOutput);
    console.log('#######################\n');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

/* eslint-disable import/no-dynamic-require, no-await-in-loop, no-restricted-syntax, guard-for-in */
require('dotenv').config();
const path = require('path');
const hre = require('hardhat');
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const pathDeployOutputParameters = path.join(__dirname, './deploy_output_sovereign.json');
const pathDeployParameters = path.join(__dirname, './deploy_parameters.json');

const deployParameters = require(pathDeployParameters);
const deployOutputParameters = require(pathDeployOutputParameters);


async function main() {
    // load deployer account
    if (typeof process.env.ETHERSCAN_API_KEY === 'undefined') {
        throw new Error('Etherscan API KEY has not been defined');
    }

    const { minDelayTimelock } = deployParameters;
    const { timelockAdminAddress } = deployParameters;
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.timelockContractAddress,
                constructorArguments: [
                    minDelayTimelock,
                    [timelockAdminAddress],
                    [timelockAdminAddress],
                    timelockAdminAddress,
                    deployOutputParameters.admin,
                ],
            },
        );
    } catch (error) {
        console.log(error)
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    // verify proxy admin
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.proxyAdminAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    // verify global exit root address
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.polygonZkEVMGlobalExitRootAddress,
                constructorArguments: [
                    deployOutputParameters.polygonZkEVMBridgeAddress,
                ],
            },
        );
    } catch (error) {
        // expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    try {
        await hre.run(
            'verify:verify',
            {
                contract: '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
                address: deployOutputParameters.polygonZkEVMBridgeAddress,
                constructorArguments: [
                    await upgrades.erc1967.getImplementationAddress(deployOutputParameters.polygonZkEVMBridgeAddress),
                    await upgrades.erc1967.getAdminAddress(deployOutputParameters.polygonZkEVMBridgeAddress),
                    '0x',
                ],
            },
        );
    } catch (error) {
        // expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.polygonZkEVMBridgeAddress,
            },
        );
    } catch (error) {
        // expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }


}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

/* eslint-disable import/no-dynamic-require, no-await-in-loop, no-restricted-syntax, guard-for-in */
require('dotenv').config();
const path = require('path');
const hre = require('hardhat');
const { expect } = require('chai');
const { ethers } = require('hardhat');

const pathDeployOutputParameters = path.join(__dirname, './deploy_output.json');
const pathDeployParameters = path.join(__dirname, './deploy_parameters.json');
const deployOutputParameters = require(pathDeployOutputParameters);
const deployParameters = require(pathDeployParameters);

async function main() {
    // load deployer account
    if (typeof process.env.ETHERSCAN_API_KEY === 'undefined') {
        throw new Error('Etherscan API KEY has not been defined');
    }

    // verify maticToken
    const polTokenName = "Pol Token";
    const polTokenSymbol = "POL";
    const polTokenInitialBalance = ethers.parseEther("20000000");

    const polTokenFactory = await ethers.getContractFactory("ERC20PermitMock", deployer);

    try {
        // verify governance
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.maticTokenAddress,
                constructorArguments: [
                    polTokenName,
                    polTokenSymbol,
                    deployOutputParameters.deployerAddress,
                    polTokenInitialBalance,
                ],
            },
        );
    } catch (error) {
        // expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    // verify verifier
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.verifierAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
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
                    deployOutputParameters.polygonRollupManager,
                ],
            },
        );
    } catch (error) {
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

    // verify zkEVM address
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.polygonRollupManager,
                constructorArguments: [
                    deployOutputParameters.polygonZkEVMGlobalExitRootAddress,
                    deployOutputParameters.polTokenAddress,
                    deployOutputParameters.polygonZkEVMBridgeAddress,
                ],
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    // verify global exit root address
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.polygonZkEVMGlobalExitRootAddress,
                constructorArguments: [
                    deployOutputParameters.polygonRollupManager,
                    deployOutputParameters.polygonZkEVMBridgeAddress,
                ],
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.polygonZkEVMBridgeAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

       // verify zkEVM address
       try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.newZKEVMAddress,
                constructorArguments: [
                    deployOutputParameters.polygonZkEVMGlobalExitRootAddress,
                    deployOutputParameters.polTokenAddress,
                    deployOutputParameters.polygonZkEVMBridgeAddress,
                    deployOutputParameters.polygonRollupManager
                ],
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

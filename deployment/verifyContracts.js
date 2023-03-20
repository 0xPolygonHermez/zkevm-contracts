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
    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');
    try {
        // verify governance
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.maticTokenAddress,
                constructorArguments: [
                    maticTokenName,
                    maticTokenSymbol,
                    deployOutputParameters.deployerAddress,
                    maticTokenInitialBalance,
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
    const { timelockAddress } = deployParameters;
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.timelockContractAddress,
                constructorArguments: [
                    minDelayTimelock,
                    [timelockAddress],
                    [timelockAddress],
                    timelockAddress,
                    deployOutputParameters.polygonZkEVMAddress,
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
                address: deployOutputParameters.polygonZkEVMAddress,
                constructorArguments: [
                    deployOutputParameters.polygonZkEVMGlobalExitRootAddress,
                    deployOutputParameters.maticTokenAddress,
                    deployOutputParameters.verifierAddress,
                    deployOutputParameters.polygonZkEVMBridgeAddress,
                    deployOutputParameters.chainID,
                    deployOutputParameters.forkID,
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
                    deployOutputParameters.polygonZkEVMAddress,
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
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

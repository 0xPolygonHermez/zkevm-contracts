/* eslint-disable import/no-dynamic-require, no-await-in-loop, no-restricted-syntax, guard-for-in */
require('dotenv').config();
const path = require('path');
const hre = require('hardhat');
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const pathDeployOutputParameters = path.join(__dirname, './deploy_output.json');
const pathDeployParameters = path.join(__dirname, './deploy_parameters.json');

const deployParameters = require(pathDeployParameters);
const deployOutputParameters = require(pathDeployOutputParameters);

const pathCreateRollupOutput = path.join(__dirname, './create_rollup_output.json');

const createRollupOutputParameters = require(pathCreateRollupOutput);

async function main() {
    // load deployer account
    if (typeof process.env.ETHERSCAN_API_KEY === 'undefined') {
        throw new Error('Etherscan API KEY has not been defined');
    }

    // verify maticToken
    const polTokenName = 'Pol Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    try {
        // verify governance
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.polTokenAddress,
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
                    deployOutputParameters.polygonRollupManagerAddress,
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
                address: deployOutputParameters.polygonRollupManagerAddress,
                constructorArguments: [
                    deployOutputParameters.polygonZkEVMGlobalExitRootAddress,
                    deployOutputParameters.polTokenAddress,
                    deployOutputParameters.polygonZkEVMBridgeAddress,
                ],
            },
        );
    } catch (error) {
        // expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    // verify global exit root address
    try {
        await hre.run(
            'verify:verify',
            {
                address: deployOutputParameters.polygonZkEVMGlobalExitRootAddress,
                constructorArguments: [
                    deployOutputParameters.polygonRollupManagerAddress,
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

    try {
        await hre.run(
            'verify:verify',
            {
                contract: 'contracts/lib/PolygonTransparentProxy.sol:PolygonTransparentProxy',
                address: createRollupOutputParameters.rollupAddress,
                constructorArguments: [
                    await upgrades.erc1967.getImplementationAddress(createRollupOutputParameters.rollupAddress),
                    await upgrades.erc1967.getAdminAddress(createRollupOutputParameters.rollupAddress),
                    '0x',
                ],
            },
        );
    } catch (error) {
        // expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
    }

    // verify verifier
    try {
        await hre.run(
            'verify:verify',
            {
                address: createRollupOutputParameters.verifierAddress,
            },
        );
    } catch (error) {
        expect(error.message.toLowerCase().includes('already verified')).to.be.equal(true);
    }

    // verify zkEVM address or validium

    if (createRollupOutputParameters.consensusContract === 'PolygonZkEVMEtrog') {
        try {
            await hre.run(
                'verify:verify',
                {
                    contract: 'contracts/consensus/zkEVM/PolygonZkEVMEtrog.sol:PolygonZkEVMEtrog',
                    address: createRollupOutputParameters.rollupAddress,
                    constructorArguments: [
                        deployOutputParameters.polygonZkEVMGlobalExitRootAddress,
                        deployOutputParameters.polTokenAddress,
                        deployOutputParameters.polygonZkEVMBridgeAddress,
                        deployOutputParameters.polygonRollupManagerAddress,
                    ],
                },
            );
        } catch (error) {
            // expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
        }
    } else if (createRollupOutputParameters.consensusContract === 'PolygonValidiumEtrog') {
        try {
            await hre.run(
                'verify:verify',
                {
                    contract: 'contracts/consensus/validium/PolygonValidiumEtrog.sol:PolygonValidiumEtrog',
                    address: createRollupOutputParameters.rollupAddress,
                    constructorArguments: [
                        deployOutputParameters.polygonZkEVMGlobalExitRootAddress,
                        deployOutputParameters.polTokenAddress,
                        deployOutputParameters.polygonZkEVMBridgeAddress,
                        deployOutputParameters.polygonRollupManagerAddress,
                    ],
                },
            );
        } catch (error) {
            // expect(error.message.toLowerCase().includes('proxyadmin')).to.be.equal(true);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

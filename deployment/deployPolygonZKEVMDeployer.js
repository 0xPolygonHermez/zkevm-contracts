/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if import/no-dynamic-require global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { deployPolygonZkEVMDeployer } = require('./helpers/deployment-helpers');

const pathOutputJson = path.join(__dirname, './deploy_output.json');
const pathOngoingDeploymentJson = path.join(__dirname, './deploy_ongoing.json');

const deployParameters = require('./deploy_parameters.json');
const genesis = require('./genesis.json');

const pathOZUpgradability = path.join(__dirname, `../.openzeppelin/${process.env.HARDHAT_NETWORK}.json`);

async function main() {

    // Load provider
    let currentProvider = ethers.provider;
    if (deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = new ethers.providers.JsonRpcProvider(`https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
            if (deployParameters.maxPriorityFeePerGas && deployParameters.maxFeePerGas) {
                console.log(`Hardcoded gas used: MaxPriority${deployParameters.maxPriorityFeePerGas} gwei, MaxFee${deployParameters.maxFeePerGas} gwei`);
                const FEE_DATA = {
                    maxFeePerGas: ethers.utils.parseUnits(deployParameters.maxFeePerGas, 'gwei'),
                    maxPriorityFeePerGas: ethers.utils.parseUnits(deployParameters.maxPriorityFeePerGas, 'gwei'),
                };
                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', deployParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return {
                        maxFeePerGas: feedata.maxFeePerGas.mul(deployParameters.multiplierGas), // add 3 decimals
                        maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(deployParameters.multiplierGas),// add 3 decimals
                    };
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (deployParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(deployParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
    } else {
        [deployer] = (await ethers.getSigners());
    }

    // Deploy PolygonZkEVMDeployer if is not deployed already using keyless deployment
    const [zkEVMDeployerContract, keylessDeployer] = await deployPolygonZkEVMDeployer(deployer)
    if (keylessDeployer === ethers.constants.AddressZero) {
        console.log('#######################\n');
        console.log("polygonZkEVMDeployer already deployed on: ", zkEVMDeployerContract.address);
    } else {
        console.log('#######################\n');
        console.log("polygonZkEVMDeployer deployed on: ", zkEVMDeployerContract.address);
    }

    const outputJson = {
        polygonZkEVMAddress: polygonZkEVMContract.address,
        polygonZkEVMBridgeAddress: polygonZkEVMBridgeContract.address,
        polygonZkEVMGlobalExitRootAddress: polygonZkEVMGlobalExitRoot.address,
        maticTokenAddress,
        verifierAddress: verifierContract.address,
        zkEVMDeployerContract: zkEVMDeployerContract.address,
        deployerAddress: deployer.address,
        timelockContractAddress: timelockContract.address,
        deploymentBlockNumber,
        genesisRoot: genesisRootHex,
        trustedSequencer,
        trustedSequencerURL,
        chainID,
        networkName,
        admin,
        trustedAggregator,
        proxyAdminAddress,
        forkID,
        salt,
        version
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));

    // Remove ongoing deployment
    fs.unlinkSync(pathOngoingDeploymentJson);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

function checkParameter(parameterName) {
    console.log(deployParameters[parameterName])
    if (deployParameters[parameterName] == undefined) {
        throw new Error(`Missing parameter${parameterName}`);
    }
}
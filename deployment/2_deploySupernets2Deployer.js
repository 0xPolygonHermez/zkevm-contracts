/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { deploySupernets2Deployer } = require('./helpers/deployment-helpers');

const pathDeployParameters = path.join(__dirname, './deploy_parameters.json');
const deployParameters = require('./deploy_parameters.json');

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
                        maxFeePerGas: feedata.maxFeePerGas.mul(deployParameters.multiplierGas).div(1000),
                        maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(deployParameters.multiplierGas).div(1000),
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

    // Load initialSupernets2DeployerOwner
    const {
        initialSupernets2DeployerOwner,
    } = deployParameters;

    if (initialSupernets2DeployerOwner === undefined || initialSupernets2DeployerOwner === '') {
        throw new Error('Missing parameter: initialSupernets2DeployerOwner');
    }

    // Deploy Supernets2Deployer if is not deployed already using keyless deployment
    const [supernets2DeployerContract, keylessDeployer] = await deploySupernets2Deployer(initialSupernets2DeployerOwner, deployer);
    if (keylessDeployer === ethers.constants.AddressZero) {
        console.log('#######################\n');
        console.log('supernets2Deployer already deployed on: ', supernets2DeployerContract.address);
    } else {
        console.log('#######################\n');
        console.log('supernets2Deployer deployed on: ', supernets2DeployerContract.address);
    }

    deployParameters.supernets2DeployerAddress = supernets2DeployerContract.address;
    fs.writeFileSync(pathDeployParameters, JSON.stringify(deployParameters, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { deployCDKValidiumDeployer } = require('./helpers/deployment-helpers');

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

    // Load initialCDKValidiumDeployerOwner
    const {
        initialCDKValidiumDeployerOwner,
    } = deployParameters;

    if (initialCDKValidiumDeployerOwner === undefined || initialCDKValidiumDeployerOwner === '') {
        throw new Error('Missing parameter: initialCDKValidiumDeployerOwner');
    }

    // Deploy CDKValidiumDeployer if is not deployed already using keyless deployment
    const [cdkValidiumDeployerContract, keylessDeployer] = await deployCDKValidiumDeployer(initialCDKValidiumDeployerOwner, deployer);
    if (keylessDeployer === ethers.constants.AddressZero) {
        console.log('#######################\n');
        console.log('cdkValidium2Deployer already deployed on: ', cdkValidiumDeployerContract.address);
    } else {
        console.log('#######################\n');
        console.log('cdkValidium2Deployer deployed on: ', cdkValidiumDeployerContract.address);
    }

    deployParameters.cdkValidium2DeployerAddress = cdkValidiumDeployerContract.address;
    fs.writeFileSync(pathDeployParameters, JSON.stringify(deployParameters, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

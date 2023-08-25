/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, no-restricted-syntax */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { ethers } = require('hardhat');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pathDeployParameters = path.join(__dirname, '../deploy_parameters.json');
const deployParameters = require('../deploy_parameters.json');

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
                        maxFeePerGas: feedata.maxFeePerGas.mul(deployParameters.multiplierGas),
                        maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(deployParameters.multiplierGas),
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
        console.log('Using pvtKey deployer with address: ', deployer.address);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
        console.log('Using MNEMONIC deployer with address: ', deployer.address);
    } else {
        [deployer] = (await ethers.getSigners());
    }

    /*
     *Deployment MATIC
     */
    const gasTokenName = 'Gas Token';
    const gasTokenSymbol = 'GT';
    const gasTokenInitialBalance = ethers.utils.parseEther('20000000');

    const gasTokenFactory = await ethers.getContractFactory('ERC20PermitMock', deployer);
    const gasTokenContract = await gasTokenFactory.deploy(
        gasTokenName,
        gasTokenSymbol,
        deployer.address,
        gasTokenInitialBalance,
    );
    await gasTokenContract.deployed();

    console.log('#######################\n');
    console.log('Gas Token deployed to:', gasTokenContract.address);

    deployParameters.gasTokenAddress = gasTokenContract.address;
    deployParameters.gasTokenNetwork = 0;

    fs.writeFileSync(pathDeployParameters, JSON.stringify(deployParameters, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

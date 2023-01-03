/* eslint-disable no-console, no-unused-vars */
const hre = require('hardhat');
const { ethers, upgrades } = require('hardhat');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    // Set multiplier Gas
    const multiplierGas = 3;
    const currentProvider = new ethers.providers.JsonRpcProvider(`https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
    async function overrideFeeData() {
        const feedata = await ethers.provider.getFeeData();
        return {
            maxFeePerGas: feedata.maxFeePerGas.mul(multiplierGas),
            maxPriorityFeePerGas: feedata.maxPriorityFeePerGas.mul(multiplierGas),
        };
    }
    currentProvider.getFeeData = overrideFeeData;

    let deployer;
    if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
    } else {
        [deployer] = (await ethers.getSigners());
    }

    // compìle contracts
    await hre.run('compile');

    const proxyPolygonAddress = '0xfefefefefefefefefefefefee';
    const polygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMMock', deployer);

    // Upgrade zkevm
    const txZKEVM = await upgrades.upgradeProxy(proxyPolygonAddress, polygonZkEVMFactory);

    console.log(txZKEVM.deployTransaction);
    console.log(await txZKEVM.deployTransaction.wait());
    console.log('upgrade succesfull ZKEVM');
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

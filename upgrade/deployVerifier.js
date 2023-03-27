/* eslint-disable no-await-in-loop */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */

const { ethers } = require('hardhat');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
async function main() {
    let currentProvider = ethers.provider;
    let deployer;
    if (process.env.MNEMONIC) {
        deployer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC, 'm/44\'/60\'/0\'/0/0').connect(currentProvider);
        console.log("using mnemonic", deployer.address)
    } else {
        [deployer] = (await ethers.getSigners());
    }

    /*
     * Deploy verifier
     */
    const VerifierRollup = await ethers.getContractFactory('FflonkVerifier', deployer);
    const verifierContract = await VerifierRollup.deploy();
    await verifierContract.deployed();

    console.log('#######################\n');
    console.log('Verifier deployed to:', verifierContract.address);

    console.log("you can verify the new verifier address with:")
    console.log(`npx hardhat verify ${verifierContract.address} --network ${process.env.HARDHAT_NETWORK}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

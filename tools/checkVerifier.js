

const argv = require('yargs').option('verifierAddress', {
    required: true,
    string: true
}).option('network', {
    default: "mainnet",
    string: true
}).argv;

process.env.HARDHAT_NETWORK = argv.network;
const { ethers } = require("hardhat");
const { expect } = require('chai');

const { deployedBytecode } = require('../artifacts/contracts/verifiers/FflonkVerifier.sol/FflonkVerifier.json');

async function main() {
    const code = await ethers.provider.getCode(argv.verifierAddress);
    expect(code).to.be.equal(deployedBytecode);
    console.log("Verification succesfully");
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
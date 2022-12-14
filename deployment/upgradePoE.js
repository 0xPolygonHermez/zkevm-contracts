/* eslint-disable no-console */

const hre = require('hardhat');
const { ethers, upgrades } = require('hardhat');

async function main() {
    // compìle contracts
    await hre.run('compile');

    const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
    const ProofOfEfficiencyProxyAddress = '0xfefefefefefefefefefefefee';

    // Upgrade
    const tx = await upgrades.upgradeProxy(ProofOfEfficiencyProxyAddress, ProofOfEfficiencyFactory);

    console.log(tx.deployTransaction);
    console.log('upgrade succesfull');
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

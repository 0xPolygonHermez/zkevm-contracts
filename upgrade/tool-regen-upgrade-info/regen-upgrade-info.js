/* eslint-disable no-await-in-loop */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
const { ethers, upgrades } = require('hardhat');
const path = require('path');
const fs = require('fs');
// require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    // load input file
    const input = JSON.parse(fs.readFileSync(path.resolve(__dirname, './input.json')));

    // Load implementation contract
    const PolygonZkEVMFactory = await ethers.getContractFactory(input.implementationName, ethers.provider);

    // Import OZ upgrades
    await upgrades.forceImport(input.proxyAddress, PolygonZkEVMFactory, {
        kind: 'transparent',
        constructorArgs: input.constructorArgs,
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

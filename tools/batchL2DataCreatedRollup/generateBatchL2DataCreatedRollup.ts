/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
import hre from 'hardhat';
import fs from 'fs';
import input from './input.json';
import { PolygonZkEVMBridgeV2 } from '../../typechain-types';

async function main() {
    // --network <input>
    const bridgeFactory = await hre.ethers.getContractFactory('PolygonZkEVMBridgeV2');
    const polygonZkEVMBridgeContract = bridgeFactory.attach(input.bridgeAddress) as PolygonZkEVMBridgeV2;
    const gasTokenMetadata = await polygonZkEVMBridgeContract.getTokenMetadata(input.gasTokenAddress);

    // switch network hardhat
    await hre.switchNetwork('hardhat');
    const toolFactory = await hre.ethers.getContractFactory('BatchL2DataCreatedRollup');
    const toolContract = await toolFactory.deploy();
    await toolContract.waitForDeployment();
    const tx = await toolContract.generateInitializeTransaction(
        input.networkID,
        input.bridgeAddress,
        input.gasTokenAddress,
        input.gasTokenNetwork,
        gasTokenMetadata,
    );
    const output = {
        networkID: input.networkID,
        tx,
    };
    // write tx.json
    const txPath = './tx.json';
    fs.writeFileSync(txPath, JSON.stringify(output, null, 1));
}
main().then(
    () => {
        process.exit(0);
    },
    (err) => {
        console.log(err.message);
        console.log(err.stack);
        process.exit(1);
    },
);

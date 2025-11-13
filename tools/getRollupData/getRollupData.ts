/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { PolygonRollupManager } from '../../typechain-types';
import getRollupParams from './rollupDataParams.json';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const pathOutputJson = path.join(__dirname, './deploy_output.json');
const pathCreateRollupOutput = path.join(__dirname, './create_rollup_output');

async function main() {
    const RollupManagerFactory = await ethers.getContractFactory('PolygonRollupManager');

    const rollupManager = (await RollupManagerFactory.attach(
        getRollupParams.polygonRollupManagerAddress,
    )) as PolygonRollupManager;

    const polygonZkEVMBridgeAddress = await rollupManager.bridgeAddress();
    const polygonZkEVMGlobalExitRootAddress = await rollupManager.globalExitRootManager();
    const polTokenAddress = await rollupManager.pol();
    // Filter first rollup ID ( the one on migration)
    const filterInit = rollupManager.filters.Initialized(undefined);
    const eventsInit = await rollupManager.queryFilter(filterInit, 0, 'latest');
    const deploymentRollupManagerBlockNumber = eventsInit[0].blockNumber;

    // Filter first initialization (deployment)
    const filter = rollupManager.filters.AddExistingRollup(1);
    const eventsAddRollup = await rollupManager.queryFilter(filter, 0, 'latest');
    let upgradeToULxLyBlockNumber;
    if (eventsAddRollup.length > 0) {
        upgradeToULxLyBlockNumber = eventsAddRollup[0].blockNumber;
    } else {
        console.log('No event AddExistingRollup');
        upgradeToULxLyBlockNumber = eventsInit[0].blockNumber;
    }

    const deployOutput = {
        polygonRollupManagerAddress: rollupManager.target,
        polygonZkEVMBridgeAddress,
        polygonZkEVMGlobalExitRootAddress,
        polTokenAddress,
        deploymentRollupManagerBlockNumber,
        upgradeToULxLyBlockNumber,
    };
    fs.writeFileSync(pathOutputJson, JSON.stringify(deployOutput, null, 1));

    const filter2 = rollupManager.filters.CreateNewRollup(
        getRollupParams.rollupID,
        undefined,
        undefined,
        undefined,
        undefined,
    );
    const eventsCreateNewRollup = await rollupManager.queryFilter(filter2, 0, 'latest');

    if (eventsCreateNewRollup.length > 0) {
        const { rollupID, rollupAddress, chainID, gasTokenAddress, rollupTypeID } = eventsCreateNewRollup[0].args;

        const filter3 = rollupManager.filters.AddNewRollupType(
            rollupTypeID,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
        );

        const eventsAddRollupType = await rollupManager.queryFilter(filter3, 0, 'latest');
        const { genesis, description } = eventsAddRollupType[0].args;

        // Add the first batch of the created rollup
        const outputCreateRollup = {} as any;
        outputCreateRollup.genesis = genesis;
        outputCreateRollup.createRollupBlockNumber = eventsCreateNewRollup[0].blockNumber;
        outputCreateRollup.rollupAddress = rollupAddress;
        outputCreateRollup.consensusContract = description;
        outputCreateRollup.rollupID = Number(rollupID);
        outputCreateRollup.L2ChainID = Number(chainID);
        outputCreateRollup.gasTokenAddress = gasTokenAddress;

        await fs.writeFileSync(
            `${pathCreateRollupOutput}_${rollupID}.json`,
            JSON.stringify(outputCreateRollup, null, 1),
        );
    } else {
        console.log('No event CreateNewRollup');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

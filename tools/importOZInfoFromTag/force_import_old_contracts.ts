/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import { ethers, upgrades } from 'hardhat';
import * as dotenv from 'dotenv';

import importParams from './import_params.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const OLD_GER_L2 = 'PolygonZkEVMGlobalExitRootL2';
const OLD_BRIDGE_L2 = 'PolygonZkEVMBridgeV2';

async function main() {
    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = ['bridgeL2Address'];
    // eslint-disable-next-line no-restricted-syntax
    for (const parameterName of mandatoryUpgradeParameters) {
        const value = importParams[parameterName];
        if (value === undefined || value === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }
    const { bridgeL2Address } = importParams;
    // Load provider
    const currentProvider = ethers.provider;

    // Force import hardhat manifest
    // As this contract is deployed in the genesis of a L2 network, no open zeppelin network file is created, we need to force import it
    const oldBridgeFactory = await ethers.getContractFactory(OLD_BRIDGE_L2, currentProvider);
    await upgrades.forceImport(bridgeL2Address, oldBridgeFactory, {
        constructorArgs: [],
        kind: 'transparent',
    });

    const oldBridgeL2Contract = (await oldBridgeFactory.attach(bridgeL2Address)) as any;
    const gerL2Address = await oldBridgeL2Contract.globalExitRootManager();

    const oldGerFactory = await ethers.getContractFactory(OLD_GER_L2, currentProvider);
    await upgrades.forceImport(gerL2Address, oldGerFactory, {
        constructorArgs: [bridgeL2Address],
        kind: 'transparent',
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

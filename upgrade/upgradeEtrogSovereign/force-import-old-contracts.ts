/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import { ethers, upgrades } from 'hardhat';
import * as dotenv from 'dotenv';

import upgradeParameters from './upgrade_parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const OLD_GER_L2 = 'PolygonZkEVMGlobalExitRootL2';
const OLD_BRIDGE_L2 = 'PolygonZkEVMBridgeV2';

async function main() {
    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = ['bridgeL2', 'gerL2'];
    // eslint-disable-next-line no-restricted-syntax
    for (const parameterName of mandatoryUpgradeParameters) {
        const value = upgradeParameters[parameterName];
        if (value === undefined || value === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }
    const { bridgeL2, gerL2 } = upgradeParameters;
    // Load provider
    const currentProvider = ethers.provider;
    // Load deployer

    let deployer;
    if (process.env.DEPLOYER_PRIVATE_KEY) {
        deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    // Force import hardhat manifest
    // As this contract is deployed in the genesis of a L2 network, no open zeppelin network file is created, we need to force import it
    const oldBridgeFactory = await ethers.getContractFactory(OLD_BRIDGE_L2, deployer);
    await upgrades.forceImport(bridgeL2, oldBridgeFactory, {
        constructorArgs: [],
        kind: 'transparent',
    });
    const oldGerFactory = await ethers.getContractFactory(OLD_GER_L2, deployer);
    await upgrades.forceImport(gerL2, oldGerFactory, {
        constructorArgs: [bridgeL2],
        kind: 'transparent',
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

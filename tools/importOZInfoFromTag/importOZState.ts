/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { logger } from '../../src/logger';
import { AgglayerManager } from '../../typechain-types';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Configuration: Set the RollupManager or AgglayerManager address here
// You can also set this via environment variable: ROLLUP_MANAGER_ADDRESS
const { ROLLUP_MANAGER_ADDRESS } = process.env;

/**
 * Plain script to import OpenZeppelin upgrade state for all proxy contracts
 * This ensures the OZ upgrades plugin recognizes the existing deployments
 *
 * Purpose:
 * - Forces import of all proxy contracts into OpenZeppelin's upgrade state tracking
 * - Required before running prepareUpgrade or upgrade operations
 * - Syncs the local .openzeppelin folder with deployed contract state
 */
async function main() {
    logger.info('========== IMPORTING OZ UPGRADE STATE ==========\n');

    if (!ROLLUP_MANAGER_ADDRESS || ROLLUP_MANAGER_ADDRESS === '') {
        throw new Error('ROLLUP_MANAGER_ADDRESS is not set. Please set it in the script or via environment variable.');
    }

    logger.info(`Using RollupManager address: ${ROLLUP_MANAGER_ADDRESS}\n`);

    // Load onchain parameters from rollupManager contract
    logger.info('Loading contract addresses from RollupManager...');
    const rollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
    const rollupManagerContract = rollupManagerFactory.attach(ROLLUP_MANAGER_ADDRESS) as AgglayerManager;

    const globalExitRootV2Address = await rollupManagerContract.globalExitRootManager();
    const polAddress = await rollupManagerContract.pol();
    const bridgeV2Address = await rollupManagerContract.bridgeAddress();
    const aggLayerGatewayAddress = await rollupManagerContract.aggLayerGateway();

    logger.info(`✓ Addresses obtained:`);
    logger.info(`  - RollupManager: ${ROLLUP_MANAGER_ADDRESS}`);
    logger.info(`  - Bridge V2: ${bridgeV2Address}`);
    logger.info(`  - Global Exit Root V2: ${globalExitRootV2Address}`);
    logger.info(`  - AggLayer Gateway: ${aggLayerGatewayAddress}\n`);

    // Get contract factories for current versions
    logger.info('Loading current version contract factories...');
    const aggLayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
    const bridgeFactory = await ethers.getContractFactory('AgglayerBridge');
    const globalExitRootManagerFactory = await ethers.getContractFactory('AgglayerGER');
    logger.info('✓ Current version factories loaded\n');

    // Force import all proxies using CURRENT versions
    logger.info('========== FORCE IMPORTING PROXIES ==========\n');

    // 1. RollupManager (AgglayerManager)
    logger.info('1. Importing RollupManager proxy...');
    try {
        await upgrades.forceImport(ROLLUP_MANAGER_ADDRESS, rollupManagerFactory, {
            kind: 'transparent',
            constructorArgs: [globalExitRootV2Address, polAddress, bridgeV2Address, aggLayerGatewayAddress],
        });
        logger.info(`   ✅ RollupManager imported successfully\n`);
    } catch (error: any) {
        logger.error(`   ❌ Failed to import RollupManager: ${error.message}\n`);
    }

    // 2. AggLayerGateway
    logger.info('2. Importing AggLayerGateway proxy...');
    try {
        await upgrades.forceImport(aggLayerGatewayAddress as string, aggLayerGatewayFactory, {
            kind: 'transparent',
        });
        logger.info(`   ✅ AggLayerGateway imported successfully\n`);
    } catch (error: any) {
        logger.error(`   ❌ Failed to import AggLayerGateway: ${error.message}\n`);
    }

    // 3. Bridge
    logger.info('3. Importing Bridge proxy...');
    try {
        await upgrades.forceImport(bridgeV2Address as string, bridgeFactory, {
            kind: 'transparent',
        });
        logger.info(`   ✅ Bridge imported successfully\n`);
    } catch (error: any) {
        logger.error(`   ❌ Failed to import Bridge: ${error.message}\n`);
    }

    // 4. GlobalExitRoot
    logger.info('4. Importing GlobalExitRoot proxy...');
    try {
        await upgrades.forceImport(globalExitRootV2Address as string, globalExitRootManagerFactory, {
            kind: 'transparent',
            constructorArgs: [ROLLUP_MANAGER_ADDRESS, bridgeV2Address],
        });
        logger.info(`   ✅ GlobalExitRoot imported successfully\n`);
    } catch (error: any) {
        logger.error(`   ❌ Failed to import GlobalExitRoot: ${error.message}\n`);
    }

    logger.info('========== IMPORT COMPLETE ==========\n');
    logger.info('✅ All proxy contracts have been imported into OpenZeppelin upgrade state');
    logger.info('You can now run prepareUpgrade on these contracts\n');
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});

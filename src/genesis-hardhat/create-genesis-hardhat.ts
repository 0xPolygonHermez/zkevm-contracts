import hre, { ethers, upgrades, hardhatArguments } from "hardhat";
import { BridgeL2SovereignChain } from "../../typechain-types";
import { GENESIS_CONTRACT_NAMES } from "./constants";
import { getAddressesGenesisBase } from "./utils";
import { checkParams } from '../../src/utils';
import { logger } from "../../src/logger";

/**
 * Create a genesis file for hardhat
 * This function deployes all the contracts that are needed for the genesis file in the hardhdat network
 * @param genesisBase - The base genesis file
 * @param initializeParams - The initialize parameters
 * @returns The genesis file
 */
export async function createGenesisHardhat(_genesisBase: any, initializeParams: any) {
    logger.info('Start createGenesisHardhat tool');

    /////////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /////////////////////////////
    logger.info('Check initial parameters');

    // Check initialize params
    const mandatoryUpgradeParameters = [
        'rollupID',
        'gasTokenAddress',
        'gasTokenNetwork',
        'gasTokenMetadata',
        'bridgeManager',
        'sovereignWETHAddress',
        'sovereignWETHAddressIsNotMintable',
        'globalExitRootUpdater',
        'globalExitRootRemover',
        'emergencyBridgePauser',
        'emergencyBridgeUnpauser',
        'proxiedTokensManager',
    ];
    checkParams(initializeParams, mandatoryUpgradeParameters);

    //////////////////////////////////////
    ///   GET ADDRESSES BASE GENESIS   ///
    //////////////////////////////////////
    logger.info('Get addresses from genesis base');

    // get genesis from genesisBase (skip the root)
    const genesisBase = _genesisBase.genesis;

    // get addresses from genesis base
    const genesisBaseAddresses = await getAddressesGenesisBase(genesisBase.genesis);

    // switch network hardhat
    const previousNetwork: string = hardhatArguments.network || 'hardhat';
    await hre.switchNetwork('hardhat');

    //////////////////////////////////////
    ///   DEPLOY SOVEREIGN BRIDGE   //////
    //////////////////////////////////////
    logger.info('Deploy sovereign bridge');
    
    // deploy PolygonZkEVMBridge
    const BridgeL2SovereignChainFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE);
    const sovereignChainBridgeContract = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
        initializer: false,
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
    })) as unknown as BridgeL2SovereignChain;

    // switch network previous network
    await hre.switchNetwork(previousNetwork);



    // 1 - Deploy the genesis contracts
}
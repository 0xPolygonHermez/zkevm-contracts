import path = require('path');
import fs = require('fs');
import hre, { ethers, upgrades, hardhatArguments } from 'hardhat';
import { expect } from 'chai';
import { BridgeL2SovereignChain, GlobalExitRootManagerL2SovereignChain, ProxyAdmin } from '../../typechain-types';
import { GENESIS_CONTRACT_NAMES } from './constants';
import { getAddressesGenesisBase, getTraceStorageWrites, getMinDelayTimelock, deployProxyWithTxCapture, getExpectedStorageProxy, getExpectedStorageBridge, getGlobalExitRootManagerL2SovereignChain, getExpectedStoragePolygonZkEVMTimelock, getExpectedStorageGERManagerL2SovereignChain, getStorageProxy, getStorageBridge, getActualStorage } from './utils';
import { checkParams, getOwnerOfProxyAdminFromProxy } from '../utils';
import { logger } from '../logger';
import { STORAGE_GENESIS } from './storage';

/**
 * Create a genesis file for hardhat
 * This function deployes all the contracts that are needed for the genesis file in the hardhdat network
 * @param genesisBase - The base genesis file
 * @param initializeParams - The initialize parameters
 * @param config - The configuration object
 * @returns The genesis file
 */
export async function createGenesisHardhat(_genesisBase: any, initializeParams: any, config: any) {
    logger.info('createGenesisHardhat tool');

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
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

    /// ///////////////////////////////////
    ///   GET ADDRESSES BASE GENESIS   ///
    /// ///////////////////////////////////
    logger.info('Get addresses from genesis base');

    // get genesis from genesisBase (skip the root)
    const genesisBase = _genesisBase.genesis;

    // get addresses from genesis base
    const genesisBaseAddresses = await getAddressesGenesisBase(genesisBase);

    // get default minDelay from the timelock
    const defaultMinDelayTimelock = Number(await getMinDelayTimelock(genesisBase));

    // switch network hardhat
    const previousNetwork: string = hardhatArguments.network || 'hardhat';
    await hre.switchNetwork('hardhat');

    /// /////////////////////////
    ///   SET CONFIG VALUES  ///
    /// /////////////////////////
    logger.info('Set parameters values');

    // TIMELOCK_MINDELAY
    let timelockMinDelay;
    // Set the default minDelay from the timelock
    if (config.timelock === undefined || config.timelock.minDelay === undefined) {
        timelockMinDelay = defaultMinDelayTimelock;
    } else {
        // Check if the minDelay is a number
        if (typeof config.timelock.minDelay !== 'number') {
            throw new Error('minDelay must be a number');
        }
        // Check if the minDelay is greater than 0
        if (config.timelock.minDelay <= 0) {
            throw new Error('minDelay must be greater than 0');
        }
        // Check if the minDelay is less than the default minDelay
        if (config.timelock.minDelay < defaultMinDelayTimelock) {
            logger.warn(
                `minDelay is less than the default minDelay (${defaultMinDelayTimelock}). This can cause issues with the timelock.`,
            );
        }

        timelockMinDelay = config.timelock.minDelay;
    }

    // TIMELOCK_OWNER
    let timelockOwner;
    // Set the default owner from the genesis base
    if (config.timelock === undefined || config.timelock.owner === undefined) {
        timelockOwner = genesisBaseAddresses.deployerAddress;
    } else {
        // Check if the owner is a valid address
        if (!ethers.isAddress(config.timelock.owner)) {
            throw new Error('timelock owner must be a valid address');
        }
        timelockOwner = config.timelock.owner;
    }

    /// ///////////////////////////////////
    ///   DEPLOY SOVEREIGN CONTRACTS   ///
    /// ///////////////////////////////////
    const genesisInfo = [];

    // Load deployer
    await ethers.provider.send('hardhat_impersonateAccount', [genesisBaseAddresses.deployerAddress]);
    await ethers.provider.send('hardhat_setBalance', [genesisBaseAddresses.deployerAddress, '0xffffffffffffffff']); // 18 ethers aprox
    const deployer = await ethers.getSigner(genesisBaseAddresses.deployerAddress);

    // deploy BridgeL2SovereignChain
    const BridgeL2SovereignChainFactory = await ethers.getContractFactory(
        GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE,
        deployer,
    );

    const bridgeDeploymentResult = await deployProxyWithTxCapture(BridgeL2SovereignChainFactory, [], {
        initializer: false,
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
    });

    const sovereignChainBridgeContract = bridgeDeploymentResult.contract as unknown as BridgeL2SovereignChain;

    // Get the deployment transaction for bridge
    const txDeployBridge = await sovereignChainBridgeContract.deploymentTransaction();
    const txDeployBridgeHash = txDeployBridge ? txDeployBridge.hash : undefined;
    const tokenWrappedAddress = await sovereignChainBridgeContract.getWrappedTokenBridgeImplementation();

    genesisInfo.push({
        isProxy: true,
        name: GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE,
        address: sovereignChainBridgeContract.target,
        storagesWrites: await getTraceStorageWrites(txDeployBridgeHash),
        deployedAddresses: [
            {
                name: GENESIS_CONTRACT_NAMES.BYTECODE_STORER,
                address: await sovereignChainBridgeContract.wrappedTokenBytecodeStorer(),
            },
            {
                name: GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION,
                address: tokenWrappedAddress,
            },
        ],
    });

    // deploy GlobalExitRootManagerL2SovereignChain
    const gerManagerL2SovereignChainFactory = await ethers.getContractFactory(
        GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN,
        deployer,
    );

    const gerDeploymentResult = await deployProxyWithTxCapture(gerManagerL2SovereignChainFactory, [], {
        initializer: false,
        constructorArgs: [genesisBaseAddresses.bridgeProxyAddress], // Constructor arguments
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
    });

    const gerManagerContract = gerDeploymentResult.contract as unknown as GlobalExitRootManagerL2SovereignChain;

    /// ///////////////////////////////////////
    ///   INITIALIZE SOVEREIGN CONTRACTS   ///
    /// //////////////////////////////////////

    console.log('Initializing BridgeL2SovereignChain contract...');
    // Initialize the BridgeL2SovereignChain contract
    const {
        rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        gasTokenMetadata,
        bridgeManager,
        sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable,
        globalExitRootUpdater,
        globalExitRootRemover,
        emergencyBridgePauser,
        emergencyBridgeUnpauser,
        proxiedTokensManager,
    } = initializeParams;

    const txInitialitzeBridge = await sovereignChainBridgeContract.initialize(
        rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        gerManagerContract.target, // Global exit root manager address from base genesis
        ethers.ZeroAddress, // Polygon rollup manager address always zero for sovereign chains
        gasTokenMetadata,
        bridgeManager,
        sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable,
        emergencyBridgePauser,
        emergencyBridgeUnpauser,
        proxiedTokensManager,
    );

    console.log('Initializing GlobalExitRootManagerL2SovereignChain contract...');
    // Initialize the GlobalExitRootManagerL2SovereignChain contract

    const txInitializeGer = await gerManagerContract.initialize(globalExitRootUpdater, globalExitRootRemover);

    // deploy timelock
    const timelockContractFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK, deployer);
    const timelockContract = await timelockContractFactory.deploy(
        timelockMinDelay,
        [deployer],
        [deployer],
        deployer,
        ethers.ZeroAddress, // PolygonRollupManager address not needed in L2
    );

    const txDeployTimelock = await timelockContract.deploymentTransaction();
    const txDeployTimelockHash = txDeployTimelock ? txDeployTimelock.hash : undefined;

    // Transfer ownership of the proxyAdmon to the timelock
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(sovereignChainBridgeContract.target as string);
    const proxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    );
    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress as string) as ProxyAdmin;
    await (
        await proxyAdminInstance.connect(deployer).transferOwnership(genesisBaseAddresses.timelockAddress as string)
    ).wait();

    /// /////////////////////////////////
    ///   SANITY CHECKS DEPLOYMENT   ///
    /// /////////////////////////////////

    // Check admin of the proxy is the same in the bridge and the GER manager
    const adminBridge = await upgrades.erc1967.getAdminAddress(sovereignChainBridgeContract.target as string);
    const adminGerManager = await upgrades.erc1967.getAdminAddress(gerManagerContract.target as string);

    expect(adminBridge).to.equal(adminGerManager);

    // TODO CHECKS

    /// //////////////////////////////
    ///   SANITY CHECKS STORAGE   ///
    /// //////////////////////////////

    // Get all storage writes from transactions executed during the deployment of all the contracts

    // For each SC, build a json with the expected values and the actual values and check between them
    // all the storage slots that must be checked must be in storage.ts file

    /// /////////////////////////////////////////
    ///   BUILD STORAGE MODIFICATIONS JSON   ///
    /// /////////////////////////////////////////

    console.log('\n=== BUILDING STORAGE MODIFICATIONS JSON ===');

    // Build storage modifications JSON
    const storageModifications: { [contractName: string]: any } = {};

    // Get storage modifications for Bridge contract
    console.log('Getting storage modifications for Bridge contract...');
    const bridgeStorageWrites = await getTraceStorageWrites(txDeployBridgeHash);
    storageModifications.BridgeL2SovereignChain = bridgeStorageWrites;

    // Get storage modifications for Bridge implementation
    if (bridgeDeploymentResult.txHashes.implementation) {
        console.log('Getting storage modifications for Bridge implementation...');
        try {
            const implTx = await ethers.provider.getTransaction(bridgeDeploymentResult.txHashes.implementation);
            if (implTx) {
                const implStorageWrites = await getTraceStorageWrites(bridgeDeploymentResult.txHashes.implementation);
                storageModifications.TokenWrappedBridgeUpgradeable = {};
                storageModifications.TokenWrappedBridgeUpgradeable[
                    STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.INITIALIZER
                ] = implStorageWrites[STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.INITIALIZER];
                storageModifications.PolygonZkEVMBridgeV2 = {};
                storageModifications.PolygonZkEVMBridgeV2[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN_IMPLEMENTATION.INITIALIZER] =
                    implStorageWrites[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN_IMPLEMENTATION.INITIALIZER];
            }
        } catch (error) {
            console.log('Could not get Bridge implementation storage writes:', error);
        }
    }
    // Get storage modifications for Bridge initialization
    if (txInitialitzeBridge) {
        console.log('Getting storage modifications for Bridge initialization...');
        try {
            const initTx = await ethers.provider.getTransaction(txInitialitzeBridge.hash);
            if (initTx) {
                const initStorageWrites = await getTraceStorageWrites(txInitialitzeBridge.hash);
                storageModifications.BridgeL2SovereignChain_Initialization = initStorageWrites;
            }
        } catch (error) {
            console.log('Could not get Bridge initialization storage writes:', error);
        }
    }

    // Get storage modifications for GER Manager contract
    console.log('Getting storage modifications for GER Manager contract...');
    if (gerDeploymentResult.txHashes.proxy) {
        try {
            const gerProxyTx = await ethers.provider.getTransaction(gerDeploymentResult.txHashes.proxy);
            if (gerProxyTx) {
                const gerStorageWrites = await getTraceStorageWrites(gerDeploymentResult.txHashes.proxy);
                storageModifications.GlobalExitRootManagerL2SovereignChain = gerStorageWrites;
            }
        } catch (error) {
            console.log('Could not get GER proxy storage writes:', error);
        }
    }

    // Get storage modifications for GER Manager implementation
    if (gerDeploymentResult.txHashes.implementation) {
        console.log('Getting storage modifications for GER Manager implementation...');
        try {
            const gerImplTx = await ethers.provider.getTransaction(gerDeploymentResult.txHashes.implementation);
            if (gerImplTx) {
                const gerImplStorageWrites = await getTraceStorageWrites(gerDeploymentResult.txHashes.implementation);
                storageModifications.GlobalExitRootManagerL2SovereignChain_Implementation = gerImplStorageWrites;
            }
        } catch (error) {
            console.log('Could not get GER implementation storage writes:', error);
        }
    }

    // Get storage modifications for GER Manager initialization
    if (txInitializeGer) {
        console.log('Getting storage modifications for GER Manager initialization...');
        try {
            const gerInitTx = await ethers.provider.getTransaction(txInitializeGer.hash);
            if (gerInitTx) {
                const gerInitStorageWrites = await getTraceStorageWrites(txInitializeGer.hash);
                storageModifications.GlobalExitRootManagerL2SovereignChain_Initialization = gerInitStorageWrites;
            }
        } catch (error) {
            console.log('Could not get GER initialization storage writes:', error);
        }
    }

    // Get storage modifications for Timelock contract
    console.log('Getting storage modifications for Timelock contract...');
    const timelockStorageWrites = await getTraceStorageWrites(txDeployTimelockHash);
    storageModifications.PolygonZkEVMTimelock = timelockStorageWrites;

    // Output the storage modifications JSON
    console.log('\n=== STORAGE MODIFICATIONS JSON ===');
    console.log(JSON.stringify(storageModifications, null, 2));

    /// /////////////////////////////////////////////////
    ///   BUILD EXPECTED STORAGE MODIFICATIONS JSON   ///
    /// /////////////////////////////////////////////////

    const expectedStorageModifications: { [key: string]: any } = {};
    // BridgeL2SovereignChain Proxy
    expectedStorageModifications.BridgeL2SovereignChain = await getExpectedStorageProxy(
        sovereignChainBridgeContract.target,
    );
    // GlobalExitRootManagerL2SovereignChain Proxy
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain = await getExpectedStorageProxy(
        gerManagerContract.target,
    );
    // BridgeL2SovereignChain Implementation --> TokenWrappedBridgeUpgradeable
    expectedStorageModifications.TokenWrappedBridgeUpgradeable = {};
    expectedStorageModifications.TokenWrappedBridgeUpgradeable[
        STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.INITIALIZER
    ] = ethers.zeroPadValue('0xffffffffffffffff', 32);
    // BridgeL2SovereignChain Implementation --> PolygonZkEVMBridgeV2
    expectedStorageModifications.PolygonZkEVMBridgeV2 = {};
    expectedStorageModifications.PolygonZkEVMBridgeV2[STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN_IMPLEMENTATION.INITIALIZER] =
        ethers.zeroPadValue('0xff', 32);
    // Bridge initialitzation
    expectedStorageModifications.BridgeL2SovereignChain_Initialization = getExpectedStorageBridge(
        initializeParams,
        gerManagerContract.target,
    );
    // GER Implementation --> PolygonZkEVMGlobalExitRootL2
    expectedStorageModifications.PolygonZkEVMGlobalExitRootL2 = {};
    expectedStorageModifications.PolygonZkEVMGlobalExitRootL2[
        STORAGE_GENESIS.STORAGE_GER_SOVEREIGN_IMPLEMENTATION.INITIALIZER_POLYGON_GER_L2
    ] = ethers.zeroPadValue('0xff', 32);
    // GER initialitzation
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain =
        getExpectedStorageGERManagerL2SovereignChain(initializeParams);
    expectedStorageModifications.PolygonZkEVMTimelock = getExpectedStoragePolygonZkEVMTimelock(timelockMinDelay);

    /// //////////////////////////////
    ///   CHECK ACTUAL STORAGE    ///
    /// /////////////////////////////
    console.log('\n=== CHECKING STORAGE MODIFICATIONS ===');
    console.log('Checking BridgeL2SovereignChain storage modifications...');

    const actualStorage: { [key: string]: any } = {};
    // BridgeL2SovereignChain
    actualStorage.BridgeL2SovereignChain = await getActualStorage(
        storageModifications.BridgeL2SovereignChain,
        sovereignChainBridgeContract.target,
    );
    // TODO: CHECK _disableInitializers PolygonZkEVMBridgeV2
    actualStorage.BridgeL2SovereignChain_Initialization = await getActualStorage(
        storageModifications.BridgeL2SovereignChain_Initialization,
        sovereignChainBridgeContract.target,
    );
    actualStorage.TokenWrappedBridgeUpgradeable = await getActualStorage(
        storageModifications.TokenWrappedBridgeUpgradeable,
        tokenWrappedAddress,
    );
    // GlobalExitRootManagerL2SovereignChain
    actualStorage.GlobalExitRootManagerL2SovereignChain = await getActualStorage(
        storageModifications.GlobalExitRootManagerL2SovereignChain,
        gerManagerContract.target,
    );
    // TODO: CHECK _disableInitializers PolygonZkEVMGlobalExitRootL2
    actualStorage.GlobalExitRootManagerL2SovereignChain_Initialization = await getActualStorage(
        storageModifications.GlobalExitRootManagerL2SovereignChain_Initialization,
        gerManagerContract.target,
    );

    // PolygonZkEVMTimelock
    actualStorage.PolygonZkEVMTimelock = await getActualStorage(
        storageModifications.PolygonZkEVMTimelock,
        timelockContract.target,
    );

    // TODO: actualStorage == expectedStorage == storageModifications

    /// ///////////////////////////
    ///   BUILD GENESIS FILE   ///
    /// ///////////////////////////

    // TODO: BUILD GENESIS

    // switch network previous network
    await hre.switchNetwork(previousNetwork);

    //return genesisInfo;
}

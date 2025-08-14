import path = require('path');
import fs = require('fs');
import hre, { ethers, upgrades, hardhatArguments } from 'hardhat';
import { expect } from 'chai';
import { BridgeL2SovereignChain, GlobalExitRootManagerL2SovereignChain, ProxyAdmin } from '../../typechain-types';
import { GENESIS_CONTRACT_NAMES } from './constants';
import {
    getAddressesGenesisBase,
    getTraceStorageWrites,
    getMinDelayTimelock,
    deployProxyWithTxCapture,
    getExpectedStorageProxy,
    getExpectedStorageBridge,
    getExpectedStoragePolygonZkEVMTimelock,
    getExpectedStorageGERManagerL2SovereignChain,
    getActualStorage,
    deepEqual,
} from './utils';
import { checkParams } from '../utils';
import { logger } from '../logger';
import { STORAGE_GENESIS } from './storage';

const supportedGERManagers = ['PolygonZkEVMGlobalExitRootL2 implementation'];
const supportedBridgeContracts = ['PolygonZkEVMBridge implementation', 'PolygonZkEVMBridgeV2 implementation'];
const supportedBridgeContractsProxy = ['PolygonZkEVMBridgeV2 proxy', 'PolygonZkEVMBridge proxy'];

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
    // let timelockOwner;
    // // Set the default owner from the genesis base
    // if (config.timelock === undefined || config.timelock.owner === undefined) {
    //     timelockOwner = genesisBaseAddresses.deployerAddress;
    // } else {
    //     // Check if the owner is a valid address
    //     if (!ethers.isAddress(config.timelock.owner)) {
    //         throw new Error('timelock owner must be a valid address');
    //     }
    //     timelockOwner = config.timelock.owner;
    // }

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

    logger.info('Initializing BridgeL2SovereignChain contract...');
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

    logger.info('Initializing GlobalExitRootManagerL2SovereignChain contract...');
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

    /// //////////////////////////////
    ///   SANITY CHECKS STORAGE   ///
    /// //////////////////////////////

    // Get all storage writes from transactions executed during the deployment of all the contracts

    // For each SC, build a json with the expected values and the actual values and check between them
    // all the storage slots that must be checked must be in storage.ts file

    /// /////////////////////////////////////////
    ///   BUILD STORAGE MODIFICATIONS JSON   ///
    /// /////////////////////////////////////////

    logger.info('\n=== BUILDING STORAGE MODIFICATIONS JSON ===');

    // Build storage modifications JSON
    const storageModifications: { [contractName: string]: any } = {};

    // Get storage modifications for Bridge contract
    logger.info('Getting storage modifications for Bridge contract...');
    const bridgeStorageWrites = await getTraceStorageWrites(txDeployBridgeHash);
    const depthBridgeStorageWrites = 1;
    storageModifications.BridgeL2SovereignChain = bridgeStorageWrites[depthBridgeStorageWrites];

    // Get storage modifications for Bridge implementation
    if (bridgeDeploymentResult.txHashes.implementation) {
        logger.info('Getting storage modifications for Bridge implementation...');
        try {
            const implTx = await ethers.provider.getTransaction(bridgeDeploymentResult.txHashes.implementation);
            if (implTx) {
                const implStorageWrites = await getTraceStorageWrites(bridgeDeploymentResult.txHashes.implementation);
                const depthBridgeImpl = 1;
                const depthTokenWrappedImpl = 2;
                const depthTokenWrappedProxy = 3;
                storageModifications.BridgeL2SovereignChain_Implementation = implStorageWrites[depthBridgeImpl];
                storageModifications.TokenWrappedBridgeUpgradeable_Implementation =
                    implStorageWrites[depthTokenWrappedImpl];

                if (
                    gasTokenAddress !== ethers.ZeroAddress &&
                    ethers.isAddress(gasTokenAddress) &&
                    (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress))
                ) {
                    storageModifications.TokenWrappedBridgeUpgradeable = implStorageWrites[depthTokenWrappedProxy];
                }
            }
        } catch (error) {
            logger.error('Could not get Bridge implementation storage writes:', error);
        }
    }
    // Get storage modifications for Bridge initialization
    if (txInitialitzeBridge) {
        logger.info('Getting storage modifications for Bridge initialization...');
        try {
            const initTx = await ethers.provider.getTransaction(txInitialitzeBridge.hash);
            if (initTx) {
                const initStorageWrites = await getTraceStorageWrites(txInitialitzeBridge.hash);
                const depthBridgeInit = 2;
                storageModifications.BridgeL2SovereignChain_Initialization = initStorageWrites[depthBridgeInit];
            }
        } catch (error) {
            logger.error('Could not get Bridge initialization storage writes:', error);
        }
    }

    // Get storage modifications for GER Manager contract
    logger.info('Getting storage modifications for GER Manager contract...');
    if (gerDeploymentResult.txHashes.proxy) {
        try {
            const gerProxyTx = await ethers.provider.getTransaction(gerDeploymentResult.txHashes.proxy);
            if (gerProxyTx) {
                const gerStorageWrites = await getTraceStorageWrites(gerDeploymentResult.txHashes.proxy);
                const depthGerStorageWrites = 1;
                storageModifications.GlobalExitRootManagerL2SovereignChain = gerStorageWrites[depthGerStorageWrites];
            }
        } catch (error) {
            logger.error('Could not get GER proxy storage writes:', error);
        }
    }

    // Get storage modifications for GER Manager implementation
    if (gerDeploymentResult.txHashes.implementation) {
        logger.info('Getting storage modifications for GER Manager implementation...');
        try {
            const gerImplTx = await ethers.provider.getTransaction(gerDeploymentResult.txHashes.implementation);
            if (gerImplTx) {
                const gerImplStorageWrites = await getTraceStorageWrites(gerDeploymentResult.txHashes.implementation);
                const depthGerImplStorageWrites = 1;
                storageModifications.GlobalExitRootManagerL2SovereignChain_Implementation =
                    gerImplStorageWrites[depthGerImplStorageWrites];
            }
        } catch (error) {
            logger.error('Could not get GER implementation storage writes:', error);
        }
    }

    // Get storage modifications for GER Manager initialization
    if (txInitializeGer) {
        logger.info('Getting storage modifications for GER Manager initialization...');
        try {
            const gerInitTx = await ethers.provider.getTransaction(txInitializeGer.hash);
            if (gerInitTx) {
                const gerInitStorageWrites = await getTraceStorageWrites(txInitializeGer.hash);
                const depthGerInitStorageWrites = 2;
                storageModifications.GlobalExitRootManagerL2SovereignChain_Initialization =
                    gerInitStorageWrites[depthGerInitStorageWrites];
            }
        } catch (error) {
            logger.error('Could not get GER initialization storage writes:', error);
        }
    }

    // Get storage modifications for Timelock contract
    logger.info('Getting storage modifications for Timelock contract...');
    const timelockStorageWrites = await getTraceStorageWrites(txDeployTimelockHash);
    const depthTimelockStorageWrites = 1;
    storageModifications.PolygonZkEVMTimelock = timelockStorageWrites[depthTimelockStorageWrites];

    // Output the storage modifications JSON
    logger.info('Writing storage modifications JSON to file...');
    await fs.writeFileSync(
        path.join(__dirname, '../../tools/createSovereignGenesisHardhat/storageMofifications.json'),
        JSON.stringify(storageModifications, null, 2),
    );

    /// /////////////////////////////////////////////////
    ///   BUILD EXPECTED STORAGE MODIFICATIONS JSON   ///
    /// /////////////////////////////////////////////////

    const expectedStorageModifications: { [key: string]: any } = {};
    // BridgeL2SovereignChain Proxy
    expectedStorageModifications.BridgeL2SovereignChain = await getExpectedStorageProxy(
        sovereignChainBridgeContract.target,
    );
    // Bridge initialitzation
    expectedStorageModifications.BridgeL2SovereignChain_Initialization = getExpectedStorageBridge(
        initializeParams,
        gerManagerContract.target,
    );
    // BridgeL2SovereignChain Implementation --> TokenWrappedBridgeUpgradeable
    expectedStorageModifications.TokenWrappedBridgeUpgradeable_Implementation = {};
    expectedStorageModifications.TokenWrappedBridgeUpgradeable_Implementation[
        STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.INITIALIZER
    ] = ethers.zeroPadValue('0xffffffffffffffff', 32);
    if (
        gasTokenAddress !== ethers.ZeroAddress &&
        ethers.isAddress(gasTokenAddress) &&
        (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress))
    ) {
        // Add proxy WETH
        const wethAddressProxy = await sovereignChainBridgeContract.WETHToken();
        expectedStorageModifications.TokenWrappedBridgeUpgradeable = {};
        expectedStorageModifications.TokenWrappedBridgeUpgradeable[STORAGE_GENESIS.STORAGE_PROXY.IMPLEMENTATION] =
            ethers.zeroPadValue(tokenWrappedAddress, 32);
        const adminWethProxy = await upgrades.erc1967.getAdminAddress(wethAddressProxy as string);
        expectedStorageModifications.TokenWrappedBridgeUpgradeable[STORAGE_GENESIS.STORAGE_PROXY.ADMIN] =
            ethers.zeroPadValue(adminWethProxy, 32);
    }
    // BridgeL2SovereignChain Implementation --> PolygonZkEVMBridgeV2
    expectedStorageModifications.BridgeL2SovereignChain_Implementation = {};
    expectedStorageModifications.BridgeL2SovereignChain_Implementation[
        STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN_IMPLEMENTATION.INITIALIZER
    ] = ethers.zeroPadValue('0xff', 32);
    // GlobalExitRootManagerL2SovereignChain Proxy
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain = await getExpectedStorageProxy(
        gerManagerContract.target,
    );
    // GER Implementation --> PolygonZkEVMGlobalExitRootL2
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain_Implementation = {};
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain_Implementation[
        STORAGE_GENESIS.STORAGE_GER_SOVEREIGN_IMPLEMENTATION.INITIALIZER_POLYGON_GER_L2
    ] = ethers.zeroPadValue('0xff', 32);
    // GER initialitzation
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain_Initialization =
        getExpectedStorageGERManagerL2SovereignChain(initializeParams);
    // PolygonZkEVMTimelock
    expectedStorageModifications.PolygonZkEVMTimelock = getExpectedStoragePolygonZkEVMTimelock(timelockMinDelay);
    await fs.writeFileSync(
        path.join(__dirname, '../../tools/createSovereignGenesisHardhat/expectedStorageModifications.json'),
        JSON.stringify(expectedStorageModifications, null, 2),
    );

    /// //////////////////////////////
    ///   CHECK ACTUAL STORAGE    ///
    /// /////////////////////////////
    logger.info('\n=== CHECKING STORAGE MODIFICATIONS ===');
    logger.info('Checking BridgeL2SovereignChain storage modifications...');

    const actualStorage: { [key: string]: any } = {};
    // BridgeL2SovereignChain
    actualStorage.BridgeL2SovereignChain = await getActualStorage(
        storageModifications.BridgeL2SovereignChain,
        sovereignChainBridgeContract.target,
    );
    actualStorage.BridgeL2SovereignChain_Initialization = await getActualStorage(
        storageModifications.BridgeL2SovereignChain_Initialization,
        sovereignChainBridgeContract.target,
    );
    actualStorage.BridgeL2SovereignChain_Implementation = await getActualStorage(
        storageModifications.BridgeL2SovereignChain_Implementation,
        await upgrades.erc1967.getImplementationAddress(sovereignChainBridgeContract.target),
    );
    actualStorage.TokenWrappedBridgeUpgradeable_Implementation = await getActualStorage(
        storageModifications.TokenWrappedBridgeUpgradeable_Implementation,
        tokenWrappedAddress,
    );
    if (
        gasTokenAddress !== ethers.ZeroAddress &&
        ethers.isAddress(gasTokenAddress) &&
        (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress))
    ) {
        const wethAddressProxy = await sovereignChainBridgeContract.WETHToken();
        actualStorage.TokenWrappedBridgeUpgradeable = await getActualStorage(
            storageModifications.TokenWrappedBridgeUpgradeable,
            wethAddressProxy,
        );
    }
    // GlobalExitRootManagerL2SovereignChain
    actualStorage.GlobalExitRootManagerL2SovereignChain = await getActualStorage(
        storageModifications.GlobalExitRootManagerL2SovereignChain,
        gerManagerContract.target,
    );
    actualStorage.GlobalExitRootManagerL2SovereignChain_Initialization = await getActualStorage(
        storageModifications.GlobalExitRootManagerL2SovereignChain_Initialization,
        gerManagerContract.target,
    );
    actualStorage.GlobalExitRootManagerL2SovereignChain_Implementation = await getActualStorage(
        storageModifications.GlobalExitRootManagerL2SovereignChain_Implementation,
        await upgrades.erc1967.getImplementationAddress(gerManagerContract.target),
    );
    // PolygonZkEVMTimelock
    actualStorage.PolygonZkEVMTimelock = await getActualStorage(
        storageModifications.PolygonZkEVMTimelock,
        timelockContract.target,
    );

    await fs.writeFileSync(
        path.join(__dirname, '../../tools/createSovereignGenesisHardhat/actualStorage.json'),
        JSON.stringify(actualStorage, null, 2),
    );

    let equal = await deepEqual(actualStorage, expectedStorageModifications);
    if (!equal) {
        throw new Error('Actual storage does not match expected storage');
    } else {
        logger.info('Actual storage matches expected storage');
    }
    equal = await deepEqual(storageModifications, expectedStorageModifications);
    if (!equal) {
        throw new Error('Storage modifications does not match expected storage');
    } else {
        logger.info('Storage modifications matches expected storage');
    }

    /// ///////////////////////////
    ///   BUILD GENESIS FILE   ///
    /// ///////////////////////////
    logger.info('=== BUILD GENESIS FILE ===');

    const newGenesis = _genesisBase;

    /// /////////////////////////
    /// BRIDGE IMPLEMENTATION ///
    /// /////////////////////////
    logger.info('Updating BridgeL2SovereignChain implementation in genesis file...');
    // Get genesis info for bridge implementation
    const bridgeL2SovereignChainImplementation = newGenesis.genesis.find(function (obj) {
        return supportedBridgeContracts.includes(obj.contractName);
    });
    // Update the contract name and bytecode
    bridgeL2SovereignChainImplementation.contractName = GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_IMPLEMENTATION;
    bridgeL2SovereignChainImplementation.bytecode = ethers.provider.getCode(
        await upgrades.erc1967.getImplementationAddress(sovereignChainBridgeContract.target),
    );
    // Update the storage and nonce
    bridgeL2SovereignChainImplementation.storage = storageModifications.BridgeL2SovereignChain_Implementation;
    bridgeL2SovereignChainImplementation.nonce = await ethers.provider.getTransactionCount(
        await upgrades.erc1967.getImplementationAddress(sovereignChainBridgeContract.target),
    );

    /// /////////////////////////
    /// BRIDGE PROXY ////////////
    /// /////////////////////////
    logger.info('Updating BridgeL2SovereignChain proxy in genesis file...');
    // Replace old bridge with new bridge proxy
    const bridgeL2SovereignChain = newGenesis.genesis.find(function (obj) {
        return supportedBridgeContractsProxy.includes(obj.contractName);
    });
    // Update the contract name, storage and nonce
    bridgeL2SovereignChain.contractName = GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_PROXY;
    bridgeL2SovereignChain.storage = {
        ...storageModifications.BridgeL2SovereignChain,
        ...storageModifications.BridgeL2SovereignChain_Initialization,
    };
    bridgeL2SovereignChain.nonce = await ethers.provider.getTransactionCount(sovereignChainBridgeContract.target);

    /// /////////////////////////
    /// GER IMPLEMENTATION //////
    /// /////////////////////////
    logger.info('Updating GlobalExitRootManagerL2SovereignChain implementation in genesis file...');
    const gerManagerL2SovereignChainImplementation = newGenesis.genesis.find(function (obj) {
        return supportedGERManagers.includes(obj.contractName);
    });
    gerManagerL2SovereignChainImplementation.contractName = GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_IMPLEMENTATION;
    gerManagerL2SovereignChainImplementation.bytecode = ethers.provider.getCode(
        await upgrades.erc1967.getImplementationAddress(gerManagerContract.target),
    );
    gerManagerL2SovereignChainImplementation.storage =
        storageModifications.GlobalExitRootManagerL2SovereignChain_Implementation;
    gerManagerL2SovereignChainImplementation.nonce = await ethers.provider.getTransactionCount(
        await upgrades.erc1967.getImplementationAddress(gerManagerContract.target),
    );

    /// /////////////////////////
    /// GER PROXY ///////////////
    /// /////////////////////////
    logger.info('Updating GlobalExitRootManagerL2SovereignChain proxy in genesis file...');
    const gerManagerL2SovereignChain = newGenesis.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.GER_L2_PROXY;
    });
    gerManagerL2SovereignChain.contractName = GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY;
    gerManagerL2SovereignChain.storage = {
        ...storageModifications.GlobalExitRootManagerL2SovereignChain,
        ...storageModifications.GlobalExitRootManagerL2SovereignChain_Initialization,
    };
    gerManagerL2SovereignChain.nonce = await ethers.provider.getTransactionCount(gerManagerContract.target);

    /// /////////////////////////
    /// BYTECODE STORER /////////
    /// /////////////////////////
    logger.info('Updating BytecodeStorer in genesis file...');
    const bytecodeStorer = newGenesis.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.BYTECODE_STORER;
    });
    const bytecodeStorerAddress = await sovereignChainBridgeContract.wrappedTokenBytecodeStorer();
    const bytecodeStorerDeployedBytecode = await ethers.provider.getCode(bytecodeStorerAddress);

    // If its not contained add it to the genesis
    if (typeof bytecodeStorer === 'undefined') {
        const bytecodeStorerGenesis = {
            contractName: GENESIS_CONTRACT_NAMES.BYTECODE_STORER,
            balance: '0',
            nonce: '1',
            address: bytecodeStorerAddress,
            bytecode: bytecodeStorerDeployedBytecode,
        };
        newGenesis.genesis.push(bytecodeStorerGenesis);
    } else {
        bytecodeStorer.address = bytecodeStorerAddress;
        // Check bytecode of the BytecodeStorer contract is the same as the one in the genesis
        expect(bytecodeStorer.bytecode).to.equal(bytecodeStorerDeployedBytecode);
    }

    /// ////////////////////////////////
    /// TOKEN WRAPPED IMPL ///////////
    /// ///////////////////////////////
    logger.info('Updating TokenWrappedBridgeUpgradeable implementation in genesis file...');
    const tokenWrapped = newGenesis.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION;
    });
    const tokenWrappedDeployedBytecode = await ethers.provider.getCode(tokenWrappedAddress);
    // If its not contained add it to the genesis
    if (typeof tokenWrapped === 'undefined') {
        const tokenWrappedGenesis = {
            contractName: GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION,
            balance: '0',
            nonce: '1',
            address: tokenWrappedAddress,
            bytecode: tokenWrappedDeployedBytecode,
        };
        tokenWrappedGenesis.storage = storageModifications.TokenWrappedBridgeUpgradeable;
        newGenesis.genesis.push(tokenWrappedGenesis);
    } else {
        // Check bytecode of the TokenWrapped contract is the same as the one in the genesis
        expect(tokenWrapped.bytecode).to.equal(tokenWrappedDeployedBytecode);
        // Update the address and storage
        tokenWrapped.address = tokenWrappedAddress;
    }

    /// ////////////////////////////////
    /// TOKEN WRAPPED PROXY ///////////
    /// ///////////////////////////////
    logger.info('Updating TokenWrappedBridgeUpgradeable proxy in genesis file...');
    // If bridge initialized with a zero sovereign weth address and a non zero gas token, we should add created erc20 weth contract implementation and proxy to the genesis
    let wethAddress;
    const WETHProxyContractName = GENESIS_CONTRACT_NAMES.WETH_PROXY;
    if (
        gasTokenAddress !== ethers.ZeroAddress &&
        ethers.isAddress(gasTokenAddress) &&
        (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress))
    ) {
        // Add proxy
        wethAddress = ethers.zeroPadValue(
            bridgeL2SovereignChain.storage['0x000000000000000000000000000000000000000000000000000000000000006f'],
            20,
        );
        const wethGenesisProxy = {
            contractName: WETHProxyContractName,
            balance: '0',
            nonce: '1',
            address: wethAddress,
            bytecode: await ethers.provider.getCode(wethAddress),
        };
        newGenesis.genesis.push(wethGenesisProxy);

        // Check implementation
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const _IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
        const wethGenesisImplementationAddress = wethGenesisProxy.storage[_IMPLEMENTATION_SLOT];
        expect(wethGenesisImplementationAddress).to.equal(tokenWrappedAddress.toLocaleLowerCase());
    }

    // switch network previous network
    await hre.switchNetwork(previousNetwork);

    return newGenesis;
}

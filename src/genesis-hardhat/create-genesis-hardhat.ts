import path = require('path');
import fs = require('fs');
import hre, { ethers, upgrades, hardhatArguments } from 'hardhat';
import { expect } from 'chai';
import {
    AggOracleCommittee,
    BridgeL2SovereignChain,
    GlobalExitRootManagerL2SovereignChain,
} from '../../typechain-types';
import { GENESIS_CONTRACT_NAMES, SUPPORTED_BRIDGE_CONTRACTS_PROXY } from './constants';
import {
    getAddressesGenesisBase,
    getMinDelayTimelock,
    getExpectedStorageProxy,
    getExpectedStorageBridge,
    getExpectedStoragePolygonZkEVMTimelock,
    getExpectedStorageGERManagerL2SovereignChain,
    getActualStorage,
    deepEqual,
    getExpectedStorageTokenWrappedBridgeUpgradeable,
    updateExpectedStorageBridgeToken,
    getExpectedStorageAggOracleCommittee,
    checkExpectedStorageLength,
    buildGenesis,
    deployBridgeL2SovereignChain,
    deployGlobalExitRootManagerL2SovereignChain,
    deployAggOracleCommittee,
} from './utils';
import { checkParams, getTraceStorageWrites } from '../utils';
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
    let isDebug = false;
    if (config && config.debug) {
        isDebug = config.debug;
    }
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
        'globalExitRootRemover',
        'emergencyBridgePauser',
        'emergencyBridgeUnpauser',
        'proxiedTokensManager',
        'useAggOracleCommittee',
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

    // Load deployer
    await ethers.provider.send('hardhat_impersonateAccount', [timelockOwner]);
    await ethers.provider.send('hardhat_setBalance', [timelockOwner, '0xffffffffffffffff']); // 18 ethers aprox
    const deployer = await ethers.getSigner(timelockOwner);

    // deploy timelock
    const timelockContractFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK, deployer);
    const timelock = await timelockContractFactory.deploy(
        timelockMinDelay,
        [deployer],
        [deployer],
        deployer,
        ethers.ZeroAddress, // PolygonRollupManager address not needed in L2
    );
    const txDeployTimelock = await timelock.deploymentTransaction();
    const txDeployTimelockHash = txDeployTimelock ? txDeployTimelock.hash : undefined;

    const timelockContractAddress = timelock.target.toString().toLowerCase();

    // Deploy proxyAdmin
    const ProxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        deployer,
    );
    const proxyAdmin = await ProxyAdminFactory.deploy(timelockContractAddress);
    const deployAdminTx = proxyAdmin.deploymentTransaction();
    await deployAdminTx?.wait();
    const proxyAdminAddress = proxyAdmin.target.toString().toLowerCase();

    // deploy BridgeL2SovereignChain
    const bridgeDeploymentResult = await deployBridgeL2SovereignChain(proxyAdmin, deployer);
    const sovereignChainBridgeContract = (await ethers.getContractAt(
        GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE,
        bridgeDeploymentResult.proxy,
        deployer,
    )) as unknown as BridgeL2SovereignChain;

    // Get addresses from bridge deployment
    const bridgeProxyAddress = bridgeDeploymentResult.proxy;
    const bridgeImplAddress = bridgeDeploymentResult.implementation;
    const tokenWrappedAddress = (
        await sovereignChainBridgeContract.getWrappedTokenBridgeImplementation()
    ).toLocaleLowerCase();
    const bridgeLibAddress = (await sovereignChainBridgeContract.bridgeLib()).toLowerCase();

    // deploy GlobalExitRootManagerL2SovereignChain
    const gerDeploymentResult = await deployGlobalExitRootManagerL2SovereignChain(
        proxyAdmin,
        deployer,
        genesisBaseAddresses.bridgeProxyAddress, // Constructor arguments
    );

    const gerManagerContract = (await ethers.getContractAt(
        GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN,
        gerDeploymentResult.proxy,
    )) as unknown as GlobalExitRootManagerL2SovereignChain;

    // Get addresses from ger deployment
    const gerProxyAddress = gerDeploymentResult.proxy;
    const gerImplAddress = gerDeploymentResult.implementation;

    /// ///////////////////////////////////
    ///   DEPLOY AGGORACLE COMMITTEE   ////
    /// ///////////////////////////////////

    let globalExitRootUpdater;
    let aggOracleImplementationAddress;
    let aggOracleCommitteeAddress;
    let aggOracleCommitteeContract;
    let aggOracleCommitteeDeploymentResult;
    let txInitializeAggOracleCommittee;

    if (initializeParams.useAggOracleCommittee === true) {
        checkParams(initializeParams, ['aggOracleCommittee', 'quorum', 'aggOracleOwner']);
        // deploy AggOracleCommittee
        aggOracleCommitteeDeploymentResult = await deployAggOracleCommittee(proxyAdmin, deployer, gerProxyAddress);
        aggOracleCommitteeContract = (await ethers.getContractAt(
            GENESIS_CONTRACT_NAMES.AGGORACLE_COMMITTEE,
            aggOracleCommitteeDeploymentResult.proxy,
        )) as unknown as AggOracleCommittee;
        aggOracleCommitteeAddress = aggOracleCommitteeDeploymentResult.proxy;
        aggOracleImplementationAddress = aggOracleCommitteeDeploymentResult.implementation;

        initializeParams.globalExitRootUpdater = aggOracleCommitteeAddress;
        globalExitRootUpdater = aggOracleCommitteeAddress;

        /// ///////////////////////////////////////
        ///   INITIALIZE AGGORACLE COMMITTEE   ///
        /// //////////////////////////////////////
        txInitializeAggOracleCommittee = await aggOracleCommitteeContract.initialize(
            initializeParams.aggOracleOwner,
            initializeParams.aggOracleCommittee,
            initializeParams.quorum,
        );
    } else {
        checkParams(initializeParams, ['globalExitRootUpdater']);
        globalExitRootUpdater = initializeParams.globalExitRootUpdater;
    }

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
        globalExitRootRemover,
        emergencyBridgePauser,
        emergencyBridgeUnpauser,
        proxiedTokensManager,
    } = initializeParams;

    const txInitializeBridge = await sovereignChainBridgeContract.initialize(
        rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        genesisBaseAddresses.gerManagerProxyAddress, // Global exit root manager address from base genesis
        ethers.ZeroAddress, // Polygon rollup manager address always zero for sovereign chains
        gasTokenMetadata,
        bridgeManager,
        sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable,
        emergencyBridgePauser,
        emergencyBridgeUnpauser,
        proxiedTokensManager,
    );

    const WETHTokenAddress = (await sovereignChainBridgeContract.WETHToken()).toLowerCase();

    logger.info('Initializing GlobalExitRootManagerL2SovereignChain contract...');
    // Initialize the GlobalExitRootManagerL2SovereignChain contract
    const txInitializeGer = await gerManagerContract.initialize(globalExitRootUpdater, globalExitRootRemover);

    /// /////////////////////////////////
    ///   SANITY CHECKS DEPLOYMENT   ///
    /// /////////////////////////////////

    // Check admin of the proxy is the same in the bridge and the GER manager
    const adminBridge = await upgrades.erc1967.getAdminAddress(bridgeProxyAddress as string);
    const adminGerManager = await upgrades.erc1967.getAdminAddress(gerProxyAddress as string);
    expect(proxyAdminAddress).to.equal(adminGerManager.toLowerCase());
    expect(proxyAdminAddress).to.equal(adminBridge.toLowerCase());

    // Check initialize params bridge
    expect(rollupID).to.equal(await sovereignChainBridgeContract.networkID());
    expect(genesisBaseAddresses.gerManagerProxyAddress.toLowerCase()).to.equal(
        (await sovereignChainBridgeContract.globalExitRootManager()).toLowerCase(),
    );

    // Check initialize params GER
    expect(globalExitRootUpdater.toLowerCase()).to.equal(
        (await gerManagerContract.globalExitRootUpdater()).toLowerCase(),
    );
    expect(globalExitRootRemover.toLowerCase()).to.equal(
        (await gerManagerContract.globalExitRootRemover()).toLowerCase(),
    );

    // Check AggOracleCommittee params
    if (initializeParams.useAggOracleCommittee === true) {
        expect(initializeParams.aggOracleOwner).to.equal(await aggOracleCommitteeContract.owner());
        expect(initializeParams.quorum).to.equal(await aggOracleCommitteeContract.quorum());
    }

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

    // Get storage modifications Timelock
    await checkExpectedStorageLength(txDeployTimelockHash, 1);
    const timelockStorageWrites = await getTraceStorageWrites(txDeployTimelockHash, timelockContractAddress);
    storageModifications.PolygonZkEVMTimelock = timelockStorageWrites;

    // Get storage modifications for ProxyAdmin
    await checkExpectedStorageLength(deployAdminTx?.hash, 1);
    const proxyAdminStorageWrites = await getTraceStorageWrites(deployAdminTx?.hash, proxyAdminAddress);
    storageModifications.ProxyAdmin = proxyAdminStorageWrites;

    // Get storage modifications for Bridge contract
    logger.info('Getting storage modifications for Bridge contract...');
    await checkExpectedStorageLength(bridgeDeploymentResult.txHashes.proxy, 1);
    const bridgeStorageWrites = await getTraceStorageWrites(bridgeDeploymentResult.txHashes.proxy, bridgeProxyAddress);
    storageModifications.BridgeL2SovereignChain = bridgeStorageWrites;

    // Get storage modifications for Bridge implementation
    if (bridgeDeploymentResult.txHashes.implementation) {
        logger.info('Getting storage modifications for Bridge implementation...');
        try {
            const implTx = await ethers.provider.getTransaction(bridgeDeploymentResult.txHashes.implementation);
            if (implTx) {
                await checkExpectedStorageLength(bridgeDeploymentResult.txHashes.implementation, 2);
                const implStorageWrites = await getTraceStorageWrites(bridgeDeploymentResult.txHashes.implementation);
                storageModifications.BridgeL2SovereignChain_Implementation = implStorageWrites[bridgeImplAddress];
                storageModifications.TokenWrappedBridgeUpgradeable_Implementation =
                    implStorageWrites[tokenWrappedAddress];
            }
        } catch (error) {
            logger.error('Could not get Bridge implementation storage writes:', error);
        }
    }
    // Get storage modifications for Bridge initialization
    if (txInitializeBridge) {
        logger.info('Getting storage modifications for Bridge initialization...');
        try {
            const initTx = await ethers.provider.getTransaction(txInitializeBridge.hash);
            if (initTx) {
                const initStorageWrites = await getTraceStorageWrites(txInitializeBridge.hash);
                storageModifications.BridgeL2SovereignChain_Initialization = initStorageWrites[bridgeProxyAddress];
                if (gasTokenAddress !== ethers.ZeroAddress && ethers.isAddress(gasTokenAddress)) {
                    await checkExpectedStorageLength(txInitializeBridge.hash, 2);
                    storageModifications.TokenWrappedBridgeUpgradeable = initStorageWrites[WETHTokenAddress];
                } else {
                    await checkExpectedStorageLength(txInitializeBridge.hash, 1);
                }
            }
        } catch (error) {
            logger.error('Could not get Bridge initialization storage writes:', error);
        }
    }

    if (aggOracleCommitteeDeploymentResult) {
        if (aggOracleCommitteeDeploymentResult.txHashes.implementation) {
            logger.info('Getting storage modifications for Bridge implementation...');
            try {
                const implTx = await ethers.provider.getTransaction(
                    aggOracleCommitteeDeploymentResult.txHashes.implementation,
                );
                if (implTx) {
                    await checkExpectedStorageLength(aggOracleCommitteeDeploymentResult.txHashes.implementation, 1);
                    const implStorageWrites = await getTraceStorageWrites(
                        aggOracleCommitteeDeploymentResult.txHashes.implementation,
                        aggOracleImplementationAddress,
                    );
                    storageModifications.AggOracleCommittee_Implementation = implStorageWrites;
                }
            } catch (error) {
                logger.error('Could not get Bridge implementation storage writes:', error);
            }
        }
        if (aggOracleCommitteeDeploymentResult.txHashes.proxy) {
            logger.info('Getting storage modifications for Bridge proxy...');
            try {
                const implTx = await ethers.provider.getTransaction(aggOracleCommitteeDeploymentResult.txHashes.proxy);
                if (implTx) {
                    await checkExpectedStorageLength(aggOracleCommitteeDeploymentResult.txHashes.proxy, 1);
                    const implStorageWrites = await getTraceStorageWrites(
                        aggOracleCommitteeDeploymentResult.txHashes.proxy,
                        aggOracleCommitteeAddress,
                    );
                    storageModifications.AggOracleCommittee = implStorageWrites;
                }
            } catch (error) {
                logger.error('Could not get Bridge proxy storage writes:', error);
            }
        }
        if (txInitializeAggOracleCommittee) {
            logger.info('Getting storage modifications for AggOracle initialization...');
            try {
                const initTx = await ethers.provider.getTransaction(txInitializeAggOracleCommittee.hash);
                if (initTx) {
                    await checkExpectedStorageLength(txInitializeAggOracleCommittee.hash, 1);
                    const initStorageWrites = await getTraceStorageWrites(
                        txInitializeAggOracleCommittee.hash,
                        aggOracleCommitteeAddress,
                    );
                    storageModifications.AggOracleCommittee_Initialization = initStorageWrites;
                }
            } catch (error) {
                logger.error('Could not get AggOracle initialization storage writes:', error);
            }
        }
    }
    // Get storage modifications for GER Manager contract
    logger.info('Getting storage modifications for GER Manager contract...');
    if (gerDeploymentResult.txHashes.proxy) {
        try {
            const gerProxyTx = await ethers.provider.getTransaction(gerDeploymentResult.txHashes.proxy);
            if (gerProxyTx) {
                await checkExpectedStorageLength(gerDeploymentResult.txHashes.proxy, 1);
                const gerStorageWrites = await getTraceStorageWrites(
                    gerDeploymentResult.txHashes.proxy,
                    gerProxyAddress,
                );
                storageModifications.GlobalExitRootManagerL2SovereignChain = gerStorageWrites;
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
                await checkExpectedStorageLength(gerDeploymentResult.txHashes.implementation, 1);
                const gerImplStorageWrites = await getTraceStorageWrites(
                    gerDeploymentResult.txHashes.implementation,
                    gerImplAddress,
                );
                storageModifications.GlobalExitRootManagerL2SovereignChain_Implementation = gerImplStorageWrites;
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
                await checkExpectedStorageLength(txInitializeGer.hash, 1);
                const gerInitStorageWrites = await getTraceStorageWrites(txInitializeGer.hash, gerProxyAddress);
                storageModifications.GlobalExitRootManagerL2SovereignChain_Initialization = gerInitStorageWrites;
            }
        } catch (error) {
            logger.error('Could not get GER initialization storage writes:', error);
        }
    }

    /// /////////////////////////////////////////////////
    ///   BUILD EXPECTED STORAGE MODIFICATIONS JSON   ///
    /// /////////////////////////////////////////////////

    logger.info('Getting expected storage modifications...');

    const expectedStorageModifications: { [key: string]: any } = {};
    // PolygonZkEVMTimelock
    expectedStorageModifications.PolygonZkEVMTimelock = getExpectedStoragePolygonZkEVMTimelock(
        timelockMinDelay,
        timelockContractAddress,
        deployer.address,
    );

    // ProxyAdmin
    expectedStorageModifications.ProxyAdmin = {};
    expectedStorageModifications.ProxyAdmin[STORAGE_GENESIS.STORAGE_PROXY_ADMIN.OWNER] = ethers.zeroPadValue(
        timelockContractAddress,
        32,
    );

    // BridgeL2SovereignChain Proxy
    expectedStorageModifications.BridgeL2SovereignChain = await getExpectedStorageProxy(bridgeProxyAddress);
    // Bridge initialization
    expectedStorageModifications.BridgeL2SovereignChain_Initialization = getExpectedStorageBridge(
        initializeParams,
        genesisBaseAddresses.gerManagerProxyAddress,
    );
    // BridgeL2SovereignChain Implementation --> TokenWrappedBridgeUpgradeable
    expectedStorageModifications.TokenWrappedBridgeUpgradeable_Implementation = {};
    expectedStorageModifications.TokenWrappedBridgeUpgradeable_Implementation[
        STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.INITIALIZER
    ] = ethers.zeroPadValue('0xffffffffffffffff', 32);
    if (gasTokenAddress !== ethers.ZeroAddress && ethers.isAddress(gasTokenAddress)) {
        expectedStorageModifications.BridgeL2SovereignChain_Initialization[
            STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.GAS_TOKEN_ADDRESS
        ] = ethers.zeroPadValue(gasTokenAddress, 32);
        if (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress)) {
            // Add proxy WETH
            const tokenStorage = await getExpectedStorageTokenWrappedBridgeUpgradeable(
                sovereignChainBridgeContract,
                tokenWrappedAddress,
            );
            expectedStorageModifications.TokenWrappedBridgeUpgradeable = tokenStorage;
            // Add WETH to bridge storage
            updateExpectedStorageBridgeToken(
                expectedStorageModifications.BridgeL2SovereignChain_Initialization,
                sovereignChainBridgeContract,
                gasTokenMetadata,
            );
        }
    }
    // BridgeL2SovereignChain Implementation --> PolygonZkEVMBridgeV2
    expectedStorageModifications.BridgeL2SovereignChain_Implementation = {};
    expectedStorageModifications.BridgeL2SovereignChain_Implementation[
        STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN_IMPLEMENTATION.INITIALIZER
    ] = ethers.zeroPadValue('0xff', 32);
    // If useCommittee is true, add AggOracleCommittee storage
    if (initializeParams.useAggOracleCommittee === true) {
        expectedStorageModifications.AggOracleCommittee_Implementation = {};
        expectedStorageModifications.AggOracleCommittee_Implementation[
            STORAGE_GENESIS.STORAGE_AGG_ORACLE_COMMITTEE_IMPLEMENTATION.INITIALIZER
        ] = ethers.zeroPadValue('0xffffffffffffffff', 32);
        expectedStorageModifications.AggOracleCommittee_Initialization = await getExpectedStorageAggOracleCommittee(
            initializeParams,
            aggOracleCommitteeContract,
        );
        expectedStorageModifications.AggOracleCommittee = await getExpectedStorageProxy(aggOracleCommitteeAddress);
    }
    // GlobalExitRootManagerL2SovereignChain Proxy
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain = await getExpectedStorageProxy(gerProxyAddress);
    // GER Implementation --> PolygonZkEVMGlobalExitRootL2
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain_Implementation = {};
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain_Implementation[
        STORAGE_GENESIS.STORAGE_GER_SOVEREIGN_IMPLEMENTATION.INITIALIZER_POLYGON_GER_L2
    ] = ethers.zeroPadValue('0xff', 32);
    // GER initialization
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain_Initialization =
        getExpectedStorageGERManagerL2SovereignChain(initializeParams);

    /// //////////////////////////////
    ///   CHECK ACTUAL STORAGE    ///
    /// /////////////////////////////

    logger.info('Getting actual storage...');

    const actualStorage: { [key: string]: any } = {};
    // ProxyAdmin
    actualStorage.ProxyAdmin = await getActualStorage(storageModifications.ProxyAdmin, proxyAdminAddress);
    // BridgeL2SovereignChain
    actualStorage.BridgeL2SovereignChain = await getActualStorage(
        storageModifications.BridgeL2SovereignChain,
        bridgeProxyAddress,
    );
    actualStorage.BridgeL2SovereignChain_Initialization = await getActualStorage(
        storageModifications.BridgeL2SovereignChain_Initialization,
        bridgeProxyAddress,
    );
    actualStorage.BridgeL2SovereignChain_Implementation = await getActualStorage(
        storageModifications.BridgeL2SovereignChain_Implementation,
        await upgrades.erc1967.getImplementationAddress(bridgeProxyAddress),
    );
    actualStorage.TokenWrappedBridgeUpgradeable_Implementation = await getActualStorage(
        storageModifications.TokenWrappedBridgeUpgradeable_Implementation,
        tokenWrappedAddress,
    );
    if (initializeParams.useAggOracleCommittee === true) {
        actualStorage.AggOracleCommittee_Implementation = await getActualStorage(
            storageModifications.AggOracleCommittee_Implementation,
            aggOracleImplementationAddress,
        );
        actualStorage.AggOracleCommittee = await getActualStorage(
            storageModifications.AggOracleCommittee,
            aggOracleCommitteeAddress,
        );
    }
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
    // AggOracleCommittee
    if (initializeParams.useAggOracleCommittee === true) {
        actualStorage.AggOracleCommittee_Initialization = await getActualStorage(
            storageModifications.AggOracleCommittee_Initialization,
            aggOracleCommitteeAddress,
        );
        actualStorage.AggOracleCommittee = await getActualStorage(
            storageModifications.AggOracleCommittee,
            aggOracleCommitteeAddress,
        );
        actualStorage.AggOracleCommittee_Implementation = await getActualStorage(
            storageModifications.AggOracleCommittee_Implementation,
            aggOracleImplementationAddress,
        );
    }

    // GlobalExitRootManagerL2SovereignChain
    actualStorage.GlobalExitRootManagerL2SovereignChain = await getActualStorage(
        storageModifications.GlobalExitRootManagerL2SovereignChain,
        gerProxyAddress,
    );
    actualStorage.GlobalExitRootManagerL2SovereignChain_Initialization = await getActualStorage(
        storageModifications.GlobalExitRootManagerL2SovereignChain_Initialization,
        gerProxyAddress,
    );
    actualStorage.GlobalExitRootManagerL2SovereignChain_Implementation = await getActualStorage(
        storageModifications.GlobalExitRootManagerL2SovereignChain_Implementation,
        gerImplAddress,
    );
    // PolygonZkEVMTimelock
    actualStorage.PolygonZkEVMTimelock = await getActualStorage(
        storageModifications.PolygonZkEVMTimelock,
        timelockContractAddress,
    );

    if (isDebug) {
        logger.info('**DEBUG**: Writing actual storage JSON to file...');
        await fs.writeFileSync(
            path.join(__dirname, '../../tools/createSovereignGenesisHardhat/actualStorage.json'),
            JSON.stringify(actualStorage, null, 2),
        );
        logger.info('**DEBUG**: Writing expected storage modifications JSON to file...');
        await fs.writeFileSync(
            path.join(__dirname, '../../tools/createSovereignGenesisHardhat/expectedStorageModifications.json'),
            JSON.stringify(expectedStorageModifications, null, 2),
        );
        logger.info('**DEBUG**: Writing storage modifications JSON to file...');
        await fs.writeFileSync(
            path.join(__dirname, '../../tools/createSovereignGenesisHardhat/storageModifications.json'),
            JSON.stringify(storageModifications, null, 2),
        );
    }

    let equal = deepEqual(storageModifications, expectedStorageModifications);
    if (!equal) {
        throw new Error('Storage modifications does not match expected storage');
    } else {
        logger.info('Storage modifications matches expected storage');
    }
    equal = deepEqual(actualStorage, expectedStorageModifications);
    if (!equal) {
        throw new Error('Actual storage does not match expected storage');
    } else {
        logger.info('Actual storage matches expected storage');
    }

    logger.info('Writing storage modifications JSON to file...');
    await fs.writeFileSync(
        path.join(__dirname, '../../tools/createSovereignGenesisHardhat/storageModifications.json'),
        JSON.stringify(storageModifications, null, 2),
    );

    /// ///////////////////////////
    ///   BUILD GENESIS FILE   ///
    /// ///////////////////////////
    logger.info('=== BUILD GENESIS FILE ===');

    const genesisInfo = [];

    /// /////////////////////
    /// POLYGON TIMELOCK ////
    /// /////////////////////
    logger.info('Updating Polygon Timelock in genesis file...');
    // Get genesis info for bridge implementation
    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK,
        address: timelockContractAddress,
        storage: storageModifications.PolygonZkEVMTimelock,
    });

    /// ////////////////
    /// PROXY ADMIN ////
    /// ////////////////
    logger.info('Updating proxy admin in genesis file...');
    // Get genesis info for bridge implementation
    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.PROXY_ADMIN,
        address: proxyAdminAddress,
        storage: storageModifications.ProxyAdmin,
    });

    /// /////////////////////////
    /// BRIDGE IMPLEMENTATION ///
    /// /////////////////////////
    logger.info('Updating BridgeL2SovereignChain implementation in genesis file...');
    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_IMPLEMENTATION,
        address: bridgeImplAddress,
        storage: storageModifications.BridgeL2SovereignChain_Implementation,
    });

    /// /////////////////////////
    /// BRIDGE PROXY ////////////
    /// /////////////////////////
    logger.info('Updating BridgeL2SovereignChain proxy in genesis file...');

    // Replace old bridge with new bridge proxy
    const bridgeL2SovereignChain = _genesisBase.genesis.find(function (obj) {
        return SUPPORTED_BRIDGE_CONTRACTS_PROXY.includes(obj.contractName);
    });

    genesisInfo.push({
        isProxy: true,
        contractName: GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_PROXY,
        address: bridgeProxyAddress,
        genesisContract: bridgeL2SovereignChain,
        storage: {
            ...storageModifications.BridgeL2SovereignChain,
            ...storageModifications.BridgeL2SovereignChain_Initialization,
        },
    });

    /// /////////////////////////
    /// GER IMPLEMENTATION //////
    /// /////////////////////////
    logger.info('Updating GlobalExitRootManagerL2SovereignChain implementation in genesis file...');
    // Get genesis info for ger implementation
    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_IMPLEMENTATION,
        address: gerImplAddress,
        storage: storageModifications.GlobalExitRootManagerL2SovereignChain_Implementation,
    });

    /// /////////////////////////
    /// GER PROXY ///////////////
    /// /////////////////////////
    logger.info('Updating GlobalExitRootManagerL2SovereignChain proxy in genesis file...');
    // Get genesis info for ger proxy
    const gerManagerL2SovereignChain = _genesisBase.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.GER_L2_PROXY;
    });

    genesisInfo.push({
        isProxy: true,
        contractName: GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY,
        genesisContract: gerManagerL2SovereignChain,
        address: gerProxyAddress,
        storage: {
            ...storageModifications.GlobalExitRootManagerL2SovereignChain,
            ...storageModifications.GlobalExitRootManagerL2SovereignChain_Initialization,
        },
    });

    /// /////////////////////////
    /// BYTECODE STORER /////////
    /// /////////////////////////
    logger.info('Updating BytecodeStorer in genesis file...');
    const bytecodeStorer = _genesisBase.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.BYTECODE_STORER;
    });
    const bytecodeStorerAddress = await sovereignChainBridgeContract.wrappedTokenBytecodeStorer();

    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.BYTECODE_STORER,
        genesisObject: bytecodeStorer,
        address: bytecodeStorerAddress,
    });

    if (bytecodeStorer) {
        expect(bytecodeStorer.bytecode).to.equal(await ethers.provider.getCode(bytecodeStorerAddress));
    }

    /// ////////////////////////////////
    /// TOKEN WRAPPED IMPL ///////////
    /// ///////////////////////////////
    logger.info('Updating TokenWrappedBridgeUpgradeable implementation in genesis file...');
    const tokenWrapped = _genesisBase.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION;
    });

    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION,
        address: tokenWrappedAddress,
        storage: storageModifications.TokenWrappedBridgeUpgradeable_Implementation,
    });

    if (tokenWrapped) {
        expect(tokenWrapped.bytecode).to.equal(await ethers.provider.getCode(tokenWrappedAddress));
    }

    /// ///////////////////////////////
    /// TOKEN WRAPPED PROXY ///////////
    /// ///////////////////////////////
    logger.info('Updating TokenWrappedBridgeUpgradeable proxy in genesis file...');
    // If bridge initialized with a zero sovereign weth address and a non zero gas token, we should add created erc20 weth contract implementation and proxy to the genesis
    let wethAddress;
    if (
        gasTokenAddress !== ethers.ZeroAddress &&
        ethers.isAddress(gasTokenAddress) &&
        (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress))
    ) {
        wethAddress = `0x${storageModifications.BridgeL2SovereignChain_Initialization[
            '0x000000000000000000000000000000000000000000000000000000000000006f'
        ].slice(26)}`;

        let storageBridgeProxy =
            storageModifications.TokenWrappedBridgeUpgradeable[
                STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.WETH_DECIMALS_BRIDGE_ADDRESS
            ];
        storageBridgeProxy = storageBridgeProxy.replace(
            bridgeProxyAddress.slice(2),
            genesisBaseAddresses.bridgeProxyAddress.toLowerCase().slice(2),
        );
        storageModifications.TokenWrappedBridgeUpgradeable[
            STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.WETH_DECIMALS_BRIDGE_ADDRESS
        ] = storageBridgeProxy;

        // Add WETH
        genesisInfo.push({
            contractName: GENESIS_CONTRACT_NAMES.WETH_PROXY,
            address: wethAddress,
            storage: storageModifications.TokenWrappedBridgeUpgradeable,
        });

        // Check implementation
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const _IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
        const wethGenesisImplementationAddress =
            storageModifications.TokenWrappedBridgeUpgradeable[_IMPLEMENTATION_SLOT];
        expect(wethGenesisImplementationAddress.slice(26).toLocaleLowerCase()).to.equal(
            tokenWrappedAddress.toLocaleLowerCase().slice(2),
        );
    }

    /// /////////////////////////
    /// BRIDGE LIB  /////////////
    /// /////////////////////////
    logger.info('Updating BytecodeStorer in genesis file...');
    const bridgeLib = _genesisBase.genesis.find(function (obj) {
        return obj.contractName === GENESIS_CONTRACT_NAMES.BRIDGE_LIB;
    });

    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.BRIDGE_LIB,
        genesisObject: bridgeLib,
        address: bridgeLibAddress,
    });

    if (bridgeLib) {
        expect(bridgeLib.bytecode).to.equal(await ethers.provider.getCode(bridgeLibAddress));
    }

    // If useAggOracleCommittee is true, we add AggOracleCommittee implementation and proxy to the genesis
    if (initializeParams.useAggOracleCommittee === true) {
        /// //////////////////////////////
        /// AGGORACLE IMPL  //////////////
        /// //////////////////////////////
        logger.info('Updating AggOracleCommittee implementation in genesis file...');
        genesisInfo.push({
            contractName: GENESIS_CONTRACT_NAMES.AGGORACLE_COMMITTEE_IMPLEMENTATION,
            address: aggOracleImplementationAddress,
            storage: storageModifications.AggOracleCommittee_Implementation,
        });

        /// ///////////////////////////////
        /// AGGORACLE PROXY  //////////////
        /// ///////////////////////////////
        logger.info('Updating AggOracleCommittee proxy in genesis file...');
        genesisInfo.push({
            contractName: GENESIS_CONTRACT_NAMES.AGGORACLE_COMMITTEE_PROXY,
            address: aggOracleCommitteeAddress,
            storage: {
                ...storageModifications.AggOracleCommittee,
                ...storageModifications.AggOracleCommittee_Initialization,
            },
        });

        // Check implementation
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const _IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
        const aggOracleCommitteeImplementationAddress = storageModifications.AggOracleCommittee[_IMPLEMENTATION_SLOT];
        expect(aggOracleCommitteeImplementationAddress.slice(26).toLocaleLowerCase()).to.equal(
            aggOracleImplementationAddress.toLocaleLowerCase().slice(2),
        );
    }

    const returnObject = { genesis: [] as any };

    // Add accounts
    const accounts = _genesisBase.genesis.filter(function (obj) {
        return obj.accountName !== undefined;
    });
    returnObject.genesis.push(accounts);

    // Add deployed contracts
    returnObject.genesis = await buildGenesis(genesisInfo);

    // switch network previous network
    await hre.switchNetwork(previousNetwork);

    return returnObject;
}

import path = require('path');
import fs = require('fs');
import hre, { ethers, upgrades, hardhatArguments } from 'hardhat';
import { expect } from 'chai';
import {
    AggOracleCommittee,
    BridgeL2SovereignChain,
    GlobalExitRootManagerL2SovereignChain,
    ProxyAdmin,
} from '../../typechain-types';
import { GENESIS_CONTRACT_NAMES } from './constants';
import {
    getAddressesGenesisBase,
    getMinDelayTimelock,
    deployProxyWithTxCapture,
    getExpectedStorageProxy,
    getExpectedStorageBridge,
    getExpectedStoragePolygonZkEVMTimelock,
    getExpectedStorageGERManagerL2SovereignChain,
    getActualStorage,
    deepEqual,
    getExpectedStorageTokenWrappedBridgeUpgradeable,
    updateExpectedStorageBridgeToken,
    getExpectedStorageAggOracleCommittee,
    getStorageTimelockAdminRoleMember,
    buildGenesis,
} from './utils';
import { checkParams, getTraceStorageWrites } from '../utils';
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

    // Get addresses from bridge deployment
    const bridgeProxyAddress = sovereignChainBridgeContract.target.toString().toLowerCase();
    const bridgeImplAddress = (await upgrades.erc1967.getImplementationAddress(bridgeProxyAddress)).toLocaleLowerCase();
    const tokenWrappedAddress = (
        await sovereignChainBridgeContract.getWrappedTokenBridgeImplementation()
    ).toLocaleLowerCase();
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

    // Get addresses from ger deployment
    const gerProxyAddress = gerManagerContract.target.toString().toLowerCase();
    const gerImplAddress = await upgrades.erc1967.getImplementationAddress(gerProxyAddress);

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
        const aggOracleCommitteeFactory = await ethers.getContractFactory(
            GENESIS_CONTRACT_NAMES.AGGORACLE_COMMITTEE,
            deployer,
        );
        aggOracleCommitteeDeploymentResult = await deployProxyWithTxCapture(aggOracleCommitteeFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerContract.target], // Constructor arguments
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        });

        aggOracleCommitteeContract = aggOracleCommitteeDeploymentResult.contract as unknown as AggOracleCommittee;
        initializeParams.globalExitRootUpdater = aggOracleCommitteeContract.target;
        globalExitRootUpdater = aggOracleCommitteeContract.target;
        aggOracleCommitteeAddress = aggOracleCommitteeContract.target;
        aggOracleImplementationAddress = await upgrades.erc1967.getImplementationAddress(
            aggOracleCommitteeContract.target,
        );

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

    const WETHTokenAddress = (await sovereignChainBridgeContract.WETHToken()).toLowerCase();

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
    const timelockContractAddress = timelockContract.target.toString().toLowerCase();

    const txDeployTimelock = await timelockContract.deploymentTransaction();
    const txDeployTimelockHash = txDeployTimelock ? txDeployTimelock.hash : undefined;

    // Transfer ownership of the proxyAdmin to the timelock
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(sovereignChainBridgeContract.target as string);
    const proxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    );
    const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddress as string) as ProxyAdmin;
    await (
        await proxyAdminInstance.connect(deployer).transferOwnership(genesisBaseAddresses.timelockAddress as string)
    ).wait();

    // Set timelock role with timelockAddress from genesisBaseAddresses
    const txTimelockAdminRole = await timelockContract.connect(deployer).grantRole(
        ethers.id('TIMELOCK_ADMIN_ROLE'),
        genesisBaseAddresses.timelockAddress, // timelockAddress from genesisBaseAddresses
    );
    const txRevokeTimelockAdminRole = await timelockContract.connect(deployer).revokeRole(
        ethers.id('TIMELOCK_ADMIN_ROLE'),
        timelockContractAddress, // Revoke the role from the deployer
    );

    /// /////////////////////////////////
    ///   SANITY CHECKS DEPLOYMENT   ///
    /// /////////////////////////////////

    // Check admin of the proxy is the same in the bridge and the GER manager
    const adminBridge = await upgrades.erc1967.getAdminAddress(sovereignChainBridgeContract.target as string);
    const adminGerManager = await upgrades.erc1967.getAdminAddress(gerManagerContract.target as string);

    expect(adminBridge).to.equal(adminGerManager);

    // Check initialize params bridge
    expect(rollupID).to.equal(await sovereignChainBridgeContract.networkID());
    expect(gerManagerContract.target).to.equal(await sovereignChainBridgeContract.globalExitRootManager());

    // Check initialize params GER
    expect(globalExitRootUpdater).to.equal(await gerManagerContract.globalExitRootUpdater());
    expect(globalExitRootRemover).to.equal(await gerManagerContract.globalExitRootRemover());

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

    // Get storage modifications for Bridge contract
    logger.info('Getting storage modifications for Bridge contract...');
    const bridgeStorageWrites = await getTraceStorageWrites(bridgeDeploymentResult.txHashes.proxy, bridgeProxyAddress);
    storageModifications.BridgeL2SovereignChain = bridgeStorageWrites;

    // Get storage modifications for Bridge implementation
    if (bridgeDeploymentResult.txHashes.implementation) {
        logger.info('Getting storage modifications for Bridge implementation...');
        try {
            const implTx = await ethers.provider.getTransaction(bridgeDeploymentResult.txHashes.implementation);
            if (implTx) {
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
                storageModifications.TokenWrappedBridgeUpgradeable = initStorageWrites[WETHTokenAddress];
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
                const gerInitStorageWrites = await getTraceStorageWrites(txInitializeGer.hash, gerProxyAddress);
                storageModifications.GlobalExitRootManagerL2SovereignChain_Initialization = gerInitStorageWrites;
            }
        } catch (error) {
            logger.error('Could not get GER initialization storage writes:', error);
        }
    }

    // Get storage modifications for Timelock contract
    logger.info('Getting storage modifications for Timelock contract...');
    const timelockStorageWrites = await getTraceStorageWrites(txDeployTimelockHash, timelockContractAddress);
    storageModifications.PolygonZkEVMTimelock = timelockStorageWrites;
    const timelockStorageAdmin = await getTraceStorageWrites(txTimelockAdminRole.hash, timelockContractAddress);
    const timelockStorageRevokeAdmin = await getTraceStorageWrites(
        txRevokeTimelockAdminRole.hash,
        timelockContractAddress,
    );
    expect(timelockStorageAdmin[getStorageTimelockAdminRoleMember(genesisBaseAddresses.timelockAddress)]).to.equal(
        '0x0000000000000000000000000000000000000000000000000000000000000001',
    );
    expect(timelockStorageRevokeAdmin[getStorageTimelockAdminRoleMember(timelockContractAddress)]).to.equal(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
    );
    storageModifications.PolygonZkEVMTimelock[getStorageTimelockAdminRoleMember(timelockContractAddress)] =
        '0x0000000000000000000000000000000000000000000000000000000000000000';
    storageModifications.PolygonZkEVMTimelock[getStorageTimelockAdminRoleMember(genesisBaseAddresses.timelockAddress)] =
        '0x0000000000000000000000000000000000000000000000000000000000000001';

    /// /////////////////////////////////////////////////
    ///   BUILD EXPECTED STORAGE MODIFICATIONS JSON   ///
    /// /////////////////////////////////////////////////

    const expectedStorageModifications: { [key: string]: any } = {};
    // BridgeL2SovereignChain Proxy
    expectedStorageModifications.BridgeL2SovereignChain = await getExpectedStorageProxy(
        sovereignChainBridgeContract.target,
    );
    // Bridge initialization
    expectedStorageModifications.BridgeL2SovereignChain_Initialization = getExpectedStorageBridge(
        initializeParams,
        gerManagerContract.target,
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
        expectedStorageModifications.AggOracleCommittee = await getExpectedStorageProxy(
            aggOracleCommitteeContract.target,
        );
    }
    // GlobalExitRootManagerL2SovereignChain Proxy
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain = await getExpectedStorageProxy(
        gerManagerContract.target,
    );
    // GER Implementation --> PolygonZkEVMGlobalExitRootL2
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain_Implementation = {};
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain_Implementation[
        STORAGE_GENESIS.STORAGE_GER_SOVEREIGN_IMPLEMENTATION.INITIALIZER_POLYGON_GER_L2
    ] = ethers.zeroPadValue('0xff', 32);
    // GER initialization
    expectedStorageModifications.GlobalExitRootManagerL2SovereignChain_Initialization =
        getExpectedStorageGERManagerL2SovereignChain(initializeParams);
    // PolygonZkEVMTimelock
    expectedStorageModifications.PolygonZkEVMTimelock = getExpectedStoragePolygonZkEVMTimelock(
        timelockMinDelay,
        genesisBaseAddresses.timelockAddress,
        timelockContractAddress,
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
    if (initializeParams.useAggOracleCommittee === true) {
        actualStorage.AggOracleCommittee_Implementation = await getActualStorage(
            storageModifications.AggOracleCommittee_Implementation,
            aggOracleImplementationAddress,
        );
        actualStorage.AggOracleCommittee = await getActualStorage(
            storageModifications.AggOracleCommittee,
            aggOracleCommitteeContract.target,
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
            aggOracleCommitteeContract.target,
        );
        actualStorage.AggOracleCommittee = await getActualStorage(
            storageModifications.AggOracleCommittee,
            aggOracleCommitteeContract.target,
        );
        actualStorage.AggOracleCommittee_Implementation = await getActualStorage(
            storageModifications.AggOracleCommittee_Implementation,
            aggOracleImplementationAddress,
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

    /// /////////////////////////
    /// BRIDGE IMPLEMENTATION ///
    /// /////////////////////////
    logger.info('Updating BridgeL2SovereignChain implementation in genesis file...');
    // Get genesis info for bridge implementation
    const bridgeL2SovereignChainImplementation = _genesisBase.genesis.find(function (obj) {
        return supportedBridgeContracts.includes(obj.contractName);
    });
    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_IMPLEMENTATION,
        genesisObject: bridgeL2SovereignChainImplementation,
        address: bridgeImplAddress,
        storage: storageModifications.BridgeL2SovereignChain_Implementation,
    });

    /// /////////////////////////
    /// BRIDGE PROXY ////////////
    /// /////////////////////////
    logger.info('Updating BridgeL2SovereignChain proxy in genesis file...');

    // Replace old bridge with new bridge proxy
    const bridgeL2SovereignChain = _genesisBase.genesis.find(function (obj) {
        return supportedBridgeContractsProxy.includes(obj.contractName);
    });
    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_PROXY,
        genesisObject: bridgeL2SovereignChain,
        address: bridgeProxyAddress,
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
    const gerManagerL2SovereignChainImplementation = _genesisBase.genesis.find(function (obj) {
        return supportedGERManagers.includes(obj.contractName);
    });
    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_IMPLEMENTATION,
        genesisObject: gerManagerL2SovereignChainImplementation,
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
        contractName: GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY,
        genesisObject: gerManagerL2SovereignChain,
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
        deployedInside: true,
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
        genesisObject: tokenWrapped,
        address: tokenWrappedAddress,
        storage: storageModifications.TokenWrappedBridgeUpgradeable_Implementation,
        deployedInside: true,
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

        // Add WETH
        genesisInfo.push({
            contractName: GENESIS_CONTRACT_NAMES.WETH_PROXY,
            address: wethAddress,
            storage: storageModifications.TokenWrappedBridgeUpgradeable,
            deployedInside: true,
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
            deployedInside: true,
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
            deployedInside: true,
        });

        // Check implementation
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const _IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
        const aggOracleCommitteeImplementationAddress = storageModifications.AggOracleCommittee[_IMPLEMENTATION_SLOT];
        expect(aggOracleCommitteeImplementationAddress.slice(26).toLocaleLowerCase()).to.equal(
            aggOracleImplementationAddress.toLocaleLowerCase().slice(2),
        );
    }

    const newGenesis = _genesisBase;
    await buildGenesis(newGenesis.genesis, genesisInfo);

    // switch network previous network
    await hre.switchNetwork(previousNetwork);

    return newGenesis;
}

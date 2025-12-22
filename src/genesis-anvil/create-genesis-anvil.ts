import path = require('path');
import fs = require('fs');
import hre, { ethers, hardhatArguments } from 'hardhat';
import { expect } from 'chai';
import { spawn, spawnSync } from 'child_process';
import { AggOracleCommittee, AgglayerBridgeL2, AgglayerGERL2 } from '../../typechain-types';
import {
    GENESIS_CONTRACT_NAMES,
    SUPPORTED_BRIDGE_CONTRACTS_PROXY,
    SUPPORTED_GER_MANAGERS,
    SUPPORTED_GER_MANAGERS_PROXY,
} from './constants';
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
    waitForAnvil,
    getErc1967Admin,
    getTxDiffStorage,
} from './utils';
import { checkParams } from '../utils';
import { logger } from '../logger';
import { STORAGE_GENESIS, storageNames } from './storage';

/**
 * Create a genesis file for anvil
 * This function deploys all the contracts that are needed for the genesis file in the anvil network
 * @param genesisBase - The base genesis file
 * @param initializeParams - The initialize parameters
 * @param config - The configuration object
 * @returns The genesis file
 */
export async function createGenesisAnvil(_genesisBase: any, initializeParams: any, config: any) {
    let isDebug = false;
    if (config && config.debug) {
        isDebug = config.debug;
    }
    logger.info('createGenesisAnvil tool');

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
    let genesisBase = _genesisBase.genesis;

    // Remove BYTECODE_STORER contract if present
    genesisBase = genesisBase.filter(function (obj) {
        return obj.contractName !== GENESIS_CONTRACT_NAMES.BYTECODE_STORER;
    });

    // get addresses from genesis base
    const genesisBaseAddresses = await getAddressesGenesisBase(genesisBase);

    // get default minDelay from the timelock
    const defaultMinDelayTimelock = Number(await getMinDelayTimelock(genesisBase));

    // save previous network
    const previousNetwork: string = hardhatArguments.network || 'hardhat';

    // check anvil version: 1.5.1-nightly
    const r = spawnSync('anvil', ['--version'], { encoding: 'utf8' });
    if (r.status !== 0) {
        throw new Error('Anvil must be installed.');
    }
    const versionString = r.stdout.trim();
    const version = versionString.match(/Version:\s*(\S+)/)?.[1];
    logger.info(`Version anvil: ${version}`);

    const numberVersion = version?.split('-')[0];
    if (Number(numberVersion?.split('.')[1]) < 4) {
        throw new Error(`A version higher than 1.4.0 is required.`);
    }

    // start anvil
    const anvil = await spawn('anvil', ['--port', '8545'], {
        stdio: 'inherit', // ves logs de anvil
    });
    logger.info(`Anvil started with PID: ${anvil.pid}`, anvil.pid?.toString());
    await waitForAnvil();

    const anvilProvider = new ethers.JsonRpcProvider('http://localhost:8545');

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

    const listTransactions: Array<{
        name: string;
        hash?: string;
        address: string;
        moreUpdates?: Array<{ name: string; address: string }>;
    }> = [];

    // Load deployer
    await anvilProvider.send('anvil_impersonateAccount', [timelockOwner]);
    await anvilProvider.send('anvil_setBalance', [timelockOwner, '0xffffffffffffffff']); // 18 ethers aprox
    // if deployer is on localhost (anvil), all deployments are done in anvil
    const deployer = await anvilProvider.getSigner(timelockOwner);

    const timelockContractFactory = await ethers.getContractFactory(GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK, deployer);
    const timelock = await timelockContractFactory.deploy(
        timelockMinDelay,
        [deployer],
        [deployer],
        deployer,
        ethers.ZeroAddress, // PolygonRollupManager address not needed in L2
    );
    const txDeployTimelock = await timelock.deploymentTransaction();
    const timelockContractAddress = timelock.target.toString().toLowerCase();

    listTransactions.push({
        name: storageNames.PolygonZkEVMTimelock,
        hash: txDeployTimelock?.hash,
        address: timelockContractAddress,
    });

    // Deploy proxyAdmin
    const ProxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        deployer,
    );
    const proxyAdmin = await ProxyAdminFactory.deploy(timelockContractAddress);
    const deployAdminTx = proxyAdmin.deploymentTransaction();
    await deployAdminTx?.wait();
    const proxyAdminAddress = proxyAdmin.target.toString().toLowerCase();

    listTransactions.push({
        name: storageNames.ProxyAdmin,
        hash: deployAdminTx?.hash,
        address: proxyAdminAddress,
    });

    // deploy AgglayerBridgeL2
    const bridgeDeploymentResult = await deployBridgeL2SovereignChain(proxyAdmin, deployer);

    // Get addresses from bridge deployment
    const bridgeProxyAddress = bridgeDeploymentResult.proxy;
    const bridgeImplAddress = bridgeDeploymentResult.implementation;

    // Get more addresses from deployed bridge
    const sovereignChainBridgeContract = (await ethers.getContractAt(
        GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE,
        bridgeProxyAddress,
        deployer,
    )) as unknown as AgglayerBridgeL2;

    const tokenWrappedAddress = (
        await sovereignChainBridgeContract.getWrappedTokenBridgeImplementation()
    ).toLocaleLowerCase();
    const bridgeLibAddress = (await sovereignChainBridgeContract.bridgeLib()).toLowerCase();

    listTransactions.push(
        {
            name: storageNames.AgglayerBridgeL2,
            hash: bridgeDeploymentResult.txHashes.proxy,
            address: bridgeProxyAddress,
        },
        {
            name: storageNames.AgglayerBridgeL2_Implementation,
            hash: bridgeDeploymentResult.txHashes.implementation,
            address: bridgeImplAddress,
            moreUpdates: [
                {
                    name: storageNames.TokenWrappedBridgeUpgradeable_Implementation,
                    address: tokenWrappedAddress,
                },
                // No storage for bridgeLib
                // {
                //     name: storageNames.BridgeLib,
                //     address: bridgeLibAddress,
                // },
            ],
        },
    );

    // deploy AgglayerGERL2
    const gerDeploymentResult = await deployGlobalExitRootManagerL2SovereignChain(
        proxyAdmin,
        deployer,
        genesisBaseAddresses.bridgeProxyAddress, // Constructor arguments
    );

    const gerManagerContract = (
        await ethers.getContractAt(GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN, gerDeploymentResult.proxy)
    ).connect(deployer) as unknown as AgglayerGERL2;

    // Get addresses from ger deployment
    const gerProxyAddress = gerDeploymentResult.proxy;
    const gerImplAddress = gerDeploymentResult.implementation;

    listTransactions.push(
        {
            hash: gerDeploymentResult.txHashes.proxy,
            address: gerProxyAddress,
            name: storageNames.AgglayerGERL2,
        },
        {
            hash: gerDeploymentResult.txHashes.implementation,
            address: gerImplAddress,
            name: storageNames.AgglayerGERL2_Implementation,
        },
    );

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
        aggOracleCommitteeContract = (
            await ethers.getContractAt(GENESIS_CONTRACT_NAMES.AGG_ORACLE, aggOracleCommitteeDeploymentResult.proxy)
        ).connect(deployer) as unknown as AggOracleCommittee;
        aggOracleCommitteeAddress = aggOracleCommitteeDeploymentResult.proxy;
        aggOracleImplementationAddress = aggOracleCommitteeDeploymentResult.implementation;

        listTransactions.push(
            {
                hash: aggOracleCommitteeDeploymentResult.txHashes.proxy,
                address: aggOracleCommitteeAddress,
                name: storageNames.AggOracleCommittee,
            },
            {
                hash: aggOracleCommitteeDeploymentResult.txHashes.implementation,
                address: aggOracleImplementationAddress,
                name: storageNames.AggOracleCommittee_Implementation,
            },
        );

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

        listTransactions.push({
            hash: txInitializeAggOracleCommittee?.hash,
            address: aggOracleCommitteeAddress,
            name: storageNames.AggOracleCommittee_Initialization,
        });
    } else {
        checkParams(initializeParams, ['globalExitRootUpdater']);
        globalExitRootUpdater = initializeParams.globalExitRootUpdater;
    }

    /// ///////////////////////////////////////
    ///   INITIALIZE SOVEREIGN CONTRACTS   ///
    /// //////////////////////////////////////

    logger.info('Initializing AgglayerBridgeL2 contract...');
    // Initialize the AgglayerBridgeL2 contract
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

    if (gasTokenAddress !== ethers.ZeroAddress && ethers.isAddress(gasTokenAddress)) {
        listTransactions.push({
            hash: txInitializeBridge?.hash,
            address: bridgeProxyAddress,
            name: storageNames.AgglayerBridgeL2_Initialization,
            moreUpdates: [
                {
                    name: storageNames.TokenWrappedBridgeUpgradeable,
                    address: WETHTokenAddress,
                },
            ],
        });
    } else {
        listTransactions.push({
            hash: txInitializeBridge?.hash,
            address: bridgeProxyAddress,
            name: storageNames.AgglayerBridgeL2_Initialization,
        });
    }

    logger.info('Initializing AgglayerGERL2 contract...');
    // Initialize the AgglayerGERL2 contract
    const txInitializeGer = await gerManagerContract.initialize(globalExitRootUpdater, globalExitRootRemover);

    listTransactions.push({
        hash: txInitializeGer?.hash,
        address: gerProxyAddress,
        name: storageNames.AgglayerGERL2_Initialization,
    });

    /// /////////////////////////////////
    ///   SANITY CHECKS DEPLOYMENT   ///
    /// /////////////////////////////////

    // Check admin of the proxy is the same in the bridge and the GER manager
    const adminBridge = await getErc1967Admin(anvilProvider, bridgeProxyAddress as string);
    const adminGerManager = await getErc1967Admin(anvilProvider, gerProxyAddress as string);
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

    // Get storage modifications for each transaction
    // eslint-disable-next-line no-restricted-syntax
    for (const tx of listTransactions) {
        logger.info(`Getting storage modifications for transaction: ${tx.name} - ${tx.hash}`);
        // eslint-disable-next-line no-await-in-loop
        const trace = await getTxDiffStorage(tx.hash!, anvilProvider);
        checkExpectedStorageLength(trace, 1 + (tx.moreUpdates ? tx.moreUpdates.length : 0));
        storageModifications[tx.name] = trace[tx.address];
        if (tx.moreUpdates) {
            // eslint-disable-next-line no-restricted-syntax
            for (const moreUpdate of tx.moreUpdates) {
                logger.info(`Getting storage modifications for: ${moreUpdate.name}`);
                storageModifications[moreUpdate.name] = trace[moreUpdate.address] ? trace[moreUpdate.address] : {};
            }
        }
    }

    // /// /////////////////////////////////////////////////
    // ///   BUILD EXPECTED STORAGE MODIFICATIONS JSON   ///
    // /// /////////////////////////////////////////////////

    logger.info('Getting expected storage modifications...');

    const expectedStorageModifications: { [key: string]: any } = {};
    logger.info('Checking expected storage PolygonZkEVMTimelock...');
    // PolygonZkEVMTimelock
    expectedStorageModifications.PolygonZkEVMTimelock = getExpectedStoragePolygonZkEVMTimelock(
        timelockMinDelay,
        timelockContractAddress,
        deployer.address,
    );
    logger.info('Checking expected storage ProxyAdmin...');
    // ProxyAdmin
    expectedStorageModifications.ProxyAdmin = {};
    expectedStorageModifications.ProxyAdmin[STORAGE_GENESIS.STORAGE_PROXY_ADMIN.OWNER] = ethers.zeroPadValue(
        timelockContractAddress,
        32,
    );
    logger.info('Checking expected storage AgglayerBridgeL2...');
    // AgglayerBridgeL2 Proxy
    expectedStorageModifications.AgglayerBridgeL2 = await getExpectedStorageProxy(bridgeProxyAddress, anvilProvider);
    logger.info('Checking expected storage AgglayerBridgeL2_Initialization...');
    // Bridge initialization
    expectedStorageModifications.AgglayerBridgeL2_Initialization = getExpectedStorageBridge(
        initializeParams,
        genesisBaseAddresses.gerManagerProxyAddress,
    );
    logger.info('Checking expected storage TokenWrappedBridgeUpgradeable_Implementation...');
    // AgglayerBridgeL2 Implementation --> TokenWrappedBridgeUpgradeable
    expectedStorageModifications.TokenWrappedBridgeUpgradeable_Implementation = {};
    expectedStorageModifications.TokenWrappedBridgeUpgradeable_Implementation[
        STORAGE_GENESIS.TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE.INITIALIZER
    ] = ethers.zeroPadValue('0xffffffffffffffff', 32);
    if (gasTokenAddress !== ethers.ZeroAddress && ethers.isAddress(gasTokenAddress)) {
        expectedStorageModifications.AgglayerBridgeL2_Initialization[
            STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN.GAS_TOKEN_ADDRESS
        ] = ethers.zeroPadValue(gasTokenAddress, 32);
        if (sovereignWETHAddress === ethers.ZeroAddress || !ethers.isAddress(sovereignWETHAddress)) {
            // Add proxy WETH
            const tokenStorage = await getExpectedStorageTokenWrappedBridgeUpgradeable(
                sovereignChainBridgeContract,
                tokenWrappedAddress,
                anvilProvider,
            );
            expectedStorageModifications.TokenWrappedBridgeUpgradeable = tokenStorage;
            // Add WETH to bridge storage
            updateExpectedStorageBridgeToken(
                expectedStorageModifications.AgglayerBridgeL2_Initialization,
                sovereignChainBridgeContract,
                gasTokenMetadata,
            );
        }
    }
    logger.info('Checking expected storage AgglayerBridgeL2_Implementation...');
    // AgglayerBridgeL2 Implementation --> PolygonZkEVMBridgeV2
    expectedStorageModifications.AgglayerBridgeL2_Implementation = {};
    expectedStorageModifications.AgglayerBridgeL2_Implementation[
        STORAGE_GENESIS.STORAGE_BRIDGE_SOVEREIGN_IMPLEMENTATION.INITIALIZER
    ] = ethers.zeroPadValue('0xff', 32);
    // If useCommittee is true, add AggOracleCommittee storage
    if (initializeParams.useAggOracleCommittee === true) {
        logger.info('Checking expected storage AggOracleCommittee_Implementation...');
        expectedStorageModifications.AggOracleCommittee_Implementation = {};
        expectedStorageModifications.AggOracleCommittee_Implementation[
            STORAGE_GENESIS.STORAGE_AGG_ORACLE_COMMITTEE_IMPLEMENTATION.INITIALIZER
        ] = ethers.zeroPadValue('0xffffffffffffffff', 32);
        expectedStorageModifications.AggOracleCommittee_Initialization = await getExpectedStorageAggOracleCommittee(
            initializeParams,
            aggOracleCommitteeContract,
        );
        expectedStorageModifications.AggOracleCommittee = await getExpectedStorageProxy(
            aggOracleCommitteeAddress,
            anvilProvider,
        );
    }
    logger.info('Checking expected storage AgglayerGERL2...');
    // AgglayerGERL2 Proxy
    expectedStorageModifications.AgglayerGERL2 = await getExpectedStorageProxy(gerProxyAddress, anvilProvider);
    logger.info('Checking expected storage AgglayerGERL2_Implementation...');
    // GER Implementation --> PolygonZkEVMGlobalExitRootL2
    expectedStorageModifications.AgglayerGERL2_Implementation = {};
    expectedStorageModifications.AgglayerGERL2_Implementation[
        STORAGE_GENESIS.STORAGE_GER_SOVEREIGN_IMPLEMENTATION.INITIALIZER_POLYGON_GER_L2
    ] = ethers.zeroPadValue('0xff', 32);
    // GER initialization
    logger.info('Checking expected storage AgglayerGERL2_Initialization...');
    expectedStorageModifications.AgglayerGERL2_Initialization =
        getExpectedStorageGERManagerL2SovereignChain(initializeParams);

    // /// //////////////////////////////
    // ///   CHECK ACTUAL STORAGE    ///
    // /// /////////////////////////////

    logger.info('Getting actual storage...');

    const actualStorage: { [key: string]: any } = {};
    // ProxyAdmin
    actualStorage.ProxyAdmin = await getActualStorage(
        storageModifications.ProxyAdmin,
        proxyAdminAddress,
        anvilProvider,
    );
    // AgglayerBridgeL2
    actualStorage.AgglayerBridgeL2 = await getActualStorage(
        storageModifications.AgglayerBridgeL2,
        bridgeProxyAddress,
        anvilProvider,
    );
    actualStorage.AgglayerBridgeL2_Initialization = await getActualStorage(
        storageModifications.AgglayerBridgeL2_Initialization,
        bridgeProxyAddress,
        anvilProvider,
    );
    actualStorage.AgglayerBridgeL2_Implementation = await getActualStorage(
        storageModifications.AgglayerBridgeL2_Implementation,
        bridgeImplAddress,
        anvilProvider,
    );
    actualStorage.TokenWrappedBridgeUpgradeable_Implementation = await getActualStorage(
        storageModifications.TokenWrappedBridgeUpgradeable_Implementation,
        tokenWrappedAddress,
        anvilProvider,
    );
    if (initializeParams.useAggOracleCommittee === true) {
        actualStorage.AggOracleCommittee_Implementation = await getActualStorage(
            storageModifications.AggOracleCommittee_Implementation,
            aggOracleImplementationAddress,
            anvilProvider,
        );
        actualStorage.AggOracleCommittee = await getActualStorage(
            storageModifications.AggOracleCommittee,
            aggOracleCommitteeAddress,
            anvilProvider,
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
            anvilProvider,
        );
    }
    // AggOracleCommittee
    if (initializeParams.useAggOracleCommittee === true) {
        actualStorage.AggOracleCommittee_Initialization = await getActualStorage(
            storageModifications.AggOracleCommittee_Initialization,
            aggOracleCommitteeAddress,
            anvilProvider,
        );
        actualStorage.AggOracleCommittee = await getActualStorage(
            storageModifications.AggOracleCommittee,
            aggOracleCommitteeAddress,
            anvilProvider,
        );
        actualStorage.AggOracleCommittee_Implementation = await getActualStorage(
            storageModifications.AggOracleCommittee_Implementation,
            aggOracleImplementationAddress,
            anvilProvider,
        );
    }

    // AgglayerGERL2
    actualStorage.AgglayerGERL2 = await getActualStorage(
        storageModifications.AgglayerGERL2,
        gerProxyAddress,
        anvilProvider,
    );
    actualStorage.AgglayerGERL2_Initialization = await getActualStorage(
        storageModifications.AgglayerGERL2_Initialization,
        gerProxyAddress,
        anvilProvider,
    );
    actualStorage.AgglayerGERL2_Implementation = await getActualStorage(
        storageModifications.AgglayerGERL2_Implementation,
        gerImplAddress,
        anvilProvider,
    );
    // PolygonZkEVMTimelock
    actualStorage.PolygonZkEVMTimelock = await getActualStorage(
        storageModifications.PolygonZkEVMTimelock,
        timelockContractAddress,
        anvilProvider,
    );

    if (isDebug) {
        logger.info('**DEBUG**: Writing actual storage JSON to file...');
        await fs.writeFileSync(
            path.join(__dirname, '../../tools/createSovereignGenesisAnvil/actualStorage.json'),
            JSON.stringify(actualStorage, null, 2),
        );
        logger.info('**DEBUG**: Writing expected storage modifications JSON to file...');
        await fs.writeFileSync(
            path.join(__dirname, '../../tools/createSovereignGenesisAnvil/expectedStorageModifications.json'),
            JSON.stringify(expectedStorageModifications, null, 2),
        );
        logger.info('**DEBUG**: Writing storage modifications JSON to file...');
        await fs.writeFileSync(
            path.join(__dirname, '../../tools/createSovereignGenesisAnvil/storageModifications.json'),
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
        path.join(__dirname, '../../tools/createSovereignGenesisAnvil/storageModifications.json'),
        JSON.stringify(storageModifications, null, 2),
    );

    // /// ///////////////////////////
    // ///   BUILD GENESIS FILE   ///
    // /// ///////////////////////////
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
    logger.info('Updating AgglayerBridgeL2 implementation in genesis file...');
    genesisInfo.push({
        contractName: GENESIS_CONTRACT_NAMES.SOVEREIGN_BRIDGE_IMPLEMENTATION,
        address: bridgeImplAddress,
        storage: storageModifications.AgglayerBridgeL2_Implementation,
    });

    /// /////////////////////////
    /// BRIDGE PROXY ////////////
    /// /////////////////////////
    logger.info('Updating AgglayerBridgeL2 proxy in genesis file...');

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
            ...storageModifications.AgglayerBridgeL2,
            ...storageModifications.AgglayerBridgeL2_Initialization,
        },
    });

    /// /////////////////////////
    /// GER IMPLEMENTATION //////
    /// /////////////////////////
    logger.info('Updating AgglayerGERL2 implementation in genesis file...');
    // Get genesis info for ger implementation
    genesisInfo.push({
        contractName: SUPPORTED_GER_MANAGERS,
        address: gerImplAddress,
        storage: storageModifications.AgglayerGERL2_Implementation,
    });

    /// /////////////////////////
    /// GER PROXY ///////////////
    /// /////////////////////////
    logger.info('Updating AgglayerGERL2 proxy in genesis file...');
    // Get genesis info for ger proxy
    const gerManagerL2SovereignChain = _genesisBase.genesis.find(function (obj) {
        return SUPPORTED_GER_MANAGERS_PROXY.includes(obj.contractName);
    });

    genesisInfo.push({
        isProxy: true,
        contractName: GENESIS_CONTRACT_NAMES.GER_L2_SOVEREIGN_PROXY,
        genesisContract: gerManagerL2SovereignChain,
        address: gerProxyAddress,
        storage: {
            ...storageModifications.AgglayerGERL2,
            ...storageModifications.AgglayerGERL2_Initialization,
        },
    });

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
        wethAddress = `0x${storageModifications.AgglayerBridgeL2_Initialization[
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
            contractName: GENESIS_CONTRACT_NAMES.AGG_ORACLE_IMPL,
            address: aggOracleImplementationAddress,
            storage: storageModifications.AggOracleCommittee_Implementation,
        });

        /// ///////////////////////////////
        /// AGGORACLE PROXY  //////////////
        /// ///////////////////////////////
        logger.info('Updating AggOracleCommittee proxy in genesis file...');
        genesisInfo.push({
            contractName: GENESIS_CONTRACT_NAMES.AGG_ORACLE_PROXY,
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
    returnObject.genesis = await buildGenesis(genesisInfo, anvilProvider);

    // kill anvil
    anvil.kill('SIGTERM');

    // switch network previous network
    await hre.switchNetwork(previousNetwork);

    return returnObject;
}

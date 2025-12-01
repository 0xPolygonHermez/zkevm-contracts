/* eslint-disable @typescript-eslint/no-use-before-define */
// SPDX-License-Identifier: AGPL-3.0
/**
 * Deploy Outpost Chain - Standard Deployment Script
 *
 * This script deploys all necessary contracts for an outpost chain using standard deployments.
 * No CREATE3 is used, making the deployment process much simpler and straightforward.
 */

import { ethers, upgrades } from 'hardhat';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { getDeployerFromParameters, getProviderAdjustingMultiplierGas, checkParams } from '../../src/utils';
import { logger } from '../../src/logger';
import { verifyContractEtherscan } from '../../upgrade/utils';

import deployParameters from './deploy_parameters.json';

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Main deployment function
 */
async function main() {
    logger.info('🚀 Starting Outpost Chain deployment...');

    // Step 0: Validate parameters
    validateDeploymentParameters();

    // Setup provider and deployer
    const currentProvider = getProviderAdjustingMultiplierGas(deployParameters, ethers);
    const deployer = await getDeployerFromParameters(currentProvider, deployParameters, ethers);

    // Initialize output
    const outputJson: any = {};

    logger.info(`Deploying with address: ${deployer.address}`);
    logger.info(`Network: ${deployParameters.network.networkName} (Chain ID: ${deployParameters.network.chainID})`);
    logger.info(`Rollup ID: ${deployParameters.network.rollupID}`);

    // Log automatically calculated parameters
    const calculatedGasTokenAddress = deriveGasTokenAddress(deployParameters.network.rollupID);
    logger.info(`🤖 Auto-calculated gas token address: ${calculatedGasTokenAddress}`);
    logger.info(`🤖 Auto-calculated gas token network: ${deployParameters.network.chainID} (using chainID)`);
    logger.info(`🤖 Auto-calculated proxied tokens manager: timelock address (set during deployment)`);

    // Step 1: Deploy Timelock
    logger.info('\n=== Step 1: Deploying TimelockController (OpenZeppelin) ===');
    const timelock = await deployTimelock(deployer);
    outputJson.timelockAddress = timelock.target;

    // Step 2: Deploy ProxyAdmin with Timelock as owner
    logger.info('\n=== Step 2: Deploying ProxyAdmin with Timelock as owner ===');
    const proxyAdmin = await deployProxyAdmin(timelock.target as string, deployer);
    outputJson.proxyAdminAddress = proxyAdmin.target;

    // Step 2.5: Deploy AggOracleCommittee if enabled
    let { globalExitRootUpdater } = deployParameters.globalExitRoot;
    if (deployParameters.aggOracleCommittee?.useAggOracleCommittee === true) {
        logger.info('\n=== Step 2.5: Deploying AggOracleCommittee ===');

        // We need to calculate the GER Manager address first to deploy AggOracleCommittee
        const currentNonce = await deployer.getNonce();
        // After AggOracle: impl (nonce+0), proxy (nonce+1), then GER: impl (nonce+2), proxy (nonce+3)
        const precalculatedGERManagerAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: currentNonce + 3, // GER Manager proxy will be at nonce+3
        });

        const aggOracle = await deployAggOracleCommittee(precalculatedGERManagerAddress, proxyAdmin, deployer);
        outputJson.aggOracleCommitteeAddress = aggOracle.proxy;
        outputJson.aggOracleCommitteeImplementation = aggOracle.implementation;

        // Use AggOracleCommittee as globalExitRootUpdater
        globalExitRootUpdater = aggOracle.proxy;
        logger.info(`✅ Using AggOracleCommittee as globalExitRootUpdater: ${globalExitRootUpdater}`);
    }

    // Step 3: Pre-calculate Bridge proxy address for GER Manager deployment
    logger.info('\n=== Step 3: Pre-calculating Bridge proxy address ===');
    const currentNonce = await deployer.getNonce();

    // Calculate the address where Bridge proxy will be deployed
    // Manual deployment order: GER impl (nonce+0), GER proxy (nonce+1), Bridge impl (nonce+2), Bridge proxy (nonce+3)
    const precalculatedBridgeAddress = ethers.getCreateAddress({
        from: deployer.address,
        nonce: currentNonce + 3, // Bridge proxy will be deployed at nonce+3
    });

    logger.info(`📍 Pre-calculated Bridge proxy address: ${precalculatedBridgeAddress}`);
    logger.info(`👤 Deployer address: ${deployer.address}`);
    logger.info(`🔢 Current nonce: ${currentNonce}`);

    // Step 4: Deploy AgglayerGERL2 with pre-calculated Bridge address
    logger.info('\n=== Step 4: Deploying AgglayerGERL2 ===');
    const gerManager = await deployGlobalExitRootManagerL2SovereignChain(
        precalculatedBridgeAddress, // Use pre-calculated Bridge address
        proxyAdmin, // Pass the centralized ProxyAdmin
        deployer,
        globalExitRootUpdater, // Pass the determined globalExitRootUpdater
    );
    outputJson.globalExitRootManagerL2SovereignChainAddress = gerManager.proxy;
    outputJson.globalExitRootManagerL2SovereignChainImplementation = gerManager.implementation;

    // Step 5: Deploy AgglayerBridgeL2 with GER Manager address
    logger.info('\n=== Step 5: Deploying AgglayerBridgeL2 ===');
    const sovereignBridge = await deployBridgeL2SovereignChain(
        gerManager.proxy, // Use actual GER Manager address
        proxyAdmin, // Use centralized ProxyAdmin
        deployer,
    );
    outputJson.bridgeL2SovereignChainAddress = sovereignBridge.proxy;
    outputJson.bridgeL2SovereignChainImplementation = sovereignBridge.implementation;
    outputJson.wrappedTokenBridgeImplementation = sovereignBridge.wrappedTokenBridgeImplementation;
    outputJson.bridgeLib = sovereignBridge.bridgeLib;
    outputJson.WETH = sovereignBridge.WETH;

    // Step 5.1: Verify that actual Bridge address matches pre-calculated address
    logger.info('\n=== Step 5.1: Verifying address prediction ===');
    if (sovereignBridge.proxy !== precalculatedBridgeAddress) {
        const error = `❌ Address mismatch! Pre-calculated: ${precalculatedBridgeAddress}, Actual: ${sovereignBridge.proxy}`;
        logger.error(error);
        throw new Error(error);
    }
    logger.info(`✅ Address prediction successful! Bridge deployed at expected address: ${sovereignBridge.proxy}`);

    // Step 6: Run basic verification
    logger.info('\n=== Step 6: Running verification ===');
    const verificationResults = await runBasicVerification(deployParameters, outputJson);

    // Step 7: Generate final output
    logger.info('\n=== Step 7: Generating deployment output ===');
    const finalOutput = generateFinalOutput(outputJson, deployParameters, globalExitRootUpdater);

    // Add verification results to final output for reference
    finalOutput.verificationResults = verificationResults;

    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    const outputPath = path.join(__dirname, `deploy_output_${currentDate}_${currentTime}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(finalOutput, null, 2));
    logger.info(`✅ Deployment output saved to: ${outputPath}`);

    // Final summary
    const failedVerifications = verificationResults.filter((r) => !r.success);
    if (failedVerifications.length > 0) {
        logger.warn(`\n⚠️  Deployment completed with ${failedVerifications.length} verification warning(s).`);
        logger.warn('Please review the verification results in the output file and take appropriate action.');
    } else {
        logger.info('\n🎉 Deployment completed successfully with all verifications passed!');
    }
}

/**
 * Validates all deployment parameters from the configuration
 */
function validateDeploymentParameters() {
    const mandatoryParams = [
        'network.chainID',
        'network.rollupID',
        'network.networkName',
        'network.tokenName',
        'network.tokenSymbol',
        'network.tokenDecimals',
        'timelock.timelockDelay',
        'timelock.timelockAdminAddress',
        'bridge.bridgeManager',
        'bridge.emergencyBridgePauser',
        'bridge.emergencyBridgeUnpauser',
    ];

    // Check if AggOracleCommittee is being used
    if (deployParameters.aggOracleCommittee?.useAggOracleCommittee === true) {
        // If using AggOracleCommittee, validate its parameters
        const aggOracleParams = [
            'aggOracleCommittee.aggOracleOwner',
            'aggOracleCommittee.aggOracleMembers',
            'aggOracleCommittee.quorum',
        ];
        mandatoryParams.push(...aggOracleParams);

        // Validate that globalExitRootUpdater is not set when using AggOracleCommittee
        if (
            deployParameters.globalExitRoot?.globalExitRootUpdater !== undefined &&
            deployParameters.globalExitRoot?.globalExitRootUpdater !== '' &&
            deployParameters.globalExitRoot?.globalExitRootUpdater !== ethers.ZeroAddress
        ) {
            throw new Error('globalExitRootUpdater should not be set when using AggOracleCommittee');
        }

        // Validate oracle members
        const nullifierAddress = {} as any;
        deployParameters.aggOracleCommittee.aggOracleMembers.forEach((oracleMember: string) => {
            if (!ethers.isAddress(oracleMember)) {
                throw new Error(`aggOracleMembers ${oracleMember}: not a valid address`);
            }
            // Check if address is not duplicated
            if (nullifierAddress[oracleMember] !== undefined) {
                throw new Error(`aggOracleMembers ${oracleMember}: duplicated address`);
            }
            nullifierAddress[oracleMember] = true;
        });

        // Validate quorum
        if (deployParameters.aggOracleCommittee.quorum < 1) {
            throw new Error('quorum must be bigger than 0');
        }
        if (deployParameters.aggOracleCommittee.quorum > deployParameters.aggOracleCommittee.aggOracleMembers.length) {
            throw new Error(
                `quorum must be smaller or equal than the number of aggOracleCommittee members (${deployParameters.aggOracleCommittee.aggOracleMembers.length})`,
            );
        }

        logger.info('✅ AggOracleCommittee parameters validated');
    } else {
        // If not using AggOracleCommittee, globalExitRootUpdater is mandatory
        mandatoryParams.push('globalExitRoot.globalExitRootUpdater');
    }

    // Always validate globalExitRootRemover (it's always needed)
    mandatoryParams.push('globalExitRoot.globalExitRootRemover');

    // Use enhanced checkParams from utils with address validation
    checkParams(deployParameters, mandatoryParams, true);

    logger.info('✅ All mandatory parameters validated');
}

/**
 * Derive gas token address from rollup ID by repeating it 5 times to get 160 bits
 */
function deriveGasTokenAddress(rollupID: number): string {
    // Convert rollupID to 32-bit hex (8 characters)
    const rollupHex = rollupID.toString(16).padStart(8, '0').toLowerCase();

    // Repeat 5 times to get 160 bits (40 hex characters = 20 bytes)
    const addressHex = rollupHex.repeat(5);
    const address = `0x${addressHex}`;

    return address;
}

/**
 * Deploy ProxyAdmin contract with timelock as initial owner
 */
async function deployProxyAdmin(timelockAddress: string, deployer: any): Promise<any> {
    const ProxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        deployer,
    );
    const proxyAdmin = await ProxyAdminFactory.deploy(timelockAddress);
    const deployTx = proxyAdmin.deploymentTransaction();
    // Wait for 5 confirmations for correct etherscan verification
    await deployTx?.wait(5);

    logger.info(`✅ ProxyAdmin deployed with Timelock as owner: ${proxyAdmin.target}`);

    // Verify ProxyAdmin on Etherscan
    await verifyContractEtherscan(
        proxyAdmin.target as string,
        [timelockAddress], // Constructor argument: initial owner
        5, // 5 seconds wait time
        '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
    );

    return proxyAdmin;
}

/**
 * Deploy TimelockController contract from OpenZeppelin
 */
async function deployTimelock(deployer: any): Promise<any> {
    const TimelockFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts/governance/TimelockController.sol:TimelockController',
        deployer,
    );

    const timelock = await TimelockFactory.deploy(
        deployParameters.timelock.timelockDelay,
        [deployParameters.timelock.timelockAdminAddress],
        [deployParameters.timelock.timelockAdminAddress],
        deployParameters.timelock.timelockAdminAddress,
    );
    const deployTx = timelock.deploymentTransaction();
    // Wait for 5 confirmations for correct etherscan verification
    await deployTx?.wait(5);

    logger.info(`✅ TimelockController (OpenZeppelin) deployed: ${timelock.target}`);

    // Verify TimelockController on Etherscan
    await verifyContractEtherscan(
        timelock.target as string,
        [
            deployParameters.timelock.timelockDelay.toString(),
            [deployParameters.timelock.timelockAdminAddress],
            [deployParameters.timelock.timelockAdminAddress],
            deployParameters.timelock.timelockAdminAddress,
        ],
        5, // 5 seconds wait time
    );

    return timelock;
}

/**
 * Deploy AgglayerBridgeL2 with proxy pattern using centralized ProxyAdmin
 */
async function deployBridgeL2SovereignChain(
    gerManagerAddress: string,
    proxyAdmin: any,
    deployer: any,
): Promise<{
    proxy: string;
    implementation: string;
    wrappedTokenBridgeImplementation: string;
    bridgeLib: string;
    WETH: string;
}> {
    const BridgeFactory = await ethers.getContractFactory('AgglayerBridgeL2', deployer);

    // Calculate automatic parameters for outpost chain
    const gasTokenAddress = deriveGasTokenAddress(deployParameters.network.rollupID);
    const gasTokenNetwork = deployParameters.network.rollupID; // Use rollupID as gasTokenNetwork

    // Prepare initialization call data
    const gasTokenMetadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        [
            deployParameters.network.tokenName,
            deployParameters.network.tokenSymbol,
            deployParameters.network.tokenDecimals,
        ],
    );

    // Step 1: Deploy implementation
    logger.info('📍 Step 1: Deploying Bridge implementation...');
    const bridgeImplementation = await BridgeFactory.deploy();
    const deployTx = bridgeImplementation.deploymentTransaction();
    // Wait for 5 confirmations for correct etherscan verification
    await deployTx?.wait(5);
    logger.info(`✅ AgglayerBridgeL2 implementation deployed: ${bridgeImplementation.target}`);

    // Verify Bridge implementation on Etherscan
    await verifyContractEtherscan(
        bridgeImplementation.target as string,
        [], // No constructor arguments
        5, // 5 seconds wait time
    );

    // Step 2: Deploy TransparentUpgradeableProxy with centralized ProxyAdmin
    logger.info('📍 Step 2: Deploying Bridge proxy with centralized ProxyAdmin...');
    const transparentProxyFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
        deployer,
    );
    /*
     * WHY SEPARATED DEPLOYMENT IS REQUIRED FOR BRIDGE:
     *
     * The Bridge CANNOT use atomic initialization (upgrades.deployProxy with initializer) because:
     *
     * 1. During initialize(), the Bridge calls _deployWrappedToken() to create the WETH token
     * 2. _deployWrappedToken() uses CREATE2 to deploy a TokenWrappedTransparentProxy
     * 3. The TokenWrappedTransparentProxy constructor calls back to the Bridge proxy:
     *
     *    constructor() ERC1967Proxy(
     *        IAgglayerBridge(msg.sender).getWrappedTokenBridgeImplementation(), // ← CALLBACK
     *        new bytes(0)
     *    ) {
     *        _changeAdmin(IAgglayerBridge(msg.sender).getProxiedTokensManager()); // ← CALLBACK
     *    }
     *
     * 4. ❌ These callbacks FAIL during atomic deployment because:
     *    - The Bridge proxy exists but is not yet fully initialized
     *    - The proxy cannot handle function calls during its own initialization process
     *    - This creates a circular dependency: proxy needs to be ready to handle calls
     *      but the calls are needed to complete the initialization
     *
     * SOLUTION: Deploy implementation → Deploy proxy (empty initData) → Initialize separately
     *
     * FRONTRUNNING PROTECTION: onlyDeployer modifier ensures secure initialization
     * - deployer = msg.sender (set in implementation constructor)
     * - require(msg.sender == deployer, OnlyDeployer()) (in initialize function)
     * - This protection is immutable and cannot be bypassed
     */
    const bridgeProxy = await transparentProxyFactory.deploy(
        bridgeImplementation.target, // Implementation address
        proxyAdmin.target, // Use centralized ProxyAdmin
        '0x', // Call data for initialization (empty for separated initialization)
    );
    const deployProxyTx = bridgeProxy.deploymentTransaction();
    // Wait for 5 confirmations for correct etherscan verification
    await deployProxyTx?.wait(5);
    logger.info(`✅ Bridge proxy deployed: ${bridgeProxy.target}`);

    // Verify Bridge proxy on Etherscan
    await verifyContractEtherscan(
        bridgeProxy.target as string,
        [
            bridgeImplementation.target, // Implementation address
            proxyAdmin.target, // Admin address
            '0x', // Empty init data
        ],
        30, // 30 seconds wait time, enough to allow for
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
    );

    // Step 3: Initialize proxy with onlyDeployer protection (frontrunning-safe)
    logger.info('📍 Step 3: Initializing Bridge proxy (onlyDeployer protected)...');
    const bridge = BridgeFactory.attach(bridgeProxy.target as string) as any;

    // Get timelock address from the proxyAdmin owner
    const proxyAdminContract = await ethers.getContractAt(
        '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        proxyAdmin.target,
    );
    const timelockAddress = await proxyAdminContract.owner();

    const initializeTx = await bridge.initialize(
        deployParameters.network.rollupID, // Rollup ID (networkID)
        gasTokenAddress, // Derived from rollupID
        gasTokenNetwork, // Uses rollupID as gasTokenNetwork
        gerManagerAddress, // GER Manager address
        ethers.ZeroAddress, // polygonRollupManager (not needed for sovereign chains)
        gasTokenMetadata,
        deployParameters.bridge.bridgeManager,
        ethers.ZeroAddress, // sovereignWETHAddress,
        false, // sovereignWETHAddressIsNotMintable,
        deployParameters.bridge.emergencyBridgePauser,
        deployParameters.bridge.emergencyBridgeUnpauser,
        timelockAddress, // proxiedTokensManager set to timelock address (governance)
    );
    await initializeTx?.wait(5);
    const wrappedTokenBridgeImplementation = await bridge.getWrappedTokenBridgeImplementation();
    const bridgeLib = await bridge.bridgeLib();
    const WETH = await bridge.WETHToken();

    logger.info(`✅ AgglayerBridgeL2 implementation: ${bridgeImplementation.target}`);
    logger.info(`✅ AgglayerBridgeL2 proxy (initialized): ${bridgeProxy.target}`);

    // Import proxy into Hardhat Upgrades manifest for future upgrade compatibility
    await upgrades.forceImport(bridgeProxy.target as string, BridgeFactory, {
        kind: 'transparent',
    });
    logger.info('✅ Bridge proxy imported to Hardhat Upgrades manifest');

    return {
        proxy: bridgeProxy.target as string,
        implementation: bridgeImplementation.target as string,
        wrappedTokenBridgeImplementation,
        bridgeLib,
        WETH,
    };
}

/**
 * Deploy AgglayerGERL2 with proxy pattern using prepareUpgrade and centralized ProxyAdmin
 */
async function deployGlobalExitRootManagerL2SovereignChain(
    bridgeProxyAddress: string,
    proxyAdmin: any,
    deployer: any,
    globalExitRootUpdater: string,
): Promise<{ proxy: string; implementation: string }> {
    const GERManagerFactory = await ethers.getContractFactory('AgglayerGERL2', deployer);

    // Step 1: Deploy implementation using prepareUpgrade approach
    logger.info('📍 Step 1: Deploying GER Manager implementation...');
    const gerImplementation = await GERManagerFactory.deploy(bridgeProxyAddress); // Constructor argument
    const deployTx = gerImplementation.deploymentTransaction();
    // Wait for 5 confirmations for correct etherscan verification
    await deployTx?.wait(5);
    logger.info(`✅ AgglayerGERL2 implementation deployed: ${gerImplementation.target}`);

    // Verify GER Manager implementation on Etherscan
    await verifyContractEtherscan(
        gerImplementation.target as string,
        [bridgeProxyAddress], // Constructor argument: bridge address
        5, // 5 seconds wait time
    );

    // Step 2: Prepare initialization data for atomic initialization
    logger.info('📍 Step 2: Preparing initialization data...');
    const initializeData = GERManagerFactory.interface.encodeFunctionData('initialize', [
        globalExitRootUpdater,
        deployParameters.globalExitRoot.globalExitRootRemover,
    ]);

    // Step 3: Deploy TransparentUpgradeableProxy with centralized ProxyAdmin and atomic initialization
    logger.info('📍 Step 3: Deploying GER Manager proxy with atomic initialization...');
    const TransparentProxyFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
        deployer,
    );

    const gerProxy = await TransparentProxyFactory.deploy(
        gerImplementation.target, // Implementation address
        proxyAdmin.target, // Use centralized ProxyAdmin
        initializeData, // Initialization data for atomic initialization
    );
    const deployProxyTx = gerProxy.deploymentTransaction();
    // Wait for 5 confirmations for correct etherscan verification
    await deployProxyTx?.wait(5);
    logger.info(`✅ GER Manager proxy deployed with atomic initialization: ${gerProxy.target}`);

    // Verify GER Manager proxy on Etherscan
    await verifyContractEtherscan(
        gerProxy.target as string,
        [
            gerImplementation.target, // Implementation address
            proxyAdmin.target, // Admin address
            initializeData, // Initialization data
        ],
        5, // 5 seconds wait time
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
    );

    logger.info(`✅ AgglayerGERL2 implementation: ${gerImplementation.target}`);
    logger.info(`✅ AgglayerGERL2 proxy (initialized): ${gerProxy.target}`);

    // Import proxy into Hardhat Upgrades manifest for future upgrade compatibility
    await upgrades.forceImport(gerProxy.target as string, GERManagerFactory, {
        kind: 'transparent',
        constructorArgs: [bridgeProxyAddress],
    });
    logger.info('✅ GER Manager proxy imported to Hardhat Upgrades manifest');

    return {
        proxy: gerProxy.target as string,
        implementation: gerImplementation.target as string,
    };
}

/**
 * Deploy AggOracleCommittee contract (upgradeable proxy)
 */
async function deployAggOracleCommittee(
    gerManagerAddress: string,
    proxyAdmin: any,
    deployer: any,
): Promise<{
    proxy: string;
    implementation: string;
}> {
    const AggOracleCommitteeFactory = await ethers.getContractFactory('AggOracleCommittee', deployer);

    logger.info('📍 Step 1: Deploying AggOracleCommittee implementation...');
    const aggOracleImplementation = await AggOracleCommitteeFactory.deploy(gerManagerAddress);
    const deployTx = aggOracleImplementation.deploymentTransaction();
    // Wait for 5 confirmations for correct etherscan verification
    await deployTx?.wait(5);
    logger.info(`✅ AggOracleCommittee implementation deployed: ${aggOracleImplementation.target}`);

    // Verify AggOracleCommittee implementation on Etherscan
    await verifyContractEtherscan(
        aggOracleImplementation.target as string,
        [gerManagerAddress], // Constructor argument: GER Manager address
        5, // 5 seconds wait time
    );

    logger.info('📍 Step 2: Deploying AggOracleCommittee proxy with centralized ProxyAdmin...');
    const transparentProxyFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
        deployer,
    );

    // Prepare initialization call data
    const initializeData = AggOracleCommitteeFactory.interface.encodeFunctionData('initialize', [
        deployParameters.aggOracleCommittee.aggOracleOwner,
        deployParameters.aggOracleCommittee.aggOracleMembers,
        deployParameters.aggOracleCommittee.quorum,
    ]);

    const aggOracleProxy = await transparentProxyFactory.deploy(
        aggOracleImplementation.target, // Implementation address
        proxyAdmin.target, // Use centralized ProxyAdmin
        initializeData, // Initialization data for atomic initialization
    );
    const deployProxyTx = aggOracleProxy.deploymentTransaction();
    // Wait for 5 confirmations for correct etherscan verification
    await deployProxyTx?.wait(5);
    logger.info(`✅ AggOracleCommittee proxy deployed and initialized: ${aggOracleProxy.target}`);

    // Verify AggOracleCommittee proxy on Etherscan
    await verifyContractEtherscan(
        aggOracleProxy.target as string,
        [
            aggOracleImplementation.target, // Implementation address
            proxyAdmin.target, // Admin address
            initializeData, // Initialization data
        ],
        5, // 5 seconds wait time
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
    );

    logger.info(`✅ AggOracleCommittee implementation: ${aggOracleImplementation.target}`);

    // Import proxy into Hardhat Upgrades manifest for future upgrade compatibility
    await upgrades.forceImport(aggOracleProxy.target as string, AggOracleCommitteeFactory, {
        kind: 'transparent',
        constructorArgs: [gerManagerAddress],
    });
    logger.info('✅ AggOracleCommittee proxy imported to Hardhat Upgrades manifest');

    return {
        proxy: aggOracleProxy.target as string,
        implementation: aggOracleImplementation.target as string,
    };
}

/**
 * Generate final output JSON with deployment information
 */
function generateFinalOutput(outputJson: any, deployParams: any, actualGlobalExitRootUpdater: string): any {
    const currentDateTime = new Date().toISOString().replace('T', ' ').split('.')[0]; // YYYY-MM-DD HH:MM:SS

    const configuration: any = {
        timelockDelay: deployParams.timelock.timelockDelay,
        timelockAdmin: deployParams.timelock.timelockAdminAddress,
        bridgeManager: deployParams.bridge.bridgeManager,
        emergencyBridgePauser: deployParams.bridge.emergencyBridgePauser,
        emergencyBridgeUnpauser: deployParams.bridge.emergencyBridgeUnpauser,
        globalExitRootUpdater: actualGlobalExitRootUpdater, // Show the actual globalExitRootUpdater used
        globalExitRootRemover: deployParams.globalExitRoot.globalExitRootRemover,
    };

    // Add AggOracleCommittee configuration if it was deployed
    if (deployParams.aggOracleCommittee?.useAggOracleCommittee === true) {
        configuration.aggOracleCommittee = {
            useAggOracleCommittee: true,
            aggOracleOwner: deployParams.aggOracleCommittee.aggOracleOwner,
            aggOracleMembers: deployParams.aggOracleCommittee.aggOracleMembers,
            quorum: deployParams.aggOracleCommittee.quorum,
        };
    }

    return {
        deploymentDate: currentDateTime,
        network: {
            chainID: deployParams.network.chainID,
            rollupID: deployParams.network.rollupID,
            networkName: deployParams.network.networkName,
            gasTokenAddress: deriveGasTokenAddress(deployParams.network.rollupID),
            gasTokenNetwork: deployParams.network.rollupID,
        },
        contracts: outputJson,
        configuration,
    };
}

// =============================================================================
// VERIFICATION SYSTEM WITH ERROR RESILIENCE
// =============================================================================
// This verification system is designed to continue execution even if individual
// verification steps fail. Each verification function is wrapped in a try-catch
// block to prevent script termination, ensuring that deployment output is always
// generated regardless of verification failures. This addresses audit findings
// regarding script termination on verification errors.
// =============================================================================

// Verification result interface
interface VerificationResult {
    component: string;
    success: boolean;
    error?: string;
    details?: string[];
}

/**
 * Run comprehensive verification tests on deployed contracts
 * Organized by contract for better maintainability and specificity
 * Returns verification results instead of throwing errors to ensure script continuity
 */
async function runBasicVerification(deployConfig: any, outputJson: any): Promise<VerificationResult[]> {
    logger.info('🧪 Running comprehensive deployment verification...');
    const results: VerificationResult[] = [];

    // Step 1: Verify ProxyAdmin Contract
    const proxyAdminResult = await safeVerify('ProxyAdmin', () => verifyProxyAdminContract(outputJson));
    results.push(proxyAdminResult);

    // Step 2: Verify Timelock Contract
    const timelockResult = await safeVerify('Timelock', () => verifyTimelockContract(deployConfig, outputJson));
    results.push(timelockResult);

    // Step 3: Verify AggOracleCommittee Contract (if deployed)
    if (deployConfig.aggOracleCommittee?.useAggOracleCommittee === true) {
        const oracleResult = await safeVerify('AggOracleCommittee', () =>
            verifyAggOracleCommitteeContract(deployConfig, outputJson),
        );
        results.push(oracleResult);
    }

    // Step 4: Verify Bridge Contract
    const bridgeResult = await safeVerify('Bridge', () => verifyBridgeContract(deployConfig, outputJson));
    results.push(bridgeResult);

    // Step 5: Verify GER Manager Contract
    const gerResult = await safeVerify('GER Manager', () => verifyGERManagerContract(deployConfig, outputJson));
    results.push(gerResult);

    // Log verification summary
    logVerificationSummary(results);

    return results;
}

/**
 * Safely execute a verification function with error handling
 */
async function safeVerify(component: string, verifyFn: () => Promise<void>): Promise<VerificationResult> {
    try {
        await verifyFn();
        logger.info(`✅ ${component} verification passed`);
        return {
            component,
            success: true,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`⚠️  ${component} verification failed: ${errorMessage}`);
        return {
            component,
            success: false,
            error: errorMessage,
        };
    }
}

/**
 * Log a comprehensive verification summary
 */
function logVerificationSummary(results: VerificationResult[]) {
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    logger.info('\n📋 Verification Summary:');
    logger.info(`✅ Passed: ${successCount}/${results.length}`);

    if (failureCount > 0) {
        logger.warn(`❌ Failed: ${failureCount}/${results.length}`);
        logger.warn('\nFailed verifications:');
        results
            .filter((r) => !r.success)
            .forEach((result) => {
                logger.warn(`  - ${result.component}: ${result.error}`);
            });
        logger.warn('\n⚠️  Some verification checks failed, but deployment output has been generated.');
        logger.warn('Please review the failed checks and take appropriate action.');
    } else {
        logger.info('✅ All comprehensive verification checks passed successfully!');
    }
}

/**
 * Verify ProxyAdmin contract - address format, bytecode, ownership
 */
async function verifyProxyAdminContract(outputJson: any) {
    logger.info('🔍 Verifying ProxyAdmin contract...');

    // Verify address format and bytecode existence
    if (!ethers.isAddress(outputJson.proxyAdminAddress)) {
        throw new Error(`ProxyAdmin invalid address: ${outputJson.proxyAdminAddress}`);
    }

    const code = await ethers.provider.getCode(outputJson.proxyAdminAddress);
    if (code === '0x') {
        throw new Error(`ProxyAdmin at ${outputJson.proxyAdminAddress} has no bytecode - contract may not be deployed`);
    }
    logger.info(`✅ ProxyAdmin deployed: ${outputJson.proxyAdminAddress}`);

    // Verify ProxyAdmin configuration and ownership
    const proxyAdmin = await ethers.getContractAt(
        '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        outputJson.proxyAdminAddress,
    );

    // Verify ProxyAdmin owner is the Timelock
    const proxyAdminOwner = await proxyAdmin.owner();
    if (proxyAdminOwner.toLowerCase() !== outputJson.timelockAddress.toLowerCase()) {
        throw new Error(`ProxyAdmin owner mismatch. Expected: ${outputJson.timelockAddress}, Got: ${proxyAdminOwner}`);
    }
    logger.info(`✅ ProxyAdmin owner correctly set to Timelock: ${proxyAdminOwner}`);
}

/**
 * Verify Timelock contract - address, bytecode, configuration, roles
 */
async function verifyTimelockContract(deployConfig: any, outputJson: any) {
    logger.info('🔍 Verifying Timelock contract...');

    // Verify address format and bytecode existence
    if (!ethers.isAddress(outputJson.timelockAddress)) {
        throw new Error(`Timelock invalid address: ${outputJson.timelockAddress}`);
    }

    const code = await ethers.provider.getCode(outputJson.timelockAddress);
    if (code === '0x') {
        throw new Error(`Timelock at ${outputJson.timelockAddress} has no bytecode - contract may not be deployed`);
    }
    logger.info(`✅ Timelock deployed: ${outputJson.timelockAddress}`);

    // Verify Timelock configuration
    const timelock = await ethers.getContractAt(
        '@openzeppelin/contracts/governance/TimelockController.sol:TimelockController',
        outputJson.timelockAddress,
    );

    // Verify minimum delay
    const minDelay = await timelock.getMinDelay();
    if (minDelay !== BigInt(deployConfig.timelock.timelockDelay)) {
        throw new Error(`Timelock delay mismatch. Expected: ${deployConfig.timelock.timelockDelay}, Got: ${minDelay}`);
    }
    logger.info(`✅ Timelock minimum delay: ${minDelay}s`);

    // Verify that timelockAdminAddress has the required roles

    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
    const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');
    const CANCELLER_ROLE = ethers.id('CANCELLER_ROLE');

    const hasAdminRole = await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployConfig.timelock.timelockAdminAddress);
    const hasProposerRole = await timelock.hasRole(PROPOSER_ROLE, deployConfig.timelock.timelockAdminAddress);
    const hasExecutorRole = await timelock.hasRole(EXECUTOR_ROLE, deployConfig.timelock.timelockAdminAddress);
    const hasCancelerRole = await timelock.hasRole(CANCELLER_ROLE, deployConfig.timelock.timelockAdminAddress);

    if (!hasAdminRole) {
        throw new Error(
            `TimelockAdminAddress ${deployConfig.timelock.timelockAdminAddress} does not have DEFAULT_ADMIN_ROLE`,
        );
    }
    if (!hasProposerRole) {
        throw new Error(
            `TimelockAdminAddress ${deployConfig.timelock.timelockAdminAddress} does not have PROPOSER_ROLE`,
        );
    }
    if (!hasExecutorRole) {
        throw new Error(
            `TimelockAdminAddress ${deployConfig.timelock.timelockAdminAddress} does not have EXECUTOR_ROLE`,
        );
    }
    if (!hasCancelerRole) {
        throw new Error(
            `TimelockAdminAddress ${deployConfig.timelock.timelockAdminAddress} does not have CANCELLER_ROLE`,
        );
    }

    logger.info(`✅ TimelockAdminAddress ${deployConfig.timelock.timelockAdminAddress} has all required roles`);
}

/**
 * Verify Bridge contract - address, bytecode, initialization, configuration, immutables
 */
async function verifyBridgeContract(deployConfig: any, outputJson: any) {
    logger.info('🔍 Verifying Bridge contract...');

    // Verify proxy address format and bytecode existence
    if (!ethers.isAddress(outputJson.bridgeL2SovereignChainAddress)) {
        throw new Error(`Bridge proxy invalid address: ${outputJson.bridgeL2SovereignChainAddress}`);
    }

    const proxyCode = await ethers.provider.getCode(outputJson.bridgeL2SovereignChainAddress);
    if (proxyCode === '0x') {
        throw new Error(`Bridge proxy at ${outputJson.bridgeL2SovereignChainAddress} has no bytecode`);
    }
    logger.info(`✅ Bridge proxy deployed: ${outputJson.bridgeL2SovereignChainAddress}`);

    // Verify implementation address format and bytecode existence
    if (!ethers.isAddress(outputJson.bridgeL2SovereignChainImplementation)) {
        throw new Error(`Bridge implementation invalid address: ${outputJson.bridgeL2SovereignChainImplementation}`);
    }

    const implCode = await ethers.provider.getCode(outputJson.bridgeL2SovereignChainImplementation);
    if (implCode === '0x') {
        throw new Error(`Bridge implementation at ${outputJson.bridgeL2SovereignChainImplementation} has no bytecode`);
    }
    logger.info(`✅ Bridge implementation deployed: ${outputJson.bridgeL2SovereignChainImplementation}`);

    // Verify Bridge initialization (slot 0 for OpenZeppelin initializer)
    const initializerSlot = await ethers.provider.getStorage(outputJson.bridgeL2SovereignChainAddress, 0);
    const initializerVersion = ethers.toBigInt(initializerSlot);
    if (initializerVersion === 0n) {
        throw new Error('Bridge appears to not be initialized (initializer version is 0)');
    }
    logger.info(`✅ Bridge is initialized (version: ${initializerVersion})`);

    // Verify Bridge configuration
    const bridge = (await ethers.getContractAt('AgglayerBridgeL2', outputJson.bridgeL2SovereignChainAddress)) as any;

    // Verify network ID
    const networkID = await bridge.networkID();
    if (Number(networkID) !== deployConfig.network.rollupID) {
        throw new Error(`Bridge networkID mismatch. Expected: ${deployConfig.network.rollupID}, Got: ${networkID}`);
    }
    logger.info(`✅ Bridge networkID: ${networkID}`);

    // Verify gas token address (derived from rollupID)
    const gasTokenAddress = await bridge.gasTokenAddress();
    const expectedGasTokenAddress = deriveGasTokenAddress(deployConfig.network.rollupID);
    if (gasTokenAddress.toLowerCase() !== expectedGasTokenAddress.toLowerCase()) {
        throw new Error(
            `Bridge gasTokenAddress mismatch. Expected: ${expectedGasTokenAddress}, Got: ${gasTokenAddress}`,
        );
    }
    logger.info(`✅ Bridge gasTokenAddress: ${gasTokenAddress} (derived from rollupID)`);

    // Verify gas token network
    const gasTokenNetwork = await bridge.gasTokenNetwork();
    if (Number(gasTokenNetwork) !== deployConfig.network.rollupID) {
        throw new Error(
            `Bridge gasTokenNetwork mismatch. Expected: ${deployConfig.network.rollupID}, Got: ${gasTokenNetwork}`,
        );
    }
    logger.info(`✅ Bridge gasTokenNetwork: ${gasTokenNetwork}`);

    // Verify gas token metadata
    const gasTokenMetadata = await bridge.gasTokenMetadata();
    const expectedMetadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        [deployConfig.network.tokenName, deployConfig.network.tokenSymbol, deployConfig.network.tokenDecimals],
    );
    if (gasTokenMetadata !== expectedMetadata) {
        throw new Error(`Bridge gasTokenMetadata mismatch. Expected: ${expectedMetadata}, Got: ${gasTokenMetadata}`);
    }
    logger.info(`✅ Bridge gasTokenMetadata correctly encoded`);

    // Verify bridge manager
    const bridgeManager = await bridge.bridgeManager();
    if (bridgeManager.toLowerCase() !== deployConfig.bridge.bridgeManager.toLowerCase()) {
        throw new Error(
            `Bridge manager mismatch. Expected: ${deployConfig.bridge.bridgeManager}, Got: ${bridgeManager}`,
        );
    }
    logger.info(`✅ Bridge manager: ${bridgeManager}`);

    // Verify emergency bridge pauser
    const emergencyBridgePauser = await bridge.emergencyBridgePauser();
    if (emergencyBridgePauser.toLowerCase() !== deployConfig.bridge.emergencyBridgePauser.toLowerCase()) {
        throw new Error(
            `Emergency bridge pauser mismatch. Expected: ${deployConfig.bridge.emergencyBridgePauser}, Got: ${emergencyBridgePauser}`,
        );
    }
    logger.info(`✅ Emergency bridge pauser: ${emergencyBridgePauser}`);

    // Verify emergency bridge unpauser
    const emergencyBridgeUnpauser = await bridge.emergencyBridgeUnpauser();
    if (emergencyBridgeUnpauser.toLowerCase() !== deployConfig.bridge.emergencyBridgeUnpauser.toLowerCase()) {
        throw new Error(
            `Emergency bridge unpauser mismatch. Expected: ${deployConfig.bridge.emergencyBridgeUnpauser}, Got: ${emergencyBridgeUnpauser}`,
        );
    }
    logger.info(`✅ Emergency bridge unpauser: ${emergencyBridgeUnpauser}`);

    // Verify proxied tokens manager (should be timelock)
    const proxiedTokensManager = await bridge.proxiedTokensManager();
    if (proxiedTokensManager.toLowerCase() !== outputJson.timelockAddress.toLowerCase()) {
        throw new Error(
            `Proxied tokens manager mismatch. Expected: ${outputJson.timelockAddress}, Got: ${proxiedTokensManager}`,
        );
    }
    logger.info(`✅ Proxied tokens manager: ${proxiedTokensManager} (set to timelock)`);

    // Verify rollup manager is zero address (not used in sovereign chains)
    const rollupManager = await bridge.polygonRollupManager();
    if (rollupManager !== ethers.ZeroAddress) {
        throw new Error(`Bridge rollup manager should be zero address for sovereign chains. Got: ${rollupManager}`);
    }
    logger.info(`✅ Bridge rollup manager: ${rollupManager} (zero address for sovereign chains)`);

    // Verify Bridge points to GER Manager
    const bridgeGERManager = await bridge.globalExitRootManager();
    if (bridgeGERManager.toLowerCase() !== outputJson.globalExitRootManagerL2SovereignChainAddress.toLowerCase()) {
        throw new Error(
            `Bridge -> GER Manager dependency broken. Expected: ${outputJson.globalExitRootManagerL2SovereignChainAddress}, Got: ${bridgeGERManager}`,
        );
    }
    logger.info(`✅ Bridge -> GER Manager: ${bridgeGERManager}`);

    const wrappedTokenImplementation = await bridge.getWrappedTokenBridgeImplementation();
    if (wrappedTokenImplementation.toLowerCase() !== outputJson.wrappedTokenBridgeImplementation.toLowerCase()) {
        throw new Error(
            `Wrapped token implementation mismatch. Expected: ${outputJson.wrappedTokenBridgeImplementation}, Got: ${wrappedTokenImplementation}`,
        );
    }
    // Verify bytecode exists
    const implCode2 = await ethers.provider.getCode(wrappedTokenImplementation);
    if (implCode2 === '0x') {
        throw new Error(`WrappedTokenBridgeImplementation at ${wrappedTokenImplementation} has no bytecode`);
    }
    logger.info(`✅ Bridge wrappedTokenBridgeImplementation: ${wrappedTokenImplementation} (bytecode confirmed)`);

    // Verify bridgeLib
    const bridgeLib = await bridge.bridgeLib();
    if (bridgeLib.toLowerCase() !== outputJson.bridgeLib.toLowerCase()) {
        throw new Error(`Bridge library mismatch. Expected: ${outputJson.bridgeLib}, Got: ${bridgeLib}`);
    }

    // Verify WETH token was deployed
    const wethToken = await bridge.WETHToken();
    if (wethToken.toLowerCase() !== outputJson.WETH.toLowerCase()) {
        throw new Error(`WETH token mismatch. Expected: ${outputJson.WETH}, Got: ${wethToken}`);
    }
    // Verify WETH bytecode exists
    const wethCode = await ethers.provider.getCode(wethToken);
    if (wethCode === '0x') {
        throw new Error(`WETH token at ${wethToken} has no bytecode`);
    }
    logger.info(`✅ WETH token deployed: ${wethToken} (bytecode confirmed)`);

    // Verify WETH token implementation matches wrappedTokenBridgeImplementation
    const wethImplementationSlot = await ethers.provider.getStorage(
        wethToken,
        '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', // EIP-1967 implementation slot
    );
    const wethImplementationAddress = ethers.getAddress(`0x${wethImplementationSlot.slice(-40)}`);

    if (wethImplementationAddress.toLowerCase() !== wrappedTokenImplementation.toLowerCase()) {
        throw new Error(
            `WETH implementation mismatch. Expected: ${wrappedTokenImplementation}, Got: ${wethImplementationAddress}`,
        );
    }
    logger.info(
        `✅ WETH token implementation correctly matches wrappedTokenBridgeImplementation: ${wethImplementationAddress}`,
    );

    // Verify ProxyAdmin is the admin
    const bridgeProxyAdmin = await ethers.provider.getStorage(
        outputJson.bridgeL2SovereignChainAddress,
        '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103', // EIP-1967 admin slot
    );
    const expectedAdmin = ethers.zeroPadValue(outputJson.proxyAdminAddress.toLowerCase(), 32);
    if (bridgeProxyAdmin.toLowerCase() !== expectedAdmin.toLowerCase()) {
        throw new Error(`Bridge proxy admin mismatch. Expected: ${expectedAdmin}, Got: ${bridgeProxyAdmin}`);
    }
}

/**
 * Verify GER Manager contract - address, bytecode, initialization (slot 52), configuration, immutables
 */
async function verifyGERManagerContract(deployConfig: any, outputJson: any) {
    logger.info('🔍 Verifying GER Manager contract...');

    // Verify proxy address format and bytecode existence
    if (!ethers.isAddress(outputJson.globalExitRootManagerL2SovereignChainAddress)) {
        throw new Error(
            `GER Manager proxy invalid address: ${outputJson.globalExitRootManagerL2SovereignChainAddress}`,
        );
    }

    const proxyCode = await ethers.provider.getCode(outputJson.globalExitRootManagerL2SovereignChainAddress);
    if (proxyCode === '0x') {
        throw new Error(
            `GER Manager proxy at ${outputJson.globalExitRootManagerL2SovereignChainAddress} has no bytecode`,
        );
    }
    logger.info(`✅ GER Manager proxy deployed: ${outputJson.globalExitRootManagerL2SovereignChainAddress}`);

    // Verify implementation address format and bytecode existence
    if (!ethers.isAddress(outputJson.globalExitRootManagerL2SovereignChainImplementation)) {
        throw new Error(
            `GER Manager implementation invalid address: ${outputJson.globalExitRootManagerL2SovereignChainImplementation}`,
        );
    }

    const implCode = await ethers.provider.getCode(outputJson.globalExitRootManagerL2SovereignChainImplementation);
    if (implCode === '0x') {
        throw new Error(
            `GER Manager implementation at ${outputJson.globalExitRootManagerL2SovereignChainImplementation} has no bytecode`,
        );
    }
    logger.info(
        `✅ GER Manager implementation deployed: ${outputJson.globalExitRootManagerL2SovereignChainImplementation}`,
    );

    // Verify GER Manager initialization (slot 52 for this specific contract)
    const initializerSlot = await ethers.provider.getStorage(
        outputJson.globalExitRootManagerL2SovereignChainAddress,
        52,
    );
    if (initializerSlot.endsWith('0000')) {
        throw new Error('GER Manager appears to not be initialized (initializer version in slot 52 is 0)');
    }
    logger.info(`✅ GER Manager is initialized (slot 52 version: ${initializerSlot.slice(-4)})`);

    // Verify GER Manager configuration
    const gerManager = (await ethers.getContractAt(
        'AgglayerGERL2',
        outputJson.globalExitRootManagerL2SovereignChainAddress,
    )) as any;

    // Verify global exit root updater
    const globalExitRootUpdater = await gerManager.globalExitRootUpdater();

    // Determine expected globalExitRootUpdater based on whether AggOracleCommittee is used
    let expectedUpdater: string;
    if (deployConfig.aggOracleCommittee?.useAggOracleCommittee === true) {
        // When using AggOracleCommittee, it should be the updater
        expectedUpdater = outputJson.aggOracleCommitteeAddress;
    } else {
        // When not using AggOracleCommittee, use the configured updater
        expectedUpdater = deployConfig.globalExitRoot.globalExitRootUpdater;
    }

    if (globalExitRootUpdater.toLowerCase() !== expectedUpdater.toLowerCase()) {
        throw new Error(`GER updater mismatch. Expected: ${expectedUpdater}, Got: ${globalExitRootUpdater}`);
    }
    logger.info(`✅ GER Manager updater: ${globalExitRootUpdater}`);

    // Verify global exit root remover
    const globalExitRootRemover = await gerManager.globalExitRootRemover();
    if (globalExitRootRemover.toLowerCase() !== deployConfig.globalExitRoot.globalExitRootRemover.toLowerCase()) {
        throw new Error(
            `GER remover mismatch. Expected: ${deployConfig.globalExitRoot.globalExitRootRemover}, Got: ${globalExitRootRemover}`,
        );
    }
    logger.info(`✅ GER Manager remover: ${globalExitRootRemover}`);

    // Verify bridge address (immutable) and dependency
    const bridgeAddress = await gerManager.bridgeAddress();
    if (bridgeAddress.toLowerCase() !== outputJson.bridgeL2SovereignChainAddress.toLowerCase()) {
        throw new Error(
            `GER Manager bridge address mismatch. Expected: ${outputJson.bridgeL2SovereignChainAddress}, Got: ${bridgeAddress}`,
        );
    }
    logger.info(`✅ GER Manager -> Bridge: ${bridgeAddress}`);

    const gerProxyAdmin = await ethers.provider.getStorage(
        outputJson.globalExitRootManagerL2SovereignChainAddress,
        '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103', // EIP-1967 admin slot
    );

    const expectedAdmin = ethers.zeroPadValue(outputJson.proxyAdminAddress.toLowerCase(), 32);

    if (gerProxyAdmin.toLowerCase() !== expectedAdmin.toLowerCase()) {
        throw new Error(`GER Manager proxy admin mismatch. Expected: ${expectedAdmin}, Got: ${gerProxyAdmin}`);
    }
    logger.info(`✅ ProxyAdmin correctly manages GER Manager proxy`);
}

/**
 * Verify AggOracleCommittee contract - address, bytecode, initialization, configuration, immutables
 */
async function verifyAggOracleCommitteeContract(deployConfig: any, outputJson: any) {
    logger.info('🔍 Verifying AggOracleCommittee contract...');

    // Verify proxy address format and bytecode existence
    if (!ethers.isAddress(outputJson.aggOracleCommitteeAddress)) {
        throw new Error(`AggOracleCommittee proxy invalid address: ${outputJson.aggOracleCommitteeAddress}`);
    }

    const proxyCode = await ethers.provider.getCode(outputJson.aggOracleCommitteeAddress);
    if (proxyCode === '0x') {
        throw new Error(`AggOracleCommittee proxy at ${outputJson.aggOracleCommitteeAddress} has no bytecode`);
    }
    logger.info(`✅ AggOracleCommittee proxy deployed: ${outputJson.aggOracleCommitteeAddress}`);

    // Verify implementation address format and bytecode existence
    if (!ethers.isAddress(outputJson.aggOracleCommitteeImplementation)) {
        throw new Error(
            `AggOracleCommittee implementation invalid address: ${outputJson.aggOracleCommitteeImplementation}`,
        );
    }

    const implCode = await ethers.provider.getCode(outputJson.aggOracleCommitteeImplementation);
    if (implCode === '0x') {
        throw new Error(
            `AggOracleCommittee implementation at ${outputJson.aggOracleCommitteeImplementation} has no bytecode`,
        );
    }
    logger.info(`✅ AggOracleCommittee implementation deployed: ${outputJson.aggOracleCommitteeImplementation}`);

    // Verify AggOracleCommittee initialization (slot 0 for OpenZeppelin initializer)
    const initializerSlot = await ethers.provider.getStorage(outputJson.aggOracleCommitteeAddress, 0);
    const initializerVersion = ethers.toBigInt(initializerSlot);
    if (initializerVersion === 0n) {
        throw new Error('AggOracleCommittee appears to not be initialized (initializer version is 0)');
    }
    logger.info(`✅ AggOracleCommittee is initialized (version: ${initializerVersion})`);

    // Verify AggOracleCommittee configuration
    const aggOracle = (await ethers.getContractAt('AggOracleCommittee', outputJson.aggOracleCommitteeAddress)) as any;

    // Verify owner (from OwnableUpgradeable)
    const owner = await aggOracle.owner();
    if (owner.toLowerCase() !== deployConfig.aggOracleCommittee.aggOracleOwner.toLowerCase()) {
        throw new Error(
            `AggOracleCommittee owner mismatch. Expected: ${deployConfig.aggOracleCommittee.aggOracleOwner}, Got: ${owner}`,
        );
    }
    logger.info(`✅ AggOracleCommittee owner: ${owner}`);

    // Verify quorum
    const quorum = await aggOracle.quorum();
    if (Number(quorum) !== deployConfig.aggOracleCommittee.quorum) {
        throw new Error(
            `AggOracleCommittee quorum mismatch. Expected: ${deployConfig.aggOracleCommittee.quorum}, Got: ${quorum}`,
        );
    }
    logger.info(`✅ AggOracleCommittee quorum: ${quorum}`);

    // Verify aggOracleMembers (compare lengths and check if all expected members are present)
    const expectedMembers = deployConfig.aggOracleCommittee.aggOracleMembers.map((member: string) =>
        member.toLowerCase(),
    );
    const actualMembersCount = await aggOracle.getAggOracleMembersCount();

    if (Number(actualMembersCount) !== expectedMembers.length) {
        throw new Error(
            `AggOracleCommittee members length mismatch. Expected: ${expectedMembers.length}, Got: ${actualMembersCount}`,
        );
    }

    // Check each member individually
    for (let i = 0; i < expectedMembers.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        const actualMember = await aggOracle.aggOracleMembers(i);
        if (!expectedMembers.includes(actualMember.toLowerCase())) {
            throw new Error(
                `AggOracleCommittee member at index ${i} not expected. Got: ${actualMember}, Expected one of: ${expectedMembers.join(', ')}`,
            );
        }
    }
    logger.info(`✅ AggOracleCommittee has ${actualMembersCount} members matching configuration`);

    // Verify globalExitRootManagerL2Sovereign (immutable) and dependency
    const gerManagerAddress = await aggOracle.globalExitRootManagerL2Sovereign();
    if (gerManagerAddress.toLowerCase() !== outputJson.globalExitRootManagerL2SovereignChainAddress.toLowerCase()) {
        throw new Error(
            `AggOracleCommittee globalExitRootManagerL2Sovereign mismatch. Expected: ${outputJson.globalExitRootManagerL2SovereignChainAddress}, Got: ${gerManagerAddress}`,
        );
    }
    logger.info(`✅ AggOracleCommittee -> GER Manager: ${gerManagerAddress}`);

    // Verify ProxyAdmin is the admin
    const aggOracleProxyAdmin = await ethers.provider.getStorage(
        outputJson.aggOracleCommitteeAddress,
        '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103', // EIP-1967 admin slot
    );

    const expectedAdmin = ethers.zeroPadValue(outputJson.proxyAdminAddress.toLowerCase(), 32);

    if (aggOracleProxyAdmin.toLowerCase() !== expectedAdmin.toLowerCase()) {
        throw new Error(
            `AggOracleCommittee proxy admin mismatch. Expected: ${expectedAdmin}, Got: ${aggOracleProxyAdmin}`,
        );
    }
    logger.info(`✅ ProxyAdmin correctly manages AggOracleCommittee proxy`);
}

// Execute deployment
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            // eslint-disable-next-line no-console
            console.log(error);
            logger.error('❌ Deployment failed:', error);
            process.exit(1);
        });
}

export { main };

/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
// external dependencies
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers, hardhatArguments } from 'hardhat';

// internal dependencies
import { AgglayerManager, AgglayerBridge } from '../../typechain-types';
import '../../deployment/helpers/utils';
import { checkParams, getGitInfo } from '../../src/utils';
import { logger } from '../../src/logger';
import { formatGenesis } from './helpers';
import { createGenesisAnvil } from '../../src/genesis-anvil/create-genesis-anvil';

// read files
import createGenesisSovereignParams from './create-genesis-sovereign-params.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// script utils
const dateStr = new Date().toISOString();

async function main() {
    logger.warn('This code has not been audited yet.');
    logger.info('Start create-sovereign-genesis tool');

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = [
        'rollupManagerAddress',
        'network.rollupID',
        'bridge.bridgeManager',
        'bridge.gasTokenAddress',
        'bridge.sovereignWETHAddress',
        'bridge.sovereignWETHAddressIsNotMintable',
        'globalExitRoot.globalExitRootRemover',
        'bridge.emergencyBridgePauser',
        'bridge.emergencyBridgeUnpauser',
        'bridge.proxiedTokensManager',
        'preMintAccounts.setPreMintAccounts',
        'timelock.adminAddress',
        'timelock.minDelay',
        'aggOracleCommittee.useAggOracleCommittee',
    ];

    // check global parameters
    checkParams(createGenesisSovereignParams, mandatoryParameters);

    // get parameters to easier access
    const { preMintAccounts, network, timelock, rollupManagerAddress, globalExitRoot, bridge, aggOracleCommittee } =
        createGenesisSovereignParams;

    // check preMintedAccounts parameters
    if (preMintAccounts.setPreMintAccounts === true) {
        const { accounts } = preMintAccounts;
        if (accounts === undefined) {
            logger.error('setPreMintAccounts is set to true but missing parameter preMintAccounts');
            process.exit(1);
        }

        // Check all preMintAccounts parameters
        accounts.forEach((preMintAccount) => {
            const paramsPreMintAccount = ['balance', 'address'];
            checkParams(preMintAccount, paramsPreMintAccount);
            if (ethers.isAddress(preMintAccount.address) === false) {
                logger.error(`preMintAccount.address ${preMintAccount.address}: not a valid address`);
                process.exit(1);
            }
        });
    }

    const anvilPort =
        typeof createGenesisSovereignParams.anvilPort !== 'undefined' ? createGenesisSovereignParams.anvilPort : 8546; // default anvil port

    /// //////////////////////////////////////////
    ///    CHECK SC PARAMS & ON-CHAIN DATA    ///
    /// //////////////////////////////////////////
    logger.info('Check SovereignBridge requirements for its correct initialization');

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
    const rollupManagerContract = PolygonRollupManagerFactory.attach(rollupManagerAddress) as AgglayerManager;

    // Checks like in bridge contract
    if (
        ethers.isAddress(bridge.gasTokenAddress) &&
        bridge.gasTokenAddress !== ethers.ZeroAddress &&
        bridge.sovereignWETHAddress === ethers.ZeroAddress &&
        bridge.sovereignWETHAddressIsNotMintable === true
    ) {
        throw new Error(
            'InvalidSovereignWETHAddressParams: if gasTokenAddress is not 0x0, and sovereignWETHAddress is 0x0, sovereignWETHAddressIsNotMintable must be false',
        );
    }

    if (
        bridge.gasTokenAddress === ethers.ZeroAddress &&
        (bridge.sovereignWETHAddress !== ethers.ZeroAddress || bridge.sovereignWETHAddressIsNotMintable === true)
    ) {
        throw new Error(
            'InvalidSovereignWETHAddressParams: If gasTokenAddress is 0x0, sovereignWETHAddress must be 0x0 and sovereignWETHAddressIsNotMintable must be false',
        );
    }

    // Create output
    const outputJson = {} as any;

    // get token information
    let gasTokenAddress;
    let gasTokenNetwork;
    let gasTokenMetadata;

    // Get bridge instance
    const bridgeFactory = await ethers.getContractFactory('AgglayerBridge');
    const bridgeContractAddress = await rollupManagerContract.bridgeAddress();
    const bridgeBalance = await ethers.provider.getBalance(bridgeContractAddress);
    const rollupBridgeContract = bridgeFactory.attach(bridgeContractAddress) as AgglayerBridge;
    const gerManagerAddress = await rollupManagerContract.globalExitRootManager();

    if (ethers.isAddress(bridge.gasTokenAddress) && bridge.gasTokenAddress !== ethers.ZeroAddress) {
        logger.info('Getting data from the gasTokenAddress');
        // Get token metadata
        gasTokenMetadata = await rollupBridgeContract.getTokenMetadata(bridge.gasTokenAddress);
        outputJson.gasTokenMetadata = gasTokenMetadata;
        // If gas token metadata includes `0x124e4f545f56414c49445f454e434f44494e47 (NOT_VALID_ENCODING)` means there is no erc20 token deployed at the selected gas token network
        if (gasTokenMetadata.includes('124e4f545f56414c49445f454e434f44494e47')) {
            throw new Error(
                `Invalid gas token address, no ERC20 token deployed at the selected gas token network ${bridge.gasTokenAddress}`,
            );
        }
        const wrappedData = await rollupBridgeContract.wrappedTokenToTokenInfo(bridge.gasTokenAddress);
        if (wrappedData.originNetwork !== 0n) {
            // Wrapped token
            gasTokenAddress = wrappedData.originTokenAddress;
            gasTokenNetwork = wrappedData.originNetwork;
        } else {
            // Mainnet token
            gasTokenAddress = bridge.gasTokenAddress;
            gasTokenNetwork = 0n;
        }
    } else {
        gasTokenAddress = ethers.ZeroAddress;
        gasTokenNetwork = 0;
        gasTokenMetadata = '0x';
    }

    /// /////////////////////////////////
    ///    FINAL GENESIS CREATION    ///
    /// /////////////////////////////////

    // initialize sovereign bridge parameters
    const initializeParams: {
        rollupID: number;
        gasTokenAddress: string;
        gasTokenNetwork: number | bigint;
        polygonRollupManager: string;
        gasTokenMetadata: string;
        bridgeManager: string;
        sovereignWETHAddress: string;
        sovereignWETHAddressIsNotMintable: boolean;
        globalExitRootRemover: string;
        emergencyBridgePauser: string;
        emergencyBridgeUnpauser: string;
        proxiedTokensManager: string;
        useAggOracleCommittee: boolean;
        globalExitRootUpdater?: string;
        aggOracleMembers?: string[];
        quorum?: number;
        aggOracleOwner?: string;
        timelockOwner: string;
        timelockMinDelay: number;
        anvilPort: number;
        bridgeContractAddress: string;
        bridgeBalance: bigint;
        gerManagerAddress: string;
    } = {
        rollupID: network.rollupID,
        gasTokenAddress,
        gasTokenNetwork,
        polygonRollupManager: ethers.ZeroAddress,
        gasTokenMetadata,
        bridgeManager: bridge.bridgeManager,
        sovereignWETHAddress: bridge.sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable: bridge.sovereignWETHAddressIsNotMintable,
        globalExitRootRemover: globalExitRoot.globalExitRootRemover,
        emergencyBridgePauser: bridge.emergencyBridgePauser,
        emergencyBridgeUnpauser: bridge.emergencyBridgeUnpauser,
        proxiedTokensManager: bridge.proxiedTokensManager,
        useAggOracleCommittee: aggOracleCommittee.useAggOracleCommittee,
        timelockOwner: timelock.adminAddress,
        timelockMinDelay: timelock.minDelay,
        bridgeContractAddress,
        bridgeBalance,
        gerManagerAddress,
        anvilPort,
    };

    if (aggOracleCommittee.useAggOracleCommittee === false) {
        checkParams(globalExitRoot, ['globalExitRootUpdater']);
        initializeParams.globalExitRootUpdater = globalExitRoot.globalExitRootUpdater;
    } else {
        // AggOracleCommittee parameters
        checkParams(aggOracleCommittee, ['aggOracleMembers', 'quorum', 'aggOracleOwner']);
        initializeParams.aggOracleMembers = aggOracleCommittee.aggOracleMembers;
        initializeParams.quorum = aggOracleCommittee.quorum;
        initializeParams.aggOracleOwner = aggOracleCommittee.aggOracleOwner;
    }
    logger.info('Update genesis-base to the SovereignContracts');

    const finalGenesis = await createGenesisAnvil(initializeParams);

    // set preMintAccounts
    let totalPreMintedAmount = BigInt(0);
    if (preMintAccounts.setPreMintAccounts === true) {
        logger.info('Add preMintAccounts');

        // iterate over all premintAccounts
        for (let i = 0; i < preMintAccounts.accounts.length; i++) {
            const preMintAccount = preMintAccounts.accounts[i];

            // check if preMintAccount is in the current genesis
            const preMintAccountExist = finalGenesis.genesis[preMintAccount.address];
            if (typeof preMintAccountExist !== 'undefined') {
                // check if preMintAccount has code
                if (preMintAccountExist.bytecode !== undefined) {
                    logger.error(`preMintAccount ${preMintAccount.address} code is not empty`);
                    process.exit(1);
                }
                preMintAccountExist.balance = BigInt(preMintAccount.balance).toString();
            } else {
                // add preMintAccount.address & preMintAccount.balance
                finalGenesis.genesis[preMintAccount.address] = {
                    balance: BigInt(preMintAccount.balance).toString(),
                };
            }

            totalPreMintedAmount += BigInt(preMintAccount.balance);
        }
    }

    // format genesis
    finalGenesis.genesis = formatGenesis(finalGenesis.genesis, 'geth');

    // get L1 information
    logger.info(`Getting L1 information`);
    const RollupManagerInfo = {} as any;

    const rollupData = await rollupManagerContract.rollupIDToRollupData(network.rollupID);

    RollupManagerInfo.bridgeAddress = await rollupManagerContract.bridgeAddress();
    RollupManagerInfo.globalExitRootManager = await rollupManagerContract.globalExitRootManager();
    RollupManagerInfo.pol = await rollupManagerContract.pol();
    RollupManagerInfo.rollupData = {
        rollupID: network.rollupID,
        rollupAddress: rollupData[0],
    };

    // Populate final output
    const gitInfo = getGitInfo();
    outputJson.gitInfo = gitInfo;
    outputJson.network = hardhatArguments.network;
    outputJson.rollupManagerAddress = rollupManagerAddress;
    outputJson.RollupManagerInfo = RollupManagerInfo;
    outputJson.bridge = {
        gasTokenAddress,
        gasTokenNetwork,
        gasTokenMetadata,
        bridgeManager: bridge.bridgeManager,
        sovereignWETHAddress: bridge.sovereignWETHAddress,
        sovereignWETHAddressIsNotMintable: bridge.sovereignWETHAddressIsNotMintable,
        emergencyBridgePauser: bridge.emergencyBridgePauser,
        emergencyBridgeUnpauser: bridge.emergencyBridgeUnpauser,
        proxiedTokensManager: bridge.proxiedTokensManager,
    };
    outputJson.globalExitRoot = {
        globalExitRootRemover: globalExitRoot.globalExitRootRemover,
    };
    outputJson.outputAddresses = finalGenesis.outputAddresses;

    if (preMintAccounts.setPreMintAccounts === true) {
        outputJson.preMintAccounts = {
            accounts: preMintAccounts.accounts,
            totalPreMintedAmount: totalPreMintedAmount.toString(),
        };
    }
    outputJson.timelockParameters = timelock;

    if (aggOracleCommittee.useAggOracleCommittee === true) {
        outputJson.aggOracleCommittee = {
            useAggOracleCommittee: true,
            aggOracleMembers: aggOracleCommittee.aggOracleMembers,
            quorum: aggOracleCommittee.quorum,
            aggOracleOwner: aggOracleCommittee.aggOracleOwner,
        };
    } else {
        outputJson.aggOracleCommittee.useAggOracleCommittee = false;
        outputJson.globalExitRoot.globalExitRootUpdater = globalExitRoot.globalExitRootUpdater;
    }

    if (typeof finalGenesis.outputAddresses.WETHToken !== 'undefined') {
        outputJson.WETHAddress = finalGenesis.outputAddresses.WETHToken;
    }

    /// ////////////////////////////////
    ///      WRITE FINAL FILES      ///
    /// ////////////////////////////////
    logger.info('Writing final output files');

    // path output genesis
    const pathOutputGenesisJson = createGenesisSovereignParams.outputGenesisPath
        ? path.join(__dirname, createGenesisSovereignParams.outputGenesisPath)
        : path.join(__dirname, `./genesis-rollupID-${network.rollupID}__${dateStr}.json`);

    const pathOutputJson = createGenesisSovereignParams.outputPath
        ? path.join(__dirname, createGenesisSovereignParams.outputPath)
        : path.join(__dirname, `./output-rollupID-${network.rollupID}__${dateStr}.json`);

    // write files
    fs.writeFileSync(pathOutputGenesisJson, JSON.stringify(finalGenesis.genesis, null, 2));
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 2));

    logger.info('Output saved at:');
    logger.info(`   output genesis: ${pathOutputGenesisJson}`);
    logger.info(`   output info   : ${pathOutputJson}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

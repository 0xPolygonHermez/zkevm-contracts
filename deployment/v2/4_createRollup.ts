/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { processorUtils, Constants } from '@0xpolygonhermez/zkevm-commonjs';
import '../helpers/utils';

import * as utilsECDSA from '../../src/utils-aggchain-ECDSA';
import * as utilsFEP from '../../src/utils-aggchain-FEP';
import * as utilsAggchain from '../../src/utils-common-aggchain';
import * as utilsPP from '../../src/pessimistic-utils';
import {
    PolygonRollupManager,
    PolygonZkEVMEtrog,
    PolygonZkEVMBridgeV2,
    PolygonValidiumEtrog,
    PolygonPessimisticConsensus,
    AggLayerGateway,
} from '../../typechain-types';
import createRollupParameters from './create_rollup_parameters.json';
import deployOutput from './deploy_output.json';
import updateVanillaGenesis from './utils/updateVanillaGenesis';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pathGenesis = path.join(__dirname, './genesis.json');
const pathGenesisSovereign = path.join(__dirname, './genesis_sovereign.json');

// eslint-disable-next-line import/no-dynamic-require, @typescript-eslint/no-var-requires
let genesis = require(pathGenesis);

const dateStr = new Date().toISOString();
const pathOutputJson = path.join(__dirname, `./create_rollup_output_${dateStr}.json`);

async function main() {
    const attemptsDeployProxy = 20;

    const outputJson = {} as any;

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fullfilled
     */
    const mandatoryDeploymentParameters = [
        'trustedSequencerURL',
        'networkName',
        'description',
        'trustedSequencer',
        'chainID',
        'adminZkEVM',
        'forkID',
        'consensusContract',
        'programVKey',
    ];

    // eslint-disable-next-line no-restricted-syntax
    for (const parameterName of mandatoryDeploymentParameters) {
        if (createRollupParameters[parameterName] === undefined || createRollupParameters[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        realVerifier,
        trustedSequencerURL,
        networkName,
        description,
        trustedSequencer,
        chainID,
        adminZkEVM,
        forkID,
        consensusContract,
        isVanillaClient,
        sovereignParams,
        programVKey,
    } = createRollupParameters;

    const arraySupportedAggchains = utilsAggchain.ARRAY_AGGCHAIN_SUPPORTED_NAMES;

    const arraySupportedLegacyConsensus = [
        utilsPP.ConsensusContracts.PolygonZkEVMEtrog,
        utilsPP.ConsensusContracts.PolygonValidiumEtrog,
        utilsPP.ConsensusContracts.PolygonPessimisticConsensus,
    ];
    const supportedConsensus = arraySupportedLegacyConsensus.concat(arraySupportedAggchains);

    if (!supportedConsensus.includes(consensusContract)) {
        throw new Error(`Consensus contract not supported, supported contracts are: ${supportedConsensus}`);
    }

    // if consensusContract is Aggchain, check isVanillaClient === true
    if (arraySupportedAggchains.includes(consensusContract) && !isVanillaClient) {
        throw new Error(`Consensus contract ${consensusContract} requires isVanillaClient === true`);
    } else if (arraySupportedAggchains.includes(consensusContract) && programVKey !== ethers.ZeroHash) {
        throw new Error(`Consensus contract ${consensusContract} requires programVKey === bytes32(0)`);
    } else if (arraySupportedLegacyConsensus.includes(consensusContract)) {
        if (realVerifier === undefined || realVerifier === '') {
            throw new Error(`Missing parameter: realVerifier`);
        }
    }

    // Check consensus compatibility
    if (isVanillaClient) {
        if (
            consensusContract !== 'PolygonPessimisticConsensus' &&
            !arraySupportedAggchains.includes(consensusContract)
        ) {
            throw new Error(`Vanilla client only supports PolygonPessimisticConsensus & Aggchain`);
        }

        // Check sovereign params
        const mandatorySovereignParams = [
            'bridgeManager',
            'sovereignWETHAddress',
            'sovereignWETHAddressIsNotMintable',
            'globalExitRootUpdater',
            'globalExitRootRemover',
            'emergencyBridgePauser',
            'emergencyBridgeUnpauser',
            'proxiedTokensManager',
        ];
        // eslint-disable-next-line no-restricted-syntax
        for (const parameterName of mandatorySovereignParams) {
            if (typeof sovereignParams[parameterName] === undefined || sovereignParams[parameterName] === '') {
                throw new Error(`Missing sovereign parameter: ${parameterName}`);
            }
        }

        // check aggchainParams if consensusContract is Aggchain
        if (arraySupportedAggchains.includes(consensusContract)) {
            if (createRollupParameters.aggchainParams === undefined) {
                throw new Error(`Missing parameter: aggchainParams`);
            }
        }
    }

    const dataAvailabilityProtocol = createRollupParameters.dataAvailabilityProtocol || 'PolygonDataCommittee';

    const supportedDataAvailabilityProtocols = ['PolygonDataCommittee'];

    if (
        consensusContract.includes('PolygonValidiumEtrog') &&
        !supportedDataAvailabilityProtocols.includes(dataAvailabilityProtocol)
    ) {
        throw new Error(
            `Data availability protocol not supported, supported data availability protocols are: ${supportedDataAvailabilityProtocols}`,
        );
    }

    // Load provider
    let currentProvider = ethers.provider;
    if (createRollupParameters.multiplierGas || createRollupParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            ) as any;
            if (createRollupParameters.maxPriorityFeePerGas && createRollupParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${createRollupParameters.maxPriorityFeePerGas} gwei, MaxFee${createRollupParameters.maxFeePerGas} gwei`,
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(createRollupParameters.maxFeePerGas, 'gwei'),
                    ethers.parseUnits(createRollupParameters.maxPriorityFeePerGas, 'gwei'),
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', createRollupParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(createRollupParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(createRollupParameters.multiplierGas)) /
                            1000n,
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (createRollupParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(createRollupParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory('PolygonRollupManager', deployer);
    const rollupManagerContract = PolygonRollupManagerFactory.attach(
        deployOutput.polygonRollupManagerAddress,
    ) as PolygonRollupManager;

    // Load global exit root manager
    const globalExitRootManagerFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootV2', deployer);
    const globalExitRootManagerContract = globalExitRootManagerFactory.attach(
        deployOutput.polygonZkEVMGlobalExitRootAddress,
    ) as PolygonRollupManager;

    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    if ((await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) === false) {
        throw new Error(
            `Deployer does not have admin role. Use the test flag on deploy_parameters if this is a test deployment`,
        );
    }

    // Since it's a mock deployment deployer has all the rights
    const ADD_ROLLUP_TYPE_ROLE = ethers.id('ADD_ROLLUP_TYPE_ROLE');
    const CREATE_ROLLUP_ROLE = ethers.id('CREATE_ROLLUP_ROLE');

    // Check role:
    if ((await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, deployer.address)) === false)
        await rollupManagerContract.grantRole(ADD_ROLLUP_TYPE_ROLE, deployer.address);

    if ((await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, deployer.address)) === false)
        await rollupManagerContract.grantRole(CREATE_ROLLUP_ROLE, deployer.address);

    const PolygonconsensusFactory = (await ethers.getContractFactory(consensusContract, deployer)) as any;
    let PolygonconsensusContract;

    // Create consensus/aggchain implementation
    if (arraySupportedLegacyConsensus.includes(consensusContract)) {
        // create consensus contract
        PolygonconsensusContract = await PolygonconsensusFactory.deploy(
            deployOutput.polygonZkEVMGlobalExitRootAddress,
            deployOutput.polTokenAddress,
            deployOutput.polygonZkEVMBridgeAddress,
            deployOutput.polygonRollupManagerAddress,
        );
        await PolygonconsensusContract.waitForDeployment();
    } else {
        // create aggchain contract
        PolygonconsensusContract = await PolygonconsensusFactory.deploy(
            deployOutput.polygonZkEVMGlobalExitRootAddress,
            deployOutput.polTokenAddress,
            deployOutput.polygonZkEVMBridgeAddress,
            deployOutput.polygonRollupManagerAddress,
            deployOutput.aggLayerGatewayAddress,
        );
        await PolygonconsensusContract.waitForDeployment();
    }
    let gasTokenAddress;
    let gasTokenNetwork;
    let gasTokenMetadata;

    // Get bridge instance
    const bridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2', deployer);
    const polygonZkEVMBridgeContract = bridgeFactory.attach(
        deployOutput.polygonZkEVMBridgeAddress,
    ) as PolygonZkEVMBridgeV2;
    if (
        createRollupParameters.gasTokenAddress &&
        createRollupParameters.gasTokenAddress !== '' &&
        createRollupParameters.gasTokenAddress !== ethers.ZeroAddress &&
        createRollupParameters.gasTokenAddress !== 'deploy'
    ) {
        // Get token metadata
        gasTokenMetadata = await polygonZkEVMBridgeContract.getTokenMetadata(createRollupParameters.gasTokenAddress);
        outputJson.gasTokenMetadata = gasTokenMetadata;
        // If gas token metadata includes `0x124e4f545f56414c49445f454e434f44494e47 (NOT_VALID_ENCODING)` means there is no erc20 token deployed at the selected gas token network
        if (gasTokenMetadata.includes('124e4f545f56414c49445f454e434f44494e47')) {
            throw new Error(
                `Invalid gas token address, no ERC20 token deployed at the selected gas token network ${createRollupParameters.gasTokenAddress}`,
            );
        }
        const wrappedData = await polygonZkEVMBridgeContract.wrappedTokenToTokenInfo(
            createRollupParameters.gasTokenAddress,
        );
        if (wrappedData.originNetwork !== 0n) {
            // Wrapped token
            gasTokenAddress = wrappedData.originTokenAddress;
            gasTokenNetwork = wrappedData.originNetwork;
        } else {
            // Mainnet token
            gasTokenAddress = createRollupParameters.gasTokenAddress;
            gasTokenNetwork = 0n;
        }
    } else {
        gasTokenAddress = ethers.ZeroAddress;
        gasTokenNetwork = 0;
        gasTokenMetadata = '0x';
    }
    outputJson.gasTokenAddress = gasTokenAddress;
    const nonce = await currentProvider.getTransactionCount(rollupManagerContract.target);
    const newZKEVMAddress = ethers.getCreateAddress({
        from: rollupManagerContract.target as string,
        nonce,
    });

    // Add a new rollup type with timelock
    let rollupVerifierType;
    let genesisFinal;
    let verifierAddress;
    let initializeBytesAggchainRollupManager;
    let initializeBytesAggchain;

    if (arraySupportedAggchains.includes(consensusContract)) {
        // If Aggchain
        // rollupVerifierType = VerifierType.ALGateway = 2
        rollupVerifierType = 2;
        // genesis = bytes32(0)
        genesisFinal = ethers.ZeroHash;
        // verifierAddress = address(0)
        // programVKey must be 0x00.00 for aggchain types
        verifierAddress = ethers.ZeroAddress;

        initializeBytesAggchainRollupManager = utilsAggchain.encodeInitAggchainManager(
            createRollupParameters.aggchainParams.aggchainManager,
        );

        if (consensusContract === utilsAggchain.AGGCHAIN_CONTRACT_NAMES.ECDSA) {
            initializeBytesAggchain = utilsECDSA.encodeInitializeBytesAggchainECDSAv0(
                createRollupParameters.aggchainParams.useDefaultGateway,
                createRollupParameters.aggchainParams.initOwnedAggchainVKey,
                createRollupParameters.aggchainParams.initAggchainVKeySelector,
                createRollupParameters.aggchainParams.vKeyManager,
                adminZkEVM,
                trustedSequencer,
                gasTokenAddress,
                trustedSequencerURL,
                networkName,
            );
        } else if (consensusContract === utilsAggchain.AGGCHAIN_CONTRACT_NAMES.FEP) {
            initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
                createRollupParameters.aggchainParams.initParams,
                createRollupParameters.aggchainParams.useDefaultGateway,
                createRollupParameters.aggchainParams.initOwnedAggchainVKey,
                createRollupParameters.aggchainParams.initAggchainVKeySelector,
                createRollupParameters.aggchainParams.vKeyManager,
                adminZkEVM,
                trustedSequencer,
                gasTokenAddress,
                trustedSequencerURL,
                networkName,
            );
        } else {
            throw new Error(`Aggchain ${consensusContract} not supported`);
        }
    } else {
        // deploy Verifier
        let verifierContract;
        let verifierName;
        if (realVerifier === true) {
            if (consensusContract !== 'PolygonPessimisticConsensus') {
                verifierName = `FflonkVerifier_${forkID}`;
                const VerifierRollup = await ethers.getContractFactory(verifierName, deployer);
                verifierContract = await VerifierRollup.deploy();
                await verifierContract.waitForDeployment();
            } else {
                verifierName = 'SP1VerifierPlonk';
                const VerifierRollup = await ethers.getContractFactory(verifierName, deployer);
                verifierContract = await VerifierRollup.deploy();
                await verifierContract.waitForDeployment();
            }
        } else {
            verifierName = 'VerifierRollupHelperMock';
            const VerifierRollupHelperFactory = await ethers.getContractFactory(verifierName, deployer);
            verifierContract = await VerifierRollupHelperFactory.deploy();
            await verifierContract.waitForDeployment();
        }

        verifierAddress = verifierContract.target;
        initializeBytesAggchainRollupManager = utilsAggchain.encodeInitializeBytesLegacy(
            adminZkEVM,
            trustedSequencer,
            gasTokenAddress,
            trustedSequencerURL,
            networkName,
        );
        console.log('#######################\n');
        console.log('Verifier name:', verifierName);
        console.log('Verifier deployed to:', verifierAddress);

        if (consensusContract === 'PolygonPessimisticConsensus') {
            rollupVerifierType = 1;
            genesisFinal = ethers.ZeroHash;
        } else {
            rollupVerifierType = 0;
            genesisFinal = genesis.root;
            // programVKey must be 0x00.00 for no pessimistic consensus
        }
    }

    // Sanity checks
    if (consensusContract === 'PolygonPessimisticConsensus') {
        if (genesisFinal !== ethers.ZeroHash) {
            throw new Error(`genesis should be 0x for ${consensusContract}`);
        }
    } else if (arraySupportedAggchains.includes(consensusContract)) {
        if (verifierAddress !== ethers.ZeroAddress) {
            throw new Error(`For ${consensusContract}: verifier == address(0)`);
        } else if (forkID !== 0) {
            throw new Error(`For ${consensusContract}: forkID == 0`);
        } else if (genesisFinal !== ethers.ZeroHash) {
            throw new Error(`For ${consensusContract}: genesis == bytes32(0)`);
        }
    } else if (programVKey !== ethers.ZeroHash) {
        throw new Error(`programVKey should be 0x for ${consensusContract}`);
    }

    await (
        await rollupManagerContract.addNewRollupType(
            PolygonconsensusContract.target,
            verifierAddress,
            forkID,
            rollupVerifierType,
            genesisFinal,
            description,
            programVKey,
        )
    ).wait();

    outputJson.programVKey = programVKey;

    console.log('#######################\n');
    console.log('Added new Rollup Type deployed');
    const newRollupTypeID = await rollupManagerContract.rollupTypeCount();

    // Create new rollup
    const txDeployRollup = await rollupManagerContract.attachAggchainToAL(
        newRollupTypeID,
        chainID,
        initializeBytesAggchainRollupManager,
    );

    const receipt = (await txDeployRollup.wait()) as any;
    const blockDeploymentRollup = await receipt?.getBlock();
    const timestampReceipt = blockDeploymentRollup.timestamp;
    const rollupID = await rollupManagerContract.chainIDToRollupID(chainID);

    console.log('#######################\n');
    console.log(`Created new ${consensusContract} Rollup:`, newZKEVMAddress);

    if (arraySupportedAggchains.includes(consensusContract)) {
        let aggchainType = utilsFEP.AGGCHAIN_TYPE_FEP;
        if (consensusContract === utilsAggchain.AGGCHAIN_CONTRACT_NAMES.ECDSA) {
            aggchainType = utilsECDSA.AGGCHAIN_TYPE_ECDSA;
        }

        // Load aggLayerGateway
        const aggLayerGatewayFactory = await ethers.getContractFactory('AggLayerGateway', deployer);
        const aggLayerGateway = (await aggLayerGatewayFactory.attach(
            deployOutput.aggLayerGatewayAddress,
        )) as AggLayerGateway;

        // sanity check on the aggchainType
        const aggchainTypeParam = utilsAggchain.getAggchainTypeFromSelector(
            createRollupParameters.aggchainParams.initAggchainVKeySelector,
        );

        if (aggchainType !== aggchainTypeParam) {
            throw new Error(
                `Aggchain type ${aggchainType} does not match the selector ${createRollupParameters.aggchainParams.initAggchainVKeySelector}`,
            );
        }

        await aggLayerGateway.addDefaultAggchainVKey(
            createRollupParameters.aggchainParams.initAggchainVKeySelector,
            createRollupParameters.aggchainParams.initOwnedAggchainVKey,
        );

        console.log('#######################\n');
        console.log(`New Default Aggchain VKey AggLayerGateway: ${deployOutput.aggLayerGatewayAddress}`);
        console.log(`consensusContract: ${consensusContract}`);
        console.log(`defaultAggchainVKeySelector: ${createRollupParameters.aggchainParams.initAggchainVKeySelector}`);
        console.log(`newAggchainVKey: ${createRollupParameters.aggchainParams.initOwnedAggchainVKey}`);
        console.log('#######################\n');

        const defaultAggchainVKeyALGateway = {
            defaultAggchainSelector: createRollupParameters.aggchainParams.initAggchainVKeySelector,
            newAggchainVKey: createRollupParameters.aggchainParams.initOwnedAggchainVKey,
        } as never;

        outputJson.defaultAggchainVKeyALGateway = defaultAggchainVKeyALGateway;

        // initialize aggchain
        const aggchainContract = await PolygonconsensusFactory.attach(newZKEVMAddress);
        const txInitAggChain = await aggchainContract.initialize(initializeBytesAggchain);
        await txInitAggChain.wait();
    }

    if (consensusContract.includes('PolygonValidiumEtrog') && dataAvailabilityProtocol === 'PolygonDataCommittee') {
        // deploy data committee
        const PolygonDataCommitteeContract = (await ethers.getContractFactory('PolygonDataCommittee', deployer)) as any;
        let polygonDataCommittee;

        for (let i = 0; i < attemptsDeployProxy; i++) {
            try {
                polygonDataCommittee = await upgrades.deployProxy(PolygonDataCommitteeContract, [], {
                    unsafeAllow: ['constructor'],
                });
                break;
            } catch (error: any) {
                console.log(`attempt ${i}`);
                console.log('upgrades.deployProxy of polygonDataCommittee ', error.message);
            }
            // reach limits of attempts
            if (i + 1 === attemptsDeployProxy) {
                throw new Error('polygonDataCommittee contract has not been deployed');
            }
        }
        await polygonDataCommittee?.waitForDeployment();

        // Load data commitee
        const PolygonValidiumContract = (await PolygonconsensusFactory.attach(newZKEVMAddress)) as PolygonValidiumEtrog;
        // add data commitee to the consensus contract
        if ((await PolygonValidiumContract.admin()) === deployer.address) {
            await (
                await PolygonValidiumContract.setDataAvailabilityProtocol(polygonDataCommittee?.target as any)
            ).wait();

            // // Setup data commitee to 0
            // await (await polygonDataCommittee?.setupCommittee(0, [], "0x")).wait();
        } else {
            // eslint-disable-next-line no-unsafe-optional-chaining
            await (await polygonDataCommittee?.transferOwnership(adminZkEVM)).wait();
        }

        outputJson.polygonDataCommitteeAddress = polygonDataCommittee?.target;
    }

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(newZKEVMAddress)).to.be.equal(rollupManagerContract.target);
    expect(await upgrades.erc1967.getImplementationAddress(newZKEVMAddress)).to.be.equal(
        PolygonconsensusContract.target,
    );

    // Search added global exit root on the logs
    let globalExitRoot;
    // eslint-disable-next-line no-restricted-syntax, no-unsafe-optional-chaining
    for (const log of receipt?.logs) {
        if (log.address === newZKEVMAddress) {
            const parsedLog = PolygonconsensusFactory.interface.parseLog(log);
            if (parsedLog !== null && parsedLog.name === 'InitialSequenceBatches') {
                globalExitRoot = parsedLog.args.lastGlobalExitRoot;
            }
        }
    }

    let batchData = '';
    /**
        If the system is running a "vanilla client" (i.e., a basic, unmodified Ethereum client or rollup setup),
        the genesis block should include the deployment of the sovereign contracts, and these contracts should 
        already be initialized with their required initial state and configurations. This means that the genesis
        block will contain the initial state for these contracts, allowing the system to start running without
        needing any additional initialization steps. However, for other rollups, additional configuration is needed.
        In this case, instead of having everything pre-initialized in the genesis block, we must inject an 
        "initialization batch" into the genesis file. This batch will contain specific instructions for 
        initializing the contracts at the time of rollup deployment. The injected initialization batch allows 
        the system to be configured dynamically during deployment.
     */
    if (isVanillaClient) {
        const initializeParams = {
            rollupID,
            gasTokenAddress,
            gasTokenNetwork,
            polygonRollupManager: ethers.ZeroAddress,
            gasTokenMetadata,
            bridgeManager: sovereignParams.bridgeManager,
            sovereignWETHAddress: sovereignParams.sovereignWETHAddress,
            sovereignWETHAddressIsNotMintable: sovereignParams.sovereignWETHAddressIsNotMintable,
            globalExitRootUpdater: sovereignParams.globalExitRootUpdater,
            globalExitRootRemover: sovereignParams.globalExitRootRemover,
            emergencyBridgePauser: sovereignParams.emergencyBridgePauser,
            emergencyBridgeUnpauser: sovereignParams.emergencyBridgeUnpauser,
            proxiedTokensManager: sovereignParams.proxiedTokensManager,
        };
        genesis = await updateVanillaGenesis(genesis, chainID, initializeParams);
        // Add weth proxy and implementation address to deployment output if gas token address is provided and sovereignWETHAddress is not provided
        if (
            gasTokenAddress !== ethers.ZeroAddress &&
            ethers.isAddress(gasTokenAddress) &&
            (sovereignParams.sovereignWETHAddress === ethers.ZeroAddress ||
                !ethers.isAddress(sovereignParams.sovereignWETHAddress))
        ) {
            const wethObject = genesis.genesis.find(function (obj) {
                return obj.contractName === utilsAggchain.GENESIS_CONTRACT_NAMES.WETH_PROXY;
            });
            outputJson.WETHProxyAddress = wethObject.address;

            const wethImpObject = genesis.genesis.find(function (obj) {
                return obj.contractName === utilsAggchain.GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION;
            });
            outputJson.WETHImplementationAddress = wethImpObject.address;
        }
    } else {
        if (consensusContract === 'PolygonPessimisticConsensus') {
            // Add the first batch of the created rollup
            const newZKEVMContract = (await PolygonconsensusFactory.attach(
                newZKEVMAddress,
            )) as PolygonPessimisticConsensus;

            // Get last GER
            const lastGER = await globalExitRootManagerContract.getLastGlobalExitRoot();

            const dataInjectedTx = await polygonZkEVMBridgeContract.interface.encodeFunctionData(
                'initialize(uint32,address,uint32,address,address,bytes)',
                [
                    rollupID,
                    gasTokenAddress,
                    gasTokenNetwork,
                    Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2, // Global exit root address on L2
                    ethers.ZeroAddress, // Rollup manager on L2 does not exist
                    gasTokenMetadata as any,
                ],
            );

            // check maximum length is 65535
            if ((dataInjectedTx.length - 2) / 2 > 0xffff) {
                // throw error
                throw new Error(`HugeTokenMetadataNotSupported`);
            }

            const injectedTx = {
                type: 0, // force ethers to parse it as a legacy transaction
                chainId: 0, // force ethers to parse it as a pre-EIP155 transaction
                to: await newZKEVMContract.bridgeAddress(),
                value: 0,
                gasPrice: 0,
                gasLimit: 30000000,
                nonce: 0,
                data: dataInjectedTx,
                signature: {
                    v: '0x1b',
                    r: '0x00000000000000000000000000000000000000000000000000000005ca1ab1e0',
                    s: '0x000000000000000000000000000000000000000000000000000000005ca1ab1e',
                },
            };

            // serialize transactions
            const txObject = ethers.Transaction.from(injectedTx);

            const customData = processorUtils.rawTxToCustomRawTx(txObject.serialized);
            batchData = {
                batchL2Data: customData,
                globalExitRoot: lastGER,
                timestamp: blockDeploymentRollup.timestamp,
                sequencer: trustedSequencer,
                l1BlockNumber: blockDeploymentRollup.number,
                l1BlockHash: blockDeploymentRollup.hash,
                l1ParentHash: blockDeploymentRollup.parentHash,
            };
        } else if (arraySupportedLegacyConsensus.includes(consensusContract)) {
            // Add the first batch of the created rollup
            const newZKEVMContract = (await PolygonconsensusFactory.attach(newZKEVMAddress)) as PolygonZkEVMEtrog;
            batchData = {
                batchL2Data: await newZKEVMContract.generateInitializeTransaction(
                    rollupID,
                    gasTokenAddress,
                    gasTokenNetwork,
                    gasTokenMetadata as any,
                ),
                globalExitRoot,
                timestamp: timestampReceipt,
                sequencer: trustedSequencer,
            };
        }
    }
    outputJson.firstBatchData = batchData;
    outputJson.genesis = genesis.root;
    outputJson.createRollupBlockNumber = blockDeploymentRollup.number;
    outputJson.rollupAddress = newZKEVMAddress;
    outputJson.verifierAddress = verifierAddress;
    outputJson.consensusContract = consensusContract;
    outputJson.consensusContractAddress = PolygonconsensusContract.target;
    outputJson.rollupTypeId = newRollupTypeID;
    outputJson.rollupID = rollupID;

    // Rewrite updated genesis in case of vanilla client
    if (isVanillaClient) {
        fs.writeFileSync(pathGenesisSovereign, JSON.stringify(genesis, null, 1));
    }
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

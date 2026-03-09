/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { VerifierType, ConsensusContracts } from '../../src/pessimistic-utils';
import { genOperation, transactionTypes, convertBigIntsToNumbers } from '../utils';
import { AGGCHAIN_CONTRACT_NAMES } from '../../src/utils-common-aggchain';
import { logger } from '../../src/logger';
import { checkParams, getDeployerFromParameters, getProviderAdjustingMultiplierGas } from '../../src/utils';
// NOTE: Direct initialization is now used instead of encoded bytes
// The deprecated encoding functions have been removed
import { AgglayerManager } from '../../typechain-types';
import initializeRollupParameters from './initialize_rollup.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    logger.info(`Starting script to initialize new rollup from ${initializeRollupParameters.type}...`);
    const outputJson = {} as any;
    const dateStr = new Date().toISOString();
    const destPath = initializeRollupParameters.outputPath
        ? path.join(__dirname, initializeRollupParameters.outputPath)
        : path.join(__dirname, `initialize_rollup_output_${initializeRollupParameters.type}_${dateStr}.json`);

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryDeploymentParameters = [
        'trustedSequencerURL',
        'networkName',
        'trustedSequencer',
        'chainID',
        'rollupAdminAddress',
        'consensusContractName',
        'rollupManagerAddress',
        'gasTokenAddress',
        'type',
    ];

    // check create rollup type
    switch (initializeRollupParameters.type) {
        case transactionTypes.EOA:
        case transactionTypes.MULTISIG:
            break;
        case transactionTypes.TIMELOCK:
            mandatoryDeploymentParameters.push('timelockDelay');
            break;
        default:
            throw new Error(`Invalid type ${initializeRollupParameters.type}`);
    }

    checkParams(initializeRollupParameters, mandatoryDeploymentParameters);

    const {
        trustedSequencerURL,
        networkName,
        trustedSequencer,
        chainID,
        rollupAdminAddress,
        consensusContractName,
        aggchainParams,
        gasTokenAddress,
        rollupManagerAddress,
        type,
    } = initializeRollupParameters;

    // Check supported consensus is correct
    const supportedConsensusArray = Object.values(ConsensusContracts);
    const supportedAggchainsArray = Object.values(AGGCHAIN_CONTRACT_NAMES);
    const supportedConsensus = supportedConsensusArray.concat(supportedAggchainsArray);

    if (!supportedConsensus.includes(consensusContractName)) {
        throw new Error(
            `Consensus contract ${consensusContractName} not supported, supported contracts are: ${supportedConsensus}`,
        );
    }

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(initializeRollupParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, initializeRollupParameters, ethers);
    logger.info(`Using deployer: ${deployer.address}`);

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager', deployer);
    const rollupManagerContract = PolygonRollupManagerFactory.attach(rollupManagerAddress) as AgglayerManager;

    const polygonConsensusFactory = (await ethers.getContractFactory(consensusContractName, deployer)) as any;

    // Check chainID
    const rollupID = await rollupManagerContract.chainIDToRollupID(chainID);
    const rollup = await rollupManagerContract.rollupIDToRollupData(rollupID);
    if (
        supportedAggchainsArray.includes(consensusContractName) &&
        Number(rollup.rollupVerifierType) !== VerifierType.ALGateway
    ) {
        throw new Error(
            `Mismatch RollupTypeID: Verifier type should be ${VerifierType.ALGateway} for ${consensusContractName}`,
        );
    }

    const aggchainContract = await polygonConsensusFactory.attach(rollup.rollupContract);

    // Retrieve the first storage slot (_initialized)
    const initializedSlot = await ethers.provider.getStorage(aggchainContract.target, 0);
    const initializedValue = Number(BigInt(initializedSlot) & BigInt(0xff)); // Extract only the first byte

    // Build the initialization transaction based on the consensus contract type and initialization state
    let initializeTx;
    const aggchainManager = await aggchainContract.aggchainManager();

    if (initializedValue === 0) {
        // Contract needs v0 initialization (first-time initialization)
        if (consensusContractName === AGGCHAIN_CONTRACT_NAMES.ECDSA) {
            if (type === transactionTypes.EOA && deployer.address !== aggchainManager) {
                throw new Error(
                    `Caller ${deployer.address} is not the aggchainManager ${aggchainManager}, cannot initialize from EOA`,
                );
            }

            // check mandatory aggchainParams
            const mandatoryAggchainParams = ['useDefaultSigners', 'signers', 'threshold'];
            checkParams(aggchainParams, mandatoryAggchainParams);

            // Initialize ECDSA Multisig with direct parameters
            initializeTx = await aggchainContract.initialize.populateTransaction(
                rollupAdminAddress,
                trustedSequencer,
                gasTokenAddress,
                trustedSequencerURL,
                networkName,
                aggchainParams.useDefaultSigners,
                aggchainParams.signers,
                aggchainParams.threshold,
            );
        } else if (consensusContractName === AGGCHAIN_CONTRACT_NAMES.FEP) {
            if (type === transactionTypes.EOA && deployer.address !== aggchainManager) {
                throw new Error(
                    `Caller ${deployer.address} is not the aggchainManager ${aggchainManager}, cannot initialize from EOA`,
                );
            }

            // check mandatory params in aggchainParams
            const mandatoryAggchainParams = [
                'initParams',
                'signers',
                'threshold',
                'useDefaultVkeys',
                'useDefaultSigners',
                'initOwnedAggchainVKey',
                'initAggchainVKeySelector',
            ];
            checkParams(aggchainParams, mandatoryAggchainParams);

            // Initialize FEP with direct parameters
            initializeTx = await aggchainContract.initialize.populateTransaction(
                aggchainParams.initParams,
                aggchainParams.signers,
                aggchainParams.threshold,
                aggchainParams.useDefaultVkeys,
                aggchainParams.useDefaultSigners,
                aggchainParams.initOwnedAggchainVKey,
                aggchainParams.initAggchainVKeySelector,
                rollupAdminAddress,
                trustedSequencer,
                gasTokenAddress,
                trustedSequencerURL,
                networkName,
            );
        } else {
            throw new Error(`Aggchain ${consensusContractName} not supported`);
        }
    } else if (initializedValue === 1) {
        // Contract needs v1 initialization (migration from pessimistic consensus)
        if (consensusContractName === AGGCHAIN_CONTRACT_NAMES.ECDSA) {
            if (type !== transactionTypes.MULTISIG) {
                throw new Error(
                    `Aggchain ${consensusContractName} can only be initialized from multisig because the function is only callable from rollupManager, so only calldata can be generated`,
                );
            }
            // Migrate from pessimistic consensus to ECDSA Multisig
            initializeTx = await aggchainContract.migrateFromLegacyConsensus.populateTransaction();
        } else if (consensusContractName === AGGCHAIN_CONTRACT_NAMES.FEP) {
            if (type === transactionTypes.EOA && deployer.address !== aggchainManager) {
                throw new Error(
                    `Caller ${deployer.address} is not the aggchainManager ${aggchainManager}, cannot initialize from EOA`,
                );
            }

            // check mandatory params in aggchainParams
            const mandatoryAggchainParams = [
                'initParams',
                'signers',
                'threshold',
                'useDefaultVkeys',
                'useDefaultSigners',
                'initOwnedAggchainVKey',
                'initAggchainVKeySelector',
                'vKeyManager',
            ];
            checkParams(aggchainParams, mandatoryAggchainParams);

            // Initialize FEP from pessimistic consensus with direct parameters
            initializeTx = await aggchainContract.initializeFromLegacyConsensus.populateTransaction(
                aggchainParams.initParams,
                aggchainParams.signers,
                aggchainParams.threshold,
                aggchainParams.useDefaultVkeys,
                aggchainParams.useDefaultSigners,
                aggchainParams.initOwnedAggchainVKey,
                aggchainParams.initAggchainVKeySelector,
                aggchainParams.vKeyManager,
            );
        } else {
            throw new Error(`Aggchain ${consensusContractName} not supported`);
        }
    } else if (initializedValue === 2 && consensusContractName === AGGCHAIN_CONTRACT_NAMES.FEP) {
        if (type === transactionTypes.EOA && deployer.address !== aggchainManager) {
            throw new Error(
                `Caller ${deployer.address} is not the aggchainManager ${aggchainManager}, cannot initialize from EOA`,
            );
        }

        // check mandatory params in aggchainParams
        const mandatoryAggchainParams = [
            'initParams',
            'useDefaultVkeys',
            'initOwnedAggchainVKey',
            'initAggchainVKeySelector',
        ];
        checkParams(aggchainParams, mandatoryAggchainParams);

        // Initialize FEP from ECDSA Multisig
        initializeTx = await aggchainContract.initializeFromECDSAMultisig.populateTransaction(
            aggchainParams.initParams,
            aggchainParams.useDefaultVkeys,
            aggchainParams.initOwnedAggchainVKey,
            aggchainParams.initAggchainVKeySelector,
        );
    } else {
        throw new Error(`Unexpected value in _initialized storage slot: ${initializedValue}`);
    }

    // Store the initialization transaction data for later use
    const initializeAggchainTxData = initializeTx.data;

    if (type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock txs for initialization...');
        const salt = initializeRollupParameters.timelockSalt || ethers.ZeroHash;
        const predecessor = ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
        const operation = genOperation(
            rollupManagerAddress,
            0, // value
            initializeAggchainTxData,
            predecessor, // predecessor
            salt, // salt
        );
        // Schedule operation
        const scheduleData = timelockContractFactory.interface.encodeFunctionData('schedule', [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
            initializeRollupParameters.timelockDelay,
        ]);
        // Execute operation
        const executeData = timelockContractFactory.interface.encodeFunctionData('execute', [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        ]);
        logger.info({ scheduleData });
        logger.info({ executeData });
        outputJson.scheduleData = scheduleData;
        outputJson.executeData = executeData;
        // Decode the scheduleData for better readability
        const timelockTx = timelockContractFactory.interface.parseTransaction({
            data: scheduleData,
        });
        const paramsArray = timelockTx?.fragment.inputs;
        const objectDecoded = {};
        for (let i = 0; i < paramsArray?.length; i++) {
            const currentParam = paramsArray[i];

            objectDecoded[currentParam.name] = timelockTx?.args[i];

            if (currentParam.name === 'data') {
                const decodedRollupManagerData = PolygonRollupManagerFactory.interface.parseTransaction({
                    data: timelockTx?.args[i],
                });
                const objectDecodedData = {};
                const paramsArrayData = decodedRollupManagerData?.fragment.inputs;

                for (let j = 0; j < paramsArrayData?.length; j++) {
                    const currentParamData = paramsArrayData[j];
                    objectDecodedData[currentParamData.name] = decodedRollupManagerData?.args[j];
                }
                objectDecoded.decodedData = objectDecodedData;
            }
        }

        outputJson.decodedScheduleData = convertBigIntsToNumbers(objectDecoded);
        fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
        logger.info('Finished script, output saved at: ', destPath);
        process.exit(0);
    } else if (type === transactionTypes.MULTISIG) {
        logger.info('Creating calldata for initialization from multisig...');
        outputJson.txInitializeAggchain = initializeAggchainTxData;
        fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
        logger.info(`Finished script, output saved at: ${destPath}`);
        process.exit(0);
    } else {
        logger.info('Initializing rollup....');
        // Create new rollup
        const txInitAggChain = await deployer.sendTransaction(initializeTx);
        await txInitAggChain.wait();

        (await txInitAggChain.wait()) as any;

        logger.info('#######################\n');
        logger.info(`Initialized successfully`);
    }
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});

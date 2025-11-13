/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { VerifierType, ConsensusContracts } from '../../src/pessimistic-utils';
import { genOperation, transactionTypes, convertBigIntsToNumbers } from '../utils';
import { AGGCHAIN_CONTRACT_NAMES } from '../../src/utils-common-aggchain';
import {
    encodeInitializeBytesAggchainECDSAv0,
    encodeInitializeBytesAggchainECDSAv1,
} from '../../src/utils-aggchain-ECDSA';
import { encodeInitializeBytesAggchainFEPv0, encodeInitializeBytesAggchainFEPv1 } from '../../src/utils-aggchain-FEP';
import { PolygonRollupManager } from '../../typechain-types';
import initializeRollupParameters from './initialize_rollup.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    console.log(`Starting script to initialize new rollup from ${initializeRollupParameters.type}...`);
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

    mandatoryDeploymentParameters.forEach((parameterName) => {
        if (
            initializeRollupParameters[parameterName] === undefined ||
            initializeRollupParameters[parameterName] === ''
        ) {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    });

    const {
        trustedSequencerURL,
        networkName,
        trustedSequencer,
        chainID,
        rollupAdminAddress,
        consensusContractName,
        aggchainParams,
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
    let currentProvider = ethers.provider;
    if (initializeRollupParameters.multiplierGas || initializeRollupParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            ) as any;
            if (initializeRollupParameters.maxPriorityFeePerGas && initializeRollupParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${initializeRollupParameters.maxPriorityFeePerGas} gwei, MaxFee${initializeRollupParameters.maxFeePerGas} gwei`,
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(initializeRollupParameters.maxFeePerGas, 'gwei'),
                    ethers.parseUnits(initializeRollupParameters.maxPriorityFeePerGas, 'gwei'),
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', initializeRollupParameters.multiplierGas);
                async function overrideFeeData() {
                    const feeData = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feeData.maxFeePerGas as bigint) * BigInt(initializeRollupParameters.multiplierGas)) / 1000n,
                        ((feeData.maxPriorityFeePerGas as bigint) * BigInt(initializeRollupParameters.multiplierGas)) /
                            1000n,
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (initializeRollupParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(initializeRollupParameters.deployerPvtKey, currentProvider);
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
        initializeRollupParameters.rollupManagerAddress,
    ) as PolygonRollupManager;

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

    let initializeBytesAggchain;

    if (initializedValue === 0) {
        if (consensusContractName === AGGCHAIN_CONTRACT_NAMES.ECDSA) {
            initializeBytesAggchain = encodeInitializeBytesAggchainECDSAv0(
                aggchainParams.useDefaultGateway,
                aggchainParams.initOwnedAggchainVKey,
                aggchainParams.initAggchainVKeySelector,
                aggchainParams.vKeyManager,
                rollupAdminAddress,
                trustedSequencer,
                initializeRollupParameters.gasTokenAddress,
                trustedSequencerURL,
                networkName,
            );
        } else if (consensusContractName === AGGCHAIN_CONTRACT_NAMES.FEP) {
            initializeBytesAggchain = encodeInitializeBytesAggchainFEPv0(
                aggchainParams.initParams,
                aggchainParams.useDefaultGateway,
                aggchainParams.initOwnedAggchainVKey,
                aggchainParams.initAggchainVKeySelector,
                aggchainParams.vKeyManager,
                rollupAdminAddress,
                trustedSequencer,
                initializeRollupParameters.gasTokenAddress,
                trustedSequencerURL,
                networkName,
            );
        } else {
            throw new Error(`Aggchain ${consensusContractName} not supported`);
        }
    } else if (initializedValue === 1) {
        if (consensusContractName === AGGCHAIN_CONTRACT_NAMES.ECDSA) {
            initializeBytesAggchain = encodeInitializeBytesAggchainECDSAv1(
                aggchainParams.useDefaultGateway,
                aggchainParams.initOwnedAggchainVKey,
                aggchainParams.initAggchainVKeySelector,
                aggchainParams.vKeyManager,
            );
        } else if (consensusContractName === AGGCHAIN_CONTRACT_NAMES.FEP) {
            initializeBytesAggchain = encodeInitializeBytesAggchainFEPv1(
                aggchainParams.initParams,
                aggchainParams.useDefaultGateway,
                aggchainParams.initOwnedAggchainVKey,
                aggchainParams.initAggchainVKeySelector,
                aggchainParams.vKeyManager,
            );
        } else {
            throw new Error(`Aggchain ${consensusContractName} not supported`);
        }
    } else {
        throw new Error(`Unexpected value in _initialized storage slot: ${initializedValue}`);
    }

    if (initializeRollupParameters.type === transactionTypes.TIMELOCK) {
        console.log('Creating timelock txs for initialization...');
        const salt = initializeRollupParameters.timelockSalt || ethers.ZeroHash;
        const predecessor = ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
        const operation = genOperation(
            initializeRollupParameters.rollupManagerAddress,
            0, // value
            aggchainContract.interface.encodeFunctionData('initialize(bytes)', [initializeBytesAggchain]),
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
        console.log({ scheduleData });
        console.log({ executeData });
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
        console.log('Finished script, output saved at: ', destPath);
        process.exit(0);
    } else if (initializeRollupParameters.type === transactionTypes.MULTISIG) {
        console.log('Creating calldata for initializationfrom multisig...');
        const txDeployRollupCalldata = aggchainContract.interface.encodeFunctionData('initialize(bytes)', [
            initializeBytesAggchain,
        ]);

        outputJson.txDeployRollupCalldata = txDeployRollupCalldata;
        fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
        console.log('Finished script, output saved at: ', destPath);
        process.exit(0);
    } else {
        console.log('Initializing rollup....');
        // Create new rollup
        const txInitAggChain = await aggchainContract.initialize(initializeBytesAggchain);
        await txInitAggChain.wait();

        (await txInitAggChain.wait()) as any;

        console.log('#######################\n');
        console.log(`Initialized succesfully`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

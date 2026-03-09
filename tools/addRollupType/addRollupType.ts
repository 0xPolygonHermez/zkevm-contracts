/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, import/extensions */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { transactionTypes, genOperation, checkBridgeAddress } from '../utils';
import { DEFAULT_ADMIN_ROLE, ADD_ROLLUP_TYPE_ROLE } from '../../src/constants';

import { AGGCHAIN_CONTRACT_NAMES } from '../../src/utils-common-aggchain';
import { ConsensusContracts, VerifierType } from '../../src/pessimistic-utils';
import addRollupTypeParameters from './add_rollup_type.json';
import { AgglayerManager } from '../../typechain-types';
import {
    checkParams,
    getDeployerFromParameters,
    getProviderAdjustingMultiplierGas,
    getOwnerOfProxyAdminFromProxy,
    getGitInfo,
} from '../../src/utils';
import { logger } from '../../src/logger';
import { decodeScheduleData, verifyContractEtherscan } from '../../upgrade/utils';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dateStr = new Date().toISOString();
const pathOutputJson = addRollupTypeParameters.outputPath
    ? path.join(__dirname, addRollupTypeParameters.outputPath)
    : path.join(__dirname, `./add_rollup_type_output-${dateStr}.json`);

async function main() {
    const outputJson = {} as object;
    const AggchainContracts = Object.values(AGGCHAIN_CONTRACT_NAMES);

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryParameters = ['type', 'description', 'consensusContract', 'polygonRollupManagerAddress'];

    const {
        type,
        description,
        forkID,
        consensusContract,
        polygonRollupManagerAddress,
        timelockDelay,
        genesisRoot,
        programVKey,
        customALGatewayAddress,
    } = addRollupTypeParameters;

    // check add new rollup type
    switch (type) {
        case transactionTypes.EOA:
            break;
        case transactionTypes.TIMELOCK:
            mandatoryParameters.push('timelockDelay');
            break;
        default:
            throw new Error(`Invalid type ${type}`);
    }

    // if setCustomALGatewayAddress is true, get ALGatewayAddress from input params, not rollup Manager
    const setCustomALGatewayAddress = typeof customALGatewayAddress !== 'undefined';
    if (setCustomALGatewayAddress) {
        mandatoryParameters.push('customALGatewayAddress');
    }

    checkParams(addRollupTypeParameters, mandatoryParameters);

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(addRollupTypeParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, addRollupTypeParameters, ethers);
    logger.info(`Using deployer: ${deployer.address}`);

    const supportedConsensus = Object.values(ConsensusContracts).concat(AggchainContracts);
    const isPessimistic = consensusContract === ConsensusContracts.PolygonPessimisticConsensus;

    if (!supportedConsensus.includes(consensusContract)) {
        throw new Error(`Consensus contract not supported, supported contracts are: ${supportedConsensus}`);
    }

    // verifierAddress only mandatory if consensusContract !== Aggchain
    let verifierAddress;
    let finalForkId = forkID;

    if (!consensusContract.includes('Aggchain')) {
        verifierAddress = addRollupTypeParameters.verifierAddress;
        if (verifierAddress === undefined || verifierAddress === '') {
            throw new Error('Missing parameter: verifierAddress');
        }
    } else {
        verifierAddress = ethers.ZeroAddress;
        // no fork id for Aggchain
        finalForkId = 0;
    }

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager', deployer);
    const rollupManagerContract = PolygonRollupManagerFactory.attach(polygonRollupManagerAddress) as AgglayerManager;

    // get data from rollupManagerContract
    const polygonZkEVMBridgeAddress = await rollupManagerContract.bridgeAddress();
    const polygonZkEVMGlobalExitRootAddress = await rollupManagerContract.globalExitRootManager();
    const polTokenAddress = await rollupManagerContract.pol();

    // check all those address are not zero
    expect(polygonZkEVMBridgeAddress).to.not.equal(ethers.ZeroAddress);
    expect(polygonZkEVMGlobalExitRootAddress).to.not.equal(ethers.ZeroAddress);
    expect(polTokenAddress).to.not.equal(ethers.ZeroAddress);

    let genesis;
    if (!isPessimistic && !AggchainContracts.includes(consensusContract)) {
        // Checks for state transition verifier types
        const pathGenesis = path.join(__dirname, './genesis.json');
        genesis = JSON.parse(fs.readFileSync(pathGenesis, 'utf8'));

        // checks for rollups
        // Sanity checks genesisRoot
        if (genesisRoot !== genesis.root) {
            throw new Error("Genesis root in the 'add_rollup_type.json' does not match the root in the 'genesis.json'");
        }

        // check bridge address is the same in genesisBase and on-chain
        checkBridgeAddress(genesis, polygonZkEVMBridgeAddress);
    }

    if (type !== transactionTypes.TIMELOCK) {
        // Check roles
        if ((await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) === false) {
            throw new Error(
                'Deployer does not have admin role. Use the test flag on deploy_parameters if this is a test deployment',
            );
        }

        // Since it's a mock deployment deployer has all the rights

        // Check role:
        if ((await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, deployer.address)) === false)
            await rollupManagerContract.grantRole(ADD_ROLLUP_TYPE_ROLE, deployer.address);
    }

    const deployedContracts = {};
    // Create consensus implementation if needed
    let consensusContractAddress;
    if (
        typeof addRollupTypeParameters.consensusContractAddress !== 'undefined' &&
        ethers.isAddress(addRollupTypeParameters.consensusContractAddress)
    ) {
        logger.info('Consensus contract address is provided in the parameters, no need to deploy');
        consensusContractAddress = addRollupTypeParameters.consensusContractAddress;
    } else {
        const polygonConsensusFactory = (await ethers.getContractFactory(consensusContract, deployer)) as any;
        let polygonConsensusContract;

        // Create consensus/aggchain implementation
        if (!AggchainContracts.includes(consensusContract)) {
            polygonConsensusContract = await polygonConsensusFactory.deploy(
                polygonZkEVMGlobalExitRootAddress,
                polTokenAddress,
                polygonZkEVMBridgeAddress,
                polygonRollupManagerAddress,
            );
            await polygonConsensusContract.waitForDeployment();

            deployedContracts[consensusContract] = polygonConsensusContract.target;

            logger.info('#######################\n');
            logger.info(`new consensus name: ${consensusContract}`);
            logger.info(`new ${consensusContract} impl: ${polygonConsensusContract.target}`);

            await verifyContractEtherscan(polygonConsensusContract.target, [
                polygonZkEVMGlobalExitRootAddress,
                polTokenAddress,
                polygonZkEVMBridgeAddress,
                polygonRollupManagerAddress,
            ]);
        } else {
            let aggLayerGatewayAddress;
            if (setCustomALGatewayAddress) {
                aggLayerGatewayAddress = customALGatewayAddress;
            } else {
                // Retrieve ALGateway from rollupManagerContract
                aggLayerGatewayAddress = await rollupManagerContract.aggLayerGateway();
            }
            logger.info(`AgglayerGateway address: ${aggLayerGatewayAddress}`);
            polygonConsensusContract = await polygonConsensusFactory.deploy(
                polygonZkEVMGlobalExitRootAddress,
                polTokenAddress,
                polygonZkEVMBridgeAddress,
                polygonRollupManagerAddress,
                aggLayerGatewayAddress,
            );
            await polygonConsensusContract.waitForDeployment();

            deployedContracts[consensusContract] = polygonConsensusContract.target;

            logger.info('#######################\n');
            logger.info(`new aggchain name: ${consensusContract}`);
            logger.info(`new ${consensusContract} impl: ${polygonConsensusContract.target}`);

            await verifyContractEtherscan(polygonConsensusContract.target, [
                polygonZkEVMGlobalExitRootAddress,
                polTokenAddress,
                polygonZkEVMBridgeAddress,
                polygonRollupManagerAddress,
                aggLayerGatewayAddress,
            ]);
        }

        consensusContractAddress = polygonConsensusContract.target;
    }

    // Add a new rollup type
    let rollupVerifierType;
    let genesisFinal;
    let programVKeyFinal;

    if (AggchainContracts.includes(consensusContract)) {
        // rollupVerifierType = VerifierType.ALGateway = 2
        rollupVerifierType = VerifierType.ALGateway;
        // genesis = bytes32(0)
        genesisFinal = ethers.ZeroHash;
        // programVKey = bytes32(0)
        programVKeyFinal = ethers.ZeroHash;
    } else if (isPessimistic) {
        // rollupVerifierType = VerifierType.Pessimistic = 1
        rollupVerifierType = VerifierType.Pessimistic;
        // genesis = bytes32(0)
        genesisFinal = ethers.ZeroHash;
        programVKeyFinal = programVKey || ethers.ZeroHash;
    } else {
        // rollupVerifierType = VerifierType.StateTransition = 0
        rollupVerifierType = VerifierType.StateTransition;
        genesisFinal = genesis.root;
        // programVKey = bytes32(0)
        programVKeyFinal = ethers.ZeroHash;
    }

    if (type === transactionTypes.EOA) {
        await (
            await rollupManagerContract
                .connect(deployer)
                .addNewRollupType(
                    consensusContractAddress,
                    verifierAddress,
                    finalForkId,
                    rollupVerifierType,
                    genesisFinal,
                    description,
                    programVKeyFinal,
                )
        ).wait();

        logger.info('#######################\n');
        logger.info('New Rollup Type deployed');
        const newRollupTypeID = await rollupManagerContract.rollupTypeCount();

        outputJson.rollupTypeID = newRollupTypeID;
        outputJson.programVKey = programVKeyFinal;
    } else {
        // load timelock
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
        const salt = addRollupTypeParameters.timelockSalt || ethers.ZeroHash;
        const predecessor = addRollupTypeParameters.predecessor || ethers.ZeroHash;

        const operation = genOperation(
            polygonRollupManagerAddress,
            0, // value
            PolygonRollupManagerFactory.interface.encodeFunctionData('addNewRollupType', [
                consensusContractAddress,
                verifierAddress,
                finalForkId,
                rollupVerifierType,
                genesisFinal,
                description,
                programVKeyFinal,
            ]),
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
            timelockDelay,
        ]);
        // Execute operation
        const executeData = timelockContractFactory.interface.encodeFunctionData('execute', [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        ]);

        outputJson.scheduleData = scheduleData;
        outputJson.executeData = executeData;
        outputJson.id = operation.id;

        // Decode the scheduleData for better readability
        const objectDecoded = await decodeScheduleData(scheduleData, PolygonRollupManagerFactory);
        outputJson.decodedScheduleData = objectDecoded;
    }

    outputJson.gitInfo = getGitInfo();
    outputJson.genesis = genesisFinal;
    outputJson.verifierAddress = verifierAddress;
    outputJson.consensusContract = consensusContract;
    outputJson.consensusContractAddress = consensusContractAddress;
    outputJson.deployedContracts = deployedContracts;

    // Get timelock address
    const timelockAddress = await getOwnerOfProxyAdminFromProxy(polygonRollupManagerAddress);
    outputJson.timelockContractAddress = timelockAddress;

    // add time to output path
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 4));
    logger.info(`Output JSON file written to: ${pathOutputJson}`);
}

main().catch((e) => {
    console.log(e);
    logger.error(e);
    process.exit(1);
});

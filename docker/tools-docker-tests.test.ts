import { expect } from 'chai';
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import shelljs from 'shelljs';
import { ConsensusContracts } from '../src/pessimistic-utils';
import { AGGCHAIN_CONTRACT_NAMES } from '../src/utils-common-aggchain';

import {
    PolygonRollupManager,
    PolygonPessimisticConsensus,
    PolygonValidiumEtrog,
    PolygonZkEVMEtrog,
    AggchainECDSA,
    AggchainFEP,
} from '../typechain-types';

describe('Tooling docker build tests Contract', () => {
    it('Create a new rollupa and initialize it', async () => {
        // Read docker deployment output
        const dockerCreateRollupOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output.json'), 'utf8'),
        );
        const dockerDeploymentOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, './deploymentOutput/deploy_output.json'), 'utf8'),
        );
        // Read create rollup config file
        const createRollupConfig = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../tools/createNewRollup/create_new_rollup.json.example'), 'utf8'),
        );

        // Update example config from docker deployment output
        createRollupConfig.consensusContractName = dockerCreateRollupOutput.consensusContract;
        createRollupConfig.gasTokenAddress = dockerCreateRollupOutput.gasTokenAddress;
        createRollupConfig.outputPath = 'create_new_rollup_output.json';
        createRollupConfig.chainID = 12;
        createRollupConfig.rollupManagerAddress = dockerDeploymentOutput.polygonRollupManagerAddress;
        fs.writeFileSync(
            path.join(__dirname, '../tools/createNewRollup/create_new_rollup.json'),
            JSON.stringify(createRollupConfig, null, 2),
        );

        // Run tool
        shelljs.exec('npx hardhat run ./tools/createNewRollup/createNewRollup.ts --network localhost');

        // Read create rollup output
        const createRollupOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../tools/createNewRollup/create_new_rollup_output.json'), 'utf8'),
        );
        // Check output values with current docker environment
        const PolygonRollupManagerFactory = await ethers.getContractFactory('PolygonRollupManager');
        const rollupManagerContract = PolygonRollupManagerFactory.attach(
            createRollupOutput.rollupManagerAddress,
        ) as PolygonRollupManager;

        expect(createRollupConfig.rollupManagerAddress).to.equal(rollupManagerContract.target);
        // Get rollup data
        const rollupId = await rollupManagerContract.rollupAddressToID(createRollupOutput.rollupAddress);
        expect(Number(rollupId)).to.equal(createRollupOutput.rollupID);
        expect(await rollupManagerContract.chainIDToRollupID(createRollupConfig.chainID)).to.equal(
            createRollupOutput.rollupID,
        );
        const rollupFactory = (await ethers.getContractFactory(createRollupConfig.consensusContractName)) as any;
        let rollupContract;
        switch (createRollupConfig.consensusContractName) {
            case ConsensusContracts.PolygonZkEVMEtrog:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as PolygonZkEVMEtrog;
                break;
            case ConsensusContracts.PolygonValidiumEtrog:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as PolygonValidiumEtrog;
                break;
            case ConsensusContracts.PolygonPessimisticConsensus:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as PolygonPessimisticConsensus;
                break;
            case AGGCHAIN_CONTRACT_NAMES.ECDSA:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as AggchainECDSA;
                break;
            case AGGCHAIN_CONTRACT_NAMES.FEP:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as AggchainFEP;
                break;
            default:
                throw new Error('Invalid consensus contract');
        }

        expect(await rollupContract.aggchainManager()).to.equal(createRollupConfig.aggchainParams.aggchainManager);
    });

    it('Create a new rollup type', async () => {
        // Read docker deployment output
        const dockerCreateRollupOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output.json'), 'utf8'),
        );
        const dockerDeploymentOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, './deploymentOutput/deploy_output.json'), 'utf8'),
        );
        // Read create rollup config file
        const createRollupTypeConfig = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../tools/addRollupType/add_rollup_type.json.example'), 'utf8'),
        );

        // Update example config from docker deployment output
        createRollupTypeConfig.consensusContract = dockerCreateRollupOutput.consensusContract;
        createRollupTypeConfig.polygonRollupManagerAddress = dockerCreateRollupOutput.rollupManagerAddress;
        createRollupTypeConfig.verifierAddress = dockerCreateRollupOutput.verifierAddress;
        if (dockerCreateRollupOutput.consensusContract === ConsensusContracts.PolygonPessimisticConsensus) {
            createRollupTypeConfig.genesisRoot = ethers.ZeroHash;
            createRollupTypeConfig.programVKey = dockerCreateRollupOutput.programVKey;
        } else if (Object.values(AGGCHAIN_CONTRACT_NAMES).includes(dockerCreateRollupOutput.consensusContract)) {
            createRollupTypeConfig.genesisRoot = ethers.ZeroHash;
            createRollupTypeConfig.programVKey = ethers.ZeroHash;
            createRollupTypeConfig.verifierAddress = ethers.ZeroAddress;
            createRollupTypeConfig.forkID = 0;
        } else {
            createRollupTypeConfig.genesisRoot = dockerCreateRollupOutput.genesis;
            createRollupTypeConfig.programVKey = ethers.ZeroHash;
        }
        createRollupTypeConfig.polygonRollupManagerAddress = dockerDeploymentOutput.polygonRollupManagerAddress;
        createRollupTypeConfig.outputPath = 'add_rollup_type_output.json';
        delete createRollupTypeConfig.customALGatewayAddress;

        fs.writeFileSync(
            path.join(__dirname, '../tools/addRollupType/add_rollup_type.json'),
            JSON.stringify(createRollupTypeConfig, null, 2),
        );

        // Copy genesis file
        fs.copyFileSync(
            path.join(__dirname, '../tools/addRollupType/genesis.json.example'),
            path.join(__dirname, '../tools/addRollupType/genesis.json'),
        );
        // Run tool
        shelljs.exec('npx hardhat run ./tools/addRollupType/addRollupType.ts --network localhost');

        // Read create rollup output
        const createRollupTypeOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../tools/addRollupType/add_rollup_type_output.json'), 'utf8'),
        );
        // Check output values with current docker environment
        const PolygonRollupManagerFactory = await ethers.getContractFactory('PolygonRollupManager');
        const rollupManagerContract = PolygonRollupManagerFactory.attach(
            dockerDeploymentOutput.polygonRollupManagerAddress,
        ) as PolygonRollupManager;

        const rollupType = await rollupManagerContract.rollupTypeMap(Number(createRollupTypeOutput.rollupTypeID));
        // Consensus contract address
        expect(rollupType[0]).to.equal(createRollupTypeOutput.consensusContractAddress);
        // verifier address
        expect(rollupType[1]).to.equal(createRollupTypeConfig.verifierAddress);
        // ForkID
        expect(Number(rollupType[2])).to.equal(createRollupTypeConfig.forkID);
        // Genesis root
        expect(rollupType[5]).to.equal(createRollupTypeConfig.genesisRoot);
        // Program VKey
        expect(rollupType[6]).to.equal(createRollupTypeConfig.programVKey);
    });
});

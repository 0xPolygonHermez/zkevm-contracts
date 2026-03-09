import { expect } from 'chai';
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import shelljs from 'shelljs';
import { ConsensusContracts } from '../src/pessimistic-utils';
import { AGGCHAIN_CONTRACT_NAMES } from '../src/utils-common-aggchain';

import {
    AgglayerManager,
    PolygonPessimisticConsensus,
    PolygonValidiumEtrog,
    PolygonZkEVMEtrog,
    AggchainFEP,
    AggchainECDSAMultisig,
    AgglayerGateway,
} from '../typechain-types';

describe('Tooling docker build tests Contract', () => {
    let rollupContract: PolygonZkEVMEtrog | PolygonPessimisticConsensus | AggchainECDSAMultisig | AggchainFEP;

    it('Create a new rollup', async () => {
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
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
        const rollupManagerContract = PolygonRollupManagerFactory.attach(
            createRollupOutput.rollupManagerAddress,
        ) as AgglayerManager;

        expect(createRollupConfig.rollupManagerAddress).to.equal(rollupManagerContract.target);
        // Get rollup data
        const rollupId = await rollupManagerContract.rollupAddressToID(createRollupOutput.rollupAddress);
        expect(Number(rollupId)).to.equal(createRollupOutput.rollupID);
        expect(await rollupManagerContract.chainIDToRollupID(createRollupConfig.chainID)).to.equal(
            createRollupOutput.rollupID,
        );
        const rollupFactory = (await ethers.getContractFactory(createRollupConfig.consensusContractName)) as any;

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
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as AggchainECDSAMultisig;
                break;
            case AGGCHAIN_CONTRACT_NAMES.FEP:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as AggchainFEP;
                break;
            default:
                throw new Error('Invalid consensus contract');
        }

        expect(await rollupContract.aggchainManager()).to.equal(createRollupConfig.aggchainParams.aggchainManager);

        // Copy example config file
        fs.copyFileSync(
            path.join(__dirname, './scripts/tools/initialize_rollup.json'),
            path.join(__dirname, '../tools/initializeRollup/initialize_rollup.json'),
        );

        // Read create rollup config file
        const initializeRollupConfig = JSON.parse(
            fs.readFileSync(path.join(__dirname, './scripts/tools/initialize_rollup.json'), 'utf8'),
        );

        // Run tool
        const out = shelljs.exec('npx hardhat run ./tools/initializeRollup/initializeRollup.ts --network localhost');

        if (out.code === 1) {
            throw new Error('Error initializing rollup');
        }

        expect(await rollupContract.admin()).to.equal(initializeRollupConfig.rollupAdminAddress);
    });

    it('Add defaultAggchainVKey', async () => {
        // Copy example config file
        fs.copyFileSync(
            path.join(__dirname, './scripts/tools/parameters-aggchainvkey.json'),
            path.join(__dirname, '../tools/aggLayerGatewayTools/addDefaultAggchainVKey/parameters.json'),
        );

        // Read config file
        const addDefaultAggchainVKey = JSON.parse(
            fs.readFileSync(path.join(__dirname, './scripts/tools/parameters-aggchainvkey.json'), 'utf8'),
        );

        const AgglayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        const agglayerGatewayContract = AgglayerGatewayFactory.attach(
            addDefaultAggchainVKey.aggLayerGatewayAddress,
        ) as AgglayerGateway;

        expect(
            await agglayerGatewayContract.defaultAggchainVKeys(addDefaultAggchainVKey.defaultAggchainSelector),
        ).to.be.equal('0x0000000000000000000000000000000000000000000000000000000000000000');

        // Run tool
        const out = shelljs.exec(
            'npx hardhat run ./tools/aggLayerGatewayTools/addDefaultAggchainVKey/addDefaultAggchainVKey.ts --network localhost',
        );

        if (out.code === 1) {
            throw new Error('Error adding default aggchain vkey rollup');
        }

        expect(
            await agglayerGatewayContract.defaultAggchainVKeys(addDefaultAggchainVKey.defaultAggchainSelector),
        ).to.be.equal('0x1111111111111111111111111111111111111111111111111111111111111111');
    });

    it('Add pessimisticVkey', async () => {
        // Copy example config file
        fs.copyFileSync(
            path.join(__dirname, './scripts/tools/parameters-ppvkey.json'),
            path.join(__dirname, '../tools/aggLayerGatewayTools/addPessimisticVKeyRoute/parameters.json'),
        );

        // Read config file
        const addPessimisticVKeyRoute = JSON.parse(
            fs.readFileSync(path.join(__dirname, './scripts/tools/parameters-ppvkey.json'), 'utf8'),
        );
        const AgglayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        const agglayerGatewayContract = AgglayerGatewayFactory.attach(
            addPessimisticVKeyRoute.aggLayerGatewayAddress,
        ) as AgglayerGateway;

        expect(
            (await agglayerGatewayContract.pessimisticVKeyRoutes(addPessimisticVKeyRoute.pessimisticVKeySelector))[1],
        ).to.be.equal('0x0000000000000000000000000000000000000000000000000000000000000000');

        // Run tool
        const out = shelljs.exec(
            'npx hardhat run ./tools/aggLayerGatewayTools/addPessimisticVKeyRoute/addPessimisticVKeyRoute.ts --network localhost',
        );

        if (out.code === 1) {
            throw new Error('Error adding default aggchain vkey rollup');
        }

        expect(
            (await agglayerGatewayContract.pessimisticVKeyRoutes(addPessimisticVKeyRoute.pessimisticVKeySelector))[1],
        ).to.be.equal('0xac51a6a2e513d02e4f39ea51d4d133cec200b940805f1054eabbb6d6412c959f');
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
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
        const rollupManagerContract = PolygonRollupManagerFactory.attach(
            dockerDeploymentOutput.polygonRollupManagerAddress,
        ) as AgglayerManager;

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

    it('Check tool create genesis file', async () => {
        // Copy example genesis and config file
        fs.copyFileSync(
            path.join(__dirname, './scripts/tools/create-genesis-sovereign-params.json'),
            path.join(__dirname, '../tools/createSovereignGenesis/create-genesis-sovereign-params.json'),
        );
        fs.copyFileSync(
            path.join(__dirname, './deploymentOutput/genesis.json'),
            path.join(__dirname, '../tools/createSovereignGenesis/genesis-base.json'),
        );
        // Run tool
        const out = shelljs.exec(
            'npx hardhat run ./tools/createSovereignGenesis/create-sovereign-genesis.ts --network localhost',
        );

        if (out.code === 1) {
            throw new Error('Error creating genesis');
        }
    });
});

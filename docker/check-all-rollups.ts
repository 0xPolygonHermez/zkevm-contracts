import { expect } from 'chai';
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { AggchainFEP, AggchainECDSA, PolygonPessimisticConsensus, PolygonZkEVMEtrog } from '../typechain-types';

const deployOutput = JSON.parse(fs.readFileSync(path.join(__dirname, './deploymentOutput/deploy_output.json'), 'utf8'));
const { polygonRollupManagerAddress, polygonZkEVMBridgeAddress, polygonZkEVMGlobalExitRootAddress, polTokenAddress } =
    deployOutput;
const createRollupOutputFEP = JSON.parse(
    fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output.json'), 'utf8'),
);
const createRollupOutputv2 = JSON.parse(
    fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output_v0.2.0.json'), 'utf8'),
);
const createRollupOutputECDSA = JSON.parse(
    fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output_v0.3.0-ecdsa.json'), 'utf8'),
);
const createRollupOutputfork12 = JSON.parse(
    fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output_fork12.json'), 'utf8'),
);

describe('Docker build tests Contract', () => {
    it('should check AggchainFEP', async () => {
        const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const AggchainFEPContract = AggchainFEPFactory.attach(createRollupOutputFEP.rollupAddress) as AggchainFEP;
        expect(AggchainFEPContract.target).to.equal(createRollupOutputFEP.rollupAddress);
        expect(await AggchainFEPContract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await AggchainFEPContract.pol()).to.equal(polTokenAddress);
        expect(await AggchainFEPContract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await AggchainFEPContract.rollupManager()).to.equal(polygonRollupManagerAddress);
        const admin = await AggchainFEPContract.admin();
        // If admin is not zero address, means the contract is already initialized
        expect(admin).to.not.equal(ethers.ZeroAddress);
    });

    it('should check AggchainECDSA', async () => {
        const AggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSA');
        const AggchainECDSAContract = AggchainECDSAFactory.attach(
            createRollupOutputECDSA.rollupAddress,
        ) as AggchainECDSA;
        expect(AggchainECDSAContract.target).to.equal(createRollupOutputECDSA.rollupAddress);
        expect(await AggchainECDSAContract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await AggchainECDSAContract.pol()).to.equal(polTokenAddress);
        expect(await AggchainECDSAContract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await AggchainECDSAContract.rollupManager()).to.equal(polygonRollupManagerAddress);
        const admin = await AggchainECDSAContract.admin();
        // If admin is not zero address, means the contract is already initialized
        expect(admin).to.not.equal(ethers.ZeroAddress);
    });

    it('should check ECDSA v0.2.0', async () => {
        const PPconsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        const PPconsensusContract = PPconsensusFactory.attach(
            createRollupOutputv2.rollupAddress,
        ) as PolygonPessimisticConsensus;
        expect(PPconsensusContract.target).to.equal(createRollupOutputv2.rollupAddress);
        expect(await PPconsensusContract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await PPconsensusContract.pol()).to.equal(polTokenAddress);
        expect(await PPconsensusContract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await PPconsensusContract.rollupManager()).to.equal(polygonRollupManagerAddress);
        const admin = await PPconsensusContract.admin();
        // If admin is not zero address, means the contract is already initialized
        expect(admin).to.not.equal(ethers.ZeroAddress);
    });

    it('should check AggchainFEP', async () => {
        const PolygonZKEVMEtrogFactory = await ethers.getContractFactory('PolygonZkEVMEtrog');
        const PolygonZKEVMEtrogContract = PolygonZKEVMEtrogFactory.attach(
            createRollupOutputfork12.rollupAddress,
        ) as PolygonZkEVMEtrog;
        expect(PolygonZKEVMEtrogContract.target).to.equal(createRollupOutputfork12.rollupAddress);
        expect(await PolygonZKEVMEtrogContract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await PolygonZKEVMEtrogContract.pol()).to.equal(polTokenAddress);
        expect(await PolygonZKEVMEtrogContract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await PolygonZKEVMEtrogContract.rollupManager()).to.equal(polygonRollupManagerAddress);
        const admin = await PolygonZKEVMEtrogContract.admin();
        // If admin is not zero address, means the contract is already initialized
        expect(admin).to.not.equal(ethers.ZeroAddress);
    });
});

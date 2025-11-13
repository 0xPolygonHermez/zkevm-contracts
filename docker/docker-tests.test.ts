import { expect } from 'chai';
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import {
    PolygonRollupManager,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMBridgeV2,
    AggchainFEP,
    AggLayerGateway,
} from '../typechain-types';

const deployOutput = JSON.parse(fs.readFileSync(path.join(__dirname, './deploymentOutput/deploy_output.json'), 'utf8'));
const {
    polygonRollupManagerAddress,
    polygonZkEVMBridgeAddress,
    polygonZkEVMGlobalExitRootAddress,
    polTokenAddress,
    aggLayerGatewayAddress,
    admin,
} = deployOutput;
const createRollupOutput = JSON.parse(
    fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output.json'), 'utf8'),
);
const { rollupAddress } = createRollupOutput;

describe('Docker build tests Contract', () => {
    it('should check AggchainFEP', async () => {
        const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const AggchainFEPContract = AggchainFEPFactory.attach(rollupAddress) as AggchainFEP;
        expect(AggchainFEPContract.target).to.equal(rollupAddress);
        expect(await AggchainFEPContract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await AggchainFEPContract.pol()).to.equal(polTokenAddress);
        expect(await AggchainFEPContract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await AggchainFEPContract.rollupManager()).to.equal(polygonRollupManagerAddress);
        const adminContract = await AggchainFEPContract.admin();
        // If admin is not zero address, means the contract is already initialized
        expect(adminContract).to.not.equal(ethers.ZeroAddress);
    });

    it('should check RollupManager', async () => {
        const PolygonRollupManagerFactory = await ethers.getContractFactory('PolygonRollupManager');
        const rollupManagerContract = PolygonRollupManagerFactory.attach(
            polygonRollupManagerAddress,
        ) as PolygonRollupManager;
        expect(rollupManagerContract.target).to.equal(polygonRollupManagerAddress);
        expect(await rollupManagerContract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await rollupManagerContract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await rollupManagerContract.pol()).to.equal(polTokenAddress);
    });

    it('should check GlobalExitRootV2', async () => {
        const PolygonZkEVMGlobalExitRootV2Factory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootV2');
        const PolygonZkEVMGlobalExitRootV2Contract = PolygonZkEVMGlobalExitRootV2Factory.attach(
            polygonZkEVMGlobalExitRootAddress,
        ) as PolygonZkEVMGlobalExitRootV2;
        expect(PolygonZkEVMGlobalExitRootV2Contract.target).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await PolygonZkEVMGlobalExitRootV2Contract.bridgeAddress()).to.equal(polygonZkEVMBridgeAddress);
        expect(await PolygonZkEVMGlobalExitRootV2Contract.rollupManager()).to.equal(polygonRollupManagerAddress);
        // Check already initialized
        await expect(PolygonZkEVMGlobalExitRootV2Contract.initialize()).to.be.revertedWith(
            'Initializable: contract is already initialized',
        );
    });

    it('should check PolygonZkEVMBridgeV2', async () => {
        const PolygonZkEVMBridgeV2Factory = await ethers.getContractFactory('PolygonZkEVMBridgeV2');
        const PolygonZkEVMBridgeV2Contract = PolygonZkEVMBridgeV2Factory.attach(
            polygonZkEVMBridgeAddress,
        ) as PolygonZkEVMBridgeV2;
        expect(PolygonZkEVMBridgeV2Contract.target).to.equal(polygonZkEVMBridgeAddress);
        expect(await PolygonZkEVMBridgeV2Contract.globalExitRootManager()).to.equal(polygonZkEVMGlobalExitRootAddress);
        expect(await PolygonZkEVMBridgeV2Contract.polygonRollupManager()).to.equal(polygonRollupManagerAddress);
        // Check already initialized
        await expect(
            PolygonZkEVMBridgeV2Contract.initialize(
                0,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                polygonZkEVMGlobalExitRootAddress,
                polygonRollupManagerAddress,
                '0x',
            ),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should check AggLayerGateway', async () => {
        const AggLayerGatewayFactory = await ethers.getContractFactory('AggLayerGateway');
        const AggLayerGatewayContract = AggLayerGatewayFactory.attach(aggLayerGatewayAddress) as AggLayerGateway;
        expect(AggLayerGatewayContract.target).to.equal(aggLayerGatewayAddress);
        const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
        const AGGCHAIN_DEFAULT_VKEY_ROLE = ethers.id('AGGCHAIN_DEFAULT_VKEY_ROLE');
        const AL_ADD_PP_ROUTE_ROLE = ethers.id('AL_ADD_PP_ROUTE_ROLE');
        const AL_FREEZE_PP_ROUTE_ROLE = ethers.id('AL_FREEZE_PP_ROUTE_ROLE');
        expect(await AggLayerGatewayContract.hasRole(DEFAULT_ADMIN_ROLE, admin)).to.be.equal(true);
        expect(await AggLayerGatewayContract.hasRole(AGGCHAIN_DEFAULT_VKEY_ROLE, admin)).to.be.equal(true);
        expect(await AggLayerGatewayContract.hasRole(AL_ADD_PP_ROUTE_ROLE, admin)).to.be.equal(true);
        expect(await AggLayerGatewayContract.hasRole(AL_FREEZE_PP_ROUTE_ROLE, admin)).to.be.equal(true);
    });
});

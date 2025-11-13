import { ethers, upgrades } from 'hardhat';
import { PolygonZkEVMGlobalExitRoot, PolygonZkEVMBridgeV2 } from '../../typechain-types';

describe('PolygonZkEVMBridge Contract', () => {
    upgrades.silenceWarnings();

    let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;

    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;

    let rollupManager: any;

    const networkIDMainnet = 0;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [, rollupManager] = await ethers.getSigners();

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2');
        polygonZkEVMBridgeContract = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer'],
        })) as unknown as PolygonZkEVMBridgeV2;

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            rollupManager.address,
            polygonZkEVMBridgeContract.target,
        );

        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManager.address,
            '0x',
        );
    });
});

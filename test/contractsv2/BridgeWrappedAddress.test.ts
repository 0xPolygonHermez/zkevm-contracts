import { ethers, upgrades } from 'hardhat';
import { PolygonZkEVMGlobalExitRoot, AgglayerBridge } from '../../typechain-types';

describe('PolygonZkEVMBridge Contract', () => {
    upgrades.silenceWarnings();

    let polygonZkEVMBridgeContract: AgglayerBridge;

    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;

    let rollupManager: any;

    const networkIDMainnet = 0;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [, rollupManager] = await ethers.getSigners();

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('AgglayerBridge');
        polygonZkEVMBridgeContract = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer'],
        })) as unknown as AgglayerBridge;

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

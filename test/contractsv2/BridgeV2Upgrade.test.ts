/* eslint-disable no-plusplus, no-await-in-loop */
import { ethers, upgrades } from 'hardhat';
import { PolygonZkEVMBridgeV2Pessimistic, AgglayerBridge, PolygonZkEVMGlobalExitRoot } from '../../typechain-types';

describe('BridgeV2 upgrade', () => {
    let bridgeContract: AgglayerBridge;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;

    let rollupManager: any;

    const networkIDMainnet = 0;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollupManager] = await ethers.getSigners();

        // deploy bridgeV2Pessimistic
        const bridgePessimisticFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
        bridgeContract = (await upgrades.deployProxy(bridgePessimisticFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            rollupManager.address,
            bridgeContract.target,
        );

        // Initialize bridgeV2Pessimistic
        await bridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManager.address,
            '0x',
        );

        const bridgeV2Factory = await ethers.getContractFactory('AgglayerBridge');

        // Upgrade and initialize bridgeV2
        bridgeContract = (await upgrades.upgradeProxy(bridgeContract.target, bridgeV2Factory, {
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridge;
    });
});

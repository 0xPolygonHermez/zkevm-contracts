/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import {
    PolygonZkEVMBridgeV2Pessimistic,
    AgglayerBridgeL2FromEtrog,
    LegacyAgglayerGERL2,
    AgglayerGERL2,
} from '../../typechain-types';

describe('PolygonZkEVMBridgeV2Pessimistic upgrade -> AgglayerBridgeL2FromEtrog', () => {
    let bridgeOldContract: PolygonZkEVMBridgeV2Pessimistic;
    let gerOldContract: LegacyAgglayerGERL2;
    let bridgeContract: AgglayerBridgeL2FromEtrog;
    let gerContract: AgglayerGERL2;

    const BRIDGE_VERSION = 'v1.1.0';
    const GER_VERSION = 'v1.0.0';

    let rollupManager: any;
    let bridgeManager: any;
    let emergencyBridgePauser: any;
    let emergencyBridgeUnpauser: any;
    let proxiedTokensManager: any;
    let globalExitRootUpdater: any;
    let globalExitRootRemover: any;

    const networkIDMainnet = 0;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [
            rollupManager,
            bridgeManager,
            emergencyBridgePauser,
            emergencyBridgeUnpauser,
            proxiedTokensManager,
            globalExitRootRemover,
            globalExitRootUpdater,
        ] = await ethers.getSigners();

        // deploy bridgeV2Pessimistic
        const bridgePessimisticFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
        bridgeOldContract = (await upgrades.deployProxy(bridgePessimisticFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('LegacyAgglayerGERL2');
        gerOldContract = (await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            constructorArgs: [bridgeOldContract.target],
        })) as unknown as LegacyAgglayerGERL2;

        // Initialize bridgeV2Pessimistic
        await bridgeOldContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            gerOldContract.target,
            rollupManager.address,
            '0x',
        );

        const bridgeL2Factory = await ethers.getContractFactory('AgglayerBridgeL2FromEtrog');

        // Upgrade and initialize bridgeL2
        bridgeContract = (await upgrades.upgradeProxy(bridgeOldContract.target, bridgeL2Factory, {
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            call: {
                fn: 'initializeFromEtrog(address,address,address,address,uint32[],address[],uint256[])',
                args: [
                    bridgeManager.address,
                    emergencyBridgePauser.address,
                    emergencyBridgeUnpauser.address,
                    proxiedTokensManager.address,
                    [],
                    [],
                    [],
                ],
            },
        })) as unknown as AgglayerBridgeL2FromEtrog;

        const gerL2Factory = await ethers.getContractFactory('AgglayerGERL2');

        // Upgrade and initialize gerL2
        gerContract = (await upgrades.upgradeProxy(gerOldContract.target, gerL2Factory, {
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            constructorArgs: [bridgeContract.target],
            call: {
                fn: 'initialize(address,address)',
                args: [globalExitRootUpdater.address, globalExitRootRemover.address],
            },
        })) as unknown as AgglayerGERL2;
    });

    it('Should check params after upgrade from etrog to sovereign', async () => {
        // Check new params

        // checks bridge
        expect(await bridgeContract.getProxiedTokensManager()).to.be.equal(proxiedTokensManager.address);
        expect(await bridgeContract.wrappedTokenBytecodeStorer()).to.not.be.equal(ethers.ZeroAddress);
        expect(await bridgeContract.getWrappedTokenBridgeImplementation()).to.not.be.equal(ethers.ZeroAddress);
        expect(await bridgeContract.BRIDGE_SOVEREIGN_VERSION()).to.equal(BRIDGE_VERSION);
        expect(await bridgeContract.globalExitRootManager()).to.equal(gerContract.target);
        expect(await bridgeContract.polygonRollupManager()).to.equal(rollupManager);
        expect(await bridgeContract.proxiedTokensManager()).to.equal(proxiedTokensManager.address);
        expect(await bridgeContract.emergencyBridgePauser()).to.equal(emergencyBridgePauser.address);
        expect(await bridgeContract.emergencyBridgeUnpauser()).to.equal(emergencyBridgeUnpauser.address);

        // checks ger
        expect(await gerContract.globalExitRootUpdater()).to.equal(globalExitRootUpdater.address);
        expect(await gerContract.globalExitRootRemover()).to.equal(globalExitRootRemover.address);
        expect(await gerContract.GER_SOVEREIGN_VERSION()).to.equal(GER_VERSION);
        expect(await gerContract.bridgeAddress()).to.equal(bridgeContract.target);
    });
});

import { expect } from 'chai';
import hre, { artifacts, ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { assertCompatibleStorage } from '../../tools/bridgeCompatibility/storageLayout';
import { getPreviousBridgeFactory, getPreviousBridgeBuild } from '../../tools/bridgeCompatibility/previousVersions';
import { AgglayerBridgeL2 } from '../../typechain-types';
import { ProxyAdmin } from '../../typechain-types/@openzeppelin/contracts4/proxy/transparent';
import baseline from '../../upgrade/previousVersions/bridge/snapshots/AgglayerBridgeL2.v1.2.0.json';

describe('AgglayerBridgeL2 compatibility', () => {
    it('preserves the complete v1.2.0 ABI', async () => {
        const artifact = await artifacts.readArtifact('AgglayerBridgeL2');
        expect(artifact.abi).to.deep.equal(baseline.abi);
    });

    it('preserves the v1.2.0 storage layout', async () => {
        const previous = await getPreviousBridgeBuild('AgglayerBridgeL2');
        const buildInfo = await artifacts.getBuildInfo(`${baseline.sourceName}:${baseline.contractName}`);
        const layout = (buildInfo!.output.contracts[baseline.sourceName][baseline.contractName] as any).storageLayout;
        assertCompatibleStorage(previous.storageLayout, layout);
        expect(layout.storage.map(({ label, slot, offset }: any) => ({ label, slot, offset }))).to.deep.equal(
            baseline.storageLayout.storage.map(({ label, slot, offset }) => ({ label, slot, offset })),
        );
    });

    it('uses identical bridge and module storage', async () => {
        const buildInfo = await artifacts.getBuildInfo(`${baseline.sourceName}:${baseline.contractName}`);
        const { contracts } = buildInfo!.output;
        const bridgeLayout = (contracts[baseline.sourceName][baseline.contractName] as any).storageLayout;
        const moduleLayout = (
            contracts['contracts/sovereignChains/AgglayerBridgeL2Module.sol'].AgglayerBridgeL2Module as any
        ).storageLayout;
        const physicalLayout = (layout: any) =>
            JSON.parse(JSON.stringify(layout, (key, value) => (key === 'contract' ? undefined : value)));
        expect(physicalLayout(moduleLayout)).to.deep.equal(physicalLayout(bridgeLayout));
    });

    const itProduction = (hre as any).__SOLIDITY_COVERAGE_RUNNING ? it.skip : it;
    itProduction('keeps runtime and creation bytecode within enforced budgets', async () => {
        const artifact = await artifacts.readArtifact('AgglayerBridgeL2');
        const moduleArtifact = await artifacts.readArtifact('AgglayerBridgeL2Module');
        const etrogArtifact = await artifacts.readArtifact('AgglayerBridgeL2FromEtrog');
        expect(ethers.dataLength(artifact.deployedBytecode)).to.be.lessThan(20_000);
        expect(ethers.dataLength(moduleArtifact.deployedBytecode)).to.be.lessThan(24_576);
        expect(ethers.dataLength(etrogArtifact.deployedBytecode)).to.be.lessThan(24_576);
        expect(ethers.dataLength(artifact.bytecode)).to.be.lessThan(49_152);
        expect(ethers.dataLength(etrogArtifact.bytecode)).to.be.lessThan(49_152);
    });

    it('rejects direct calls to module mutators', async () => {
        const [caller] = await ethers.getSigners();
        const module = await (await ethers.getContractFactory('AgglayerBridgeL2Module')).deploy();
        const proof = Array(32).fill(ethers.ZeroHash);
        const calls: [string, any[]][] = [
            ['setMultipleSovereignTokenAddress', [[], [], [], []]],
            ['removeLegacySovereignTokenAddress', [caller.address]],
            ['setSovereignWETHAddress', [caller.address, false]],
            ['unsetMultipleClaims', [[]]],
            ['setMultipleClaims', [[]]],
            ['backwardLET', [0, proof, ethers.ZeroHash, proof]],
            ['forwardLET', [[], ethers.ZeroHash]],
            ['forceEmitDetailedClaimEvent', [[]]],
            ['setLocalBalanceTree', [[], [], []]],
            ['setBridgeManager', [caller.address]],
            ['transferEmergencyBridgePauserRole', [caller.address]],
            ['acceptEmergencyBridgePauserRole', []],
            ['transferEmergencyBridgeUnpauserRole', [caller.address]],
            ['acceptEmergencyBridgeUnpauserRole', []],
        ];
        await Promise.all(
            calls.map(async ([name, args]) => {
                await expect(module.getFunction(name).staticCall(...args)).to.be.revertedWithCustomError(
                    module,
                    'OnlyDelegateCall',
                );
            }),
        );
    });

    it('upgrades populated v1.2.0 state, preserves caller and events, and permits rollback', async () => {
        const [deployer, bridgeManager, pendingPauser, pendingUnpauser, tokensManager, pendingTokensManager, user] =
            await ethers.getSigners();
        const oldFactory = await getPreviousBridgeFactory('AgglayerBridgeL2', deployer);
        const oldImplementation = await oldFactory.deploy();
        await oldImplementation.waitForDeployment();
        const admin = (await (
            await ethers.getContractFactory('@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin')
        ).deploy()) as unknown as ProxyAdmin;
        const proxy = await (
            await ethers.getContractFactory(
                '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
            )
        ).deploy(oldImplementation.target, admin.target, '0x');
        const bridgeFactory = await ethers.getContractFactory('AgglayerBridgeL2');
        const bridge = bridgeFactory.attach(proxy.target) as AgglayerBridgeL2;
        const ger = await upgrades.deployProxy(await ethers.getContractFactory('AgglayerGERL2'), [], {
            initializer: false,
            constructorArgs: [proxy.target],
            unsafeAllow: ['constructor', 'missing-initializer', 'state-variable-immutable'],
        });
        await ger.initialize(deployer.address, deployer.address);
        await bridge[
            'initialize(uint32,address,uint32,address,address,bytes,address,address,bool,address,address,address)'
        ](
            2,
            ethers.ZeroAddress,
            0,
            ger.target,
            deployer.address,
            '0x',
            bridgeManager.address,
            ethers.ZeroAddress,
            false,
            deployer.address,
            deployer.address,
            tokensManager.address,
        );
        expect(await bridge.version()).to.equal('v1.2.0');

        const token = await (
            await ethers.getContractFactory('ERC20PermitMock')
        ).deploy('Origin token', 'ORG', deployer.address, ethers.parseEther('100'));
        const amount = ethers.parseEther('1');
        const leafHash = mtBridgeUtils.getLeafValue(
            0,
            2,
            token.target,
            2,
            user.address,
            amount,
            ethers.keccak256('0x'),
        );
        const tree = new MTBridge(32);
        tree.add(leafHash);
        const proof = tree.getProofTreeByIndex(0);
        const mainnetExitRoot = tree.getRoot();
        const globalIndex = 2n ** 64n;
        await ger.insertGlobalExitRoot(
            ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, ethers.ZeroHash]),
        );
        await token.transfer(bridge.target, amount * 2n);
        await bridge.claimAsset(
            proof,
            proof,
            globalIndex,
            mainnetExitRoot,
            ethers.ZeroHash,
            2,
            token.target,
            2,
            user.address,
            amount,
            '0x',
        );
        await bridge.unsetMultipleClaims([globalIndex]);
        await bridge.setMultipleClaims([globalIndex]);
        await bridge.bridgeMessage(0, user.address, true, '0x1234');
        await bridge.transferEmergencyBridgePauserRole(pendingPauser.address);
        await bridge.transferEmergencyBridgeUnpauserRole(pendingUnpauser.address);
        await bridge.connect(tokensManager).transferProxiedTokensManagerRole(pendingTokensManager.address);
        await bridge
            .connect(bridgeManager)
            .setMultipleSovereignTokenAddress([0], [user.address], [token.target], [true]);
        await bridge.activateEmergencyState();
        await bridge.setLocalBalanceTree([0], [user.address], [amount]);

        const localBalanceHash = ethers.solidityPackedKeccak256(['uint32', 'address'], [0, user.address]);
        const layout = baseline.storageLayout;
        const slotFor = (label: string) => BigInt(layout.storage.find((entry) => entry.label === label)!.slot);
        const mapSlot = (key: string | bigint, slot: bigint, keyType: string) =>
            ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([keyType, 'uint256'], [key, slot]));
        const lastEntry = layout.storage[layout.storage.length - 1];
        const lastType = (layout.types as Record<string, { numberOfBytes: string }>)[lastEntry.type];
        const slotCount = Number(lastEntry.slot) + Math.ceil(Number(lastType.numberOfBytes) / 32);
        const slots = [
            ...Array.from({ length: slotCount }, (_, index) => ethers.toBeHex(index)),
            mapSlot(0n, slotFor('claimedBitMap'), 'uint256'),
            mapSlot(localBalanceHash, slotFor('localBalanceTree'), 'bytes32'),
            mapSlot(localBalanceHash, slotFor('tokenInfoToWrappedToken'), 'bytes32'),
            mapSlot(token.target as string, slotFor('wrappedTokenToTokenInfo'), 'address'),
            mapSlot(token.target as string, slotFor('wrappedAddressIsNotMintable'), 'address'),
        ];
        const readStorage = () => Promise.all(slots.map((slot) => ethers.provider.getStorage(proxy.target, slot)));
        const beforeStorage = await readStorage();
        const rootBefore = await bridge.getRoot();
        const claimedHashBefore = await bridge.claimedGlobalIndexHashChain();
        expect(claimedHashBefore).not.to.equal(ethers.ZeroHash);
        expect(await bridge.unsetGlobalIndexHashChain()).not.to.equal(ethers.ZeroHash);

        await upgrades.validateImplementation(bridgeFactory, {
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        });
        const implementation = await bridgeFactory.deploy();
        await implementation.waitForDeployment();
        await admin.upgrade(proxy.target, implementation.target);
        expect(await bridge.version()).to.equal('v1.3.0');
        expect(await readStorage()).to.deep.equal(beforeStorage);
        expect(await bridge.getRoot()).to.equal(rootBefore);
        expect(await bridge.localBalanceTree(localBalanceHash)).to.equal(amount);
        expect(await bridge.getProxiedTokensManager()).to.equal(tokensManager.address);
        expect(await bridge.isEmergencyState()).to.equal(true);
        expect(await bridge.isClaimed(0, 0)).to.equal(true);

        await expect(
            bridge.forceEmitDetailedClaimEvent([
                {
                    smtProofLocalExitRoot: proof,
                    smtProofRollupExitRoot: proof,
                    globalIndex,
                    mainnetExitRoot,
                    rollupExitRoot: ethers.ZeroHash,
                    leafType: 0,
                    originNetwork: 2,
                    originAddress: token.target,
                    destinationNetwork: 2,
                    destinationAddress: user.address,
                    amount,
                    metadata: '0x1234',
                },
            ]),
        )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proof,
                proof,
                globalIndex,
                mainnetExitRoot,
                ethers.ZeroHash,
                0,
                2,
                token.target,
                2,
                user.address,
                amount,
                '0x1234',
            );
        await expect(bridge.forceEmitDetailedClaimEvent([])).not.to.emit(bridge, 'DetailedClaimEvent');
        await expect(bridge.connect(user).forceEmitDetailedClaimEvent([])).to.be.revertedWithCustomError(
            bridge,
            'OnlyGlobalExitRootRemover',
        );
        await bridge.transferEmergencyBridgePauserRole(pendingPauser.address);
        await bridge.transferEmergencyBridgeUnpauserRole(pendingUnpauser.address);
        await expect(bridge.connect(user).acceptEmergencyBridgePauserRole()).to.be.revertedWithCustomError(
            bridge,
            'OnlyPendingEmergencyBridgePauser',
        );
        await expect(bridge.connect(user).acceptEmergencyBridgeUnpauserRole()).to.be.revertedWithCustomError(
            bridge,
            'OnlyPendingEmergencyBridgeUnpauser',
        );

        await expect(bridge.connect(user).setBridgeManager(user.address)).to.be.revertedWithCustomError(
            bridge,
            'OnlyBridgeManager',
        );
        await expect(bridge.connect(user).setMultipleClaims([globalIndex + 1n])).to.be.revertedWithCustomError(
            bridge,
            'OnlyGlobalExitRootRemover',
        );
        await expect(bridge.setMultipleClaims([globalIndex])).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');
        await expect(bridge.connect(pendingPauser).acceptEmergencyBridgePauserRole())
            .to.emit(bridge, 'AcceptEmergencyBridgePauserRole')
            .withArgs(deployer.address, pendingPauser.address);
        await bridge.connect(pendingUnpauser).acceptEmergencyBridgeUnpauserRole();
        await bridge.connect(pendingTokensManager).acceptProxiedTokensManagerRole();
        await bridge.connect(pendingUnpauser).deactivateEmergencyState();
        await expect(bridge.setLocalBalanceTree([0], [user.address], [0])).to.be.reverted;
        await bridge.connect(pendingPauser).activateEmergencyState();
        await expect(bridge.connect(bridgeManager).setBridgeManager(user.address))
            .to.emit(bridge, 'SetBridgeManager')
            .withArgs(user.address);

        const postUpgradeStorage = await readStorage();
        await admin.upgrade(proxy.target, oldImplementation.target);
        expect(await bridge.version()).to.equal('v1.2.0');
        expect(await readStorage()).to.deep.equal(postUpgradeStorage);
        await bridge.connect(user).setBridgeManager(bridgeManager.address);
    });
});

import { expect } from 'chai';
import { artifacts, ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { AgglayerBridge } from '../../typechain-types';
import { ProxyAdmin } from '../../typechain-types/@openzeppelin/contracts4/proxy/transparent';
import { assertCompatibleStorage } from '../../tools/bridgeCompatibility/storageLayout';
import { getPreviousBridgeFactory } from '../../tools/bridgeCompatibility/previousVersions';
import baseline from '../../upgrade/previousVersions/bridge/snapshots/AgglayerBridge.v1.1.0.json';

describe('AgglayerBridge local proxy upgrades', () => {
    [false, true].forEach((customGasToken) => {
        it(`preserves populated v1.1.0 storage and wrapped tokens with ${customGasToken ? 'custom gas' : 'Ether'}, including rollback`, async () => {
            const [deployer, rollupManager, user, nextTokensManager, origin, gasToken] = await ethers.getSigners();
            const oldImplementation = await (await getPreviousBridgeFactory('AgglayerBridge', deployer)).deploy();
            await oldImplementation.waitForDeployment();
            const admin = (await (
                await ethers.getContractFactory('@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol:ProxyAdmin')
            ).deploy()) as unknown as ProxyAdmin;
            const proxy = await (
                await ethers.getContractFactory(
                    '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
                )
            ).deploy(oldImplementation.target, admin.target, '0x');
            const factory = await ethers.getContractFactory('AgglayerBridge');
            const bridge = factory.attach(proxy.target) as AgglayerBridge;
            const ger = await (
                await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot')
            ).deploy(rollupManager.address, proxy.target);
            const gasTokenAddress = customGasToken ? gasToken.address : ethers.ZeroAddress;
            const gasTokenNetwork = customGasToken ? 7 : 0;
            const gasTokenMetadata = customGasToken
                ? ethers.AbiCoder.defaultAbiCoder().encode(
                      ['string', 'string', 'uint8'],
                      ['Gas token metadata spanning multiple storage words', 'GAS', 18],
                  )
                : '0x';
            await bridge.initialize(
                0,
                gasTokenAddress,
                gasTokenNetwork,
                ger.target,
                rollupManager.address,
                gasTokenMetadata,
            );
            expect(await bridge.version()).to.equal(baseline.version);
            expect(await bridge.getProxiedTokensManager()).to.equal(deployer.address);

            const amount = ethers.parseEther('1');
            const localToken = await (
                await ethers.getContractFactory('ERC20PermitMock')
            ).deploy('Local token', 'LOCAL', deployer.address, amount * 100n);
            await localToken.approve(proxy.target, amount * 2n);
            await bridge.bridgeAsset(1, user.address, amount, localToken.target, true, '0x');
            await bridge.bridgeAsset(1, user.address, amount, ethers.ZeroAddress, true, '0x', { value: amount });
            await bridge.bridgeMessage(1, user.address, true, '0x1234');

            const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
                ['string', 'string', 'uint8'],
                ['Remote token', 'REMOTE', 18],
            );
            const remoteTree = new MTBridge(32);
            remoteTree.add(
                mtBridgeUtils.getLeafValue(0, 1, origin.address, 0, user.address, amount, ethers.keccak256(metadata)),
            );
            remoteTree.add(
                mtBridgeUtils.getLeafValue(
                    0,
                    1,
                    origin.address,
                    0,
                    user.address,
                    amount * 2n,
                    ethers.keccak256(metadata),
                ),
            );
            const rollupTree = new MTBridge(32);
            rollupTree.add(remoteTree.getRoot());
            const rollupExitRoot = rollupTree.getRoot();
            await ger.connect(rollupManager).updateExitRoot(rollupExitRoot);
            const mainnetExitRoot = await ger.lastMainnetExitRoot();
            const claim = (leafIndex: number, claimAmount: bigint) =>
                bridge.claimAsset(
                    remoteTree.getProofTreeByIndex(leafIndex),
                    rollupTree.getProofTreeByIndex(0),
                    leafIndex,
                    mainnetExitRoot,
                    rollupExitRoot,
                    1,
                    origin.address,
                    0,
                    user.address,
                    claimAmount,
                    metadata,
                );
            await claim(0, amount);
            const wrappedAddress = await bridge.getTokenWrappedAddress(1, origin.address);
            const wrapped = (await ethers.getContractAt('TokenWrappedBridgeUpgradeable', wrappedAddress)).connect(user);
            expect(await wrapped.balanceOf(user.address)).to.equal(amount);
            expect(await bridge.isClaimed(0, 1)).to.equal(true);
            await bridge.transferProxiedTokensManagerRole(nextTokensManager.address);
            await bridge.connect(rollupManager).activateEmergencyState();

            const layout = baseline.storageLayout;
            const slotFor = (label: string) => BigInt(layout.storage.find((entry) => entry.label === label)!.slot);
            const mappingSlot = (keyType: string, key: string | bigint, slot: bigint) =>
                ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([keyType, 'uint256'], [key, slot]));
            const tokenInfoHash = ethers.solidityPackedKeccak256(['uint32', 'address'], [1, origin.address]);
            const last = layout.storage[layout.storage.length - 1];
            const lastType = (layout.types as Record<string, { numberOfBytes: string }>)[last.type];
            const fixedSlotCount = Number(last.slot) + Math.ceil(Number(lastType.numberOfBytes) / 32);
            const metadataStart = BigInt(
                ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [slotFor('gasTokenMetadata')])),
            );
            const metadataWords =
                ethers.dataLength(gasTokenMetadata) > 31 ? Math.ceil(ethers.dataLength(gasTokenMetadata) / 32) : 0;
            const slots = [
                ...Array.from({ length: fixedSlotCount }, (_, index) => ethers.toBeHex(index)),
                mappingSlot('uint256', 0n, slotFor('claimedBitMap')),
                mappingSlot('bytes32', tokenInfoHash, slotFor('tokenInfoToWrappedToken')),
                mappingSlot('address', wrappedAddress, slotFor('wrappedTokenToTokenInfo')),
                ...Array.from({ length: metadataWords }, (_, index) => ethers.toBeHex(metadataStart + BigInt(index))),
            ];
            const readState = async () => ({
                storage: await Promise.all(slots.map((slot) => ethers.provider.getStorage(proxy.target, slot))),
                root: await bridge.getRoot(),
                gasTokenMetadata: await bridge.gasTokenMetadata(),
                weth: await bridge.WETHToken(),
                tokenInfo: [...(await bridge.wrappedTokenToTokenInfo(wrappedAddress))],
                wrappedAddress: await bridge.getTokenWrappedAddress(1, origin.address),
                wrappedBalance: await wrapped.balanceOf(user.address),
                wrappedSupply: await wrapped.totalSupply(),
                lockedBalance: await localToken.balanceOf(proxy.target),
                etherBalance: await ethers.provider.getBalance(proxy.target),
                proxyAdmin: await upgrades.erc1967.getAdminAddress(proxy.target as string),
            });
            const before = await readState();
            expect(before.weth === ethers.ZeroAddress).to.equal(!customGasToken);
            expect(before.lockedBalance).to.equal(amount);
            expect(before.etherBalance).to.equal(amount);

            const build = await artifacts.getBuildInfo(`${baseline.sourceName}:${baseline.contractName}`);
            assertCompatibleStorage(
                layout,
                (build!.output.contracts[baseline.sourceName][baseline.contractName] as any).storageLayout,
            );
            await upgrades.validateImplementation(factory, {
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            });
            const implementation = await factory.deploy();
            await implementation.waitForDeployment();
            await expect(admin.upgrade(proxy.target, implementation.target))
                .to.emit(proxy, 'Upgraded')
                .withArgs(implementation.target);
            expect(await upgrades.erc1967.getImplementationAddress(proxy.target as string)).to.equal(
                implementation.target,
            );
            expect(await readState()).to.deep.equal(before);
            expect(await bridge.isClaimed(0, 1)).to.equal(true);
            expect(await bridge.isEmergencyState()).to.equal(true);
            expect(await bridge.pendingProxiedTokensManager()).to.equal(nextTokensManager.address);

            await expect(
                bridge.initialize(
                    0,
                    gasTokenAddress,
                    gasTokenNetwork,
                    ger.target,
                    rollupManager.address,
                    gasTokenMetadata,
                ),
            ).to.be.revertedWith('Initializable: contract is already initialized');
            await expect(bridge.connect(user).deactivateEmergencyState()).to.be.revertedWithCustomError(
                bridge,
                'OnlyRollupManager',
            );
            await expect(bridge.bridgeMessage(1, user.address, false, '0x')).to.be.reverted;
            await bridge.connect(rollupManager).deactivateEmergencyState();
            await expect(claim(0, amount)).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');
            await claim(1, amount * 2n);
            expect(await wrapped.balanceOf(user.address)).to.equal(amount * 3n);
            expect(await bridge.getTokenWrappedAddress(1, origin.address)).to.equal(wrappedAddress);
            await bridge.connect(user).bridgeAsset(1, user.address, amount, wrappedAddress, true, '0x');
            expect(await wrapped.balanceOf(user.address)).to.equal(amount * 2n);
            await bridge.connect(nextTokensManager).acceptProxiedTokensManagerRole();
            expect(await bridge.getProxiedTokensManager()).to.equal(nextTokensManager.address);

            const beforeRollback = await readState();
            await admin.upgrade(proxy.target, oldImplementation.target);
            expect(await upgrades.erc1967.getImplementationAddress(proxy.target as string)).to.equal(
                oldImplementation.target,
            );
            expect(await readState()).to.deep.equal(beforeRollback);
            expect(await bridge.isClaimed(1, 1)).to.equal(true);
            await bridge.connect(user).bridgeAsset(1, user.address, amount, wrappedAddress, false, '0x');
            expect(await wrapped.balanceOf(user.address)).to.equal(amount);
        });
    });
});

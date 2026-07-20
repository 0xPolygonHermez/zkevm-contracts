import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import {
    AgglayerBridge,
    AgglayerERC7786Gateway,
    ERC7786RecipientMock,
    PolygonZkEVMGlobalExitRoot,
} from '../../../typechain-types';

const MerkleTreeBridge = MTBridge;
const { verifyMerkleProof, getLeafValue } = mtBridgeUtils;

// eslint-disable-next-line @typescript-eslint/naming-convention
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    }
    return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
}

/**
 * Encodes an ERC-7930 v1 eip155 interoperable address
 */
function encodeInteroperableAddress(chainId: bigint, address: string): string {
    let chainIdHex = chainId.toString(16);
    if (chainIdHex.length % 2 === 1) {
        chainIdHex = `0${chainIdHex}`;
    }
    const chainReferenceLength = chainIdHex.length / 2;
    return ethers.concat([
        '0x0001', // version
        '0x0000', // chain type (eip155)
        ethers.toBeHex(chainReferenceLength, 1),
        `0x${chainIdHex}`,
        '0x14', // address length (20)
        address,
    ]);
}

const FORCE_UPDATE_GER_SELECTOR = ethers.id('forceUpdateGlobalExitRoot(bool)').slice(0, 10);

/**
 * Encodes the forceUpdateGlobalExitRoot(bool) ERC-7786 attribute
 */
function encodeForceUpdateGERAttribute(value: boolean): string {
    return ethers.concat([FORCE_UPDATE_GER_SELECTOR, ethers.AbiCoder.defaultAbiCoder().encode(['bool'], [value])]);
}

describe('AgglayerERC7786Gateway', () => {
    upgrades.silenceWarnings();

    let bridgeContract: AgglayerBridge;
    let globalExitRootContract: PolygonZkEVMGlobalExitRoot;
    let gatewayContract: AgglayerERC7786Gateway;
    let recipientContract: ERC7786RecipientMock;

    let deployer: any;
    let rollupManager: any;
    let acc1: any;
    let remoteGateway: any;

    let localChainId: bigint;

    const networkIDMainnet = 0;
    const networkIDRollup = 1;
    const remoteChainId = 1101n;

    const LEAF_TYPE_MESSAGE = 1;

    const payload = '0x123456789abcdef0';

    beforeEach('Deploy contracts', async () => {
        [deployer, rollupManager, acc1, remoteGateway] = await ethers.getSigners();

        localChainId = (await ethers.provider.getNetwork()).chainId;

        // deploy bridge
        const bridgeFactory = await ethers.getContractFactory('AgglayerBridge');
        bridgeContract = (await upgrades.deployProxy(bridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridge;

        // deploy global exit root manager
        const globalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        globalExitRootContract = await globalExitRootFactory.deploy(rollupManager.address, bridgeContract.target);

        await bridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            globalExitRootContract.target,
            rollupManager.address,
            '0x',
        );

        // deploy ERC-7786 gateway
        const gatewayFactory = await ethers.getContractFactory('AgglayerERC7786Gateway');
        gatewayContract = await gatewayFactory.deploy(bridgeContract.target, deployer.address);

        // deploy ERC-7786 recipient mock
        const recipientFactory = await ethers.getContractFactory('ERC7786RecipientMock');
        recipientContract = await recipientFactory.deploy();
    });

    describe('constructor and owner configuration', () => {
        it('should set the bridge, local network id and owner', async () => {
            expect(await gatewayContract.bridge()).to.be.equal(bridgeContract.target);
            expect(await gatewayContract.localNetworkID()).to.be.equal(networkIDMainnet);
            expect(await gatewayContract.owner()).to.be.equal(deployer.address);
            expect(await gatewayContract.nonce()).to.be.equal(0);
        });

        it('should register a remote network and expose the mappings', async () => {
            await expect(gatewayContract.registerRemoteNetwork(remoteChainId, networkIDRollup, remoteGateway.address))
                .to.emit(gatewayContract, 'RemoteNetworkRegistered')
                .withArgs(remoteChainId, networkIDRollup, remoteGateway.address);

            expect(await gatewayContract.chainIdToNetworkID(remoteChainId)).to.be.equal(networkIDRollup);
            expect(await gatewayContract.networkIDToChainId(networkIDRollup)).to.be.equal(remoteChainId);
            expect(await gatewayContract.remoteGateways(networkIDRollup)).to.be.equal(remoteGateway.address);
        });

        it('should revert registering chain id zero', async () => {
            await expect(
                gatewayContract.registerRemoteNetwork(0, networkIDRollup, remoteGateway.address),
            ).to.be.revertedWithCustomError(gatewayContract, 'InvalidZeroValue');
        });

        it('should revert registering a zero remote gateway', async () => {
            await expect(
                gatewayContract.registerRemoteNetwork(remoteChainId, networkIDRollup, ethers.ZeroAddress),
            ).to.be.revertedWithCustomError(gatewayContract, 'InvalidZeroValue');
        });

        it('should revert when a non-owner registers a remote network', async () => {
            await expect(
                gatewayContract
                    .connect(acc1)
                    .registerRemoteNetwork(remoteChainId, networkIDRollup, remoteGateway.address),
            ).to.be.revertedWithCustomError(gatewayContract, 'OwnableUnauthorizedAccount');
        });

        it('should revert chainIdToNetworkID for an unregistered chain', async () => {
            await expect(gatewayContract.chainIdToNetworkID(remoteChainId))
                .to.be.revertedWithCustomError(gatewayContract, 'UnregisteredChain')
                .withArgs(remoteChainId);
        });
    });

    describe('supportsAttribute', () => {
        it('should support forceUpdateGlobalExitRoot(bool) only', async () => {
            expect(await gatewayContract.supportsAttribute(FORCE_UPDATE_GER_SELECTOR)).to.be.equal(true);
            expect(await gatewayContract.FORCE_UPDATE_GLOBAL_EXIT_ROOT_ATTRIBUTE()).to.be.equal(
                FORCE_UPDATE_GER_SELECTOR,
            );
            expect(await gatewayContract.supportsAttribute('0x12345678')).to.be.equal(false);
        });
    });

    describe('sendMessage', () => {
        beforeEach('Register remote network', async () => {
            await gatewayContract.registerRemoteNetwork(remoteChainId, networkIDRollup, remoteGateway.address);
        });

        it('should send a message through the bridge and emit MessageSent', async () => {
            const recipient = encodeInteroperableAddress(remoteChainId, acc1.address);

            const expectedSendId = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ['uint256', 'address', 'uint256'],
                    [localChainId, gatewayContract.target, 0],
                ),
            );
            const expectedMetadata = ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'address', 'address', 'bytes'],
                [expectedSendId, deployer.address, acc1.address, payload],
            );
            const expectedSender = encodeInteroperableAddress(localChainId, deployer.address);

            const depositCount = await bridgeContract.depositCount();

            await expect(gatewayContract.sendMessage(recipient, payload, []))
                .to.emit(gatewayContract, 'MessageSent')
                .withArgs(expectedSendId, expectedSender, recipient, payload, 0, [])
                .to.emit(bridgeContract, 'BridgeEvent')
                .withArgs(
                    LEAF_TYPE_MESSAGE,
                    networkIDMainnet,
                    gatewayContract.target,
                    networkIDRollup,
                    remoteGateway.address,
                    0,
                    expectedMetadata,
                    depositCount,
                );

            expect(await gatewayContract.nonce()).to.be.equal(1);
        });

        it('should generate unique send ids on consecutive messages', async () => {
            const recipient = encodeInteroperableAddress(remoteChainId, acc1.address);

            const sendId0 = await gatewayContract.sendMessage.staticCall(recipient, payload, []);
            await gatewayContract.sendMessage(recipient, payload, []);
            const sendId1 = await gatewayContract.sendMessage.staticCall(recipient, payload, []);

            expect(sendId0).to.not.be.equal(sendId1);
            expect(sendId0).to.not.be.equal(ethers.ZeroHash);
        });

        it('should forward native value through the bridge', async () => {
            const recipient = encodeInteroperableAddress(remoteChainId, acc1.address);
            const amount = ethers.parseEther('1');

            await expect(gatewayContract.sendMessage(recipient, payload, [], { value: amount })).to.emit(
                gatewayContract,
                'MessageSent',
            );

            // Value is escrowed in the bridge, not in the gateway
            expect(await ethers.provider.getBalance(bridgeContract.target)).to.be.equal(amount);
            expect(await ethers.provider.getBalance(gatewayContract.target)).to.be.equal(0);
        });

        it('should handle the forceUpdateGlobalExitRoot attribute', async () => {
            const recipient = encodeInteroperableAddress(remoteChainId, acc1.address);

            // forceUpdateGlobalExitRoot = false does not update the mainnet exit root
            await gatewayContract.sendMessage(recipient, payload, [encodeForceUpdateGERAttribute(false)]);
            expect(await globalExitRootContract.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);

            // forceUpdateGlobalExitRoot = true updates the mainnet exit root
            await gatewayContract.sendMessage(recipient, payload, [encodeForceUpdateGERAttribute(true)]);
            expect(await globalExitRootContract.lastMainnetExitRoot()).to.not.be.equal(ethers.ZeroHash);
        });

        it('should revert on unsupported attributes', async () => {
            const recipient = encodeInteroperableAddress(remoteChainId, acc1.address);

            // Unknown selector
            const unknownAttribute = ethers.concat([
                '0x12345678',
                ethers.AbiCoder.defaultAbiCoder().encode(['bool'], [true]),
            ]);
            await expect(gatewayContract.sendMessage(recipient, payload, [unknownAttribute]))
                .to.be.revertedWithCustomError(gatewayContract, 'UnsupportedAttribute')
                .withArgs('0x12345678');

            // Known selector but invalid length
            await expect(
                gatewayContract.sendMessage(recipient, payload, [FORCE_UPDATE_GER_SELECTOR]),
            ).to.be.revertedWithCustomError(gatewayContract, 'UnsupportedAttribute');

            // Attribute shorter than 4 bytes
            await expect(gatewayContract.sendMessage(recipient, payload, ['0x12'])).to.be.revertedWithCustomError(
                gatewayContract,
                'UnsupportedAttribute',
            );
        });

        it('should revert on unregistered destination chain', async () => {
            const unregisteredChainId = 424242n;
            const recipient = encodeInteroperableAddress(unregisteredChainId, acc1.address);

            await expect(gatewayContract.sendMessage(recipient, payload, []))
                .to.be.revertedWithCustomError(gatewayContract, 'UnregisteredChain')
                .withArgs(unregisteredChainId);
        });

        it('should revert on malformed ERC-7930 recipients', async () => {
            const validRecipient = encodeInteroperableAddress(remoteChainId, acc1.address);

            // Too short
            await expect(gatewayContract.sendMessage('0x0001', payload, [])).to.be.revertedWithCustomError(
                gatewayContract,
                'InvalidEvmV1InteroperableAddress',
            );

            // Wrong version (0x0002)
            const wrongVersion = ethers.concat(['0x0002', ethers.dataSlice(validRecipient, 2)]);
            await expect(gatewayContract.sendMessage(wrongVersion, payload, [])).to.be.revertedWithCustomError(
                gatewayContract,
                'InvalidEvmV1InteroperableAddress',
            );

            // Wrong chain type (0x0002 = solana)
            const wrongChainType = ethers.concat(['0x0001', '0x0002', ethers.dataSlice(validRecipient, 4)]);
            await expect(gatewayContract.sendMessage(wrongChainType, payload, [])).to.be.revertedWithCustomError(
                gatewayContract,
                'InvalidEvmV1InteroperableAddress',
            );

            // Non-minimal chain reference encoding (leading zero byte)
            const nonMinimal = ethers.concat([
                '0x0001',
                '0x0000',
                '0x03',
                '0x00044d', // 1101 encoded with a leading zero
                '0x14',
                acc1.address,
            ]);
            await expect(gatewayContract.sendMessage(nonMinimal, payload, [])).to.be.revertedWithCustomError(
                gatewayContract,
                'InvalidEvmV1InteroperableAddress',
            );

            // Chain reference longer than 32 bytes
            const chainRefTooLong = ethers.concat([
                '0x0001',
                '0x0000',
                '0x21',
                `0x01${'00'.repeat(32)}`,
                '0x14',
                acc1.address,
            ]);
            await expect(gatewayContract.sendMessage(chainRefTooLong, payload, [])).to.be.revertedWithCustomError(
                gatewayContract,
                'InvalidEvmV1InteroperableAddress',
            );

            // Wrong address length (19 bytes)
            const wrongAddressLength = ethers.concat([
                '0x0001',
                '0x0000',
                '0x02',
                '0x044d',
                '0x13',
                ethers.dataSlice(acc1.address, 0, 19),
            ]);
            await expect(gatewayContract.sendMessage(wrongAddressLength, payload, [])).to.be.revertedWithCustomError(
                gatewayContract,
                'InvalidEvmV1InteroperableAddress',
            );

            // Trailing bytes after the address
            const trailingBytes = ethers.concat([validRecipient, '0xff']);
            await expect(gatewayContract.sendMessage(trailingBytes, payload, [])).to.be.revertedWithCustomError(
                gatewayContract,
                'InvalidEvmV1InteroperableAddress',
            );

            // Chain identifier only (zero-length address is not a valid recipient)
            const chainIdentifier = ethers.concat(['0x0001', '0x0000', '0x02', '0x044d', '0x00']);
            await expect(gatewayContract.sendMessage(chainIdentifier, payload, [])).to.be.revertedWithCustomError(
                gatewayContract,
                'InvalidEvmV1InteroperableAddress',
            );
        });

        it('should revert when destination is the local network', async () => {
            // Register the local chain id pointing to the local network id
            await gatewayContract.registerRemoteNetwork(localChainId, networkIDMainnet, remoteGateway.address);
            const recipient = encodeInteroperableAddress(localChainId, acc1.address);

            await expect(gatewayContract.sendMessage(recipient, payload, [])).to.be.revertedWithCustomError(
                bridgeContract,
                'DestinationNetworkInvalid',
            );
        });
    });

    describe('onMessageReceived', () => {
        const sendId = ethers.keccak256(ethers.toUtf8Bytes('test-send-id'));
        let remoteSender: string;
        let metadata: string;

        beforeEach('Register origin network', async () => {
            await gatewayContract.registerRemoteNetwork(remoteChainId, networkIDRollup, remoteGateway.address);

            remoteSender = acc1.address;
            metadata = ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'address', 'address', 'bytes'],
                [sendId, remoteSender, recipientContract.target, payload],
            );
        });

        it('should revert when not called by the bridge', async () => {
            await expect(
                gatewayContract.onMessageReceived(remoteGateway.address, networkIDRollup, metadata),
            ).to.be.revertedWithCustomError(gatewayContract, 'OnlyBridge');
        });

        describe('called by the bridge (impersonated)', () => {
            let bridgeSigner: any;

            beforeEach('Impersonate bridge', async () => {
                await ethers.provider.send('hardhat_impersonateAccount', [bridgeContract.target]);
                bridgeSigner = await ethers.getSigner(bridgeContract.target as string);
                await ethers.provider.send('hardhat_setBalance', [
                    bridgeContract.target,
                    ethers.toBeHex(ethers.parseEther('100')),
                ]);
            });

            afterEach('Stop impersonating bridge', async () => {
                await ethers.provider.send('hardhat_stopImpersonatingAccount', [bridgeContract.target]);
            });

            it('should deliver the message to the recipient', async () => {
                const amount = ethers.parseEther('2');
                await gatewayContract
                    .connect(bridgeSigner)
                    .onMessageReceived(remoteGateway.address, networkIDRollup, metadata, { value: amount });

                expect(await recipientContract.lastReceiveId()).to.be.equal(sendId);
                expect(await recipientContract.lastSender()).to.be.equal(
                    encodeInteroperableAddress(remoteChainId, remoteSender),
                );
                expect(await recipientContract.lastPayload()).to.be.equal(payload);
                expect(await recipientContract.lastValue()).to.be.equal(amount);
                expect(await recipientContract.lastCaller()).to.be.equal(gatewayContract.target);
                expect(await recipientContract.receivedCount()).to.be.equal(1);
                expect(await ethers.provider.getBalance(recipientContract.target)).to.be.equal(amount);
            });

            it('should revert on untrusted origin gateway', async () => {
                await expect(
                    gatewayContract.connect(bridgeSigner).onMessageReceived(acc1.address, networkIDRollup, metadata),
                )
                    .to.be.revertedWithCustomError(gatewayContract, 'UntrustedOriginGateway')
                    .withArgs(networkIDRollup, acc1.address);

                // Zero origin address on a network without registered gateway
                const networkIDRollup2 = 2;
                await expect(
                    gatewayContract
                        .connect(bridgeSigner)
                        .onMessageReceived(ethers.ZeroAddress, networkIDRollup2, metadata),
                )
                    .to.be.revertedWithCustomError(gatewayContract, 'UntrustedOriginGateway')
                    .withArgs(networkIDRollup2, ethers.ZeroAddress);
            });

            it('should revert when the recipient returns an invalid selector', async () => {
                await recipientContract.setReturnInvalidSelector(true);

                await expect(
                    gatewayContract
                        .connect(bridgeSigner)
                        .onMessageReceived(remoteGateway.address, networkIDRollup, metadata),
                ).to.be.revertedWithCustomError(gatewayContract, 'InvalidRecipientReturnValue');
            });

            it('should revert when the recipient is not a contract', async () => {
                const badMetadata = ethers.AbiCoder.defaultAbiCoder().encode(
                    ['bytes32', 'address', 'address', 'bytes'],
                    [sendId, remoteSender, acc1.address, payload],
                );

                await expect(
                    gatewayContract
                        .connect(bridgeSigner)
                        .onMessageReceived(remoteGateway.address, networkIDRollup, badMetadata),
                ).to.be.reverted;
            });
        });
    });

    describe('end-to-end claim through the bridge', () => {
        beforeEach('Register origin network', async () => {
            await gatewayContract.registerRemoteNetwork(remoteChainId, networkIDRollup, remoteGateway.address);
        });

        it('should claim a bridged message and deliver it to the ERC-7786 recipient', async () => {
            const originNetwork = networkIDRollup;
            const amount = ethers.parseEther('3');
            const destinationNetwork = networkIDMainnet;
            const remoteSender = acc1.address;

            const sendId = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ['uint256', 'address', 'uint256'],
                    [remoteChainId, remoteGateway.address, 0],
                ),
            );
            const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'address', 'address', 'bytes'],
                [sendId, remoteSender, recipientContract.target, payload],
            );
            const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

            // Compute the rollup local exit tree with the message leaf targeting the gateway
            const height = 32;
            const merkleTreeLocal = new MerkleTreeBridge(height);
            const leafValue = getLeafValue(
                LEAF_TYPE_MESSAGE,
                originNetwork,
                remoteGateway.address, // originAddress: counterpart gateway called bridgeMessage
                destinationNetwork,
                gatewayContract.target, // destinationAddress: this gateway
                amount,
                metadataHash,
            );
            merkleTreeLocal.add(leafValue);
            const rootLocalRollup = merkleTreeLocal.getRoot();

            // Rollup exit tree containing the rollup local root
            const merkleTreeRollup = new MerkleTreeBridge(height);
            merkleTreeRollup.add(rootLocalRollup);
            const rollupRoot = merkleTreeRollup.getRoot();

            // Add the rollup exit root to the global exit root manager
            const mainnetExitRoot = await globalExitRootContract.lastMainnetExitRoot();
            await expect(globalExitRootContract.connect(rollupManager).updateExitRoot(rollupRoot))
                .to.emit(globalExitRootContract, 'UpdateGlobalExitRoot')
                .withArgs(mainnetExitRoot, rollupRoot);
            const rollupExitRootSC = await globalExitRootContract.lastRollupExitRoot();
            expect(rollupExitRootSC).to.be.equal(rollupRoot);

            const index = 0;
            const proofLocal = merkleTreeLocal.getProofTreeByIndex(index);
            const proofRollup = merkleTreeRollup.getProofTreeByIndex(index);
            const globalIndex = computeGlobalIndex(index, index, false);
            expect(verifyMerkleProof(leafValue, proofLocal, index, rootLocalRollup)).to.be.equal(true);

            // Fund the bridge with ether so the claim can forward the amount
            await bridgeContract.bridgeAsset(
                networkIDRollup,
                deployer.address,
                amount,
                ethers.ZeroAddress,
                true,
                '0x',
                { value: amount },
            );

            // Claim the message: bridge -> gateway.onMessageReceived -> recipient.receiveMessage
            await expect(
                bridgeContract.claimMessage(
                    proofLocal,
                    proofRollup,
                    globalIndex,
                    mainnetExitRoot,
                    rollupExitRootSC,
                    originNetwork,
                    remoteGateway.address,
                    destinationNetwork,
                    gatewayContract.target,
                    amount,
                    metadata,
                ),
            )
                .to.emit(bridgeContract, 'ClaimEvent')
                .withArgs(globalIndex, originNetwork, remoteGateway.address, gatewayContract.target, amount);

            // The recipient received the message and the ether
            expect(await recipientContract.lastReceiveId()).to.be.equal(sendId);
            expect(await recipientContract.lastSender()).to.be.equal(
                encodeInteroperableAddress(remoteChainId, remoteSender),
            );
            expect(await recipientContract.lastPayload()).to.be.equal(payload);
            expect(await recipientContract.lastValue()).to.be.equal(amount);
            expect(await recipientContract.lastCaller()).to.be.equal(gatewayContract.target);
            expect(await ethers.provider.getBalance(recipientContract.target)).to.be.equal(amount);
            expect(await ethers.provider.getBalance(gatewayContract.target)).to.be.equal(0);
        });

        it('should fail the claim when the origin gateway is untrusted', async () => {
            const originNetwork = networkIDRollup;
            const amount = 0n;
            const destinationNetwork = networkIDMainnet;
            const untrustedOrigin = acc1.address;

            const sendId = ethers.ZeroHash;
            const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'address', 'address', 'bytes'],
                [sendId, acc1.address, recipientContract.target, payload],
            );
            const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

            const height = 32;
            const merkleTreeLocal = new MerkleTreeBridge(height);
            const leafValue = getLeafValue(
                LEAF_TYPE_MESSAGE,
                originNetwork,
                untrustedOrigin, // originAddress is NOT the registered counterpart gateway
                destinationNetwork,
                gatewayContract.target,
                amount,
                metadataHash,
            );
            merkleTreeLocal.add(leafValue);
            const rootLocalRollup = merkleTreeLocal.getRoot();

            const merkleTreeRollup = new MerkleTreeBridge(height);
            merkleTreeRollup.add(rootLocalRollup);
            const rollupRoot = merkleTreeRollup.getRoot();

            const mainnetExitRoot = await globalExitRootContract.lastMainnetExitRoot();
            await globalExitRootContract.connect(rollupManager).updateExitRoot(rollupRoot);
            const rollupExitRootSC = await globalExitRootContract.lastRollupExitRoot();

            const index = 0;
            const proofLocal = merkleTreeLocal.getProofTreeByIndex(index);
            const proofRollup = merkleTreeRollup.getProofTreeByIndex(index);
            const globalIndex = computeGlobalIndex(index, index, false);

            // The gateway rejects the message, so the whole claim reverts
            await expect(
                bridgeContract.claimMessage(
                    proofLocal,
                    proofRollup,
                    globalIndex,
                    mainnetExitRoot,
                    rollupExitRootSC,
                    originNetwork,
                    untrustedOrigin,
                    destinationNetwork,
                    gatewayContract.target,
                    amount,
                    metadata,
                ),
            ).to.be.revertedWithCustomError(bridgeContract, 'MessageFailed');
        });
    });
});

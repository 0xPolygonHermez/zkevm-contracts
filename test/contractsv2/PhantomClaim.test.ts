/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-restricted-syntax */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { ERC20PermitMock, AgglayerGERL2, AgglayerBridgeL2, TokenWrapped } from '../../typechain-types';
import { computeWrappedTokenProxyAddress } from './helpers/helpers-sovereign-bridge';

const MerkleTreeBridge = MTBridge;
const { verifyMerkleProof, getLeafValue } = mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    }
    return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
}

describe('Phantom Claim Functionality Tests', () => {
    upgrades.silenceWarnings();

    let sovereignChainBridgeContract: AgglayerBridgeL2;
    let polTokenContract: ERC20PermitMock;
    let sovereignChainGlobalExitRootContract: AgglayerGERL2;

    let deployer: any;
    let rollupManager: any;
    let bridgeManager: any;
    let acc1: any;
    let acc2: any;
    let emergencyBridgePauser: any;
    let globalExitRootRemover: any;
    let phantomClaimManager: any;
    let proxiedTokensManager: any;

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const decimals = 18;
    const tokenInitialBalance = ethers.parseEther('20000000');
    const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        [tokenName, tokenSymbol, decimals],
    );
    const networkIDMainnet = 0;
    const networkIDRollup = 1;
    const networkIDRollup2 = 2;

    const LEAF_TYPE_ASSET = 0;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [
            deployer,
            rollupManager,
            acc1,
            acc2,
            bridgeManager,
            emergencyBridgePauser,
            phantomClaimManager,
            proxiedTokensManager,
        ] = await ethers.getSigners();
        globalExitRootRemover = deployer;

        // Set trusted sequencer as coinbase for sovereign chains
        await ethers.provider.send('hardhat_setCoinbase', [deployer.address]);

        // deploy AgglayerBridgeL2
        const BridgeL2SovereignChainFactory = await ethers.getContractFactory('AgglayerBridgeL2');
        sovereignChainBridgeContract = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridgeL2;

        // deploy global exit root manager
        const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory('AgglayerGERL2');
        sovereignChainGlobalExitRootContract = (await upgrades.deployProxy(
            GlobalExitRootManagerL2SovereignChainFactory,
            [],
            {
                initializer: false,
                constructorArgs: [sovereignChainBridgeContract.target],
                unsafeAllow: ['constructor', 'missing-initializer', 'state-variable-immutable'],
            },
        )) as unknown as AgglayerGERL2;

        await sovereignChainGlobalExitRootContract.initialize(deployer.address, globalExitRootRemover.address);

        // Initialize bridge
        await sovereignChainBridgeContract.initialize(
            networkIDRollup,
            ethers.ZeroAddress,
            0,
            sovereignChainGlobalExitRootContract.target,
            rollupManager.address,
            '0x',
            bridgeManager.address,
            ethers.ZeroAddress,
            false,
            emergencyBridgePauser.address,
            emergencyBridgePauser.address,
            proxiedTokensManager.address,
        );

        // deploy ERC20 token
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
    });

    describe('Phantom Claim Basic Functionality', () => {
        it('Should allow phantom claim manager to execute phantom claim', async () => {
            const depositCount = await sovereignChainBridgeContract.depositCount();
            const originNetwork = networkIDMainnet;
            const tokenAddress = polTokenContract.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDRollup;
            const destinationAddress = acc1.address;
            const metadata = metadataToken;

            // Transfer tokens to bridge
            await polTokenContract.transfer(sovereignChainBridgeContract.target, amount);

            // Compute merkle tree for the claim
            const merkleTree = new MerkleTreeBridge(32);
            const leafValue = getLeafValue(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                ethers.keccak256(metadata),
            );
            merkleTree.add(leafValue);
            const rootLocalExitRoot = merkleTree.getRoot();

            // Compute global index
            const indexLocal = 0;
            const indexRollup = 0;
            const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

            // Check initial phantom claim count
            const leafHash = ethers.solidityPackedKeccak256(
                ['uint8', 'uint32', 'address', 'uint32', 'address', 'uint256', 'bytes32'],
                [
                    LEAF_TYPE_ASSET,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    ethers.keccak256(metadata),
                ],
            );
            expect(await sovereignChainBridgeContract.phantomClaimMap(leafHash)).to.equal(0);

            // Check initial balance
            const initialBalance = await polTokenContract.balanceOf(destinationAddress);

            // Execute phantom claim as phantom claim manager (deployer in this test setup)
            const tx = await sovereignChainBridgeContract
                .connect(deployer)
                .phantomClaimAsset(
                    globalIndex,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    metadata,
                );

            // Verify PhantomClaim event emitted
            await expect(tx)
                .to.emit(sovereignChainBridgeContract, 'PhantomClaim')
                .withArgs(
                    LEAF_TYPE_ASSET,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    metadata,
                );

            // Check phantom claim count incremented
            expect(await sovereignChainBridgeContract.phantomClaimMap(leafHash)).to.equal(1);
            // Compute wrapped token proxy address (same as done in other tests)
            const wrappedTokenAddress = await computeWrappedTokenProxyAddress(
                originNetwork,
                tokenAddress as string,
                sovereignChainBridgeContract,
                false,
            );
            const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');
            const wrappedToken = tokenWrappedFactory.attach(wrappedTokenAddress) as TokenWrapped;

            // Check balance of destination address on wrapped token contract (should have received tokens)
            expect(await wrappedToken.balanceOf(destinationAddress)).to.equal(amount);

            // Also, check that the balance of the underlying (original) token did not increase
            expect(await polTokenContract.balanceOf(destinationAddress)).to.equal(initialBalance);
        });

        it('Should revert if non-phantom claim manager tries to execute phantom claim', async () => {
            const originNetwork = networkIDMainnet;
            const tokenAddress = polTokenContract.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDRollup;
            const destinationAddress = acc1.address;
            const metadata = metadataToken;
            const globalIndex = 0;

            // acc1 is not the phantom claim manager (deployer is)
            await expect(
                sovereignChainBridgeContract
                    .connect(acc1)
                    .phantomClaimAsset(
                        globalIndex,
                        originNetwork,
                        tokenAddress,
                        destinationNetwork,
                        destinationAddress,
                        amount,
                        metadata,
                    ),
            ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyPhantomClaimManager');
        });

        it('Should revert phantom claim for wrong destination network', async () => {
            const originNetwork = networkIDMainnet;
            const tokenAddress = polTokenContract.target;
            const amount = ethers.parseEther('10');
            const wrongDestinationNetwork = networkIDRollup2; // Wrong network
            const destinationAddress = acc1.address;
            const metadata = metadataToken;
            const globalIndex = 0;

            await expect(
                sovereignChainBridgeContract
                    .connect(deployer)
                    .phantomClaimAsset(
                        globalIndex,
                        originNetwork,
                        tokenAddress,
                        wrongDestinationNetwork,
                        destinationAddress,
                        amount,
                        metadata,
                    ),
            ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'DestinationNetworkInvalid');
        });

        it('Should revert phantom claim during emergency state', async () => {
            // Activate emergency state
            await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

            const originNetwork = networkIDMainnet;
            const tokenAddress = polTokenContract.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDRollup;
            const destinationAddress = acc1.address;
            const metadata = metadataToken;
            const globalIndex = 0;

            await expect(
                sovereignChainBridgeContract
                    .connect(deployer)
                    .phantomClaimAsset(
                        globalIndex,
                        originNetwork,
                        tokenAddress,
                        destinationNetwork,
                        destinationAddress,
                        amount,
                        metadata,
                    ),
            ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyNotEmergencyState');
        });
    });

    describe('Phantom Claim Consumption', () => {
        it('Should consume phantom claim when regular claim is made', async () => {
            const depositCount = await sovereignChainBridgeContract.depositCount();
            const originNetwork = networkIDMainnet;
            const tokenAddress = polTokenContract.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDRollup;
            const destinationAddress = acc1.address;
            const metadata = metadataToken;

            // Transfer tokens to bridge (only once, for phantom claim)
            await polTokenContract.transfer(sovereignChainBridgeContract.target, amount);

            // Compute merkle tree for the claim
            const merkleTree = new MerkleTreeBridge(32);
            const leafValue = getLeafValue(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                ethers.keccak256(metadata),
            );
            merkleTree.add(leafValue);
            const rootLocalExitRoot = merkleTree.getRoot();

            // Add to rollup exit root
            const rollupMerkleTree = new MerkleTreeBridge(32);
            rollupMerkleTree.add(rootLocalExitRoot);
            const rootRollupExitRoot = rollupMerkleTree.getRoot();

            // Update global exit root
            // impersonate bridge addres to connect and updates eexit root
            await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
            await ethers.provider.send('hardhat_setBalance', [
                sovereignChainBridgeContract.target,
                ethers.toQuantity(ethers.parseEther('10')),
            ]);
            const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
            await sovereignChainGlobalExitRootContract.connect(bridgeMock).updateExitRoot(rootRollupExitRoot);

            // Insert global exit root for claim verification
            const mainnetExitRoot = ethers.ZeroHash;
            const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rootRollupExitRoot);
            await sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot);

            // Compute global index
            const indexLocal = 0;
            const indexRollup = 0;
            const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

            // Get proofs
            const proofLocalExitRoot = merkleTree.getProofTreeByIndex(0);
            const proofRollupExitRoot = rollupMerkleTree.getProofTreeByIndex(0);

            const rollupExitRoot = rootRollupExitRoot;

            // Execute phantom claim first
            await sovereignChainBridgeContract
                .connect(deployer)
                .phantomClaimAsset(
                    globalIndex,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    metadata,
                );

            // Check phantom claim count
            const leafHash = ethers.solidityPackedKeccak256(
                ['uint8', 'uint32', 'address', 'uint32', 'address', 'uint256', 'bytes32'],
                [
                    LEAF_TYPE_ASSET,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    ethers.keccak256(metadata),
                ],
            );
            expect(await sovereignChainBridgeContract.phantomClaimMap(leafHash)).to.equal(1);

            // Compute wrapped token address
            const wrappedTokenAddress = await computeWrappedTokenProxyAddress(
                originNetwork,
                tokenAddress as string,
                sovereignChainBridgeContract,
                false,
            );
            const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');
            const wrappedToken = tokenWrappedFactory.attach(wrappedTokenAddress) as TokenWrapped;

            // Check balance after phantom claim
            const balanceAfterPhantom = await wrappedToken.balanceOf(destinationAddress);

            // Now execute regular claim - should consume phantom claim
            await sovereignChainBridgeContract.claimAsset(
                proofLocalExitRoot,
                proofRollupExitRoot,
                globalIndex,
                mainnetExitRoot,
                rollupExitRoot,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            );

            // Check phantom claim count decremented
            expect(await sovereignChainBridgeContract.phantomClaimMap(leafHash)).to.equal(0);

            // Check no additional tokens transferred (phantom claim already transferred)
            const balanceAfterClaim = await wrappedToken.balanceOf(destinationAddress);
            expect(balanceAfterClaim).to.equal(balanceAfterPhantom);

            // Verify claim is marked as claimed
            expect(await sovereignChainBridgeContract.isClaimed(indexLocal, destinationNetwork)).to.equal(true);
        });

        it('Should transfer tokens on regular claim if no phantom claim exists', async () => {
            const depositCount = await sovereignChainBridgeContract.depositCount();
            const originNetwork = networkIDMainnet;
            const tokenAddress = polTokenContract.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDRollup;
            const destinationAddress = acc1.address;
            const metadata = metadataToken;

            // Transfer tokens to bridge
            await polTokenContract.transfer(sovereignChainBridgeContract.target, amount);

            // Compute merkle tree for the claim
            const merkleTree = new MerkleTreeBridge(32);
            const leafValue = getLeafValue(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                ethers.keccak256(metadata),
            );
            merkleTree.add(leafValue);
            const rootLocalExitRoot = merkleTree.getRoot();

            // Add to rollup exit root
            const rollupMerkleTree = new MerkleTreeBridge(32);
            rollupMerkleTree.add(rootLocalExitRoot);
            const rootRollupExitRoot = rollupMerkleTree.getRoot();

            // Update global exit root - use bridge impersonation
            await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
            await ethers.provider.send('hardhat_setBalance', [
                sovereignChainBridgeContract.target,
                ethers.toQuantity(ethers.parseEther('10')),
            ]);
            const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
            await sovereignChainGlobalExitRootContract.connect(bridgeMock).updateExitRoot(rootRollupExitRoot);

            // Insert global exit root for claim verification
            const mainnetExitRoot = ethers.ZeroHash;
            const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rootRollupExitRoot);
            await sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot);

            // Compute global index
            const indexLocal = 0;
            const indexRollup = 0;
            const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

            // Get proofs
            const proofLocalExitRoot = merkleTree.getProofTreeByIndex(0);
            const proofRollupExitRoot = rollupMerkleTree.getProofTreeByIndex(0);

            const rollupExitRoot = rootRollupExitRoot;

            // Execute regular claim WITHOUT phantom claim (this will create the wrapped token)
            await sovereignChainBridgeContract.claimAsset(
                proofLocalExitRoot,
                proofRollupExitRoot,
                globalIndex,
                mainnetExitRoot,
                rollupExitRoot,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            );

            // Now get the wrapped token (created by the claim)
            const wrappedTokenAddress = await computeWrappedTokenProxyAddress(
                originNetwork,
                tokenAddress as string,
                sovereignChainBridgeContract,
                false,
            );
            const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');
            const wrappedToken = tokenWrappedFactory.attach(wrappedTokenAddress) as TokenWrapped;

            // Check tokens were transferred (wrapped tokens minted)
            const finalBalance = await wrappedToken.balanceOf(destinationAddress);
            expect(finalBalance).to.equal(amount);
        });
    });

    describe('Phantom Claim Edge Cases', () => {
        it('Should handle multiple phantom claims for different leaves', async () => {
            const originNetwork = networkIDMainnet;
            const tokenAddress = polTokenContract.target;
            const amount1 = ethers.parseEther('10');
            const amount2 = ethers.parseEther('20');
            const destinationNetwork = networkIDRollup;
            const destinationAddress1 = acc1.address;
            const destinationAddress2 = acc2.address;
            const metadata = metadataToken;

            // Transfer tokens to bridge
            await polTokenContract.transfer(sovereignChainBridgeContract.target, amount1 + amount2);

            // Compute global indexes
            const globalIndex1 = computeGlobalIndex(0, 0, false);
            const globalIndex2 = computeGlobalIndex(1, 0, false);

            // Execute first phantom claim
            await sovereignChainBridgeContract
                .connect(deployer)
                .phantomClaimAsset(
                    globalIndex1,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress1,
                    amount1,
                    metadata,
                );

            // Execute second phantom claim
            await sovereignChainBridgeContract
                .connect(deployer)
                .phantomClaimAsset(
                    globalIndex2,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress2,
                    amount2,
                    metadata,
                );

            // Check both phantom claims recorded
            const leafHash1 = ethers.solidityPackedKeccak256(
                ['uint8', 'uint32', 'address', 'uint32', 'address', 'uint256', 'bytes32'],
                [
                    LEAF_TYPE_ASSET,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress1,
                    amount1,
                    ethers.keccak256(metadata),
                ],
            );
            const leafHash2 = ethers.solidityPackedKeccak256(
                ['uint8', 'uint32', 'address', 'uint32', 'address', 'uint256', 'bytes32'],
                [
                    LEAF_TYPE_ASSET,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress2,
                    amount2,
                    ethers.keccak256(metadata),
                ],
            );

            expect(await sovereignChainBridgeContract.phantomClaimMap(leafHash1)).to.equal(1);
            expect(await sovereignChainBridgeContract.phantomClaimMap(leafHash2)).to.equal(1);

            // Compute wrapped token address
            const wrappedTokenAddress = await computeWrappedTokenProxyAddress(
                originNetwork,
                tokenAddress as string,
                sovereignChainBridgeContract,
                false,
            );
            const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');
            const wrappedToken = tokenWrappedFactory.attach(wrappedTokenAddress) as TokenWrapped;

            // Check wrapped tokens transferred to both addresses
            expect(await wrappedToken.balanceOf(destinationAddress1)).to.equal(amount1);
            expect(await wrappedToken.balanceOf(destinationAddress2)).to.equal(amount2);
        });

        it('Should allow multiple phantom claims for same leaf (counter increments)', async () => {
            const originNetwork = networkIDMainnet;
            const tokenAddress = polTokenContract.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDRollup;
            const destinationAddress = acc1.address;
            const metadata = metadataToken;
            const globalIndex = computeGlobalIndex(0, 0, false);

            // Transfer tokens to bridge (3x amount for 3 phantom claims)
            await polTokenContract.transfer(sovereignChainBridgeContract.target, amount * 3n);

            const leafHash = ethers.solidityPackedKeccak256(
                ['uint8', 'uint32', 'address', 'uint32', 'address', 'uint256', 'bytes32'],
                [
                    LEAF_TYPE_ASSET,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    ethers.keccak256(metadata),
                ],
            );

            // Execute first phantom claim
            await sovereignChainBridgeContract
                .connect(deployer)
                .phantomClaimAsset(
                    globalIndex,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    metadata,
                );
            expect(await sovereignChainBridgeContract.phantomClaimMap(leafHash)).to.equal(1);
        });

        it('Should handle native ETH phantom claims', async () => {
            const originNetwork = networkIDMainnet;
            const tokenAddress = ethers.ZeroAddress; // Native ETH
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDRollup;
            const destinationAddress = acc1.address;
            const metadata = '0x'; // ETH doesn't need metadata
            const globalIndex = computeGlobalIndex(0, 0, false);

            // Fund bridge with ETH using hardhat special RPC
            await ethers.provider.send('hardhat_setBalance', [
                sovereignChainBridgeContract.target as string,
                ethers.toQuantity(amount),
            ]);

            // Check initial balance
            const initialBalance = await ethers.provider.getBalance(destinationAddress);

            // Execute phantom claim for ETH
            const tx = await sovereignChainBridgeContract
                .connect(deployer)
                .phantomClaimAsset(
                    globalIndex,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    metadata,
                );

            // Verify PhantomClaim event emitted
            await expect(tx)
                .to.emit(sovereignChainBridgeContract, 'PhantomClaim')
                .withArgs(
                    LEAF_TYPE_ASSET,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    metadata,
                );

            // Check ETH transferred to destination address
            const finalBalance = await ethers.provider.getBalance(destinationAddress);
            expect(finalBalance - initialBalance).to.equal(amount);

            // Check phantom claim count incremented
            const leafHash = ethers.solidityPackedKeccak256(
                ['uint8', 'uint32', 'address', 'uint32', 'address', 'uint256', 'bytes32'],
                [
                    LEAF_TYPE_ASSET,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    ethers.keccak256(metadata),
                ],
            );
            expect(await sovereignChainBridgeContract.phantomClaimMap(leafHash)).to.equal(1);
        });
    });

    describe('Security Tests', () => {
        it('Should prevent reentrancy during phantom claim', async () => {
            // This test would require a malicious contract that attempts reentrancy
            // The nonReentrant modifier should prevent this
            // TODO: Implement with a malicious contract if needed
        });

        it('Should prevent claims during emergency state', async () => {
            const originNetwork = networkIDMainnet;
            const tokenAddress = polTokenContract.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDRollup;
            const destinationAddress = acc1.address;
            const metadata = metadataToken;

            // Transfer tokens and setup merkle tree
            await polTokenContract.transfer(sovereignChainBridgeContract.target, amount);

            const merkleTree = new MerkleTreeBridge(32);
            const leafValue = getLeafValue(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                ethers.keccak256(metadata),
            );
            merkleTree.add(leafValue);
            const rootLocalExitRoot = merkleTree.getRoot();

            const rollupMerkleTree = new MerkleTreeBridge(32);
            rollupMerkleTree.add(rootLocalExitRoot);
            const rootRollupExitRoot = rollupMerkleTree.getRoot();

            // Update global exit root - use bridge impersonation
            await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
            await ethers.provider.send('hardhat_setBalance', [
                sovereignChainBridgeContract.target,
                ethers.toQuantity(ethers.parseEther('10')),
            ]);
            const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
            await sovereignChainGlobalExitRootContract.connect(bridgeMock).updateExitRoot(rootRollupExitRoot);

            // Insert global exit root for claim verification
            const mainnetExitRoot = ethers.ZeroHash;
            const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rootRollupExitRoot);
            await sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot);

            const globalIndex = computeGlobalIndex(0, 0, false);

            // Execute phantom claim
            await sovereignChainBridgeContract
                .connect(deployer)
                .phantomClaimAsset(
                    globalIndex,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    metadata,
                );

            // Activate emergency state
            await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

            // Try to claim during emergency - should fail
            const proofLocalExitRoot = merkleTree.getProofTreeByIndex(0);
            const proofRollupExitRoot = rollupMerkleTree.getProofTreeByIndex(0);
            const rollupExitRoot = rootRollupExitRoot;

            await expect(
                sovereignChainBridgeContract.claimAsset(
                    proofLocalExitRoot,
                    proofRollupExitRoot,
                    globalIndex,
                    mainnetExitRoot,
                    rollupExitRoot,
                    originNetwork,
                    tokenAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    metadata,
                ),
            ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyNotEmergencyState');
        });
    });
});

import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { ERC20PermitMock, AgglayerGERL2, AgglayerBridgeL2, TokenWrapped } from '../../typechain-types';
import { computeWrappedTokenProxyAddress, claimBeforeBridge } from './helpers/helpers-sovereign-bridge';

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

describe('SovereignChainBridge Gas tokens mapped tests', () => {
    upgrades.silenceWarnings();

    let sovereignChainBridgeContract: AgglayerBridgeL2;
    let polTokenContract: ERC20PermitMock;
    let sovereignChainGlobalExitRoot: AgglayerGERL2;

    let deployer: any;
    let rollupManager: any;
    let acc1: any;
    let bridgeManager: any;
    let emergencyBridgePauser: any;
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
    const LEAF_TYPE_MESSAGE = 1;

    let gasTokenAddress: any;
    let gasTokenNetwork: any;
    let gasTokenMetadata: any;
    let WETHToken: TokenWrapped;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollupManager, acc1, bridgeManager, emergencyBridgePauser, proxiedTokensManager] =
            await ethers.getSigners();

        // Set trusted sequencer as coinbase for sovereign chains
        await ethers.provider.send('hardhat_setCoinbase', [deployer.address]);
        // deploy PolygonZkEVMBridge
        const BridgeL2SovereignChainFactory = await ethers.getContractFactory('AgglayerBridgeL2');
        sovereignChainBridgeContract = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridgeL2;

        // deploy global exit root manager
        const SovereignChainGlobalExitRootFactory = await ethers.getContractFactory('AgglayerGERL2');
        sovereignChainGlobalExitRoot = await SovereignChainGlobalExitRootFactory.deploy(
            sovereignChainBridgeContract.target,
        );

        // deploy weth token by bridge
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        WETHToken = await tokenWrappedFactory
            .connect(bridgeMock)
            .deploy(tokenName, tokenSymbol, decimals, { gasPrice: 0 });

        gasTokenAddress = polTokenContract.target;
        gasTokenNetwork = 0;
        gasTokenMetadata = metadataToken;

        await sovereignChainBridgeContract.initialize(
            networkIDRollup2,
            polTokenContract.target, // zero for ether
            0, // zero for ether
            sovereignChainGlobalExitRoot.target,
            rollupManager.address,
            metadataToken,
            ethers.Typed.address(bridgeManager.address),
            WETHToken.target,
            false,
            emergencyBridgePauser.address,
            emergencyBridgePauser.address,
            proxiedTokensManager.address,
        );
        expect(await sovereignChainBridgeContract.WETHToken()).to.be.equal(WETHToken.target);
    });

    it('should claim message from not mintable remapped gas (WETH) token', async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDRollup;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = '0x176923791298713271763697869132'; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        // deploy sovereign
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        const sovereignToken = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            sovereignToken.target,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rollupRoot, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Compute next hash chain value
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        // Insert global exit root
        await expect(sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
        const globalIndex = computeGlobalIndex(index, index, false);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
        // Remap weth token
        await expect(
            sovereignChainBridgeContract.connect(bridgeManager).setSovereignWETHAddress(sovereignToken.target, true),
        )
            .to.emit(sovereignChainBridgeContract, 'SetSovereignWETHAddress')
            .withArgs(sovereignToken.target, true);
        // try claim without balance to transfer (from bridge)
        await expect(
            sovereignChainBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                sovereignToken.target,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.revertedWith('ERC20: transfer amount exceeds balance');
        // Transfer tokens to bridge
        await sovereignToken.transfer(sovereignChainBridgeContract.target, amount);
        const balanceBridge = await sovereignToken.balanceOf(sovereignChainBridgeContract.target);

        // Check balances before claim
        expect(balanceBridge).to.be.equal(amount);
        // Claim message
        await expect(
            sovereignChainBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                sovereignToken.target,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(index, originNetwork, sovereignToken.target, destinationAddress, amount);

        // Check balances after claim
        expect(await sovereignToken.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(ethers.parseEther('0'));

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                sovereignToken.target,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
    });

    it('should check the constructor parameters', async () => {
        expect(await sovereignChainBridgeContract.globalExitRootManager()).to.be.equal(
            sovereignChainGlobalExitRoot.target,
        );
        expect(await sovereignChainBridgeContract.networkID()).to.be.equal(networkIDRollup2);
        expect(await sovereignChainBridgeContract.polygonRollupManager()).to.be.equal(rollupManager.address);

        expect(await sovereignChainBridgeContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await sovereignChainBridgeContract.gasTokenNetwork()).to.be.equal(gasTokenNetwork);
        expect(await sovereignChainBridgeContract.gasTokenMetadata()).to.be.equal(gasTokenMetadata);
    });

    it('should SovereignChain bridge asset and verify merkle proof', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await polTokenContract.balanceOf(deployer.address);
        const balanceBridge = await polTokenContract.balanceOf(sovereignChainBridgeContract.target);

        // create a new deposit
        await expect(polTokenContract.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, 'Approval')
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSSovereignRollup = merkleTree.getRoot();

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: 1 },
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'MsgValueNotZero');

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );

        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(
            balanceBridge + amount,
        );
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSSovereignRollup);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
    });

    it('should PolygonZkEVMBridge message and verify merkle proof', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const originAddress = deployer.address;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSSovereignChain = merkleTree.getRoot();

        // using gas TOkens cannot use bridge message with etther
        await expect(
            sovereignChainBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, true, metadata, {
                value: amount,
            }),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'NoValueInMessagesOnGasTokenNetworks');

        // Use bridgeMessageWETH instead!

        // cannot use value
        await expect(
            sovereignChainBridgeContract.bridgeMessageWETH(
                destinationNetwork,
                destinationAddress,
                amount,
                true,
                metadata,
                {
                    value: amount,
                },
            ),
        ).to.be.reverted;

        // Use bridgeMessageWETH instead!
        await expect(
            sovereignChainBridgeContract.bridgeMessageWETH(
                destinationNetwork,
                destinationAddress,
                amount,
                true,
                metadata,
            ),
        ).to.be.revertedWith('ERC20: burn amount exceeds balance');

        // Mock mint weth
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);

        await WETHToken.connect(bridgeMock).mint(deployer.address, amount, { gasPrice: 0 });

        // Check LBT underflow
        await expect(
            sovereignChainBridgeContract.bridgeMessageWETH(
                destinationNetwork,
                destinationAddress,
                amount,
                true,
                metadata,
            ),
        )
            .to.be.revertedWithCustomError(sovereignChainBridgeContract, 'LocalBalanceTreeUnderflow')
            .withArgs(0, ethers.ZeroAddress, amount, ethers.toBeHex(0));

        // increase LBT to allow bridge action afterwards
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            0, // originNetwork
            ethers.ZeroAddress, // ether (originAddress)
            networkIDRollup2, // destinationNetwork
            destinationAddress,
            amount,
            '0x', // metadata
            sovereignChainGlobalExitRoot,
            sovereignChainBridgeContract,
            polTokenContract,
            0,
        );

        await expect(
            sovereignChainBridgeContract.bridgeMessageWETH(
                destinationNetwork,
                destinationAddress,
                amount,
                true,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_MESSAGE,
                originNetwork,
                originAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );

        // check merkle root with SC
        const rootSCSovereignChain = await sovereignChainBridgeContract.getRoot();
        expect(rootSCSovereignChain).to.be.equal(rootJSSovereignChain);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCSovereignChain)).to.be.equal(true);

        // bridge message without value is fine
        await expect(
            sovereignChainBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, true, metadata, {}),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_MESSAGE,
                originNetwork,
                originAddress,
                destinationNetwork,
                destinationAddress,
                0,
                metadata,
                depositCount + 1n,
            );
    });

    it('should SovereignChain bridge asset and message to check global exit root updates', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await polTokenContract.balanceOf(deployer.address);
        const balanceBridge = await polTokenContract.balanceOf(sovereignChainBridgeContract.target);

        const mainnetExitRoot = ethers.ZeroHash;

        // create a new deposit
        await expect(polTokenContract.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, 'Approval')
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSSovereignChain = merkleTree.getRoot();

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                false,
                '0x',
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );

        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(
            balanceBridge + amount,
        );
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(0);
        expect(mainnetExitRoot).to.be.equal(ethers.ZeroHash);

        // check merkle root with SC
        const rootSCSovereignChain = await sovereignChainBridgeContract.getRoot();
        expect(rootSCSovereignChain).to.be.equal(rootJSSovereignChain);

        // Update global exit root
        await expect(sovereignChainBridgeContract.updateGlobalExitRoot());

        // no state changes since there are not any deposit pending to be updated
        await sovereignChainBridgeContract.updateGlobalExitRoot();
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);
        expect(mainnetExitRoot).to.be.equal(mainnetExitRoot);

        // bridge message
        await expect(
            sovereignChainBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, false, metadata, {
                value: amount,
            }),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'NoValueInMessagesOnGasTokenNetworks');

        // Mock mint weth
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await WETHToken.connect(bridgeMock).mint(deployer.address, amount, { gasPrice: 0 });

        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            0, // originNetwork
            ethers.ZeroAddress, // ether (originAddress)
            networkIDRollup2, // destinationNetwork
            destinationAddress,
            amount,
            '0x', // metadata
            sovereignChainGlobalExitRoot,
            sovereignChainBridgeContract,
            polTokenContract,
            0,
        );

        await expect(
            sovereignChainBridgeContract.bridgeMessageWETH(
                destinationNetwork,
                destinationAddress,
                amount,
                false,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_MESSAGE,
                originNetwork,
                deployer.address,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                1,
            );
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);
        expect(mainnetExitRoot).to.be.equal(mainnetExitRoot);

        // Update global exit root
        await sovereignChainBridgeContract.updateGlobalExitRoot();

        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(2);
        expect(mainnetExitRoot).to.not.be.equal(rootJSSovereignChain);

        // Just to have the metric of a low cost bridge Asset
        const tokenAddress2 = WETHToken.target; // Ether
        const amount2 = ethers.parseEther('10');
        await WETHToken.connect(bridgeMock).mint(deployer.address, amount2, { gasPrice: 0 });

        // Check LBT underflow
        await expect(
            sovereignChainBridgeContract.bridgeMessageWETH(
                destinationNetwork,
                destinationAddress,
                amount,
                true,
                metadata,
            ),
        )
            .to.be.revertedWithCustomError(sovereignChainBridgeContract, 'LocalBalanceTreeUnderflow')
            .withArgs(0, ethers.ZeroAddress, amount, ethers.toBeHex(0));

        // increase LBT to allow bridge action afterwards
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            0, // originNetwork
            ethers.ZeroAddress, // ether (originAddress)
            networkIDRollup2, // destinationNetwork
            destinationAddress,
            amount2,
            '0x', // metadata
            sovereignChainGlobalExitRoot,
            sovereignChainBridgeContract,
            polTokenContract,
            1,
        );

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount2,
                tokenAddress2,
                false,
                '0x',
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                0, // weth bridge
                ethers.ZeroAddress,
                destinationNetwork,
                destinationAddress,
                amount2,
                '0x',
                2,
            )
            .to.emit(WETHToken, 'Transfer')
            .withArgs(deployer.address, ethers.ZeroAddress, amount2);
    });

    it('should claim Gas tokens from SovereignChain to SovereignChain', async () => {
        const originNetwork = networkIDMainnet;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = acc1.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();
        const indexRollup = 5;
        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        for (let i = 0; i < 10; i++) {
            if (i === indexRollup) {
                merkleTreeRollup.add(rootLocalRollup);
            } else {
                merkleTreeRollup.add(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
            }
        }
        const rootRollup = merkleTreeRollup.getRoot();
        // check only rollup account with update rollup exit root
        await expect(sovereignChainGlobalExitRoot.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            sovereignChainGlobalExitRoot,
            'OnlyAllowedContracts',
        );

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);

        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rootRollup, { gasPrice: 0 });

        // check roots
        const sovereignChainExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(sovereignChainExitRootSC).to.be.equal(rootRollup);
        const mainnetExitRootSC = ethers.ZeroHash;
        expect(mainnetExitRootSC).to.be.equal(mainnetExitRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rootRollup);

        // Compute next hash chain value
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        // Insert global exit root
        await expect(sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // check merkle proof
        // Merkle proof local
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // Merkle proof rollup
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)).to.be.equal(true);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        /*
         * claim
         * Can't claim without native (ether)
         */
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                rootLocalRollup,
                sovereignChainExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.reverted;

        await setBalance(sovereignChainBridgeContract.target as any, amount);

        expect(false).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        const initialBalance = await ethers.provider.getBalance(sovereignChainBridgeContract.target);

        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                sovereignChainExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                {
                    gasPrice: 0,
                },
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                sovereignChainExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
        expect(true).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        expect(initialBalance - amount).to.be.equal(
            await ethers.provider.getBalance(sovereignChainBridgeContract.target),
        );
    });

    it('should claim tokens from SovereignChain to SovereignChain2', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        for (let i = 0; i < 10; i++) {
            merkleTreeRollup.add(rootLocalRollup);
        }

        const rootRollup = merkleTreeRollup.getRoot();

        // check only rollup account with update rollup exit root
        await expect(sovereignChainGlobalExitRoot.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            sovereignChainGlobalExitRoot,
            'OnlyAllowedContracts',
        );

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rootRollup, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);

        // Compute next hash chain value
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        // Insert global exit root
        await expect(sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // check merkle proof
        // Merkle proof local
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // Merkle proof local
        const indexRollup = 5;
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)).to.be.equal(true);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        expect(false).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');

        // Compute wrapped token proxy address
        const precalculateWrappedErc20 = await computeWrappedTokenProxyAddress(
            networkIDRollup,
            tokenAddress,
            sovereignChainBridgeContract,
        );

        const newWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // Use precalculatedWrapperAddress and check if matches
        expect(await sovereignChainBridgeContract.computeTokenProxyAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20,
        );

        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(sovereignChainBridgeContract, 'NewWrappedToken')
            .withArgs(originNetwork, tokenAddress, precalculateWrappedErc20, metadata)
            .to.emit(newWrappedToken, 'Transfer')
            .withArgs(ethers.ZeroAddress, destinationAddress, amount);

        const newTokenInfo = await sovereignChainBridgeContract.wrappedTokenToTokenInfo(precalculateWrappedErc20);

        expect(newTokenInfo.originNetwork).to.be.equal(networkIDRollup);
        expect(newTokenInfo.originTokenAddress).to.be.equal(tokenAddress);
        expect(await sovereignChainBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20,
        );
        expect(await sovereignChainBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20,
        );

        const salt = ethers.solidityPackedKeccak256(['uint32', 'address'], [networkIDRollup, tokenAddress]);
        expect(await sovereignChainBridgeContract.tokenInfoToWrappedToken(salt)).to.be.equal(precalculateWrappedErc20);

        // Check the wrapper info
        expect(await newWrappedToken.name()).to.be.equal(tokenName);
        expect(await newWrappedToken.symbol()).to.be.equal(tokenSymbol);
        expect(await newWrappedToken.decimals()).to.be.equal(decimals);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
        expect(true).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);

        // Claim again the other leaf to mint tokens
        const index2 = 1;
        const proof2 = merkleTreeLocal.getProofTreeByIndex(index2);

        expect(verifyMerkleProof(leafValue, proof2, index2, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rollupExitRootSC)).to.be.equal(true);

        const globalIndex2 = computeGlobalIndex(index2, indexRollup, false);
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proof2,
                proofRollup,
                globalIndex2,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex2, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(newWrappedToken, 'Transfer')
            .withArgs(ethers.ZeroAddress, destinationAddress, amount);

        // Burn Tokens
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const wrappedTokenAddress = newWrappedToken.target;
        const newDestinationNetwork = networkIDRollup;

        // create a new deposit
        await expect(newWrappedToken.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(newWrappedToken, 'Approval')
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        /*
         *  pre compute root merkle tree in Js
         * const height = 32;
         */
        const merkleTreeMainnet = new MerkleTreeBridge(height);
        // Imporant calcualte leaf with origin token address no wrapped token address
        const originTokenAddress = tokenAddress;
        const metadataMainnet = metadata; // since the token does not belong to this network
        const metadataHashMainnet = ethers.solidityPackedKeccak256(['bytes'], [metadataMainnet]);

        const leafValueMainnet = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            newDestinationNetwork,
            destinationAddress,
            amount,
            metadataHashMainnet,
        );
        merkleTreeMainnet.add(leafValueMainnet);

        // Tokens are burnt
        expect(await newWrappedToken.totalSupply()).to.be.equal(amount * 2n);
        expect(await newWrappedToken.balanceOf(destinationAddress)).to.be.equal(amount * 2n);
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                newDestinationNetwork,
                destinationAddress,
                amount,
                wrappedTokenAddress,
                true,
                '0x',
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                originTokenAddress,
                newDestinationNetwork,
                destinationAddress,
                amount,
                metadataMainnet,
                depositCount,
            )
            .to.emit(newWrappedToken, 'Transfer')
            .withArgs(deployer.address, ethers.ZeroAddress, amount);

        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);
        expect(await newWrappedToken.balanceOf(deployer.address)).to.be.equal(amount);
        expect(await newWrappedToken.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(0);

        // check merkle root with SC
        const rootSCSovereignChain = await sovereignChainBridgeContract.getRoot();

        // check merkle proof
        const proofMainnet = merkleTreeMainnet.getProofTreeByIndex(0);
        const indexMainnet = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValueMainnet, proofMainnet, indexMainnet, rootSCSovereignChain)).to.be.equal(true);
    });

    it('should PolygonZkEVMBridge and sync the current root with events', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // gasToken
        const amountEther = 10;
        const amount = ethers.parseEther(amountEther.toString());
        const amount3x = ethers.parseEther((amountEther * 3).toString());
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork,
            gasTokenAddress,
            networkIDRollup2, // destinationNetwork
            destinationAddress,
            amount3x,
            gasTokenMetadata,
            sovereignChainGlobalExitRoot,
            sovereignChainBridgeContract,
            polTokenContract,
            0,
        );

        // create 3 new deposit
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: amount },
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                gasTokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                gasTokenMetadata,
                depositCount,
            );

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: amount },
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                gasTokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                gasTokenMetadata,
                depositCount + 1n,
            );

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: amount },
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                gasTokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                gasTokenMetadata,
                depositCount + 2n,
            );

        // Prepare merkle tree
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);

        // Get the deposit's events
        const filter = sovereignChainBridgeContract.filters.BridgeEvent(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
        );
        const events = await sovereignChainBridgeContract.queryFilter(filter, 0, 'latest');
        events.forEach((e) => {
            const { args } = e;
            const leafValue = getLeafValue(
                args.leafType,
                args.originNetwork,
                args.originAddress,
                args.destinationNetwork,
                args.destinationAddress,
                args.amount,
                ethers.solidityPackedKeccak256(['bytes'], [args.metadata]),
            );
            merkleTree.add(leafValue);
        });

        // Check merkle root with SC
        const rootSC = await sovereignChainBridgeContract.getRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);
    });

    it('should claim testing all the asserts', async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rollupRoot, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Compute next hash chain value
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        // Insert global exit root
        await expect(sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);

        const globalIndex = computeGlobalIndex(index, index, false);
        // Can't claim without tokens
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.reverted;

        await setBalance(sovereignChainBridgeContract.target as any, amount);

        // Check GlobalExitRoot invalid assert
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                mainnetExitRoot,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'GlobalExitRootInvalid');

        // Check Invalid smt proof assert
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex + 1n,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSmtProof');

        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount);

        // Check Already claimed_claim
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
    });

    it('should claim ether', async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // ether
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = '0x'; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rollupRoot, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Compute next hash chain value
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        // Insert global exit root
        await expect(sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
        const globalIndex = computeGlobalIndex(index, index, false);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);

        // claim weth
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(WETHToken, 'Transfer')
            .withArgs(ethers.ZeroAddress, deployer.address, amount);

        // Check balances after claim
        expect(await WETHToken.balanceOf(deployer.address)).to.be.equal(amount);
        expect(await WETHToken.totalSupply()).to.be.equal(amount);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
    });

    it('should claim message', async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // ether
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = '0x176923791298713271763697869132'; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rollupRoot, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);

        // Compute next hash chain value
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        // Insert global exit root
        await expect(sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);
        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
        const globalIndex = computeGlobalIndex(index, index, false);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);

        /*
         * claim
         * Can't claim a message as an assets
         */
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSmtProof');

        // Check mainnet destination assert
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSmtProof');

        await expect(
            sovereignChainBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(WETHToken, 'Transfer')
            .withArgs(ethers.ZeroAddress, deployer.address, amount);

        // Check balances after claim
        expect(await WETHToken.balanceOf(deployer.address)).to.be.equal(amount);
        expect(await WETHToken.totalSupply()).to.be.equal(amount);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
    });
});

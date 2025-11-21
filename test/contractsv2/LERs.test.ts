import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { ERC20PermitMock, AgglayerGERL2, AgglayerBridgeL2 } from '../../typechain-types';
import { deploySovereignBridgeContract } from './helpers/helpers-sovereign-bridge';
import { valueToStorageBytes } from '../../src/utils';

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
function newHashChainValue(prevHashChainValue: any, valueToAdd: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [prevHashChainValue, valueToAdd]);
}

function newClaimedGlobalIndexValue(globalIndex: any, leafValue: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [valueToStorageBytes(globalIndex), leafValue]);
}

describe('LERs', () => {
    upgrades.silenceWarnings();

    let bridge: AgglayerBridgeL2;
    let polTokenContract: ERC20PermitMock;
    let ger: AgglayerGERL2;

    let deployer: any;
    let rollupManager: any;
    let bridgeManager: any;
    let acc1: any;
    let emergencyBridgePauser: any;
    let globalExitRootUpdater: any;
    let globalExitRootRemover: any;
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

    const EMPTY_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const emptyArray = Array(32).fill(EMPTY_BYTES32);

    beforeEach(async () => {
        // load signers
        [deployer, rollupManager, acc1, bridgeManager, emergencyBridgePauser, proxiedTokensManager] =
            await ethers.getSigners();
        globalExitRootUpdater = deployer;
        globalExitRootRemover = deployer;
        // Set trusted sequencer as coinbase for sovereign chains
        await ethers.provider.send('hardhat_setCoinbase', [deployer.address]);

        bridge = (await deploySovereignBridgeContract()) as unknown as AgglayerBridgeL2;

        // deploy global exit root manager
        const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory('AgglayerGERL2');
        ger = (await upgrades.deployProxy(GlobalExitRootManagerL2SovereignChainFactory, [], {
            initializer: false,
            constructorArgs: [bridge.target], // Constructor arguments
            unsafeAllow: ['constructor', 'missing-initializer', 'state-variable-immutable'],
        })) as unknown as AgglayerGERL2;

        await expect(ger.initialize(ethers.ZeroAddress, globalExitRootRemover.address)).to.be.revertedWithCustomError(
            ger,
            'InvalidZeroAddress',
        );

        await expect(ger.initialize(globalExitRootUpdater.address, globalExitRootRemover.address));

        // cannot initialize bridgeV2 initializer from Sovereign bridge
        await expect(
            bridge['initialize(uint32,address,uint32,address,address,bytes)'](
                networkIDMainnet,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                ger.target,
                rollupManager.address,
                '0x',
            ),
        ).to.revertedWithCustomError(bridge, 'InvalidInitializeFunction');

        // cannot initialize from a non-deployer account (frontrunning protection)
        await expect(
            bridge.connect(acc1).initialize(
                networkIDRollup2,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                ger.target,
                rollupManager.address,
                '0x',
                ethers.Typed.address(bridgeManager),
                ethers.ZeroAddress,
                false,
                emergencyBridgePauser.address,
                emergencyBridgePauser.address,
                proxiedTokensManager.address,
            ),
        ).to.be.revertedWithCustomError(bridge, 'OnlyDeployer');

        await bridge.initialize(
            networkIDRollup,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            ger.target,
            rollupManager.address,
            '0x',
            ethers.Typed.address(bridgeManager),
            ethers.ZeroAddress,
            false,
            emergencyBridgePauser.address,
            emergencyBridgePauser.address,
            proxiedTokensManager.address,
        );

        // deploy token
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        expect(await bridge.version()).to.be.equal('v1.3.0');
        expect(await ger.version()).to.be.equal('v1.1.0');
    });

    it('Insert LER and claim asset from LER', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

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

        // check merkle proof
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        const indexRollup = originNetwork - 1;
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        // update chain hash
        let claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex, leafValue),
        );

        /*
         * Can't claim incorrect LER
         */
        await expect(
            bridge.claimAssetFromLER(
                proofLocal,
                Number(globalIndex),
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'LocalExitRootInvalid');

        // check no exist LER
        const exitRootLocalRollupFalse = await ger.existLER(rootLocalRollup, originNetwork);
        expect(exitRootLocalRollupFalse).to.be.equal(false);

        await ger.connect(globalExitRootUpdater).insertLERs([rootLocalRollup], [originNetwork]);

        // check LER
        const exitRootLocalRollup = await ger.existLER(rootLocalRollup, originNetwork);
        expect(exitRootLocalRollup).to.be.equal(true);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);

        /*
         * Can't claim an asset as a message
         */
        await expect(
            bridge.claimMessageFromLER(
                proofLocal,
                Number(globalIndex),
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'InvalidSmtProof');

        /*
         * claim
         * Can't claim without tokens
         */
        await expect(
            bridge.claimAssetFromLER(
                proofLocal,
                Number(globalIndex),
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');

        // transfer tokens, then claim
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);

        expect(false).to.be.equal(await bridge.isClaimed(indexLocal, indexRollup + 1));

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);

        await expect(
            bridge.claimAssetFromLER(
                proofLocal,
                globalIndex,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex, claimedGlobalIndexHashChainJS)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal,
                emptyArray,
                globalIndex,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            );

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal,
                globalIndex,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);
    });

    it('Function insertAndClaimAssetsFromLER', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

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

        // check merkle proof
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);
        const indexRollup = originNetwork - 1;
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        // update chain hash
        let claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex, leafValue),
        );

        // transfer tokens, then claim
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);

        expect(false).to.be.equal(await bridge.isClaimed(indexLocal, indexRollup + 1));

        const paramsClaims = {
            networkID: originNetwork,
            localExitRoot: rootLocalRollup,
            globalIndexes: [globalIndex],
            smtProofLocalExitRoots: [proofLocal],
            originNetworks: [originNetwork],
            originTokenAddresses: [tokenAddress],
            destinationNetworks: [destinationNetwork],
            destinationAddresses: [destinationAddress],
            amounts: [amount],
            metadatas: [metadata],
        };

        /*
         * Can't claim an asset as a message
         */
        await expect(ger.insertAndClaimMessagesFromLER(paramsClaims)).to.be.revertedWithCustomError(
            bridge,
            'InvalidSmtProof',
        );

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);

        await expect(ger.insertAndClaimAssetsFromLER(paramsClaims))
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex, claimedGlobalIndexHashChainJS)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal,
                emptyArray,
                globalIndex,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            );

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal,
                globalIndex,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);
    });

    it('Function insertAndClaimAssetsFromLER with more claims', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

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
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // check merkle proof
        const indexLocal1 = 0;
        const proofLocal1 = merkleTreeLocal.getProofTreeByIndex(indexLocal1);
        const indexLocal2 = 1;
        const proofLocal2 = merkleTreeLocal.getProofTreeByIndex(indexLocal2);
        const indexLocal3 = 2;
        const proofLocal3 = merkleTreeLocal.getProofTreeByIndex(indexLocal3);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal1, indexLocal1, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue, proofLocal2, indexLocal2, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue, proofLocal3, indexLocal3, rootLocalRollup)).to.be.equal(true);
        const indexRollup = originNetwork - 1;
        const globalIndex1 = computeGlobalIndex(indexLocal1, indexRollup, false);
        const globalIndex2 = computeGlobalIndex(indexLocal2, indexRollup, false);
        const globalIndex3 = computeGlobalIndex(indexLocal3, indexRollup, false);

        // update chain hash
        const claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        const claimedGlobalIndexHashChainJS1 = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex1, leafValue),
        );
        const claimedGlobalIndexHashChainJS2 = newHashChainValue(
            claimedGlobalIndexHashChainJS1,
            newClaimedGlobalIndexValue(globalIndex2, leafValue),
        );
        const claimedGlobalIndexHashChainJS3 = newHashChainValue(
            claimedGlobalIndexHashChainJS2,
            newClaimedGlobalIndexValue(globalIndex3, leafValue),
        );

        // transfer tokens, then claim
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);

        expect(false).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup + 1));

        const paramsClaims = {
            networkID: originNetwork,
            localExitRoot: rootLocalRollup,
            globalIndexes: [globalIndex1, globalIndex2, globalIndex3],
            smtProofLocalExitRoots: [proofLocal1, proofLocal2, proofLocal3],
            originNetworks: [originNetwork, originNetwork, originNetwork],
            originTokenAddresses: [tokenAddress, tokenAddress, tokenAddress],
            destinationNetworks: [destinationNetwork, destinationNetwork, destinationNetwork],
            destinationAddresses: [destinationAddress, destinationAddress, destinationAddress],
            amounts: [amount, amount, amount],
            metadatas: [metadata, metadata, metadata],
        };

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);

        await expect(ger.insertAndClaimAssetsFromLER(paramsClaims))
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex1, claimedGlobalIndexHashChainJS1)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex2, claimedGlobalIndexHashChainJS2)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex3, claimedGlobalIndexHashChainJS3)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex1, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex2, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex3, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal1,
                emptyArray,
                globalIndex1,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal2,
                emptyArray,
                globalIndex2,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal3,
                emptyArray,
                globalIndex3,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            );

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal1,
                globalIndex1,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal2,
                globalIndex2,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal3,
                globalIndex3,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        expect(true).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup + 1));

        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);
    });


    it('Function insertAndClaimAssetsFromLERs with two LERs and multiple claims', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const originNetwork2 = networkIDRollup2;
        const destinationNetwork2 = networkIDRollup;

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
        merkleTreeLocal.add(leafValue);

        const merkleTreeLocal2 = new MerkleTreeBridge(height);
        const leafValue2 = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork2,
            tokenAddress,
            destinationNetwork2,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal2.add(leafValue2);
        merkleTreeLocal2.add(leafValue2);
        merkleTreeLocal2.add(leafValue2);

        const rootLocalRollup = merkleTreeLocal.getRoot();
        const rootLocalRollup2 = merkleTreeLocal2.getRoot();

        // check merkle proof
        const indexLocal1 = 0;
        const proofLocal1 = merkleTreeLocal.getProofTreeByIndex(indexLocal1);
        const proofLocal12 = merkleTreeLocal2.getProofTreeByIndex(indexLocal1);
        const indexLocal2 = 1;
        const proofLocal2 = merkleTreeLocal.getProofTreeByIndex(indexLocal2);
        const proofLocal22 = merkleTreeLocal2.getProofTreeByIndex(indexLocal2);
        const indexLocal3 = 2;
        const proofLocal3 = merkleTreeLocal.getProofTreeByIndex(indexLocal3);
        const proofLocal32 = merkleTreeLocal2.getProofTreeByIndex(indexLocal3);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal1, indexLocal1, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue, proofLocal2, indexLocal2, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue, proofLocal3, indexLocal3, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue2, proofLocal12, indexLocal1, rootLocalRollup2)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue2, proofLocal22, indexLocal2, rootLocalRollup2)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue2, proofLocal32, indexLocal3, rootLocalRollup2)).to.be.equal(true);

        const indexRollup = originNetwork - 1;
        const globalIndex1 = computeGlobalIndex(indexLocal1, indexRollup, false);
        const globalIndex2 = computeGlobalIndex(indexLocal2, indexRollup, false);
        const globalIndex3 = computeGlobalIndex(indexLocal3, indexRollup, false);
        const indexRollup2 = originNetwork2 - 1;
        const globalIndex12 = computeGlobalIndex(indexLocal1, indexRollup2, false);
        const globalIndex22 = computeGlobalIndex(indexLocal2, indexRollup2, false);
        const globalIndex32 = computeGlobalIndex(indexLocal3, indexRollup2, false);

        // update chain hash
        const claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        const claimedGlobalIndexHashChainJS1 = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex1, leafValue),
        );
        const claimedGlobalIndexHashChainJS2 = newHashChainValue(
            claimedGlobalIndexHashChainJS1,
            newClaimedGlobalIndexValue(globalIndex2, leafValue),
        );
        const claimedGlobalIndexHashChainJS3 = newHashChainValue(
            claimedGlobalIndexHashChainJS2,
            newClaimedGlobalIndexValue(globalIndex3, leafValue),
        );
        const claimedGlobalIndexHashChainJS12 = newHashChainValue(
            claimedGlobalIndexHashChainJS3,
            newClaimedGlobalIndexValue(globalIndex12, leafValue2),
        );
        const claimedGlobalIndexHashChainJS22 = newHashChainValue(
            claimedGlobalIndexHashChainJS12,
            newClaimedGlobalIndexValue(globalIndex22, leafValue2),
        );
        const claimedGlobalIndexHashChainJS32 = newHashChainValue(
            claimedGlobalIndexHashChainJS22,
            newClaimedGlobalIndexValue(globalIndex32, leafValue2),
        );

        // transfer tokens, then claim
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);

        expect(false).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup2 + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup2 + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup2 + 1));

        const paramsClaims1 = {
            networkID: originNetwork,
            localExitRoot: rootLocalRollup,
            globalIndexes: [globalIndex1, globalIndex2, globalIndex3],
            smtProofLocalExitRoots: [proofLocal1, proofLocal2, proofLocal3],
            originNetworks: [originNetwork, originNetwork, originNetwork],
            originTokenAddresses: [tokenAddress, tokenAddress, tokenAddress],
            destinationNetworks: [destinationNetwork, destinationNetwork, destinationNetwork],
            destinationAddresses: [destinationAddress, destinationAddress, destinationAddress],
            amounts: [amount, amount, amount],
            metadatas: [metadata, metadata, metadata],
        };

        const paramsClaims2 = {
            networkID: originNetwork2,
            localExitRoot: rootLocalRollup2,
            globalIndexes: [globalIndex12, globalIndex22, globalIndex32],
            smtProofLocalExitRoots: [proofLocal12, proofLocal22, proofLocal32],
            originNetworks: [originNetwork2, originNetwork2, originNetwork2],
            originTokenAddresses: [tokenAddress, tokenAddress, tokenAddress],
            destinationNetworks: [destinationNetwork2, destinationNetwork2, destinationNetwork2],
            destinationAddresses: [destinationAddress, destinationAddress, destinationAddress],
            amounts: [amount, amount, amount],
            metadatas: [metadata, metadata, metadata],
        };

        await expect(ger.insertAndClaimMessagesFromLERs([paramsClaims1, paramsClaims2])).to.revertedWithCustomError(
            bridge,
            'InvalidSmtProof',
        );

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);

        await expect(ger.insertAndClaimAssetsFromLERs([paramsClaims1, paramsClaims2]))
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex1, claimedGlobalIndexHashChainJS1)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex2, claimedGlobalIndexHashChainJS2)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex3, claimedGlobalIndexHashChainJS3)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex12, claimedGlobalIndexHashChainJS12)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex22, claimedGlobalIndexHashChainJS22)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex32, claimedGlobalIndexHashChainJS32)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex1, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex2, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex3, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex12, originNetwork2, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex22, originNetwork2, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex32, originNetwork2, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal1,
                emptyArray,
                globalIndex1,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal2,
                emptyArray,
                globalIndex2,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal3,
                emptyArray,
                globalIndex3,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal12,
                emptyArray,
                globalIndex12,
                rootLocalRollup2,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal22,
                emptyArray,
                globalIndex22,
                rootLocalRollup2,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal32,
                emptyArray,
                globalIndex32,
                rootLocalRollup2,
                EMPTY_BYTES32,
                LEAF_TYPE_ASSET,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            );

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal1,
                globalIndex1,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal2,
                globalIndex2,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal3,
                globalIndex3,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal12,
                globalIndex12,
                rootLocalRollup2,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal22,
                globalIndex22,
                rootLocalRollup2,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimAssetFromLER(
                proofLocal32,
                globalIndex32,
                rootLocalRollup2,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        expect(true).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup2 + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup2 + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup2 + 1));

        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);
    });

    it('Insert LER and claim message from LER', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // check merkle proof
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        const indexRollup = originNetwork - 1;
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        // update chain hash
        let claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex, leafValue),
        );

        /*
         * Can't claim incorrect LER
         */
        await expect(
            bridge.claimMessageFromLER(
                proofLocal,
                Number(globalIndex),
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'LocalExitRootInvalid');

        // check no exist LER
        const exitRootLocalRollupFalse = await ger.existLER(rootLocalRollup, originNetwork);
        expect(exitRootLocalRollupFalse).to.be.equal(false);

        await ger.connect(globalExitRootUpdater).insertLERs([rootLocalRollup], [originNetwork]);

        // check LER
        const exitRootLocalRollup = await ger.existLER(rootLocalRollup, originNetwork);
        expect(exitRootLocalRollup).to.be.equal(true);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);

        /*
         * Can't claim an asset as a message
         */
        await expect(
            bridge.claimAssetFromLER(
                proofLocal,
                Number(globalIndex),
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'InvalidSmtProof');

        // Can't claim without ether
        await expect(
            bridge.claimMessageFromLER(
                proofLocal,
                Number(globalIndex),
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'MessageFailed');

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards
        await ethers.provider.send('hardhat_setBalance', [bridge.target, ethers.toBeHex(amount)]);

        expect(false).to.be.equal(await bridge.isClaimed(indexLocal, indexRollup + 1));

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);

        await expect(
            bridge.claimMessageFromLER(
                proofLocal,
                globalIndex,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex, claimedGlobalIndexHashChainJS)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal,
                emptyArray,
                globalIndex,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            );

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal,
                globalIndex,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);
    });

    it('Function insertAndClaimMessagesFromLER', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // check merkle proof
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);
        const indexRollup = originNetwork - 1;
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        // update chain hash
        let claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex, leafValue),
        );

        expect(false).to.be.equal(await bridge.isClaimed(indexLocal, indexRollup + 1));

        const paramsClaims = {
            networkID: originNetwork,
            localExitRoot: rootLocalRollup,
            globalIndexes: [globalIndex],
            smtProofLocalExitRoots: [proofLocal],
            originNetworks: [originNetwork],
            originTokenAddresses: [tokenAddress],
            destinationNetworks: [destinationNetwork],
            destinationAddresses: [destinationAddress],
            amounts: [amount],
            metadatas: [metadata],
        };

        // Can't claim without ether
        await expect(ger.insertAndClaimMessagesFromLER(paramsClaims)).to.be.revertedWithCustomError(
            bridge,
            'MessageFailed',
        );

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards
        await ethers.provider.send('hardhat_setBalance', [bridge.target, ethers.toBeHex(amount)]);

        // Check balances before claim
        expect(await ethers.provider.getBalance(bridge.target)).to.be.equal(amount);

        await expect(ger.insertAndClaimMessagesFromLER(paramsClaims))
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex, claimedGlobalIndexHashChainJS)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal,
                emptyArray,
                globalIndex,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            );

        // Check balances after claim
        expect(await ethers.provider.getBalance(bridge.target)).to.be.equal(ethers.parseEther('0'));
        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal,
                globalIndex,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);
    });

    it('Function insertAndClaimMessagesFromLER with more claims', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);
        merkleTreeLocal.add(leafValue);
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // check merkle proof
        const indexLocal1 = 0;
        const proofLocal1 = merkleTreeLocal.getProofTreeByIndex(indexLocal1);
        const indexLocal2 = 1;
        const proofLocal2 = merkleTreeLocal.getProofTreeByIndex(indexLocal2);
        const indexLocal3 = 2;
        const proofLocal3 = merkleTreeLocal.getProofTreeByIndex(indexLocal3);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal1, indexLocal1, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue, proofLocal2, indexLocal2, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue, proofLocal3, indexLocal3, rootLocalRollup)).to.be.equal(true);
        const indexRollup = originNetwork - 1;
        const globalIndex1 = computeGlobalIndex(indexLocal1, indexRollup, false);
        const globalIndex2 = computeGlobalIndex(indexLocal2, indexRollup, false);
        const globalIndex3 = computeGlobalIndex(indexLocal3, indexRollup, false);

        // update chain hash
        const claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        const claimedGlobalIndexHashChainJS1 = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex1, leafValue),
        );
        const claimedGlobalIndexHashChainJS2 = newHashChainValue(
            claimedGlobalIndexHashChainJS1,
            newClaimedGlobalIndexValue(globalIndex2, leafValue),
        );
        const claimedGlobalIndexHashChainJS3 = newHashChainValue(
            claimedGlobalIndexHashChainJS2,
            newClaimedGlobalIndexValue(globalIndex3, leafValue),
        );

        expect(false).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup + 1));

        const paramsClaims = {
            networkID: originNetwork,
            localExitRoot: rootLocalRollup,
            globalIndexes: [globalIndex1, globalIndex2, globalIndex3],
            smtProofLocalExitRoots: [proofLocal1, proofLocal2, proofLocal3],
            originNetworks: [originNetwork, originNetwork, originNetwork],
            originTokenAddresses: [tokenAddress, tokenAddress, tokenAddress],
            destinationNetworks: [destinationNetwork, destinationNetwork, destinationNetwork],
            destinationAddresses: [destinationAddress, destinationAddress, destinationAddress],
            amounts: [amount, amount, amount],
            metadatas: [metadata, metadata, metadata],
        };

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards
        await ethers.provider.send('hardhat_setBalance', [bridge.target, ethers.toBeHex(amount * 3n)]);

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);

        await expect(ger.insertAndClaimMessagesFromLER(paramsClaims))
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex1, claimedGlobalIndexHashChainJS1)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex2, claimedGlobalIndexHashChainJS2)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex3, claimedGlobalIndexHashChainJS3)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex1, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex2, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex3, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal1,
                emptyArray,
                globalIndex1,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal2,
                emptyArray,
                globalIndex2,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal3,
                emptyArray,
                globalIndex3,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            );

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal1,
                globalIndex1,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal2,
                globalIndex2,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal3,
                globalIndex3,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Check balances after claim
        expect(await ethers.provider.getBalance(bridge.target)).to.be.equal(ethers.parseEther('0'));
        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);

        expect(true).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup + 1));
    });

    it('Function insertAndClaimMessagesFromLERs with two LERs and multiple claims', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const originNetwork2 = networkIDRollup2;
        const destinationNetwork2 = networkIDRollup;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);
        merkleTreeLocal.add(leafValue);
        merkleTreeLocal.add(leafValue);

        const merkleTreeLocal2 = new MerkleTreeBridge(height);
        const leafValue2 = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork2,
            tokenAddress,
            destinationNetwork2,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal2.add(leafValue2);
        merkleTreeLocal2.add(leafValue2);
        merkleTreeLocal2.add(leafValue2);

        const rootLocalRollup = merkleTreeLocal.getRoot();
        const rootLocalRollup2 = merkleTreeLocal2.getRoot();

        // check merkle proof
        const indexLocal1 = 0;
        const proofLocal1 = merkleTreeLocal.getProofTreeByIndex(indexLocal1);
        const proofLocal12 = merkleTreeLocal2.getProofTreeByIndex(indexLocal1);
        const indexLocal2 = 1;
        const proofLocal2 = merkleTreeLocal.getProofTreeByIndex(indexLocal2);
        const proofLocal22 = merkleTreeLocal2.getProofTreeByIndex(indexLocal2);
        const indexLocal3 = 2;
        const proofLocal3 = merkleTreeLocal.getProofTreeByIndex(indexLocal3);
        const proofLocal32 = merkleTreeLocal2.getProofTreeByIndex(indexLocal3);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal1, indexLocal1, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue, proofLocal2, indexLocal2, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue, proofLocal3, indexLocal3, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue2, proofLocal12, indexLocal1, rootLocalRollup2)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue2, proofLocal22, indexLocal2, rootLocalRollup2)).to.be.equal(true);
        expect(verifyMerkleProof(leafValue2, proofLocal32, indexLocal3, rootLocalRollup2)).to.be.equal(true);

        const indexRollup = originNetwork - 1;
        const globalIndex1 = computeGlobalIndex(indexLocal1, indexRollup, false);
        const globalIndex2 = computeGlobalIndex(indexLocal2, indexRollup, false);
        const globalIndex3 = computeGlobalIndex(indexLocal3, indexRollup, false);
        const indexRollup2 = originNetwork2 - 1;
        const globalIndex12 = computeGlobalIndex(indexLocal1, indexRollup2, false);
        const globalIndex22 = computeGlobalIndex(indexLocal2, indexRollup2, false);
        const globalIndex32 = computeGlobalIndex(indexLocal3, indexRollup2, false);

        // update chain hash
        const claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        const claimedGlobalIndexHashChainJS1 = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex1, leafValue),
        );
        const claimedGlobalIndexHashChainJS2 = newHashChainValue(
            claimedGlobalIndexHashChainJS1,
            newClaimedGlobalIndexValue(globalIndex2, leafValue),
        );
        const claimedGlobalIndexHashChainJS3 = newHashChainValue(
            claimedGlobalIndexHashChainJS2,
            newClaimedGlobalIndexValue(globalIndex3, leafValue),
        );
        const claimedGlobalIndexHashChainJS12 = newHashChainValue(
            claimedGlobalIndexHashChainJS3,
            newClaimedGlobalIndexValue(globalIndex12, leafValue2),
        );
        const claimedGlobalIndexHashChainJS22 = newHashChainValue(
            claimedGlobalIndexHashChainJS12,
            newClaimedGlobalIndexValue(globalIndex22, leafValue2),
        );
        const claimedGlobalIndexHashChainJS32 = newHashChainValue(
            claimedGlobalIndexHashChainJS22,
            newClaimedGlobalIndexValue(globalIndex32, leafValue2),
        );

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards
        await ethers.provider.send('hardhat_setBalance', [bridge.target, ethers.toBeHex(amount * 6n)]);

        expect(false).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup2 + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup2 + 1));
        expect(false).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup2 + 1));

        const paramsClaims1 = {
            networkID: originNetwork,
            localExitRoot: rootLocalRollup,
            globalIndexes: [globalIndex1, globalIndex2, globalIndex3],
            smtProofLocalExitRoots: [proofLocal1, proofLocal2, proofLocal3],
            originNetworks: [originNetwork, originNetwork, originNetwork],
            originTokenAddresses: [tokenAddress, tokenAddress, tokenAddress],
            destinationNetworks: [destinationNetwork, destinationNetwork, destinationNetwork],
            destinationAddresses: [destinationAddress, destinationAddress, destinationAddress],
            amounts: [amount, amount, amount],
            metadatas: [metadata, metadata, metadata],
        };

        const paramsClaims2 = {
            networkID: originNetwork2,
            localExitRoot: rootLocalRollup2,
            globalIndexes: [globalIndex12, globalIndex22, globalIndex32],
            smtProofLocalExitRoots: [proofLocal12, proofLocal22, proofLocal32],
            originNetworks: [originNetwork2, originNetwork2, originNetwork2],
            originTokenAddresses: [tokenAddress, tokenAddress, tokenAddress],
            destinationNetworks: [destinationNetwork2, destinationNetwork2, destinationNetwork2],
            destinationAddresses: [destinationAddress, destinationAddress, destinationAddress],
            amounts: [amount, amount, amount],
            metadatas: [metadata, metadata, metadata],
        };

        await expect(ger.insertAndClaimAssetsFromLERs([paramsClaims1, paramsClaims2])).to.revertedWithCustomError(
            bridge,
            'InvalidSmtProof',
        );

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);

        await expect(ger.insertAndClaimMessagesFromLERs([paramsClaims1, paramsClaims2]))
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex1, claimedGlobalIndexHashChainJS1)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex2, claimedGlobalIndexHashChainJS2)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex3, claimedGlobalIndexHashChainJS3)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex12, claimedGlobalIndexHashChainJS12)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex22, claimedGlobalIndexHashChainJS22)
            .to.emit(bridge, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex32, claimedGlobalIndexHashChainJS32)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex1, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex2, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex3, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex12, originNetwork2, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex22, originNetwork2, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex32, originNetwork2, tokenAddress, destinationAddress, amount)
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal1,
                emptyArray,
                globalIndex1,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal2,
                emptyArray,
                globalIndex2,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal3,
                emptyArray,
                globalIndex3,
                rootLocalRollup,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal12,
                emptyArray,
                globalIndex12,
                rootLocalRollup2,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal22,
                emptyArray,
                globalIndex22,
                rootLocalRollup2,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            )
            .to.emit(bridge, 'DetailedClaimEvent')
            .withArgs(
                proofLocal32,
                emptyArray,
                globalIndex32,
                rootLocalRollup2,
                EMPTY_BYTES32,
                LEAF_TYPE_MESSAGE,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            );

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal1,
                globalIndex1,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal2,
                globalIndex2,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal3,
                globalIndex3,
                rootLocalRollup,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal12,
                globalIndex12,
                rootLocalRollup2,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal22,
                globalIndex22,
                rootLocalRollup2,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        // Can't claim because nullifier
        await expect(
            bridge.claimMessageFromLER(
                proofLocal32,
                globalIndex32,
                rootLocalRollup2,
                originNetwork2,
                tokenAddress,
                destinationNetwork2,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(bridge, 'AlreadyClaimed');

        expect(true).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal1, indexRollup2 + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal2, indexRollup2 + 1));
        expect(true).to.be.equal(await bridge.isClaimed(indexLocal3, indexRollup2 + 1));

        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);
    });
});

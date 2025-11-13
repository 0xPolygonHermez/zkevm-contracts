import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { ERC20PermitMock, AgglayerGERL2, AgglayerBridgeL2 } from '../../typechain-types';

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

    beforeEach(async () => {
        // load signers
        [deployer, rollupManager, acc1, bridgeManager, emergencyBridgePauser, proxiedTokensManager] =
            await ethers.getSigners();
        globalExitRootUpdater = deployer;
        globalExitRootRemover = deployer;
        // Set trusted sequencer as coinbase for sovereign chains
        await ethers.provider.send('hardhat_setCoinbase', [deployer.address]);
        // deploy AgglayerBridgeL2
        const BridgeL2SovereignChainFactory = await ethers.getContractFactory('AgglayerBridgeL2');
        bridge = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridgeL2;

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
        expect(await bridge.version()).to.be.equal('v1.2.0');
        expect(await ger.version()).to.be.equal('v1.1.0');
    });

    it('Insert LER and claim', async () => {
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

        await ger.connect(globalExitRootUpdater).insertLERs([rootLocalRollup], [originNetwork]);

        // check roots
        const exitRootLocalRollup = await ger.existLER(rootLocalRollup, originNetwork);
        expect(exitRootLocalRollup).to.be.equal(true);

        // check merkle proof
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);
        const indexRollup = originNetwork - 1;
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

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
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount);

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
    });

    it(' Function insertAndClaimsAssetFromLER', async () => {
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

        // transfer tokens, then claim
        await expect(polTokenContract.transfer(bridge.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, bridge.target, amount);

        expect(false).to.be.equal(await bridge.isClaimed(indexLocal, indexRollup + 1));

        const paramsClaims = {
            networkID: originNetwork,
            globalIndexes: [globalIndex],
            localExitRoot: rootLocalRollup,
            originNetworks: [originNetwork],
            originTokenAddresses: [tokenAddress],
            destinationNetworks: [destinationNetwork],
            destinationAddresses: [destinationAddress],
            amounts: [amount],
            metadatas: [metadata],
        };

        await expect(ger.insertAndClaimsAssetFromLER([proofLocal], paramsClaims))
            .to.emit(bridge, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount);

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
    });
});

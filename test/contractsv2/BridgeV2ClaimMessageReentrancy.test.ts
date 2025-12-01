import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { AgglayerBridge, PolygonZkEVMGlobalExitRoot } from '../../../typechain-types';

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

describe('PolygonZkEVMBridge Contract claimMessage reentrancy', () => {
    upgrades.silenceWarnings();

    let polygonZkEVMBridgeContract: AgglayerBridge;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;

    let deployer: any;
    let rollupManager: any;
    let reentrancyContract: any;

    const networkIDMainnet = 0;
    const networkIDRollup = 1;
    const LEAF_TYPE_MESSAGE = 1;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollupManager] = await ethers.getSigners();

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('AgglayerBridge');
        polygonZkEVMBridgeContract = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
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

        // deploy bridgeReentrancy
        const reentrancyContractFactory = await ethers.getContractFactory('BridgeMessageReceiverMock');
        reentrancyContract = await reentrancyContractFactory.deploy(polygonZkEVMBridgeContract.target);
    });

    it('should check the initialize parameters', async () => {
        expect(await polygonZkEVMBridgeContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.target);
        expect(await polygonZkEVMBridgeContract.networkID()).to.be.equal(networkIDMainnet);
        expect(await polygonZkEVMBridgeContract.polygonRollupManager()).to.be.equal(rollupManager.address);

        // cannot initialzie again
        await expect(
            polygonZkEVMBridgeContract.initialize(
                networkIDMainnet,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                polygonZkEVMGlobalExitRoot.target,
                rollupManager.address,
                '0x',
            ),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should 2 claimMessage from Rollup to Mainnet, with reentrancy', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = ethers.ZeroAddress;
        const amountContract = ethers.parseEther('10');
        const amountDeployer = ethers.parseEther('12');
        const destinationNetwork = networkIDMainnet;
        const deployerAddress = deployer.address;
        // contract with onMessageReceived with .claimMessage
        const reentrancyContractAddress = reentrancyContract.target;

        const metadata = '0x'; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        // add first leaf with destinationAddress == contract
        const indexContract = 0;
        const leafValue2 = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            reentrancyContractAddress,
            amountContract,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue2);
        // add leaf with destinationAddress == deployer
        const indexDeployer = 1;
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            deployerAddress,
            amountDeployer,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        for (let i = 0; i < 10; i++) {
            merkleTreeRollup.add(rootLocalRollup);
        }

        const rootRollup = merkleTreeRollup.getRoot();

        // check only rollup account with update rollup exit root
        await expect(polygonZkEVMGlobalExitRoot.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            polygonZkEVMGlobalExitRoot,
            'OnlyAllowedContracts',
        );

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof

        // Merkle proof local
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexDeployer);
        // Merkle proof local
        const indexRollup = 5;
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // check merkle proof
        const globalIndex = computeGlobalIndex(indexDeployer, indexRollup, false);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexDeployer, rootLocalRollup)).to.be.equal(true);

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards
        await ethers.provider.send('hardhat_setBalance', [
            polygonZkEVMBridgeContract.target,
            ethers.toBeHex(amountDeployer + amountContract),
        ]);

        // Check balances before claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.target)).to.be.equal(
            amountDeployer + amountContract,
        );

        // update reentrancy contract with parameters for claim 2 (destinationAddress == deployer)
        await expect(
            reentrancyContract.updateParameters(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                deployerAddress,
                amountDeployer,
                metadata,
            ),
        ).to.emit(reentrancyContract, 'UpdateParameters');

        const proofLocal2 = merkleTreeLocal.getProofTreeByIndex(indexContract);
        const globalIndex2 = computeGlobalIndex(indexContract, indexRollup, false);

        // claim message with destinationAddress == reentrancyContract
        // ClaimEvent first with destinationAddress == deployer
        // ClaimEvent second with destinationAddress == reentrancyContract
        await expect(
            polygonZkEVMBridgeContract.claimMessage(
                proofLocal2,
                proofRollup,
                globalIndex2,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                reentrancyContractAddress,
                amountContract,
                metadata,
            ),
        )
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, deployerAddress, amountDeployer)
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex2, originNetwork, tokenAddress, reentrancyContractAddress, amountContract);

        expect(true).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexDeployer, indexRollup + 1));
        expect(true).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexContract, indexRollup + 1));

        // Try claim again with the same parameters destinationAddress == deployer
        const proof2 = merkleTreeLocal.getProofTreeByIndex(indexDeployer);

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards
        await ethers.provider.send('hardhat_setBalance', [
            polygonZkEVMBridgeContract.target,
            ethers.toBeHex(amountDeployer),
        ]);

        // Check balances before claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.target)).to.be.equal(amountDeployer);

        // Already claimed deployer address
        await expect(
            polygonZkEVMBridgeContract.claimMessage(
                proof2,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                deployerAddress,
                amountDeployer,
                metadata,
            ),
        ).revertedWithCustomError(polygonZkEVMBridgeContract, 'AlreadyClaimed');
    });

    it('should testClaim function (BridgeMessageReceiverMock)', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = ethers.ZeroAddress;
        const amountClaimContract = ethers.parseEther('10');
        const amountBridge = ethers.parseEther('11');
        const amountClaimDeployer1 = ethers.parseEther('12');
        const amountClaimDeployer2 = ethers.parseEther('13');
        const destinationNetwork = networkIDMainnet;
        const deployerAddress = deployer.address;
        // contract with onMessageReceived with .claimMessage
        const reentrancyContractAddress = reentrancyContract.target;

        const metadata = '0x'; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        // add first leaf with destinationAddress == contract
        const indexContract = 0;
        const leafValue2 = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            reentrancyContractAddress,
            amountClaimContract,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue2);
        // add 2 leafs with destinationAddress == deployer
        const indexDeployer1 = 1;
        const indexDeployer2 = 2;
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            deployerAddress,
            amountClaimDeployer1,
            metadataHash,
        );
        const leafValue1 = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            deployerAddress,
            amountClaimDeployer2,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);
        merkleTreeLocal.add(leafValue1);

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        for (let i = 0; i < 10; i++) {
            merkleTreeRollup.add(rootLocalRollup);
        }

        const rootRollup = merkleTreeRollup.getRoot();

        // check only rollup account with update rollup exit root
        await expect(polygonZkEVMGlobalExitRoot.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            polygonZkEVMGlobalExitRoot,
            'OnlyAllowedContracts',
        );

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(mainnetExitRoot, rootRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof

        // Merkle proof local
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexDeployer1);
        // Merkle proof local
        const indexRollup = 5;
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // check merkle proof
        const globalIndex = computeGlobalIndex(indexDeployer1, indexRollup, false);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexDeployer1, rootLocalRollup)).to.be.equal(true);

        // update reentrancy contract with parameters for claim 2 (destinationAddress == deployer)
        await expect(
            reentrancyContract.updateParameters(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                deployerAddress,
                amountClaimDeployer1,
                metadata,
            ),
        ).to.emit(reentrancyContract, 'UpdateParameters');

        const proofLocal2 = merkleTreeLocal.getProofTreeByIndex(indexContract);
        const globalIndex2 = computeGlobalIndex(indexContract, indexRollup, false);

        // Try claim again with the same parameters destinationAddress == deployer
        const proof2 = merkleTreeLocal.getProofTreeByIndex(indexDeployer1);

        expect(verifyMerkleProof(leafValue, proof2, indexDeployer1, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rollupExitRootSC)).to.be.equal(true);

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards
        await ethers.provider.send('hardhat_setBalance', [
            polygonZkEVMBridgeContract.target,
            ethers.toBeHex(amountClaimContract + amountClaimDeployer1 + amountClaimDeployer2),
        ]);

        // Try claim again with the same parameters destinationAddress == deployer
        const proof3 = merkleTreeLocal.getProofTreeByIndex(indexDeployer2);
        const globalIndex3 = computeGlobalIndex(indexDeployer2, indexRollup, false);

        expect(verifyMerkleProof(leafValue1, proof3, indexDeployer2, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rollupExitRootSC)).to.be.equal(true);

        // claim message with destinationAddress == reentrancyContract
        // ClaimEvent first with destinationAddress == deployer
        // ClaimEvent second with destinationAddress == reentrancyContract
        const claim1 = ethers.AbiCoder.defaultAbiCoder().encode(
            [
                'bytes32[32]',
                'bytes32[32]',
                'uint256',
                'bytes32',
                'bytes32',
                'uint32',
                'address',
                'uint32',
                'address',
                'uint256',
                'bytes',
            ],
            [
                proofLocal2,
                proofRollup,
                globalIndex2,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                reentrancyContractAddress,
                amountClaimContract,
                metadata,
            ],
        );

        const claim2 = ethers.AbiCoder.defaultAbiCoder().encode(
            [
                'bytes32[32]',
                'bytes32[32]',
                'uint256',
                'bytes32',
                'bytes32',
                'uint32',
                'address',
                'uint32',
                'address',
                'uint256',
                'bytes',
            ],
            [
                proof3,
                proofRollup,
                globalIndex3,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                deployerAddress,
                amountClaimDeployer2,
                metadata,
            ],
        );

        const bridgeAsset = ethers.AbiCoder.defaultAbiCoder().encode(
            ['uint32', 'address', 'uint256', 'address', 'bool', 'bytes'],
            [originNetwork, deployerAddress, amountBridge, tokenAddress, true, '0x'],
        );

        await expect(reentrancyContract.testClaim(claim1, bridgeAsset, claim2, { value: amountBridge }))
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, deployerAddress, amountClaimDeployer1)
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex2, originNetwork, tokenAddress, reentrancyContractAddress, amountClaimContract)
            // .revertedWithCustomError(polygonZkEVMBridgeContract, 'DestinationNetworkInvalid')
            .to.emit(polygonZkEVMBridgeContract, 'BridgeEvent')
            .to.emit(polygonZkEVMBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex3, originNetwork, tokenAddress, deployerAddress, amountClaimDeployer2);

        expect(true).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexContract, indexRollup + 1));
        expect(true).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexDeployer1, indexRollup + 1));
        expect(true).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexDeployer2, indexRollup + 1));
    });
});

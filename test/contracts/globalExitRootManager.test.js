const { expect } = require('chai');
const { ethers } = require('hardhat');

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}
const zero32bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';
const MerkleTreeBridge = require('@0xpolygonhermez/zkevm-commonjs').MTBridge;
const {
    verifyMerkleProof,
} = require('@0xpolygonhermez/zkevm-commonjs').mtBridgeUtils;

const { getL1InfoTreeValue } = require('@0xpolygonhermez/zkevm-commonjs').l1InfoTreeUtils;

describe('Global Exit Root', () => {
    let rollup;
    let PolygonZkEVMBridge;

    let polygonZkEVMGlobalExitRoot;
    beforeEach('Deploy contracts', async () => {
        // load signers
        [, rollup, PolygonZkEVMBridge] = await ethers.getSigners();

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');

        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            rollup.address,
            PolygonZkEVMBridge.address,
        );
        await polygonZkEVMGlobalExitRoot.deployed();
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZkEVMGlobalExitRoot.rollupAddress()).to.be.equal(rollup.address);
        expect(await polygonZkEVMGlobalExitRoot.bridgeAddress()).to.be.equal(PolygonZkEVMBridge.address);
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(zero32bytes);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(zero32bytes);
        expect(await polygonZkEVMGlobalExitRoot.depositCount()).to.be.equal(0);
    });

    it('should update root and check global exit root', async () => {
        const newRootRollup = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        const newRootGlobalExitRoot = calculateGlobalExitRoot(zero32bytes, newRootRollup);

        await expect(polygonZkEVMGlobalExitRoot.updateExitRoot(newRootRollup))
            .to.be.revertedWith('OnlyAllowedContracts');

        // Update root from the rollup
        await expect(polygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(newRootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(zero32bytes, newRootRollup);

        // get block info to fulfill MT L1InfoRoot
        const blockInfo = await ethers.provider.getBlock('latest');

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot())
            .to.be.equal(newRootGlobalExitRoot);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);

        // compute value leaf l1InfoTree
        const valueLeaf = getL1InfoTreeValue(
            newRootGlobalExitRoot,
            blockInfo.parentHash,
            blockInfo.timestamp,
        );

        merkleTree.add(valueLeaf);
        const rootSC = await polygonZkEVMGlobalExitRoot.getRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        const index = 0;
        const proof = merkleTree.getProofTreeByIndex(index);

        // verify merkle proof
        expect(verifyMerkleProof(valueLeaf, proof, index, rootSC)).to.be.equal(true);

        expect(await polygonZkEVMGlobalExitRoot.verifyMerkleProof(
            valueLeaf,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);

        // Update root from the PolygonZkEVMBridge
        const newRootBridge = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await expect(polygonZkEVMGlobalExitRoot.connect(PolygonZkEVMBridge).updateExitRoot(newRootBridge))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(newRootBridge, newRootRollup);

        // get block info to fulfull MT L1InfoRoot
        const blockInfo2 = await ethers.provider.send('eth_getBlockByNumber', [
            ethers.utils.hexValue(((await ethers.provider.getBlock('latest')).number)),
            false,
        ]);

        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(newRootBridge);
        const newRootGlobalExitRoot2 = calculateGlobalExitRoot(newRootBridge, newRootRollup);
        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot())
            .to.be.equal(newRootGlobalExitRoot2);

        // compute value leaf l1InfoTree
        const valueLeaf2 = getL1InfoTreeValue(
            newRootGlobalExitRoot2,
            blockInfo2.parentHash,
            blockInfo2.timestamp,
        );

        merkleTree.add(valueLeaf2);
        const rootSC2 = await polygonZkEVMGlobalExitRoot.getRoot();
        const rootJS2 = merkleTree.getRoot();
        expect(rootSC2).to.be.equal(rootJS2);

        // check merkle proof
        const index2 = 1;
        const proof2 = merkleTree.getProofTreeByIndex(index2);

        // verify merkle proof
        expect(verifyMerkleProof(valueLeaf2, proof2, index2, rootSC2)).to.be.equal(true);

        expect(await polygonZkEVMGlobalExitRoot.verifyMerkleProof(
            valueLeaf2,
            proof2,
            index2,
            rootSC2,
        )).to.be.equal(true);
    });
});

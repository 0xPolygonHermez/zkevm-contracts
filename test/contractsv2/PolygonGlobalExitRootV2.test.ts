/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRoot,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMV2,
    PolygonRollupBase,
    TokenWrapped,
    Address,
    PolygonZkEVM,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
const {calculateSnarkInput, calculateAccInputHash, calculateBatchHashData} = contractUtils;

type BatchDataStruct = PolygonRollupBase.BatchDataStruct;

const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: Boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    } else {
        return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
    }
}

function calculateGlobalExitRootLeaf(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
    return ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "uint64"],
        [newGlobalExitRoot, lastBlockHash, timestamp]
    );
}
describe("Polygon Globlal exit root v2", () => {
    let deployer: any;
    let rollupManager: any;
    let bridge: any;

    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;
    let polygonZkEVMGlobalExitRootV2: PolygonZkEVMGlobalExitRootV2;

    beforeEach("Deploy contract", async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, bridge, rollupManager] = await ethers.getSigners();

        // deploy globalExitRoot
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");
        polygonZkEVMGlobalExitRoot = (await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [rollupManager.address, bridge.address],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        })) as any;

        expect(await polygonZkEVMGlobalExitRoot.rollupAddress()).to.be.equal(rollupManager.address);

        const PolygonZkEVMGlobalExitRootV2Factory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2");
        await upgrades.upgradeProxy(polygonZkEVMGlobalExitRoot.target, PolygonZkEVMGlobalExitRootV2Factory, {
            constructorArgs: [rollupManager.address, bridge.address],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        polygonZkEVMGlobalExitRootV2 = (await PolygonZkEVMGlobalExitRootV2Factory.attach(
            polygonZkEVMGlobalExitRoot.target
        )) as PolygonZkEVMGlobalExitRootV2;
    });

    it("should check the initalized parameters", async () => {
        expect(await polygonZkEVMGlobalExitRootV2.bridgeAddress()).to.be.equal(bridge.address);
        expect(await polygonZkEVMGlobalExitRootV2.rollupManager()).to.be.equal(rollupManager.address);
        expect(polygonZkEVMGlobalExitRoot.rollupAddress()).to.be.reverted;

        expect(await polygonZkEVMGlobalExitRootV2.lastRollupExitRoot()).to.be.equal(ethers.ZeroHash);
        expect(await polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);
    });

    it("should update root and check global exit root", async () => {
        const newRootRollup = ethers.hexlify(ethers.randomBytes(32));
        await expect(polygonZkEVMGlobalExitRootV2.updateExitRoot(newRootRollup)).to.be.revertedWithCustomError(
            polygonZkEVMGlobalExitRootV2,
            "OnlyAllowedContracts"
        );
        const blockUpdates = [];

        // Update root from the rollup
        await expect(polygonZkEVMGlobalExitRootV2.connect(rollupManager).updateExitRoot(newRootRollup))
            .to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTree")
            .withArgs(ethers.ZeroHash, newRootRollup);

        blockUpdates.push({
            block: await ethers.provider.getBlock("latest"),
            globalExitRoot: calculateGlobalExitRoot(ethers.ZeroHash, newRootRollup),
        });

        expect(await polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, newRootRollup)
        );

        // Update root from the PolygonZkEVMBridge
        const newRootBridge = ethers.hexlify(ethers.randomBytes(32));
        await expect(polygonZkEVMGlobalExitRootV2.connect(bridge).updateExitRoot(newRootBridge))
            .to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTree")
            .withArgs(newRootBridge, newRootRollup);

        const newGlobalExitRoot = calculateGlobalExitRoot(newRootBridge, newRootRollup);
        blockUpdates.push({
            block: await ethers.provider.getBlock("latest"),
            globalExitRoot: newGlobalExitRoot,
        });

        expect(await polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot()).to.be.equal(newRootBridge);

        expect(await polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot()).to.be.equal(newGlobalExitRoot);

        // Check the leaf created
        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);

        for (const blockStruct of blockUpdates) {
            const {block, globalExitRoot} = blockStruct as any;
            const currentBlockNumber = block?.number;
            const previousBlock = await ethers.provider.getBlock((currentBlockNumber as number) - 1);
            const leafValueJs = calculateGlobalExitRootLeaf(globalExitRoot, previousBlock?.hash, block?.timestamp);
            const leafValueSC = await polygonZkEVMGlobalExitRootV2.getLeafValue(
                globalExitRoot,
                previousBlock?.hash as any,
                block?.timestamp as any
            );

            expect(leafValueJs).to.be.equal(leafValueSC);
            merkleTree.add(leafValueJs);
        }

        const rootSC = await polygonZkEVMGlobalExitRootV2.getRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        const index = 0;
        const proof = merkleTree.getProofTreeByIndex(index);
    });
    it("should synch every root through events", async () => {});
});

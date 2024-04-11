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
    TokenWrapped,
    Address,
    PolygonZkEVM,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
import {Block, Signer} from "ethers";
type HardhatEthersSigner = Signer & {address: string};
const {calculateSnarkInput, calculateAccInputHash, calculateBatchHashData} = contractUtils;

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

function getL1InfoTreeHash(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
    return ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "uint64"],
        [newGlobalExitRoot, lastBlockHash, timestamp]
    );
}

function getLeafValueGlobal(l1InfoTreeHash: any, root: any) {
    return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [l1InfoTreeHash, root]);
}

function randomBytes32() {
    return ethers.hexlify(ethers.randomBytes(32));
}

describe("Polygon Globlal exit root v2", () => {
    let deployer: HardhatEthersSigner;
    let rollupManager: HardhatEthersSigner;
    let bridge: HardhatEthersSigner;

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
            call: "initialize",
            constructorArgs: [rollupManager.address, bridge.address],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        polygonZkEVMGlobalExitRootV2 = PolygonZkEVMGlobalExitRootV2Factory.attach(
            polygonZkEVMGlobalExitRoot.target
        ) as PolygonZkEVMGlobalExitRootV2;
    });

    it("should check the initalized parameters", async () => {
        expect(await polygonZkEVMGlobalExitRootV2.bridgeAddress()).to.be.equal(bridge.address);
        expect(await polygonZkEVMGlobalExitRootV2.rollupManager()).to.be.equal(rollupManager.address);
        expect(polygonZkEVMGlobalExitRoot.rollupAddress()).to.be.reverted;

        expect(await polygonZkEVMGlobalExitRootV2.lastRollupExitRoot()).to.be.equal(ethers.ZeroHash);
        expect(await polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);
    });

    it("should update root and check global exit root", async () => {
        const newRootRollup = randomBytes32();
        await expect(polygonZkEVMGlobalExitRootV2.updateExitRoot(newRootRollup)).to.be.revertedWithCustomError(
            polygonZkEVMGlobalExitRootV2,
            "OnlyAllowedContracts"
        );
        const blockUpdates = [];

        // Update root from the rollup
        await expect(polygonZkEVMGlobalExitRootV2.connect(rollupManager).updateExitRoot(newRootRollup))
            .to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTreeRecursive")
            .withArgs(ethers.ZeroHash, newRootRollup);

        blockUpdates.push({
            block: await ethers.provider.getBlock("latest"),
            globalExitRoot: calculateGlobalExitRoot(ethers.ZeroHash, newRootRollup),
        });

        expect(await polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, newRootRollup)
        );

        // Update root from the PolygonZkEVMBridge
        const newRootBridge = randomBytes32();
        await expect(polygonZkEVMGlobalExitRootV2.connect(bridge).updateExitRoot(newRootBridge))
            .to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTreeRecursive")
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
        merkleTree.add(ethers.ZeroHash); // add first zero leaf at initialze

        for (const blockStruct of blockUpdates) {
            const {block, globalExitRoot} = blockStruct as any;
            const currentBlockNumber = block?.number;
            const previousBlock = await ethers.provider.getBlock((currentBlockNumber as number) - 1);
            const l1InfoTreeHash = getL1InfoTreeHash(globalExitRoot, previousBlock?.hash, block?.timestamp);
            const leafValueJs = getLeafValueGlobal(l1InfoTreeHash, merkleTree.getRoot());

            const l1InfoTreeHashSC = await polygonZkEVMGlobalExitRootV2.getL1InfoTreeHash(
                globalExitRoot as any,
                previousBlock?.hash as any,
                block?.timestamp
            );

            const leafValueSC = await polygonZkEVMGlobalExitRootV2.getLeafValue(l1InfoTreeHashSC, merkleTree.getRoot());

            expect(leafValueJs).to.be.equal(leafValueSC);
            merkleTree.add(leafValueJs);
        }

        const rootSC = await polygonZkEVMGlobalExitRootV2.getRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);
    });
    it("should set every l1InfoLeaf and verify merkle proof", async () => {
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        merkleTree.add(ethers.ZeroHash); // add first zero leaf at initialze
        const leafValues = [ethers.ZeroHash];

        let previousBlockHash = (await ethers.provider.getBlock("latest"))!.hash;

        // Update root from the rollup
        const newRootRollup = randomBytes32();
        {
            await expect(polygonZkEVMGlobalExitRootV2.connect(rollupManager).updateExitRoot(newRootRollup))
                .to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTreeRecursive")
                .withArgs(ethers.ZeroHash, newRootRollup);
            const globalExitRoot = calculateGlobalExitRoot(ethers.ZeroHash, newRootRollup);

            const {hash, timestamp} = (await ethers.provider.getBlock("latest")) as Block;
            const l1InfoTreeHash = getL1InfoTreeHash(globalExitRoot, previousBlockHash, timestamp);
            const leafValueJs = getLeafValueGlobal(l1InfoTreeHash, merkleTree.getRoot());
            merkleTree.add(leafValueJs);
            leafValues.push(leafValueJs);
            previousBlockHash = hash;
        }
        // Update root from PolygonZkEVMBridge
        const newRootBridge = randomBytes32();
        {
            await expect(polygonZkEVMGlobalExitRootV2.connect(bridge).updateExitRoot(newRootBridge))
                .to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTreeRecursive")
                .withArgs(newRootBridge, newRootRollup);
            const globalExitRoot = calculateGlobalExitRoot(newRootBridge, newRootRollup);

            const {timestamp} = (await ethers.provider.getBlock("latest")) as Block;
            const l1InfoTreeHash = getL1InfoTreeHash(globalExitRoot, previousBlockHash, timestamp);
            const leafValueJs = getLeafValueGlobal(l1InfoTreeHash, merkleTree.getRoot());
            merkleTree.add(leafValueJs);
            leafValues.push(leafValueJs);
        }

        expect(await polygonZkEVMGlobalExitRootV2.lastMainnetExitRoot()).to.be.equal(newRootBridge);
        expect(await polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(newRootBridge, newRootRollup)
        );
        expect(await polygonZkEVMGlobalExitRootV2.getRoot()).to.be.equal(merkleTree.getRoot());

        // check merkle proof & l1InfoLeafMap
        for (const [index, leafValue] of leafValues.entries()) {
            const proof = merkleTree.getProofTreeByIndex(index);

            expect(verifyMerkleProof(leafValue, proof, index, merkleTree.getRoot())).to.be.true;
            expect(await polygonZkEVMGlobalExitRootV2.verifyMerkleProof(leafValue, proof, index, merkleTree.getRoot()))
                .to.be.true;

            const leafValueSC = await polygonZkEVMGlobalExitRootV2.l1InfoLeafMap(index);
            expect(leafValueSC).to.be.equal(leafValue);
        }

        // match deposit count to number of leaves
        expect(await polygonZkEVMGlobalExitRootV2.depositCount()).to.be.equal(leafValues.length);
    });
    it("updateExitRoot is idempotent", async () => {
        const merkleTree = new MerkleTreeBridge(32);

        const rootRollup = randomBytes32();
        const tx = polygonZkEVMGlobalExitRootV2.connect(rollupManager).updateExitRoot(rootRollup);
        await expect(tx)
            .to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTreeRecursive")
            .withArgs(ethers.ZeroHash, rootRollup);

        const currentBlock = await ethers.provider.getBlock("latest");
        const firstLeaf = getLeafValueGlobal(
            getL1InfoTreeHash(
                calculateGlobalExitRoot(ethers.ZeroHash, rootRollup),
                await getPreviousBlockHash(),
                currentBlock!.timestamp
            ),
            merkleTree.getRoot()
        );
        merkleTree.add(firstLeaf);

        await ethers.provider.send("evm_setAutomine", [false]);
        await ethers.provider.send("evm_setIntervalMining", [10]);

        // bridge sends the same txn twice in same block
        const rootBridge = randomBytes32();
        const unsortedPromises = [
            polygonZkEVMGlobalExitRootV2.connect(bridge).updateExitRoot(rootBridge, {gasLimit: 1000000}), // need to specify gas limit such that they end up in the same block
            polygonZkEVMGlobalExitRootV2.connect(bridge).updateExitRoot(rootBridge, {gasLimit: 1000000}),
        ];

        await ethers.provider.send("evm_mine");
        await ethers.provider.send("evm_setAutomine", [true]); // sanity
        await ethers.provider.send("evm_setIntervalMining", [0]);

        const txns = (await Promise.all((await Promise.all(unsortedPromises)).map((t) => t.wait()))).sort(
            (a, b) => b!.logs.length - a!.logs.length
        );

        await expect(txns[0]).to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTreeRecursive");
        expect(txns[1]!.logs.length).to.be.equal(0);
        const secondLeaf = getLeafValueGlobal(
            getL1InfoTreeHash(
                calculateGlobalExitRoot(rootBridge, rootRollup),
                (await ethers.provider.getBlock(txns[0]!.blockNumber! - 1))!.hash,
                (await txns[0]!.getBlock())!.timestamp
            ),
            merkleTree.getRoot()
        );
        merkleTree.add(secondLeaf);
        expect(await polygonZkEVMGlobalExitRootV2.getRoot(), merkleTree.getRoot());
    });
    it("should synch every root through events", async () => {});
});
async function getPreviousBlockHash() {
    return (await ethers.provider.getBlock((await ethers.provider.getBlockNumber()) - 1))!.hash;
}
describe("PolygonGlobalExitRootV2: Deposits exist before initializing Freijoa update", () => {
    let deployer: HardhatEthersSigner;
    let rollupManager: HardhatEthersSigner;
    let bridge: HardhatEthersSigner;

    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;
    let polygonZkEVMGlobalExitRootV2: PolygonZkEVMGlobalExitRootV2;

    let initializeBlock: Block | null;
    let currentRootBridge = ethers.ZeroHash;
    let currentRootRollup = ethers.ZeroHash;

    beforeEach("Deploy contracts without initializing PolygonGlobalExitRootV2", async () => {
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
            // call: "initialize", => note: we'll initialize after the deposits
            constructorArgs: [rollupManager.address, bridge.address],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        polygonZkEVMGlobalExitRootV2 = PolygonZkEVMGlobalExitRootV2Factory.attach(
            polygonZkEVMGlobalExitRoot.target
        ) as PolygonZkEVMGlobalExitRootV2;

        // Update exit roots, and then initialize
        const merkleTree = new MerkleTreeBridge(32);

        expect(await polygonZkEVMGlobalExitRootV2.getRoot(), merkleTree.getRoot());

        // Update Rollup Exit Root 4 times
        for (let i = 0; i < 4; i++) {
            const newRootRollup = randomBytes32();
            await expect(polygonZkEVMGlobalExitRootV2.connect(rollupManager).updateExitRoot(newRootRollup))
                .to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTreeRecursive")
                .withArgs(ethers.ZeroHash, newRootRollup);
            const globalExitRoot = calculateGlobalExitRoot(ethers.ZeroHash, newRootRollup);
            merkleTree.add(
                getLeafValueGlobal(
                    getL1InfoTreeHash(
                        globalExitRoot,
                        await getPreviousBlockHash(),
                        (await ethers.provider.getBlock("latest"))!.timestamp
                    ),
                    merkleTree.getRoot()
                )
            );

            expect(await polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot()).to.be.equal(globalExitRoot);
            currentRootRollup = newRootRollup;
        }
        // Update Bridge Exit Root 4 times
        for (let i = 0; i < 4; i++) {
            const newRootBridge = randomBytes32();
            await expect(polygonZkEVMGlobalExitRootV2.connect(bridge).updateExitRoot(newRootBridge))
                .to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTreeRecursive")
                .withArgs(newRootBridge, currentRootRollup);
            const globalExitRoot = calculateGlobalExitRoot(newRootBridge, currentRootRollup);
            merkleTree.add(
                getLeafValueGlobal(
                    getL1InfoTreeHash(
                        globalExitRoot,
                        await getPreviousBlockHash(),
                        (await ethers.provider.getBlock("latest"))!.timestamp
                    ),
                    merkleTree.getRoot()
                )
            );
            expect(await polygonZkEVMGlobalExitRootV2.getLastGlobalExitRoot()).to.be.equal(globalExitRoot);
            currentRootBridge = newRootBridge;
        }

        expect(await polygonZkEVMGlobalExitRootV2.depositCount()).to.be.equal(8);
        expect(await polygonZkEVMGlobalExitRootV2.getRoot(), merkleTree.getRoot());

        // initialize
        await expect(polygonZkEVMGlobalExitRootV2.initialize())
            .to.emit(polygonZkEVMGlobalExitRootV2, "UpdateL1InfoTreeRecursive")
            .withArgs(currentRootBridge, currentRootRollup);
        initializeBlock = await ethers.provider.getBlock("latest");
    });
    it("should reset deposit count", async () => {
        expect(await polygonZkEVMGlobalExitRootV2.depositCount()).to.be.equal(2);
    });
    it("should set recursive tree correctly", async () => {
        const merkleTree = new MerkleTreeBridge(32);
        merkleTree.add(ethers.ZeroHash);
        const leafInfoHash = getL1InfoTreeHash(
            calculateGlobalExitRoot(currentRootBridge, currentRootRollup),
            (await ethers.provider.getBlock(initializeBlock!.number - 1))!.hash,
            initializeBlock!.timestamp
        );
        const leafValue = getLeafValueGlobal(leafInfoHash, merkleTree.getRoot());
        merkleTree.add(leafValue);
        expect(await polygonZkEVMGlobalExitRootV2.getRoot()).to.be.equal(merkleTree.getRoot());
        expect(await polygonZkEVMGlobalExitRootV2.l1InfoLeafMap(1)).to.be.equal(leafValue);
    });
});

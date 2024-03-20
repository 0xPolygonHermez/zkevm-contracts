import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {type HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";

import {
    processorUtils,
    contractUtils,
    MTBridge as MerkleTreeBridge,
    mtBridgeUtils,
} from "@0xpolygonhermez/zkevm-commonjs";
import {type PolygonZkEVMGlobalExitRootV2, type PolygonZkEVMBridgeV2, ERC20PermitMock} from "../../typechain-types";

const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: Boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    } else {
        return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
    }
}

describe("PolygonZkEVMBridgeV2: Custom Tokens", () => {
    // Signers
    let bridgor: HardhatEthersSigner;
    let deployer: HardhatEthersSigner;
    let rollupManager: HardhatEthersSigner;
    let acc1: HardhatEthersSigner;

    // Contracts
    let polygonZkEVMBridge: PolygonZkEVMBridgeV2;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRootV2;
    let token: ERC20PermitMock;

    const originNetworkId = 0;
    const destinationNetworkId = 1;

    const networkIDMainnet = 0;
    const LEAF_TYPE_ASSET = 0;

    beforeEach("Deploy contracts", async () => {
        // Load signers
        [bridgor, deployer, rollupManager, acc1] = await ethers.getSigners();

        // Deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        polygonZkEVMBridge = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor"],
        })) as unknown as PolygonZkEVMBridgeV2;

        // Deploy PolygonZkEVMGlobalExitRoot
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2");
        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            rollupManager.address,
            polygonZkEVMBridge.target
        );

        // Initialize PolygonZkEVMBridge on Destination Network
        await polygonZkEVMBridge.initialize(
            destinationNetworkId,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManager.address,
            "0x"
        );

        // Set custom wrapped token address

        // await polygonZkEVMBridge.setTokenWrappedAddress()

        // // Deploy Tokens
        const tokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        token = await tokenFactory.deploy("Test Token", "TEST", deployer.address, ethers.parseEther("20000000"));
    });

    it("should claim tokens with default wrapper", async () => {
        // Bridgor bridge USDC from originNetwork

        const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

        // First, we need to setup the Sparse Merkle Tree proofs

        // Local merkle tree
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const destinationAddress = deployer.address;
        const tokenAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
        const amount = ethers.parseEther("10000");
        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            ["USD Coin", "USDC", 6]
        );
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetworkId,
            tokenAddress,
            destinationNetworkId,
            destinationAddress,
            amount,
            metadataHash
        );
        merkleTreeLocal.add(leafValue);
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);
        const rootLocalRollup = merkleTreeLocal.getRoot();

        // Double check the SMT Proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);

        // Rollup merkle tree
        const merkleTreeRollup = new MerkleTreeBridge(height);
        for (let i = 0; i < 10; i++) {
            merkleTreeRollup.add(rootLocalRollup);
        }
        const indexRollup = 5;
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);
        const rootRollup = merkleTreeRollup.getRoot();

        // Double check the SMT Proof
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)).to.be.equal(true);

        // Second, we need to update the exit root
        const lastMainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTree")
            .withArgs(lastMainnetExitRoot, rootRollup);

        const lastRollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(lastRollupExitRoot).to.be.equal(rootRollup);

        // Third, calculate the global index
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        const result = await polygonZkEVMBridge.claimAsset(
            proofLocal,
            proofRollup,
            globalIndex,
            lastMainnetExitRoot,
            lastRollupExitRoot,
            originNetworkId,
            tokenAddress,
            destinationNetworkId,
            destinationAddress,
            amount,
            metadata
        );
        console.log(result);
    });
});

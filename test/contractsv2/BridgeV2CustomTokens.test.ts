import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {setBalance} from "@nomicfoundation/hardhat-network-helpers";
import {type HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";

import {
    processorUtils,
    contractUtils,
    MTBridge as MerkleTreeBridge,
    mtBridgeUtils,
} from "@0xpolygonhermez/zkevm-commonjs";
import {
    type PolygonZkEVMGlobalExitRootV2,
    type PolygonZkEVMBridgeV2,
    type ERC20PermitMock,
    type TokenWrapped,
} from "../../typechain-types";

const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: Boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    } else {
        return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
    }
}

describe("PolygonZkEVMBridgeV2: Custom Tokens", () => {
    upgrades.silenceWarnings();

    // Signers
    let deployer: HardhatEthersSigner;
    let rollupManager: HardhatEthersSigner;
    let alice: HardhatEthersSigner;

    // Contracts
    let polygonZkEVMBridge: PolygonZkEVMBridgeV2;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRootV2;
    let token: ERC20PermitMock;

    const tokenMetadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "string", "uint8"],
        ["Polygon", "POL", 18]
    );

    const networkId = 0;
    const LEAF_TYPE_ASSET = 0;

    beforeEach("Deploy contracts", async () => {
        // Load signers
        [deployer, rollupManager, alice] = await ethers.getSigners();

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

        // Deploy token
        const tokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        token = await tokenFactory.deploy("Polygon", "POL", deployer.address, ethers.parseEther("1000000"));

        // Initialize PolygonZkEVMBridge on Destination Network
        await polygonZkEVMBridge.initialize(
            networkId,
            ethers.ZeroAddress,
            0,
            polygonZkEVMGlobalExitRoot.target,
            rollupManager.address,
            "0x"
        );

        // Set custom wrapped token address

        // await polygonZkEVMBridge.setTokenWrappedAddress()
    });

    it("should claim gas tokens", async () => {
        // 1. we need to setup the Sparse Merkle Tree proofs

        // Local merkle tree
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);

        const originNetworkId = networkId;
        const tokenAddress = ethers.ZeroAddress; // NOTE: gas token
        const destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [tokenMetadata]);

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

        // 2. we need to update the exit root
        const lastMainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTree")
            .withArgs(lastMainnetExitRoot, rootRollup);

        const lastRollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(lastRollupExitRoot).to.be.equal(rootRollup);

        // 3. we need to calculate the global index
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        // 4. topup the bridge
        const bridgeBalance = ethers.parseEther("1.0");
        await setBalance(polygonZkEVMBridge.target.toString(), bridgeBalance);

        // 5. Alice claim
        const beforeClaim = await ethers.provider.getBalance(alice.address);
        await polygonZkEVMBridge.claimAsset(
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
            tokenMetadata
        );
        const afterClaim = await ethers.provider.getBalance(alice.address);
        const aliceBalance = afterClaim - beforeClaim;
        expect(aliceBalance).eq(amount);
    });

    it("should claim local tokens", async () => {
        // 1. we need to setup the Sparse Merkle Tree proofs

        // Local merkle tree
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);

        const originNetworkId = networkId;
        const tokenAddress = token.target;
        const destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [tokenMetadata]);

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

        // 2. we need to update the exit root
        const lastMainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTree")
            .withArgs(lastMainnetExitRoot, rootRollup);

        const lastRollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(lastRollupExitRoot).to.be.equal(rootRollup);

        // 3. we need to calculate the global index
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        // 4. Topup the bridge
        await token.mint(polygonZkEVMBridge.target, amount);

        // 5. Alice claim
        const beforeClaim = await token.balanceOf(alice.address);
        await polygonZkEVMBridge.claimAsset(
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
            tokenMetadata
        );
        const afterClaim = await token.balanceOf(alice.address);
        const aliceBalance = afterClaim - beforeClaim;
        expect(aliceBalance).eq(amount);
    });

    it("should claim non-local tokens with default wrapper", async () => {
        // 1. we need to setup the Sparse Merkle Tree proofs

        // Local merkle tree
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);

        const originNetworkId = networkId + 1; // NOTE: non-local tokens
        const tokenAddress = token.target;
        const destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [tokenMetadata]);

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

        // 2. we need to update the exit root
        const lastMainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTree")
            .withArgs(lastMainnetExitRoot, rootRollup);

        const lastRollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(lastRollupExitRoot).to.be.equal(rootRollup);

        // 3. we need to calculate the global index
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        // 4. we need to get the address of token wrapper
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [originNetworkId, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridge.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, tokenMetadata]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridge.target as string,
            salt,
            hashInitCode
        );
        const defaultWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // 5. Alice claim
        await expect(
            polygonZkEVMBridge.claimAsset(
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
                tokenMetadata
            )
        )
            .to.emit(polygonZkEVMBridge, "ClaimEvent")
            .withArgs(globalIndex, originNetworkId, tokenAddress, destinationAddress, amount)
            .to.emit(polygonZkEVMBridge, "NewWrappedToken")
            .withArgs(originNetworkId, tokenAddress, precalculateWrappedErc20, tokenMetadata)
            .to.emit(defaultWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, destinationAddress, amount);
    });

    it("should claim non-local tokens with custom wrapper", async () => {
        // 1. we need to setup the Sparse Merkle Tree proofs

        // Local merkle tree
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);

        const originNetworkId = networkId + 1; // NOTE: non-local tokens
        const tokenAddress = token.target;
        const destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [tokenMetadata]);

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

        // 2. we need to update the exit root
        const lastMainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTree")
            .withArgs(lastMainnetExitRoot, rootRollup);

        const lastRollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(lastRollupExitRoot).to.be.equal(rootRollup);

        // 3. we need to calculate the global index
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        // 4. we need to get the address of token wrapper
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [originNetworkId, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridge.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, tokenMetadata]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridge.target as string,
            salt,
            hashInitCode
        );
        const defaultWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // 5. Alice claim
        await expect(
            polygonZkEVMBridge.claimAsset(
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
                tokenMetadata
            )
        )
            .to.emit(polygonZkEVMBridge, "ClaimEvent")
            .withArgs(globalIndex, originNetworkId, tokenAddress, destinationAddress, amount)
            .to.emit(polygonZkEVMBridge, "NewWrappedToken")
            .withArgs(originNetworkId, tokenAddress, precalculateWrappedErc20, tokenMetadata)
            .to.emit(defaultWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, destinationAddress, amount);
    });
});

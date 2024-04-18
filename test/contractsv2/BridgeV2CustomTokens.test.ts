import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {setBalance} from "@nomicfoundation/hardhat-network-helpers";
import {type HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";

import {MTBridge as MerkleTreeBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
import {
    type PolygonZkEVMGlobalExitRootV2,
    type PolygonZkEVMBridgeV2,
    type ERC20PermitMock,
    type TokenWrapped,
} from "../../typechain-types";

const LEAF_TYPE_ASSET = 0;
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    } else {
        return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
    }
}

const _setProofs = async (
    originNetworkId: number,
    tokenAddress: string,
    destinationNetworkId: number,
    destinationAddress: string,
    amount: bigint,
    tokenMetadata: string,
    contract: PolygonZkEVMGlobalExitRootV2
) => {
    const height = 32;
    const merkleTreeLocal = new MerkleTreeBridge(height);
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
    const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

    const lastMainnetExitRoot = await contract.lastMainnetExitRoot();
    await expect(contract.updateExitRoot(rootRollup))
        .to.emit(contract, "UpdateL1InfoTree")
        .withArgs(lastMainnetExitRoot, rootRollup);

    const lastRollupExitRoot = await contract.lastRollupExitRoot();
    expect(lastRollupExitRoot).to.be.equal(rootRollup);

    return [proofLocal, proofRollup, globalIndex, lastMainnetExitRoot, lastRollupExitRoot];
};

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
            deployer.address, // deployer as bridge manager
            "0x"
        );
    });

    it("should set correct custom wrapper storages", async () => {
        const originNetworkId = networkId + 1;
        const tokenAddress = token.target;
        const tokenFactory = await ethers.getContractFactory("ERC20ExistingMock");
        const existingToken = await tokenFactory.deploy();
        const wrapperFactory = await ethers.getContractFactory("CustomTokenWrapperMock");
        const customWrapper = await wrapperFactory.deploy(existingToken.target);

        await polygonZkEVMBridge
            .connect(deployer)
            .setCustomTokenMapping(originNetworkId, tokenAddress, customWrapper.target, existingToken.target);

        const tokenInfo = ethers.solidityPackedKeccak256(["uint32", "address"], [originNetworkId, tokenAddress]);
        const wrapepdTokenAddress = await polygonZkEVMBridge.tokenInfoToWrappedToken(tokenInfo);
        expect(wrapepdTokenAddress).to.be.equal(customWrapper.target);

        // const tokenInfoRes = await polygonZkEVMBridge.wrappedTokenToTokenInfo(tokenInfo);
        // expect(tokenInfoRes.originNetwork).to.be.equal(originNetworkId);
        // expect(tokenInfoRes.originTokenAddress).to.be.equal(tokenAddress);

        const wrapperAddress = await polygonZkEVMBridge.existingTokenToWrapper(existingToken.target);
        expect(wrapperAddress).to.be.equal(customWrapper.target);
    });

    it("should claim gas tokens", async () => {
        // 1. we need to setup the Sparse Merkle Tree proofs
        const originNetworkId = networkId;
        const tokenAddress = ethers.ZeroAddress; // NOTE: gas token
        const destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const [proofLocal, proofRollup, globalIndex, lastMainnetExitRoot, lastRollupExitRoot] = await _setProofs(
            originNetworkId,
            tokenAddress,
            destinationNetworkId,
            destinationAddress,
            amount,
            tokenMetadata,
            polygonZkEVMGlobalExitRoot.connect(rollupManager)
        );

        // 2. topup the bridge
        const bridgeBalance = ethers.parseEther("1.0");
        await setBalance(polygonZkEVMBridge.target.toString(), bridgeBalance);

        // 3. Alice claim
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
        expect(aliceBalance).to.be.equal(amount);
    });

    it("should claim local tokens", async () => {
        // 1. we need to setup the Sparse Merkle Tree proofs
        const originNetworkId = networkId;
        const tokenAddress = token.target;
        const destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const [proofLocal, proofRollup, globalIndex, lastMainnetExitRoot, lastRollupExitRoot] = await _setProofs(
            originNetworkId,
            tokenAddress as string,
            destinationNetworkId,
            destinationAddress,
            amount,
            tokenMetadata,
            polygonZkEVMGlobalExitRoot.connect(rollupManager)
        );

        // 2. Topup the bridge
        await token.mint(polygonZkEVMBridge.target, amount);

        // 3. Alice claim
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
        expect(aliceBalance).to.be.equal(amount);
    });

    it("should claim non-local tokens with default wrapper", async () => {
        // 1. we need to setup the Sparse Merkle Tree proofs
        const originNetworkId = networkId + 1; // NOTE: non-local tokens
        const tokenAddress = token.target;
        const destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const [proofLocal, proofRollup, globalIndex, lastMainnetExitRoot, lastRollupExitRoot] = await _setProofs(
            originNetworkId,
            tokenAddress as string,
            destinationNetworkId,
            destinationAddress,
            amount,
            tokenMetadata,
            polygonZkEVMGlobalExitRoot.connect(rollupManager)
        );

        // 2. We need to get the address of token wrapper
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [originNetworkId, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridge.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, tokenMetadata]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridge.target as string,
            salt,
            hashInitCode
        );
        const defaultWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // 3. Alice claim
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
        const originNetworkId = networkId + 1; // NOTE: non-local tokens
        const tokenAddress = token.target;
        const destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const [proofLocal, proofRollup, globalIndex, lastMainnetExitRoot, lastRollupExitRoot] = await _setProofs(
            originNetworkId,
            tokenAddress as string,
            destinationNetworkId,
            destinationAddress,
            amount,
            tokenMetadata,
            polygonZkEVMGlobalExitRoot.connect(rollupManager)
        );

        // 2. we need to deploy existing token and the wrapper
        const tokenFactory = await ethers.getContractFactory("ERC20ExistingMock");
        const existingToken = await tokenFactory.deploy();
        const wrapperFactory = await ethers.getContractFactory("CustomTokenWrapperMock");
        const customWrapper = await wrapperFactory.deploy(existingToken.target);

        // 3. Bridge manager set the custom wrapper
        await polygonZkEVMBridge
            .connect(deployer)
            .setCustomTokenMapping(originNetworkId, tokenAddress, customWrapper.target, existingToken.target);

        // 4. Alice claim
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
            .to.emit(existingToken, "Transfer")
            .withArgs(ethers.ZeroAddress, destinationAddress, amount);
    });

    it("should bridge gas tokens", async () => {
        const depositCount = await polygonZkEVMBridge.depositCount();
        const originNetwork = networkId;
        const tokenAddress = ethers.ZeroAddress; // Ether
        const amount = ethers.parseEther("10");
        const destinationNetworkId = 1;
        const destinationAddress = deployer.address;

        const metadata = "0x"; // since is ether does not have metadata

        const beforeBridge = await ethers.provider.getBalance(polygonZkEVMBridge.target);
        await expect(
            polygonZkEVMBridge.bridgeAsset(destinationNetworkId, destinationAddress, amount, tokenAddress, true, "0x", {
                value: amount,
            })
        )
            .to.emit(polygonZkEVMBridge, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetworkId,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );

        const afterBridge = await ethers.provider.getBalance(polygonZkEVMBridge.target);
        expect(afterBridge - beforeBridge).to.be.equal(amount);
    });

    it("should bridge non-wrapped tokens", async () => {
        const depositCount = await polygonZkEVMBridge.depositCount();
        const originNetwork = networkId;
        const tokenAddress = token.target;
        const amount = ethers.parseEther("10");
        const destinationNetworkId = 1;
        const destinationAddress = deployer.address;
        const metadata = tokenMetadata;

        // 1. Mint token to alice
        await token.mint(alice.address, amount);

        // 2. Alice approve bridge to spend the token
        await token.connect(alice).approve(polygonZkEVMBridge.target, amount);

        const beforeBridge = await token.balanceOf(polygonZkEVMBridge.target);

        // 3. Alice bridge token
        await expect(
            polygonZkEVMBridge
                .connect(alice)
                .bridgeAsset(destinationNetworkId, destinationAddress, amount, tokenAddress, true, "0x")
        )
            .to.emit(polygonZkEVMBridge, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetworkId,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );

        const afterBridge = await token.balanceOf(polygonZkEVMBridge.target);
        expect(afterBridge - beforeBridge).to.be.equal(amount);
    });

    it("should bridge default wrapped tokens", async () => {
        // 1. we need to setup the Sparse Merkle Tree proofs
        const originNetworkId = networkId + 1;
        let tokenAddress = token.target;
        let destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const [proofLocal, proofRollup, globalIndex, lastMainnetExitRoot, lastRollupExitRoot] = await _setProofs(
            originNetworkId,
            tokenAddress as string,
            destinationNetworkId,
            destinationAddress,
            amount,
            tokenMetadata,
            polygonZkEVMGlobalExitRoot.connect(rollupManager)
        );

        // 2. we need to get the address of the token wrapper
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [originNetworkId, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridge.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, tokenMetadata]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridge.target as string,
            salt,
            hashInitCode
        );
        const defaultWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // 3. Alice claim
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

        const depositCount = await polygonZkEVMBridge.depositCount();
        tokenAddress = defaultWrappedToken.target; // Update with the address of wrapped token
        destinationNetworkId = networkId + 1;
        const metadata = tokenMetadata;

        // 4. Alice bridge token or withdraw to original chain
        await expect(
            polygonZkEVMBridge
                .connect(alice)
                .bridgeAsset(destinationNetworkId, destinationAddress, amount, tokenAddress, true, "0x")
        )
            .to.emit(polygonZkEVMBridge, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetworkId,
                token.target, // NOTE: Target token should be the original address
                destinationNetworkId,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );
    });

    it("should bridge custom wrapped tokens", async () => {
        // 1. we need to setup the Sparse Merkle Tree proofs
        const originNetworkId = networkId + 1;
        let tokenAddress = token.target;
        let destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const [proofLocal, proofRollup, globalIndex, lastMainnetExitRoot, lastRollupExitRoot] = await _setProofs(
            originNetworkId,
            tokenAddress as string,
            destinationNetworkId,
            destinationAddress,
            amount,
            tokenMetadata,
            polygonZkEVMGlobalExitRoot.connect(rollupManager)
        );

        // 2. we need to deploy existing token and the wrapper
        const tokenFactory = await ethers.getContractFactory("ERC20ExistingMock");
        const existingToken = await tokenFactory.deploy();
        const wrapperFactory = await ethers.getContractFactory("CustomTokenWrapperMock");
        const customWrapper = await wrapperFactory.deploy(existingToken.target);

        // 3. Bridge manager set the custom wrapper
        await polygonZkEVMBridge
            .connect(deployer)
            .setCustomTokenMapping(originNetworkId, tokenAddress, customWrapper.target, existingToken.target);

        // 4. Alice claim
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

        const depositCount = await polygonZkEVMBridge.depositCount();
        tokenAddress = existingToken.target; // Update with the address of existing token
        destinationNetworkId = networkId + 1;
        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [await existingToken.name(), await existingToken.symbol(), 18]
        );

        // NOTE: if existing token is not burnable, user must approve custom wrapper contract
        // first in order to allow the custom wrapper contract to transfer out token from the
        // user account

        // 5. Alice bridge token or withdraw to original chain
        await expect(
            polygonZkEVMBridge
                .connect(alice)
                .bridgeAsset(destinationNetworkId, destinationAddress, amount, tokenAddress, true, "0x")
        )
            .to.emit(polygonZkEVMBridge, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetworkId,
                token.target, // NOTE: Target token should be the original address
                destinationNetworkId,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );

        const balance = await existingToken.balanceOf(alice.address);
        expect(balance).to.be.equal(0);
    });

    it("should bridge default wrapped tokens after set custom mapping", async () => {
        // 1. we need to setup the Sparse Merkle Tree proofs
        const originNetworkId = networkId + 1; // NOTE: non-local tokens
        let tokenAddress = token.target;
        let destinationNetworkId = networkId;
        const destinationAddress = alice.address;
        const amount = ethers.parseEther("1.0");
        const [proofLocal, proofRollup, globalIndex, lastMainnetExitRoot, lastRollupExitRoot] = await _setProofs(
            originNetworkId,
            tokenAddress as string,
            destinationNetworkId,
            destinationAddress,
            amount,
            tokenMetadata,
            polygonZkEVMGlobalExitRoot.connect(rollupManager)
        );

        // 2. We need to get the address of token wrapper
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [originNetworkId, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridge.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, tokenMetadata]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridge.target as string,
            salt,
            hashInitCode
        );
        const defaultWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // 3. Alice claim
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

        // At this point; default wrapped token is already minted

        // 4. we need to deploy existing token and the wrapper
        const tokenFactory = await ethers.getContractFactory("ERC20ExistingMock");
        const existingToken = await tokenFactory.deploy();
        const wrapperFactory = await ethers.getContractFactory("CustomTokenWrapperMock");
        const customWrapper = await wrapperFactory.deploy(existingToken.target);

        // 5. Bridge manager set the custom wrapper
        await polygonZkEVMBridge
            .connect(deployer)
            .setCustomTokenMapping(originNetworkId, tokenAddress, customWrapper.target, existingToken.target);

        const depositCount = await polygonZkEVMBridge.depositCount();
        tokenAddress = defaultWrappedToken.target; // Update with the address of wrapped token
        destinationNetworkId = networkId + 1;
        const metadata = tokenMetadata;

        // 6. Alice bridge the default wrapper
        await expect(
            polygonZkEVMBridge
                .connect(alice)
                .bridgeAsset(destinationNetworkId, destinationAddress, amount, tokenAddress, true, "0x")
        )
            .to.emit(polygonZkEVMBridge, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetworkId,
                token.target, // NOTE: Target token should be the original address
                destinationNetworkId,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );
    });
});
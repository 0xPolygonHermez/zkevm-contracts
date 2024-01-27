import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRoot,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMV2,
    PolygonRollupBase,
    TokenWrapped,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
const {calculateSnarkInput, calculateAccInputHash, calculateBatchHashData} = contractUtils;
const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;
const {
    createPermitSignature,
    ifacePermit,
    createPermitSignatureDaiType,
    ifacePermitDAI,
    createPermitSignatureUniType,
} = require("../../src/permit-helper");

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

describe("PolygonZkEVMBridge Contract", () => {
    upgrades.silenceWarnings();

    let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;

    let deployer: any;
    let rollupManager: any;
    let acc1: any;

    const tokenName = "Matic Token";
    const tokenSymbol = "MATIC";
    const decimals = 18;
    const tokenInitialBalance = ethers.parseEther("20000000");
    const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "string", "uint8"],
        [tokenName, tokenSymbol, decimals]
    );
    const networkIDMainnet = 0;
    const networkIDRollup = 1;

    const LEAF_TYPE_ASSET = 0;
    const LEAF_TYPE_MESSAGE = 1;

    const polygonZkEVMAddress = ethers.ZeroAddress;

    beforeEach("Deploy contracts", async () => {
        // load signers
        [deployer, rollupManager, acc1] = await ethers.getSigners();

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        polygonZkEVMBridgeContract = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor"],
        })) as unknown as PolygonZkEVMBridgeV2;

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");
        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            rollupManager.address,
            polygonZkEVMBridgeContract.target
        );

        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManager.address,
            "0x"
        );

        // deploy token
        const maticTokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        polTokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance
        );
    });

    it("should PolygonZkEVMBridge with weird token metadata", async () => {
        const weirdErc20Metadata = await ethers.getContractFactory("ERC20WeirdMetadata");

        const nameWeird = "nameToken";
        const symbolWeird = "NTK";

        const nameWeirdBytes32 = ethers.encodeBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = 14;

        const weirdTokenContract = await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird
        );
        await weirdTokenContract.waitForDeployment();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(polygonZkEVMBridgeContract.target, tokenInitialBalance);

        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [nameWeird, symbolWeird, decimalsWeird]
        );

        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

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
            metadataHash
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );

        expect(await polygonZkEVMBridgeContract.getRoot()).to.be.equal(rootJSMainnet);
    });

    it("should PolygonZkEVMBridge with weird token metadata with reverts", async () => {
        const weirdErc20Metadata = await ethers.getContractFactory("ERC20WeirdMetadata");

        const nameWeird = "nameToken";
        const symbolWeird = "NTK";

        const nameWeirdBytes32 = ethers.encodeBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = ethers.MaxUint256;

        const weirdTokenContract = await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird
        );
        await weirdTokenContract.waitForDeployment();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(polygonZkEVMBridgeContract.target, tokenInitialBalance);

        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        // Since cannot decode decimals
        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        ).to.be.reverted;

        // toogle revert
        await weirdTokenContract.toggleIsRevert();
        // Use revert strings
        const nameRevert = "NO_NAME";
        const symbolRevert = "NO_SYMBOL";
        const decimalsTooRevert = 18;
        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [nameRevert, symbolRevert, decimalsTooRevert]
        );

        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

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
            metadataHash
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );

        expect(await polygonZkEVMBridgeContract.getRoot()).to.be.equal(rootJSMainnet);
    });

    it("should PolygonZkEVMBridge with weird token metadata with empty data", async () => {
        const weirdErc20Metadata = await ethers.getContractFactory("ERC20WeirdMetadata");

        const nameWeird = "";
        const symbolWeird = "";

        const nameWeirdBytes32 = ethers.encodeBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = 255;

        const weirdTokenContract = await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird
        );
        await weirdTokenContract.waitForDeployment();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(polygonZkEVMBridgeContract.target, tokenInitialBalance);

        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        // Empty bytes32 is a not valid encoding
        const nameEmpty = "NOT_VALID_ENCODING"; // bytes32 empty
        const symbolEmpty = "";

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [nameEmpty, symbolEmpty, decimalsWeird]
        );

        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

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
            metadataHash
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );

        expect(await polygonZkEVMBridgeContract.getRoot()).to.be.equal(rootJSMainnet);
    });

    it("should PolygonZkEVMBridge with weird token metadata with invalid data", async () => {
        const weirdErc20Metadata = await ethers.getContractFactory("ERC20InvalidMetadata");

        const nameWeird = "";
        const symbolWeird = "";

        const nameWeirdBytes32 = ethers.encodeBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = 255;

        const weirdTokenContract = (await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird
        )) as any;
        await weirdTokenContract.waitForDeployment();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(polygonZkEVMBridgeContract.target, tokenInitialBalance);

        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        // Empty bytes32 is a not valid encoding
        const nameEmpty = "NOT_VALID_ENCODING"; // bytes32 empty
        const symbolEmpty = "NOT_VALID_ENCODING";

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [nameEmpty, symbolEmpty, decimalsWeird]
        );

        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

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
            metadataHash
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );

        expect(await polygonZkEVMBridgeContract.getRoot()).to.be.equal(rootJSMainnet);
    });

    it("should PolygonZkEVMBridge and with permit eip-2612 compilant", async () => {
        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const balanceDeployer = await polTokenContract.balanceOf(deployer.address);
        const balanceBridge = await polTokenContract.balanceOf(polygonZkEVMBridgeContract.target);

        const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

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
            metadataHash
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        ).to.be.revertedWith("ERC20: insufficient allowance");

        // user permit
        const nonce = await polTokenContract.nonces(deployer.address);
        const deadline = ethers.MaxUint256;
        const {chainId} = await ethers.provider.getNetwork();

        const {v, r, s} = await createPermitSignature(
            polTokenContract,
            deployer,
            polygonZkEVMBridgeContract.target,
            amount,
            nonce,
            deadline,
            chainId
        );

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                ifacePermit.encodeFunctionData("permit", [
                    acc1.address,
                    polygonZkEVMBridgeContract.target,
                    amount,
                    deadline,
                    v,
                    r,
                    s,
                ])
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "NotValidOwner");

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                ifacePermit.encodeFunctionData("permit", [
                    deployer.address,
                    deployer.address,
                    amount,
                    deadline,
                    v,
                    r,
                    s,
                ])
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "NotValidSpender");

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                ifacePermit.encodeFunctionData("permit", [
                    deployer.address,
                    polygonZkEVMBridgeContract.target,
                    amount + 1n,
                    deadline,
                    v,
                    r,
                    s,
                ])
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "NotValidAmount");

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                ethers.ZeroHash
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "NotValidSignature");

        const dataPermit = ifacePermit.encodeFunctionData("permit", [
            deployer.address,
            polygonZkEVMBridgeContract.target,
            amount,
            deadline,
            v,
            r,
            s,
        ]);

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                dataPermit
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount
            )
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(rootJSMainnet, rollupExitRoot);

        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(polygonZkEVMBridgeContract.target)).to.be.equal(balanceBridge + amount);

        // check merkle root with SC
        const rootSCMainnet = await polygonZkEVMBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(
            true
        );

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());
    });

    it("should PolygonZkEVMBridge with permit DAI type contracts", async () => {
        const {chainId} = await ethers.provider.getNetwork();
        const daiTokenFactory = await ethers.getContractFactory("DaiMock");
        const daiContract = (await daiTokenFactory.deploy(chainId)) as any;
        await daiContract.waitForDeployment();
        await daiContract.mint(deployer.address, ethers.parseEther("100"));

        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = daiContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [await daiContract.name(), await daiContract.symbol(), await daiContract.decimals()]
        );
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const balanceDeployer = await daiContract.balanceOf(deployer.address);
        const balanceBridge = await daiContract.balanceOf(polygonZkEVMBridgeContract.target);

        const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

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
            metadataHash
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        ).to.be.revertedWith("Dai/insufficient-allowance");

        // user permit
        const nonce = await daiContract.nonces(deployer.address);
        const deadline = ethers.MaxUint256;

        const {v, r, s} = await createPermitSignatureDaiType(
            daiContract,
            deployer,
            polygonZkEVMBridgeContract.target,
            nonce,
            deadline,
            chainId
        );

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                ifacePermitDAI.encodeFunctionData("permit", [
                    polygonZkEVMBridgeContract.target,
                    polygonZkEVMBridgeContract.target,
                    nonce,
                    deadline,
                    true,
                    v,
                    r,
                    s,
                ])
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "NotValidOwner");

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                ifacePermitDAI.encodeFunctionData("permit", [
                    deployer.address,
                    deployer.address,
                    nonce,
                    deadline,
                    true,
                    v,
                    r,
                    s,
                ])
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "NotValidSpender");

        const dataPermit = ifacePermitDAI.encodeFunctionData("permit", [
            deployer.address,
            polygonZkEVMBridgeContract.target,
            nonce,
            deadline,
            true,
            v,
            r,
            s,
        ]);

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                dataPermit
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount
            )
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(rootJSMainnet, rollupExitRoot);

        expect(await daiContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await daiContract.balanceOf(polygonZkEVMBridgeContract.target)).to.be.equal(balanceBridge + amount);

        // check merkle root with SC
        const rootSCMainnet = await polygonZkEVMBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(
            true
        );

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());
    });

    it("should PolygonZkEVMBridge with permit UNI type contracts", async () => {
        const uniTokenFactory = await ethers.getContractFactory("Uni");
        const lastBlock = (await ethers.provider.getBlock("latest")) as any;
        const uniContract = (await uniTokenFactory.deploy(
            deployer.address,
            deployer.address,
            lastBlock.timestamp + 1
        )) as any;
        await uniContract.waitForDeployment();
        await uniContract.mint(deployer.address, ethers.parseEther("100"));

        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = uniContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [await uniContract.name(), await uniContract.symbol(), await uniContract.decimals()]
        );
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const balanceDeployer = await uniContract.balanceOf(deployer.address);
        const balanceBridge = await uniContract.balanceOf(polygonZkEVMBridgeContract.target);

        const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

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
            metadataHash
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        ).to.be.revertedWith("Uni::transferFrom: transfer amount exceeds spender allowance");

        // user permit
        const nonce = await uniContract.nonces(deployer.address);
        const deadline = ethers.MaxUint256;
        const {chainId} = await ethers.provider.getNetwork();

        const {v, r, s} = await createPermitSignatureUniType(
            uniContract,
            deployer,
            polygonZkEVMBridgeContract.target,
            amount,
            nonce,
            deadline,
            chainId
        );

        const dataPermit = ifacePermit.encodeFunctionData("permit", [
            deployer.address,
            polygonZkEVMBridgeContract.target,
            amount,
            deadline,
            v,
            r,
            s,
        ]);

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                dataPermit
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount
            )
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(rootJSMainnet, rollupExitRoot);

        expect(await uniContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await uniContract.balanceOf(polygonZkEVMBridgeContract.target)).to.be.equal(balanceBridge + amount);

        // check merkle root with SC
        const rootSCMainnet = await polygonZkEVMBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(
            true
        );

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());
    });
});

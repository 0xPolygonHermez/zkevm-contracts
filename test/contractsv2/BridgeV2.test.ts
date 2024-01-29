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

    it("should check the initialize parameters", async () => {
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
                "0x"
            )
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should check bridgeMessageWETH reverts", async () => {
        await expect(
            polygonZkEVMBridgeContract.bridgeMessageWETH(networkIDMainnet, deployer.address, 0, true, "0x")
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "NativeTokenIsEther");
    });

    it("should PolygonZkEVM bridge asset and verify merkle proof", async () => {
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

        // create a new deposit
        await expect(polTokenContract.approve(polygonZkEVMBridgeContract.target, amount))
            .to.emit(polTokenContract, "Approval")
            .withArgs(deployer.address, polygonZkEVMBridgeContract.target, amount);

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
                "0x",
                {value: 1}
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "MsgValueNotZero");

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
            )
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(rootJSMainnet, rollupExitRoot);

        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(polygonZkEVMBridgeContract.target)).to.be.equal(balanceBridge + amount);
        expect(await polygonZkEVMBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

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

    it("should PolygonZkEVM bridge asset and verify merkle proof", async () => {
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

        // create a new deposit
        await expect(polTokenContract.approve(polygonZkEVMBridgeContract.target, amount))
            .to.emit(polTokenContract, "Approval")
            .withArgs(deployer.address, polygonZkEVMBridgeContract.target, amount);

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
                "0x",
                {value: 1}
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "MsgValueNotZero");

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
            )
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(rootJSMainnet, rollupExitRoot);

        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(polygonZkEVMBridgeContract.target)).to.be.equal(balanceBridge + amount);
        expect(await polygonZkEVMBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

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

    it("should PolygonZkEVMBridge message and verify merkle proof", async () => {
        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const originAddress = deployer.address;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);
        const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            polygonZkEVMBridgeContract.bridgeMessage(networkIDMainnet, destinationAddress, true, "0x")
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "DestinationNetworkInvalid");

        await expect(
            polygonZkEVMBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, true, metadata, {
                value: amount,
            })
        )
            .to.emit(polygonZkEVMBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_MESSAGE,
                originNetwork,
                originAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );

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

    it("should PolygonZkEVM bridge asset and message to check global exit root updates", async () => {
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

        // create a new deposit
        await expect(polTokenContract.approve(polygonZkEVMBridgeContract.target, amount))
            .to.emit(polTokenContract, "Approval")
            .withArgs(deployer.address, polygonZkEVMBridgeContract.target, amount);

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
                false,
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

        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(polygonZkEVMBridgeContract.target)).to.be.equal(balanceBridge + amount);
        expect(await polygonZkEVMBridgeContract.lastUpdatedDepositCount()).to.be.equal(0);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);

        // check merkle root with SC
        const rootSCMainnet = await polygonZkEVMBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // Update global exit root
        await expect(polygonZkEVMBridgeContract.updateGlobalExitRoot())
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(rootJSMainnet, rollupExitRoot);

        // no state changes since there are not any deposit pending to be updated
        await polygonZkEVMBridgeContract.updateGlobalExitRoot();
        expect(await polygonZkEVMBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(rootJSMainnet);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // bridge message
        await expect(
            polygonZkEVMBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, false, metadata, {
                value: amount,
            })
        )
            .to.emit(polygonZkEVMBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_MESSAGE,
                originNetwork,
                deployer.address,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                1
            );
        expect(await polygonZkEVMBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(rootJSMainnet);

        // Update global exit root
        await expect(polygonZkEVMBridgeContract.updateGlobalExitRoot()).to.emit(
            polygonZkEVMGlobalExitRoot,
            "UpdateGlobalExitRoot"
        );

        expect(await polygonZkEVMBridgeContract.lastUpdatedDepositCount()).to.be.equal(2);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.not.be.equal(rootJSMainnet);

        // Just to have the metric of a low cost bridge Asset
        const tokenAddress2 = ethers.ZeroAddress; // Ether
        const amount2 = ethers.parseEther("10");
        await polygonZkEVMBridgeContract.bridgeAsset(
            destinationNetwork,
            destinationAddress,
            amount2,
            tokenAddress2,
            false,
            "0x",
            {value: amount2}
        );
    });

    it("should claim tokens from Mainnet to Mainnet", async () => {
        const originNetwork = networkIDMainnet;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = acc1.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

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
            metadataHash
        );
        merkleTreeLocal.add(leafValue);

        const mainnetExitRoot = merkleTreeLocal.getRoot();
        const indexRollup = 0;

        // check only rollup account with update rollup exit root
        await expect(polygonZkEVMGlobalExitRoot.updateExitRoot(mainnetExitRoot)).to.be.revertedWithCustomError(
            polygonZkEVMGlobalExitRoot,
            "OnlyAllowedContracts"
        );

        // add rollup Merkle root
        await ethers.provider.send("hardhat_impersonateAccount", [polygonZkEVMBridgeContract.target]);
        const bridgemoCK = await ethers.getSigner(polygonZkEVMBridgeContract.target as any);

        // await deployer.sendTransaction({
        //     to: bridgemoCK.address,
        //     value: ethers.parseEther("1"),
        // });

        await expect(polygonZkEVMGlobalExitRoot.connect(bridgemoCK).updateExitRoot(mainnetExitRoot, {gasPrice: 0}))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(mainnetExitRoot, rollupExitRoot);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupExitRoot);
        const mainnetExitRootSC = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();
        expect(mainnetExitRootSC).to.be.equal(mainnetExitRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof

        // Merkle proof local
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, mainnetExitRoot)).to.be.equal(true);

        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, true);

        /*
         * claim
         * Can't claim without tokens
         */
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofLocal,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofLocal,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                networkIDRollup,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "DestinationNetworkInvalid");

        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofLocal,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount + 1n,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "InvalidSmtProof");

        // transfer tokens, then claim
        await expect(polTokenContract.transfer(polygonZkEVMBridgeContract.target, amount))
            .to.emit(polTokenContract, "Transfer")
            .withArgs(deployer.address, polygonZkEVMBridgeContract.target, amount);

        expect(false).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofLocal,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polTokenContract, "Transfer")
            .withArgs(polygonZkEVMBridgeContract.target, acc1.address, amount);

        // Can't claim because nullifier
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofLocal,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");
        expect(true).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexLocal, indexRollup + 1));
    });

    it("should claim tokens from Mainnet to Mainnet", async () => {
        const originNetwork = networkIDMainnet;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = acc1.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

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
            metadataHash
        );
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();
        const indexRollup = 5;

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        for (let i = 0; i < 10; i++) {
            if (i == indexRollup) {
                merkleTreeRollup.add(rootLocalRollup);
            } else {
                merkleTreeRollup.add(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
            }
        }

        const rootRollup = merkleTreeRollup.getRoot();

        // check only rollup account with update rollup exit root
        await expect(polygonZkEVMGlobalExitRoot.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            polygonZkEVMGlobalExitRoot,
            "OnlyAllowedContracts"
        );

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(mainnetExitRoot, rootRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof

        // Merkle proof local
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // Merkle proof local
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // verify merkle proof
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)).to.be.equal(true);
        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)
        ).to.be.equal(true);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);
        /*
         * claim
         * Can't claim without tokens
         */
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                Number(globalIndex),
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

        // transfer tokens, then claim
        await expect(polTokenContract.transfer(polygonZkEVMBridgeContract.target, amount))
            .to.emit(polTokenContract, "Transfer")
            .withArgs(deployer.address, polygonZkEVMBridgeContract.target, amount);

        expect(false).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polTokenContract, "Transfer")
            .withArgs(polygonZkEVMBridgeContract.target, acc1.address, amount);

        // Can't claim because nullifier
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");
        expect(true).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexLocal, indexRollup + 1));
    });

    it("should claim tokens from Rollup to Mainnet", async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

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
            metadataHash
        );
        merkleTreeLocal.add(leafValue);
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
            "OnlyAllowedContracts"
        );

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(mainnetExitRoot, rootRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof

        // Merkle proof local
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // Merkle proof local
        const indexRollup = 5;
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)).to.be.equal(true);
        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)
        ).to.be.equal(true);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        expect(false).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [networkIDRollup, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridgeContract.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, metadataToken]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridgeContract.target as string,
            salt,
            hashInitCode
        );
        const newWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // Use precalculatedWrapperAddress and check if matches
        expect(
            await polygonZkEVMBridgeContract.precalculatedWrapperAddress(
                networkIDRollup,
                tokenAddress,
                tokenName,
                tokenSymbol,
                decimals
            )
        ).to.be.equal(precalculateWrappedErc20);

        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polygonZkEVMBridgeContract, "NewWrappedToken")
            .withArgs(originNetwork, tokenAddress, precalculateWrappedErc20, metadata)
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, destinationAddress, amount);

        const newTokenInfo = await polygonZkEVMBridgeContract.wrappedTokenToTokenInfo(precalculateWrappedErc20);

        // Use precalculatedWrapperAddress and check if matches
        expect(
            await polygonZkEVMBridgeContract.calculateTokenWrapperAddress(
                networkIDRollup,
                tokenAddress,
                precalculateWrappedErc20
            )
        ).to.be.equal(precalculateWrappedErc20);

        expect(newTokenInfo.originNetwork).to.be.equal(networkIDRollup);
        expect(newTokenInfo.originTokenAddress).to.be.equal(tokenAddress);
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );
        expect(await polygonZkEVMBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );

        expect(await polygonZkEVMBridgeContract.tokenInfoToWrappedToken(salt)).to.be.equal(precalculateWrappedErc20);

        // Check the wrapper info
        expect(await newWrappedToken.name()).to.be.equal(tokenName);
        expect(await newWrappedToken.symbol()).to.be.equal(tokenSymbol);
        expect(await newWrappedToken.decimals()).to.be.equal(decimals);

        // Can't claim because nullifier
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");
        expect(true).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);

        // Claim again the other leaf to mint tokens
        const index2 = 1;
        const proof2 = merkleTreeLocal.getProofTreeByIndex(index2);

        expect(verifyMerkleProof(leafValue, proof2, index2, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rollupExitRootSC)).to.be.equal(true);

        const globalIndex2 = computeGlobalIndex(index2, indexRollup, false);
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proof2,
                proofRollup,
                globalIndex2,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(globalIndex2, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, destinationAddress, amount);

        // Burn Tokens
        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const wrappedTokenAddress = newWrappedToken.target;
        const newDestinationNetwork = networkIDRollup;

        const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

        // create a new deposit
        await expect(newWrappedToken.approve(polygonZkEVMBridgeContract.target, amount))
            .to.emit(newWrappedToken, "Approval")
            .withArgs(deployer.address, polygonZkEVMBridgeContract.target, amount);

        /*
         *  pre compute root merkle tree in Js
         * const height = 32;
         */
        const merkleTreeMainnet = new MerkleTreeBridge(height);
        // Imporant calcualte leaf with origin token address no wrapped token address
        const originTokenAddress = tokenAddress;
        const metadataMainnet = metadata; // since the token does not belong to this network
        const metadataHashMainnet = ethers.solidityPackedKeccak256(["bytes"], [metadataMainnet]);

        const leafValueMainnet = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            newDestinationNetwork,
            destinationAddress,
            amount,
            metadataHashMainnet
        );
        const leafValueMainnetSC = await polygonZkEVMBridgeContract.getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            newDestinationNetwork,
            destinationAddress,
            amount,
            metadataHashMainnet
        );

        expect(leafValueMainnet).to.be.equal(leafValueMainnetSC);
        merkleTreeMainnet.add(leafValueMainnet);
        const rootJSMainnet = merkleTreeMainnet.getRoot();

        // Tokens are burnt
        expect(await newWrappedToken.totalSupply()).to.be.equal(amount * 2n);
        expect(await newWrappedToken.balanceOf(destinationAddress)).to.be.equal(amount * 2n);
        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                newDestinationNetwork,
                destinationAddress,
                amount,
                wrappedTokenAddress,
                true,
                "0x"
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                originTokenAddress,
                newDestinationNetwork,
                destinationAddress,
                amount,
                metadataMainnet,
                depositCount
            )
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(rootJSMainnet, rollupExitRoot)
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(deployer.address, ethers.ZeroAddress, amount);

        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);
        expect(await newWrappedToken.balanceOf(deployer.address)).to.be.equal(amount);
        expect(await newWrappedToken.balanceOf(polygonZkEVMBridgeContract.target)).to.be.equal(0);

        // check merkle root with SC
        const rootSCMainnet = await polygonZkEVMBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proofMainnet = merkleTreeMainnet.getProofTreeByIndex(0);
        const indexMainnet = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValueMainnet, proofMainnet, indexMainnet, rootSCMainnet)).to.be.equal(true);
        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(
                leafValueMainnet,
                proofMainnet,
                indexMainnet,
                rootSCMainnet
            )
        ).to.be.equal(true);

        const computedGlobalExitRoot2 = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot2).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());
    });
    it("should claim tokens from Rollup to Mainnet, faling deploy wrapped", async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const metadata = ethers.hexlify(ethers.randomBytes(40));
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

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
            metadataHash
        );
        merkleTreeLocal.add(leafValue);
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
            "OnlyAllowedContracts"
        );

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(mainnetExitRoot, rootRollup);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof

        // Merkle proof local
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // Merkle proof local
        const indexRollup = 5;
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)).to.be.equal(true);
        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)
        ).to.be.equal(true);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        expect(false).to.be.equal(await polygonZkEVMBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [networkIDRollup, tokenAddress]);
        const minimalBytecodeProxy = await polygonZkEVMBridgeContract.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, metadataToken]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            polygonZkEVMBridgeContract.target as string,
            salt,
            hashInitCode
        );

        // Use precalculatedWrapperAddress and check if matches
        expect(
            await polygonZkEVMBridgeContract.precalculatedWrapperAddress(
                networkIDRollup,
                tokenAddress,
                tokenName,
                tokenSymbol,
                decimals
            )
        ).to.be.equal(precalculateWrappedErc20);

        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "FailedTokenWrappedDeployment");
    });
    it("should PolygonZkEVMBridge and sync the current root with events", async () => {
        const depositCount = await polygonZkEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // Ether
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = "0x"; // since is ether does not have metadata

        // create 3 new deposit
        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
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

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
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
                depositCount + 1n
            );

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
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
                depositCount + 2n
            );

        // Prepare merkle tree
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);

        // Get the deposit's events
        const filter = polygonZkEVMBridgeContract.filters.BridgeEvent(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        );
        const events = await polygonZkEVMBridgeContract.queryFilter(filter, 0, "latest");
        events.forEach((e) => {
            const {args} = e;
            const leafValue = getLeafValue(
                args.leafType,
                args.originNetwork,
                args.originAddress,
                args.destinationNetwork,
                args.destinationAddress,
                args.amount,
                ethers.solidityPackedKeccak256(["bytes"], [args.metadata])
            );
            merkleTree.add(leafValue);
        });

        // Check merkle root with SC
        const rootSC = await polygonZkEVMBridgeContract.getRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);
    });

    it("should claim testing all the asserts", async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
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

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rollupRoot))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(mainnetExitRoot, rollupRoot);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)
        ).to.be.equal(true);

        const globalIndex = computeGlobalIndex(index, index, false);
        // Can't claim without tokens
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

        // transfer tokens, then claim
        await expect(polTokenContract.transfer(polygonZkEVMBridgeContract.target, amount))
            .to.emit(polTokenContract, "Transfer")
            .withArgs(deployer.address, polygonZkEVMBridgeContract.target, amount);

        // Check Destination network does not match assert
        // await expect(
        //     polygonZkEVMBridgeContract.claimAsset(
        //         proofLocal,
        //         proofRollup,
        //         globalIndex,
        //         mainnetExitRoot,
        //         rollupExitRootSC,
        //         originNetwork,
        //         tokenAddress,
        //         destinationNetwork,
        //         destinationAddress,
        //         amount,
        //         metadata
        //     )
        // ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "DestinationNetworkInvalid");

        // Check GlobalExitRoot invalid assert
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                mainnetExitRoot,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "GlobalExitRootInvalid");

        // Check Invalid smt proof assert
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex + 1n,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "InvalidSmtProof");

        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polTokenContract, "Transfer")
            .withArgs(polygonZkEVMBridgeContract.target, deployer.address, amount);

        // Check Already claimed_claim
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");
    });

    it("should claim ether", async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // ether
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const metadata = "0x"; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
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

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rollupRoot))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(mainnetExitRoot, rollupRoot);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
        const globalIndex = computeGlobalIndex(index, index, false);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)
        ).to.be.equal(true);

        /*
         * claim
         * Can't claim without ether
         */
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "EtherTransferFailed");

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);
        /*
         * Create a deposit to add ether to the PolygonZkEVMBridge
         * Check deposit amount ether asserts
         */
        // await expect(
        //     polygonZkEVMBridgeContract.bridgeAsset(
        //         networkIDRollup,
        //         destinationAddress,
        //         amount,
        //         tokenAddress,
        //         true,
        //         "0x",
        //         {value: ethers.parseEther("100")}
        //     )
        // ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AmountDoesNotMatchMsgValue");

        // Check mainnet destination assert
        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                networkIDMainnet,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "DestinationNetworkInvalid");

        // This is used just to pay ether to the PolygonZkEVMBridge smart contract and be able to claim it afterwards.
        expect(
            await polygonZkEVMBridgeContract.bridgeAsset(
                networkIDRollup,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
            )
        );

        // Check balances before claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.target)).to.be.equal(amount);
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer - amount);

        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount);

        // Check balances after claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.target)).to.be.equal(ethers.parseEther("0"));
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer);

        // Can't claim because nullifier
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");
    });

    it("should claim message", async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // ether
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const metadata = "0x176923791298713271763697869132"; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rollupRoot))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(mainnetExitRoot, rollupRoot);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
        const globalIndex = computeGlobalIndex(index, index, false);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)
        ).to.be.equal(true);

        /*
         * claim
         * Can't claim a message as an assets
         */
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "InvalidSmtProof");

        /*
         * claim
         * Can't claim invalid destination network
         */
        await expect(
            polygonZkEVMBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                networkIDRollup,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "DestinationNetworkInvalid");

        /*
         * claim
         * Can't claim without ether
         */
        await expect(
            polygonZkEVMBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "MessageFailed");

        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                networkIDRollup,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "DestinationNetworkInvalid");

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);
        /*
         * Create a deposit to add ether to the PolygonZkEVMBridge
         * Check deposit amount ether asserts
         */
        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                networkIDRollup,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: ethers.parseEther("100")}
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AmountDoesNotMatchMsgValue");

        // Check mainnet destination assert
        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                networkIDMainnet,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "DestinationNetworkInvalid");

        // This is used just to pay ether to the PolygonZkEVMBridge smart contract and be able to claim it afterwards.
        expect(
            await polygonZkEVMBridgeContract.bridgeAsset(
                networkIDRollup,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
            )
        );

        // Check balances before claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.target)).to.be.equal(amount);
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer - amount);

        // Check mainnet destination assert
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "InvalidSmtProof");

        await expect(
            polygonZkEVMBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount);

        // Check balances after claim
        expect(await ethers.provider.getBalance(polygonZkEVMBridgeContract.target)).to.be.equal(ethers.parseEther("0"));
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer);

        // Can't claim because nullifier
        await expect(
            polygonZkEVMBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");
    });

    it("should test emergency state", async () => {
        await expect(polygonZkEVMBridgeContract.activateEmergencyState()).to.be.revertedWithCustomError(
            polygonZkEVMBridgeContract,
            "OnlyRollupManager"
        );

        await expect(polygonZkEVMBridgeContract.connect(rollupManager).activateEmergencyState()).to.emit(
            polygonZkEVMBridgeContract,
            "EmergencyStateActivated"
        );

        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;

        await expect(
            polygonZkEVMBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "OnlyNotEmergencyState");

        await expect(
            polygonZkEVMBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, true, "0x")
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "OnlyNotEmergencyState");

        await expect(
            polygonZkEVMBridgeContract.bridgeMessageWETH(destinationNetwork, destinationAddress, amount, true, "0x")
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "OnlyNotEmergencyState");

        const mockMerkleProof = new Array(32).fill(ethers.ZeroHash) as any;
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                mockMerkleProof,
                mockMerkleProof,
                ethers.ZeroHash,
                ethers.ZeroHash,
                ethers.ZeroHash,
                0,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "OnlyNotEmergencyState");

        await expect(
            polygonZkEVMBridgeContract.claimMessage(
                mockMerkleProof,
                mockMerkleProof,
                ethers.ZeroHash,
                ethers.ZeroHash,
                ethers.ZeroHash,
                0,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "OnlyNotEmergencyState");
    });
});

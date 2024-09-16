import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    GlobalExitRootManagerL2SovereignChain,
    BridgeL2SovereignChain,
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

describe("BridgeL2SovereignChain Contract", () => {
    upgrades.silenceWarnings();

    let sovereignChainBridgeContract: BridgeL2SovereignChain;
    let polTokenContract: ERC20PermitMock;
    let sovereignChainGlobalExitRoot: GlobalExitRootManagerL2SovereignChain;

    let deployer: any;
    let rollupManager: any;
    let bridgeManager: any;
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
    const networkIDRollup2 = 2;

    const LEAF_TYPE_ASSET = 0;
    const LEAF_TYPE_MESSAGE = 1;

    beforeEach("Deploy contracts", async () => {
        // load signers
        [deployer, rollupManager, acc1, bridgeManager] = await ethers.getSigners();
        // Set trusted sequencer as coinbase for sovereign chains
        await ethers.provider.send("hardhat_setCoinbase", [deployer.address]);
        // deploy BridgeL2SovereignChain
        const BridgeL2SovereignChainFactory = await ethers.getContractFactory("BridgeL2SovereignChain");
        sovereignChainBridgeContract = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor"],
        })) as unknown as BridgeL2SovereignChain;

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory(
            "GlobalExitRootManagerL2SovereignChain"
        );
        sovereignChainGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            rollupManager.address,
            sovereignChainBridgeContract.target
        );

        await sovereignChainBridgeContract.initialize(
            networkIDRollup2,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            sovereignChainGlobalExitRoot.target,
            rollupManager.address,
            "0x",
            ethers.Typed.address(bridgeManager)
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

    it("should Sovereign Chain bridge a remapped asset not mintable and verify merkle proof", async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const rollupExitRoot = await sovereignChainGlobalExitRoot.lastRollupExitRoot();

        // deploy sovereign
        const maticTokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        const sovereignToken = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance
        );
        const balanceDeployer = await sovereignToken.balanceOf(deployer.address);
        const balanceBridge = await sovereignToken.balanceOf(sovereignChainBridgeContract.target);
        // Remap asset
        // Remap not mintable token
        await sovereignChainBridgeContract
            .connect(bridgeManager)
            .setSovereignTokenAddress(networkIDRollup, tokenAddress, sovereignToken.target, true);
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

        // Check insufficient allowance
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                sovereignToken.target,
                true,
                "0x"
            )
        ).to.be.revertedWith("ERC20: insufficient allowance");
        // create a new deposit
        await expect(sovereignToken.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(sovereignToken, "Approval")
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                sovereignToken.target,
                true,
                "0x"
            )
        )
            .to.emit(sovereignChainBridgeContract, "BridgeEvent")
            .withArgs(
                LEAF_TYPE_ASSET,
                networkIDRollup,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount
            );
        // Check updated exit root
        expect(await sovereignChainGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootJSMainnet);
        expect(await sovereignToken.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await sovereignToken.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(balanceBridge + amount);
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(
            await sovereignChainBridgeContract.verifyMerkleProof(leafValue, proof, index, rootSCMainnet)
        ).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // Remove sovereign token address
        await sovereignChainBridgeContract.connect(bridgeManager).removeSovereignTokenAddress(sovereignToken.target);
    });

    it("should Sovereign Chain bridge a remapped asset mintable and verify merkle proof", async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const balanceDeployer = await polTokenContract.balanceOf(deployer.address);
        const balanceBridge = await polTokenContract.balanceOf(sovereignChainBridgeContract.target);

        const rollupExitRoot = await sovereignChainGlobalExitRoot.lastRollupExitRoot();

        // create a new deposit
        await expect(polTokenContract.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, "Approval")
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        // deploy sovereign
        const maticTokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        const sovereignToken = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance
        );

        // Remap asset
        // Trigger requires
        // only bridge manager
        await expect(
            sovereignChainBridgeContract
                .connect(rollupManager)
                .setSovereignTokenAddress(networkIDMainnet, tokenAddress, sovereignToken.target, false)
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "OnlyBridgeManager");
        // invalid token address
        await expect(
            sovereignChainBridgeContract
                .connect(bridgeManager)
                .setSovereignTokenAddress(networkIDMainnet, ethers.ZeroAddress, sovereignToken.target, false)
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "InvalidZeroAddress");
        // Invalid origin network
        await expect(
            sovereignChainBridgeContract
                .connect(bridgeManager)
                .setSovereignTokenAddress(networkIDRollup2, tokenAddress, sovereignToken.target, false)
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "OriginNetworkInvalid");
        await sovereignChainBridgeContract
            .connect(bridgeManager)
            .setSovereignTokenAddress(networkIDRollup, tokenAddress, sovereignToken.target, false);
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
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        )
            .to.emit(sovereignChainBridgeContract, "BridgeEvent")
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
        // Check updated exit root
        expect(await sovereignChainGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootJSMainnet);
        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(
            balanceBridge + amount
        );
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(
            await sovereignChainBridgeContract.verifyMerkleProof(leafValue, proof, index, rootSCMainnet)
        ).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
    });

    it("should check the initialize parameters", async () => {
        expect(await sovereignChainBridgeContract.globalExitRootManager()).to.be.equal(
            sovereignChainGlobalExitRoot.target
        );
        expect(await sovereignChainBridgeContract.networkID()).to.be.equal(networkIDRollup2);
        expect(await sovereignChainBridgeContract.polygonRollupManager()).to.be.equal(rollupManager.address);

        // cannot initialize again
        await expect(
            sovereignChainBridgeContract.initialize(
                networkIDMainnet,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                sovereignChainGlobalExitRoot.target,
                rollupManager.address,
                "0x",
                ethers.Typed.address(bridgeManager)
            )
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should check bridgeMessageWETH reverts", async () => {
        await expect(
            sovereignChainBridgeContract.bridgeMessageWETH(networkIDMainnet, deployer.address, 0, true, "0x")
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "NativeTokenIsEther");
    });

    it("should Sovereign Chain bridge asset and verify merkle proof", async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const balanceDeployer = await polTokenContract.balanceOf(deployer.address);
        const balanceBridge = await polTokenContract.balanceOf(sovereignChainBridgeContract.target);

        const rollupExitRoot = await sovereignChainGlobalExitRoot.lastRollupExitRoot();

        // create a new deposit
        await expect(polTokenContract.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, "Approval")
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

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
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: 1}
            )
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "MsgValueNotZero");

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        )
            .to.emit(sovereignChainBridgeContract, "BridgeEvent")
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
        // Check updated exit root
        expect(await sovereignChainGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootJSMainnet);
        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(
            balanceBridge + amount
        );
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(
            await sovereignChainBridgeContract.verifyMerkleProof(leafValue, proof, index, rootSCMainnet)
        ).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
    });

    it("should message at Sovereign chain and verify merkle proof", async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const originAddress = deployer.address;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);
        const rollupExitRoot = await sovereignChainGlobalExitRoot.lastRollupExitRoot();

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
            sovereignChainBridgeContract.bridgeMessage(networkIDRollup2, destinationAddress, true, "0x")
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "DestinationNetworkInvalid");

        await expect(
            sovereignChainBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, true, metadata, {
                value: amount,
            })
        )
            .to.emit(sovereignChainBridgeContract, "BridgeEvent")
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
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(
            await sovereignChainBridgeContract.verifyMerkleProof(leafValue, proof, index, rootSCMainnet)
        ).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
    });

    it("should bridge asset and message to sovereign chain to check global exit root updates", async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const balanceDeployer = await polTokenContract.balanceOf(deployer.address);
        const balanceBridge = await polTokenContract.balanceOf(sovereignChainBridgeContract.target);

        const rollupExitRoot = await sovereignChainGlobalExitRoot.lastRollupExitRoot();

        // create a new deposit
        await expect(polTokenContract.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, "Approval")
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

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
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                false,
                "0x"
            )
        )
            .to.emit(sovereignChainBridgeContract, "BridgeEvent")
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
        expect(await polTokenContract.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(
            balanceBridge + amount
        );
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(0);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // Update global exit root
        await sovereignChainBridgeContract.updateGlobalExitRoot();
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // bridge message
        await expect(
            sovereignChainBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, false, metadata, {
                value: amount,
            })
        )
            .to.emit(sovereignChainBridgeContract, "BridgeEvent")
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
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        // Update global exit root
        await sovereignChainBridgeContract.updateGlobalExitRoot();

        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(2);
        expect(await sovereignChainGlobalExitRoot.lastRollupExitRoot()).to.not.be.equal(rootJSMainnet);

        // Just to have the metric of a low cost bridge Asset
        const tokenAddress2 = ethers.ZeroAddress; // Ether
        const amount2 = ethers.parseEther("10");
        await sovereignChainBridgeContract.bridgeAsset(
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
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = acc1.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

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
        await expect(sovereignChainGlobalExitRoot.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            sovereignChainGlobalExitRoot,
            "OnlyAllowedContracts"
        );

        // add rollup Merkle root
        await ethers.provider.send("hardhat_impersonateAccount", [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rootRollup, {gasPrice: 0});

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // check merkle proof
        // Merkle proof local
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // Merkle proof local
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // verify merkle proof
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)).to.be.equal(true);
        expect(
            await sovereignChainBridgeContract.verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)
        ).to.be.equal(true);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);
        /*
         * claim
         * Can't claim without tokens
         */
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        await expect(polTokenContract.transfer(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, "Transfer")
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        expect(false).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        await expect(
            sovereignChainBridgeContract.claimAsset(
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
            .to.emit(sovereignChainBridgeContract, "ClaimEvent")
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polTokenContract, "Transfer")
            .withArgs(sovereignChainBridgeContract.target, acc1.address, amount);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "AlreadyClaimed");
        expect(true).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));
    });

    it("should claim tokens from Rollup to Mainnet", async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

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
        await expect(sovereignChainGlobalExitRoot.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            sovereignChainGlobalExitRoot,
            "OnlyAllowedContracts"
        );

        // add rollup Merkle root
        await ethers.provider.send("hardhat_impersonateAccount", [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rootRollup, {gasPrice: 0});

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
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
            await sovereignChainBridgeContract.verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)
        ).to.be.equal(true);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        expect(false).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [networkIDRollup, tokenAddress]);
        const minimalBytecodeProxy = await sovereignChainBridgeContract.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, metadataToken]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            sovereignChainBridgeContract.target as string,
            salt,
            hashInitCode
        );
        const newWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // Use precalculatedWrapperAddress and check if matches
        expect(
            await sovereignChainBridgeContract.precalculatedWrapperAddress(
                networkIDRollup,
                tokenAddress,
                tokenName,
                tokenSymbol,
                decimals
            )
        ).to.be.equal(precalculateWrappedErc20);

        await expect(
            sovereignChainBridgeContract.claimAsset(
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
            .to.emit(sovereignChainBridgeContract, "ClaimEvent")
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(sovereignChainBridgeContract, "NewWrappedToken")
            .withArgs(originNetwork, tokenAddress, precalculateWrappedErc20, metadata)
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, destinationAddress, amount);

        const newTokenInfo = await sovereignChainBridgeContract.wrappedTokenToTokenInfo(precalculateWrappedErc20);

        // Use precalculatedWrapperAddress and check if matches
        expect(
            await sovereignChainBridgeContract.calculateTokenWrapperAddress(
                networkIDRollup,
                tokenAddress,
                precalculateWrappedErc20
            )
        ).to.be.equal(precalculateWrappedErc20);

        expect(newTokenInfo.originNetwork).to.be.equal(networkIDRollup);
        expect(newTokenInfo.originTokenAddress).to.be.equal(tokenAddress);
        expect(await sovereignChainBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );
        expect(await sovereignChainBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20
        );

        expect(await sovereignChainBridgeContract.tokenInfoToWrappedToken(salt)).to.be.equal(precalculateWrappedErc20);

        // Check the wrapper info
        expect(await newWrappedToken.name()).to.be.equal(tokenName);
        expect(await newWrappedToken.symbol()).to.be.equal(tokenSymbol);
        expect(await newWrappedToken.decimals()).to.be.equal(decimals);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "AlreadyClaimed");
        expect(true).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);

        // Claim again the other leaf to mint tokens
        const index2 = 1;
        const proof2 = merkleTreeLocal.getProofTreeByIndex(index2);

        expect(verifyMerkleProof(leafValue, proof2, index2, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rollupExitRootSC)).to.be.equal(true);

        const globalIndex2 = computeGlobalIndex(index2, indexRollup, false);
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
            .to.emit(sovereignChainBridgeContract, "ClaimEvent")
            .withArgs(globalIndex2, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, destinationAddress, amount);

        // Burn Tokens
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const wrappedTokenAddress = newWrappedToken.target;
        const newDestinationNetwork = networkIDRollup;

        const rollupExitRoot = await sovereignChainGlobalExitRoot.lastRollupExitRoot();

        // create a new deposit
        await expect(newWrappedToken.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(newWrappedToken, "Approval")
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

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
        const leafValueMainnetSC = await sovereignChainBridgeContract.getLeafValue(
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
            sovereignChainBridgeContract.bridgeAsset(
                newDestinationNetwork,
                destinationAddress,
                amount,
                wrappedTokenAddress,
                true,
                "0x"
            )
        )
            .to.emit(sovereignChainBridgeContract, "BridgeEvent")
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
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(deployer.address, ethers.ZeroAddress, amount);

        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);
        expect(await newWrappedToken.balanceOf(deployer.address)).to.be.equal(amount);
        expect(await newWrappedToken.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(0);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proofMainnet = merkleTreeMainnet.getProofTreeByIndex(0);
        const indexMainnet = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValueMainnet, proofMainnet, indexMainnet, rootSCMainnet)).to.be.equal(true);
        expect(
            await sovereignChainBridgeContract.verifyMerkleProof(
                leafValueMainnet,
                proofMainnet,
                indexMainnet,
                rootSCMainnet
            )
        ).to.be.equal(true);

        const computedGlobalExitRoot2 = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
    });
    it("should claim tokens from Rollup to Mainnet, failing deploy wrapped", async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = ethers.hexlify(ethers.randomBytes(40));
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

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
        await expect(sovereignChainGlobalExitRoot.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            sovereignChainGlobalExitRoot,
            "OnlyAllowedContracts"
        );

        // add rollup Merkle root
        await ethers.provider.send("hardhat_impersonateAccount", [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rootRollup, {gasPrice: 0});

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
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
            await sovereignChainBridgeContract.verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)
        ).to.be.equal(true);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        expect(false).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [networkIDRollup, tokenAddress]);
        const minimalBytecodeProxy = await sovereignChainBridgeContract.BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        const hashInitCode = ethers.solidityPackedKeccak256(["bytes", "bytes"], [minimalBytecodeProxy, metadataToken]);
        const precalculateWrappedErc20 = await ethers.getCreate2Address(
            sovereignChainBridgeContract.target as string,
            salt,
            hashInitCode
        );

        // Use precalculatedWrapperAddress and check if matches
        expect(
            await sovereignChainBridgeContract.precalculatedWrapperAddress(
                networkIDRollup,
                tokenAddress,
                tokenName,
                tokenSymbol,
                decimals
            )
        ).to.be.equal(precalculateWrappedErc20);

        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "FailedTokenWrappedDeployment");
    });
    it("should sovereignChainBridge and sync the current root with events", async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // Ether
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = "0x"; // since is ether does not have metadata

        // create 3 new deposit
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
            )
        )
            .to.emit(sovereignChainBridgeContract, "BridgeEvent")
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
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
            )
        )
            .to.emit(sovereignChainBridgeContract, "BridgeEvent")
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
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
            )
        )
            .to.emit(sovereignChainBridgeContract, "BridgeEvent")
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
        const filter = sovereignChainBridgeContract.filters.BridgeEvent(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        );
        const events = await sovereignChainBridgeContract.queryFilter(filter, 0, "latest");
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
        const rootSC = await sovereignChainBridgeContract.getRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);
    });

    it("should claim testing all the asserts", async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

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
        await ethers.provider.send("hardhat_impersonateAccount", [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rollupRoot, {gasPrice: 0});
        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
        expect(
            await sovereignChainBridgeContract.verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)
        ).to.be.equal(true);

        const globalIndex = computeGlobalIndex(index, index, false);
        // Can't claim without tokens
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        await expect(polTokenContract.transfer(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, "Transfer")
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        // Check GlobalExitRoot invalid assert
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "GlobalExitRootInvalid");

        // Check Invalid smt proof assert
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "InvalidSmtProof");

        await expect(
            sovereignChainBridgeContract.claimAsset(
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
            .to.emit(sovereignChainBridgeContract, "ClaimEvent")
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polTokenContract, "Transfer")
            .withArgs(sovereignChainBridgeContract.target, deployer.address, amount);

        // Check Already claimed_claim
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "AlreadyClaimed");
    });

    it("should claim ether", async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // ether
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = "0x"; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

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
        await ethers.provider.send("hardhat_impersonateAccount", [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rollupRoot, {gasPrice: 0});

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
        const globalIndex = computeGlobalIndex(index, index, false);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
        expect(
            await sovereignChainBridgeContract.verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)
        ).to.be.equal(true);

        /*
         * claim
         * Can't claim without ether
         */
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "EtherTransferFailed");

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);
        // Check mainnet destination assert
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                networkIDRollup2,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
            )
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "DestinationNetworkInvalid");

        // This is used just to pay ether to the SovereignChain smart contract and be able to claim it afterwards.
        expect(
            await sovereignChainBridgeContract.bridgeAsset(
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
        expect(await ethers.provider.getBalance(sovereignChainBridgeContract.target)).to.be.equal(amount);
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer - amount);

        await expect(
            sovereignChainBridgeContract.claimAsset(
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
            .to.emit(sovereignChainBridgeContract, "ClaimEvent")
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount);

        // Check balances after claim
        expect(await ethers.provider.getBalance(sovereignChainBridgeContract.target)).to.be.equal(
            ethers.parseEther("0")
        );
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "AlreadyClaimed");
    });

    it("should claim message", async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // ether
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = "0x176923791298713271763697869132"; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

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
        await ethers.provider.send("hardhat_impersonateAccount", [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRoot.connect(bridgeMock).updateExitRoot(rollupRoot, {gasPrice: 0});

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        expect(await sovereignChainGlobalExitRoot.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRoot, "InsertGlobalExitRoot")
            .withArgs(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRoot.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
        const globalIndex = computeGlobalIndex(index, index, false);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);
        expect(
            await sovereignChainBridgeContract.verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)
        ).to.be.equal(true);

        /*
         * claim
         * Can't claim a message as an assets
         */
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "InvalidSmtProof");

        /*
         * claim
         * Can't claim invalid destination network
         */
        await expect(
            sovereignChainBridgeContract.claimMessage(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "DestinationNetworkInvalid");

        /*
         * claim
         * Can't claim without ether
         */
        await expect(
            sovereignChainBridgeContract.claimMessage(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "MessageFailed");

        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "DestinationNetworkInvalid");

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);
        /*
         * Create a deposit to add ether to the SovereignChainBridge
         * Check deposit amount ether asserts
         */
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                networkIDRollup,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: ethers.parseEther("100")}
            )
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "AmountDoesNotMatchMsgValue");

        // Check mainnet destination assert
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                networkIDRollup2,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x",
                {value: amount}
            )
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "DestinationNetworkInvalid");

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards.
        expect(
            await sovereignChainBridgeContract.bridgeAsset(
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
        expect(await ethers.provider.getBalance(sovereignChainBridgeContract.target)).to.be.equal(amount);
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer - amount);

        // Check mainnet destination assert
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "InvalidSmtProof");

        await expect(
            sovereignChainBridgeContract.claimMessage(
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
            .to.emit(sovereignChainBridgeContract, "ClaimEvent")
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount);

        // Check balances after claim
        expect(await ethers.provider.getBalance(sovereignChainBridgeContract.target)).to.be.equal(
            ethers.parseEther("0")
        );
        expect(await ethers.provider.getBalance(deployer.address)).to.be.lte(balanceDeployer);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimMessage(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "AlreadyClaimed");
    });

    it("should test emergency state", async () => {
        await expect(sovereignChainBridgeContract.activateEmergencyState()).to.be.revertedWithCustomError(
            sovereignChainBridgeContract,
            "OnlyRollupManager"
        );

        await expect(sovereignChainBridgeContract.connect(rollupManager).activateEmergencyState()).to.emit(
            sovereignChainBridgeContract,
            "EmergencyStateActivated"
        );

        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                "0x"
            )
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "OnlyNotEmergencyState");

        await expect(
            sovereignChainBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, true, "0x")
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "OnlyNotEmergencyState");

        await expect(
            sovereignChainBridgeContract.bridgeMessageWETH(destinationNetwork, destinationAddress, amount, true, "0x")
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "OnlyNotEmergencyState");

        const mockMerkleProof = new Array(32).fill(ethers.ZeroHash) as any;
        await expect(
            sovereignChainBridgeContract.claimAsset(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "OnlyNotEmergencyState");

        await expect(
            sovereignChainBridgeContract.claimMessage(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, "OnlyNotEmergencyState");
    });
});

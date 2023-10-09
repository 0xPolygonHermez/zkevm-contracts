/* eslint-disable no-plusplus, no-await-in-loop */
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

type BatchDataStruct = PolygonRollupBase.BatchDataStruct;

const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}

describe("Polygon ZK-EVM TestnetV2", () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;
    let beneficiary: any;

    let verifierContract: VerifierRollupHelperMock;
    let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;
    let rollupManagerContract: PolygonRollupManagerMock;

    const polTokenName = "POL Token";
    const polTokenSymbol = "POL";
    const polTokenInitialBalance = ethers.parseEther("20000000");

    const pendingStateTimeoutDefault = 100;
    const trustedAggregatorTimeout = 100;
    const FORCE_BATCH_TIMEOUT = 60 * 60 * 24 * 5; // 5 days

    // BRidge constants
    const networkIDMainnet = 0;
    const networkIDRollup = 1;

    const LEAF_TYPE_ASSET = 0;
    const LEAF_TYPE_MESSAGE = 1;

    let firstDeployment = true;

    //roles
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const ADD_ROLLUP_TYPE_ROLE = ethers.id("ADD_ROLLUP_TYPE_ROLE");
    const OBSOLETE_ROLLUP_TYPE_ROLE = ethers.id("OBSOLETE_ROLLUP_TYPE_ROLE");
    const CREATE_ROLLUP_ROLE = ethers.id("CREATE_ROLLUP_ROLE");
    const ADD_EXISTING_ROLLUP_ROLE = ethers.id("ADD_EXISTING_ROLLUP_ROLE");
    const UPDATE_ROLLUP_ROLE = ethers.id("UPDATE_ROLLUP_ROLE");
    const TRUSTED_AGGREGATOR_ROLE = ethers.id("TRUSTED_AGGREGATOR_ROLE");
    const TRUSTED_AGGREGATOR_ROLE_ADMIN = ethers.id("TRUSTED_AGGREGATOR_ROLE_ADMIN");
    const TWEAK_PARAMETERS_ROLE = ethers.id("TWEAK_PARAMETERS_ROLE");
    const SET_FEE_ROLE = ethers.id("SET_FEE_ROLE");
    const STOP_EMERGENCY_ROLE = ethers.id("STOP_EMERGENCY_ROLE");
    const EMERGENCY_COUNCIL_ROLE = ethers.id("EMERGENCY_COUNCIL_ROLE");
    const EMERGENCY_COUNCIL_ADMIN = ethers.id("EMERGENCY_COUNCIL_ADMIN");

    beforeEach("Deploy contract", async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin, timelock, emergencyCouncil, beneficiary] =
            await ethers.getSigners();

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory("VerifierRollupHelperMock");
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy pol
        const polTokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        polTokenContract = await polTokenFactory.deploy(
            polTokenName,
            polTokenSymbol,
            deployer.address,
            polTokenInitialBalance
        );

        /*
         * deploy global exit root manager
         * In order to not have trouble with nonce deploy first proxy admin
         */
        await upgrades.deployProxyAdmin();

        if ((await upgrades.admin.getInstance()).target !== "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0") {
            firstDeployment = false;
        }
        const nonceProxyBridge =
            Number(await ethers.provider.getTransactionCount(deployer.address)) + (firstDeployment ? 3 : 2);

        const nonceProxyZkevm = nonceProxyBridge + 2; // Always have to redeploy impl since the polygonZkEVMGlobalExitRoot address changes

        const precalculateBridgeAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyBridge,
        });
        const precalculateRollupManagerAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyZkevm,
        });
        firstDeployment = false;

        // deploy globalExitRoot
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [precalculateRollupManagerAddress, precalculateBridgeAddress],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {initializer: false});

        // deploy mock verifier
        const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManagerMock");

        rollupManagerContract = (await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        })) as unknown as PolygonRollupManagerMock;

        await rollupManagerContract.waitForDeployment();

        // check precalculated address
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContract.target);

        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManagerContract.target
        );

        // Initialize Mock
        await rollupManagerContract.initializeMock(
            trustedAggregator.address,
            pendingStateTimeoutDefault,
            trustedAggregatorTimeout,
            admin.address,
            timelock.address,
            emergencyCouncil.address
        );

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther("1000"));
    });

    it("should check the initalized parameters", async () => {
        expect(await rollupManagerContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.target);
        expect(await rollupManagerContract.pol()).to.be.equal(polTokenContract.target);
        expect(await rollupManagerContract.bridgeAddress()).to.be.equal(polygonZkEVMBridgeContract.target);

        expect(await rollupManagerContract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await rollupManagerContract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeout);

        expect(await rollupManagerContract.getBatchFee()).to.be.equal(ethers.parseEther("0.1"));
        expect(await rollupManagerContract.getForcedBatchFee()).to.be.equal(ethers.parseEther("10"));

        // Check roles
        expect(await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_EXISTING_ROLLUP_ROLE, timelock.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE, trustedAggregator.address)).to.be.equal(
            true
        );

        expect(await rollupManagerContract.hasRole(OBSOLETE_ROLLUP_TYPE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE_ADMIN, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TWEAK_PARAMETERS_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(SET_FEE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(STOP_EMERGENCY_ROLE, admin.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ROLE, emergencyCouncil.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ADMIN, emergencyCouncil.address)).to.be.equal(
            true
        );
    });

    it("should check full flow", async () => {
        const urlSequencer = "http://zkevm-json-rpc:8123";
        const chainID = 1000;
        const networkName = "zkevm";
        const forkID = 0;
        const genesisRandom = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const rollupCompatibilityID = 0;
        const descirption = "zkevm test";
        // Native token will be ether
        const gasTokenAddress = ethers.ZeroAddress;
        const gasTokenNetwork = 0;

        // In order to create a new rollup type, create an implementation of the contract

        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMV2");
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Try to add a new rollup type
        await expect(
            rollupManagerContract.addNewRollupType(
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                genesisRandom,
                rollupCompatibilityID,
                descirption
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // Add a new rollup type with timelock
        const newRollupTypeID = 1;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    genesisRandom,
                    rollupCompatibilityID,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                newRollupTypeID,
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                genesisRandom,
                rollupCompatibilityID,
                descirption
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            false,
            genesisRandom,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        // obsoleteRollupType, take snapshot for it
        const snapshot = await takeSnapshot();

        await expect(rollupManagerContract.obsoleteRollupType(newRollupTypeID)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);

        expect([
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            true,
            genesisRandom,
        ]).to.be.deep.equal(await rollupManagerContract.rollupTypeMap(newRollupTypeID));
        await snapshot.restore();

        expect(expectedRollupType).to.be.deep.equal(await rollupManagerContract.rollupTypeMap(newRollupTypeID));
        // Create a

        // Only admin can create new zkEVMs
        await expect(
            rollupManagerContract.createNewRollup(
                newRollupTypeID,
                chainID,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                gasTokenNetwork,
                urlSequencer,
                networkName
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        // UNexisting rollupType
        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    0,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    gasTokenNetwork,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeDoesNotExist");

        // Obsolete rollup type and test that fails
        const snapshot2 = await takeSnapshot();
        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    gasTokenNetwork,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeObsolete");
        await snapshot2.restore();

        const newCreatedRollupID = 1;
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });

        const newZkEVMContract = PolygonZKEVMV2Factory.attach(newZKEVMAddress) as PolygonZkEVMV2;
        const newSequencedBatch = 1;

        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    gasTokenNetwork,
                    urlSequencer,
                    networkName
                )
        )
            .to.emit(rollupManagerContract, "CreateNewRollup")
            .withArgs(newCreatedRollupID, newRollupTypeID, newZKEVMAddress, chainID, gasTokenAddress, gasTokenNetwork)
            .to.emit(newZkEVMContract, "SequenceBatches")
            .withArgs(newSequencedBatch)
            .to.emit(rollupManagerContract, "OnSequenceBatches")
            .withArgs(newCreatedRollupID, newSequencedBatch);

        // Assert new rollup created
        const timestampCreatedRollup = (await ethers.provider.getBlock("latest"))?.timestamp;
        expect(await newZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await newZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await newZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await newZkEVMContract.networkName()).to.be.equal(networkName);
        expect(await newZkEVMContract.forceBatchTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);
        expect(await newZkEVMContract.lastTimestamp()).to.be.equal(timestampCreatedRollup);

        // Cannot create 2 chains with the same chainID
        await expect(
            rollupManagerContract
                .connect(admin)
                .createNewRollup(
                    newRollupTypeID,
                    chainID,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    gasTokenNetwork,
                    urlSequencer,
                    networkName
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "ChainIDAlreadyExist");

        const transaction = await newZkEVMContract.generateInitializeTransaction(
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork
        );
        const txBase = await newZkEVMContract.BASE_INITIALIZE_TX_BRIDGE();

        // Check transaction
        const bridgeL2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeL2");
        const encodedData = bridgeL2Factory.interface.encodeFunctionData("initialize", [
            newCreatedRollupID,
            gasTokenAddress,
            gasTokenNetwork,
        ]);

        const rawTx = processorUtils.customRawTxToRawTx(transaction);
        const tx = ethers.Transaction.from(rawTx);
        expect(tx.to).to.be.equal("0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe");
        expect(tx.value).to.be.equal(0);
        expect(tx.data).to.be.equal(encodedData);
        expect(tx.gasPrice).to.be.equal(0);
        expect(tx.gasLimit).to.be.equal(30000000);
        expect(tx.nonce).to.be.equal(0);
        expect(tx.chainId).to.be.equal(0);

        const expectedAccInputHash = calculateAccInputHash(
            ethers.ZeroHash,
            ethers.keccak256(transaction),
            ethers.ZeroHash,
            timestampCreatedRollup,
            trustedSequencer.address
        );
        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash);

        // Check mapping on rollup Manager
        const rollupData = await rollupManagerContract.rollupIDToRollupData(newCreatedRollupID);
        expect(rollupData.rollupContract).to.be.equal(newZKEVMAddress);
        expect(rollupData.chainID).to.be.equal(chainID);
        expect(rollupData.verifier).to.be.equal(verifierContract.target);
        expect(rollupData.forkID).to.be.equal(forkID);
        expect(rollupData.lastLocalExitRoot).to.be.equal(ethers.ZeroHash);
        expect(rollupData.lastBatchSequenced).to.be.equal(newSequencedBatch);
        expect(rollupData.lastVerifiedBatch).to.be.equal(0);
        expect(rollupData.lastPendingState).to.be.equal(0);
        expect(rollupData.lastPendingStateConsolidated).to.be.equal(0);
        expect(rollupData.lastVerifiedBatchBeforeUpgrade).to.be.equal(0);
        expect(rollupData.rollupTypeID).to.be.equal(1);
        expect(rollupData.rollupCompatibilityID).to.be.equal(0);

        const sequencedBatchData = await rollupManagerContract.getRollupSequencedBatches(
            newCreatedRollupID,
            newSequencedBatch
        );

        expect(sequencedBatchData.accInputHash).to.be.equal(expectedAccInputHash);
        expect(sequencedBatchData.sequencedTimestamp).to.be.equal(timestampCreatedRollup);
        expect(sequencedBatchData.previousLastBatchSequenced).to.be.equal(0);

        // try verify batches
        const l2txData = "0x123456";
        const maticAmount = await rollupManagerContract.getBatchFee();
        const currentTimestamp = (await ethers.provider.getBlock("latest"))?.timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.ZeroHash,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        } as BatchDataStruct;

        // Approve tokens
        await expect(polTokenContract.connect(trustedSequencer).approve(newZkEVMContract.target, maticAmount)).to.emit(
            polTokenContract,
            "Approval"
        );

        // Sequence Batches
        await expect(newZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address))
            .to.emit(newZkEVMContract, "SequenceBatches")
            .withArgs(newSequencedBatch + 1);

        const expectedAccInputHash2 = calculateAccInputHash(
            expectedAccInputHash,
            ethers.keccak256(l2txData),
            ethers.ZeroHash,
            currentTimestamp,
            trustedSequencer.address
        );
        // calcualte accINputHash
        expect(await newZkEVMContract.lastAccInputHash()).to.be.equal(expectedAccInputHash2);

        // Create a new local exit root mocking some bridge
        const tokenName = "Matic Token";
        const tokenSymbol = "MATIC";
        const decimals = 18;
        const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "string", "uint8"],
            [tokenName, tokenSymbol, decimals]
        );

        const originNetwork = networkIDRollup;
        const tokenAddress = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = beneficiary.address;
        const metadata = metadataToken; // since we are inserting in the exit root can be anything
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreezkEVM = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash
        );

        // Add 2 leafs
        merkleTreezkEVM.add(leafValue);
        merkleTreezkEVM.add(leafValue);

        // check merkle root with SC
        const rootzkEVM = merkleTreezkEVM.getRoot();

        // TODO
        // trustedAggregator forge the batch
        const pendingState = 0;
        const newLocalExitRoot = rootzkEVM;
        const newStateRoot = "0x0000000000000000000000000000000000000000000000000000000000000123";
        const newVerifiedBatch = newSequencedBatch + 1;
        const zkProofFFlonk = new Array(24).fill(ethers.ZeroHash);
        const currentVerifiedBatch = 0;

        const initialAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);
        await expect(
            rollupManagerContract
                .connect(deployer)
                .verifyBatchesTrustedAggregator(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    newVerifiedBatch,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "AddressDoNotHaveRequiredRole");

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatchesTrustedAggregator(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    currentVerifiedBatch,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "FinalNumBatchBelowLastVerifiedBatch");

        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatchesTrustedAggregator(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    3,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        ).to.be.revertedWithCustomError(rollupManagerContract, "NewAccInputHashDoesNotExist");

        // Calcualte new globalExitroot
        const merkleTreeRollups = new MerkleTreeBridge(height);
        merkleTreeRollups.add(newLocalExitRoot);
        const rootRollups = merkleTreeRollups.getRoot();

        // Verify batch
        await expect(
            rollupManagerContract
                .connect(trustedAggregator)
                .verifyBatchesTrustedAggregator(
                    newCreatedRollupID,
                    pendingState,
                    currentVerifiedBatch,
                    newVerifiedBatch,
                    newLocalExitRoot,
                    newStateRoot,
                    beneficiary.address,
                    zkProofFFlonk
                )
        )
            .to.emit(rollupManagerContract, "VerifyBatchesTrustedAggregator")
            .withArgs(newCreatedRollupID, newVerifiedBatch, newStateRoot, newLocalExitRoot, trustedAggregator.address)
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(ethers.ZeroHash, rootRollups);

        const finalAggregatorMatic = await polTokenContract.balanceOf(beneficiary.address);

        expect(finalAggregatorMatic).to.equal(initialAggregatorMatic + maticAmount);

        // Assert global exit root
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(rootRollups);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(ethers.ZeroHash);

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot()).to.be.equal(
            calculateGlobalExitRoot(ethers.ZeroHash, rootRollups)
        );

        const indexLeaf = 0;
        const proofZkEVM = merkleTreezkEVM.getProofTreeByIndex(indexLeaf);
        const proofRollups = merkleTreeRollups.getProofTreeByIndex(indexLeaf);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)).to.be.equal(true);
        expect(verifyMerkleProof(rootzkEVM, proofRollups, indexLeaf, rootRollups)).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(leafValue, proofZkEVM, indexLeaf, rootzkEVM)
        ).to.be.equal(true);

        expect(
            await polygonZkEVMBridgeContract.verifyMerkleProof(newLocalExitRoot, proofRollups, indexLeaf, rootRollups)
        ).to.be.equal(true);

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory("TokenWrapped");
        // create2 parameters
        const salt = ethers.solidityPackedKeccak256(["uint32", "address"], [networkIDRollup, tokenAddress]);
        const minimalBytecodeProxy = tokenWrappedFactory.bytecode;
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

        // index leaf is 0 bc, doe snot have mainnet flag, and it's rollup 0 on leaf 0
        await expect(
            polygonZkEVMBridgeContract.claimAsset(
                proofZkEVM,
                proofRollups,
                indexLeaf,
                ethers.ZeroHash,
                rootRollups,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        )
            .to.emit(polygonZkEVMBridgeContract, "ClaimEvent")
            .withArgs(indexLeaf, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polygonZkEVMBridgeContract, "NewWrappedToken")
            .withArgs(originNetwork, tokenAddress, precalculateWrappedErc20, metadata)
            .to.emit(newWrappedToken, "Transfer")
            .withArgs(ethers.ZeroAddress, beneficiary.address, amount);

        // Assert maps created
        const newTokenInfo = await polygonZkEVMBridgeContract.wrappedTokenToTokenInfo(precalculateWrappedErc20);

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
                proofZkEVM,
                proofRollups,
                indexLeaf,
                ethers.ZeroHash,
                rootRollups,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata
            )
        ).to.be.revertedWithCustomError(polygonZkEVMBridgeContract, "AlreadyClaimed");

        // Check new token
        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);
    });

    it("Should test obsolete rollup", async () => {
        const forkID = 0;
        const genesisRandom = "0x0000000000000000000000000000000000000000000000000000000000000001";
        const rollupCompatibilityID = 0;
        const descirption = "zkevm test";

        // In order to create a new rollup type, create an implementation of the contract

        // Create zkEVM implementation
        const PolygonZKEVMV2Factory = await ethers.getContractFactory("PolygonZkEVMV2");
        const PolygonZKEVMV2Contract = await PolygonZKEVMV2Factory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target
        );
        await PolygonZKEVMV2Contract.waitForDeployment();

        // Add a new rollup type with timelock
        const newRollupTypeID = 1;
        await expect(
            rollupManagerContract
                .connect(timelock)
                .addNewRollupType(
                    PolygonZKEVMV2Contract.target,
                    verifierContract.target,
                    forkID,
                    genesisRandom,
                    rollupCompatibilityID,
                    descirption
                )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                newRollupTypeID,
                PolygonZKEVMV2Contract.target,
                verifierContract.target,
                forkID,
                genesisRandom,
                rollupCompatibilityID,
                descirption
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(newRollupTypeID);

        const expectedRollupType = [
            PolygonZKEVMV2Contract.target,
            verifierContract.target,
            forkID,
            rollupCompatibilityID,
            false,
            genesisRandom,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);

        // obsoleteRollupType, take snapshot for it
        await expect(rollupManagerContract.obsoleteRollupType(newRollupTypeID)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "AddressDoNotHaveRequiredRole"
        );

        // Try to obsolete unexisting types
        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(0)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "RollupTypeDoesNotExist"
        );

        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(2)).to.be.revertedWithCustomError(
            rollupManagerContract,
            "RollupTypeDoesNotExist"
        );

        // added correctly
        await expect(rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID))
            .to.emit(rollupManagerContract, "ObsoleteRollupType")
            .withArgs(newRollupTypeID);

        // already obsolete
        await expect(
            rollupManagerContract.connect(admin).obsoleteRollupType(newRollupTypeID)
        ).to.be.revertedWithCustomError(rollupManagerContract, "RollupTypeObsolete");
    });

    it("Should test global exit root", async () => {
        // In order to create a new rollup type, create an implementation of the contract
        async function testRollupExitRoot(rollupsRootsArray: any) {
            const height = 32;
            const merkleTree = new MerkleTreeBridge(height);

            await rollupManagerContract.prepareMockCalculateRoot(rollupsRootsArray);
            for (let i = 0; i < rollupsRootsArray.length; i++) {
                merkleTree.add(rollupsRootsArray[i]);
            }
            const rootSC = await rollupManagerContract.getRollupExitRoot();
            const rootJS = merkleTree.getRoot();
            expect(rootSC).to.be.equal(rootJS);
        }

        // put 100
        for (let i = 1; i < 4; i++) {
            const newRootsArray = [];
            for (let j = 0; j < i; j++) {
                newRootsArray.push(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
            }
            await testRollupExitRoot(newRootsArray);
        }
    });
});
